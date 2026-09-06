import * as vscode from "vscode";
import { dirname } from "node:path";
import {
  ktcExtensionRuntimeProvenanceLine,
  ktcLocalWingStatusBarModel,
} from "./buildProvenance.js";
import { appendOutputLine } from "./output.js";
import { SidebarViewProvider } from "./sidebar/sidebarViewProvider.js";
import { registerTool, getTools } from "./tools/registry.js";
import { headerAsciiTool } from "./tools/headerAscii/index.js";
import { encodingFixTool } from "./tools/encodingFix/index.js";
import { codeRenameTool } from "./tools/codeRename/index.js";
import { registerReorderMembersSupport, reorderMembersTool } from "./tools/reorderMembers/index.js";
import { ignoreSettingsTool } from "./tools/ignoreSettings/index.js";
import { uuidReplaceTool } from "./tools/uuidReplace/index.js";
import { caaDialogTool } from "./tools/caaDialog/index.js";
import { getGitRuntimeDiagnosticsSnapshot, KtcGitTool } from "./tools/git/KtcGitTool.js";
import { KtcRunTool } from "./tools/run/KtcRunTool.js";
import { environmentSettingsTool } from "./tools/environmentSettings/index.js";
import { codeAssistantTool, registerCodeAssistantSupport } from "./tools/codeAssistant/index.js";
import {
  codegenTool,
  getCodegenRuntimeDiagnosticsSnapshot,
  notifyCodegenWorkspaceFoldersChanged,
  registerCodegenSupport,
} from "./tools/codegen/index.js";
import { invalidateWorkspaceIgnorePatterns } from "./ignoreConfig.js";
import { ktcOpenCaaSettings, ktcResolveDeskToolsNativeProvider } from "./caaSettings.js";
import { ktcMigrateLegacyDeskToolsSettings } from "./deskToolsSettingsMigration.js";
import { ktcRegisterResultAccordion } from "./workbench/resultAccordion.js";
import { ktcRegisterEditorMatchHighlight } from "./workbench/editorMatchHighlight.js";
import { ktcRegisterRuntimeDiagnostics } from "./runtimeDiagnostics.js";
import { ktcRegisterProjectRenameAnalysis } from "./tools/projectRename/index.js";
import type { KtcAutoCodeShellApiV2 } from "./core/moduleShellContract.js";

let sidebarProvider: SidebarViewProvider | undefined;

export type { KtcAutoCodeShellApiV2 } from "./core/moduleShellContract.js";

export async function activate(context: vscode.ExtensionContext): Promise<KtcAutoCodeShellApiV2> {
  appendOutputLine(ktcExtensionRuntimeProvenanceLine(context.extensionPath));
  try {
    const migrated = await ktcMigrateLegacyDeskToolsSettings();
    if (migrated.length) appendOutputLine(`[Desk Tools] 已迁移旧设置：${migrated.join(", ")}`);
  } catch (error) {
    appendOutputLine(`[Desk Tools] 旧设置迁移失败，继续使用兼容读取：${error instanceof Error ? error.message : String(error)}`);
  }
  const localWingStatus = ktcLocalWingStatusBarModel(context.extensionPath);
  if (localWingStatus) {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    item.name = localWingStatus.name;
    item.text = localWingStatus.text;
    item.tooltip = localWingStatus.tooltip;
    item.show();
    context.subscriptions.push(item);
  }
  await vscode.commands.executeCommand("setContext", "ktAutoCode.modulePanel.activeTool", "");
  await vscode.commands.executeCommand("setContext", "ktAutoCode.modulePanelVisible", false);
  ktcRegisterEditorMatchHighlight(context);
  registerReorderMembersSupport(context);
  registerCodegenSupport(context);
  registerCodeAssistantSupport(context);
  ktcRegisterProjectRenameAnalysis(context);
  registerTool(headerAsciiTool);
  registerTool(encodingFixTool);
  registerTool(ignoreSettingsTool);
  registerTool(environmentSettingsTool);
  registerTool(codeRenameTool);
  registerTool(codegenTool);
  registerTool(reorderMembersTool);
  registerTool(codeAssistantTool);
  registerTool(uuidReplaceTool);
  registerTool(caaDialogTool);
  registerTool(KtcGitTool);
  registerTool(KtcRunTool);

  sidebarProvider = new SidebarViewProvider(context.extensionUri, context.globalState, context.workspaceState);
  await sidebarProvider.initializeModuleState();
  ktcRegisterRuntimeDiagnostics(
    context,
    () => sidebarProvider!.getRuntimeDiagnosticsSnapshot(),
    getCodegenRuntimeDiagnosticsSnapshot,
    getGitRuntimeDiagnosticsSnapshot,
  );
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
    vscode.commands.registerCommand("ktAutoCode.deskTools.openSettings", () => ktcOpenCaaSettings()),
    vscode.commands.registerCommand("ktAutoCode.deskTools.resolveNativeProvider", () => ktcResolveDeskToolsNativeProvider() || undefined),
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
    vscode.commands.registerCommand("ktAutoCode.ribbon.customize", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code");
      sidebarProvider?.openRibbonCustomization();
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarViewProvider.moduleViewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      sidebarProvider?.refreshWorkspaceLabel();
      notifyCodegenWorkspaceFoldersChanged();
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
        || e.affectsConfiguration("ktAutoCode.encodingFix")
        || e.affectsConfiguration("ktAutoCode.scope.includeHeaders")
        || e.affectsConfiguration("ktAutoCode.scope.includeSource")
        || e.affectsConfiguration("ktAutoCode.scope.includeMarkdown")
        || e.affectsConfiguration("ktAutoCode.sidebar.toolPickerStyle")) {
        sidebarProvider?.refreshToolOptions("headerAscii");
        sidebarProvider?.refreshToolOptions("encodingFix");
        sidebarProvider?.refreshScope();
        sidebarProvider?.refreshSidebarStyle();
      }
      if (e.affectsConfiguration("ktAutoCode.encodingFix")) {
        sidebarProvider?.invalidateEncodingFixResults();
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
  if (normalized.endsWith("/.phoenix/.ignore")) return dirname(dirname(document.uri.fsPath));
  if (normalized.endsWith("/.gitignore")) return dirname(document.uri.fsPath);
  return undefined;
}
