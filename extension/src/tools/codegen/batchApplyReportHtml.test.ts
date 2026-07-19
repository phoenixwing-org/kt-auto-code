import { describe, expect, it } from "vitest";
import { getCodegenBatchApplyReportHtml } from "./batchApplyReportHtml.js";

describe("Codegen 全部应用报告 HTML", () => {
  it("呈现汇总、明细和错误，并转义不可信字段与设置 CSP", () => {
    const html = getCodegenBatchApplyReportHtml({
      elapsedMilliseconds: 1234,
      totals: { total: 1, applied: 0, partial: 1, notWritten: 0 },
      errorCount: 1,
      warningCount: 0,
      items: [{
        uri: "file:///x/<A>.json", fileName: "<A>.json", status: "partial", errorCount: 1,
        preflightRegionCount: 2, preflightArtifactCount: 1, preflightDiagnosticCount: 1,
        preflightErrorCount: 1, modifiedFileCount: 1, writtenRegionCount: 1,
        elapsedMilliseconds: 20,
        issues: [{ severity: "error", code: "marker.<bad>", message: "<script>alert(1)</script>", file: "/x/a.cpp", line: 7 }],
      }],
    }, "fixed-nonce");
    expect(html).toContain("Codegen 全部应用报告");
    expect(html).toContain("style-src 'nonce-fixed-nonce'");
    expect(html).toContain('style nonce="fixed-nonce"');
    expect(html).toContain("部分完成");
    expect(html).toContain("1.23 s");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
