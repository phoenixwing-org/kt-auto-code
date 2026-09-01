import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { openEncodingFile, runEncodingFixAction } from "./commands.js";
import {
  openWorkspaceEncodingSettings,
  setWorkspaceDefaultEncodingTarget,
} from "./options.js";
export const encodingFixTool: KtTool = {
  id: "encodingFix",
  title: "编码修正",
  description:
    "按当前项目策略检测并无损转换 ASCII、UTF-8、GBK 与带 BOM 文件。",
  icon: "media/tools/encoding-convert.svg",
  ribbonVisible: false,
  runActions: ["scan", "convert"],

  getPanelModel(): ToolPanelModel {
    return {
      summary: {
        id: this.id,
        title: "编码修正",
        description: this.description,
        icon: this.icon,
        ribbonVisible: this.ribbonVisible,
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
    if (message.type === "setEncodingDefaultTarget" && message.toolId === this.id) {
      await setWorkspaceDefaultEncodingTarget(message.target);
      return;
    }
    if (message.type === "openEncodingSettings" && message.toolId === this.id) {
      await openWorkspaceEncodingSettings();
      return;
    }
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
  clearSession(ctx: ToolRunContext): void {
    ctx.postState({ status: "idle", message: "", encodingResults: [], scanned: 0, issueFiles: 0 });
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
