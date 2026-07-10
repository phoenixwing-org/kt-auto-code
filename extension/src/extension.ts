import * as vscode from "vscode";
import { SidebarViewProvider } from "./sidebar/sidebarViewProvider.js";
import { registerTool, getTools } from "./tools/registry.js";
import { headerAsciiTool } from "./tools/headerAscii/index.js";
import { encodingFixTool } from "./tools/encodingFix/index.js";

let sidebarProvider: SidebarViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  registerTool(headerAsciiTool);
  registerTool(encodingFixTool);

  sidebarProvider = new SidebarViewProvider(context.extensionUri);

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
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ktAutoCode.headerAscii.preserveGbk")
        || e.affectsConfiguration("ktAutoCode.headerAscii.stripBom")
        || e.affectsConfiguration("ktAutoCode.scope.includeHeaders")
        || e.affectsConfiguration("ktAutoCode.scope.includeSource")
        || e.affectsConfiguration("ktAutoCode.scope.includeMarkdown")) {
        sidebarProvider?.refreshToolOptions("headerAscii");
        sidebarProvider?.refreshScope();
      }
    }),
  );
}

export function deactivate(): void {
  sidebarProvider = undefined;
}
