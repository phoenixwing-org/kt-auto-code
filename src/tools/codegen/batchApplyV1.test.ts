import { describe, expect, it } from "vitest";
import {
  ktcCodegenBatchApplySummary,
  ktcCodegenBatchApplyTotals,
  type KtcCodegenBatchApplyItemResult,
} from "./batchApplyV1.js";

describe("Codegen 全部应用 V1 汇总", () => {
  it("分别汇总健康度与源码变化，不把内容一致伪装成错误", () => {
    const items: KtcCodegenBatchApplyItemResult[] = [
      { documentId: "file:///A.json", fileName: "A.json", health: "success", change: "updated", reasonCode: "content-updated", errorCount: 0 },
      { documentId: "file:///B.json", fileName: "B.json", health: "success", change: "unchanged", reasonCode: "content-unchanged", errorCount: 0 },
      { documentId: "file:///C.json", fileName: "C.json", health: "error", change: "partial", reasonCode: "partial-with-errors", errorCount: 2 },
      { documentId: "file:///D.json", fileName: "D.json", health: "error", change: "not-applied", reasonCode: "apply-blocked", errorCount: 1 },
    ];
    expect(ktcCodegenBatchApplyTotals(items)).toEqual({
      total: 4,
      success: 2,
      warning: 0,
      error: 2,
      updated: 1,
      unchanged: 1,
      partial: 1,
      notApplied: 1,
    });
    expect(ktcCodegenBatchApplySummary(items, "1.20 s")).toBe(
      "全部应用完成：共 4 份；正常 2 份，有警告 0 份，有错误 2 份；已更新 1 份，内容一致 1 份，部分更新 1 份，未应用 1 份；耗时 1.20 s。",
    );
  });
});
