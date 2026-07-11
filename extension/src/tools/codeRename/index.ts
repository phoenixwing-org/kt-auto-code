import * as vscode from "vscode";
import { basename } from "node:path";
import { ktcSuggestNameReplacement } from "../../../../src/replacementRules.js";
import {
  KTC_CAA_RELATION_KINDS,
  ktcMergeAssociatedReplacementRules,
  ktcSuggestAssociatedReplacementRule,
  ktcSuggestAssociatedReplacementRules,
} from "../../../../src/associatedReplacementRules.js";
import type {
  KtcAssociatedRelationKind,
  KtcAssociatedRulePreset,
  KtcReplacementRuleDraft,
} from "../../../../src/associatedReplacementRules.js";
import type { KtcSearchReplaceRequest } from "../../../../src/searchReplaceContracts.js";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { KtcSearchReplaceController } from "../../searchReplaceController.js";

let searchReplaceController: KtcSearchReplaceController | undefined;

const associatedRuleItems: readonly (vscode.QuickPickItem & { relationKind: KtcAssociatedRelationKind })[] = [
  { label: "空格写法", description: "CaaStudy → Caa Study", relationKind: "spaced" },
  { label: "前缀替换", description: "使用源前缀和目标前缀", relationKind: "prefix" },
  { label: "CAA I（完整名称）", description: "I 后使用完整目标名称", relationKind: "caa-i-full" },
  { label: "CAA E（完整名称）", description: "E 后使用完整目标名称", relationKind: "caa-e-full" },
  { label: "CAA I（末词段）", description: "保留源名称前段，只替换末词段", relationKind: "caa-i" },
  { label: "CAA E（末词段）", description: "保留源名称前段，只替换末词段", relationKind: "caa-e" },
];

const caaPresetItems: readonly (vscode.QuickPickItem & { preset: "caa-full" | "caa-tail" })[] = [
  {
    label: "完整名称 I/E",
    description: "常规 CAA 重命名",
    detail: "PNXITemplateFeature → PNXICurveDivision",
    preset: "caa-full",
  },
  {
    label: "仅替换末词段 I/E",
    description: "保留源名称前段",
    detail: "KTCIAutoCode → KTCIAutoBuild",
    preset: "caa-tail",
  },
];

interface AssociatedRuleGenerationRequest {
  search: string;
  replace: string;
  sourcePrefix: string;
  targetPrefix: string;
  existingRules: readonly KtcReplacementRuleDraft[];
}

export const codeRenameTool: KtTool = {
  id: "codeRename",
  title: "搜索替换",
  description: "预览并替换工作区中的文本、文件名和文件夹名。",
  icon: "media/tools/code-rename.svg",

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    searchReplaceController = new KtcSearchReplaceController(context.extensionUri);
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.codeRename.open", () => {
        searchReplaceController?.open();
      }),
      vscode.commands.registerCommand("ktAutoCode.searchReplace.open", () => {
        searchReplaceController?.open();
      }),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "deriveAssociatedRules" && message.toolId === this.id) {
      if (!message.search.trim() || !message.replace.trim()) {
        ctx.postState({ status: "error", message: "请先填写母规则的搜索和替换内容。" });
        return;
      }
      postAssociatedRulePreset(ctx, message, message.preset);
      return;
    }

    if (message.type === "chooseCaaRules" && message.toolId === this.id) {
      if (!message.search.trim() || !message.replace.trim()) {
        ctx.postState({ status: "error", message: "请先填写母规则的搜索和替换内容。" });
        return;
      }
      const selected = await vscode.window.showQuickPick(caaPresetItems, {
        placeHolder: "选择 CAA I/E 关联方式",
      });
      if (!selected) return;
      postAssociatedRulePreset(ctx, message, selected.preset);
      return;
    }

    if (message.type === "chooseAssociatedRule" && message.toolId === this.id) {
      const existingSearches = new Set(message.existingRules.map((rule) => rule.search));
      const availableItems = associatedRuleItems
        .map((item) => ({
          ...item,
          rule: ktcSuggestAssociatedReplacementRule(
            item.relationKind,
            message.parentRule,
            message.sourcePrefix,
            message.targetPrefix,
          ),
        }))
        .filter((item) => item.rule !== undefined && !existingSearches.has(item.rule.search));
      if (availableItems.length === 0) {
        ctx.postState({ status: "error", message: "当前行没有尚未添加的关联形式。" });
        return;
      }
      const selected = await vscode.window.showQuickPick(availableItems, {
        placeHolder: "添加一种关联规则",
      });
      if (!selected) return;
      const rule = selected.rule;
      if (!rule) return;
      const associatedRules = ktcMergeAssociatedReplacementRules(
        [rule],
        message.existingRules,
        [],
      );
      ctx.postState({
        status: "done",
        message: `已添加“${selected.label}”。`,
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
      const hasEmptyPathReplacement = activeRules.length > 0
        ? activeRules.some((rule) => !rule.replace)
        : !payload.newName;
      if (hasEmptyPathReplacement && payload.levels.some((level) => level !== "text")) {
        ctx.postState({ status: "error", message: "文件名或文件夹名的替换内容不能为空。" });
        return;
      }
      const rootRenameSuggestion = getRootRenameSuggestion(payload, ctx.workspaceRoot);
      ctx.postState({
        status: "running",
        message: message.action === "apply" ? "正在执行替换…" : "正在生成预览…",
        rootRenameSuggestion,
        associatedRules: payload.rules?.slice(1),
      });
      const result = await searchReplaceController.run(payload, message.action === "apply");
      if (result === "cancelled") {
        ctx.postState({ status: "idle", message: "已取消替换。", rootRenameSuggestion });
      } else if (result === "error") {
        ctx.postState({ status: "error", message: "搜索替换失败，请查看结果 View。", rootRenameSuggestion });
      } else {
        ctx.postState({
          status: "done",
          message: message.action === "apply" ? "替换完成，请检查 Git diff。" : "预览已更新。",
          rootRenameSuggestion,
        });
      }
      return;
    }
    if (message.type === "run" && message.toolId === this.id) await this.runAction(message.action, ctx);
  },

  async runAction(_action: string, ctx: ToolRunContext): Promise<void> {
    if (!searchReplaceController) return;
    searchReplaceController.open();
    ctx.postState({ status: "done", message: "搜索替换结果 View 已打开。" });
  },
};

function postAssociatedRulePreset(
  ctx: ToolRunContext,
  request: AssociatedRuleGenerationRequest,
  preset: KtcAssociatedRulePreset,
): void {
  const suggestion = ktcSuggestAssociatedReplacementRules(
    request.search,
    request.replace,
    request.sourcePrefix,
    request.targetPrefix,
    preset,
  );
  const replacedKinds: readonly KtcAssociatedRelationKind[] = preset === "common"
    ? ["spaced", "prefix"]
    : KTC_CAA_RELATION_KINDS;
  const associatedRules = ktcMergeAssociatedReplacementRules(
    suggestion.rules,
    request.existingRules,
    replacedKinds,
  );
  const presetLabel = preset === "common"
    ? "常用"
    : preset === "caa-full"
      ? "CAA 完整名称"
      : "CAA 末词段";
  ctx.postState({
    status: suggestion.rules.length > 0 ? "done" : "error",
    message: suggestion.rules.length > 0
      ? `已生成 ${suggestion.rules.length} 条${presetLabel}规则。`
      : preset === "common"
        ? "当前名称没有可生成的常用关联形式。"
        : "CAA I/E 规则需要源前缀和至少两个源名称词段。",
    associatedRules,
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
    const suggestion = ktcSuggestNameReplacement(basename(root), rules, payload.preserveCase ?? false);
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
