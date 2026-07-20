import * as vscode from "vscode";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { logOutput } from "../output.js";
import { getTool, getTools } from "../tools/registry.js";
import type {
  KtcRecentWorkingDirectories,
  ToolRunContext,
  ToolSummary,
  ToolUiState,
  WebviewInboundMessage,
} from "../tools/types.js";
import { setHeaderAsciiRunContextFactory } from "../tools/headerAscii/index.js";
import { setEncodingFixRunContextFactory } from "../tools/encodingFix/index.js";
import { setCodeRenameRunContextFactory } from "../tools/codeRename/index.js";
import { setUuidReplaceRunContextFactory } from "../tools/uuidReplace/index.js";
import { setCaaDialogRunContextFactory } from "../tools/caaDialog/index.js";
import { setReorderMembersRunContextFactory } from "../tools/reorderMembers/index.js";
import { setIgnoreSettingsRunContextFactory } from "../tools/ignoreSettings/index.js";
import { setCodegenRunContextFactory } from "../tools/codegen/index.js";
import { getPreserveGbk, getStripBom } from "../tools/headerAscii/options.js";
import { getFileScope, setFileScopeOption, type ScopeOptionKey } from "../scopeOptions.js";
import { getWorkspaceLabel, getWorkspaceRoot } from "../workspace.js";
import { getPanelHtml, postToWebview } from "./panelHtml.js";
import type { ToolOptionsState } from "../tools/types.js";
import { KtcSearchReplaceProfileController } from "../searchReplaceProfileController.js";
import { ktcIgnoreController, ktcIsIgnoreMessage } from "../ignoreController.js";
import {
  KtcRecentWorkingDirectoryStore,
  KtcRecentWorkspaceDirectoryStore,
} from "../recentWorkingDirectories.js";
import { ktcClassifyWorkingDirectory } from "../searchReplaceLocation.js";
import { ktcIsPathInsideWorkspace } from "../../../src/workspace/workspacePath.js";
import { ktcActivateResultAccordion } from "../workbench/resultAccordion.js";
import { ktcListWorkspaceFileScopes, ktcOpenWorkspaceWorksets } from "../worksets.js";
import { ktcActivateToolBlock, ktcCloseToolBlock } from "./toolBlockHistory.js";
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
} from "../../../src/moduleShellContract.js";

const FILE_SCOPE_STATE_KEY = "ktAutoCode.workspaceFileScopes";
const MODULE_STATE_KEY = "ktAutoCode.modules.v1";

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

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ktAutoCode.sidebar";
  public static readonly moduleViewType = "ktAutoCode.modulePanel";

  private ribbonView?: vscode.WebviewView;
  private moduleView?: vscode.WebviewView;
  private activeToolId = "headerAscii";
  private openToolIds: string[] = [];
  private toolStates = new Map<string, ToolUiState>();
  private readonly searchReplaceProfiles = new KtcSearchReplaceProfileController();
  private readonly recentExternalDirectories: KtcRecentWorkingDirectoryStore;
  private readonly recentWorkspaceDirectories: KtcRecentWorkspaceDirectoryStore;
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
  }

  async initializeModuleState(): Promise<void> {
    await this.syncModuleState();
  }

  async refreshInstalledModules(): Promise<void> {
    const installed = this.getInstalledModuleIds();
    if (installed.length === this.moduleState.installed.length
      && installed.every((moduleId, index) => this.moduleState.installed[index] === moduleId)) return;
    this.moduleState = ktcCreateModuleState(installed, ktcPersistedModuleState(this.moduleState));
    await this.syncModuleState();
    if (this.ribbonView) await this.sendInit(this.ribbonView);
    if (this.moduleView) await this.sendInit(this.moduleView);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    if (webviewView.viewType === SidebarViewProvider.moduleViewType) this.moduleView = webviewView;
    else this.ribbonView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = getPanelHtml(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage((message: WebviewInboundMessage) => {
      void this.onMessage(message, webviewView);
    });
    webviewView.onDidDispose(() => {
      if (this.ribbonView === webviewView) this.ribbonView = undefined;
      if (this.moduleView === webviewView) this.moduleView = undefined;
    });
    if (webviewView.viewType === SidebarViewProvider.moduleViewType) {
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) ktcActivateResultAccordion(SidebarViewProvider.moduleViewType);
      });
    }
  }

  refreshWorkspaceLabel(): void {
    this.postToViews({ type: "workspace", label: getWorkspaceLabel() });
    this.refreshIgnoreConfig();
    this.refreshSearchReplaceProfiles();
    void this.refreshWorkspaceFileScopes();
  }

  refreshIgnoreConfig(): void {
    this.postToViews({
      type: "ignoreConfig",
      ignoreConfig: ktcIgnoreController.snapshot(getWorkspaceRoot()),
    });
  }

  refreshToolOptions(toolId = "headerAscii"): void {
    this.postToViews({ type: "options", toolId, options: this.getToolOptions(toolId) });
    this.postToViews({ type: "scope", scope: getFileScope() });
  }

  refreshScope(): void {
    this.postToViews({ type: "scope", scope: getFileScope() });
  }

  refreshSidebarStyle(): void {
    this.postToViews({ type: "sidebarStyle", style: this.getSidebarStyle() });
  }

  async requestSearchReplacePreview(): Promise<void> {
    await this.showTool("codeRename");
    postToWebview(this.moduleView, { type: "requestSearchReplacePreview" });
  }

  refreshSearchReplaceProfiles(): void {
    this.postToViews({
      type: "searchReplaceProfiles",
      ...this.searchReplaceProfiles.snapshot(getWorkspaceRoot()),
    });
  }

  /** Opens the tool interface block; results are rendered in the same block. */
  async showTool(toolId: string): Promise<void> {
    const tool = getTool(toolId);
    if (!tool) return;
    if (this.isToolBlockVisible(toolId)) return;
    await this.activateModule("code");
    this.activeToolId = toolId;
    this.openToolIds = ktcActivateToolBlock(this.openToolIds, toolId);
    ktcActivateResultAccordion(SidebarViewProvider.moduleViewType);
    await this.setModulePanelContext(true, toolId);
    await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
    if (this.ribbonView) await this.sendInit(this.ribbonView);
    if (this.moduleView) {
      this.moduleView.title = tool.title;
      await this.sendInit(this.moduleView);
      this.moduleView.show(false);
    } else {
      try { await vscode.commands.executeCommand(`${SidebarViewProvider.moduleViewType}.focus`); } catch { /* view resolves lazily */ }
    }
    if (toolId === "environmentSettings") await tool.runAction("refresh", this.createRunContext(toolId));
    if (toolId === "caaDialog") await tool.runAction("checkConnection", this.createRunContext(toolId));
    if (toolId === "codegen") await tool.runAction("activate", this.createRunContext(toolId));
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
    if (this.ribbonView) await this.sendInit(this.ribbonView);
    if (this.moduleView) {
      this.moduleView.title = moduleTools.find((tool) => tool.id === toolId)?.title ?? "工具界面";
      await this.sendInit(this.moduleView);
      this.moduleView.show(false);
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
    const closed = ktcCloseToolBlock(this.openToolIds, toolId);
    this.openToolIds = [...closed.openToolIds];
    if (closed.nextToolId) {
      await this.restoreToolBlock(closed.nextToolId);
      return this.getToolBlockState();
    }
    await this.setModulePanelContext(false);
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
    return {};
  }

  private getAllToolOptions(): Record<string, ToolOptionsState> {
    return {
      headerAscii: this.getToolOptions("headerAscii"),
      encodingFix: this.getToolOptions("encodingFix"),
    };
  }

  private createRunContext(toolId: string, transientTarget?: vscode.WebviewView): ToolRunContext {
    return {
      workspaceRoot: getWorkspaceRoot(),
      workspaceLabel: getWorkspaceLabel(),
      workspaceFileScopeId: this.getSelectedWorkspaceFileScopeId(toolId),
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
      this.ribbonView,
      this.ribbonView === transientTarget ? transientMessage : durableMessage,
    );
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

    const profileSnapshot = this.searchReplaceProfiles.snapshot(getWorkspaceRoot());
    const fileScopeSnapshot = await this.getWorkspaceFileScopeSnapshot();
    postToWebview(target, {
      type: "init",
      tools,
      activeToolId: this.activeToolId,
      openToolIds: this.openToolIds,
      workspaceLabel: getWorkspaceLabel(),
      scope: getFileScope(),
      ignoreConfig: ktcIgnoreController.snapshot(getWorkspaceRoot()),
      toolOptions: this.getAllToolOptions(),
      sidebarStyle: this.getSidebarStyle(),
      presentation: target.viewType === SidebarViewProvider.moduleViewType ? "detailBlock" : "ribbon",
      recentWorkingDirectories: this.getRecentWorkingDirectories(),
      searchReplaceProfiles: profileSnapshot.profiles,
      searchReplaceProfileError: profileSnapshot.error,
      workspaceFileScopes: fileScopeSnapshot.scopes,
      selectedWorkspaceFileScopes: this.getSelectedWorkspaceFileScopes(),
      workspaceFileScopeError: fileScopeSnapshot.error,
      moduleState: this.moduleState,
    });

    for (const [toolId, state] of this.toolStates) {
      // The rule picker is a one-time UI request, not durable tool state. Replaying
      // it after switching tools would reopen the modal without a user action.
      const { associatedRulePicker: _associatedRulePicker, ...replayableState } = state;
      postToWebview(target, { type: "state", toolId, state: replayableState });
    }
    if (target.viewType === SidebarViewProvider.moduleViewType) await this.sendActiveModuleBlock(target);
  }

  private async onMessage(message: WebviewInboundMessage, source: vscode.WebviewView): Promise<void> {
    if (message.type === "ready") {
      if (source.viewType === SidebarViewProvider.moduleViewType) {
        source.title = this.getToolTitle(this.activeToolId) ?? "工具界面";
      }
      await this.sendInit(source);
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

    if (message.type === "runModuleTool") {
      const tool = this.getModuleTools(message.moduleId).find((candidate) => (
        candidate.moduleId === message.moduleId && candidate.command === message.command
      ));
      if (!tool || !await this.showModuleTool(message.moduleId, tool.id)) return;
      await vscode.commands.executeCommand(message.command);
      return;
    }

    if (message.type === "selectWorkspaceFileScope") {
      const snapshot = await this.getWorkspaceFileScopeSnapshot();
      if (!snapshot.scopes.some((scope) => scope.id === message.scopeId)) {
        this.postToViews({
          type: "workspaceFileScopes",
          scopes: snapshot.scopes,
          selected: this.getSelectedWorkspaceFileScopes(),
          error: snapshot.error || "所选工作集已不存在，请重新选择。",
        });
        return;
      }
      const selected = { ...this.getSelectedWorkspaceFileScopes(), [message.toolId]: message.scopeId };
      await this.workspaceState.update(FILE_SCOPE_STATE_KEY, selected);
      this.postToViews({ type: "workspaceFileScopes", scopes: snapshot.scopes, selected });
      if (message.toolId === "codegen") {
        await getTool("codegen")?.runAction(
          "workspaceScopeChanged",
          this.createRunContext("codegen", source),
        );
      }
      return;
    }

    if (message.type === "openWorkspaceWorksets") {
      const root = getWorkspaceRoot();
      if (!root) {
        this.setToolState(this.activeToolId, { status: "error", message: "请先打开工作区，再配置工作集。" });
        return;
      }
      try { await ktcOpenWorkspaceWorksets(vscode.Uri.file(root)); }
      catch (error) { this.setToolState(this.activeToolId, { status: "error", message: error instanceof Error ? error.message : String(error) }); }
      return;
    }

    if (message.type === "pickSearchReplaceDirectory") {
      const workspaceRoot = getWorkspaceRoot();
      const recent = this.getRecentWorkingDirectories();
      const defaultPath = workspaceRoot && recent.workspace[0]
        ? resolve(workspaceRoot, recent.workspace[0])
        : recent.external[0] ?? workspaceRoot;
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined,
        openLabel: "选择工作目录",
        title: "选择搜索替换工作目录",
      });
      const directory = selected?.[0]?.fsPath;
      if (!directory) return;
      await this.rememberWorkingDirectory(directory, true);
      return;
    }

    if (message.type === "rememberSearchReplaceDirectory") {
      await this.rememberWorkingDirectory(message.directory);
      return;
    }

    if (message.type === "ignoreSelection") {
      this.setToolState("ignoreSettings", { status: "idle", ignoreSelectedGroupIds: message.groupIds });
      return;
    }

    if (ktcIsIgnoreMessage(message)) {
      const result = await ktcIgnoreController.handle(message, getWorkspaceRoot(), (summary) => {
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
            ? result.recommendations.recommendations
              .filter((group) => group.defaultSelected && group.suggestedRules.length > 0)
              .map((group) => group.groupId)
            : previous.filter((groupId) => selectable.has(groupId)),
        });
      } else if (result.summary) {
        this.setToolState("ignoreSettings", { status: "done", message: result.summary.statusText });
      }
      return;
    }

    if (message.type === "saveSearchReplaceProfile" || message.type === "loadSearchReplaceProfile") {
      const root = getWorkspaceRoot();
      if (!root) {
        this.setToolState("codeRename", { status: "error", message: "请先打开工作区文件夹。" });
        return;
      }
      try {
        const snapshot = message.type === "saveSearchReplaceProfile"
          ? await this.searchReplaceProfiles.save(root, message.draft, message.label)
          : this.searchReplaceProfiles.load(root, message.id);
        if (snapshot) {
          this.postToViews({ type: "searchReplaceProfiles", ...snapshot });
          if (message.type === "saveSearchReplaceProfile" && snapshot.selectedProfile) {
            this.setToolState("codeRename", {
              status: "done",
              message: `规则档案“${snapshot.selectedProfile.label}”已保存到当前工作区。`,
            });
          }
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        this.setToolState("codeRename", { status: "error", message: text });
        this.postToViews({
          type: "searchReplaceProfiles",
          profiles: this.searchReplaceProfiles.snapshot(root).profiles,
          error: text,
        });
      }
      return;
    }

    if (message.type === "selectTool") {
      await this.showTool(message.toolId);
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
      return;
    }

    const ctx = this.createRunContext(message.toolId, source);
    try { await tool.handleMessage(message, ctx); }
    catch (error) { this.postUnhandledToolError(message.toolId, error); }
  }

  async refreshWorkspaceFileScopes(): Promise<void> {
    const snapshot = await this.getWorkspaceFileScopeSnapshot();
    this.postToViews({
      type: "workspaceFileScopes",
      scopes: snapshot.scopes,
      selected: this.getSelectedWorkspaceFileScopes(),
      error: snapshot.error,
    });
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
      target.title = content.title;
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

  private getSelectedWorkspaceFileScopes(): Record<string, string> {
    return this.workspaceState.get<Record<string, string>>(FILE_SCOPE_STATE_KEY) ?? {};
  }

  private getSelectedWorkspaceFileScopeId(toolId: string): string {
    return this.getSelectedWorkspaceFileScopes()[toolId] || "workspace";
  }

  private async getWorkspaceFileScopeSnapshot(): Promise<{
    scopes: Awaited<ReturnType<typeof ktcListWorkspaceFileScopes>>;
    error?: string;
  }> {
    const root = getWorkspaceRoot();
    if (!root) return { scopes: [] };
    try { return { scopes: await ktcListWorkspaceFileScopes(vscode.Uri.file(root)) }; }
    catch (error) { return { scopes: [], error: error instanceof Error ? error.message : String(error) }; }
  }

  private postUnhandledToolError(toolId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    logOutput(`[${toolId}] ${message}`);
    this.setToolState(toolId, { status: "error", message: `执行失败：${message}` });
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
    };
  }

  private postToViews(message: Parameters<typeof postToWebview>[1]): void {
    postToWebview(this.ribbonView, message);
    postToWebview(this.moduleView, message);
  }
}
