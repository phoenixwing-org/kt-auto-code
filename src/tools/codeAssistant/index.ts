import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { KtcPackageIncludeViewController } from "./packageIncludeViewController.js";
import { KtcAutoBuildViewController } from "./autoBuildViewController.js";
import type {
  KtcEditorPrimaryCompanionActionToken,
  KtcEditorPrimaryCompanionSnapshot,
} from "../../core/editorPrimaryCompanionContracts.js";

let packageIncludeView: KtcPackageIncludeViewController | undefined;
let autoBuildView: KtcAutoBuildViewController | undefined;
let runContextFactory: (() => ToolRunContext | undefined) | undefined;
let primaryCompanionHost: KtcCodeAssistantPrimaryCompanionHost | undefined;

export interface KtcCodeAssistantPrimaryCompanionHost {
  activate(toolId: "autoBuild"): Promise<void> | void;
  onDidChange(snapshot: KtcEditorPrimaryCompanionSnapshot): Promise<void> | void;
}

export function registerCodeAssistantSupport(context: vscode.ExtensionContext): void {
  packageIncludeView = new KtcPackageIncludeViewController(context.workspaceState);
  autoBuildView = new KtcAutoBuildViewController(context.extensionUri, context.workspaceState, {
    onDidChange: (snapshot) => { void primaryCompanionHost?.onDidChange(snapshot); },
  });
  context.subscriptions.push({ dispose: () => packageIncludeView?.dispose() });
  context.subscriptions.push({ dispose: () => autoBuildView?.dispose() });
}

export const codeAssistantTool: KtTool = {
  id: "codeAssistant",
  title: "代码辅助",
  description: "低频代码迁移和修正工具；选择功能后在右侧 View 中预览并写入。",
  icon: "media/tools/code-assistant.svg",
  runActions: ["openPackageIncludes"],

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.codeAssistant.open", () => {
        void vscode.commands.executeCommand("ktAutoCode.tool.show", "codeAssistant");
      }),
      vscode.commands.registerCommand("ktAutoCode.codeAssistant.packageIncludes", async () => {
        const ctx = runContextFactory?.();
        await openPackageIncludes(ctx?.workspaceRoot, ctx);
      }),
      vscode.commands.registerCommand("ktAutoCode.codeAssistant.autoBuild", async () => {
        await primaryCompanionHost?.activate("autoBuild");
        await autoBuildView?.show(runContextFactory?.()?.workspaceRoot);
      }),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) await this.runAction(message.action, ctx);
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (action !== "openPackageIncludes") {
      ctx.postState({ status: "error", message: `未知代码辅助功能：${action}` });
      return;
    }
    await openPackageIncludes(ctx.workspaceRoot, ctx);
    ctx.postState({ status: "done", message: "已打开头文件引用修正 View。" });
  },
};

/** Hidden Ribbon leaf: navigation depth does not create a second tool runtime. */
export const autoBuildCompanionTool: KtTool = {
  id: "autoBuild",
  title: "自动编译",
  description: "在 Primary 查看编译任务摘要；完整配置与项目表保留在右侧 View。",
  icon: "media/tools/KtcRun.svg",
  ribbonVisible: false,

  getPanelModel(): ToolPanelModel {
    return {
      summary: {
        id: this.id,
        title: this.title,
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
      ctx.postState({ status: "error", message: `未知自动编译动作：${action}` });
      return;
    }
    await autoBuildView?.show(ctx.workspaceRoot);
  },

  async runEditorCompanionAction(
    token: KtcEditorPrimaryCompanionActionToken,
    ctx: ToolRunContext,
  ): Promise<void> {
    if (await autoBuildView?.runPrimaryCompanionAction(token)) return;
    ctx.log(`[自动编译][Primary][WARN] 已丢弃过期或不可用动作：${token.actionId}。`);
  },
};

async function openPackageIncludes(defaultTargetDirectory?: string, ctx?: ToolRunContext): Promise<void> {
  if (!packageIncludeView) {
    void vscode.window.showErrorMessage("代码辅助尚未初始化，请重新加载 VS Code 窗口。");
    return;
  }
  await packageIncludeView.show(defaultTargetDirectory, ctx ? {
    builtInIgnoreEnabled: ctx.builtInIgnoreEnabled ?? true,
    gitIgnoreEnabled: ctx.gitIgnoreEnabled ?? true,
    customIgnoreEnabled: ctx.customIgnoreEnabled ?? ctx.pluginIgnoreEnabled,
  } : undefined);
}

export function setCodeAssistantRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

export function setCodeAssistantPrimaryCompanionHost(
  host: KtcCodeAssistantPrimaryCompanionHost | undefined,
): void {
  primaryCompanionHost = host;
}
