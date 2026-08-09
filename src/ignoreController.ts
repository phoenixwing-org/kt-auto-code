import {
  appendIgnorePresetToDocument,
  mergeGitIgnoreIntoDocument,
  openIgnoreConfigFile,
  refreshIgnoreConfig,
  removeIgnorePresetFromDocument,
} from "./ignoreConfig.js";
import { KtcIgnoreRecommendationController } from "./ignoreRecommendationController.js";
import type { IgnoreConfigSummary, WebviewInboundMessage } from "./tools/types.js";
import type { KtcIgnoreRecommendationReport } from "./ignoreRecommendationTypes.js";

type KtcIgnoreMessageType =
  | "openIgnoreFile"
  | "syncIgnoreFromGit"
  | "applyIgnorePreset"
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

export function ktcIsIgnoreMessage(message: WebviewInboundMessage): message is KtcIgnoreMessage {
  if (message.type === "openIgnoreFile"
    || message.type === "syncIgnoreFromGit"
    || message.type === "analyzeIgnore") return true;
  if (message.type === "applyIgnorePreset") {
    return ignorePresetIds.has(message.presetId)
      && (message.action === "append" || message.action === "remove");
  }
  if (message.type === "applyIgnoreRecommendations") {
    return Array.isArray(message.groupIds)
      && message.groupIds.every((groupId) => typeof groupId === "string" && groupId.trim().length > 0);
  }
  return false;
}

export function ktcDefaultIgnoreGroupIds(
  groups: readonly { groupId: string; defaultSelected: boolean; suggestedRules: readonly unknown[] }[],
): string[] {
  const first = groups.find((group) => group.defaultSelected && group.suggestedRules.length > 0);
  return first ? [first.groupId] : [];
}

export class KtcIgnoreController {
  private readonly recommendations = new KtcIgnoreRecommendationController();
  private activeRecommendations: { root: string; report: ReturnType<KtcIgnoreRecommendationController["createReport"]> } | undefined;

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
      if (message.type === "openIgnoreFile") {
        await openIgnoreConfigFile(root);
        summary = this.snapshot(root);
      } else if (message.type === "syncIgnoreFromGit") {
        summary = await mergeGitIgnoreIntoDocument(root);
      } else if (message.type === "applyIgnorePreset") {
        summary = message.action === "append"
          ? await appendIgnorePresetToDocument(root, message.presetId)
          : await removeIgnorePresetFromDocument(root, message.presetId);
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
        const messageText = await this.recommendations.apply(root, active.report, message.groupIds, onSummary);
        return { recommendations: active.report, message: messageText };
      }
      if (summary) onSummary(summary);
      return { summary };
    } catch (error) {
      return this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(text: string, _warning = false): KtcIgnoreControllerResult {
    return { error: text };
  }
}

export const ktcIgnoreController = new KtcIgnoreController();
