import { describe, expect, it } from "vitest";
import { ktcCodegenApplyOutcome } from "./applyOutcome.js";

describe("Codegen Apply 轻量结构化结果", () => {
  it("早退保持零写入并保留诊断", () => {
    const diagnostic = { code: "apply.unsaved-source", severity: "error" as const, message: "未保存" };
    expect(ktcCodegenApplyOutcome([diagnostic])).toEqual({
      modifiedFileCount: 0,
      writtenRegionCount: 0,
      diagnostics: [diagnostic],
    });
  });

  it("成功结果记录实际修改文件与写入区域", () => {
    expect(ktcCodegenApplyOutcome([], 2, 7)).toEqual({
      modifiedFileCount: 2,
      writtenRegionCount: 7,
      diagnostics: [],
    });
  });
});
