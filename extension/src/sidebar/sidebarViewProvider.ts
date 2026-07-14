import * as vscode from "vscode";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { logOutput } from "../output.js";
import { getTool, getTools } from "../tools/registry.js";
import type {
  KtcRecentWorkingDirectories,
  ToolRunContext,
  ToolUiState,
  WebviewInboundMessage,
} from "../tools/types.js";
import { setHeaderAsciiRunContextFactory } from "../tools/headerAscii/index.js";
import { setEncodingFixRunContextFactory } from "../tools/encodingFix/index.js";
import { setUuidReplaceRunContextFactory } from "../tools/uuidReplace/index.js";
import { setCaaDialogRunContextFactory } from "../tools/caaDialog/index.js";
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

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ktAutoCode.sidebar";

  private view?: vscode.WebviewView;
  private activeToolId = "headerAscii";
  private toolStates = new Map<string, ToolUiState>();
  private readonly searchReplaceProfiles = new KtcSearchReplaceProfileController();
  private readonly recentExternalDirectories: KtcRecentWorkingDirectoryStore;
  private readonly recentWorkspaceDirectories: KtcRecentWorkspaceDirectoryStore;

  constructor(
    private readonly extensionUri: vscode.Uri,
    globalState: vscode.Memento,
    workspaceState: vscode.Memento,
  ) {
    this.recentExternalDirectories = new KtcRecentWorkingDirectoryStore(globalState);
    this.recentWorkspaceDirectories = new KtcRecentWorkspaceDirectoryStore(workspaceState);
    setHeaderAsciiRunContextFactory(() => this.createRunContext("headerAscii"));
    setEncodingFixRunContextFactory(() => this.createRunContext("encodingFix"));
    setUuidReplaceRunContextFactory(() => this.createRunContext("uuidReplace"));
    setCaaDialogRunContextFactory(() => this.createRunContext("caaDialog"));
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = getPanelHtml(webviewView.webview, this.extensionUri);

    webviewView.webview.onDidReceiveMessage((message: WebviewInboundMessage) => {
      void this.onMessage(message);
    });
  }

  refreshWorkspaceLabel(): void {
    postToWebview(this.view, { type: "workspace", label: getWorkspaceLabel() });
    this.refreshIgnoreConfig();
    this.refreshSearchReplaceProfiles();
  }

  refreshIgnoreConfig(): void {
    postToWebview(this.view, {
      type: "ignoreConfig",
      ignoreConfig: ktcIgnoreController.snapshot(getWorkspaceRoot()),
    });
  }

  refreshToolOptions(toolId = "headerAscii"): void {
    postToWebview(this.view, { type: "options", toolId, options: this.getToolOptions(toolId) });
    postToWebview(this.view, { type: "scope", scope: getFileScope() });
  }

  refreshScope(): void {
    postToWebview(this.view, { type: "scope", scope: getFileScope() });
  }

  refreshSidebarStyle(): void {
    postToWebview(this.view, { type: "sidebarStyle", style: this.getSidebarStyle() });
  }

  requestSearchReplacePreview(): void {
    this.activeToolId = "codeRename";
    this.sendInit();
    postToWebview(this.view, { type: "requestSearchReplacePreview" });
  }

  refreshSearchReplaceProfiles(): void {
    postToWebview(this.view, {
      type: "searchReplaceProfiles",
      ...this.searchReplaceProfiles.snapshot(getWorkspaceRoot()),
    });
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

  private createRunContext(toolId: string): ToolRunContext {
    return {
      workspaceRoot: getWorkspaceRoot(),
      workspaceLabel: getWorkspaceLabel(),
      postState: (state) => this.setToolState(toolId, state),
      log: (text) => logOutput(text),
    };
  }

  private setToolState(toolId: string, state: ToolUiState): void {
    this.toolStates.set(toolId, state);
    postToWebview(this.view, { type: "state", toolId, state });
  }

  private sendInit(): void {
    const tools = getTools().map((t) => {
      const model = t.getPanelModel();
      const icon = model.summary.icon?.startsWith("media/") && this.view
        ? this.view.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, model.summary.icon)).toString()
        : model.summary.icon;
      return {
        id: model.summary.id,
        title: model.summary.title,
        description: model.summary.description,
        icon,
      };
    });

    if (tools.length > 0 && !tools.some((t) => t.id === this.activeToolId)) {
      this.activeToolId = tools[0]!.id;
    }

    const profileSnapshot = this.searchReplaceProfiles.snapshot(getWorkspaceRoot());
    postToWebview(this.view, {
      type: "init",
      tools,
      activeToolId: this.activeToolId,
      workspaceLabel: getWorkspaceLabel(),
      scope: getFileScope(),
      ignoreConfig: ktcIgnoreController.snapshot(getWorkspaceRoot()),
      toolOptions: this.getAllToolOptions(),
      sidebarStyle: this.getSidebarStyle(),
      recentWorkingDirectories: this.getRecentWorkingDirectories(),
      searchReplaceProfiles: profileSnapshot.profiles,
      searchReplaceProfileError: profileSnapshot.error,
    });

    for (const [toolId, state] of this.toolStates) {
      // The rule picker is a one-time UI request, not durable tool state. Replaying
      // it after switching tools would reopen the modal without a user action.
      const { associatedRulePicker: _associatedRulePicker, ...replayableState } = state;
      postToWebview(this.view, { type: "state", toolId, state: replayableState });
    }
  }

  private async onMessage(message: WebviewInboundMessage): Promise<void> {
    if (message.type === "ready") {
      this.sendInit();
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

    if (ktcIsIgnoreMessage(message)) {
      await ktcIgnoreController.handle(message, getWorkspaceRoot(), (summary) => {
        postToWebview(this.view, { type: "ignoreConfig", ignoreConfig: summary });
      });
      return;
    }

    if (message.type === "saveSearchReplaceProfile" || message.type === "loadSearchReplaceProfile") {
      const root = getWorkspaceRoot();
      if (!root) {
        void vscode.window.showWarningMessage("请先打开工作区文件夹。");
        return;
      }
      try {
        const snapshot = message.type === "saveSearchReplaceProfile"
          ? await this.searchReplaceProfiles.save(root, message.draft)
          : this.searchReplaceProfiles.load(root, message.id);
        if (snapshot) {
          postToWebview(this.view, { type: "searchReplaceProfiles", ...snapshot });
          if (message.type === "saveSearchReplaceProfile" && snapshot.selectedProfile) {
            void vscode.window.showInformationMessage(`规则档案“${snapshot.selectedProfile.label}”已保存。`);
          }
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(text);
        postToWebview(this.view, {
          type: "searchReplaceProfiles",
          profiles: this.searchReplaceProfiles.snapshot(root).profiles,
          error: text,
        });
      }
      return;
    }

    if (message.type === "selectTool") {
      this.activeToolId = message.toolId;
      this.sendInit();
      const showResultCommand = {
        headerAscii: "ktAutoCode.headerAsciiResult.show",
        encodingFix: "ktAutoCode.encodingResult.show",
        codeRename: "ktAutoCode.codeRenameResult.show",
        reorderMembers: "ktAutoCode.reorderMembers.showResults",
        uuidReplace: "ktAutoCode.uuidReplace.showResults",
        caaDialog: "ktAutoCode.caaDialog.showResults",
      }[message.toolId];
      if (showResultCommand) await vscode.commands.executeCommand(showResultCommand);
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
        const ctx = this.createRunContext(message.toolId);
        await tool.handleMessage(message, ctx);
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

    const ctx = this.createRunContext(message.toolId);
    await tool.handleMessage(message, ctx);
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
    postToWebview(this.view, {
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
}
