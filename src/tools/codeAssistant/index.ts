import * as vscode from "vscode";
import type {
  KtTool,
  KtcNavigationDescriptor,
  ToolPanelModel,
  ToolRunContext,
} from "../types.js";
import { KtcPackageIncludeViewController } from "./packageIncludeViewController.js";
import { KtcAutoBuildViewController } from "./autoBuildViewController.js";
import type {
  KtcEditorPrimaryCompanionActionToken,
  KtcEditorPrimaryCompanionSnapshot,
} from "../../core/editorPrimaryCompanionContracts.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import type { KtcWorkspaceIgnoreSourceOptions } from "../../ignoreConfig.js";

const AUTO_BUILD_TOOL_REGISTRATION = ktcRequireToolRegistration("autoBuild");
const CODE_ASSISTANT_GROUP_REGISTRATION = ktcRequireToolRegistration("codeAssistant");
const PACKAGE_INCLUDES_TOOL_REGISTRATION = ktcRequireToolRegistration("packageIncludes");

let packageIncludeView: KtcPackageIncludeViewController | undefined;
let autoBuildView: KtcAutoBuildViewController | undefined;
type KtcCodeAssistantLeafId = "packageIncludes" | "autoBuild";
let runContextFactory: ((toolId: KtcCodeAssistantLeafId) => ToolRunContext | undefined) | undefined;
let primaryCompanionHost: KtcCodeAssistantPrimaryCompanionHost | undefined;

export interface KtcCodeAssistantPrimaryCompanionHost {
  activate(toolId: "packageIncludes" | "autoBuild"): Promise<void> | void;
  onDidChange(snapshot: KtcEditorPrimaryCompanionSnapshot): Promise<void> | void;
}

export function registerCodeAssistantSupport(context: vscode.ExtensionContext): void {
  packageIncludeView = new KtcPackageIncludeViewController(context.extensionUri, context.workspaceState, undefined, {
    onDidChange: (snapshot) => { void primaryCompanionHost?.onDidChange(snapshot); },
  });
  autoBuildView = new KtcAutoBuildViewController(context.extensionUri, context.workspaceState, {
    onDidChange: (snapshot) => { void primaryCompanionHost?.onDidChange(snapshot); },
  });
  context.subscriptions.push({ dispose: () => packageIncludeView?.dispose() });
  context.subscriptions.push({ dispose: () => autoBuildView?.dispose() });
  context.subscriptions.push(
    vscode.commands.registerCommand("ktAutoCode.codeAssistant.open", () => {
      void vscode.commands.executeCommand("ktAutoCode.tool.show", "codeAssistant");
    }),
    vscode.commands.registerCommand("ktAutoCode.codeAssistant.packageIncludes", async () => {
      const ctx = runContextFactory?.("packageIncludes");
      await primaryCompanionHost?.activate("packageIncludes");
      await openPackageIncludes(ctx?.workspaceRoot, ctx);
    }),
    vscode.commands.registerCommand("ktAutoCode.codeAssistant.autoBuild", async () => {
      await primaryCompanionHost?.activate("autoBuild");
      await autoBuildView?.show(runContextFactory?.("autoBuild")?.workspaceRoot);
    }),
  );
}

/** Ribbon/Toolbar parent only; it is intentionally not a KtTool. */
export const codeAssistantNavigationDescriptor: KtcNavigationDescriptor = Object.freeze({
  id: CODE_ASSISTANT_GROUP_REGISTRATION.toolId,
  title: CODE_ASSISTANT_GROUP_REGISTRATION.title,
  shortTitle: CODE_ASSISTANT_GROUP_REGISTRATION.shortTitle,
  description: CODE_ASSISTANT_GROUP_REGISTRATION.description,
  icon: `media/tools/${CODE_ASSISTANT_GROUP_REGISTRATION.icon}.svg`,
  kind: "group",
});

/** Hidden Ribbon leaf with a Right View and a Primary companion projection. */
export const packageIncludesCompanionTool: KtTool = {
  id: PACKAGE_INCLUDES_TOOL_REGISTRATION.toolId,
  title: PACKAGE_INCLUDES_TOOL_REGISTRATION.title,
  description: PACKAGE_INCLUDES_TOOL_REGISTRATION.description,
  icon: PACKAGE_INCLUDES_TOOL_REGISTRATION.icon,
  ribbonVisible: false,

  getPanelModel(): ToolPanelModel {
    return {
      summary: {
        id: this.id,
        title: this.title,
        shortTitle: PACKAGE_INCLUDES_TOOL_REGISTRATION.shortTitle,
        description: this.description,
        icon: this.icon,
        ribbonVisible: false,
      },
    };
  },

  registerCommands(): void {},
  async handleMessage(): Promise<void> {},

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (action !== "open") {
      ctx.postState({ status: "error", message: `未知${PACKAGE_INCLUDES_TOOL_REGISTRATION.title}动作：${action}` });
      return;
    }
    await openPackageIncludes(ctx.workspaceRoot, ctx);
  },

  async runEditorCompanionAction(
    token: KtcEditorPrimaryCompanionActionToken,
    ctx: ToolRunContext,
  ): Promise<void> {
    if (await packageIncludeView?.runPrimaryCompanionAction(token)) return;
    ctx.log(`[${PACKAGE_INCLUDES_TOOL_REGISTRATION.title}][Primary][WARN] 已丢弃过期或不可用动作：${token.actionId}。`);
  },
};

/** Hidden Ribbon leaf: navigation depth does not create a second tool runtime. */
export const autoBuildCompanionTool: KtTool = {
  id: AUTO_BUILD_TOOL_REGISTRATION.toolId,
  title: AUTO_BUILD_TOOL_REGISTRATION.title,
  description: AUTO_BUILD_TOOL_REGISTRATION.description,
  icon: AUTO_BUILD_TOOL_REGISTRATION.icon,
  ribbonVisible: false,

  getPanelModel(): ToolPanelModel {
    return {
      summary: {
        id: this.id,
        title: this.title,
        shortTitle: AUTO_BUILD_TOOL_REGISTRATION.shortTitle,
        description: this.description,
        icon: this.icon,
        ribbonVisible: false,
      },
    };
  },

  registerCommands(): void {},

  async handleMessage(): Promise<void> {},

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (action !== "open") {
      ctx.postState({ status: "error", message: `未知${AUTO_BUILD_TOOL_REGISTRATION.title}动作：${action}` });
      return;
    }
    await autoBuildView?.show(ctx.workspaceRoot);
  },

  async runEditorCompanionAction(
    token: KtcEditorPrimaryCompanionActionToken,
    ctx: ToolRunContext,
  ): Promise<void> {
    if (await autoBuildView?.runPrimaryCompanionAction(token)) return;
    ctx.log(`[${AUTO_BUILD_TOOL_REGISTRATION.title}][Primary][WARN] 已丢弃过期或不可用动作：${token.actionId}。`);
  },
};

async function openPackageIncludes(defaultTargetDirectory?: string, ctx?: ToolRunContext): Promise<void> {
  if (!packageIncludeView) {
    void vscode.window.showErrorMessage("代码辅助尚未初始化，请重新加载 VS Code 窗口。");
    return;
  }
  await packageIncludeView.show(defaultTargetDirectory, ctx ? {
    ignoreEnabled: ctx.ignoreEnabled ?? true,
    builtInIgnoreEnabled: ctx.builtInIgnoreEnabled ?? true,
    gitIgnoreEnabled: ctx.gitIgnoreEnabled ?? true,
    customIgnoreEnabled: ctx.customIgnoreEnabled ?? ctx.pluginIgnoreEnabled,
  } : undefined);
}

export function setCodeAssistantRunContextFactory(
  factory: (toolId: KtcCodeAssistantLeafId) => ToolRunContext | undefined,
): void {
  runContextFactory = factory;
}

export function updateCodeAssistantIgnoreSources(sources: KtcWorkspaceIgnoreSourceOptions): void {
  packageIncludeView?.setIgnoreSources(sources);
}

export function refreshCodeAssistantIgnorePolicy(): void {
  packageIncludeView?.refreshIgnorePolicy();
}

export function setCodeAssistantPrimaryCompanionHost(
  host: KtcCodeAssistantPrimaryCompanionHost | undefined,
): void {
  primaryCompanionHost = host;
}
