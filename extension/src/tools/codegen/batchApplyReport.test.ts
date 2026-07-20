import { describe, expect, it } from "vitest";
import {
  ktcCodegenBatchApplyReport,
  ktcCodegenBatchApplyReportIssues,
} from "./batchApplyReport.js";

describe("Codegen 全部应用轻量报告", () => {
  it("从结构化结果汇总状态与错误，不解析 Output", () => {
    const items = [
      {
        uri: "file:///workspace/A.json", fileName: "A.json", health: "success" as const,
        change: "updated" as const, reasonCode: "content-updated" as const, errorCount: 0,
        preflightRegionCount: 2, preflightArtifactCount: 2, preflightDiagnosticCount: 0,
        preflightErrorCount: 0, modifiedFileCount: 1, writtenRegionCount: 2,
        elapsedMilliseconds: 12, issues: [],
      },
      {
        uri: "file:///workspace/B.json", fileName: "B.json", health: "error" as const,
        change: "partial" as const, reasonCode: "partial-with-errors" as const, errorCount: 1,
        preflightRegionCount: 1, preflightArtifactCount: 1, preflightDiagnosticCount: 1,
        preflightErrorCount: 1, modifiedFileCount: 1, writtenRegionCount: 1,
        elapsedMilliseconds: 24,
        issues: [{ severity: "error" as const, code: "marker.missing-end", message: "未闭合", file: "/src/B.cpp", line: 9 }],
      },
    ];
    expect(ktcCodegenBatchApplyReport(items, 40)).toMatchObject({
      totals: { total: 2, success: 1, warning: 0, error: 1, updated: 1, unchanged: 0, partial: 1, notApplied: 0 },
      errorCount: 1,
      warningCount: 0,
      elapsedMilliseconds: 40,
    });
  });

  it("收集 error/warning，行号转成用户可见 1-based 并去重", () => {
    const diagnostics = [
      { code: "marker.missing-end", severity: "error" as const, message: "未闭合", path: { source: "source" as const, file: "/a.cpp", row: 8 } },
      { code: "marker.missing-end", severity: "error" as const, message: "未闭合", path: { source: "source" as const, file: "/a.cpp", row: 8 } },
      { code: "notice", severity: "warning" as const, message: "提示" },
    ];
    expect(ktcCodegenBatchApplyReportIssues(diagnostics, "/A.json")).toEqual([
      { severity: "error", code: "marker.missing-end", message: "未闭合", file: "/a.cpp", line: 9 },
      { severity: "warning", code: "notice", message: "提示", file: "/A.json" },
    ]);
  });
});
