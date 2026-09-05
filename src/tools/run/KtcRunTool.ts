import * as vscode from "vscode";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { KtcRunController, type KtcRunActionMessage } from "./KtcRunController.js";

const KtcController = new KtcRunController();

export const KtcRunTool: KtTool = {
  id: "run",
  title: "Run",
  description: "发现并运行当前工作区的 Task、脚本、可执行文件与 CAA/CMake 目标。",
  icon: "media/tools/KtcRun.svg",

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context): void {
    KtcController.register(context);
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.run.open", () => {
        void vscode.commands.executeCommand("ktAutoCode.tool.show", this.id);
      }),
    );
  },

  onDidShow(ctx): Promise<void> {
    return KtcController.refresh(ctx);
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    const action = KtcParseRunAction(message);
    if (action) await KtcController.handle(action, ctx);
  },

  runAction(_action: string, ctx: ToolRunContext): Promise<void> {
    return KtcController.refresh(ctx);
  },
};

export function KtcParseRunAction(message: unknown): KtcRunActionMessage | undefined {
  if (!message || typeof message !== "object") return undefined;
  const candidate = message as Record<string, unknown>;
  if (candidate.type !== "runAction" || candidate.toolId !== "run" || typeof candidate.action !== "string") return undefined;
  if (["refresh", "openOutput", "openProblems", "openTerminal", "cleanBuild", "cleanObjects", "cleanObj"].includes(candidate.action)) {
    return candidate as unknown as KtcRunActionMessage;
  }
  if ((candidate.action === "runTarget" || candidate.action === "dryRunTarget" || candidate.action === "openSource")
    && typeof candidate.targetId === "string") {
    return candidate as unknown as KtcRunActionMessage;
  }
  if (candidate.action === "stopRun" && typeof candidate.runId === "string") {
    return candidate as unknown as KtcRunActionMessage;
  }
  if ((candidate.action === "selectCaaRelated" || candidate.action === "addCaaRelatedFolder")
    && typeof candidate.projectId === "string") return candidate as unknown as KtcRunActionMessage;
  if (candidate.action === "setCaaVersion"
    && typeof candidate.projectId === "string"
    && typeof candidate.value === "string") return candidate as unknown as KtcRunActionMessage;
  return undefined;
}
