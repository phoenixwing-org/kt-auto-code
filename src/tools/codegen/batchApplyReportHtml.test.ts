import { describe, expect, it } from "vitest";
import { getCodegenBatchApplyReportHtml } from "./batchApplyReportHtml.js";

describe("Codegen 全部应用报告 Host 壳", () => {
  it("只安全注入共享组件 bundle 与 DTO，不再复制报告筛选和表格实现", () => {
    const html = getCodegenBatchApplyReportHtml({
      kind: "kt.codegen.apply-report",
      schemaVersion: 1,
      reportId: "12345678-1234-4234-8234-123456789abc",
      applyKind: "batch",
      startedAt: "2026-07-20T12:00:00.000Z",
      finishedAt: "2026-07-20T12:00:01.234Z",
      elapsedMilliseconds: 1234,
      totals: { total: 1, success: 0, warning: 0, error: 1, updated: 0, unchanged: 0, partial: 1, notApplied: 0 },
      errorCount: 1,
      warningCount: 0,
      items: [{
        documentId: "file:///x/<A>.json", fileName: "<A>.json", displayPath: "file:///x/<A>.json",
        health: "error", change: "partial", reasonCode: "partial-with-errors", errorCount: 1,
        preflightRegionCount: 2, preflightArtifactCount: 1, preflightDiagnosticCount: 1,
        preflightErrorCount: 1, modifiedFileCount: 1, writtenRegionCount: 1,
        elapsedMilliseconds: 20,
        issues: [{ severity: "error", code: "marker.<bad>", message: "<script>alert(1)</script>", path: "/x/a.cpp", line: 7 }],
      }],
    }, "fixed-nonce", "vscode-resource:/dist/codegen-apply-report.js");
    expect(html).toContain("Codegen 全部应用报告");
    expect(html).toContain('style-src \'nonce-fixed-nonce\'');
    expect(html).toContain('script-src \'nonce-fixed-nonce\'');
    expect(html).toContain('<kt-codegen-apply-report id="apply-report"></kt-codegen-apply-report>');
    expect(html).toContain('src="vscode-resource:/dist/codegen-apply-report.js"');
    expect(html).toContain('id="report-data" type="application/json"');
    expect(html).toContain("\\u003cscript\\u003ealert(1)\\u003c/script\\u003e");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("filterChip");
    expect(html).not.toContain("renderItems");
  });
});
