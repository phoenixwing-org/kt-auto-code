import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { openEncodingFile, runEncodingFixAction } from "./commands.js";
export const encodingFixTool: KtTool = {
  id: "encodingFix",
  title: "编码修正",
  description:
    "检测文件编码，并将 GBK、UTF-8 BOM 和 UTF-16 转为 UTF-8。",
  icon: "media/tools/encoding-convert.svg",

  getPanelModel(): ToolPanelModel {
    return {
      summary: {
        id: this.id,
        title: "编码修正",
        description: this.description,
        icon: this.icon,
      },
    };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    const makeHandler = (action: string) => async () => {
      await vscode.commands.executeCommand("ktAutoCode.tool.show", this.id);
      const ctx = getRunContext();
      if (!ctx) return;
      await runWithResults(action, ctx);
    };

    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.encodingFix.scan", makeHandler("scan")),
      vscode.commands.registerCommand("ktAutoCode.encodingFix.convert", makeHandler("convert")),
      vscode.commands.registerCommand("ktAutoCode.encodingFix.openFile", openEncodingFile),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) {
      await runWithResults(message.action, ctx);
      return;
    }
    if (message.type === "openEncodingFile" && message.toolId === this.id) {
      await openEncodingFile(message.file);
    }
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    await runWithResults(action, ctx);
  },
};

async function runWithResults(action: string, ctx: ToolRunContext): Promise<void> {
  // The module Webview owns both controls and cached results. Do not activate a
  // second TreeView after scanning/converting; update the current Block in place.
  await runEncodingFixAction(action, ctx);
}

let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export function setEncodingFixRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

function getRunContext(): ToolRunContext | undefined {
  return runContextFactory?.();
}
