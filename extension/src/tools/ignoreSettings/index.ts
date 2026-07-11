import * as vscode from "vscode";
import { ktcIgnoreController, type KtcIgnoreMessage } from "../../ignoreController.js";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { getWorkspaceRoot } from "../../workspace.js";

export const ignoreSettingsTool: KtTool = {
  id: "ignoreSettings",
  title: "忽略设置",
  description: "管理工作区 .phoenix/.ignore；编码扫描、转码和搜索替换共用这些规则。",
  icon: "media/tools/ignore-settings.svg",

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.ignore.open", async () => {
        await ktcIgnoreController.handle({ type: "openIgnoreFile" }, getWorkspaceRoot());
      }),
      vscode.commands.registerCommand("ktAutoCode.ignore.sync", async () => {
        await ktcIgnoreController.handle({ type: "syncIgnoreFromGit" }, getWorkspaceRoot());
      }),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) await this.runAction(message.action, ctx);
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    const message: KtcIgnoreMessage = action === "sync"
      ? { type: "syncIgnoreFromGit" }
      : { type: "openIgnoreFile" };
    const result = await ktcIgnoreController.handle(message, ctx.workspaceRoot);
    if (result.error) ctx.postState({ status: "error", message: result.error });
    else ctx.postState({ status: "done", message: result.summary?.statusText ?? "已打开 .phoenix/.ignore。" });
  },
};
