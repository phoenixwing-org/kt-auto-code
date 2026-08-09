import { describe, expect, it } from "vitest";
import { ktcCodegenApplyOutcome } from "./applyOutcome.js";

describe("Codegen Apply 轻量结构化结果", () => {
  it("早退保持零写入并保留诊断", () => {
    const diagnostic = { code: "apply.unsaved-source", severity: "error" as const, message: "未保存" };
    expect(ktcCodegenApplyOutcome([diagnostic])).toEqual({
      health: "error",
      change: "not-applied",
      reasonCode: "apply-blocked",
      modifiedFileCount: 0,
      writtenRegionCount: 0,
      diagnostics: [diagnostic],
    });
  });

  it("成功结果记录实际修改文件与写入区域", () => {
    expect(ktcCodegenApplyOutcome([], 2, 7)).toEqual({
      health: "success",
      change: "updated",
      reasonCode: "content-updated",
      modifiedFileCount: 2,
      writtenRegionCount: 7,
      diagnostics: [],
    });
  });

  it("零写入且无问题是正常内容一致，不伪装成错误", () => {
    expect(ktcCodegenApplyOutcome([])).toMatchObject({
      health: "success",
      change: "unchanged",
      reasonCode: "content-unchanged",
    });
  });

  it("有错误但安全区域已写入时明确为部分更新", () => {
    const diagnostic = { code: "marker.missing", severity: "error" as const, message: "缺失" };
    expect(ktcCodegenApplyOutcome([diagnostic], 1, 2)).toMatchObject({
      health: "error",
      change: "partial",
      reasonCode: "partial-with-errors",
    });
  });
});
