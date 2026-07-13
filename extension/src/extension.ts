import * as vscode from "vscode";
import { dirname } from "node:path";
import { SidebarViewProvider } from "./sidebar/sidebarViewProvider.js";
import { registerTool, getTools } from "./tools/registry.js";
import { headerAsciiTool } from "./tools/headerAscii/index.js";
import { encodingFixTool } from "./tools/encodingFix/index.js";
import { codeRenameTool } from "./tools/codeRename/index.js";
import { ignoreSettingsTool } from "./tools/ignoreSettings/index.js";
import { invalidateWorkspaceIgnorePatterns } from "./ignoreConfig.js";

let sidebarProvider: SidebarViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  registerTool(headerAsciiTool);
  registerTool(encodingFixTool);
  registerTool(ignoreSettingsTool);
  registerTool(codeRenameTool);

  sidebarProvider = new SidebarViewProvider(context.extensionUri, context.globalState, context.workspaceState);

  for (const tool of getTools()) {
    tool.registerCommands(context);
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      sidebarProvider?.refreshWorkspaceLabel();
    }),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      if (ignoreRootForDocument(document)) sidebarProvider?.refreshIgnoreConfig();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      const root = ignoreRootForDocument(document);
      if (root) {
        invalidateWorkspaceIgnorePatterns(root);
        sidebarProvider?.refreshIgnoreConfig();
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (ignoreRootForDocument(document)) sidebarProvider?.refreshIgnoreConfig();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ktAutoCode.headerAscii.preserveGbk")
        || e.affectsConfiguration("ktAutoCode.headerAscii.stripBom")
        || e.affectsConfiguration("ktAutoCode.scope.includeHeaders")
        || e.affectsConfiguration("ktAutoCode.scope.includeSource")
        || e.affectsConfiguration("ktAutoCode.scope.includeMarkdown")
        || e.affectsConfiguration("ktAutoCode.sidebar.toolPickerStyle")) {
        sidebarProvider?.refreshToolOptions("headerAscii");
        sidebarProvider?.refreshScope();
        sidebarProvider?.refreshSidebarStyle();
      }
    }),
  );
}

export function deactivate(): void {
  sidebarProvider = undefined;
}

function ignoreRootForDocument(document: vscode.TextDocument): string | undefined {
  if (document.uri.scheme !== "file") return undefined;
  const normalizedPath = document.uri.fsPath.replace(/\\/g, "/");
  const normalized = process.platform === "win32" || process.platform === "darwin"
    ? normalizedPath.toLocaleLowerCase("en-US")
    : normalizedPath;
  if (!normalized.endsWith("/.phoenix/.ignore")) return undefined;
  return dirname(dirname(document.uri.fsPath));
}
