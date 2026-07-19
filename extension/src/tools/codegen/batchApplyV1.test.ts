import { describe, expect, it } from "vitest";
import {
  ktcCodegenBatchApplySummary,
  ktcCodegenBatchApplyTotals,
  type KtcCodegenBatchApplyItemResult,
} from "./batchApplyV1.js";

describe("Codegen 全部应用 V1 汇总", () => {
  it("区分完成、部分完成和未写入，不把错误项伪装成全部成功", () => {
    const items: KtcCodegenBatchApplyItemResult[] = [
      { uri: "file:///A.json", fileName: "A.json", status: "applied", errorCount: 0 },
      { uri: "file:///B.json", fileName: "B.json", status: "partial", errorCount: 2 },
      { uri: "file:///C.json", fileName: "C.json", status: "not-written", errorCount: 1 },
    ];
    expect(ktcCodegenBatchApplyTotals(items)).toEqual({
      total: 3, applied: 1, partial: 1, notWritten: 1,
    });
    expect(ktcCodegenBatchApplySummary(items, "1.20 s")).toBe(
      "全部应用完成：共 3 份，完成 1 份，部分完成 1 份，未写入 1 份；耗时 1.20 s。",
    );
  });
});
