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
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import type {
  KtcEditorPrimaryCompanionAction,
  KtcEditorPrimaryCompanionActionToken,
  KtcEditorPrimaryCompanionLifecycle,
  KtcEditorPrimaryCompanionSnapshot,
  KtcEditorPrimaryCompanionStatus,
  KtcEditorPrimaryCompanionSummaryItem,
} from "../../core/editorPrimaryCompanionContracts.js";
import { ktcEditorPrimaryCompanionStatusMessage } from "../../core/editorPrimaryCompanionContracts.js";

const KTC_PROJECT_RENAME_PAGE_SIZE = 200;
const KTC_PROJECT_RENAME_MAX_CUSTOM_PROFILE_RULES = 26;
const KTC_PROJECT_RENAME_MAX_OPEN_RULES = 6;
let ktcProjectRenameSessionSequence = 0;

export type KtcProjectRenameCompanionLifecycle = KtcEditorPrimaryCompanionLifecycle;

export type KtcProjectRenameCompanionActionId = "reveal" | "cancel" | "openGitChanges";

export interface KtcProjectRenameCompanionAction extends Omit<KtcEditorPrimaryCompanionAction, "id"> {
  readonly id: KtcProjectRenameCompanionActionId;
}

/**
 * Host-owned projection for Primary. It intentionally excludes editable draft
 * fields and write actions: Primary may only route the safe actions listed here.
 */
export interface KtcProjectRenameCompanionSnapshot extends Omit<
  KtcEditorPrimaryCompanionSnapshot,
  "toolId" | "title" | "actions"
> {
  readonly toolId: "projectRename";
  readonly title: "项目改名";
  readonly projectStatus: KtcProjectRenameViewState["status"];
  readonly enabledRuleCount: number;
  readonly progress?: KtcProjectRenameViewState["progress"];
  readonly report?: {
    readonly reportId: number;
    readonly totalRows: number;
    readonly replacements: number;
    readonly highRisk: number;
    readonly mediumRisk: number;
    readonly lowRisk: number;
  };
  readonly actions: readonly KtcProjectRenameCompanionAction[];
}

export type KtcProjectRenameCompanionEventReason =
  | "created"
  | "shown"
  | "view-state"
  | "state"
  | "disposed";

export interface KtcProjectRenameCompanionEvent {
  readonly reason: KtcProjectRenameCompanionEventReason;
  readonly snapshot: KtcProjectRenameCompanionSnapshot;
}

export interface KtcProjectRenameViewCallbacks {
  readonly onCompanionEvent?: (event: KtcProjectRenameCompanionEvent) => void;
}

export interface KtcProjectRenameCompanionActionRequest extends Omit<
  KtcEditorPrimaryCompanionActionToken,
  "toolId" | "actionId"
> {
  readonly toolId: "projectRename";
  readonly panelId: string;
  readonly actionId: KtcProjectRenameCompanionActionId;
}

export type KtcProjectRenameCompanionActionRejectionReason =
  | "no-open-session"
  | "tool-mismatch"
  | "panel-mismatch"
  | "session-mismatch"
  | "revision-mismatch"
  | "disposed"
  | "action-unavailable";

export type KtcProjectRenameCompanionActionResult =
  | { readonly accepted: true; readonly snapshot: KtcProjectRenameCompanionSnapshot }
  | { readonly accepted: false; readonly reason: KtcProjectRenameCompanionActionRejectionReason };

interface KtcProjectRenameCompanionSession {
  readonly panelId: string;
  readonly sessionId: string;
  readonly revision: number;
  readonly lifecycle: KtcProjectRenameCompanionLifecycle;
}

interface KtcProjectRenameSessionIdentity {
  readonly epoch: number;
  readonly panelId: string;
  readonly sessionId: string;
}

interface KtcProjectRenameSessionContext extends KtcProjectRenameSessionIdentity {
  readonly panel: vscode.WebviewPanel;
}

type KtcProjectRenameWritePhase =
  | "apply-confirmed"
  | "apply-writing"
  | "verify-after-apply"
  | "rename-confirmed"
  | "rename-writing";

interface KtcProjectRenameWriteOperation {
  readonly epoch: number;
  readonly phase: KtcProjectRenameWritePhase;
}

class KtcProjectRenameStaleSessionError extends Error {
  constructor() {
    super("项目改名 Editor 会话已经关闭或被替换");
    this.name = "KtcProjectRenameStaleSessionError";
  }
}

interface KtcProjectRenameOpenDraft {
  readonly root?: string;
  readonly sourceName?: string;
  readonly targetName?: string;
  readonly rules: readonly {
    readonly search: string;
    readonly replace: string;
    readonly enabled: boolean;
  }[];
  readonly ignoreSources: {
    readonly builtInIgnoreEnabled: boolean;
    readonly gitIgnoreEnabled: boolean;
    readonly customIgnoreEnabled: boolean;
  };
}

const KTC_DEFAULT_PROJECT_RENAME_IGNORE_SOURCES: KtcProjectRenameOpenDraft["ignoreSources"] = Object.freeze({
  builtInIgnoreEnabled: true,
  gitIgnoreEnabled: true,
  customIgnoreEnabled: false,
});

export class KtcProjectRenameViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private companionSession: KtcProjectRenameCompanionSession | undefined;
  private companionReady = false;
  private controllerEpoch = 0;
  private writeOperation: KtcProjectRenameWriteOperation | undefined;
  private abortController: AbortController | undefined;
  private report: KtcProjectRenameAnalysisReport | undefined;
  private nextReportId = 1;
  private postStateQueue: Promise<void> = Promise.resolve();
  private state: KtcProjectRenameViewState;
  private ignoreSources: KtcProjectRenameOpenDraft["ignoreSources"] = KTC_DEFAULT_PROJECT_RENAME_IGNORE_SOURCES;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly host: KtcProjectRenameHostPort,
    private readonly callbacks: KtcProjectRenameViewCallbacks = {},
  ) {
    this.state = this.createInitialState();
  }

  show(requestedRoot?: unknown): void {
    if (this.panel) {
      // 一个 Editor View 对应一个复杂分析任务。Primary 再次点击只能聚焦，
      // 不得用新的目录或表单状态覆盖仍在查看的报告。
      this.panel.reveal(this.panel.viewColumn, false);
      this.updateCompanionLifecycle("active", "shown");
      return;
    }
    this.report = undefined;
    this.state = this.createInitialState(requestedRoot);
    this.companionReady = false;
    this.writeOperation = undefined;
    const sequence = ++ktcProjectRenameSessionSequence;
    const identity: KtcProjectRenameSessionIdentity = {
      epoch: ++this.controllerEpoch,
      panelId: `projectRename-panel-${sequence}`,
      sessionId: `projectRename-session-${sequence}`,
    };
    const panel = this.createPanel(identity);
    this.panel = panel;
    this.companionSession = {
      panelId: identity.panelId,
      sessionId: identity.sessionId,
      revision: 0,
      lifecycle: ktcProjectRenamePanelLifecycle(panel),
    };
    this.emitCompanionEvent("created");
    panel.reveal(panel.viewColumn, false);
    this.updateCompanionLifecycle("active", "shown");
  }

  dispose(): void {
    const panel = this.panel;
    if (!panel) return;
    panel.dispose();
    // VS Code normally raises onDidDispose synchronously. Keep a defensive
    // fallback for panel adapters that do not do so.
    if (this.panel === panel) this.closePanel(panel);
  }

  getCompanionSnapshot(): KtcProjectRenameCompanionSnapshot | undefined {
    return this.companionSnapshot();
  }

  async runCompanionAction(
    request: KtcProjectRenameCompanionActionRequest,
  ): Promise<KtcProjectRenameCompanionActionResult> {
    const rejection = this.validateCompanionActionRequest(request);
    if (rejection) return { accepted: false, reason: rejection };
    const context = this.currentSessionContext();
    if (!context) return { accepted: false, reason: "no-open-session" };
    const action = this.companionSnapshot()?.actions.find((candidate) => candidate.id === request.actionId);
    if (!action?.enabled) return { accepted: false, reason: "action-unavailable" };

    if (request.actionId === "reveal") {
      context.panel.reveal(context.panel.viewColumn, false);
      this.updateCompanionLifecycle("active", "shown");
    } else if (request.actionId === "cancel") {
      await this.cancelAnalysis(this.abortController, context);
    } else {
      await this.openGitChanges(false, context);
    }
    const currentSession = this.companionSession;
    if (!currentSession) return { accepted: false, reason: "no-open-session" };
    if (currentSession.lifecycle === "disposed") return { accepted: false, reason: "disposed" };
    if (!this.panel) return { accepted: false, reason: "no-open-session" };
    if (currentSession.panelId !== request.panelId) return { accepted: false, reason: "panel-mismatch" };
    if (currentSession.sessionId !== request.sessionId) return { accepted: false, reason: "session-mismatch" };
    const snapshot = this.companionSnapshot();
    return snapshot
      ? { accepted: true, snapshot }
      : { accepted: false, reason: "no-open-session" };
  }

  private createPanel(identity: KtcProjectRenameSessionIdentity): vscode.WebviewPanel {
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
    const context: KtcProjectRenameSessionContext = { ...identity, panel };
    panel.webview.html = ktcProjectRenameViewHtml(panel.webview, this.extensionUri);
    panel.webview.onDidReceiveMessage((value: unknown) => {
      if (!this.isLiveSession(context)) return;
      const message = ktcParseProjectRenameViewMessage(value);
      if (message) void this.handleMessage(message, context).catch((error: unknown) => {
        void vscode.window.showErrorMessage(`项目改名 View 操作失败：${ktcErrorMessage(error)}`);
      });
    });
    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (this.panel !== panel) return;
      this.updateCompanionLifecycle(ktcProjectRenamePanelLifecycle(webviewPanel), "view-state");
    });
    panel.onDidDispose(() => {
      this.closePanel(panel);
    });
    return panel;
  }

  private createInitialState(requestedRoot?: unknown): KtcProjectRenameViewState {
    const draft = ktcParseProjectRenameOpenDraft(requestedRoot);
    this.ignoreSources = draft.ignoreSources;
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

  private async handleMessage(
    message: KtcProjectRenameViewInboundMessage,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context)) return;
    if (message.type === "ready") {
      this.companionReady = true;
      await this.postState(context);
      return;
    }
    if (message.type === "cancel") {
      await this.cancelAnalysis(this.abortController, context);
      return;
    }
    if (message.type === "chooseRoot") {
      await this.chooseRoot(context);
      return;
    }
    if (message.type === "openGitChanges") {
      await this.openGitChanges(true, context);
      return;
    }
    if (message.type === "previewFirstDiff") {
      await this.previewFirstDiff(message.reportId, context);
      return;
    }
    if (message.type === "previewDiff") {
      await this.previewTextDiff(message.reportId, message.rowId, context);
      return;
    }
    if (message.type === "loadProfile") {
      await this.loadProfile(message.id, context);
      return;
    }
    if (message.type === "loadProjectHistory") {
      await this.loadProjectHistory(message.id, context);
      return;
    }
    if (message.type === "deleteHistory") {
      await this.deleteHistory(message.entry, context);
      return;
    }
    if (message.type === "clearHistory") {
      await this.clearHistory(context);
      return;
    }
    if (message.type === "saveProfile") {
      await this.saveProfile(message, context);
      return;
    }
    if (message.type === "requestRulePicker") {
      await this.openRulePicker(message, context);
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
      await this.postState(context);
      return;
    }
    if (message.type === "analyze") {
      await this.analyze(
        message.sourceName,
        message.targetName,
        message.sourcePrefix,
        message.targetPrefix,
        message.rules,
        false,
        context,
      );
      return;
    }
    if (message.type === "apply") {
      await this.applyReport(message.reportId, context);
      return;
    }
    if (message.type === "finish") {
      this.finishTask(context);
      return;
    }
    if (message.type === "loadMore") {
      if (!this.report || this.report.reportId !== message.reportId) return;
      await context.panel.webview.postMessage({
        type: "page",
        page: ktcProjectRenameResultPage(this.report, message.offset, KTC_PROJECT_RENAME_PAGE_SIZE),
      });
      return;
    }
    if (message.type === "renameRoot") {
      await this.renameRoot(message.reportId, context);
      return;
    }
    await this.openResult(message.reportId, message.rowId, context);
  }

  private async cancelAnalysis(
    controller = this.abortController,
    context = this.currentSessionContext(),
  ): Promise<void> {
    if (!context || !this.isLiveSession(context)) return;
    if (!controller || this.abortController !== controller || this.state.status !== "running") return;
    controller.abort();
    if (!this.isLiveSession(context) || this.abortController !== controller) return;
    this.abortController = undefined;
    this.report = undefined;
    this.state = {
      ...this.state,
      status: "cancelled",
      message: "项目改名分析已取消；没有修改任何文件。",
      progress: undefined,
      report: undefined,
      completion: undefined,
    };
    await this.postState(context);
  }

  private async openGitChanges(
    showUnavailableWarning: boolean,
    context = this.currentSessionContext(),
  ): Promise<boolean> {
    if (!context || !this.isLiveSession(context)) return false;
    if (!this.state.gitCompareAvailable || !this.state.completion?.appliedItems) {
      if (showUnavailableWarning) {
        void vscode.window.showWarningMessage("当前任务没有可用的 Git 写盘对比；请先在干净 Git 仓库中成功执行改名。");
      }
      return false;
    }
    await vscode.commands.executeCommand("workbench.view.scm");
    return true;
  }

  private async chooseRoot(context: KtcProjectRenameSessionContext): Promise<void> {
    if (!this.isLiveSession(context)) return;
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
    if (!this.isLiveSession(context)) return;
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
    await this.postState(context);
  }

  private async loadProfile(id: string, context: KtcProjectRenameSessionContext): Promise<void> {
    if (!this.isLiveSession(context)) return;
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
    await this.postState(context);
  }

  private async loadProjectHistory(id: string, context: KtcProjectRenameSessionContext): Promise<void> {
    if (!this.isLiveSession(context)) return;
    const root = this.state.root;
    if (!root || this.abortController) return;
    const snapshot = this.host.historySnapshot(root);
    const entry = snapshot.projectPlans.find((candidate) => candidate.id === id);
    if (!entry) {
      this.state = { ...this.state, status: "error", message: "所选项目历史已过期或被清理。" };
      await this.postState(context);
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
    await this.postState(context);
  }

  private async deleteHistory(
    entry: Extract<KtcProjectRenameViewInboundMessage, { type: "deleteHistory" }>["entry"],
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context) || this.abortController) return;
    const root = this.state.root ?? "";
    // The history methods persist user state. Revalidate the owning Editor
    // session immediately before invoking either write.
    if (!this.isLiveSession(context)) return;
    const snapshot = entry.kind === "project"
      ? root
        ? await this.host.forgetProjectPlan(root, entry.id)
        : this.host.historySnapshot(root)
      : await this.host.forgetRenamePair(root, entry.source, entry.target);
    if (!this.isLiveSession(context)) return;
    this.state = {
      ...this.state,
      status: "idle",
      message: entry.kind === "project" ? "已删除所选本机项目方案。" : "已删除所选最近输入。",
      renameHistory: snapshot.pairs,
      projectHistory: snapshot.projectPlans,
    };
    await this.postState(context);
  }

  private async clearHistory(context: KtcProjectRenameSessionContext): Promise<void> {
    if (!this.isLiveSession(context) || this.abortController) return;
    const accepted = await vscode.window.showWarningMessage(
      "清空全部本机改名历史？",
      {
        modal: true,
        detail: "将删除用户最近输入和所有项目的本机方案；项目共享规则档案不受影响。删除后无法恢复。",
      },
      "清空本机历史",
    );
    if (accepted !== "清空本机历史") return;
    if (!this.isLiveSession(context)) return;
    const snapshot = await this.host.clearRenameHistory();
    if (!this.isLiveSession(context)) return;
    this.state = {
      ...this.state,
      status: "idle",
      message: "已清空全部本机改名历史；项目共享规则档案未改动。",
      renameHistory: snapshot.pairs,
      projectHistory: snapshot.projectPlans,
    };
    await this.postState(context);
  }

  private async saveProfile(
    message: Extract<KtcProjectRenameViewInboundMessage, { type: "saveProfile" }>,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context)) return;
    const root = this.state.root;
    if (!root || this.abortController) return;
    if (!message.sourceName.trim() || !message.targetName.trim()) {
      this.state = { ...this.state, status: "error", message: "保存规则前请填写原项目名和目标项目名。" };
      await this.postState(context);
      return;
    }
    try {
      if (!this.isLiveSession(context)) return;
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
      if (!this.isLiveSession(context)) return;
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
      if (!this.isLiveSession(context)) return;
      const text = ktcErrorMessage(error);
      this.state = { ...this.state, status: "error", message: text, profileError: text };
    }
    await this.postState(context);
  }

  private async openRulePicker(
    message: Extract<KtcProjectRenameViewInboundMessage, { type: "requestRulePicker" }>,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context) || this.abortController) return;
    const picker = this.host.createRulePicker({
      mode: message.mode,
      search: message.sourceName,
      replace: message.targetName,
      sourcePrefix: message.sourcePrefix,
      targetPrefix: message.targetPrefix,
      existingRules: message.rules.map(ktcProjectRenameRuleAsDraft),
    });
    if (!this.isLiveSession(context)) return;
    await context.panel.webview.postMessage({ type: "rulePicker", picker });
  }

  private async analyze(
    sourceName: string,
    targetName: string,
    sourcePrefix: string,
    targetPrefix: string,
    rules: readonly KtcProjectRenameRule[],
    verifyingAfterApply = false,
    context = this.currentSessionContext(),
  ): Promise<void> {
    if (!context || !this.isLiveSession(context)) return;
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
      await this.postState(context);
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
      await this.postState(context);
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
    await this.postState(context);
    if (!this.isLiveSession(context) || this.abortController !== abortController) return;
    try {
      const report = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: verifyingAfterApply ? "KT Auto Code：验证项目改名结果" : "KT Auto Code：项目改名",
        cancellable: !verifyingAfterApply,
      }, async (progress, token) => {
        if (!this.isLiveSession(context) || this.abortController !== abortController) {
          throw new KtcProjectRenameStaleSessionError();
        }
        const cancellation = token.onCancellationRequested(() => {
          void this.cancelAnalysis(abortController, context);
        });
        try {
          if (!this.isLiveSession(context) || this.abortController !== abortController) {
            throw new KtcProjectRenameStaleSessionError();
          }
          return await ktcAnalyzeProjectRename({
            reportId,
            root,
            sourceName,
            targetName,
            rules,
            ignorePatterns: resolveWorkspaceIgnorePatterns(root, this.ignoreSources),
            useBuiltInIgnore: this.ignoreSources.builtInIgnoreEnabled,
            signal: abortController.signal,
            onProgress: (scanProgress) => {
              if (!this.isLiveSession(context) || this.abortController !== abortController) return;
              this.state = { ...this.state, progress: scanProgress };
              progress.report({ message: `已扫描 ${scanProgress.scannedFiles} 个文件` });
              void this.postState(context);
            },
          });
        } finally {
          cancellation.dispose();
        }
      });
      if (!this.isLiveSession(context) || this.abortController !== abortController) return;
      if (abortController.signal.aborted) throw new KtcProjectRenameCancelledError();
      // rememberProjectPlan persists user state. It must never be reached by a
      // handler whose Editor session was disposed while analysis was awaiting.
      if (!this.isLiveSession(context)) return;
      const history = verifyingAfterApply
        ? this.host.historySnapshot(root)
        : await this.host.rememberProjectPlan(root, {
            sourceName,
            targetName,
            sourcePrefix,
            targetPrefix,
            rules,
          });
      // History persistence is asynchronous. The View may be cancelled, closed,
      // or reopened for another task while it is in flight; never let that stale
      // completion publish its report into the replacement task.
      if (!this.isLiveSession(context) || this.abortController !== abortController) return;
      if (abortController.signal.aborted) throw new KtcProjectRenameCancelledError();
      this.report = report;
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
      if (error instanceof KtcProjectRenameStaleSessionError) return;
      if (!this.isLiveSession(context) || this.abortController !== abortController) return;
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
    await this.postState(context);
  }

  private async applyReport(
    reportId: number,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context)) return;
    const report = this.report;
    if (!report || report.reportId !== reportId || this.abortController || this.state.status === "applying") return;
    if (report.stats.truncated) {
      await this.blockApply("分析结果达到安全上限，不能写盘；请缩小目录或规则范围后重新分析。", context);
      return;
    }
    if (report.workspaceReport.summary.errors > 0) {
      await this.blockApply("报告中存在路径冲突或错误，不能写盘；请先修正规则并重新分析。", context);
      return;
    }
    if (report.workspaceReport.hits.length === 0) {
      await this.blockApply("当前报告没有可执行的改名项。", context);
      return;
    }
    let preview;
    try {
      preview = this.host.preview(report);
    } catch (error) {
      await this.blockApply(`执行前预检失败：${ktcErrorMessage(error)}`, context);
      return;
    }
    if (preview.summary.errors > 0) {
      await this.blockApply("执行前预检发现路径冲突；没有修改任何内容，请重新分析。", context);
      return;
    }
    const drift = ktcProjectRenamePreviewDrift(report, preview);
    if (drift) {
      await this.blockApply(`${drift} 没有修改任何内容，请重新分析。`, context);
      return;
    }
    const gitState = await this.host.gitState(report.root);
    if (!this.isLiveReport(context, report)) return;
    if (gitState === "dirty") {
      await this.blockApply("Git 工作区存在未提交或未跟踪改动；为保证可恢复性，本次写盘已阻止。请先提交、暂存到其他位置或清理后重新分析。", context);
      return;
    }
    if (gitState === "unavailable") {
      await this.blockApply("无法可靠检查 Git 工作区状态；为保证可恢复性，本次写盘已阻止。请确认 Git 可用后重新分析。", context);
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
    if (!this.isLiveReport(context, report)) return;
    this.setWritePhase(context, "apply-confirmed");
    this.state = {
      ...this.state,
      status: "applying",
      message: "正在执行冻结报告中的精确改名；请勿同时修改该目录。",
      completion: undefined,
    };
    await this.postState(context);
    if (!this.isLiveReport(context, report)) return;
    let applied;
    try {
      applied = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "KT Auto Code：执行项目改名",
        cancellable: false,
      }, async () => {
        await new Promise<void>((resolveYield) => setImmediate(resolveYield));
        // This is the final yield before the destructive host call. A disposed
        // or replaced Editor session must not be allowed to commit its report.
        if (!this.isLiveReport(context, report)) throw new KtcProjectRenameStaleSessionError();
        this.setWritePhase(context, "apply-writing");
        return this.host.apply(report);
      });
    } catch (error) {
      if (error instanceof KtcProjectRenameStaleSessionError || !this.isLiveSession(context)) return;
      this.clearWritePhase(context);
      this.state = {
        ...this.state,
        status: "error",
        message: `执行改名失败：${ktcErrorMessage(error)}。请立即通过 Git diff 检查已发生的修改。`,
      };
      await this.postState(context);
      return;
    }
    if (!this.isLiveReport(context, report)) return;
    if (!applied.applied || applied.summary.errors > 0) {
      this.clearWritePhase(context);
      this.state = {
        ...this.state,
        status: "error",
        message: `改名执行未全部成功：${applied.summary.errors} 项错误。请通过 Git diff 检查，不要直接结束任务。`,
      };
      await this.postState(context);
      return;
    }
    this.setWritePhase(context, "verify-after-apply");
    await this.analyze(
      report.sourceName,
      report.targetName,
      this.state.sourcePrefix,
      this.state.targetPrefix,
      report.rules,
      true,
      context,
    );
    if (!this.isLiveSession(context)) return;
    const remaining = this.report;
    if (!remaining) {
      this.clearWritePhase(context);
      return;
    }
    const completion = ktcProjectRenameCompletionAfterApply(preview, applied, remaining);
    this.state = {
      ...this.state,
      completion,
      message: completion.message,
      gitCompareAvailable: gitState === "clean",
    };
    this.clearWritePhase(context);
    await this.postState(context);
  }

  private async blockApply(message: string, context: KtcProjectRenameSessionContext): Promise<void> {
    if (!this.isLiveSession(context)) return;
    this.state = { ...this.state, status: "error", message };
    await this.postState(context);
    if (!this.isLiveSession(context)) return;
    void vscode.window.showWarningMessage(message);
  }

  private finishTask(context: KtcProjectRenameSessionContext): void {
    if (!this.isLiveSession(context)) return;
    if (!this.state.completion?.canFinish) {
      void vscode.window.showWarningMessage("尚未达到任务结束门禁；请先完成写盘或重新分析剩余命中。");
      return;
    }
    const message = this.state.completion.targetReached
      ? "项目改名任务已达到目标并结束。"
      : "本次冻结计划已全部完成，任务已按人工结束条件关闭。";
    void vscode.window.showInformationMessage(message);
    context.panel.dispose();
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

  private async renameRoot(
    reportId: number,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context)) return;
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
    if (!this.isLiveReport(context, report)) return;
    const previousState = this.state;
    this.setWritePhase(context, "rename-confirmed");
    this.state = { ...this.state, status: "applying", message: "正在重命名仓库根目录…" };
    await this.postState(context);
    if (!this.isLiveReport(context, report)) return;
    try {
      // renameRoot performs filesystem writes after its own asynchronous safety
      // probes, so guard the session immediately before entering that host call.
      this.setWritePhase(context, "rename-writing");
      await this.host.renameRoot(plan.sourcePath, plan.destinationPath);
      if (!this.isLiveReport(context, report)) return;
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
      this.clearWritePhase(context);
      void vscode.window.showInformationMessage(`仓库根目录已重命名为：${report.rootSuggestion.suggestedName}`);
    } catch (error) {
      if (!this.isLiveSession(context)) return;
      this.clearWritePhase(context);
      this.state = {
        ...previousState,
        status: "error",
        message: `仓库根目录改名失败：${ktcErrorMessage(error)}`,
      };
    }
    await this.postState(context);
  }

  private async openResult(
    reportId: number,
    rowId: string,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context)) return;
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
    if (!this.isLiveSession(context)) return;
    if (!opened) void vscode.window.showWarningMessage("无法打开工作区之外的分析结果。");
  }

  private async previewFirstDiff(
    reportId: number,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context)) return;
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
    if (!this.isLiveReport(context, report)) return;
    if (selected) await this.previewTextDiff(reportId, selected.rowId, context);
  }

  private async previewTextDiff(
    reportId: number,
    rowId: string,
    context: KtcProjectRenameSessionContext,
  ): Promise<void> {
    if (!this.isLiveSession(context)) return;
    const report = this.report;
    if (!report || report.reportId !== reportId) return;
    try {
      await this.host.openTextDiff(report, rowId);
    } catch (error) {
      if (!this.isLiveSession(context)) return;
      void vscode.window.showWarningMessage(`无法预览写盘前差异：${ktcErrorMessage(error)}`);
    }
  }

  private closePanel(panel: vscode.WebviewPanel): void {
    if (this.panel !== panel) return;
    this.abortController?.abort();
    this.abortController = undefined;
    this.normalizeStateForDisposedSession();
    this.panel = undefined;
    this.report = undefined;
    this.companionReady = false;
    this.controllerEpoch += 1;
    this.writeOperation = undefined;
    const session = this.companionSession;
    if (!session || session.lifecycle === "disposed") return;
    this.companionSession = {
      ...session,
      revision: session.revision + 1,
      lifecycle: "disposed",
    };
    this.emitCompanionEvent("disposed");
  }

  private normalizeStateForDisposedSession(): void {
    if (this.state.status === "running") {
      this.state = {
        ...this.state,
        status: "cancelled",
        message: "项目改名分析已随 View 关闭而取消；只读分析没有修改任何文件。",
        progress: undefined,
        report: undefined,
        completion: undefined,
        gitCompareAvailable: false,
      };
      return;
    }
    if (this.state.status !== "applying") return;

    const phase = this.writeOperation?.epoch === this.controllerEpoch
      ? this.writeOperation.phase
      : undefined;
    const beforeWrite = phase === "apply-confirmed" || phase === "rename-confirmed";
    const verifying = phase === "verify-after-apply";
    this.state = {
      ...this.state,
      status: beforeWrite ? "cancelled" : "error",
      message: beforeWrite
        ? phase === "rename-confirmed"
          ? "View 已关闭，仓库根目录改名尚未开始；没有修改目录。"
          : "View 已关闭，项目改名写盘尚未开始；没有修改文件。"
        : verifying
          ? "项目改名已经写盘，但完成门禁复扫因 View 关闭而中断；请通过 Git diff 检查并重新分析。"
          : phase === "rename-writing"
            ? "仓库根目录改名执行期间 View 被关闭，最终结果未知；请检查磁盘目录后再继续。"
            : "项目改名写盘期间 View 被关闭，最终结果未知；请立即通过 Git diff 检查。",
      progress: undefined,
      completion: undefined,
    };
  }

  private updateCompanionLifecycle(
    lifecycle: Exclude<KtcProjectRenameCompanionLifecycle, "disposed">,
    reason: Extract<KtcProjectRenameCompanionEventReason, "shown" | "view-state">,
  ): void {
    const session = this.companionSession;
    if (!session || session.lifecycle === "disposed") return;
    this.companionSession = { ...session, lifecycle };
    this.emitCompanionEvent(reason);
  }

  private companionSnapshot(): KtcProjectRenameCompanionSnapshot | undefined {
    const session = this.companionSession;
    if (!session) return undefined;
    const report = this.state.report;
    const liveReady = this.companionReady && session.lifecycle !== "disposed";
    const gitCompareAvailable = Boolean(liveReady && this.state.gitCompareAvailable && this.state.completion?.appliedItems);
    return {
      toolId: "projectRename",
      panelId: session.panelId,
      sessionId: session.sessionId,
      revision: session.revision,
      lifecycle: session.lifecycle,
      title: "项目改名",
      status: ktcProjectRenameCompanionStatus(this.state.status),
      projectStatus: this.state.status,
      message: ktcEditorPrimaryCompanionStatusMessage(
        ktcProjectRenameCompanionStatus(this.state.status),
        this.state.message,
      ),
      ready: liveReady,
      summary: this.companionSummary(),
      enabledRuleCount: this.state.rules.filter((rule) => rule.enabled).length,
      ...(this.state.progress ? { progress: { ...this.state.progress } } : {}),
      ...(report ? {
        report: {
          reportId: report.reportId,
          totalRows: report.page.totalRows,
          replacements: report.summary.replacements,
          highRisk: report.riskSummary.high,
          mediumRisk: report.riskSummary.medium,
          lowRisk: report.riskSummary.low,
        },
      } : {}),
      actions: [
        { id: "reveal", label: "回到 View", enabled: liveReady },
        {
          id: "cancel",
          label: "取消分析",
          enabled: liveReady && this.state.status === "running",
          ...(liveReady && this.state.status === "running" ? {} : { disabledReason: "当前没有可取消的只读分析。" }),
        },
        {
          id: "openGitChanges",
          label: "Git 对比",
          enabled: gitCompareAvailable,
          ...(gitCompareAvailable ? {} : { disabledReason: "成功写盘且 Git 基线干净后可用。" }),
        },
      ],
    };
  }

  private companionSummary(): readonly KtcEditorPrimaryCompanionSummaryItem[] {
    const summary: KtcEditorPrimaryCompanionSummaryItem[] = [];
    if (this.state.root) summary.push({ label: "目录", value: this.state.root });
    if (this.state.sourceName || this.state.targetName) {
      summary.push({ label: "改名", value: `${this.state.sourceName || "—"} → ${this.state.targetName || "—"}` });
    }
    summary.push({ label: "规则", value: `${this.state.rules.filter((rule) => rule.enabled).length} 条启用` });
    if (this.state.progress) {
      summary.push({
        label: "扫描",
        value: `${this.state.progress.scannedFiles} 文件 · ${this.state.progress.matchedItems} 命中`,
      });
    } else if (this.state.report) {
      const risk = this.state.report.riskSummary;
      summary.push({
        label: "结果",
        value: `${this.state.report.page.totalRows} 项 · ${this.state.report.summary.replacements} 处 · 风险 ${risk.high}/${risk.medium}/${risk.low}`,
      });
    }
    return summary;
  }

  private emitCompanionEvent(reason: KtcProjectRenameCompanionEventReason): void {
    const snapshot = this.companionSnapshot();
    if (!snapshot) return;
    this.callbacks.onCompanionEvent?.({ reason, snapshot });
  }

  private validateCompanionActionRequest(
    request: KtcProjectRenameCompanionActionRequest,
  ): KtcProjectRenameCompanionActionRejectionReason | undefined {
    const session = this.companionSession;
    if (!session) return "no-open-session";
    if (request.toolId !== "projectRename") return "tool-mismatch";
    if (session.lifecycle === "disposed") return "disposed";
    if (!this.panel) return "no-open-session";
    if (request.panelId !== session.panelId) return "panel-mismatch";
    if (request.sessionId !== session.sessionId) return "session-mismatch";
    if (request.revision !== session.revision) return "revision-mismatch";
    return undefined;
  }

  private currentSessionContext(): KtcProjectRenameSessionContext | undefined {
    const panel = this.panel;
    const session = this.companionSession;
    if (!panel || !session || session.lifecycle === "disposed") return undefined;
    return {
      panel,
      epoch: this.controllerEpoch,
      panelId: session.panelId,
      sessionId: session.sessionId,
    };
  }

  private isLiveSession(context: KtcProjectRenameSessionContext): boolean {
    const session = this.companionSession;
    if (!session) return false;
    return this.controllerEpoch === context.epoch
      && this.panel === context.panel
      && session.lifecycle !== "disposed"
      && session.panelId === context.panelId
      && session.sessionId === context.sessionId;
  }

  private isLiveReport(
    context: KtcProjectRenameSessionContext,
    report: KtcProjectRenameAnalysisReport,
  ): boolean {
    return this.isLiveSession(context) && this.report === report;
  }

  private setWritePhase(context: KtcProjectRenameSessionContext, phase: KtcProjectRenameWritePhase): void {
    if (!this.isLiveSession(context)) return;
    this.writeOperation = { epoch: context.epoch, phase };
  }

  private clearWritePhase(context: KtcProjectRenameSessionContext): void {
    if (this.writeOperation?.epoch === context.epoch) this.writeOperation = undefined;
  }

  private postState(context?: KtcProjectRenameSessionContext): Promise<void> {
    if (context && !this.isLiveSession(context)) return Promise.resolve();
    const panel = this.panel;
    const state = this.state;
    const session = this.companionSession;
    if (panel && session && session.lifecycle !== "disposed") {
      this.companionSession = { ...session, revision: session.revision + 1 };
      this.emitCompanionEvent("state");
    }
    this.postStateQueue = this.postStateQueue
      .catch(() => undefined)
      .then(async () => {
        if (this.panel !== panel) return;
        await panel?.webview.postMessage({ type: "state", state });
      });
    return this.postStateQueue;
  }
}

function ktcProjectRenamePanelLifecycle(panel: vscode.WebviewPanel): Exclude<KtcProjectRenameCompanionLifecycle, "disposed"> {
  if (panel.active) return "active";
  if (panel.visible) return "visible";
  return "open-inactive";
}

function ktcProjectRenameCompanionStatus(
  status: KtcProjectRenameViewState["status"],
): KtcEditorPrimaryCompanionStatus {
  if (status === "running" || status === "applying") return "running";
  if (status === "done") return "done";
  if (status === "error") return "error";
  return "idle";
}

function ktcParseProjectRenameOpenDraft(value: unknown): KtcProjectRenameOpenDraft {
  if (typeof value === "string") {
    return { ...(value.trim() ? { root: value } : {}), rules: [], ignoreSources: KTC_DEFAULT_PROJECT_RENAME_IGNORE_SOURCES };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { rules: [], ignoreSources: KTC_DEFAULT_PROJECT_RENAME_IGNORE_SOURCES };
  }
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
  const rawIgnoreSources = record.ignoreSources && typeof record.ignoreSources === "object" && !Array.isArray(record.ignoreSources)
    ? record.ignoreSources as Record<string, unknown>
    : {};
  const ignoreSources = {
    builtInIgnoreEnabled: rawIgnoreSources.builtInIgnoreEnabled !== false,
    gitIgnoreEnabled: rawIgnoreSources.gitIgnoreEnabled !== false,
    customIgnoreEnabled: rawIgnoreSources.customIgnoreEnabled === true,
  };
  return {
    ...(root ? { root } : {}),
    ...(sourceName === undefined ? {} : { sourceName }),
    ...(targetName === undefined ? {} : { targetName }),
    rules,
    ignoreSources,
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
