import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { openIssueFile, runHeaderAsciiAction } from "./commands.js";
import { setPreserveGbk, setStripBom } from "./options.js";

export const headerAsciiTool: KtTool = {
  id: "headerAscii",
  title: "头文件 ASCII",
  description:
    "CAA 头文件应仅含 ASCII：不宜 UTF-8，GBK 中文在本机虽合法，跨国协作仍易因代码页不同出错。本工具扫描并修正头文件中的弯引号、GBK 注释等多字节内容。",
  icon: "symbol-string",

  getPanelModel(): ToolPanelModel {
    return {
      summary: {
        id: this.id,
        title: "头文件 ASCII 修正",
        description: this.description,
        icon: this.icon,
      },
    };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    const makeHandler = (action: string) => () => {
      const ctx = getRunContext();
      if (!ctx) {
        return;
      }
      void runHeaderAsciiAction(action, ctx);
    };

    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.headerAscii.scan", makeHandler("scan")),
      vscode.commands.registerCommand("ktAutoCode.headerAscii.fix", makeHandler("fix")),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "setOption" && message.toolId === this.id && message.key === "preserveGbk") {
      await setPreserveGbk(message.value);
      return;
    }
    if (message.type === "setOption" && message.toolId === this.id && message.key === "stripBom") {
      await setStripBom(message.value);
      return;
    }
    if (message.type === "run" && message.toolId === this.id) {
      await runHeaderAsciiAction(message.action, ctx);
      return;
    }
    if (message.type === "openIssue" && message.toolId === this.id) {
      await openIssueFile(message.file, message.line);
    }
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    await runHeaderAsciiAction(action, ctx);
  },
};

let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export function setHeaderAsciiRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

function getRunContext(): ToolRunContext | undefined {
  return runContextFactory?.();
}
