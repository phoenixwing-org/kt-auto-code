import { describe, expect, it } from "vitest";
import { getCodegenBatchApplyReportHtml } from "./batchApplyReportHtml.js";

describe("Codegen 全部应用报告 HTML", () => {
  it("从内嵌 JSON 动态呈现筛选、链接和错误，并安全序列化不可信字段", () => {
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
        uri: "file:///x/<A>.json", fileName: "<A>.json", health: "error", change: "partial",
        reasonCode: "partial-with-errors", errorCount: 1,
        preflightRegionCount: 2, preflightArtifactCount: 1, preflightDiagnosticCount: 1,
        preflightErrorCount: 1, modifiedFileCount: 1, writtenRegionCount: 1,
        elapsedMilliseconds: 20,
        issues: [{ severity: "error", code: "marker.<bad>", message: "<script>alert(1)</script>", file: "/x/a.cpp", line: 7 }],
      }],
    }, "fixed-nonce");
    expect(html).toContain("Codegen 全部应用报告");
    expect(html).toContain("style-src 'nonce-fixed-nonce'");
    expect(html).toContain("script-src 'nonce-fixed-nonce'");
    expect(html).toContain('style nonce="fixed-nonce"');
    expect(html).toContain('id="report-data" type="application/json" nonce="fixed-nonce"');
    expect(html).toContain('id="json-filter"');
    expect(html).toContain('id="single-json" hidden');
    expect(html).toContain('id="json-steps" role="group"');
    expect(html).toContain('id="previous-json"');
    expect(html).toContain('id="next-json"');
    expect(html).toContain('selectAdjacentJson(-1)');
    expect(html).toContain('selectAdjacentJson(1)');
    expect(html).toContain('(filter.selectedIndex + offset + count) % count');
    expect(html).toContain('const singleItem = report.items.length === 1 ? report.items[0] : undefined');
    expect(html).toContain('if (!singleItem) filter.appendChild(new Option("全部 JSON（" + report.items.length + "）", ""))');
    expect(html).toContain('filter.value = singleItem.uri');
    expect(html).toContain('jsonSteps.hidden = true');
    expect(html).toContain('if (items.length === 1)');
    expect(html).not.toContain('if (report.items.length === 1 && items.length === 1)');
    expect(html).toContain('metric(healthLabels[item.health] || item.health, 1)');
    expect(html).toContain('id="open-json"');
    expect(html).toContain('"filter-chip " + group + "-" + value');
    expect(html).toContain('checkbox.type = "checkbox"');
    expect(html).toContain('const items = jsonItems.length === 1');
    expect(html).toContain('? jsonItems');
    expect(html).toContain(': jsonItems.filter((item) => activeFilters.health.has(item.health) && activeFilters.change.has(item.change))');
    expect(html).toContain("当前筛选没有运行明细");
    expect(html).toContain('type: "openJson"');
    expect(html).toContain('type: "openIssue"');
    expect(html).toContain("#issue-table table { table-layout: fixed; }");
    expect(html).toContain("#issue-table button.link { max-width: 100%; white-space: normal; overflow-wrap: anywhere;");
    expect(html).toContain('locationCell.classList.add("issue-location")');
    expect(html).toContain("内容一致");
    expect(html).toContain("有错误");
    expect(html).toContain("\\u003cscript\\u003ealert(1)\\u003c/script\\u003e");
    expect(html).not.toContain("<script>alert(1)</script>");
    const scripts = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(() => new Function(scripts[0]![1])).not.toThrow();
  });
});
