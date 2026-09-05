import { basename } from "node:path";
import * as vscode from "vscode";
import { ktcAnalyzeIgnoreRecommendations } from "./core/ignoreRecommendation.js";
import { ktcLoadWorkspaceIgnoreRuleCatalog } from "./core/ignoreRuleConfigRepository.js";
import { ktcCollectIgnoreWorkspaceSnapshot } from "./core/ignoreWorkspaceSnapshot.js";
import {
  applyIgnoreRulesToDocument,
  appendIgnoreGroupsToDocument,
  resolveWorkspaceIgnorePatterns,
} from "./ignoreConfig.js";
import type { IgnoreConfigSummary } from "./tools/types.js";
import type { KtcIgnoreRecommendationReport } from "./ignoreRecommendationTypes.js";
import {
  ktcNormalizeIgnoreRule,
  type KtcIgnoreRuleAction,
  type KtcIgnoreWriteTarget,
} from "./core/ignoreManagerModel.js";

interface KtcIgnoreRecommendationApplyResult {
  readonly summary: IgnoreConfigSummary;
  readonly message: string;
}

interface KtcIgnoreRecommendationRuleChoice {
  readonly value: string;
  readonly title: string;
  readonly reviewRequired: boolean;
  readonly blocked: boolean;
}

export class KtcIgnoreRecommendationController {
  createReport(root: string): KtcIgnoreRecommendationReport & { catalogVersion: number } {
    return this.buildReport(root);
  }

  async applyLegacyGroups(
    root: string,
    report: KtcIgnoreRecommendationReport & { catalogVersion: number },
    groupIds: readonly string[],
    onApplied: (summary: IgnoreConfigSummary) => void,
  ): Promise<KtcIgnoreRecommendationApplyResult> {
    const latest = this.buildReport(root);
    if (latest.catalogError) throw new Error(`工作区规则目录错误：${latest.catalogError}`);
    const selected = latest.recommendations.filter((item) => groupIds.includes(item.groupId));
    if (selected.length !== groupIds.length || latest.catalogVersion !== report.catalogVersion) {
      throw new Error("推荐结果已经变化，请重新分析后再追加。");
    }
    const reviewGroups = selected.filter((item) => item.reviewRequired);
    if (reviewGroups.length > 0) {
      const answer = await vscode.window.showWarningMessage(
        `所选规则包含需确认组：${reviewGroups.map((item) => item.title).join("、")}。\n这些规则可能命中源码或应提交资源。`,
        { modal: true },
        "仍然追加",
      );
      if (answer !== "仍然追加") throw new Error("已取消追加需确认规则。");
    }
    const groups = selected
      .filter((item) => item.suggestedRules.length > 0)
      .map((item) => ({
        id: item.groupId,
        title: item.title,
        catalogVersion: latest.catalogVersion,
        rules: item.suggestedRules.map((rule) => rule.value),
      }));
    if (groups.length === 0) throw new Error("所选规则组没有可追加的新规则。");
    const summary = await appendIgnoreGroupsToDocument(root, groups);
    onApplied(summary);
    return {
      summary,
      message: `已追加 ${groups.length} 个规则组到 .phoenix/.ignore，文件保持未保存状态。`,
    };
  }

  async applyRules(
    root: string,
    report: KtcIgnoreRecommendationReport & { catalogVersion: number },
    target: KtcIgnoreWriteTarget,
    action: KtcIgnoreRuleAction,
    ruleValues: readonly string[],
    onApplied: (summary: IgnoreConfigSummary) => void,
  ): Promise<KtcIgnoreRecommendationApplyResult> {
    const latest = this.buildReport(root);
    if (latest.catalogError) throw new Error(`工作区规则目录错误：${latest.catalogError}`);
    if (latest.catalogVersion !== report.catalogVersion) {
      throw new Error("推荐结果已经变化，请重新分析后再操作。");
    }

    const recommendationByRule = new Map<string, KtcIgnoreRecommendationRuleChoice>();
    for (const group of latest.recommendations) {
      for (const rule of [...group.suggestedRules, ...group.existingRules]) {
        const normalized = ktcNormalizeIgnoreRule(rule.value);
        if (normalized && !recommendationByRule.has(normalized.identity)) {
          recommendationByRule.set(normalized.identity, {
            value: rule.value,
            title: group.title,
            reviewRequired: group.reviewRequired,
            blocked: false,
          });
        }
      }
      for (const blockedRule of group.blockedRules) {
        const normalized = ktcNormalizeIgnoreRule(blockedRule.rule.value);
        if (normalized) {
          recommendationByRule.set(normalized.identity, {
            value: blockedRule.rule.value,
            title: group.title,
            reviewRequired: true,
            blocked: true,
          });
        }
      }
    }

    const selected: KtcIgnoreRecommendationRuleChoice[] = [];
    const selectedKeys = new Set<string>();
    for (const value of ruleValues) {
      const normalized = ktcNormalizeIgnoreRule(value);
      const recommendation = normalized ? recommendationByRule.get(normalized.identity) : undefined;
      if (!normalized || !recommendation) {
        throw new Error("推荐规则已经变化，请重新分析后再操作。");
      }
      if (selectedKeys.has(normalized.identity)) continue;
      selectedKeys.add(normalized.identity);
      selected.push(recommendation);
    }
    if (selected.length === 0) throw new Error("请至少选择一条推荐规则。");

    if (action === "append") {
      const risky = selected.filter((item) => item.reviewRequired || item.blocked);
      if (risky.length > 0) {
        const titles = [...new Set(risky.map((item) => item.title))];
        const answer = await vscode.window.showWarningMessage(
          `所选规则包含需确认项：${titles.join("、")}。\n这些规则可能命中源码或应提交资源。`,
          { modal: true },
          "仍然追加",
        );
        if (answer !== "仍然追加") throw new Error("已取消追加需确认规则。");
      }
    }

    const applied = await applyIgnoreRulesToDocument(
      root,
      target,
      action,
      selected.map((item) => item.value),
    );
    onApplied(applied.summary);
    const changedCount = action === "append"
      ? applied.mutation.addedRules.length
      : applied.mutation.removedRules.length;
    const targetLabel = target === "git" ? ".gitignore" : ".phoenix/.ignore";
    const verb = action === "append" ? "追加" : "去除";
    return {
      summary: applied.summary,
      message: changedCount > 0
        ? `已${verb} ${changedCount} 条推荐规则到 ${targetLabel}，文件保持未保存状态。`
        : `所选推荐规则在 ${targetLabel} 中已是目标状态。`,
    };
  }

  private buildReport(root: string): KtcIgnoreRecommendationReport & { catalogVersion: number } {
    const catalogSnapshot = ktcLoadWorkspaceIgnoreRuleCatalog(root);
    const workspaceSnapshot = ktcCollectIgnoreWorkspaceSnapshot(root, {
      existingPatterns: resolveWorkspaceIgnorePatterns(root, {
        builtInIgnoreEnabled: true,
        gitIgnoreEnabled: true,
        customIgnoreEnabled: true,
      }),
    });
    return {
      workspace: basename(root),
      truncated: workspaceSnapshot.truncated ?? false,
      catalogError: catalogSnapshot.error,
      catalogVersion: catalogSnapshot.catalog.version,
      recommendations: ktcAnalyzeIgnoreRecommendations(workspaceSnapshot, catalogSnapshot.catalog),
    };
  }
}
