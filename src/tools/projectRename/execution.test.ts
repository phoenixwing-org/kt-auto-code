import { describe, expect, it } from "vitest";
import type { WorkspaceRenameHit, WorkspaceRenameReport } from "../../core/workspaceRename.js";
import type { KtcProjectRenameAnalysisReport } from "./contracts.js";
import {
  ktcProjectRenameApplyOptions,
  ktcProjectRenameCompletionAfterApply,
  ktcProjectRenamePreviewDrift,
} from "./execution.js";

describe("project rename execution gate", () => {
  it("冻结原报告路径并包含 Web 点目录", () => {
    const report = analysis([hit("text", ".github/workflow.yml", 2)]);
    expect(ktcProjectRenameApplyOptions(report)).toMatchObject({
      includePaths: [".github/workflow.yml"],
      includeDotDirectories: true,
      levels: ["text", "file", "dir"],
      apply: false,
    });
  });

  it("命中次数或目标变化时阻止执行", () => {
    const report = analysis([hit("file", "old.ts", 1, "new.ts")]);
    expect(ktcProjectRenamePreviewDrift(report, workspace([hit("file", "old.ts", 1, "new.ts")]))).toBeUndefined();
    expect(ktcProjectRenamePreviewDrift(report, workspace([hit("file", "old.ts", 2, "new.ts")]))).toContain("已变化");
  });

  it("重新扫描无剩余命中时达到目标门禁", () => {
    const preview = workspace([hit("text", "src/a.ts", 2)]);
    const appliedHit = { ...hit("text", "src/a.ts", 2), status: "applied" as const };
    const completion = ktcProjectRenameCompletionAfterApply(preview, workspace([appliedHit], true), analysis([]));
    expect(completion).toMatchObject({ targetReached: true, allPlannedApplied: true, canFinish: true });
  });

  it("计划全成功但仍有根目录建议时允许人工结束", () => {
    const preview = workspace([hit("text", "src/a.ts", 1)]);
    const remaining = analysis([], true);
    const completion = ktcProjectRenameCompletionAfterApply(
      preview,
      workspace([{ ...hit("text", "src/a.ts", 1), status: "applied" }], true),
      remaining,
    );
    expect(completion).toMatchObject({ targetReached: false, allPlannedApplied: true, remainingItems: 1, canFinish: true });
  });
});

function hit(
  level: WorkspaceRenameHit["level"],
  relativePath: string,
  occurrences: number,
  newPath?: string,
): WorkspaceRenameHit {
  return {
    id: `${level}:${relativePath}`,
    relativePath,
    fullPath: `/repo/${relativePath}`,
    originalFullPath: `/repo/${relativePath}`,
    plannedFullPath: `/repo/${newPath ?? relativePath}`,
    level,
    occurrences,
    ...(newPath ? { newPath } : {}),
    status: "preview",
  };
}

function workspace(hits: WorkspaceRenameHit[], applied = false): WorkspaceRenameReport {
  return {
    root: "/repo",
    applied,
    hits,
    summary: {
      rules: 1,
      matchedRules: hits.length ? 1 : 0,
      directories: hits.filter((item) => item.level === "dir").length,
      files: hits.filter((item) => item.level === "file").length,
      textFiles: hits.filter((item) => item.level === "text").length,
      replacements: hits.reduce((sum, item) => sum + item.occurrences, 0),
      skipped: hits.filter((item) => item.status === "skipped").length,
      errors: hits.filter((item) => item.status === "error").length,
    },
  };
}

function analysis(hits: WorkspaceRenameHit[], rootSuggestion = false): KtcProjectRenameAnalysisReport {
  return {
    reportId: 1,
    root: "/repo",
    sourceName: "Old Project",
    targetName: "New Project",
    rules: [{ id: "display", style: "display", search: "Old Project", replace: "New Project", enabled: true }],
    ...(rootSuggestion ? { rootSuggestion: { currentName: "old-project", suggestedName: "new-project" } } : {}),
    workspaceReport: workspace(hits),
    assessments: {},
    riskSummary: { high: 0, medium: hits.length, low: 0 },
    stats: {
      scannedDirectories: 0,
      scannedFiles: 0,
      skippedBinaryFiles: 0,
      skippedLargeFiles: 0,
      skippedUnsupportedEncodingFiles: 0,
      truncated: false,
    },
    relatedCandidates: [],
  };
}
