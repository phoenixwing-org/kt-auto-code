import {
  applyIgnorePresetToDocument,
  applyIgnoreRulesToDocument,
  appendIgnorePresetToDocument,
  mergeGitIgnoreIntoDocument,
  openIgnoreConfigFile,
  openIgnoreTargetFile,
  refreshIgnoreConfig,
  removeIgnorePresetFromDocument,
  savePrimaryCustomIgnorePatterns,
} from "./ignoreConfig.js";
import { KtcIgnoreRecommendationController } from "./ignoreRecommendationController.js";
import type { IgnoreConfigSummary, WebviewInboundMessage } from "./tools/types.js";
import type { KtcIgnoreRecommendationReport } from "./ignoreRecommendationTypes.js";
import type {
  KtcIgnoreRuleAction,
  KtcIgnoreRuleMutationResult,
  KtcIgnoreWriteTarget,
} from "./core/ignoreManagerModel.js";

type KtcIgnoreMessageType =
  | "openIgnoreFile"
  | "openIgnoreTarget"
  | "savePrimaryCustomIgnore"
  | "syncIgnoreFromGit"
  | "applyIgnorePreset"
  | "applyIgnoreRules"
  | "analyzeIgnore"
  | "applyIgnoreRecommendations";

export type KtcIgnoreMessage = Extract<WebviewInboundMessage, { type: KtcIgnoreMessageType }>;

export interface KtcIgnoreControllerResult {
  summary?: IgnoreConfigSummary;
  error?: string;
  message?: string;
  recommendations?: KtcIgnoreRecommendationReport;
}

const ignorePresetIds = new Set(["caa", "cpp", "web"]);

function isIgnoreTarget(value: unknown): value is KtcIgnoreWriteTarget {
  return value === "git" || value === "phoenix";
}

function isIgnoreAction(value: unknown): value is KtcIgnoreRuleAction {
  return value === "append" || value === "remove";
}

function isIgnoreRuleList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 500
    && value.every((rule) => (
      typeof rule === "string"
      && rule.length <= 500
      && !/[\r\n\0]/u.test(rule)
    ));
}

export function ktcIsIgnoreMessage(message: WebviewInboundMessage): message is KtcIgnoreMessage {
  if (message.type === "savePrimaryCustomIgnore") {
    return isIgnoreRuleList(message.patterns);
  }
  if (message.type === "openIgnoreFile"
    || message.type === "syncIgnoreFromGit"
    || message.type === "analyzeIgnore") return true;
  if (message.type === "openIgnoreTarget") return isIgnoreTarget(message.target);
  if (message.type === "applyIgnorePreset") {
    return ignorePresetIds.has(message.presetId)
      && isIgnoreAction(message.action)
      && (message.target === undefined || isIgnoreTarget(message.target));
  }
  if (message.type === "applyIgnoreRules") {
    return isIgnoreTarget(message.target)
      && isIgnoreAction(message.action)
      && isIgnoreRuleList(message.rules);
  }
  if (message.type === "applyIgnoreRecommendations") {
    if ("groupIds" in message) {
      return Array.isArray(message.groupIds)
        && message.groupIds.length <= 500
        && message.groupIds.every((groupId) => typeof groupId === "string" && groupId.trim().length > 0);
    }
    return isIgnoreTarget(message.target)
      && isIgnoreAction(message.action)
      && isIgnoreRuleList(message.ruleValues);
  }
  return false;
}

export function ktcDefaultIgnoreGroupIds(
  groups: readonly { groupId: string; defaultSelected: boolean; suggestedRules: readonly unknown[] }[],
): string[] {
  const first = groups.find((group) => group.defaultSelected && group.suggestedRules.length > 0);
  return first ? [first.groupId] : [];
}

function mutationMessage(
  target: KtcIgnoreWriteTarget,
  action: KtcIgnoreRuleAction,
  mutation: KtcIgnoreRuleMutationResult,
): string {
  const changed = action === "append" ? mutation.addedRules.length : mutation.removedRules.length;
  const targetLabel = target === "git" ? ".gitignore" : ".phoenix/.ignore";
  if (changed === 0) return `所选规则在 ${targetLabel} 中已是目标状态。`;
  return `已${action === "append" ? "追加" : "去除"} ${changed} 条规则到 ${targetLabel}，文件保持未保存状态。`;
}

export class KtcIgnoreController {
  private readonly recommendations = new KtcIgnoreRecommendationController();
  private activeRecommendations: { root: string; report: ReturnType<KtcIgnoreRecommendationController["createReport"]> } | undefined;

  invalidateRecommendations(): void {
    this.activeRecommendations = undefined;
  }

  snapshot(root: string | undefined): IgnoreConfigSummary | undefined {
    return refreshIgnoreConfig(root);
  }

  async handle(
    message: KtcIgnoreMessage,
    root: string | undefined,
    onSummary: (summary: IgnoreConfigSummary) => void = () => {},
  ): Promise<KtcIgnoreControllerResult> {
    if (!root) return this.fail("请先打开工作区文件夹。", true);
    try {
      let summary: IgnoreConfigSummary | undefined;
      let messageText: string | undefined;
      if (message.type === "openIgnoreFile") {
        await openIgnoreConfigFile(root);
        summary = this.snapshot(root);
      } else if (message.type === "openIgnoreTarget") {
        await openIgnoreTargetFile(root, message.target);
        summary = this.snapshot(root);
      } else if (message.type === "savePrimaryCustomIgnore") {
        summary = await savePrimaryCustomIgnorePatterns(root, message.patterns);
      } else if (message.type === "syncIgnoreFromGit") {
        summary = await mergeGitIgnoreIntoDocument(root);
      } else if (message.type === "applyIgnorePreset") {
        if (message.target) {
          const result = await applyIgnorePresetToDocument(root, message.target, message.presetId, message.action);
          summary = result.summary;
          messageText = mutationMessage(message.target, message.action, result.mutation);
        } else {
          // Legacy Webviews used managed Phoenix blocks and had no target picker.
          summary = message.action === "append"
            ? await appendIgnorePresetToDocument(root, message.presetId)
            : await removeIgnorePresetFromDocument(root, message.presetId);
        }
      } else if (message.type === "applyIgnoreRules") {
        const result = await applyIgnoreRulesToDocument(root, message.target, message.action, message.rules);
        summary = result.summary;
        messageText = mutationMessage(message.target, message.action, result.mutation);
      } else if (message.type === "analyzeIgnore") {
        const report = this.recommendations.createReport(root);
        this.activeRecommendations = { root, report };
        return {
          recommendations: report,
          message: report.recommendations.length
            ? `分析完成：${report.recommendations.length} 个推荐组，请在当前 Block 中勾选后追加。`
            : "分析完成：没有可追加的推荐规则。",
        };
      } else {
        const active = this.activeRecommendations;
        if (!active || active.root !== root) throw new Error("Ignore 推荐结果已失效，请重新分析。");
        const result = "groupIds" in message
          ? await this.recommendations.applyLegacyGroups(root, active.report, message.groupIds, onSummary)
          : await this.recommendations.applyRules(
            root,
            active.report,
            message.target,
            message.action,
            message.ruleValues,
            onSummary,
          );
        return { summary: result.summary, recommendations: active.report, message: result.message };
      }
      if (summary) onSummary(summary);
      return { summary, message: messageText };
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(text: string, _warning = false): KtcIgnoreControllerResult {
    return { error: text };
  }
}

export const ktcIgnoreController = new KtcIgnoreController();
