import * as vscode from "vscode";
import { KtcProjectRenameHost } from "../../projectRenameHost.js";
import {
  KtcProjectRenameViewController,
  type KtcProjectRenameCompanionActionId,
} from "./viewController.js";
import { KtcRenameHistoryStore } from "../../core/renameHistory.js";
import {
  KTC_PROJECT_RENAME_DIFF_SCHEME,
  KtcProjectRenameDiffDocumentProvider,
} from "./diffDocumentProvider.js";
import type { KtTool, ToolPanelModel, ToolRunContext } from "../types.js";
import type {
  KtcEditorPrimaryCompanionActionToken,
  KtcEditorPrimaryCompanionSnapshot,
} from "../../core/editorPrimaryCompanionContracts.js";

export const KTC_PROJECT_RENAME_OPEN_COMMAND = "ktAutoCode.projectRenameAnalysis.open";
let projectRenameController: KtcProjectRenameViewController | undefined;
let primaryCompanionHost: KtcProjectRenamePrimaryCompanionHost | undefined;

export interface KtcProjectRenamePrimaryCompanionHost {
  activate(toolId: "projectRename"): Promise<void> | void;
  onDidChange(snapshot: KtcEditorPrimaryCompanionSnapshot): Promise<void> | void;
}

export function ktcRegisterProjectRenameAnalysis(context: vscode.ExtensionContext): void {
  const diffDocuments = new KtcProjectRenameDiffDocumentProvider();
  const controller = new KtcProjectRenameViewController(
    context.extensionUri,
    new KtcProjectRenameHost(new KtcRenameHistoryStore(context.globalState), diffDocuments),
    { onCompanionEvent: ({ snapshot }) => { void primaryCompanionHost?.onDidChange(snapshot); } },
  );
  projectRenameController = controller;
  context.subscriptions.push(
    diffDocuments,
    vscode.workspace.registerTextDocumentContentProvider(KTC_PROJECT_RENAME_DIFF_SCHEME, diffDocuments),
    controller,
    vscode.commands.registerCommand(KTC_PROJECT_RENAME_OPEN_COMMAND, async (requestedRoot?: unknown) => {
      await primaryCompanionHost?.activate("projectRename");
      controller.show(requestedRoot);
    }),
    { dispose: () => { if (projectRenameController === controller) projectRenameController = undefined; } },
  );
}

/** Hidden Ribbon leaf used by the shared Primary Tool Surface runtime. */
export const projectRenameCompanionTool: KtTool = {
  id: "projectRename",
  title: "项目改名",
  description: "在 Primary 查看改名任务摘要；规则、风险和长结果保留在右侧 View。",
  icon: "media/tools/search-replace.svg",
  ribbonVisible: false,

  getPanelModel(): ToolPanelModel {
    return {
      summary: {
        id: this.id,
        title: this.title,
        description: this.description,
        icon: this.icon,
        ribbonVisible: false,
      },
    };
  },

  registerCommands(): void {},

  async handleMessage(): Promise<void> {},

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (action !== "open") {
      ctx.postState({ status: "error", message: `未知项目改名动作：${action}` });
      return;
    }
    projectRenameController?.show(ctx.workspaceRoot);
  },

  async runEditorCompanionAction(
    token: KtcEditorPrimaryCompanionActionToken,
    ctx: ToolRunContext,
  ): Promise<void> {
    if (!isProjectRenameCompanionAction(token.actionId)) {
      ctx.log(`[项目改名][Primary][WARN] 未知 companion 动作：${token.actionId}。`);
      return;
    }
    const result = await projectRenameController?.runCompanionAction({
      ...token,
      toolId: "projectRename",
      actionId: token.actionId,
    });
    if (result?.accepted) return;
    ctx.log(`[项目改名][Primary][WARN] 已丢弃过期或不可用动作 ${token.actionId}：${result?.reason ?? "no-controller"}。`);
  },
};

export function setProjectRenamePrimaryCompanionHost(
  host: KtcProjectRenamePrimaryCompanionHost | undefined,
): void {
  primaryCompanionHost = host;
}

function isProjectRenameCompanionAction(value: string): value is KtcProjectRenameCompanionActionId {
  return value === "reveal" || value === "cancel" || value === "openGitChanges";
}
