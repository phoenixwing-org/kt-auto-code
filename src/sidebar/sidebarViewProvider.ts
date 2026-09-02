import * as vscode from "vscode";
import { existsSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { logOutput } from "../output.js";
import { getTool, getTools } from "../tools/registry.js";
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
import { setIgnoreSettingsRunContextFactory } from "../tools/ignoreSettings/index.js";
import { setCodegenRunContextFactory } from "../tools/codegen/index.js";
import { setCodeAssistantRunContextFactory } from "../tools/codeAssistant/index.js";
import { getPreserveGbk, getStripBom } from "../tools/headerAscii/options.js";
import { getFileScope, setFileScopeOption, type ScopeOptionKey } from "../scopeOptions.js";
import { getWorkspaceLabel, getWorkspaceRoot } from "../workspace.js";
import { getPanelHtml, postToWebview } from "./panelHtml.js";
import type { ToolOptionsState } from "../tools/types.js";
import {
  ktcDefaultIgnoreGroupIds,
  ktcIgnoreController,
  ktcIsIgnoreMessage,
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
import { ktcActivateToolBlock, ktcCloseToolBlock } from "./toolBlockHistory.js";
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
const RIBBON_LAYOUT_STATE_KEY = "ktAutoCode.ribbonLayout.v1";
const CODE_ASSISTANT_TREE_UI_STATE_KEY = "ktAutoCode.codeAssistant.treeUi.v1";
const WORKING_DIRECTORY_STATE_KEY = "ktAutoCode.workingContext.directory.v1";
const PLUGIN_IGNORE_STATE_KEY = "ktAutoCode.workingContext.pluginIgnoreEnabled.v1";
const DEFAULT_CODE_ASSISTANT_TREE_UI_STATE: KtcCodeAssistantTreeUiState = Object.freeze({
  treeExpanded: true,
  cppOrganizeExpanded: true,
  fileToolsExpanded: true,
  caaExpanded: true,
  reorderActionsExpanded: true,
  reorderResultsExpanded: true,
});
const REPOSITORY_URL = "https://gitee.com/phoenixwing/kt-auto-code";
const QUICK_START_URL = `${REPOSITORY_URL}/blob/develop/README.md#%E4%BD%BF%E7%94%A8`;

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
  private codeAssistantFeatureId: KtcCodeAssistantFeatureId | undefined;
  private codeAssistantTreeUiState: KtcCodeAssistantTreeUiState;
  private openToolIds: string[] = [];
  private toolStates = new Map<string, ToolUiState>();
  private readonly recentExternalDirectories: KtcRecentWorkingDirectoryStore;
  private readonly recentWorkspaceDirectories: KtcRecentWorkspaceDirectoryStore;
  private ribbonLayout?: KtcRibbonLayoutV1;
  private moduleState: KtcModuleState;
  private moduleStateSyncQueue: Promise<void> = Promise.resolve();
  private modulePanelContextSyncQueue: Promise<void> = Promise.resolve();
  private readonly moduleBlockProviders = new Map<KtcModuleId, KtcModuleBlockProvider>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
  ) {
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
    setHeaderAsciiRunContextFactory(() => this.createRunContext("headerAscii"));
    setEncodingFixRunContextFactory(() => this.createRunContext("encodingFix"));
    setCodeRenameRunContextFactory(() => this.createRunContext("codeRename"));
    setUuidReplaceRunContextFactory(() => this.createRunContext("uuidReplace"));
    setCaaDialogRunContextFactory(() => this.createRunContext("caaDialog"));
    setReorderMembersRunContextFactory(() => this.createRunContext("reorderMembers"));
    setIgnoreSettingsRunContextFactory(() => this.createRunContext("ignoreSettings"));
    setCodegenRunContextFactory(() => this.createRunContext("codegen"));
    setCodeAssistantRunContextFactory(() => this.createRunContext("codeAssistant"));
  }

  async initializeModuleState(): Promise<void> {
    await this.syncModuleState();
  }

  async refreshInstalledModules(): Promise<void> {
    const installed = this.getInstalledModuleIds();
    const changed = installed.length !== this.moduleState.installed.length
      || !installed.every((moduleId, index) => this.moduleState.installed[index] === moduleId);
    if (changed) {
      this.moduleState = ktcCreateModuleState(installed, ktcPersistedModuleState(this.moduleState));
      await this.syncModuleState();
    }
    if (this.moduleView) await this.sendInit(this.moduleView);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.moduleView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
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
      if (this.moduleView === webviewView) this.moduleView = undefined;
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
  async showTool(toolId: string): Promise<void> {
    // Ignore 管理已成为统一“设置”的首个内部区；保留旧命令/消息入口的兼容路由。
    const requestedToolId = toolId === "ignoreSettings" ? "environmentSettings" : toolId;
    const requestedTool = getTool(requestedToolId);
    if (!requestedTool) return;
    const codeAssistantFeatureId = isCodeAssistantFeatureId(requestedToolId) ? requestedToolId : undefined;
    const visibleToolId = codeAssistantFeatureId ? "codeAssistant" : requestedToolId;
    const tool = getTool(visibleToolId);
    if (!tool) return;
    const codeAssistantFeatureChanged = this.codeAssistantFeatureId !== codeAssistantFeatureId;
    this.codeAssistantFeatureId = codeAssistantFeatureId;
    if (codeAssistantFeatureId && codeAssistantFeatureChanged) {
      this.codeAssistantTreeUiState = { ...this.codeAssistantTreeUiState, treeExpanded: false };
      await this.globalState.update(CODE_ASSISTANT_TREE_UI_STATE_KEY, this.codeAssistantTreeUiState);
      const context = this.createRunContext(requestedToolId);
      context.log(`[代码辅助][入口][INFO] 已打开：${requestedTool.title}；目录 ${context.workspaceLabel}。`);
    }
    if (this.isToolBlockVisible(visibleToolId)) {
      if (codeAssistantFeatureChanged && this.moduleView) await this.sendInit(this.moduleView);
      if (requestedToolId === "environmentSettings") await requestedTool.runAction("refresh", this.createRunContext(requestedToolId));
      if (requestedToolId === "caaDialog") await requestedTool.runAction("checkConnection", this.createRunContext(requestedToolId));
      if (requestedTool.onDidShow) await requestedTool.onDidShow(this.createRunContext(requestedToolId));
      return;
    }
    await this.activateModule("code");
    this.activeToolId = visibleToolId;
    this.openToolIds = ktcActivateToolBlock(this.openToolIds, visibleToolId);
    ktcActivateResultAccordion(SidebarViewProvider.moduleViewType);
    await this.setModulePanelContext(true, visibleToolId);
    await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
    if (this.moduleView) {
      this.moduleView.title = "工具栏";
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

  /** Opens one optional-module tool in the shared Block history. */
  async showModuleTool(moduleId: KtcModuleId, toolId: string): Promise<boolean> {
    if (moduleId === "code") {
      if (!getTool(toolId)) return false;
      await this.showTool(toolId);
      return true;
    }
    const moduleTools = this.getModuleTools(moduleId);
    if (!moduleTools.some((tool) => tool.moduleId === moduleId && tool.id === toolId)) return false;
    if (this.isToolBlockVisible(toolId)) return true;
    if (!await this.activateModule(moduleId)) return false;

    this.activeToolId = toolId;
    this.openToolIds = ktcActivateToolBlock(this.openToolIds, toolId);
    ktcActivateResultAccordion(SidebarViewProvider.moduleViewType);
    await this.setModulePanelContext(true, toolId);
    await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
    if (this.moduleView) {
      this.moduleView.title = "工具栏";
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

  async closeToolBlock(toolId = this.activeToolId): Promise<KtcToolBlockState> {
    if (toolId === "codeAssistant") this.codeAssistantFeatureId = undefined;
    const closed = ktcCloseToolBlock(this.openToolIds, toolId);
    this.openToolIds = [...closed.openToolIds];
    if (closed.nextToolId) {
      await this.restoreToolBlock(closed.nextToolId);
      return this.getToolBlockState();
    }
    await this.setModulePanelContext(false);
    if (this.moduleView) this.moduleView.title = "工具栏";
    this.postToViews({ type: "openTools", activeToolId: this.activeToolId, openToolIds: [] });
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
    return vscode.workspace
      .getConfiguration("ktAutoCode")
      .get<"ribbon" | "compact">("sidebar.toolPickerStyle", "ribbon");
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
      workspaceLabel: workingContext.label,
      workspaceFileScopeId: "workspace",
      pluginIgnoreEnabled: workingContext.pluginIgnoreEnabled,
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
    const codeTools: ToolSummary[] = getTools().map((t) => {
      const model = t.getPanelModel();
      const icon = model.summary.icon?.startsWith("media/")
        ? target.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, model.summary.icon)).toString()
        : model.summary.icon;
      return {
        id: model.summary.id,
        title: model.summary.title,
        description: model.summary.description,
        icon,
        ribbonVisible: model.summary.ribbonVisible ?? t.ribbonVisible,
        moduleId: "code" as const,
        moduleTitle: "Code",
      };
    });
    const optionalTools = this.getInstalledModuleContributions().flatMap(({ extensionUri, contribution }) => (
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
    const tools = [...codeTools, ...optionalTools];

    if (tools.length > 0 && !tools.some((t) => t.id === this.activeToolId)) {
      this.activeToolId = codeTools[0]!.id;
    }

    const ribbonLayout = await this.getRibbonLayout(this.getRibbonLayoutTools());
    const workingContext = this.getWorkingContext();
    target.title = "工具栏";
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
      presentation: "detailBlock",
      recentWorkingDirectories: this.getRecentWorkingDirectories(),
      workspaceFileScopes: [],
      selectedWorkspaceFileScopes: {},
      workspaceFileScopeError: "工作集已停用。",
      moduleState: this.moduleState,
      extensionInstallations: ktcWelcomeExtensionSummaries(vscode.extensions.all),
    });

    for (const [toolId, state] of this.toolStates) {
      // The rule picker is a one-time UI request, not durable tool state. Replaying
      // it after switching tools would reopen the modal without a user action.
      const { associatedRulePicker: _associatedRulePicker, ...replayableState } = state;
      postToWebview(target, { type: "state", toolId, state: replayableState });
    }
    await this.sendActiveModuleBlock(target);
  }

  private async onMessage(message: WebviewInboundMessage, source: vscode.WebviewView): Promise<void> {
    if (message.type === "ready") {
      source.title = "工具栏";
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
      await this.closeToolBlock();
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

    if (message.type === "toggleRibbonDensity") {
      await vscode.commands.executeCommand("ktAutoCode.sidebar.toggleStyle");
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
      const result = await ktcIgnoreController.handle(message, this.getWorkingContext().resolvedDirectory, (summary) => {
        this.postToViews({ type: "ignoreConfig", ignoreConfig: summary });
      });
      if (result.error) {
        this.setToolState("ignoreSettings", { status: "error", message: result.error });
      } else if (result.recommendations) {
        const previous = this.toolStates.get("ignoreSettings")?.ignoreSelectedGroupIds ?? [];
        const selectable = new Set(result.recommendations.recommendations
          .filter((group) => group.suggestedRules.length > 0)
          .map((group) => group.groupId));
        this.setToolState("ignoreSettings", {
          status: "done",
          message: result.message,
          ignoreRecommendations: result.recommendations,
          ignoreSelectedGroupIds: message.type === "analyzeIgnore"
            ? ktcDefaultIgnoreGroupIds(result.recommendations.recommendations)
            : previous.filter((groupId) => selectable.has(groupId)),
        });
      } else if (result.summary) {
        this.setToolState("ignoreSettings", { status: "done", message: result.summary.statusText });
      }
      return;
    }

    if (message.type === "selectTool") {
      await this.showTool(message.toolId);
      return;
    }

    if (message.type === "openCodeAssistantFeature") {
      this.codeAssistantFeatureId = message.feature;
      this.createRunContext("codeAssistant").log(`[代码辅助][入口][INFO] 已打开：头文件引用修正；目录 ${this.getWorkingContext().label}。`);
      await this.sendInit(source);
      await vscode.commands.executeCommand("ktAutoCode.codeAssistant.packageIncludes");
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

  private getInstalledModuleIds(): KtcModuleId[] {
    return ["code", ...this.getInstalledModuleContributions().map(({ contribution }) => contribution.id)];
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

  private getToolTitle(toolId: string): string | undefined {
    return getTool(toolId)?.title
      ?? this.getInstalledModuleContributions()
        .flatMap(({ contribution }) => contribution.tools)
        .find((tool) => tool.id === toolId)?.title;
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

  private async restoreToolBlock(toolId: string): Promise<boolean> {
    const moduleId = this.getToolModuleId(toolId);
    if (!moduleId) return false;
    if (moduleId === "code") {
      await this.showTool(toolId);
      return true;
    }
    return this.showModuleTool(moduleId, toolId);
  }

  private async sendActiveModuleBlock(target: vscode.WebviewView): Promise<void> {
    if (this.moduleState.active === "code") {
      postToWebview(target, { type: "moduleBlock", moduleId: "code" });
      return;
    }
    const moduleId = this.moduleState.active;
    const provider = this.moduleBlockProviders.get(moduleId);
    if (!provider) {
      postToWebview(target, {
        type: "moduleBlock",
        moduleId,
        content: { title: this.getToolTitle(this.activeToolId) ?? "模块工具", html: "<p>模块正在激活…</p>" },
      });
      return;
    }
    try {
      const content = await provider.render(this.activeToolId);
      target.title = "工具栏";
      postToWebview(target, { type: "moduleBlock", moduleId, content });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postToWebview(target, {
        type: "moduleBlock",
        moduleId,
        content: { title: "模块工具", html: `<p>模块界面渲染失败：${escapeHtml(message)}</p>` },
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
    const pluginIgnoreEnabled = this.workspaceState.get<boolean>(PLUGIN_IGNORE_STATE_KEY, true);
    return {
      selectedDirectory,
      resolvedDirectory,
      label: resolvedDirectory ? basename(resolvedDirectory) : "未打开目录",
      pluginIgnoreEnabled,
      gitIgnoreExists: !!resolvedDirectory && !!findNearestGitIgnore(resolvedDirectory),
    };
  }

  private postWorkingContext(): void {
    const context = this.getWorkingContext();
    this.postToViews({ type: "workingContext", context, directories: this.getRecentWorkingDirectories() });
    this.postToViews({ type: "ignoreConfig", ignoreConfig: ktcIgnoreController.snapshot(context.resolvedDirectory) });
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
