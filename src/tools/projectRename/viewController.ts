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
import { ktcAnalyzeProjectRename, KtcProjectRenameCancelledError } from "./analyzer.js";
import { ktcDeriveProjectRenameRules } from "./nameVariants.js";
import { ktcProjectRenameReportSummary, ktcProjectRenameResultPage } from "./viewModel.js";
import { ktcProjectRenameViewHtml } from "./viewHtml.js";
import { ktcParseProjectRenameViewMessage } from "./viewMessages.js";
import { ktcProjectRenameCompletionAfterApply, ktcProjectRenamePreviewDrift } from "./execution.js";
import { ktcPlanProjectRenameRootDirectory } from "./rootDirectoryRename.js";

const KTC_PROJECT_RENAME_PAGE_SIZE = 200;

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
      "大型项目改名分析",
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
        void vscode.window.showErrorMessage(`项目改名分析 View 操作失败：${ktcErrorMessage(error)}`);
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
    const explicitRoot = typeof requestedRoot === "string" && requestedRoot.trim() !== ""
      ? requestedRoot
      : undefined;
    const root = explicitRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const sourceName = root ? basename(root) : "";
    return {
      ...(root ? { root } : {}),
      status: "idle",
      message: root
        ? "分析任务已绑定当前目录；如需更换目录，请关闭此 View 后从搜索替换重新打开。"
        : "请选择分析目录；任务开始后如需更换，请关闭此 View 再重新打开。",
      sourceName,
      targetName: "",
      rules: ktcDeriveProjectRenameRules(sourceName, ""),
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
    if (message.type === "derive") {
      if (this.abortController) return;
      this.report = undefined;
      this.state = {
        ...this.state,
        status: "idle",
        message: "已派生 6 种名称形态；短前缀请通过“添加显式规则”填写。",
        sourceName: message.sourceName,
        targetName: message.targetName,
        rules: ktcDeriveProjectRenameRules(message.sourceName, message.targetName),
        report: undefined,
        completion: undefined,
      };
      await this.postState();
      return;
    }
    if (message.type === "analyze") {
      await this.analyze(message.sourceName, message.targetName, message.rules);
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
      openLabel: "选择分析目录",
      title: "大型项目改名分析",
    });
    const root = selected?.[0]?.fsPath;
    if (!root) return;
    const sourceName = basename(root);
    this.report = undefined;
    this.state = {
      root,
      status: "idle",
      message: "目录已选择；请填写目标名并检查规则。",
      sourceName,
      targetName: "",
      rules: ktcDeriveProjectRenameRules(sourceName, ""),
      completion: undefined,
    };
    await this.postState();
  }

  private async analyze(
    sourceName: string,
    targetName: string,
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
      rules: rules.map((rule) => ({ ...rule })),
      progress: { scannedFiles: 0, matchedItems: 0 },
      report: undefined,
      completion: undefined,
    };
    await this.postState();
    try {
      const report = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: verifyingAfterApply ? "KT Auto Code：验证大型项目改名结果" : "KT Auto Code：大型项目改名分析",
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
      this.state = {
        ...this.state,
        status: "done",
        message: report.stats.truncated
          ? "分析完成，但命中达到安全上限；请缩小目录或规则范围。"
          : "分析完成；请优先复核高风险契约和冲突，确认后再执行。",
        progress: undefined,
        report: this.reportSummary(report),
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
      `执行大型项目改名：${preview.hits.length} 项、${preview.summary.replacements} 处精确替换？`,
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
        title: "KT Auto Code：执行大型项目改名",
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
    await this.analyze(report.sourceName, report.targetName, report.rules, true);
    const remaining = this.report;
    if (!remaining) return;
    const completion = ktcProjectRenameCompletionAfterApply(preview, applied, remaining);
    this.state = {
      ...this.state,
      completion,
      message: completion.message,
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
      ? "大型项目改名任务已达到目标并结束。"
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

function ktcErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
