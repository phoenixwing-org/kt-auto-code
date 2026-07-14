import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { openIssueFile, runHeaderAsciiAction } from "./commands.js";
import { setPreserveGbk, setStripBom } from "./options.js";
import { KtcHeaderAsciiResultView } from "../../workbench/headerAsciiResultView.js";

let headerAsciiResultView: KtcHeaderAsciiResultView | undefined;
export function registerHeaderAsciiResultView(context: vscode.ExtensionContext): void {
  headerAsciiResultView = new KtcHeaderAsciiResultView(context);
  context.subscriptions.push(headerAsciiResultView);
}

export const headerAsciiTool: KtTool = {
  id: "headerAscii",
  title: "头文件 ASCII",
  description:
    "预检并修正头文件中的弯引号、GBK 注释和其他非 ASCII 内容。",
  icon: "media/tools/header-ascii.svg",

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
      void runWithResults(action, ctx);
    };

    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.headerAscii.scan", makeHandler("scan")),
      vscode.commands.registerCommand("ktAutoCode.headerAscii.fix", makeHandler("fix")),
      vscode.commands.registerCommand("ktAutoCode.headerAscii.openIssue", openIssueFile),
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
      await runWithResults(message.action, ctx);
      return;
    }
    if (message.type === "openIssue" && message.toolId === this.id) {
      await openIssueFile(message.file, message.line);
    }
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    await runWithResults(action, ctx);
  },
};

async function runWithResults(action: string, ctx: ToolRunContext): Promise<void> {
  await runHeaderAsciiAction(action, {
    ...ctx,
    postState: (state) => {
      ctx.postState(state);
      if (state.status === "done" && state.results) headerAsciiResultView?.show(state.results);
    },
  });
}

let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export function setHeaderAsciiRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

function getRunContext(): ToolRunContext | undefined {
  return runContextFactory?.();
}
