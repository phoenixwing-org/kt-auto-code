import * as vscode from "vscode";
import { basename, resolve } from "node:path";
import { ktcSuggestNameReplacement } from "../../core/replacementRules.js";
import {
  ktcAppendAssociatedReplacementRuleDrafts,
  ktcMergeAssociatedReplacementRules,
} from "../../core/associatedReplacementRules.js";
import type { KtcSearchReplaceRequest } from "../../core/searchReplaceContracts.js";
import { ktcResolveWorkspaceWorkingDirectory } from "../../core/workspaceRename.js";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { KtcSearchReplaceController } from "../../searchReplaceController.js";
import { getWorkspaceRoot } from "../../workspace.js";
import { ktcCreateAssociatedRulePicker } from "./associatedRulePicker.js";
import { ktcResolveSearchReplaceLocation } from "../../searchReplaceLocation.js";

let searchReplaceController: KtcSearchReplaceController | undefined;
let runContextFactory: (() => ToolRunContext | undefined) | undefined;

type AssociatedRuleCandidateRequest = Extract<
  WebviewInboundMessage,
  { type: "requestAssociatedRuleCandidates" }
>;

export const codeRenameTool: KtTool = {
  id: "codeRename",
  title: "搜索替换",
  description: "搜索并替换指定目录中的文本、文件名和文件夹名。",
  icon: "media/tools/search-replace.svg",
  runActions: ["open"],

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    searchReplaceController = new KtcSearchReplaceController();
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.codeRename.configure", async () => {
        await vscode.commands.executeCommand("ktAutoCode.tool.show", this.id);
      }),
      vscode.commands.registerCommand("ktAutoCode.codeRename.open", () => {
        searchReplaceController?.open();
      }),
      vscode.commands.registerCommand("ktAutoCode.searchReplace.open", () => {
        searchReplaceController?.open();
      }),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "openProjectRenameAnalysis" && message.toolId === this.id) {
      await vscode.commands.executeCommand("ktAutoCode.projectRenameAnalysis.open", ctx.workspaceRoot);
      return;
    }

    if (message.type === "requestAssociatedRuleCandidates" && message.toolId === this.id) {
      postAssociatedRulePicker(ctx, message);
      return;
    }

    if (message.type === "appendAssociatedRules" && message.toolId === this.id) {
      const associatedRules = ktcAppendAssociatedReplacementRuleDrafts(
        message.rules,
        message.existingRules,
        [message.primarySearch],
      );
      const addedCount = associatedRules.length - message.existingRules.length;
      ctx.postState({
        status: addedCount > 0 ? "done" : "idle",
        message: addedCount > 0
          ? `已添加 ${addedCount} 条关联规则。`
          : "所选规则已存在，未重复添加。",
        associatedRules,
      });
      return;
    }

    if (message.type === "createRootRenameTodo" && message.toolId === this.id) {
      if (!ctx.workspaceRoot) {
        ctx.postState({ status: "error", message: "请先打开一个工作区文件夹。" });
        return;
      }
      try {
        const created = await createRootRenameTodo(ctx.workspaceRoot, message.currentName, message.suggestedName);
        ctx.postState({
          status: "done",
          message: created ? "已在工作区根目录创建 KT Auto Code TODO。" : "已打开现有的 KT Auto Code TODO。",
          rootRenameSuggestion: { currentName: message.currentName, suggestedName: message.suggestedName },
        });
      } catch (error) {
        ctx.postState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
      return;
    }

    if (message.type === "codeRenameAction" && message.toolId === this.id) {
      await searchReplaceController?.openResult(message.rowId);
      return;
    }

    if (message.type === "searchReplace" && message.toolId === this.id && searchReplaceController) {
      const payload = normalizeSearchReplaceRules(message.payload);
      const activeRules = payload.rules?.filter((rule) => rule.enabled !== false && rule.search) ?? [];
      if (!payload.oldName && activeRules.length === 0) {
        ctx.postState({ status: "error", message: "搜索内容不能为空。" });
        return;
      }
      if (payload.levels.length === 0) {
        ctx.postState({ status: "error", message: "至少选择文本、文件名或文件夹名中的一项。" });
        return;
      }
      const hasEmptyReplacement = activeRules.length > 0
        ? activeRules.some((rule) => !rule.replace)
        : !payload.newName;
      if (message.action === "apply" && hasEmptyReplacement) {
        ctx.postState({ status: "error", message: "请输入替换内容后再替换。" });
        return;
      }
      ctx.postState({
        status: "running",
        message: message.action === "apply" ? "正在执行替换…" : "正在搜索…",
        associatedRules: payload.rules?.slice(1),
      });
      let scopedPayload: KtcSearchReplaceRequest;
      try { scopedPayload = await applyWorkspaceFileScope(payload, ctx); }
      catch (error) {
        ctx.postState({ status: "error", message: error instanceof Error ? error.message : String(error) });
        return;
      }
      const rootRenameSuggestion = getRootRenameSuggestion(scopedPayload, ctx.workspaceRoot);
      ctx.postState({
        status: "running",
        message: `${message.action === "apply" ? "正在执行替换" : "正在搜索"}（${scopedPayload.scopeLabel || scopedPayload.scope || "当前目录"}）…`,
        rootRenameSuggestion,
      });
      const result = await searchReplaceController.run(scopedPayload, message.action === "apply");
      const codeRenameResults = searchReplaceController.resultModel();
      if (result === "cancelled") {
        ctx.postState({ status: "idle", message: "已取消替换。", rootRenameSuggestion, codeRenameResults });
      } else if (result === "blocked") {
        ctx.postState({ status: "error", message: "预检发现冲突，未执行任何写盘。", rootRenameSuggestion, codeRenameResults });
      } else if (result === "error") {
        ctx.postState({ status: "error", message: "搜索替换失败，请检查当前 Block 结果。", rootRenameSuggestion, codeRenameResults });
      } else {
        ctx.postState({
          status: "done",
          message: message.action === "apply" ? "替换完成，请检查 Git diff。" : "搜索结果已更新。",
          rootRenameSuggestion,
          codeRenameResults,
        });
      }
      return;
    }
    if (message.type === "run" && message.toolId === this.id) await this.runAction(message.action, ctx);
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (!searchReplaceController) return;
    searchReplaceController.open();
    ctx.postState({ status: "done", message: "搜索替换 Block 已打开。", codeRenameResults: searchReplaceController.resultModel() });
  },
};

async function applyWorkspaceFileScope(
  payload: KtcSearchReplaceRequest,
  ctx: ToolRunContext,
): Promise<KtcSearchReplaceRequest> {
  if (!ctx.workspaceRoot) return payload;
  const location = ktcResolveSearchReplaceLocation(ctx.workspaceRoot, payload.scope);
  if (!location.usesCurrentWorkspace) return { ...payload, includePaths: undefined, scopeLabel: payload.scope || location.root };
  return { ...payload, includePaths: undefined, scopeLabel: payload.scope?.trim() || "当前目录" };
}

export function setCodeRenameRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

function postAssociatedRulePicker(
  ctx: ToolRunContext,
  request: AssociatedRuleCandidateRequest,
): void {
  const picker = ktcCreateAssociatedRulePicker(request);
  ctx.postState({
    status: "idle",
    message: picker.candidates.length > 0 ? "请选择要添加的关联规则。" : "没有新的推荐，可填写自定义规则。",
    associatedRulePicker: picker,
  });
}

function normalizeSearchReplaceRules(
  payload: KtcSearchReplaceRequest,
): KtcSearchReplaceRequest {
  if (!payload.rules || payload.rules.length === 0) return payload;
  const [primary, ...associated] = payload.rules;
  return {
    ...payload,
    rules: [primary, ...ktcMergeAssociatedReplacementRules([], associated, [])],
  };
}

function getRootRenameSuggestion(
  payload: KtcSearchReplaceRequest,
  root: string | undefined,
): { currentName: string; suggestedName: string } | undefined {
  if (!root || !payload.levels.includes("dir")) return undefined;
  const rules = payload.rules?.filter((rule) => rule.enabled !== false && rule.search)
    ?? [{ search: payload.oldName, replace: payload.newName }];
  try {
    if (ktcResolveWorkspaceWorkingDirectory(root, payload.scope) !== resolve(root)) return undefined;
    const suggestion = ktcSuggestNameReplacement(basename(root), rules, false);
    return suggestion && {
      currentName: suggestion.currentName,
      suggestedName: suggestion.suggestedName,
    };
  } catch {
    // The execution path will return the specific invalid-rule error in the result View.
    return undefined;
  }
}

async function createRootRenameTodo(root: string, currentName: string, suggestedName: string): Promise<boolean> {
  if (basename(root) !== currentName) throw new Error("工作区已变化，请重新预览后再创建 TODO。");
  if (!isSafeFileName(suggestedName)) throw new Error("建议的根目录名称无效，无法创建 TODO。");

  const todoUri = vscode.Uri.joinPath(vscode.Uri.file(root), "KT-AUTO-CODE-TODO.md");
  let created = false;
  try {
    await vscode.workspace.fs.stat(todoUri);
  } catch (error) {
    if (!(error instanceof vscode.FileSystemError) || error.code !== "FileNotFound") throw error;
    const content = [
      "# KT Auto Code TODO",
      "",
      "## 手动重命名工作区根目录",
      "",
      "KT Auto Code 已处理工作区内部的文件夹、文件名和文本，但不会自动重命名当前打开的工作区根目录。",
      "",
      `- 当前名称：\`${currentName}\``,
      `- 建议名称：\`${suggestedName}\``,
      "",
      "1. 完成或暂存当前工作区的改动。",
      "2. 关闭当前工作区。",
      "3. 在 Finder / 资源管理器中将根目录手动重命名为建议名称。",
      "4. 在 VS Code 中重新打开改名后的工作区。",
      "5. 检查 Git diff、任务配置和路径引用。",
      "",
    ].join("\n");
    await vscode.workspace.fs.writeFile(todoUri, Buffer.from(content, "utf8"));
    created = true;
  }
  const document = await vscode.workspace.openTextDocument(todoUri);
  await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Active });
  return created;
}

function isSafeFileName(value: string): boolean {
  return value !== "" && value !== "." && value !== ".." && basename(value) === value;
}
