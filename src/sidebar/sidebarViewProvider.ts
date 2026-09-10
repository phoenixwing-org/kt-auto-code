import * as vscode from "vscode";
import { existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { logOutput } from "../output.js";
import {
  getNavigationDescriptor,
  getNavigationDescriptors,
  getTool,
  getTools,
} from "../tools/registry.js";
import {
  KTC_TOOL_REGISTRATION_BY_ID,
  ktcRequireToolRegistration,
} from "../tools/toolRegistrationCatalog.js";
import type {
  KtcRecentWorkingDirectories,
  KtcWorkingContext,
  KtcWelcomeExtensionSummary,
  ToolRunContext,
  ToolSummary,
  ToolUiState,
  KtcCodeAssistantFeatureId,
  KtcCodeAssistantTreeUiState,
  WebviewInboundMessage,
} from "../tools/types.js";
import { setHeaderAsciiRunContextFactory } from "../tools/headerAscii/index.js";
import { setEncodingFixRunContextFactory } from "../tools/encodingFix/index.js";
import { getEncodingFixOptions } from "../tools/encodingFix/options.js";
import { setCodeRenameRunContextFactory } from "../tools/codeRename/index.js";
import { setUuidReplaceRunContextFactory } from "../tools/uuidReplace/index.js";
import { setCaaDialogRunContextFactory } from "../tools/caaDialog/index.js";
import { setReorderMembersRunContextFactory } from "../tools/reorderMembers/index.js";
import { setIgnoreSettingsCommandRunner } from "../tools/ignoreSettings/index.js";
import { notifyCodegenIgnorePolicyChanged, setCodegenRunContextFactory } from "../tools/codegen/index.js";
import { refreshCodeAssistantIgnorePolicy, setCodeAssistantRunContextFactory, updateCodeAssistantIgnoreSources } from "../tools/codeAssistant/index.js";
import { getPreserveGbk, getStripBom } from "../tools/headerAscii/options.js";
import { getFileScope, setFileScopeOption, type ScopeOptionKey } from "../scopeOptions.js";
import { getWorkspaceLabel, getWorkspaceRoot } from "../workspace.js";
import { getPanelHtml, postToWebview } from "./panelHtml.js";
import type { ToolOptionsState } from "../tools/types.js";
import {
  ktcDefaultIgnoreGroupIds,
  ktcIgnoreController,
  ktcIsIgnoreMessage,
  type KtcIgnoreMessage,
} from "../ignoreController.js";
import { findNearestGitIgnore } from "../ignoreConfig.js";
import {
  KtcRecentWorkingDirectoryStore,
  KtcRecentWorkspaceDirectoryStore,
} from "../recentWorkingDirectories.js";
import { ktcClassifyWorkingDirectory } from "../searchReplaceLocation.js";
import { ktcListSearchReplaceDirectoryOptions } from "../searchReplaceDirectoryOptions.js";
import { ktcIsPathInsideWorkspace } from "../core/workspace/workspacePath.js";
import { ktcActivateResultAccordion } from "../workbench/resultAccordion.js";
import {
  ktcActivateEditorPrimaryTool,
  ktcCloseEditorPrimaryTool,
  ktcCreateEditorPrimaryCompanionState,
  ktcRegisterEditorPrimaryCompanion,
  ktcResolveEditorPrimaryCompanionRoute,
  ktcUpdateEditorPrimaryCompanion,
  ktcValidateEditorPrimaryCompanionRoute,
  type KtcEditorPrimaryActivationSource,
  type KtcEditorPrimaryCompanionState,
} from "./editorPrimaryCompanionModel.js";
import {
  ktcCloseOtherToolBlocks,
  ktcNormalizeToolBlockHistory,
} from "./toolBlockHistory.js";
import type {
  KtcEditorPrimaryCompanionSnapshot,
  KtcEditorPrimaryCompanionToolId,
} from "../core/editorPrimaryCompanionContracts.js";
import {
  ktcMoveRibbonTool,
  ktcNormalizeRibbonLayout,
  ktcResetCodeRibbonLayout,
  ktcToggleRibbonToolPin,
  type KtcRibbonLayoutV1,
  type KtcRibbonLayoutTool,
} from "./ribbonLayout.js";
import type { KtcSidebarRuntimeDiagnostics } from "../runtimeDiagnostics.js";
import {
  ktcActivateModule,
  ktcCreateModuleState,
  ktcPersistedModuleState,
  ktcToggleModule,
  type KtcModuleId,
  type KtcModuleState,
  type KtcPersistedModuleState,
} from "../modules/moduleState.js";
import {
  ktcReadModuleContribution,
  type KtcModuleContribution,
  type KtcModuleToolDefinition,
} from "../modules/moduleTools.js";
import type {
  KtcModuleBlockProvider,
  KtcModuleBlockRegistration,
  KtcToolBlockState,
} from "../core/moduleShellContract.js";

const MODULE_STATE_KEY = "ktAutoCode.modules.v1";
const DIRECTORY_VISIBILITY_STATE_KEY = "ktAutoCode.sidebar.directoryVisible.v1";
const DIRECTORY_VISIBILITY_CONTEXT_KEY = "ktAutoCode.modulePanel.directoryVisible";
const EDITOR_COMPANION_TOMBSTONE_LIMIT_PER_TOOL = 4;
const EDITOR_COMPANION_RETIRED_SESSION_LIMIT_PER_TOOL = 8;
const RIBBON_LAYOUT_STATE_KEY = "ktAutoCode.ribbonLayout.v1";
const CODE_ASSISTANT_TREE_UI_STATE_KEY = "ktAutoCode.codeAssistant.treeUi.v1";
const WORKING_DIRECTORY_STATE_KEY = "ktAutoCode.workingContext.directory.v1";
const BUILT_IN_IGNORE_STATE_KEY = "ktAutoCode.workingContext.builtInIgnoreEnabled.v1";
const GIT_IGNORE_STATE_KEY = "ktAutoCode.workingContext.gitIgnoreEnabled.v1";
const CUSTOM_IGNORE_STATE_KEY = "ktAutoCode.workingContext.customIgnoreEnabled.v1";
const IGNORE_ENABLED_STATE_KEY = "ktAutoCode.workingContext.ignoreEnabled.v1";
const PLUGIN_IGNORE_STATE_KEY = "ktAutoCode.workingContext.pluginIgnoreEnabled.v1";
const MODULE_VIEW_TITLE = "KT Auto Code";
const DEFAULT_CODE_ASSISTANT_TREE_UI_STATE: KtcCodeAssistantTreeUiState = Object.freeze({
  navigatorMode: "outline",
  showLabels: true,
  treeExpanded: true,
  cppOrganizeExpanded: true,
  fileToolsExpanded: true,
  caaExpanded: true,
  reorderActionsExpanded: true,
  reorderResultsExpanded: true,
});
const REPOSITORY_URL = "https://gitee.com/phoenixwing/kt-auto-code";
const QUICK_START_URL = `${REPOSITORY_URL}/blob/develop/README.md#%E4%BD%BF%E7%94%A8`;

interface KtcWorkingDirectoryQuickPickItem extends vscode.QuickPickItem {
  readonly directory: string;
}

const WELCOME_EXTENSIONS = [
  { id: "kuntai.kt-auto-code", title: "KT Auto Code", moduleId: "code" },
  { id: "kuntai.kt-auto-cad", title: "KT Auto CAD", moduleId: "cad" },
] as const;

export function ktcWelcomeExtensionSummaries(
  extensions: readonly { readonly id: string; readonly packageJSON?: unknown }[],
): KtcWelcomeExtensionSummary[] {
  const installed = new Map(extensions.map((extension) => [extension.id.toLowerCase(), extension]));
  return WELCOME_EXTENSIONS.map((definition) => {
    const extension = installed.get(definition.id);
    const manifest = extension?.packageJSON;
    const version = manifest && typeof manifest === "object" && "version" in manifest
      && typeof manifest.version === "string" && manifest.version.trim()
      ? manifest.version.trim()
      : undefined;
    return {
      ...definition,
      installed: !!extension,
      ...(version ? { version } : {}),
    };
  });
}

interface InstalledModuleContribution {
  readonly extensionUri: vscode.Uri;
  readonly contribution: KtcModuleContribution;
}

interface KtcInstalledToolReference {
  readonly id: string;
  readonly moduleId: KtcModuleId;
}

interface KtcInstalledToolReconciliation {
  readonly historyChanged: boolean;
  readonly moduleStateChanged: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeCodeAssistantTreeUiState(value: unknown): KtcCodeAssistantTreeUiState {
  if (!value || typeof value !== "object") return { ...DEFAULT_CODE_ASSISTANT_TREE_UI_STATE };
  const candidate = value as Partial<KtcCodeAssistantTreeUiState>;
  return {
    navigatorMode: candidate.navigatorMode === "grid" ? "grid" : "outline",
    showLabels: candidate.showLabels !== false,
    treeExpanded: candidate.treeExpanded !== false,
    cppOrganizeExpanded: candidate.cppOrganizeExpanded !== false,
    fileToolsExpanded: candidate.fileToolsExpanded !== false,
    caaExpanded: candidate.caaExpanded !== false,
    reorderActionsExpanded: candidate.reorderActionsExpanded !== false,
    reorderResultsExpanded: candidate.reorderResultsExpanded !== false,
  };
}

function isCodeAssistantFeatureId(value: string): value is KtcCodeAssistantFeatureId {
  return value === "packageIncludes"
    || value === "autoBuild"
    || value === "reorderMembers"
    || value === "headerAscii"
    || value === "encodingFix"
    || value === "uuidReplace"
    || value === "caaDialog";
}

export function ktcRunSignalContractError(
  message: Extract<WebviewInboundMessage, { type: "run" }>,
  actions: readonly string[] | undefined,
): string | undefined {
  if (!actions) return `工具“${message.toolId}”未声明可接收 run 信号。`;
  if (!actions.includes(message.action)) {
    return `工具“${message.toolId}”不支持动作“${message.action}”；允许：${actions.join("、")}。`;
  }
  return undefined;
}

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly moduleViewType = "ktAutoCode.modulePanel";

  private moduleView?: vscode.WebviewView;
  private activeToolId = "headerAscii";
  private directoryVisible: boolean;
  private codeAssistantFeatureId: KtcCodeAssistantFeatureId | undefined;
  private codeAssistantTreeUiState: KtcCodeAssistantTreeUiState;
  private openToolIds: string[] = [];
  private editorCompanionState: KtcEditorPrimaryCompanionState = ktcCreateEditorPrimaryCompanionState();
  private readonly editorCompanionSnapshots = new Map<string, KtcEditorPrimaryCompanionSnapshot>();
  private readonly retiredEditorCompanionSessions = new Map<KtcEditorPrimaryCompanionToolId, string[]>();
  private editorCompanionQueue: Promise<void> = Promise.resolve();
  private toolStates = new Map<string, ToolUiState>();
  private readonly recentExternalDirectories: KtcRecentWorkingDirectoryStore;
  private readonly recentWorkspaceDirectories: KtcRecentWorkspaceDirectoryStore;
  private ribbonLayout?: KtcRibbonLayoutV1;
  private moduleState: KtcModuleState;
  private moduleStateSyncQueue: Promise<void> = Promise.resolve();
  private modulePanelContextSyncQueue: Promise<void> = Promise.resolve();
  private directoryVisibilitySyncQueue: Promise<void> = Promise.resolve();
  private ignoreOperationQueue: Promise<void> = Promise.resolve();
  private ignoreContextRoot: string | undefined;
  private ignorePolicyFingerprint = "";
  private readonly moduleBlockProviders = new Map<KtcModuleId, KtcModuleBlockProvider>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
  ) {
    this.directoryVisible = globalState.get<boolean>(DIRECTORY_VISIBILITY_STATE_KEY, true) !== false;
    const installed = this.getInstalledModuleIds();
    this.moduleState = ktcCreateModuleState(
      installed,
      globalState.get<KtcPersistedModuleState>(MODULE_STATE_KEY),
    );
    this.codeAssistantTreeUiState = normalizeCodeAssistantTreeUiState(
      globalState.get<unknown>(CODE_ASSISTANT_TREE_UI_STATE_KEY),
    );
    this.recentExternalDirectories = new KtcRecentWorkingDirectoryStore(globalState);
    this.recentWorkspaceDirectories = new KtcRecentWorkspaceDirectoryStore(workspaceState);
    this.ignoreContextRoot = this.getWorkingContext().resolvedDirectory;
    setHeaderAsciiRunContextFactory(() => this.createRunContext("headerAscii"));
    setEncodingFixRunContextFactory(() => this.createRunContext("encodingFix"));
    setCodeRenameRunContextFactory(() => this.createRunContext("codeRename"));
    setUuidReplaceRunContextFactory(() => this.createRunContext("uuidReplace"));
    setCaaDialogRunContextFactory(() => this.createRunContext("caaDialog"));
    setReorderMembersRunContextFactory(() => this.createRunContext("reorderMembers"));
    setIgnoreSettingsCommandRunner((message) => this.enqueueIgnoreMessage(message));
    setCodegenRunContextFactory(
      () => this.createRunContext("codegen"),
      () => this.activateCodegenEditorPrimary(),
    );
    setCodeAssistantRunContextFactory((toolId) => this.createRunContext(toolId));
  }

  async initializeModuleState(): Promise<void> {
    await this.syncModuleState();
    await this.syncDirectoryVisibilityContext(this.directoryVisible);
  }

  /** Changes only the Directory row presentation; tool and working state stay authoritative. */
  setDirectoryVisible(visible: boolean): Promise<void> {
    this.directoryVisible = visible;
    const task = this.directoryVisibilitySyncQueue.then(async () => {
      await this.globalState.update(DIRECTORY_VISIBILITY_STATE_KEY, visible);
      await vscode.commands.executeCommand("setContext", DIRECTORY_VISIBILITY_CONTEXT_KEY, visible);
      this.postToViews({ type: "directoryVisibility", visible });
    });
    this.directoryVisibilitySyncQueue = task.catch(() => undefined);
    return task;
  }

  private syncDirectoryVisibilityContext(visible: boolean): Promise<void> {
    const task = this.directoryVisibilitySyncQueue.then(async () => {
      await vscode.commands.executeCommand("setContext", DIRECTORY_VISIBILITY_CONTEXT_KEY, visible);
    });
    this.directoryVisibilitySyncQueue = task.catch(() => undefined);
    return task;
  }

  async refreshInstalledModules(): Promise<void> {
    const contributions = this.getInstalledModuleContributions();
    const reconciliation = this.reconcileInstalledToolState(contributions);
    await this.syncInstalledToolReconciliation(reconciliation);
    if (this.moduleView) {
      this.moduleView.webview.options = {
        ...this.moduleView.webview.options,
        enableScripts: true,
        localResourceRoots: this.getWebviewLocalResourceRoots(),
      };
      await this.sendInit(this.moduleView);
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.moduleView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: this.getWebviewLocalResourceRoots(),
    };
    webviewView.webview.html = getPanelHtml(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage((message: WebviewInboundMessage) => {
      void this.onMessage(message, webviewView).catch((error) => {
        const text = error instanceof Error ? error.message : String(error);
        const toolId = "toolId" in message && typeof message.toolId === "string"
          ? message.toolId
          : message.type === "openCodeAssistantFeature"
            ? "codeAssistant"
            : undefined;
        logOutput(`[Primary][${message.type}][ERROR] ${text}`);
        if (toolId && getTool(toolId)) {
          this.setToolState(toolId, { status: "error", message: `操作失败：${text}` }, webviewView);
        }
      });
    });
    webviewView.onDidDispose(() => {
      if (this.moduleView !== webviewView) return;
      this.moduleView = undefined;
      void this.invalidateRunCleanupSession("Webview 已销毁");
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) ktcActivateResultAccordion(SidebarViewProvider.moduleViewType);
    });
  }

  refreshWorkspaceLabel(): void {
    this.postToViews({ type: "workspace", label: getWorkspaceLabel() });
    this.postWorkingContext();
    this.refreshIgnoreConfig();
  }

  refreshIgnoreConfig(): void {
    refreshCodeAssistantIgnorePolicy();
    this.postToViews({
      type: "ignoreConfig",
      ignoreConfig: ktcIgnoreController.snapshot(this.getWorkingContext().resolvedDirectory),
    });
  }

  refreshToolOptions(toolId = "headerAscii"): void {
    this.postToViews({ type: "options", toolId, options: this.getToolOptions(toolId) });
    this.postToViews({ type: "scope", scope: getFileScope() });
  }

  invalidateEncodingFixResults(): void {
    this.setToolState("encodingFix", {
      status: "idle",
      message: "项目编码目标已更新，请重新预检。",
      encodingResults: [],
      scanned: 0,
      issueFiles: 0,
      fixedFiles: 0,
    });
  }

  refreshScope(): void {
    this.postToViews({ type: "scope", scope: getFileScope() });
  }

  refreshSidebarStyle(): void {
    this.postToViews({ type: "sidebarStyle", style: this.getSidebarStyle() });
  }

  openRibbonCustomization(): void {
    this.moduleView?.show(false);
    this.postToViews({ type: "openRibbonCustomization" });
  }

  async requestSearchReplacePreview(): Promise<void> {
    await this.showTool("codeRename");
    postToWebview(this.moduleView, { type: "requestSearchReplacePreview" });
  }

  /** Opens the tool interface block; results are rendered in the same block. */
  async showTool(
    toolId: string,
    activationSource: KtcEditorPrimaryActivationSource = "command",
  ): Promise<void> {
    const requestedToolId = toolId;
    if (getNavigationDescriptor(requestedToolId)) {
      await this.showNavigationGroup(requestedToolId);
      return;
    }
    const requestedTool = getTool(requestedToolId);
    if (!requestedTool) return;
    const navigationCollapsed = await this.collapseUnrelatedNavigationGroup(requestedToolId);
    const legacyFeatureChanged = this.codeAssistantFeatureId !== undefined;
    this.codeAssistantFeatureId = undefined;
    if (this.isToolBlockVisible(requestedToolId)) {
      if ((legacyFeatureChanged || navigationCollapsed) && this.moduleView) await this.sendInit(this.moduleView);
      this.postToViews({ type: "revealToolSurface", toolId: requestedToolId });
      if (requestedToolId === "environmentSettings") await requestedTool.runAction("refresh", this.createRunContext(requestedToolId));
      if (requestedToolId === "caaDialog") await requestedTool.runAction("checkConnection", this.createRunContext(requestedToolId));
      if (requestedTool.onDidShow) await requestedTool.onDidShow(this.createRunContext(requestedToolId));
      return;
    }
    await this.activateModule("code");
    this.activateToolHistory(requestedToolId, activationSource);
    ktcActivateResultAccordion(SidebarViewProvider.moduleViewType);
    await this.setModulePanelContext(true, requestedToolId);
    await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
    if (this.moduleView) {
      this.moduleView.title = MODULE_VIEW_TITLE;
      await this.sendInit(this.moduleView);
      if (!this.moduleView.visible) this.moduleView.show(false);
    } else {
      try { await vscode.commands.executeCommand(`${SidebarViewProvider.moduleViewType}.focus`); } catch { /* view resolves lazily */ }
    }
    if (requestedToolId === "environmentSettings") await requestedTool.runAction("refresh", this.createRunContext(requestedToolId));
    if (requestedToolId === "caaDialog") await requestedTool.runAction("checkConnection", this.createRunContext(requestedToolId));
    if (requestedToolId === "codegen") await requestedTool.runAction("activate", this.createRunContext(requestedToolId));
    if (requestedTool.onDidShow) await requestedTool.onDidShow(this.createRunContext(requestedToolId));
  }

  /**
   * Opens a navigation Group without creating a logical Tool surface. A legacy
   * command may still address the Group id; in that case the Group expands and
   * an already-open MRU child is restored through the projection-only route.
   */
  private async showNavigationGroup(groupToolId: string): Promise<void> {
    if (groupToolId !== "codeAssistant" || !this.isGroupToolId(groupToolId)) return;
    if (!this.codeAssistantTreeUiState.treeExpanded) {
      this.codeAssistantTreeUiState = { ...this.codeAssistantTreeUiState, treeExpanded: true };
      await this.globalState.update(CODE_ASSISTANT_TREE_UI_STATE_KEY, this.codeAssistantTreeUiState);
    }
    const groupMruToolId = [...this.openToolIds]
      .reverse()
      .find((candidate) => (
        KTC_TOOL_REGISTRATION_BY_ID[candidate]?.groupId === groupToolId
        && !this.isGroupToolId(candidate)
      ));
    if (groupMruToolId) {
      await this.activateOpenTool(groupMruToolId);
      return;
    }
    await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
    if (this.moduleView) {
      this.moduleView.title = MODULE_VIEW_TITLE;
      await this.sendInit(this.moduleView);
      if (!this.moduleView.visible) this.moduleView.show(false);
    } else {
      try { await vscode.commands.executeCommand(`${SidebarViewProvider.moduleViewType}.focus`); } catch { /* view resolves lazily */ }
    }
  }

  /** A leaf outside the expanded Group hides its Navigator, never its open Tools or Editor tasks. */
  private async collapseUnrelatedNavigationGroup(toolId: string): Promise<boolean> {
    if (!this.codeAssistantTreeUiState.treeExpanded
      || KTC_TOOL_REGISTRATION_BY_ID[toolId]?.groupId === "codeAssistant") return false;
    this.codeAssistantTreeUiState = { ...this.codeAssistantTreeUiState, treeExpanded: false };
    await this.globalState.update(CODE_ASSISTANT_TREE_UI_STATE_KEY, this.codeAssistantTreeUiState);
    return true;
  }

  /** Activates a complex tool before its Editor opens, so the Editor keeps final focus. */
  async activateEditorCompanionTool(toolId: KtcEditorPrimaryCompanionToolId): Promise<void> {
    await this.showTool(toolId, "command");
  }

  /** Accepts only Host snapshots; Webview draft state never enters this channel. */
  updateEditorCompanion(snapshot: KtcEditorPrimaryCompanionSnapshot): Promise<void> {
    const operation = this.editorCompanionQueue.then(() => this.applyEditorCompanionSnapshot(snapshot));
    this.editorCompanionQueue = operation.catch(() => undefined);
    return operation;
  }

  private activateToolHistory(toolId: string, source: KtcEditorPrimaryActivationSource): void {
    this.editorCompanionState = ktcActivateEditorPrimaryTool(this.editorCompanionState, {
      toolId,
      source,
      preserveFocus: source === "editor",
    });
    this.openToolIds = [...this.editorCompanionState.openToolIds];
    this.activeToolId = this.editorCompanionState.activeToolId ?? toolId;
  }

  private async activateCodegenEditorPrimary(): Promise<void> {
    // Codegen has one Right per JSON, but a single Primary. Reactivation only
    // restores that projection; it must not scan, run onDidShow or close Editors.
    if (!getTool("codegen")) return;
    this.activateToolHistory("codegen", "editor");
    this.codeAssistantFeatureId = undefined;
    if (!await this.restoreToolBlock("codegen", true)
      || this.activeToolId !== "codegen" || !this.openToolIds.includes("codegen")) return;
    if (this.moduleView) {
      if (!this.moduleView.visible) this.moduleView.show(true);
    } else {
      // The contributed view may have been disposed while its JSON Editors
      // remained open. VS Code's view focus command supports preserveFocus.
      await vscode.commands.executeCommand(`${SidebarViewProvider.moduleViewType}.focus`, { preserveFocus: true });
    }
  }

  private async applyEditorCompanionSnapshot(
    snapshot: KtcEditorPrimaryCompanionSnapshot,
  ): Promise<void> {
    const knownSession = this.editorCompanionState.companions.find(({ panelId }) => panelId === snapshot.panelId);
    const sameSession = knownSession?.toolId === snapshot.toolId
      && knownSession.sessionId === snapshot.sessionId;
    if (snapshot.lifecycle === "disposed" && !sameSession) {
      logOutput(`[${snapshot.toolId}][Primary][WARN] 已忽略未登记 Editor 的 dispose 快照。`);
      return;
    }
    if (!sameSession && this.isRetiredEditorCompanionSession(snapshot)) {
      logOutput(`[${snapshot.toolId}][Primary][WARN] 已丢弃 retired Editor session 的迟到快照。`);
      return;
    }
    if (knownSession && !sameSession) {
      this.rememberRetiredEditorCompanionSession(knownSession.toolId, knownSession.panelId, knownSession.sessionId);
    }
    const transition = sameSession
      ? ktcUpdateEditorPrimaryCompanion(this.editorCompanionState, snapshot)
      : ktcRegisterEditorPrimaryCompanion(this.editorCompanionState, {
          ...snapshot,
          lifecycle: snapshot.lifecycle === "disposed" ? "open-inactive" : snapshot.lifecycle,
        });
    if (!transition.accepted) {
      logOutput(`[${snapshot.toolId}][Primary][WARN] 已丢弃 companion 快照：${transition.reason}。`);
      return;
    }

    this.editorCompanionState = transition.state;
    if (snapshot.lifecycle === "disposed") {
      this.editorCompanionSnapshots.delete(snapshot.panelId);
      this.rememberRetiredEditorCompanionSession(snapshot.toolId, snapshot.panelId, snapshot.sessionId);
    } else this.editorCompanionSnapshots.set(snapshot.panelId, snapshot);
    const projectedSnapshot = this.resolveEditorCompanionSnapshot(snapshot);
    if (projectedSnapshot) {
      this.setToolState(snapshot.toolId, {
        status: projectedSnapshot.status,
        message: projectedSnapshot.message,
        editorCompanion: projectedSnapshot,
      });
    }
    if (snapshot.lifecycle === "disposed") {
      this.pruneEditorCompanionTombstones(snapshot.toolId);
      // These three task-owned Right Views own the lifetime of their Primary.
      // Codegen's per-JSON Editors do not use this companion protocol.
      if (!ktcResolveEditorPrimaryCompanionRoute(this.editorCompanionState, snapshot.toolId)) {
        await this.closeToolBlock(snapshot.toolId, true);
        return;
      }
    }
    if (!transition.activation) return;

    await this.activateModule("code");
    this.openToolIds = [...transition.state.openToolIds];
    this.activeToolId = transition.state.activeToolId ?? snapshot.toolId;
    const navigationCollapsed = await this.collapseUnrelatedNavigationGroup(this.activeToolId);
    await this.setModulePanelContext(true, this.activeToolId);
    if (navigationCollapsed && this.moduleView) {
      await this.sendInit(this.moduleView);
      return;
    }
    this.postToViews({
      type: "openTools",
      activeToolId: this.activeToolId,
      openToolIds: this.openToolIds,
      codeAssistantFeature: this.codeAssistantFeatureId,
    });
  }

  /** Projects only the routed Editor into one Primary tool state. */
  private resolveEditorCompanionSnapshot(
    fallback: KtcEditorPrimaryCompanionSnapshot,
  ): KtcEditorPrimaryCompanionSnapshot | undefined {
    const route = ktcResolveEditorPrimaryCompanionRoute(this.editorCompanionState, fallback.toolId);
    if (!route) return fallback.lifecycle === "disposed"
      ? this.closedEditorCompanionSnapshot(fallback)
      : undefined;
    const snapshot = this.editorCompanionSnapshots.get(route.panelId);
    if (
      snapshot?.toolId === route.toolId
      && snapshot.sessionId === route.sessionId
      && snapshot.revision === route.revision
    ) return snapshot;
    return undefined;
  }

  private closedEditorCompanionSnapshot(
    snapshot: KtcEditorPrimaryCompanionSnapshot,
  ): KtcEditorPrimaryCompanionSnapshot {
    const failed = snapshot.status === "error";
    return {
      panelId: `${snapshot.toolId}-closed`,
      toolId: snapshot.toolId,
      sessionId: "closed",
      revision: snapshot.revision,
      lifecycle: "disposed",
      title: ktcRequireToolRegistration(snapshot.toolId).title,
      status: failed ? "error" : "idle",
      message: failed
        ? "右侧 View 已关闭；任务可能未完成，请检查结果后再从原入口启动。"
        : "右侧 View 已关闭；可从原入口启动新的任务。",
      ready: false,
      summary: [],
      actions: [],
    };
  }

  private pruneEditorCompanionTombstones(toolId: KtcEditorPrimaryCompanionToolId): void {
    const retained = new Set(this.editorCompanionState.companions
      .filter((session) => session.toolId === toolId && session.lifecycle === "disposed")
      .sort((left, right) => right.openedOrder - left.openedOrder)
      .slice(0, EDITOR_COMPANION_TOMBSTONE_LIMIT_PER_TOOL)
      .map((session) => session.panelId));
    this.editorCompanionState = {
      ...this.editorCompanionState,
      companions: this.editorCompanionState.companions.filter((session) => (
        session.toolId !== toolId
        || session.lifecycle !== "disposed"
        || retained.has(session.panelId)
      )),
    };
  }

  private rememberRetiredEditorCompanionSession(
    toolId: KtcEditorPrimaryCompanionToolId,
    panelId: string,
    sessionId: string,
  ): void {
    const key = `${panelId}\u0000${sessionId}`;
    const previous = this.retiredEditorCompanionSessions.get(toolId) ?? [];
    this.retiredEditorCompanionSessions.set(toolId, [
      ...previous.filter((candidate) => candidate !== key),
      key,
    ].slice(-EDITOR_COMPANION_RETIRED_SESSION_LIMIT_PER_TOOL));
  }

  private isRetiredEditorCompanionSession(snapshot: KtcEditorPrimaryCompanionSnapshot): boolean {
    return this.retiredEditorCompanionSessions.get(snapshot.toolId)
      ?.includes(`${snapshot.panelId}\u0000${snapshot.sessionId}`) === true;
  }

  /** Opens one optional-module tool in the shared Block history. */
  async showModuleTool(
    moduleId: KtcModuleId,
    toolId: string,
  ): Promise<boolean> {
    if (moduleId === "code") {
      if (!getTool(toolId)) return false;
      await this.showTool(toolId);
      return true;
    }
    const moduleTools = this.getModuleTools(moduleId);
    if (!moduleTools.some((tool) => tool.moduleId === moduleId && tool.id === toolId)) return false;
    const navigationCollapsed = await this.collapseUnrelatedNavigationGroup(toolId);
    if (this.isToolBlockVisible(toolId)) {
      if (navigationCollapsed && this.moduleView) await this.sendInit(this.moduleView);
      return true;
    }
    if (!await this.activateModule(moduleId)) return false;

    this.activateToolHistory(toolId, "command");
    ktcActivateResultAccordion(SidebarViewProvider.moduleViewType);
    await this.setModulePanelContext(true, toolId);
    await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
    if (this.moduleView) {
      this.moduleView.title = MODULE_VIEW_TITLE;
      await this.sendInit(this.moduleView);
      if (!this.moduleView.visible) this.moduleView.show(false);
    } else {
      try { await vscode.commands.executeCommand(`${SidebarViewProvider.moduleViewType}.focus`); } catch { /* view resolves lazily */ }
    }
    return true;
  }

  async closeModuleTool(moduleId: KtcModuleId, toolId: string): Promise<KtcToolBlockState> {
    if (moduleId === "code") {
      if (this.activeToolId === toolId) return this.closeToolBlock();
      return this.getToolBlockState();
    }
    const moduleToolIds = new Set(this.getModuleTools(moduleId).map((tool) => tool.id));
    if (!moduleToolIds.has(toolId)) return this.getToolBlockState();
    return this.closeToolBlock(toolId);
  }

  async closeToolBlock(toolId = this.activeToolId, preserveFocus = false): Promise<KtcToolBlockState> {
    if (!toolId || this.isGroupToolId(toolId) || !this.openToolIds.includes(toolId)) {
      return this.getToolBlockState();
    }
    if (toolId === "codeAssistant") this.codeAssistantFeatureId = undefined;
    const closed = ktcCloseEditorPrimaryTool(this.editorCompanionState, toolId);
    this.editorCompanionState = closed.state;
    this.openToolIds = [...closed.state.openToolIds];
    if (closed.nextToolId) {
      await this.restoreToolBlock(closed.nextToolId, preserveFocus);
      return this.getToolBlockState();
    }
    await this.setModulePanelContext(false);
    if (this.moduleView) this.moduleView.title = MODULE_VIEW_TITLE;
    this.postToViews({ type: "openTools", activeToolId: this.activeToolId, openToolIds: [] });
    return this.getToolBlockState();
  }

  async closeOtherToolBlocks(toolId: string): Promise<KtcToolBlockState> {
    if (
      !toolId
      || this.isGroupToolId(toolId)
      || !this.openToolIds.includes(toolId)
      || !this.getToolModuleId(toolId)
    ) {
      return this.getToolBlockState();
    }
    if (this.openToolIds.length === 1 && this.activeToolId === toolId) return this.getToolBlockState();
    const closed = ktcCloseOtherToolBlocks(this.editorCompanionState.openToolIds, toolId);
    this.editorCompanionState = {
      ...this.editorCompanionState,
      openToolIds: closed.openToolIds,
      activeToolId: closed.nextToolId,
    };
    this.openToolIds = [...closed.openToolIds];
    this.activeToolId = toolId;
    if (toolId !== "codeAssistant") this.codeAssistantFeatureId = undefined;
    await this.restoreToolBlock(toolId);
    return this.getToolBlockState();
  }

  async activateOpenTool(toolId: string): Promise<KtcToolBlockState> {
    if (
      !toolId
      || this.isGroupToolId(toolId)
      || !this.openToolIds.includes(toolId)
      || !this.getToolModuleId(toolId)
    ) {
      return this.getToolBlockState();
    }
    this.editorCompanionState = ktcActivateEditorPrimaryTool(this.editorCompanionState, {
      toolId,
      source: "menu",
    });
    this.openToolIds = [...this.editorCompanionState.openToolIds];
    this.activeToolId = toolId;
    if (toolId !== "codeAssistant") this.codeAssistantFeatureId = undefined;
    await this.restoreToolBlock(toolId);
    return this.getToolBlockState();
  }

  collapseForAccordion(): void {
    void this.setModulePanelContext(false);
  }

  private setModulePanelContext(visible: boolean, toolId = this.activeToolId): Promise<void> {
    const activeTool = visible ? toolId : "";
    const task = this.modulePanelContextSyncQueue.then(async () => {
      if (visible) {
        await vscode.commands.executeCommand("setContext", "ktAutoCode.modulePanel.activeTool", activeTool);
        await vscode.commands.executeCommand("setContext", "ktAutoCode.modulePanelVisible", true);
      } else {
        await vscode.commands.executeCommand("setContext", "ktAutoCode.modulePanelVisible", false);
        await vscode.commands.executeCommand("setContext", "ktAutoCode.modulePanel.activeTool", "");
      }
    });
    this.modulePanelContextSyncQueue = task.catch(() => undefined);
    return task;
  }

  private getSidebarStyle(): "ribbon" | "compact" {
    const configured = vscode.workspace
      .getConfiguration("ktAutoCode")
      .get<unknown>("sidebar.toolPickerStyle", "ribbon");
    return configured === "compact" ? "compact" : "ribbon";
  }

  private getToolOptions(toolId: string): ToolOptionsState {
    if (toolId === "headerAscii") {
      return { preserveGbk: getPreserveGbk(), stripBom: getStripBom() };
    }
    if (toolId === "encodingFix") {
      const options = getEncodingFixOptions();
      return {
        encodingDefaultTarget: options.defaultTarget,
        encodingHeaderTarget: options.headerTarget,
        encodingSourceTarget: options.sourceTarget,
        encodingMarkdownTarget: options.markdownTarget,
      };
    }
    return {};
  }

  private getAllToolOptions(): Record<string, ToolOptionsState> {
    return {
      headerAscii: this.getToolOptions("headerAscii"),
      encodingFix: this.getToolOptions("encodingFix"),
    };
  }

  private createRunContext(toolId: string, transientTarget?: vscode.WebviewView): ToolRunContext {
    const workingContext = this.getWorkingContext();
    return {
      workspaceRoot: workingContext.resolvedDirectory,
      isCurrentWorkingDirectory: () => this.getWorkingContext().resolvedDirectory === workingContext.resolvedDirectory,
      workspaceLabel: workingContext.label,
      workspaceFileScopeId: "workspace",
      pluginIgnoreEnabled: workingContext.pluginIgnoreEnabled,
      ignoreEnabled: workingContext.ignoreEnabled,
      builtInIgnoreEnabled: workingContext.builtInIgnoreEnabled,
      gitIgnoreEnabled: workingContext.gitIgnoreEnabled,
      customIgnoreEnabled: workingContext.customIgnoreEnabled,
      postState: (state) => this.setToolState(toolId, state, transientTarget),
      log: (text) => logOutput(text),
    };
  }

  private setToolState(
    toolId: string,
    state: ToolUiState,
    transientTarget?: vscode.WebviewView,
  ): void {
    const { associatedRulePicker, ...durableUpdate } = state;
    const {
      associatedRulePicker: _staleAssociatedRulePicker,
      ...durablePrevious
    } = this.toolStates.get(toolId) ?? {};
    const merged = { ...durablePrevious, ...durableUpdate } as ToolUiState;
    this.toolStates.set(toolId, merged);
    if (!associatedRulePicker || !transientTarget) {
      this.postToViews({ type: "state", toolId, state: merged });
      return;
    }

    const durableMessage = { type: "state", toolId, state: merged } as const;
    const transientMessage = {
      type: "state",
      toolId,
      state: { ...merged, associatedRulePicker },
    } as const;
    postToWebview(
      this.moduleView,
      this.moduleView === transientTarget ? transientMessage : durableMessage,
    );
  }

  private async sendInit(target: vscode.WebviewView): Promise<void> {
    const contributions = this.getInstalledModuleContributions();
    const reconciliation = this.reconcileInstalledToolState(contributions);
    await this.syncInstalledToolReconciliation(reconciliation);
    const codeTools: ToolSummary[] = getTools().map((t) => {
      const model = t.getPanelModel();
      const icon = model.summary.icon?.startsWith("media/")
        ? target.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, model.summary.icon)).toString()
        : model.summary.icon;
      return {
        id: model.summary.id,
        title: model.summary.title,
        shortTitle: model.summary.shortTitle,
        description: model.summary.description,
        icon,
        kind: "tool" as const,
        ribbonVisible: model.summary.ribbonVisible ?? t.ribbonVisible,
        moduleId: "code" as const,
        moduleTitle: "Code",
      };
    });
    const navigationGroups: ToolSummary[] = getNavigationDescriptors().map((descriptor) => ({
      ...descriptor,
      icon: descriptor.icon?.startsWith("media/")
        ? target.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, descriptor.icon)).toString()
        : descriptor.icon,
      moduleId: "code" as const,
      moduleTitle: "Code",
    }));
    const optionalTools = contributions.flatMap(({ extensionUri, contribution }) => (
      contribution.tools.map((tool) => ({
        ...tool,
        moduleTitle: contribution.title,
        icon: tool.icon?.startsWith("shell:")
          ? target.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, tool.icon.slice("shell:".length))).toString()
          : tool.icon?.startsWith("extension:")
            ? target.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, tool.icon.slice("extension:".length))).toString()
            : tool.icon,
      }))
    ));
    const tools = [...navigationGroups, ...codeTools, ...optionalTools];

    const ribbonLayout = await this.getRibbonLayout(this.getRibbonLayoutTools());
    const workingContext = this.getWorkingContext();
    target.title = MODULE_VIEW_TITLE;
    postToWebview(target, {
      type: "init",
      tools,
      activeToolId: this.activeToolId,
      openToolIds: this.openToolIds,
      codeAssistantFeature: this.codeAssistantFeatureId,
      codeAssistantTreeUiState: this.codeAssistantTreeUiState,
      workspaceLabel: getWorkspaceLabel(),
      scope: getFileScope(),
      ignoreConfig: ktcIgnoreController.snapshot(workingContext.resolvedDirectory),
      toolOptions: this.getAllToolOptions(),
      sidebarStyle: this.getSidebarStyle(),
      ribbonLayout,
      workingContext,
      directoryVisible: this.directoryVisible,
      presentation: "detailBlock",
      recentWorkingDirectories: this.getRecentWorkingDirectories(),
      workspaceFileScopes: [],
      selectedWorkspaceFileScopes: {},
      workspaceFileScopeError: "工作集已停用。",
      moduleState: this.moduleState,
      extensionInstallations: ktcWelcomeExtensionSummaries(vscode.extensions.all),
    });
    // Old Webview state may still carry `toolSurfaceCollapsed`; drain it while
    // the markup migration removes that legacy presentation field.
    if (this.openToolIds.includes(this.activeToolId)) {
      postToWebview(target, { type: "revealToolSurface", toolId: this.activeToolId });
    }

    for (const [toolId, state] of this.toolStates) {
      // The rule picker is a one-time UI request, not durable tool state. Replaying
      // it after switching tools would reopen the modal without a user action.
      const { associatedRulePicker: _associatedRulePicker, runCleanup, ...replayableState } = state;
      postToWebview(target, { type: "state", toolId, state: {
        ...replayableState,
        ...(runCleanup ? { runCleanup: { ...runCleanup, openRequestId: 0 } } : {}),
      } });
    }
    await this.sendActiveModuleBlock(target);
  }

  private async onMessage(message: WebviewInboundMessage, source: vscode.WebviewView): Promise<void> {
    if (message.type === "ready") {
      source.title = MODULE_VIEW_TITLE;
      await this.sendInit(source);
      return;
    }

    if (message.type === "setCodeAssistantTreeUiState") {
      this.codeAssistantTreeUiState = normalizeCodeAssistantTreeUiState(message.state);
      await this.globalState.update(CODE_ASSISTANT_TREE_UI_STATE_KEY, this.codeAssistantTreeUiState);
      return;
    }

    if (message.type === "clearReorderMembersSession") {
      const tool = getTool(message.toolId);
      if (tool) await tool.handleMessage(message, this.createRunContext(message.toolId, source));
      this.codeAssistantFeatureId = undefined;
      await this.sendInit(source);
      return;
    }

    if (message.type === "closeCodeAssistantFeature") {
      const tool = getTool(message.toolId);
      if (!tool || !isCodeAssistantFeatureId(message.toolId)) {
        const text = `无法关闭不存在的代码辅助功能“${message.toolId}”。`;
        logOutput(`[Primary][信号][ERROR] ${text}`);
        this.setToolState("codeAssistant", { status: "error", message: text }, source);
        return;
      }
      const ctx = this.createRunContext(message.toolId, source);
      await tool.clearSession?.(ctx);
      this.toolStates.delete(message.toolId);
      this.codeAssistantFeatureId = undefined;
      this.codeAssistantTreeUiState = { ...this.codeAssistantTreeUiState, treeExpanded: true };
      await this.globalState.update(CODE_ASSISTANT_TREE_UI_STATE_KEY, this.codeAssistantTreeUiState);
      ctx.log(`[代码辅助][关闭][INFO] 已关闭：${tool.title}；临时结果已清理。`);
      await this.sendInit(source);
      return;
    }

    if (message.type === "welcomeAction") {
      if (message.action === "installExtension") {
        const extension = WELCOME_EXTENSIONS.find(({ id }) => id === message.extensionId);
        if (!extension) return;
        await vscode.commands.executeCommand("workbench.extensions.installExtension", extension.id);
        return;
      }
      if (message.action === "openSettings") {
        await vscode.commands.executeCommand("workbench.action.openSettings", "@ext:kuntai.kt-auto-code");
        return;
      }
      if (message.action === "openDiagnostics") {
        await vscode.commands.executeCommand("ktAutoCode.runtimeDiagnostics.open");
        return;
      }
      if (message.action === "openInstallGuide") {
        await vscode.commands.executeCommand("workbench.extensions.search", "@id:kuntai.kt-auto-code");
        return;
      }
      const url = message.action === "openQuickStart" ? QUICK_START_URL : REPOSITORY_URL;
      await vscode.env.openExternal(vscode.Uri.parse(url));
      return;
    }

    if (message.type === "moduleBlockAction") {
      const moduleId = this.moduleState.active;
      const provider = this.moduleBlockProviders.get(moduleId);
      if (moduleId === "code" || !provider?.handleAction || !/^[a-z][A-Za-z0-9]*$/.test(message.actionId)) return;
      await provider.handleAction(this.activeToolId, message.actionId);
      await this.refreshModuleBlock(moduleId);
      return;
    }

    if (message.type === "closeToolBlock") {
      const toolId = message.toolId === undefined
        ? this.activeToolId
        : typeof message.toolId === "string" ? message.toolId.trim() : "";
      if (toolId) await this.closeToolBlock(toolId);
      return;
    }

    if (message.type === "closeOtherToolBlocks") {
      if (typeof message.toolId === "string") await this.closeOtherToolBlocks(message.toolId.trim());
      return;
    }

    if (message.type === "activateOpenTool") {
      if (typeof message.toolId === "string") await this.activateOpenTool(message.toolId.trim());
      return;
    }

    if (message.type === "showWorkingDirectoryQuickPick") {
      await this.showWorkingDirectoryQuickPick();
      return;
    }

    if (message.type === "runModuleTool") {
      const tool = this.getModuleTools(message.moduleId).find((candidate) => (
        candidate.moduleId === message.moduleId && candidate.command === message.command
      ));
      if (!tool || !await this.showModuleTool(message.moduleId, tool.id)) return;
      await vscode.commands.executeCommand(message.command);
      return;
    }

    if (message.type === "toggleRibbonModule") {
      await this.toggleModule(message.moduleId);
      return;
    }

    if (message.type === "setRibbonStyle") {
      if (message.style !== "ribbon" && message.style !== "compact") return;
      await vscode.workspace.getConfiguration("ktAutoCode").update(
        "sidebar.toolPickerStyle",
        message.style,
        vscode.ConfigurationTarget.Global,
      );
      return;
    }

    if (message.type === "toggleRibbonToolPin") {
      const tools = this.getRibbonLayoutTools();
      const current = await this.getRibbonLayout(tools);
      const result = ktcToggleRibbonToolPin(current, tools, message.toolId);
      if (result.changed) await this.persistRibbonLayout(result.layout);
      this.postToViews({ type: "ribbonLayout", layout: result.layout });
      return;
    }

    if (message.type === "resetCodeRibbonLayout") {
      const tools = this.getRibbonLayoutTools();
      const current = await this.getRibbonLayout(tools);
      const reset = ktcResetCodeRibbonLayout(current, tools);
      await this.persistRibbonLayout(reset);
      this.postToViews({ type: "ribbonLayout", layout: reset });
      return;
    }

    if (message.type === "moveRibbonTool") {
      const tools = this.getRibbonLayoutTools();
      const current = await this.getRibbonLayout(tools);
      const result = ktcMoveRibbonTool(
        current,
        tools,
        message.toolId,
        message.targetToolId,
        message.placement,
      );
      if (result.changed) await this.persistRibbonLayout(result.layout);
      this.postToViews({ type: "ribbonLayout", layout: result.layout });
      return;
    }

    if (message.type === "selectWorkingDirectory") {
      await this.selectWorkingDirectory(message.directory);
      return;
    }

    if (message.type === "pickWorkingDirectory") {
      await this.pickWorkingDirectory();
      return;
    }

    if (message.type === "setPluginIgnoreEnabled") {
      await this.workspaceState.update(PLUGIN_IGNORE_STATE_KEY, message.enabled);
      await this.workspaceState.update(CUSTOM_IGNORE_STATE_KEY, message.enabled);
      this.postWorkingContext();
      return;
    }

    if (message.type === "setIgnoreEnabled") {
      await this.workspaceState.update(IGNORE_ENABLED_STATE_KEY, message.enabled);
      this.postWorkingContext();
      return;
    }

    if (message.type === "setIgnoreSourceEnabled") {
      const key = message.source === "builtIn"
        ? BUILT_IN_IGNORE_STATE_KEY
        : message.source === "git" ? GIT_IGNORE_STATE_KEY : CUSTOM_IGNORE_STATE_KEY;
      await this.workspaceState.update(key, message.enabled);
      this.postWorkingContext();
      return;
    }

    // Legacy Webviews may briefly replay these messages after an extension
    // update. Worksets are hidden and frozen; never read or write the file.
    if (message.type === "selectWorkspaceFileScope" || message.type === "openWorkspaceWorksets") return;

    if (message.type === "pickSearchReplaceDirectory") {
      await this.pickWorkingDirectory();
      return;
    }

    if (message.type === "rememberSearchReplaceDirectory") {
      await this.selectWorkingDirectory(message.directory);
      return;
    }

    if (message.type === "ignoreSelection") {
      this.setToolState("ignoreSettings", { status: "idle", ignoreSelectedGroupIds: message.groupIds });
      return;
    }

    if (ktcIsIgnoreMessage(message)) {
      await this.enqueueIgnoreMessage(message);
      return;
    }

    if (message.type === "editorCompanionAction") {
      const validation = ktcValidateEditorPrimaryCompanionRoute(this.editorCompanionState, message);
      if (!validation.accepted) {
        logOutput(`[${message.toolId}][Primary][WARN] 已丢弃 companion 动作 ${message.actionId}：${validation.reason}。`);
        return;
      }
      if (message.panelId !== validation.route.panelId) {
        logOutput(`[${message.toolId}][Primary][WARN] 已丢弃 panel 不匹配的 companion 动作：${message.actionId}。`);
        return;
      }
      const snapshot = this.editorCompanionSnapshots.get(validation.route.panelId);
      const action = snapshot?.actions.find((candidate) => candidate.id === message.actionId);
      if (
        !snapshot?.ready
        || snapshot.lifecycle === "disposed"
        || snapshot.sessionId !== message.sessionId
        || snapshot.revision !== message.revision
        || !action?.enabled
      ) {
        logOutput(`[${message.toolId}][Primary][WARN] 已丢弃未就绪、过期或禁用的 companion 动作：${message.actionId}。`);
        return;
      }
      const tool = getTool(message.toolId);
      if (!tool?.runEditorCompanionAction) {
        logOutput(`[${message.toolId}][Primary][WARN] 工具未声明 companion 动作处理器。`);
        return;
      }
      await tool.runEditorCompanionAction(message, this.createRunContext(message.toolId, source));
      return;
    }

    if (message.type === "selectTool") {
      await this.showTool(message.toolId, message.source ?? "ribbon");
      return;
    }

    if (message.type === "openCodeAssistantFeature") {
      const title = getTool(message.feature)?.title ?? message.feature;
      this.createRunContext(message.feature).log(
        `[代码辅助][入口][INFO] 已打开：${title}；目录 ${this.getWorkingContext().label}。`,
      );
      await vscode.commands.executeCommand(`ktAutoCode.codeAssistant.${message.feature}`);
      return;
    }

    // A navigation Group has no business surface. Keep this guard ahead of all
    // generic tool-message routing (including setOption) so stale Webviews
    // cannot revive the former Group-owned Tool runtime.
    if (
      "toolId" in message
      && typeof message.toolId === "string"
      && this.isGroupToolId(message.toolId)
    ) {
      logOutput(`[Primary][信号][WARN] 已忽略导航 Group“${message.toolId}”的业务信号“${message.type}”。`);
      return;
    }

    if (message.type === "setOption") {
      if (
        message.toolId === "scope"
        && (message.key === "includeHeaders"
          || message.key === "includeSource"
          || message.key === "includeMarkdown")
      ) {
        await setFileScopeOption(message.key as ScopeOptionKey, message.value);
        this.refreshScope();
        return;
      }
      const tool = getTool(message.toolId);
      if (tool) {
        const ctx = this.createRunContext(message.toolId, source);
        try { await tool.handleMessage(message, ctx); }
        catch (error) { this.postUnhandledToolError(message.toolId, error); }
        this.refreshToolOptions(message.toolId);
      }
      return;
    }

    if (message.type === "searchReplace") {
      await this.rememberWorkingDirectory(message.payload.scope);
    }

    const tool = getTool(message.toolId);
    if (!tool) {
      const text = `未找到工具“${message.toolId}”，信号“${message.type}”未执行。`;
      logOutput(`[Primary][信号][ERROR] ${text}`);
      this.setToolState(message.toolId, { status: "error", message: text }, source);
      return;
    }
    if (message.type === "run") {
      const signalError = ktcRunSignalContractError(message, tool.runActions);
      if (signalError) {
        logOutput(`[Primary][信号][ERROR] ${signalError}`);
        this.setToolState(message.toolId, { status: "error", message: signalError }, source);
        return;
      }
    }

    const ctx = this.createRunContext(message.toolId, source);
    try {
      await tool.handleMessage(message, ctx);
      if (message.type === "setEncodingDefaultTarget") {
        this.refreshToolOptions("encodingFix");
        this.invalidateEncodingFixResults();
      }
    } catch (error) {
      this.postUnhandledToolError(message.toolId, error);
    }
  }

  private async handleIgnoreMessage(
    message: KtcIgnoreMessage,
    requestedRoot: string | undefined,
  ): Promise<void> {
    if (this.getWorkingContext().resolvedDirectory !== requestedRoot) return;
    const previousState = this.toolStates.get("ignoreSettings");
    const analyzing = message.type === "analyzeIgnore";
    this.setToolState("ignoreSettings", {
      status: "running",
      message: analyzing ? "正在分析当前目录的 Ignore 建议…" : "正在更新 Ignore…",
      ignoreRecommendations: analyzing ? undefined : previousState?.ignoreRecommendations,
      ignoreSelectedGroupIds: analyzing ? [] : previousState?.ignoreSelectedGroupIds,
    });

    const result = await ktcIgnoreController.handle(message, requestedRoot, (summary) => {
      refreshCodeAssistantIgnorePolicy();
      if (this.getWorkingContext().resolvedDirectory === requestedRoot) {
        this.postToViews({ type: "ignoreConfig", ignoreConfig: summary });
      }
    });
    if (this.getWorkingContext().resolvedDirectory !== requestedRoot) return;

    if (result.error) {
      this.setToolState("ignoreSettings", { status: "error", message: result.error });
      return;
    }
    if (result.recommendations) {
      const previous = previousState?.ignoreSelectedGroupIds ?? [];
      const selectable = new Set(result.recommendations.recommendations
        .filter((group) => group.suggestedRules.length > 0)
        .map((group) => group.groupId));
      this.setToolState("ignoreSettings", {
        status: "done",
        message: result.message,
        ignoreRecommendations: result.recommendations,
        ignoreSelectedGroupIds: analyzing
          ? ktcDefaultIgnoreGroupIds(result.recommendations.recommendations)
          : previous.filter((groupId) => selectable.has(groupId)),
      });
      return;
    }
    if (result.summary) {
      this.setToolState("ignoreSettings", {
        status: "done",
        message: result.message ?? result.summary.statusText,
      });
      return;
    }
    this.setToolState("ignoreSettings", { status: "done", message: result.message ?? "Ignore 操作完成。" });
  }

  private async enqueueIgnoreMessage(message: KtcIgnoreMessage): Promise<void> {
    const requestedRoot = this.getWorkingContext().resolvedDirectory;
    const operation = this.ignoreOperationQueue.then(() => this.handleIgnoreMessage(message, requestedRoot));
    this.ignoreOperationQueue = operation.catch(() => undefined);
    await operation;
  }

  getModuleState(): KtcModuleState {
    return {
      ...this.moduleState,
      installed: [...this.moduleState.installed],
      enabled: [...this.moduleState.enabled],
      visible: [...this.moduleState.visible],
      known: [...this.moduleState.known],
    };
  }

  /** 只返回无路径、无正文的宿主资源计数，不触发工具刷新。 */
  getRuntimeDiagnosticsSnapshot(): KtcSidebarRuntimeDiagnostics {
    return {
      resolvedViews: Number(this.moduleView !== undefined),
      ribbonResolved: false,
      modulePanelResolved: this.moduleView !== undefined,
      ribbonVisible: false,
      modulePanelVisible: this.moduleView?.visible === true,
      openToolCount: this.openToolIds.length,
      openToolIds: [...this.openToolIds],
      retainedToolStateCount: this.toolStates.size,
      moduleBlockProviderCount: this.moduleBlockProviders.size,
    };
  }

  registerModuleBlockProvider(
    moduleId: KtcModuleId,
    provider: KtcModuleBlockProvider,
  ): KtcModuleBlockRegistration {
    this.moduleBlockProviders.set(moduleId, provider);
    void this.refreshModuleBlock(moduleId);
    return {
      dispose: () => {
        if (this.moduleBlockProviders.get(moduleId) === provider) this.moduleBlockProviders.delete(moduleId);
      },
    };
  }

  async refreshModuleBlock(moduleId: KtcModuleId): Promise<void> {
    if (this.moduleState.active !== moduleId || !this.moduleView) return;
    await this.sendActiveModuleBlock(this.moduleView);
  }

  private getInstalledModuleContributions(): InstalledModuleContribution[] {
    const modules = new Map<KtcModuleId, InstalledModuleContribution>();
    for (const extension of vscode.extensions.all) {
      const contribution = ktcReadModuleContribution(extension.packageJSON);
      if (!contribution || contribution.id === "code" || modules.has(contribution.id)) continue;
      modules.set(contribution.id, { extensionUri: extension.extensionUri, contribution });
    }
    return [...modules.values()].sort((left, right) => (
      left.contribution.order - right.contribution.order
      || left.contribution.id.localeCompare(right.contribution.id)
    ));
  }

  private getWebviewLocalResourceRoots(): vscode.Uri[] {
    const roots = [
      this.extensionUri,
      ...this.getInstalledModuleContributions().map(({ extensionUri }) => extensionUri),
    ];
    const unique = new Map<string, vscode.Uri>();
    for (const root of roots) unique.set(root.toString(), root);
    return [...unique.values()];
  }

  private getInstalledModuleIds(
    contributions: readonly InstalledModuleContribution[] = this.getInstalledModuleContributions(),
  ): KtcModuleId[] {
    return ["code", ...contributions.map(({ contribution }) => contribution.id)];
  }

  /**
   * Reconciles the Shell projection only. Removing a contribution must not
   * dispose Editor companions, task state, or any Right View owned resource.
   */
  private reconcileInstalledToolState(
    contributions: readonly InstalledModuleContribution[],
  ): KtcInstalledToolReconciliation {
    const installed = this.getInstalledModuleIds(contributions);
    let moduleStateChanged = installed.length !== this.moduleState.installed.length
      || !installed.every((moduleId, index) => this.moduleState.installed[index] === moduleId);
    if (moduleStateChanged) {
      this.moduleState = ktcCreateModuleState(installed, ktcPersistedModuleState(this.moduleState));
    }

    const groupToolIds = new Set(getNavigationDescriptors().map(({ id }) => id));
    const installedTools: KtcInstalledToolReference[] = [
      ...getTools().map(({ id }) => ({ id, moduleId: "code" })),
      ...contributions.flatMap(({ contribution }) => (
        contribution.tools.map(({ id }) => ({ id, moduleId: contribution.id }))
      )),
    ];
    const moduleByToolId = new Map<string, KtcModuleId>();
    for (const tool of installedTools) {
      // Base Code tools win if an optional contribution accidentally reuses an id.
      if (!moduleByToolId.has(tool.id)) moduleByToolId.set(tool.id, tool.moduleId);
    }

    const hadOpenToolIds = this.openToolIds.length > 0;
    const hadGroupToolReference = groupToolIds.has(this.activeToolId)
      || this.openToolIds.some((toolId) => groupToolIds.has(toolId))
      || (this.editorCompanionState.activeToolId !== undefined
        && groupToolIds.has(this.editorCompanionState.activeToolId))
      || this.editorCompanionState.openToolIds.some((toolId) => groupToolIds.has(toolId));
    const normalizedHistory = ktcNormalizeToolBlockHistory(
      this.openToolIds,
      this.activeToolId,
      new Set(moduleByToolId.keys()),
    );
    const openToolIds = [...normalizedHistory.openToolIds];
    const activeOpenToolId = normalizedHistory.activeToolId;
    const activeToolId = activeOpenToolId
      ?? (hadOpenToolIds || hadGroupToolReference
        ? ""
        : moduleByToolId.has(this.activeToolId)
          ? this.activeToolId
          : installedTools[0]?.id ?? "");

    const historyChanged = this.activeToolId !== activeToolId
      || openToolIds.length !== this.openToolIds.length
      || !openToolIds.every((toolId, index) => this.openToolIds[index] === toolId)
      || this.editorCompanionState.activeToolId !== activeOpenToolId
      || openToolIds.length !== this.editorCompanionState.openToolIds.length
      || !openToolIds.every((toolId, index) => this.editorCompanionState.openToolIds[index] === toolId);
    this.openToolIds = openToolIds;
    this.activeToolId = activeToolId;
    this.editorCompanionState = {
      ...this.editorCompanionState,
      openToolIds,
      activeToolId: activeOpenToolId,
    };

    const activeModuleId = activeOpenToolId ? moduleByToolId.get(activeOpenToolId) : undefined;
    if (activeModuleId && this.moduleState.installed.includes(activeModuleId)) {
      if (!this.moduleState.visible.includes(activeModuleId)) {
        const toggled = ktcToggleModule(this.moduleState, activeModuleId);
        if (toggled.changed) {
          this.moduleState = toggled.state;
          moduleStateChanged = true;
        }
      }
      const activated = ktcActivateModule(this.moduleState, activeModuleId);
      if (activated !== this.moduleState) {
        this.moduleState = activated;
        moduleStateChanged = true;
      }
    }
    return { historyChanged, moduleStateChanged };
  }

  private async syncInstalledToolReconciliation(
    reconciliation: KtcInstalledToolReconciliation,
  ): Promise<void> {
    if (reconciliation.moduleStateChanged) await this.syncModuleState();
    if (!reconciliation.historyChanged) return;
    const activeToolId = this.openToolIds.includes(this.activeToolId) ? this.activeToolId : undefined;
    if (activeToolId) await this.setModulePanelContext(true, activeToolId);
    else await this.setModulePanelContext(false);
  }

  private getModuleTools(moduleId: KtcModuleId): readonly KtcModuleToolDefinition[] {
    return this.getInstalledModuleContributions()
      .find(({ contribution }) => contribution.id === moduleId)?.contribution.tools ?? [];
  }

  private getToolModuleId(toolId: string): KtcModuleId | undefined {
    if (getTool(toolId)) return "code";
    return this.getInstalledModuleContributions()
      .find(({ contribution }) => contribution.tools.some((tool) => tool.id === toolId))
      ?.contribution.id;
  }

  private isGroupToolId(toolId: string): boolean {
    return getNavigationDescriptor(toolId) !== undefined;
  }

  private getModuleToolSummary(moduleId: KtcModuleId, toolId: string): KtcModuleToolDefinition | undefined {
    return this.getModuleTools(moduleId).find((tool) => tool.id === toolId);
  }

  private getToolBlockState(): KtcToolBlockState {
    const activeToolId = this.openToolIds.includes(this.activeToolId) ? this.activeToolId : undefined;
    return {
      openToolIds: [...this.openToolIds],
      activeToolId,
      activeModuleId: activeToolId ? this.getToolModuleId(activeToolId) : undefined,
    };
  }

  private isToolBlockVisible(toolId: string): boolean {
    return this.activeToolId === toolId
      && this.openToolIds.includes(toolId)
      && this.moduleView?.visible === true;
  }

  private async restoreToolBlock(toolId: string, preserveFocus = false): Promise<boolean> {
    if (this.isGroupToolId(toolId)) return false;
    const moduleId = this.getToolModuleId(toolId);
    if (!moduleId) return false;
    const restoringState = this.editorCompanionState;
    const superseded = () => preserveFocus && this.editorCompanionState !== restoringState;
    // Restoring an existing logical Tool is projection-only. It must not route
    // through showTool/showModuleTool because those paths may run onDidShow,
    // refresh commands, or feature-specific activation work.
    if (!await this.activateModule(moduleId) || superseded()) return false;
    await this.collapseUnrelatedNavigationGroup(toolId);
    if (superseded()) return false;
    this.activeToolId = toolId;
    await this.setModulePanelContext(true, toolId);
    if (!preserveFocus && !this.moduleView?.visible) {
      await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
    }
    if (this.moduleView) {
      this.moduleView.title = MODULE_VIEW_TITLE;
      await this.sendInit(this.moduleView);
      if (!preserveFocus && !this.moduleView.visible) this.moduleView.show(false);
    } else if (!preserveFocus) {
      try { await vscode.commands.executeCommand(`${SidebarViewProvider.moduleViewType}.focus`); } catch { /* view resolves lazily */ }
    }
    return true;
  }

  private async sendActiveModuleBlock(target: vscode.WebviewView): Promise<void> {
    if (this.moduleState.active === "code") {
      postToWebview(target, { type: "moduleBlock", moduleId: "code" });
      return;
    }
    const moduleId = this.moduleState.active;
    const manifestTool = this.getModuleToolSummary(moduleId, this.activeToolId);
    const manifestTitle = manifestTool?.title ?? "模块工具";
    const provider = this.moduleBlockProviders.get(moduleId);
    if (!provider) {
      postToWebview(target, {
        type: "moduleBlock",
        moduleId,
        content: {
          title: manifestTitle,
          description: manifestTool?.description,
          html: "<p>模块正在激活…</p>",
        },
      });
      return;
    }
    try {
      const providerContent = await provider.render(this.activeToolId);
      const content = {
        ...providerContent,
        title: manifestTitle,
        description: manifestTool?.description,
      };
      target.title = MODULE_VIEW_TITLE;
      postToWebview(target, { type: "moduleBlock", moduleId, content });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postToWebview(target, {
        type: "moduleBlock",
        moduleId,
        content: {
          title: manifestTitle,
          description: manifestTool?.description,
          html: `<p>模块界面渲染失败：${escapeHtml(message)}</p>`,
        },
      });
    }
  }

  async activateModule(moduleId: KtcModuleId): Promise<boolean> {
    if (!this.moduleState.installed.includes(moduleId)) await this.refreshInstalledModules();
    if (!this.moduleState.installed.includes(moduleId)) return false;
    if (!this.moduleState.visible.includes(moduleId)) {
      const toggled = ktcToggleModule(this.moduleState, moduleId);
      if (!toggled.changed) return false;
      this.moduleState = toggled.state;
    }
    this.moduleState = ktcActivateModule(this.moduleState, moduleId);
    await this.syncModuleState();
    return true;
  }

  async toggleModule(moduleId: KtcModuleId): Promise<boolean> {
    if (!this.moduleState.installed.includes(moduleId)) await this.refreshInstalledModules();
    const toggled = ktcToggleModule(this.moduleState, moduleId);
    if (!toggled.changed) {
      if (toggled.reason === "last-visible") {
        void vscode.window.showInformationMessage("至少要保留一个模块显示在 Ribbon 中。");
      }
      return false;
    }
    const previousActive = this.moduleState.active;
    this.moduleState = toggled.state;
    await this.syncModuleState();
    if (previousActive !== this.moduleState.active) {
      const nextToolId = [...this.openToolIds]
        .reverse()
        .find((candidate) => this.getToolModuleId(candidate) === this.moduleState.active);
      if (nextToolId) await this.showModuleTool(this.moduleState.active, nextToolId);
      else await this.setModulePanelContext(false);
    }
    return true;
  }

  private async syncModuleState(persist = true): Promise<void> {
    const snapshot = this.getModuleState();
    const task = this.moduleStateSyncQueue.then(async () => {
      if (persist) await this.globalState.update(MODULE_STATE_KEY, ktcPersistedModuleState(snapshot));
      await Promise.all([
        ...snapshot.known.flatMap((moduleId) => [
          vscode.commands.executeCommand("setContext", `ktAutoCode.module.${moduleId}.visible`, snapshot.visible.includes(moduleId)),
          vscode.commands.executeCommand("setContext", `ktAutoCode.module.${moduleId}.installed`, snapshot.installed.includes(moduleId)),
        ]),
        vscode.commands.executeCommand("setContext", "ktAutoCode.modules.hasOptional", snapshot.installed.some((moduleId) => moduleId !== "code")),
        vscode.commands.executeCommand("setContext", "ktAutoCode.module.active", snapshot.active),
      ]);
      this.postToViews({ type: "modules", moduleState: snapshot });
    });
    this.moduleStateSyncQueue = task.catch(() => undefined);
    await task;
  }

  private postUnhandledToolError(toolId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    logOutput(`[${toolId}] ${message}`);
    this.setToolState(toolId, { status: "error", message: `执行失败：${message}` });
  }

  private getWorkingContext(): KtcWorkingContext {
    const workspaceRoot = getWorkspaceRoot();
    const stored = this.workspaceState.get<unknown>(WORKING_DIRECTORY_STATE_KEY);
    const requested = typeof stored === "string" ? stored : "";
    const entry = requested ? ktcClassifyWorkingDirectory(workspaceRoot, requested) : undefined;
    const resolvedDirectory = entry && existsSync(entry.directory) ? entry.directory : workspaceRoot;
    const selectedDirectory = entry && resolvedDirectory === entry.directory ? entry.inputValue : "";
    const ignoreEnabled = this.workspaceState.get<boolean>(IGNORE_ENABLED_STATE_KEY, true);
    const builtInIgnoreEnabled = this.workspaceState.get<boolean>(BUILT_IN_IGNORE_STATE_KEY, true);
    const gitIgnoreEnabled = this.workspaceState.get<boolean>(GIT_IGNORE_STATE_KEY, true);
    const legacyCustomIgnoreEnabled = this.workspaceState.get<boolean>(PLUGIN_IGNORE_STATE_KEY);
    const customIgnoreEnabled = this.workspaceState.get<boolean>(
      CUSTOM_IGNORE_STATE_KEY,
      legacyCustomIgnoreEnabled ?? false,
    );
    return {
      selectedDirectory,
      resolvedDirectory,
      label: resolvedDirectory ? basename(resolvedDirectory) : "未打开目录",
      pluginIgnoreEnabled: customIgnoreEnabled,
      ignoreEnabled,
      builtInIgnoreEnabled,
      gitIgnoreEnabled,
      customIgnoreEnabled,
      gitIgnoreExists: !!resolvedDirectory && !!findNearestGitIgnore(resolvedDirectory),
    };
  }

  private postWorkingContext(): void {
    const context = this.getWorkingContext();
    const changed = this.ignoreContextRoot !== context.resolvedDirectory;
    const policyFingerprint = JSON.stringify([
      context.resolvedDirectory || "",
      context.ignoreEnabled !== false,
      context.builtInIgnoreEnabled !== false,
      context.gitIgnoreEnabled !== false,
      context.customIgnoreEnabled === true,
    ]);
    const policyChanged = !!this.ignorePolicyFingerprint && this.ignorePolicyFingerprint !== policyFingerprint;
    this.ignoreContextRoot = context.resolvedDirectory;
    this.ignorePolicyFingerprint = policyFingerprint;
    updateCodeAssistantIgnoreSources({
      ignoreEnabled: context.ignoreEnabled,
      builtInIgnoreEnabled: context.builtInIgnoreEnabled,
      gitIgnoreEnabled: context.gitIgnoreEnabled,
      customIgnoreEnabled: context.customIgnoreEnabled,
    });
    if (changed) {
      const cleanupDirectory = this.toolStates.get("run")?.runCleanup?.model.targets
        .find((target) => target.id === "workspace")?.path;
      if (cleanupDirectory !== context.resolvedDirectory) void this.invalidateRunCleanupSession("工作目录已切换");
      ktcIgnoreController.invalidateRecommendations();
      if (this.toolStates.has("ignoreSettings")) {
        this.setToolState("ignoreSettings", {
          status: "idle",
          message: "目录已切换，请重新分析 Ignore 建议。",
          ignoreRecommendations: undefined,
          ignoreSelectedGroupIds: [],
        });
      }
    }
    if (policyChanged && this.toolStates.has("codeRename")) {
      this.setToolState("codeRename", {
        status: "idle",
        message: "Ignore 使用策略已改变；旧结果已过期，请重新搜索。",
        codeRenameResults: undefined,
      });
    }
    if (policyChanged) {
      notifyCodegenIgnorePolicyChanged();
      const fingerprint = this.ignorePolicyFingerprint;
      for (const toolId of ["headerAscii", "encodingFix", "reorderMembers", "uuidReplace", "caaDialog"] as const) {
        if (!this.toolStates.has(toolId)) continue;
        const tool = getTool(toolId);
        void Promise.resolve(tool?.clearSession?.(this.createRunContext(toolId))).then(() => {
          if (this.ignorePolicyFingerprint !== fingerprint) return;
          this.setToolState(toolId, {
            status: "idle",
            message: "Ignore 使用策略已改变；旧结果已清除，请重新扫描。",
          });
        }).catch((error: unknown) => {
          logOutput(`[${toolId}][Ignore][ERROR] 清除旧结果失败：${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
    this.postToViews({ type: "workingContext", context, directories: this.getRecentWorkingDirectories() });
    this.postToViews({ type: "ignoreConfig", ignoreConfig: ktcIgnoreController.snapshot(context.resolvedDirectory) });
  }

  /** Revoke only the Run cleanup authorization; this never stops ordinary Run Tasks. */
  private async invalidateRunCleanupSession(reason: string): Promise<void> {
    if (!this.toolStates.get("run")?.runCleanup) return;
    const tool = getTool("run");
    if (!tool?.clearSession) return;
    try {
      await tool.clearSession(this.createRunContext("run"));
    } catch (error: unknown) {
      logOutput(`[Run][清理][ERROR] ${reason}时撤销清理会话失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async selectWorkingDirectory(value: string): Promise<void> {
    const requested = value.trim();
    if (!requested) {
      await this.workspaceState.update(WORKING_DIRECTORY_STATE_KEY, "");
      this.postWorkingContext();
      return;
    }
    const workspaceRoot = getWorkspaceRoot();
    const entry = ktcClassifyWorkingDirectory(workspaceRoot, requested);
    if (!entry || !existsSync(entry.directory)) return;
    try {
      if (!statSync(entry.directory).isDirectory()) return;
    } catch {
      return;
    }
    await this.workspaceState.update(WORKING_DIRECTORY_STATE_KEY, entry.inputValue);
    await this.rememberWorkingDirectory(entry.inputValue);
    this.postWorkingContext();
  }

  private async pickWorkingDirectory(): Promise<void> {
    const current = this.getWorkingContext();
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: current.resolvedDirectory ? vscode.Uri.file(current.resolvedDirectory) : undefined,
      openLabel: "选择工作目录",
      title: "选择 KT Auto Code 工作目录",
    });
    const directory = selected?.[0]?.fsPath;
    if (directory) await this.selectWorkingDirectory(directory);
  }

  private async showWorkingDirectoryQuickPick(): Promise<void> {
    const current = this.getWorkingContext();
    const directories = this.getRecentWorkingDirectories();
    const items: KtcWorkingDirectoryQuickPickItem[] = [];
    const seen = new Set<string>();
    const append = (directory: string, label: string): void => {
      if (seen.has(directory)) return;
      seen.add(directory);
      items.push({
        label,
        directory,
        ...(directory === current.selectedDirectory ? { picked: true, description: "当前选择" } : {}),
      });
    };
    for (const option of directories.options) append(option.value, option.label);
    for (const directory of directories.workspace) append(directory, `最近 · ${directory}`);
    for (const directory of directories.external) append(directory, `外部 · ${directory}`);
    if (current.selectedDirectory && !seen.has(current.selectedDirectory)) {
      append(current.selectedDirectory, `当前选择 · ${current.label}`);
    }

    const selected = await vscode.window.showQuickPick(items, {
      title: "切换 KT Auto Code 工作目录",
      placeHolder: items.length > 0
        ? "选择最近目录或工作区目录"
        : "没有可用目录，请使用右侧文件夹按钮选择",
      matchOnDescription: true,
    });
    if (selected) await this.selectWorkingDirectory(selected.directory);
  }

  private async rememberWorkingDirectory(value: string | undefined, select = false): Promise<void> {
    const requested = value?.trim();
    if (!requested) return;
    const workspaceRoot = getWorkspaceRoot();
    const entry = ktcClassifyWorkingDirectory(workspaceRoot, requested);
    if (!entry || !existsSync(entry.directory)) return;
    try {
      if (!statSync(entry.directory).isDirectory()) return;
    } catch {
      return;
    }
    if (entry.storage === "workspace" && entry.cacheValue) {
      await this.recentWorkspaceDirectories.remember(entry.cacheValue);
    } else if (entry.storage === "global" && entry.cacheValue) {
      await this.recentExternalDirectories.remember(entry.cacheValue);
    }
    this.postToViews({
      type: "recentWorkingDirectories",
      directories: this.getRecentWorkingDirectories(),
      selected: select ? entry.inputValue : undefined,
    });
  }

  private getRecentWorkingDirectories(): KtcRecentWorkingDirectories {
    const workspaceRoot = getWorkspaceRoot();
    return {
      workspace: workspaceRoot ? this.recentWorkspaceDirectories.list() : [],
      external: this.recentExternalDirectories.list().filter((directory) => (
        !workspaceRoot || !ktcIsPathInsideWorkspace(workspaceRoot, directory)
      )),
      options: ktcListSearchReplaceDirectoryOptions((vscode.workspace.workspaceFolders ?? []).map((folder) => ({
        name: folder.name,
        fsPath: folder.uri.fsPath,
      }))),
    };
  }

  private getRibbonLayoutTools(): KtcRibbonLayoutTool[] {
    return [
      ...getNavigationDescriptors()
        .filter((descriptor) => descriptor.ribbonVisible !== false)
        .map((descriptor) => ({ id: descriptor.id, moduleId: "code" as const })),
      ...getTools()
        .filter((tool) => tool.ribbonVisible !== false)
        .map((tool) => ({ id: tool.id, moduleId: "code" as const })),
      ...this.getInstalledModuleContributions().flatMap(({ contribution }) => (
        contribution.tools.map((tool) => ({ id: tool.id, moduleId: tool.moduleId }))
      )),
    ];
  }

  private async getRibbonLayout(tools: readonly KtcRibbonLayoutTool[]): Promise<KtcRibbonLayoutV1> {
    const persisted = this.ribbonLayout ?? this.globalState.get<unknown>(RIBBON_LAYOUT_STATE_KEY);
    const normalized = ktcNormalizeRibbonLayout(tools, persisted);
    if (!this.ribbonLayout || JSON.stringify(this.ribbonLayout) !== JSON.stringify(normalized)) {
      await this.persistRibbonLayout(normalized);
    }
    return normalized;
  }

  private async persistRibbonLayout(layout: KtcRibbonLayoutV1): Promise<void> {
    this.ribbonLayout = {
      pinnedToolIds: [...layout.pinnedToolIds],
      toolOrder: [...layout.toolOrder],
    };
    await this.globalState.update(RIBBON_LAYOUT_STATE_KEY, this.ribbonLayout);
  }

  private postToViews(message: Parameters<typeof postToWebview>[1]): void {
    postToWebview(this.moduleView, message);
  }
}
