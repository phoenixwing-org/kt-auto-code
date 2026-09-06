import * as vscode from "vscode";
import type { KtcIgnoreMessage } from "../../ignoreController.js";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";

type KtcIgnoreSettingsCommandRunner = (message: KtcIgnoreMessage) => Promise<void>;

let commandRunner: KtcIgnoreSettingsCommandRunner | undefined;

export const ignoreSettingsTool: KtTool = {
  id: "ignoreSettings",
  title: "忽略设置",
  description: "管理插件、Git 与项目自定义 Ignore；递归文件工具共用这些规则。",
  icon: "media/tools/ignore-settings.svg",

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.ignore.open", () => runIgnoreCommand({ type: "openIgnoreFile" })),
      vscode.commands.registerCommand("ktAutoCode.ignore.sync", () => runIgnoreCommand({ type: "syncIgnoreFromGit" })),
      vscode.commands.registerCommand("ktAutoCode.ignore.analyze", () => runIgnoreCommand({ type: "analyzeIgnore" })),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) await this.runAction(message.action, ctx);
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    const message: KtcIgnoreMessage = action === "sync"
      ? { type: "syncIgnoreFromGit" }
      : { type: "openIgnoreFile" };
    if (!commandRunner) {
      ctx.postState({ status: "error", message: "Ignore Host 尚未初始化。" });
      return;
    }
    await commandRunner(message);
  },
};

export function setIgnoreSettingsCommandRunner(runner: KtcIgnoreSettingsCommandRunner | undefined): void {
  commandRunner = runner;
}

async function runIgnoreCommand(message: KtcIgnoreMessage): Promise<void> {
  await vscode.commands.executeCommand("ktAutoCode.tool.show", "ignoreSettings");
  await commandRunner?.(message);
}
