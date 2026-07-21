import * as vscode from "vscode";
import type { KtTool, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { KtcGitController, type KtcGitActionMessage } from "./KtcGitController.js";

const KtcController = new KtcGitController();

export const KtcGitTool: KtTool = {
  id: "git",
  title: "Git 提交整理",
  description: "生成 commit 群消息简报，或安全合并本地连续 commit。",
  icon: "media/tools/KtcGit.svg",

  getPanelModel() {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context): void {
    KtcController.register(context);
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.git.open", () => {
        void vscode.commands.executeCommand("ktAutoCode.tool.show", this.id);
      }),
    );
  },

  onDidShow(ctx): Promise<void> {
    return KtcController.refresh(ctx);
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    const action = KtcParseGitAction(message);
    if (action) await KtcController.handle(action, ctx);
  },

  runAction(_action: string, ctx: ToolRunContext): Promise<void> {
    return KtcController.refresh(ctx);
  },
};

export function KtcParseGitAction(message: unknown): KtcGitActionMessage | undefined {
  if (!message || typeof message !== "object") return undefined;
  const candidate = message as Record<string, unknown>;
  if (candidate.type !== "gitAction" || candidate.toolId !== "git" || typeof candidate.action !== "string") return undefined;
  if (["refresh", "openScm", "openOutput", "closeSummary", "cancelSquash"].includes(candidate.action)) {
    return candidate as unknown as KtcGitActionMessage;
  }
  if (candidate.action === "openAction"
    && typeof candidate.actionId === "string"
    && typeof candidate.repositoryId === "string") return candidate as unknown as KtcGitActionMessage;
  if (candidate.action === "selectCommits"
    && KtcIsStringArray(candidate.selectedOids)
    && typeof candidate.repositoryId === "string"
    && typeof candidate.copyAfterGenerate === "boolean") return candidate as unknown as KtcGitActionMessage;
  if (candidate.action === "saveSummaryTextHeight"
    && typeof candidate.height === "number"
    && Number.isFinite(candidate.height)) return candidate as unknown as KtcGitActionMessage;
  if (candidate.action === "copySummary"
    && typeof candidate.repositoryId === "string"
    && KtcIsStringArray(candidate.selectedOids)
    && typeof candidate.text === "string") return candidate as unknown as KtcGitActionMessage;
  if (candidate.action === "updateSummaryOptions"
    && typeof candidate.repositoryId === "string"
    && KtcIsStringArray(candidate.selectedOids)
    && typeof candidate.includeRemoteUrl === "boolean"
    && typeof candidate.includeCommitTime === "boolean"
    && typeof candidate.mentionReviewer === "boolean"
    && typeof candidate.reviewer === "string") return candidate as unknown as KtcGitActionMessage;
  if (candidate.action === "undoSquash" && typeof candidate.repositoryId === "string") {
    return candidate as unknown as KtcGitActionMessage;
  }
  if (candidate.action === "loadMore" && typeof candidate.repositoryId === "string") {
    return candidate as unknown as KtcGitActionMessage;
  }
  if (candidate.action === "executeSquash"
    && typeof candidate.repositoryId === "string"
    && typeof candidate.expectedHeadOid === "string"
    && Array.isArray(candidate.selectedOids)
    && candidate.selectedOids.every((oid) => typeof oid === "string")
    && typeof candidate.message === "string"
    && KtcIsGitIdentity(candidate.author)
    && KtcIsGitIdentity(candidate.committer)) return candidate as unknown as KtcGitActionMessage;
  return undefined;
}

function KtcIsStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string");
}

function KtcIsGitIdentity(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const identity = value as Record<string, unknown>;
  return typeof identity.name === "string"
    && typeof identity.email === "string"
    && typeof identity.date === "string";
}
