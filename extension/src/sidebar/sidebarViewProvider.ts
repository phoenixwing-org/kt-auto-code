import * as vscode from "vscode";
import { logOutput } from "../output.js";
import { getTool, getTools } from "../tools/registry.js";
import type { ToolRunContext, ToolUiState, WebviewInboundMessage } from "../tools/types.js";
import { setHeaderAsciiRunContextFactory } from "../tools/headerAscii/index.js";
import { setEncodingFixRunContextFactory } from "../tools/encodingFix/index.js";
import { getPreserveGbk, getStripBom } from "../tools/headerAscii/options.js";
import { getFileScope, setFileScopeOption, type ScopeOptionKey } from "../scopeOptions.js";
import { getWorkspaceLabel, getWorkspaceRoot } from "../workspace.js";
import {
  openIgnoreConfigFile,
  refreshIgnoreConfig,
  syncIgnoreFromGit,
} from "../ignoreConfig.js";
import { getPanelHtml, postToWebview } from "./panelHtml.js";
import type { ToolOptionsState } from "../tools/types.js";

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "ktAutoCode.sidebar";

  private view?: vscode.WebviewView;
  private activeToolId = "headerAscii";
  private toolStates = new Map<string, ToolUiState>();

  constructor(private readonly extensionUri: vscode.Uri) {
    setHeaderAsciiRunContextFactory(() => this.createRunContext("headerAscii"));
    setEncodingFixRunContextFactory(() => this.createRunContext("encodingFix"));
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
  }

  refreshIgnoreConfig(): void {
    postToWebview(this.view, {
      type: "ignoreConfig",
      ignoreConfig: refreshIgnoreConfig(getWorkspaceRoot()),
    });
  }

  refreshToolOptions(toolId = "headerAscii"): void {
    postToWebview(this.view, { type: "options", toolId, options: this.getToolOptions(toolId) });
    postToWebview(this.view, { type: "scope", scope: getFileScope() });
  }

  refreshScope(): void {
    postToWebview(this.view, { type: "scope", scope: getFileScope() });
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
      return {
        id: model.summary.id,
        title: model.summary.title,
        description: model.summary.description,
        icon: model.summary.icon,
      };
    });

    if (tools.length > 0 && !tools.some((t) => t.id === this.activeToolId)) {
      this.activeToolId = tools[0]!.id;
    }

    postToWebview(this.view, {
      type: "init",
      tools,
      activeToolId: this.activeToolId,
      workspaceLabel: getWorkspaceLabel(),
      scope: getFileScope(),
      ignoreConfig: refreshIgnoreConfig(getWorkspaceRoot()),
      toolOptions: this.getAllToolOptions(),
    });

    for (const [toolId, state] of this.toolStates) {
      postToWebview(this.view, { type: "state", toolId, state });
    }
  }

  private async onMessage(message: WebviewInboundMessage): Promise<void> {
    if (message.type === "ready") {
      this.sendInit();
      return;
    }

    if (message.type === "openIgnoreFile") {
      const root = getWorkspaceRoot();
      if (!root) {
        void vscode.window.showWarningMessage("请先打开工作区文件夹。");
        return;
      }
      await openIgnoreConfigFile(root);
      this.refreshIgnoreConfig();
      return;
    }

    if (message.type === "syncIgnoreFromGit") {
      const root = getWorkspaceRoot();
      if (!root) {
        void vscode.window.showWarningMessage("请先打开工作区文件夹。");
        return;
      }
      const summary = syncIgnoreFromGit(root);
      postToWebview(this.view, { type: "ignoreConfig", ignoreConfig: summary });
      if (!summary.gitIgnoreExists) {
        void vscode.window.showWarningMessage("工作区无 .gitignore，无法同步。");
      } else {
        void vscode.window.showInformationMessage("已从 .gitignore 同步到 .phoenix/.ignore。");
      }
      return;
    }

    if (message.type === "selectTool") {
      this.activeToolId = message.toolId;
      this.sendInit();
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

    const tool = getTool(message.toolId);
    if (!tool) {
      return;
    }

    const ctx = this.createRunContext(message.toolId);
    await tool.handleMessage(message, ctx);
  }
}
