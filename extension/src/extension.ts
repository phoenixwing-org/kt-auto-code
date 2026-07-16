import * as vscode from "vscode";
import { dirname } from "node:path";
import { SidebarViewProvider } from "./sidebar/sidebarViewProvider.js";
import { registerTool, getTools } from "./tools/registry.js";
import { headerAsciiTool } from "./tools/headerAscii/index.js";
import { encodingFixTool } from "./tools/encodingFix/index.js";
import { codeRenameTool } from "./tools/codeRename/index.js";
import { registerReorderMembersSupport, reorderMembersTool } from "./tools/reorderMembers/index.js";
import { ignoreSettingsTool } from "./tools/ignoreSettings/index.js";
import { uuidReplaceTool } from "./tools/uuidReplace/index.js";
import { caaDialogTool } from "./tools/caaDialog/index.js";
import { environmentSettingsTool } from "./tools/environmentSettings/index.js";
import { invalidateWorkspaceIgnorePatterns } from "./ignoreConfig.js";
import { ktcOpenWorkspaceWorksets } from "./worksets.js";
import { ktcRegisterResultAccordion } from "./workbench/resultAccordion.js";
import { ktcRegisterEditorMatchHighlight } from "./workbench/editorMatchHighlight.js";
import type { KtcAutoCodeShellApiV2 } from "../../src/moduleShellContract.js";

let sidebarProvider: SidebarViewProvider | undefined;

export type { KtcAutoCodeShellApiV2 } from "../../src/moduleShellContract.js";

export async function activate(context: vscode.ExtensionContext): Promise<KtcAutoCodeShellApiV2> {
  await vscode.commands.executeCommand("setContext", "ktAutoCode.modulePanelVisible", false);
  ktcRegisterEditorMatchHighlight(context);
  registerReorderMembersSupport(context);
  registerTool(headerAsciiTool);
  registerTool(encodingFixTool);
  registerTool(ignoreSettingsTool);
  registerTool(environmentSettingsTool);
  registerTool(codeRenameTool);
  registerTool(reorderMembersTool);
  registerTool(uuidReplaceTool);
  registerTool(caaDialogTool);

  sidebarProvider = new SidebarViewProvider(context.extensionUri, context.globalState, context.workspaceState);
  await sidebarProvider.initializeModuleState();
  context.subscriptions.push(ktcRegisterResultAccordion(SidebarViewProvider.moduleViewType, sidebarProvider));

  for (const tool of getTools()) {
    tool.registerCommands(context);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("ktAutoCode.tool.show", (toolId: string) => {
      void sidebarProvider?.showTool(toolId);
    }),
    vscode.commands.registerCommand("ktAutoCode.settings.headerAscii", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:kuntai.kt-auto-code headerAscii");
    }),
    vscode.commands.registerCommand("ktAutoCode.settings.scope", () => {
      void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:kuntai.kt-auto-code scope");
    }),
    vscode.commands.registerCommand("ktAutoCode.codeRename.openAdvanced", () => {
      void sidebarProvider?.showTool("codeRename");
    }),
    vscode.commands.registerCommand("ktAutoCode.ignore.openAdvanced", () => {
      void sidebarProvider?.showTool("ignoreSettings");
    }),
    vscode.commands.registerCommand("ktAutoCode.sidebar.toggleStyle", async () => {
      const config = vscode.workspace.getConfiguration("ktAutoCode");
      const current = config.get<"ribbon" | "compact">("sidebar.toolPickerStyle", "ribbon");
      await config.update(
        "sidebar.toolPickerStyle",
        current === "ribbon" ? "compact" : "ribbon",
        vscode.ConfigurationTarget.Global,
      );
    }),
    vscode.commands.registerCommand("ktAutoCode.searchReplace.preview", () => {
      void sidebarProvider?.showTool("codeRename");
    }),
    vscode.commands.registerCommand("ktAutoCode.modulePanel.close", () => {
      void sidebarProvider?.closeToolBlock();
    }),
    vscode.commands.registerCommand("ktAutoCode.module.activate", (moduleId: unknown) => {
      if (typeof moduleId !== "string") return false;
      return sidebarProvider?.activateModule(moduleId) ?? false;
    }),
    vscode.commands.registerCommand("ktAutoCode.module.code.show", async () => {
      const state = sidebarProvider?.getModuleState();
      return state?.visible.includes("code") ? true : await sidebarProvider?.toggleModule("code") ?? false;
    }),
    vscode.commands.registerCommand("ktAutoCode.module.code.hide", async () => {
      const state = sidebarProvider?.getModuleState();
      return state && !state.visible.includes("code") ? true : await sidebarProvider?.toggleModule("code") ?? false;
    }),
    vscode.commands.registerCommand("ktAutoCode.reorderMembers.showResults", () => {
      void sidebarProvider?.showTool("reorderMembers");
    }),
    vscode.commands.registerCommand("ktAutoCode.reorderMembers.closeResults", () => {
      void sidebarProvider?.closeToolBlock();
    }),
    vscode.commands.registerCommand("ktAutoCode.worksets.open", async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!root) { void vscode.window.showErrorMessage("请先打开工作区，再配置工作集。"); return; }
      try { await ktcOpenWorkspaceWorksets(root); await sidebarProvider?.refreshWorkspaceFileScopes(); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.moduleViewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      sidebarProvider?.refreshWorkspaceLabel();
    }),
    vscode.extensions.onDidChange(() => {
      void sidebarProvider?.refreshInstalledModules().catch((error: unknown) => {
        void vscode.window.showErrorMessage(`刷新 KT Auto Code 模块失败：${error instanceof Error ? error.message : String(error)}`);
      });
    }),
    vscode.workspace.onDidChangeTextDocument(({ document }) => {
      if (ignoreRootForDocument(document)) sidebarProvider?.refreshIgnoreConfig();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.path.replace(/\\/g, "/").endsWith("/.phoenix/worksets.json")) {
        void sidebarProvider?.refreshWorkspaceFileScopes();
      }
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

  return {
    version: 2,
    getModuleState: () => sidebarProvider!.getModuleState(),
    activateModule: (moduleId) => sidebarProvider!.activateModule(moduleId),
    toggleModule: (moduleId) => sidebarProvider!.toggleModule(moduleId),
    registerModuleBlockProvider: (moduleId, provider) => sidebarProvider!.registerModuleBlockProvider(moduleId, provider),
    refreshModuleBlock: (moduleId) => sidebarProvider!.refreshModuleBlock(moduleId),
    showModuleTool: (moduleId, toolId) => sidebarProvider!.showModuleTool(moduleId, toolId),
    closeModuleTool: (moduleId, toolId) => sidebarProvider!.closeModuleTool(moduleId, toolId),
  };
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
