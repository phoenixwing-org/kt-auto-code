import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { openEncodingFile, runEncodingFixAction } from "./commands.js";

export const encodingFixTool: KtTool = {
  id: "encodingFix",
  title: "编码修正",
  description:
    "检测整文件编码（ASCII / GBK / UTF-8 / BOM / UTF-16），默认目标为 UTF-8 无 BOM。支持 GBK→UTF-8、去 BOM、UTF-16→UTF-8；不默认 UTF-8→GBK。",
  icon: "file-code",

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
    const makeHandler = (action: string) => () => {
      const ctx = getRunContext();
      if (!ctx) return;
      void runEncodingFixAction(action, ctx);
    };

    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.encodingFix.scan", makeHandler("scan")),
      vscode.commands.registerCommand("ktAutoCode.encodingFix.convert", makeHandler("convert")),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) {
      await runEncodingFixAction(message.action, ctx);
      return;
    }
    if (message.type === "openEncodingFile" && message.toolId === this.id) {
      await openEncodingFile(message.file);
    }
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    await runEncodingFixAction(action, ctx);
  },
};

let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export function setEncodingFixRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

function getRunContext(): ToolRunContext | undefined {
  return runContextFactory?.();
}
