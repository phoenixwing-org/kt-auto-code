import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { openEncodingFile, runEncodingFixAction } from "./commands.js";
import { KtcEncodingResultView } from "../../workbench/encodingResultView.js";

let encodingResultView: KtcEncodingResultView | undefined;
export function registerEncodingResultView(context: vscode.ExtensionContext): void { encodingResultView = new KtcEncodingResultView(context); context.subscriptions.push(encodingResultView); }

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
    const makeHandler = (action: string) => () => {
      const ctx = getRunContext();
      if (!ctx) return;
      void runWithResults(action, ctx);
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

async function runWithResults(action: string, ctx: ToolRunContext): Promise<void> { await runEncodingFixAction(action, { ...ctx, postState: (state) => { ctx.postState(state); if (state.status === "done" && state.encodingResults) encodingResultView?.show(state.encodingResults); } }); }

let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export function setEncodingFixRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

function getRunContext(): ToolRunContext | undefined {
  return runContextFactory?.();
}
