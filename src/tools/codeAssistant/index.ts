import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { KtcPackageIncludeViewController } from "./packageIncludeViewController.js";

let packageIncludeView: KtcPackageIncludeViewController | undefined;
let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export function registerCodeAssistantSupport(context: vscode.ExtensionContext): void {
  packageIncludeView = new KtcPackageIncludeViewController(context.workspaceState);
  context.subscriptions.push({ dispose: () => packageIncludeView?.dispose() });
}

export const codeAssistantTool: KtTool = {
  id: "codeAssistant",
  title: "代码辅助",
  description: "低频代码迁移和修正工具；选择功能后在右侧 View 中预览并写入。",
  icon: "media/tools/code-assistant.svg",

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.codeAssistant.open", () => {
        void vscode.commands.executeCommand("ktAutoCode.tool.show", "codeAssistant");
      }),
      vscode.commands.registerCommand("ktAutoCode.codeAssistant.packageIncludes", async () => {
        await openPackageIncludes(runContextFactory?.()?.workspaceRoot);
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
    await openPackageIncludes(ctx.workspaceRoot);
    ctx.postState({ status: "done", message: "已打开头文件引用修正 View。" });
  },
};

async function openPackageIncludes(defaultTargetDirectory?: string): Promise<void> {
  if (!packageIncludeView) {
    void vscode.window.showErrorMessage("代码辅助尚未初始化，请重新加载 VS Code 窗口。");
    return;
  }
  await packageIncludeView.show(defaultTargetDirectory);
}

export function setCodeAssistantRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}
