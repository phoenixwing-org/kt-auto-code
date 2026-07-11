import * as vscode from "vscode";
import { basename } from "node:path";
import { ktcAnalyzeIgnoreRecommendations } from "../../src/ignoreRecommendation.js";
import { ktcLoadWorkspaceIgnoreRuleCatalog } from "../../src/ignoreRuleConfigRepository.js";
import { ktcCollectIgnoreWorkspaceSnapshot } from "../../src/ignoreWorkspaceSnapshot.js";
import {
  appendIgnoreGroupsToDocument,
  resolveWorkspaceIgnorePatterns,
} from "./ignoreConfig.js";
import type { IgnoreConfigSummary } from "./tools/types.js";
import {
  KtcIgnoreRecommendationPanel,
  type KtcIgnoreRecommendationReport,
} from "./workbench/ignoreRecommendationPanel.js";

export class KtcIgnoreRecommendationController {
  async analyze(
    root: string,
    onApplied: (summary: IgnoreConfigSummary) => void,
  ): Promise<void> {
    const report = this.buildReport(root);
    KtcIgnoreRecommendationPanel.show(report, async (groupIds) => {
      const latest = this.buildReport(root);
      if (latest.catalogError) throw new Error(`工作区规则目录错误：${latest.catalogError}`);
      const selected = latest.recommendations.filter((item) => groupIds.includes(item.groupId));
      if (selected.length !== groupIds.length) throw new Error("推荐结果已经变化，请重新分析后再追加。");
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
      return `已追加 ${groups.length} 个规则组到 .phoenix/.ignore，文件保持未保存状态。`;
    });
  }

  private buildReport(root: string): KtcIgnoreRecommendationReport & { catalogVersion: number } {
    const catalogSnapshot = ktcLoadWorkspaceIgnoreRuleCatalog(root);
    const workspaceSnapshot = ktcCollectIgnoreWorkspaceSnapshot(root, {
      phoenixIgnorePatterns: resolveWorkspaceIgnorePatterns(root),
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
