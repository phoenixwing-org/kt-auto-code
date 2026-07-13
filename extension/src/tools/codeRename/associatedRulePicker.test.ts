import { describe, expect, it } from "vitest";
import { ktcCreateAssociatedRulePicker } from "./associatedRulePicker.js";

describe("associatedRulePicker", () => {
  it("常用规则默认勾选并隐藏已存在的搜索词", () => {
    const picker = ktcCreateAssociatedRulePicker({
      mode: "common",
      search: "AutoCode",
      replace: "TomBuild",
      sourcePrefix: "KTC",
      targetPrefix: "KTM",
      existingRules: [
        { id: "spaced", search: "Auto Code", replace: "Tom Build" },
      ],
    });

    expect(picker.title).toBe("添加常用规则");
    expect(picker.candidates).toEqual([
      expect.objectContaining({
        label: "前缀替换",
        checked: true,
        rule: expect.objectContaining({ search: "KTCAutoCode", replace: "KTMTomBuild" }),
      }),
    ]);
  });

  it("CAA 规则先列完整名称并只默认勾选完整名称", () => {
    const picker = ktcCreateAssociatedRulePicker({
      mode: "caa",
      search: "AutoCode",
      replace: "TomBuild",
      sourcePrefix: "KTC",
      targetPrefix: "KTC",
      existingRules: [],
    });

    expect(picker.candidates.map((candidate) => [candidate.rule.relationKind, candidate.checked])).toEqual([
      ["caa-i-full", true],
      ["caa-e-full", true],
      ["caa-i", false],
      ["caa-e", false],
    ]);
  });

  it("自定义入口展示全部可分析规则但不预先勾选", () => {
    const picker = ktcCreateAssociatedRulePicker({
      mode: "custom",
      search: "CaaStudy",
      replace: "TomBuild",
      sourcePrefix: "KTC",
      targetPrefix: "KTM",
      existingRules: [],
    });

    expect(picker.candidates).toHaveLength(6);
    expect(picker.candidates.every((candidate) => !candidate.checked)).toBe(true);
  });
});
