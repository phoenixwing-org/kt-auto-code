import { basename } from "node:path";
import * as vscode from "vscode";
import { ktcBuildRenameResultViewModel } from "../../core/renameResultViewModel.js";
import type { KtcProjectRenameHostPort } from "../../projectRenameHost.js";
import { ktcOpenWorkspaceResource } from "../../workspaceResource.js";
import type {
  KtcProjectRenameAnalysisReport,
  KtcProjectRenameRule,
  KtcProjectRenameViewInboundMessage,
  KtcProjectRenameViewState,
} from "./contracts.js";
import { ktcProjectRenameRuleAsDraft } from "./contracts.js";
import { ktcAnalyzeProjectRename, KtcProjectRenameCancelledError } from "./analyzer.js";
import { ktcDeriveProjectRenameRules } from "./nameVariants.js";
import { ktcProjectRenameReportSummary, ktcProjectRenameResultPage } from "./viewModel.js";
import { ktcProjectRenameViewHtml } from "./viewHtml.js";
import { ktcParseProjectRenameViewMessage } from "./viewMessages.js";
import { ktcProjectRenameCompletionAfterApply, ktcProjectRenamePreviewDrift } from "./execution.js";
import { ktcPlanProjectRenameRootDirectory } from "./rootDirectoryRename.js";

const KTC_PROJECT_RENAME_PAGE_SIZE = 200;
const KTC_PROJECT_RENAME_MAX_CUSTOM_PROFILE_RULES = 26;
const KTC_PROJECT_RENAME_MAX_OPEN_RULES = 6;

interface KtcProjectRenameOpenDraft {
  readonly root?: string;
  readonly sourceName?: string;
  readonly targetName?: string;
  readonly rules: readonly {
    readonly search: string;
    readonly replace: string;
    readonly enabled: boolean;
  }[];
}

export class KtcProjectRenameViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private abortController: AbortController | undefined;
  private report: KtcProjectRenameAnalysisReport | undefined;
  private nextReportId = 1;
  private postStateQueue: Promise<void> = Promise.resolve();
  private state: KtcProjectRenameViewState;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: KtcProjectRenameHostPort,
  ) {
    this.state = this.createInitialState();
  }

  show(requestedRoot?: unknown): void {
    if (this.panel) {
      // 一个 Editor View 对应一个复杂分析任务。Primary 再次点击只能聚焦，
      // 不得用新的目录或表单状态覆盖仍在查看的报告。
      this.panel.reveal(this.panel.viewColumn, false);
      return;
    }
    this.report = undefined;
    this.state = this.createInitialState(requestedRoot);
    this.panel = this.createPanel();
    this.panel.reveal(this.panel.viewColumn, false);
  }

  dispose(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    const panel = this.panel;
    this.panel = undefined;
    this.report = undefined;
    panel?.dispose();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.projectRenameAnalysis",
      "项目改名",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    );
    panel.webview.html = ktcProjectRenameViewHtml(panel.webview, this.extensionUri);
    panel.webview.onDidReceiveMessage((value: unknown) => {
      const message = ktcParseProjectRenameViewMessage(value);
      if (message) void this.handleMessage(message).catch((error: unknown) => {
        void vscode.window.showErrorMessage(`项目改名 View 操作失败：${ktcErrorMessage(error)}`);
      });
    });
    panel.onDidDispose(() => {
      if (this.panel !== panel) return;
      this.abortController?.abort();
      this.abortController = undefined;
      this.panel = undefined;
    });
    return panel;
  }

  private createInitialState(requestedRoot?: unknown): KtcProjectRenameViewState {
    const draft = ktcParseProjectRenameOpenDraft(requestedRoot);
    const explicitRoot = draft.root;
    const root = explicitRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const sourceName = draft.sourceName || (root ? basename(root) : "");
    const targetName = draft.targetName ?? "";
    const profileSnapshot = this.host.profileSnapshot(root);
    const historySnapshot = this.host.historySnapshot(root);
    const carriedDraft = draft.sourceName !== undefined || draft.targetName !== undefined || draft.rules.length > 0;
    return {
      ...(root ? { root } : {}),
      status: "idle",
      message: root
        ? carriedDraft
          ? "已从搜索替换带入当前名称与启用规则；请检查草稿后再分析。"
          : "分析任务已绑定当前目录；如需更换目录，请关闭此 View 后从搜索替换重新打开。"
        : "请选择分析目录；任务开始后如需更换，请关闭此 View 再重新打开。",
      sourceName,
      targetName,
      sourcePrefix: "",
      targetPrefix: "",
      rules: ktcProjectRenameInitialRules(sourceName, targetName, draft.rules),
      profiles: profileSnapshot.profiles,
      profileLabel: "",
      renameHistory: historySnapshot.pairs,
      projectHistory: historySnapshot.projectPlans,
      gitCompareAvailable: false,
      ...(profileSnapshot.error ? { profileError: profileSnapshot.error } : {}),
    };
  }

  private async handleMessage(message: KtcProjectRenameViewInboundMessage): Promise<void> {
    if (message.type === "ready") {
      await this.postState();
      return;
    }
    if (message.type === "cancel") {
      this.abortController?.abort();
      return;
    }
    if (message.type === "chooseRoot") {
      await this.chooseRoot();
      return;
    }
    if (message.type === "openGitChanges") {
      if (!this.state.gitCompareAvailable || !this.state.completion?.appliedItems) {
        void vscode.window.showWarningMessage("当前任务没有可用的 Git 写盘对比；请先在干净 Git 仓库中成功执行改名。");
        return;
      }
      await vscode.commands.executeCommand("workbench.view.scm");
      return;
    }
    if (message.type === "previewFirstDiff") {
      await this.previewFirstDiff(message.reportId);
      return;
    }
    if (message.type === "previewDiff") {
      await this.previewTextDiff(message.reportId, message.rowId);
      return;
    }
    if (message.type === "loadProfile") {
      await this.loadProfile(message.id);
      return;
    }
    if (message.type === "loadProjectHistory") {
      await this.loadProjectHistory(message.id);
      return;
    }
    if (message.type === "deleteHistory") {
      await this.deleteHistory(message.entry);
      return;
    }
    if (message.type === "clearHistory") {
      await this.clearHistory();
      return;
    }
    if (message.type === "saveProfile") {
      await this.saveProfile(message);
      return;
    }
    if (message.type === "requestRulePicker") {
      await this.openRulePicker(message);
      return;
    }
    if (message.type === "derive") {
      if (this.abortController) return;
      this.report = undefined;
      this.state = {
        ...this.state,
        status: "idle",
        message: "已派生 6 种名称形态；关联前缀和智能候选保持显式、可单独启停。",
        sourceName: message.sourceName,
        targetName: message.targetName,
        sourcePrefix: message.sourcePrefix,
        targetPrefix: message.targetPrefix,
        rules: ktcDeriveProjectRenameRules(message.sourceName, message.targetName),
        report: undefined,
        completion: undefined,
      };
      await this.postState();
      return;
    }
    if (message.type === "analyze") {
      await this.analyze(
        message.sourceName,
        message.targetName,
        message.sourcePrefix,
        message.targetPrefix,
        message.rules,
      );
      return;
    }
    if (message.type === "apply") {
      await this.applyReport(message.reportId);
      return;
    }
    if (message.type === "finish") {
      this.finishTask();
      return;
    }
    if (message.type === "loadMore") {
      if (!this.report || this.report.reportId !== message.reportId) return;
      await this.panel?.webview.postMessage({
        type: "page",
        page: ktcProjectRenameResultPage(this.report, message.offset, KTC_PROJECT_RENAME_PAGE_SIZE),
      });
      return;
    }
    if (message.type === "renameRoot") {
      await this.renameRoot(message.reportId);
      return;
    }
    await this.openResult(message.reportId, message.rowId);
  }

  private async chooseRoot(): Promise<void> {
    if (this.abortController) return;
    if (this.state.root) {
      void vscode.window.showInformationMessage("当前分析任务已绑定目录；请关闭此 View 后从搜索替换重新打开新任务。");
      return;
    }
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: this.state.root ? vscode.Uri.file(this.state.root) : vscode.workspace.workspaceFolders?.[0]?.uri,
      openLabel: "选择项目目录",
      title: "项目改名",
    });
    const root = selected?.[0]?.fsPath;
    if (!root) return;
    const sourceName = basename(root);
    const profileSnapshot = this.host.profileSnapshot(root);
    const historySnapshot = this.host.historySnapshot(root);
    this.report = undefined;
    this.state = {
      root,
      status: "idle",
      message: "目录已选择；请填写目标名并检查规则。",
      sourceName,
      targetName: "",
      sourcePrefix: "",
      targetPrefix: "",
      rules: ktcDeriveProjectRenameRules(sourceName, ""),
      profiles: profileSnapshot.profiles,
      profileLabel: "",
      renameHistory: historySnapshot.pairs,
      projectHistory: historySnapshot.projectPlans,
      gitCompareAvailable: false,
      ...(profileSnapshot.error ? { profileError: profileSnapshot.error } : {}),
      completion: undefined,
    };
    await this.postState();
  }

  private async loadProfile(id: string): Promise<void> {
    const root = this.state.root;
    if (!root || this.abortController) return;
    try {
      const snapshot = this.host.loadProfile(root, id);
      const profile = snapshot.selectedProfile;
      if (!profile) throw new Error("所选规则档案没有可载入内容。");
      const derived = ktcDeriveProjectRenameRules(profile.search, profile.replace);
      const searches = new Set(derived.map((rule) => rule.search));
      const customRules: KtcProjectRenameRule[] = [];
      for (const rule of profile.associatedRules) {
        if (!rule.search.trim() || searches.has(rule.search)) continue;
        searches.add(rule.search);
        customRules.push({
          id: rule.id,
          style: "custom",
          search: rule.search,
          replace: rule.replace,
          enabled: rule.enabled !== false,
          ...(rule.parentId ? { parentId: rule.parentId } : {}),
          ...(rule.relationKind ? { relationKind: rule.relationKind } : {}),
          ...(rule.source ? { source: rule.source } : {}),
        });
      }
      if (customRules.length > KTC_PROJECT_RENAME_MAX_CUSTOM_PROFILE_RULES) {
        throw new Error(`该档案有 ${customRules.length} 条关联规则；项目改名最多载入 ${KTC_PROJECT_RENAME_MAX_CUSTOM_PROFILE_RULES} 条，请先精简档案。`);
      }
      this.report = undefined;
      const { profileError: _profileError, ...current } = this.state;
      this.state = {
        ...current,
        status: "idle",
        message: "已载入规则档案。",
        sourceName: profile.search,
        targetName: profile.replace,
        sourcePrefix: profile.sourcePrefix,
        targetPrefix: profile.targetPrefix,
        rules: [...derived, ...customRules],
        profiles: snapshot.profiles,
        selectedProfileId: profile.id,
        profileLabel: profile.label,
        report: undefined,
        completion: undefined,
      };
    } catch (error) {
      const text = ktcErrorMessage(error);
      this.state = { ...this.state, status: "error", message: text, profileError: text };
    }
    await this.postState();
  }

  private async loadProjectHistory(id: string): Promise<void> {
    const root = this.state.root;
    if (!root || this.abortController) return;
    const snapshot = this.host.historySnapshot(root);
    const entry = snapshot.projectPlans.find((candidate) => candidate.id === id);
    if (!entry) {
      this.state = { ...this.state, status: "error", message: "所选项目历史已过期或被清理。" };
      await this.postState();
      return;
    }
    this.report = undefined;
    this.state = {
      ...this.state,
      status: "idle",
      message: "已恢复该项目最近使用的完整改名方案；请复核后重新分析。",
      sourceName: entry.sourceName,
      targetName: entry.targetName,
      sourcePrefix: entry.sourcePrefix,
      targetPrefix: entry.targetPrefix,
      rules: entry.rules.map((rule) => ({ ...rule })),
      renameHistory: snapshot.pairs,
      projectHistory: snapshot.projectPlans,
      selectedProfileId: undefined,
      profileLabel: "",
      report: undefined,
      completion: undefined,
      gitCompareAvailable: false,
    };
    await this.postState();
  }

  private async deleteHistory(
    entry: Extract<KtcProjectRenameViewInboundMessage, { type: "deleteHistory" }>["entry"],
  ): Promise<void> {
    if (this.abortController) return;
    const root = this.state.root ?? "";
    const snapshot = entry.kind === "project"
      ? root
        ? await this.host.forgetProjectPlan(root, entry.id)
        : this.host.historySnapshot(root)
      : await this.host.forgetRenamePair(root, entry.source, entry.target);
    this.state = {
      ...this.state,
      status: "idle",
      message: entry.kind === "project" ? "已删除所选本机项目方案。" : "已删除所选最近输入。",
      renameHistory: snapshot.pairs,
      projectHistory: snapshot.projectPlans,
    };
    await this.postState();
  }

  private async clearHistory(): Promise<void> {
    if (this.abortController) return;
    const accepted = await vscode.window.showWarningMessage(
      "清空全部本机改名历史？",
      {
        modal: true,
        detail: "将删除用户最近输入和所有项目的本机方案；项目共享规则档案不受影响。删除后无法恢复。",
      },
      "清空本机历史",
    );
    if (accepted !== "清空本机历史") return;
    const snapshot = await this.host.clearRenameHistory();
    this.state = {
      ...this.state,
      status: "idle",
      message: "已清空全部本机改名历史；项目共享规则档案未改动。",
      renameHistory: snapshot.pairs,
      projectHistory: snapshot.projectPlans,
    };
    await this.postState();
  }

  private async saveProfile(
    message: Extract<KtcProjectRenameViewInboundMessage, { type: "saveProfile" }>,
  ): Promise<void> {
    const root = this.state.root;
    if (!root || this.abortController) return;
    if (!message.sourceName.trim() || !message.targetName.trim()) {
      this.state = { ...this.state, status: "error", message: "保存规则前请填写原项目名和目标项目名。" };
      await this.postState();
      return;
    }
    try {
      const snapshot = await this.host.saveProfile(root, {
        search: message.sourceName,
        replace: message.targetName,
        sourcePrefix: message.sourcePrefix,
        targetPrefix: message.targetPrefix,
        associatedRules: message.rules
          .filter((rule) => rule.style === "custom")
          .map(ktcProjectRenameRuleAsDraft),
        options: {
          preserveCase: false,
          text: true,
          file: true,
          dir: true,
          includeIgnored: false,
          scope: "",
        },
      }, message.label);
      const profile = snapshot.selectedProfile;
      if (!profile) throw new Error("规则档案保存后未能重新载入。");
      this.report = undefined;
      const { profileError: _profileError, ...current } = this.state;
      this.state = {
        ...current,
        status: "idle",
        message: `规则档案“${profile.label}”已保存到当前项目。名称或规则有变化时请重新分析。`,
        sourceName: message.sourceName,
        targetName: message.targetName,
        sourcePrefix: message.sourcePrefix,
        targetPrefix: message.targetPrefix,
        rules: message.rules.map((rule) => ({ ...rule })),
        profiles: snapshot.profiles,
        selectedProfileId: profile.id,
        profileLabel: profile.label,
        report: undefined,
        completion: undefined,
      };
    } catch (error) {
      const text = ktcErrorMessage(error);
      this.state = { ...this.state, status: "error", message: text, profileError: text };
    }
    await this.postState();
  }

  private async openRulePicker(
    message: Extract<KtcProjectRenameViewInboundMessage, { type: "requestRulePicker" }>,
  ): Promise<void> {
    if (this.abortController) return;
    const picker = this.host.createRulePicker({
      mode: message.mode,
      search: message.sourceName,
      replace: message.targetName,
      sourcePrefix: message.sourcePrefix,
      targetPrefix: message.targetPrefix,
      existingRules: message.rules.map(ktcProjectRenameRuleAsDraft),
    });
    await this.panel?.webview.postMessage({ type: "rulePicker", picker });
  }

  private async analyze(
    sourceName: string,
    targetName: string,
    sourcePrefix: string,
    targetPrefix: string,
    rules: readonly KtcProjectRenameRule[],
    verifyingAfterApply = false,
  ): Promise<void> {
    const root = this.state.root;
    if (!root || this.abortController) return;
    if (!sourceName.trim() || !targetName.trim()) {
      this.state = {
        ...this.state,
        status: "error",
        message: "原项目名和目标项目名不能为空。",
        sourceName,
        targetName,
        sourcePrefix,
        targetPrefix,
        rules,
      };
      await this.postState();
      return;
    }
    if (!rules.some((rule) => rule.enabled && rule.search && rule.replace)) {
      this.state = {
        ...this.state,
        status: "error",
        message: "至少需要一条启用且完整的改名规则。",
        sourceName,
        targetName,
        sourcePrefix,
        targetPrefix,
        rules,
      };
      await this.postState();
      return;
    }
    const reportId = this.nextReportId++;
    const abortController = new AbortController();
    this.abortController = abortController;
    this.report = undefined;
    this.state = {
      ...this.state,
      status: verifyingAfterApply ? "applying" : "running",
      message: verifyingAfterApply ? "写盘完成，正在重新扫描并计算结束门禁…" : "正在异步扫描；分析全程只读。",
      sourceName,
      targetName,
      sourcePrefix,
      targetPrefix,
      rules: rules.map((rule) => ({ ...rule })),
      progress: { scannedFiles: 0, matchedItems: 0 },
      report: undefined,
      completion: undefined,
      ...(verifyingAfterApply ? {} : { gitCompareAvailable: false }),
    };
    await this.postState();
    try {
      const report = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: verifyingAfterApply ? "KT Auto Code：验证项目改名结果" : "KT Auto Code：项目改名",
        cancellable: !verifyingAfterApply,
      }, async (progress, token) => {
        const cancellation = token.onCancellationRequested(() => abortController.abort());
        try {
          return await ktcAnalyzeProjectRename({
            reportId,
            root,
            sourceName,
            targetName,
            rules,
            signal: abortController.signal,
            onProgress: (scanProgress) => {
              if (this.abortController !== abortController) return;
              this.state = { ...this.state, progress: scanProgress };
              progress.report({ message: `已扫描 ${scanProgress.scannedFiles} 个文件` });
              void this.postState();
            },
          });
        } finally {
          cancellation.dispose();
        }
      });
      if (this.abortController !== abortController) return;
      this.report = report;
      const history = verifyingAfterApply
        ? this.host.historySnapshot(root)
        : await this.host.rememberProjectPlan(root, {
            sourceName,
            targetName,
            sourcePrefix,
            targetPrefix,
            rules,
          });
      this.state = {
        ...this.state,
        status: "done",
        message: report.stats.truncated
          ? "分析完成，但命中达到安全上限；请缩小目录或规则范围。"
          : "分析完成；请优先复核高风险契约和冲突，确认后再执行。",
        progress: undefined,
        report: this.reportSummary(report),
        renameHistory: history.pairs,
        projectHistory: history.projectPlans,
      };
    } catch (error) {
      if (this.abortController !== abortController) return;
      const cancelled = error instanceof KtcProjectRenameCancelledError || abortController.signal.aborted;
      this.state = {
        ...this.state,
        status: cancelled ? "cancelled" : "error",
        message: cancelled
          ? verifyingAfterApply
            ? "改名已写盘，但完成门禁复扫中断；请重新分析并通过 Git diff 检查。"
            : "项目改名分析已取消；没有修改任何文件。"
          : `${verifyingAfterApply ? "改名已写盘，但完成门禁复扫失败" : "分析失败"}：${ktcErrorMessage(error)}`,
        progress: undefined,
        report: undefined,
        completion: undefined,
      };
    } finally {
      if (this.abortController === abortController) this.abortController = undefined;
    }
    await this.postState();
  }

  private async applyReport(reportId: number): Promise<void> {
    const report = this.report;
    if (!report || report.reportId !== reportId || this.abortController || this.state.status === "applying") return;
    if (report.stats.truncated) {
      await this.blockApply("分析结果达到安全上限，不能写盘；请缩小目录或规则范围后重新分析。");
      return;
    }
    if (report.workspaceReport.summary.errors > 0) {
      await this.blockApply("报告中存在路径冲突或错误，不能写盘；请先修正规则并重新分析。");
      return;
    }
    if (report.workspaceReport.hits.length === 0) {
      await this.blockApply("当前报告没有可执行的改名项。");
      return;
    }
    let preview;
    try {
      preview = this.host.preview(report);
    } catch (error) {
      await this.blockApply(`执行前预检失败：${ktcErrorMessage(error)}`);
      return;
    }
    if (preview.summary.errors > 0) {
      await this.blockApply("执行前预检发现路径冲突；没有修改任何内容，请重新分析。");
      return;
    }
    const drift = ktcProjectRenamePreviewDrift(report, preview);
    if (drift) {
      await this.blockApply(`${drift} 没有修改任何内容，请重新分析。`);
      return;
    }
    const gitState = await this.host.gitState(report.root);
    if (gitState === "dirty") {
      await this.blockApply("Git 工作区存在未提交或未跟踪改动；为保证可恢复性，本次写盘已阻止。请先提交、暂存到其他位置或清理后重新分析。");
      return;
    }
    if (gitState === "unavailable") {
      await this.blockApply("无法可靠检查 Git 工作区状态；为保证可恢复性，本次写盘已阻止。请确认 Git 可用后重新分析。");
      return;
    }
    const accepted = await vscode.window.showWarningMessage(
      `执行项目改名：${preview.hits.length} 项、${preview.summary.replacements} 处精确替换？`,
      {
        modal: true,
        detail: [
          `目录：${report.root}`,
          `文本文件 ${preview.summary.textFiles}，文件名 ${preview.summary.files}，目录名 ${preview.summary.directories}`,
          gitState === "clean" ? "Git 工作区干净，可通过 Git 审查和恢复。" : "当前目录不是 Git 仓库；写盘后无法依赖 Git 恢复。",
          "只执行当前报告中已启用且已冻结的精确规则；智能候选若未主动启用，不会写盘。",
        ].join("\n"),
      },
      "执行全部已分析改名",
    );
    if (accepted !== "执行全部已分析改名") return;
    this.state = {
      ...this.state,
      status: "applying",
      message: "正在执行冻结报告中的精确改名；请勿同时修改该目录。",
      completion: undefined,
    };
    await this.postState();
    let applied;
    try {
      applied = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "KT Auto Code：执行项目改名",
        cancellable: false,
      }, async () => {
        await new Promise<void>((resolveYield) => setImmediate(resolveYield));
        return this.host.apply(report);
      });
    } catch (error) {
      this.state = {
        ...this.state,
        status: "error",
        message: `执行改名失败：${ktcErrorMessage(error)}。请立即通过 Git diff 检查已发生的修改。`,
      };
      await this.postState();
      return;
    }
    if (!applied.applied || applied.summary.errors > 0) {
      this.state = {
        ...this.state,
        status: "error",
        message: `改名执行未全部成功：${applied.summary.errors} 项错误。请通过 Git diff 检查，不要直接结束任务。`,
      };
      await this.postState();
      return;
    }
    await this.analyze(
      report.sourceName,
      report.targetName,
      this.state.sourcePrefix,
      this.state.targetPrefix,
      report.rules,
      true,
    );
    const remaining = this.report;
    if (!remaining) return;
    const completion = ktcProjectRenameCompletionAfterApply(preview, applied, remaining);
    this.state = {
      ...this.state,
      completion,
      message: completion.message,
      gitCompareAvailable: gitState === "clean",
    };
    await this.postState();
  }

  private async blockApply(message: string): Promise<void> {
    this.state = { ...this.state, status: "error", message };
    await this.postState();
    void vscode.window.showWarningMessage(message);
  }

  private finishTask(): void {
    if (!this.state.completion?.canFinish) {
      void vscode.window.showWarningMessage("尚未达到任务结束门禁；请先完成写盘或重新分析剩余命中。");
      return;
    }
    const message = this.state.completion.targetReached
      ? "项目改名任务已达到目标并结束。"
      : "本次冻结计划已全部完成，任务已按人工结束条件关闭。";
    void vscode.window.showInformationMessage(message);
    this.panel?.dispose();
  }

  private reportSummary(report: KtcProjectRenameAnalysisReport): NonNullable<KtcProjectRenameViewState["report"]> {
    const summary = ktcProjectRenameReportSummary(report, KTC_PROJECT_RENAME_PAGE_SIZE);
    if (!summary.rootSuggestion) return summary;
    const plan = ktcPlanProjectRenameRootDirectory(
      report.root,
      summary.rootSuggestion.suggestedName,
      vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
    );
    return {
      ...summary,
      rootSuggestion: {
        ...summary.rootSuggestion,
        canRename: plan.allowed,
        renameReason: plan.reason,
      },
    };
  }

  private async renameRoot(reportId: number): Promise<void> {
    const report = this.report;
    if (!report || report.reportId !== reportId || !report.rootSuggestion || this.abortController) return;
    const plan = ktcPlanProjectRenameRootDirectory(
      report.root,
      report.rootSuggestion.suggestedName,
      vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
    );
    if (!plan.allowed || !plan.destinationPath) {
      void vscode.window.showWarningMessage(plan.reason);
      return;
    }
    const accepted = await vscode.window.showWarningMessage(
      `将仓库根目录从“${report.rootSuggestion.currentName}”改名为“${report.rootSuggestion.suggestedName}”？`,
      {
        modal: true,
        detail: `${plan.sourcePath}\n→ ${plan.destinationPath}\n\n只修改目录名称，不修改目录内部内容；成功后当前分析报告会清空。`,
      },
      "重命名根目录",
    );
    if (accepted !== "重命名根目录") return;
    const previousState = this.state;
    this.state = { ...this.state, status: "applying", message: "正在重命名仓库根目录…" };
    await this.postState();
    try {
      await this.host.renameRoot(plan.sourcePath, plan.destinationPath);
      this.report = undefined;
      this.state = {
        ...this.state,
        root: plan.destinationPath,
        status: "idle",
        message: "仓库根目录已重命名；旧报告已清空。请重新分析内部名称，Primary 中的旧目录记录可重新选择。",
        progress: undefined,
        report: undefined,
        ...(previousState.completion ? {
          completion: {
            ...previousState.completion,
            remainingItems: Math.max(0, previousState.completion.remainingItems - 1),
            targetReached: previousState.completion.remainingItems <= 1,
            canFinish: true,
            message: previousState.completion.remainingItems <= 1
              ? "目标门禁已达到：内部计划完成，仓库根目录也已改名。"
              : previousState.completion.message,
          },
        } : { completion: undefined }),
      };
      void vscode.window.showInformationMessage(`仓库根目录已重命名为：${report.rootSuggestion.suggestedName}`);
    } catch (error) {
      this.state = {
        ...previousState,
        status: "error",
        message: `仓库根目录改名失败：${ktcErrorMessage(error)}`,
      };
    }
    await this.postState();
  }

  private async openResult(reportId: number, rowId: string): Promise<void> {
    const report = this.report;
    if (!report || report.reportId !== reportId) return;
    const row = ktcBuildRenameResultViewModel(report.workspaceReport).rows.find((candidate) => candidate.id === rowId);
    if (!row) return;
    const opened = await ktcOpenWorkspaceResource({
      root: report.root,
      target: row.openPath,
      kind: row.level === "dir" ? "directory" : "text",
      ...(row.openLine === undefined ? {} : { line: row.openLine }),
      highlightTerms: row.editorHighlightTerms,
    });
    if (!opened) void vscode.window.showWarningMessage("无法打开工作区之外的分析结果。");
  }

  private async previewFirstDiff(reportId: number): Promise<void> {
    const report = this.report;
    if (!report || report.reportId !== reportId) return;
    const hits = report.workspaceReport.hits.filter((hit) => (
      hit.level === "text" && hit.status !== "error" && hit.status !== "skipped"
    ));
    if (hits.length === 0) {
      void vscode.window.showInformationMessage("当前冻结报告没有可预览的文本差异。");
      return;
    }
    const selected = hits.length === 1
      ? { rowId: hits[0]!.id }
      : await vscode.window.showQuickPick(hits.map((hit) => ({
          label: hit.relativePath,
          description: `${hit.occurrences} 处 · ${hit.detectedEncoding ?? "未知编码"}`,
          rowId: hit.id,
        })), {
          title: "项目改名：预览写盘前差异",
          placeHolder: "选择一个文本文件，使用 VS Code 原生 Diff Editor 查看冻结计划",
        });
    if (selected) await this.previewTextDiff(reportId, selected.rowId);
  }

  private async previewTextDiff(reportId: number, rowId: string): Promise<void> {
    const report = this.report;
    if (!report || report.reportId !== reportId) return;
    try {
      await this.host.openTextDiff(report, rowId);
    } catch (error) {
      void vscode.window.showWarningMessage(`无法预览写盘前差异：${ktcErrorMessage(error)}`);
    }
  }

  private postState(): Promise<void> {
    const panel = this.panel;
    const state = this.state;
    this.postStateQueue = this.postStateQueue
      .catch(() => undefined)
      .then(async () => {
        if (this.panel !== panel) return;
        await panel?.webview.postMessage({ type: "state", state });
      });
    return this.postStateQueue;
  }
}

function ktcParseProjectRenameOpenDraft(value: unknown): KtcProjectRenameOpenDraft {
  if (typeof value === "string") {
    return { ...(value.trim() ? { root: value } : {}), rules: [] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { rules: [] };
  const record = value as Record<string, unknown>;
  const root = typeof record.root === "string" && record.root.trim() ? record.root : undefined;
  const sourceName = ktcBoundedOpenText(record.sourceName, false);
  const targetName = ktcBoundedOpenText(record.targetName, true);
  const rawRules = Array.isArray(record.rules)
    ? record.rules.slice(0, KTC_PROJECT_RENAME_MAX_OPEN_RULES)
    : [];
  const rules = rawRules.flatMap((rawRule) => {
    if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) return [];
    const rule = rawRule as Record<string, unknown>;
    const search = ktcBoundedOpenText(rule.search, false);
    const replace = ktcBoundedOpenText(rule.replace, true);
    if (search === undefined || replace === undefined) return [];
    return [{ search, replace, enabled: rule.enabled !== false }];
  });
  return {
    ...(root ? { root } : {}),
    ...(sourceName === undefined ? {} : { sourceName }),
    ...(targetName === undefined ? {} : { targetName }),
    rules,
  };
}

function ktcBoundedOpenText(value: unknown, allowEmpty: boolean): string | undefined {
  if (typeof value !== "string" || value.length > 256 || (!allowEmpty && !value.trim())) return undefined;
  return value;
}

function ktcProjectRenameInitialRules(
  sourceName: string,
  targetName: string,
  carriedRules: KtcProjectRenameOpenDraft["rules"],
): readonly KtcProjectRenameRule[] {
  const rules = [...ktcDeriveProjectRenameRules(sourceName, targetName)];
  const seen = new Set<string>();
  for (const [index, carried] of carriedRules.entries()) {
    if (!carried.search || seen.has(carried.search)) continue;
    seen.add(carried.search);
    const derivedIndex = rules.findIndex((rule) => rule.search === carried.search);
    if (derivedIndex >= 0) {
      rules[derivedIndex] = {
        ...rules[derivedIndex]!,
        replace: carried.replace,
        enabled: carried.enabled && carried.replace !== "" && carried.search !== carried.replace,
      };
      continue;
    }
    rules.push({
      id: `primary-simple-${index + 1}`,
      style: "custom",
      search: carried.search,
      replace: carried.replace,
      enabled: carried.enabled && carried.replace !== "" && carried.search !== carried.replace,
      relationKind: "custom",
      source: "user",
    });
  }
  return rules;
}

function ktcErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
