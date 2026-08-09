import { describe, expect, it } from "vitest";
import {
  ktcCodegenApplyReportFileName,
  ktcCodegenApplyReportSummary,
  ktcParseStoredCodegenApplyReport,
  ktcSerializeStoredCodegenApplyReport,
  ktcValidStoredCodegenApplyReport,
  type KtcCodegenStoredApplyReport,
} from "./applyReportPersistence.js";
import { ktcCodegenBatchApplyReport } from "./batchApplyReport.js";

const REPORT_ID = "12345678-1234-4234-8234-123456789abc";

function stored(overrides: Partial<KtcCodegenStoredApplyReport> = {}): KtcCodegenStoredApplyReport {
  return {
    kind: "kt.codegen.apply-report",
    schemaVersion: 1,
    reportId: REPORT_ID,
    applyKind: "single",
    startedAt: "2026-07-20T13:02:45.123Z",
    finishedAt: "2026-07-20T13:02:45.223Z",
    health: "success",
    change: "unchanged",
    summary: {
      itemCount: 1,
      modifiedFileCount: 0,
      writtenRegionCount: 0,
      errorCount: 0,
      warningCount: 0,
    },
    elapsedMilliseconds: 100,
    items: [{
      fileName: "PNXCombinedCurveParam.json",
      json: { workspaceFolder: "PNXCombinedCurveWsp", path: "PNXCombinedCurveParam.json" },
      health: "success",
      change: "unchanged",
      reasonCode: "content-unchanged",
      errorCount: 0,
      preflightRegionCount: 3,
      preflightArtifactCount: 3,
      preflightDiagnosticCount: 0,
      preflightErrorCount: 0,
      modifiedFileCount: 0,
      writtenRegionCount: 0,
      elapsedMilliseconds: 90,
      issues: [],
    }],
    ...overrides,
  };
}

describe("Codegen Apply 报告持久 schema", () => {
  it("按 UTC 时间、类型、对象与短 ID 生成可排序文件名", () => {
    const runtime = ktcCodegenBatchApplyReport([{
      documentId: "file:///workspace/PNXCombinedCurveParam.json",
      fileName: "PNXCombinedCurveParam.json",
      displayPath: "file:///workspace/PNXCombinedCurveParam.json",
      health: "success",
      change: "unchanged",
      reasonCode: "content-unchanged",
      errorCount: 0,
      preflightRegionCount: 3,
      preflightArtifactCount: 3,
      preflightDiagnosticCount: 0,
      preflightErrorCount: 0,
      modifiedFileCount: 0,
      writtenRegionCount: 0,
      elapsedMilliseconds: 90,
      issues: [],
    }], 100, {
      reportId: REPORT_ID,
      applyKind: "single",
      startedAt: "2026-07-20T13:02:45.123Z",
      finishedAt: "2026-07-20T13:02:45.223Z",
    });
    expect(ktcCodegenApplyReportFileName(runtime)).toBe(
      "2026-07-20T13-02-45-123Z__single__PNXCombinedCurveParam__12345678.json",
    );
  });

  it("序列化后可严格复读，并从双状态聚合 Primary 摘要", () => {
    const report = stored();
    expect(ktcParseStoredCodegenApplyReport(ktcSerializeStoredCodegenApplyReport(report))).toEqual(report);
    expect(ktcCodegenApplyReportSummary(report, "report.json")).toEqual({
      reportId: REPORT_ID,
      fileName: "report.json",
      applyKind: "single",
      startedAt: "2026-07-20T13:02:45.123Z",
      health: "success",
      change: "unchanged",
      itemCount: 1,
      subject: "PNXCombinedCurveParam.json",
    });
  });

  it("拒绝绝对路径、目录穿越、未来 schema 与 single 多 item", () => {
    expect(ktcValidStoredCodegenApplyReport(stored({ schemaVersion: 2 as 1 }))).toBe(false);
    expect(ktcValidStoredCodegenApplyReport(stored({
      items: [{ ...stored().items[0]!, json: { workspaceFolder: "root", path: "../secret.json" } }],
    }))).toBe(false);
    expect(ktcValidStoredCodegenApplyReport(stored({
      items: [{ ...stored().items[0]!, json: { workspaceFolder: "root", path: "/secret.json" } }],
    }))).toBe(false);
    expect(ktcValidStoredCodegenApplyReport(stored({
      items: [stored().items[0]!, stored().items[0]!],
    }))).toBe(false);
  });
});
