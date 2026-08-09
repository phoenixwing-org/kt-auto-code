import { describe, expect, it } from "vitest";
import {
  CAA_REPLACEMENT_RULES,
  ktcSuggestNameReplacement,
  replaceBufferByRules,
  replaceStringByRules,
  resolveReplacementRules,
} from "./replacementRules.js";

describe("replacementRules", () => {
  it("特定 CAA 规则优先于通用 AutoCode", () => {
    const rules = resolveReplacementRules(CAA_REPLACEMENT_RULES, false);
    expect(replaceStringByRules("KTCIAutoCode KTCEAutoCode KTCAutoCode AutoCode", rules).output)
      .toBe("KTCIAutoBuild KTCEAutoBuild KTCTomBuild TomBuild");
  });

  it("保持大小写派生全大写规则", () => {
    const rules = resolveReplacementRules(CAA_REPLACEMENT_RULES, true);
    expect(replaceStringByRules("KTCIAUTOCODE KTCEAUTOCODE KTCAUTOCODE AUTOCODE", rules).output)
      .toBe("KTCIAUTOBUILD KTCEAUTOBUILD KTCTOMBUILD TOMBUILD");
  });

  it("最长匹配优先且不级联", () => {
    const rules = resolveReplacementRules([
      { id: "short", search: "Auto", replace: "AutoCode" },
      { id: "long", search: "AutoCode", replace: "Done" },
    ], false);
    expect(replaceStringByRules("AutoCode Auto", rules).output).toBe("Done AutoCode");
  });

  it("同一搜索值的不同替换报冲突", () => {
    expect(() => resolveReplacementRules([
      { search: "A", replace: "B" },
      { search: "A", replace: "C" },
    ], false)).toThrow("规则冲突");
  });

  it("同长度重叠时保持用户顺序", () => {
    const rules = resolveReplacementRules([
      { id: "first", search: "AB", replace: "1" },
      { id: "second", search: "BC", replace: "2" },
    ], false);
    expect(replaceStringByRules("ABC", rules).output).toBe("1C");
  });

  it("带空格规则派生全大写", () => {
    const rules = resolveReplacementRules(CAA_REPLACEMENT_RULES, true);
    expect(replaceStringByRules("AUTO CODE", rules).output).toBe("TOM BUILD");
  });

  it("字节替换返回规则统计且保留未命中字节", () => {
    const rules = resolveReplacementRules(CAA_REPLACEMENT_RULES, false);
    const source = Buffer.from("x KTCIAutoCode y Auto Code z", "utf8");
    const result = replaceBufferByRules(source, rules, "utf8");
    expect(result.output.toString("utf8")).toBe("x KTCIAutoBuild y Tom Build z");
    expect(result.matches.map((item) => item.ruleId)).toEqual(["ktci", "auto-space"]);
    expect(result.offsets).toHaveLength(2);
  });

  it("只为命中的名称生成显示建议", () => {
    expect(ktcSuggestNameReplacement(
      "KTCAutoCodeWsp",
      CAA_REPLACEMENT_RULES,
      true,
    )).toMatchObject({ currentName: "KTCAutoCodeWsp", suggestedName: "KTCTomBuildWsp" });
    expect(ktcSuggestNameReplacement("Unrelated", CAA_REPLACEMENT_RULES, true)).toBeUndefined();
  });
});
