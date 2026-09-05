import type { WorkspaceRenameOptions, WorkspaceRenameReport } from "../../core/workspaceRename.js";
import type {
  KtcProjectRenameAnalysisReport,
  KtcProjectRenameCompletion,
} from "./contracts.js";

export function ktcProjectRenameApplyOptions(
  report: KtcProjectRenameAnalysisReport,
): WorkspaceRenameOptions {
  return {
    root: report.root,
    rules: report.rules.map((rule) => ({
      id: rule.id,
      search: rule.search,
      replace: rule.replace,
      enabled: rule.enabled,
    })),
    defaultEncoding: "utf8",
    preserveCase: false,
    levels: ["text", "file", "dir"],
    includePaths: [...new Set(report.workspaceReport.hits.map((hit) => hit.relativePath))],
    ignorePatterns: report.ignorePatterns,
    useBuiltInIgnore: report.useBuiltInIgnore,
    includeDotDirectories: true,
    apply: false,
    searchOnly: false,
  };
}

export function ktcProjectRenamePreviewDrift(
  analyzed: KtcProjectRenameAnalysisReport,
  preview: WorkspaceRenameReport,
): string | undefined {
  const analyzedRows = analyzed.workspaceReport.hits.map(ktcProjectRenamePlanIdentity).sort();
  const previewRows = preview.hits.map(ktcProjectRenamePlanIdentity).sort();
  if (analyzedRows.length !== previewRows.length) {
    return `分析结果已变化：原报告 ${analyzedRows.length} 项，执行前预检 ${previewRows.length} 项。`;
  }
  for (let index = 0; index < analyzedRows.length; index += 1) {
    if (analyzedRows[index] !== previewRows[index]) return "分析结果已变化：命中位置、次数或目标路径与原报告不一致。";
  }
  return undefined;
}

export function ktcProjectRenameCompletionAfterApply(
  planned: WorkspaceRenameReport,
  applied: WorkspaceRenameReport,
  remaining: KtcProjectRenameAnalysisReport,
): KtcProjectRenameCompletion {
  const plannedItems = planned.hits.filter((hit) => hit.status !== "skipped").length;
  const appliedItems = applied.hits.filter((hit) => hit.status === "applied").length;
  const allPlannedApplied = plannedItems > 0
    && applied.summary.errors === 0
    && appliedItems === plannedItems;
  const remainingItems = remaining.workspaceReport.hits.filter((hit) => hit.status !== "skipped").length
    + (remaining.rootSuggestion ? 1 : 0);
  const targetReached = !remaining.stats.truncated
    && remaining.workspaceReport.summary.errors === 0
    && remainingItems === 0;
  return {
    plannedItems,
    appliedItems,
    remainingItems,
    targetReached,
    allPlannedApplied,
    canFinish: targetReached || allPlannedApplied,
    message: targetReached
      ? "目标门禁已达到：重新扫描后没有剩余精确命中。"
      : allPlannedApplied
      ? "本次冻结计划已全部完成；仍有后续建议或新命中，可结束或继续分析。"
      : "尚未达到结束门禁；请处理失败项并重新分析。",
  };
}

function ktcProjectRenamePlanIdentity(hit: WorkspaceRenameReport["hits"][number]): string {
  return [
    hit.level,
    hit.relativePath,
    hit.occurrences,
    hit.sourceHash ?? "",
    hit.newPath ?? "",
    hit.status === "error" ? "error" : hit.status === "skipped" ? "skipped" : "ready",
  ].join("\u0000");
}
