import { describe, expect, it } from "vitest";
import {
  KTC_CAA_RELATION_KINDS,
  ktcAppendAssociatedReplacementRuleDrafts,
  ktcMergeAssociatedReplacementRules,
  ktcSplitNameTokens,
  ktcSuggestAssociatedReplacementRule,
  ktcSuggestAssociatedReplacementRuleCandidates,
  ktcSuggestAssociatedReplacementRules,
} from "./associatedReplacementRules.js";

describe("associatedReplacementRules", () => {
  it.each([
    ["CaaStudy", ["Caa", "Study"]],
    ["AutoCode2D", ["Auto", "Code", "2", "D"]],
    ["XMLParser", ["XML", "Parser"]],
    ["HTTP2_Server", ["HTTP", "2", "Server"]],
    ["Auto Code", ["Auto", "Code"]],
  ])("拆分命名词段 %s", (value, expected) => {
    expect(ktcSplitNameTokens(value)).toEqual(expected);
  });

  it("从任意母规则生成空格和通用前缀关联", () => {
    const result = ktcSuggestAssociatedReplacementRules("CaaStudy", "TomBuild", "KTC");
    expect(result.analysis).toMatchObject({
      searchTokens: ["Caa", "Study"],
      replaceTokens: ["Tom", "Build"],
      confident: true,
    });
    expect(result.rules).toEqual([
      expect.objectContaining({ relationKind: "spaced", search: "Caa Study", replace: "Tom Build" }),
      expect.objectContaining({ relationKind: "prefix", search: "KTCCaaStudy", replace: "KTCTomBuild" }),
    ]);
  });

  it("任一前缀为空时不生成前缀规则", () => {
    const result = ktcSuggestAssociatedReplacementRules("CaaStudy", "TomBuild");
    expect(result.rules.map((rule) => rule.relationKind)).toEqual(["spaced"]);

    const withoutTargetPrefix = ktcSuggestAssociatedReplacementRules("CaaStudy", "TomBuild", "KTC", "");
    expect(withoutTargetPrefix.rules.map((rule) => rule.relationKind)).toEqual(["spaced"]);
  });

  it("源前缀和目标前缀可以分别设置", () => {
    const result = ktcSuggestAssociatedReplacementRules("CaaStudy", "TomBuild", "KTC", "KTM");
    expect(result.rules).toContainEqual(expect.objectContaining({
      relationKind: "prefix",
      search: "KTCCaaStudy",
      replace: "KTMTomBuild",
    }));
  });

  it("CAA 规则生成 I/E 中缀并只替换名称末词段", () => {
    const result = ktcSuggestAssociatedReplacementRules("AutoCode", "TomBuild", "KTC", "KTC", "caa-tail");
    expect(result.rules.map((rule) => [rule.relationKind, rule.search, rule.replace])).toEqual([
      ["caa-i", "KTCIAutoCode", "KTCIAutoBuild"],
      ["caa-e", "KTCEAutoCode", "KTCEAutoBuild"],
    ]);
  });

  it("任一前缀为空时不生成 CAA 前缀组合规则", () => {
    expect(ktcSuggestAssociatedReplacementRules("KevinCode", "TomBuild", "KTC", "", "caa-tail").rules)
      .toEqual([]);
    expect(ktcSuggestAssociatedReplacementRules("KevinCode", "TomBuild", "", "KTM", "caa-full").rules)
      .toEqual([]);
  });

  it("CAA 完整名称模式符合真实 PNX I/E 命名", () => {
    const result = ktcSuggestAssociatedReplacementRules(
      "TemplateFeature",
      "CurveDivision",
      "PNX",
      "PNX",
      "caa-full",
    );
    expect(result.rules.map((rule) => [rule.relationKind, rule.search, rule.replace])).toEqual([
      ["caa-i-full", "PNXITemplateFeature", "PNXICurveDivision"],
      ["caa-e-full", "PNXETemplateFeature", "PNXECurveDivision"],
    ]);
  });

  it("单项菜单可从当前规则派生一种关联", () => {
    const rule = ktcSuggestAssociatedReplacementRule(
      "prefix",
      { id: "custom-1", search: "KeyinCode", replace: "TomBuild" },
      "KTC",
      "KTM",
    );
    expect(rule).toMatchObject({
      parentId: "custom-1",
      search: "KTCKeyinCode",
      replace: "KTMTomBuild",
    });
  });

  it("从普通前缀规则添加 CAA I 时不会重复前缀", () => {
    const rule = ktcSuggestAssociatedReplacementRule(
      "caa-i",
      {
        id: "prefixed",
        relationKind: "prefix",
        search: "KTCAutoCode",
        replace: "KTCTomBuild",
      },
      "KTC",
      "KTC",
    );
    expect(rule).toMatchObject({
      search: "KTCIAutoCode",
      replace: "KTCIAutoBuild",
    });
  });

  it("CAA 派生支持数字、缩写、下划线并移除两侧已有前缀", () => {
    const rule = ktcSuggestAssociatedReplacementRule(
      "caa-i-full",
      {
        id: "prefixed-boundaries",
        relationKind: "prefix",
        search: "KTCXML2_Parser",
        replace: "KTMHTTP3_Builder",
      },
      "KTC",
      "KTM",
    );

    expect(rule).toMatchObject({
      search: "KTCIXML2Parser",
      replace: "KTMIHTTP3Builder",
    });
  });

  it("从普通前缀规则添加 CAA 完整名称时替换整个业务名", () => {
    const rule = ktcSuggestAssociatedReplacementRule(
      "caa-e-full",
      {
        id: "prefixed-real-caa",
        relationKind: "prefix",
        search: "PNXTemplateFeature",
        replace: "PNXCurveDivision",
      },
      "PNX",
      "PNX",
    );
    expect(rule).toMatchObject({
      search: "PNXETemplateFeature",
      replace: "PNXECurveDivision",
    });
  });

  it("候选规则保留不同目标方案并隐藏已经存在的搜索词", () => {
    const rules = ktcSuggestAssociatedReplacementRuleCandidates({
      relationKinds: ["spaced", "prefix", ...KTC_CAA_RELATION_KINDS],
      parent: { id: "primary", search: "AutoCode", replace: "TomBuild" },
      sourcePrefix: "KTC",
      targetPrefix: "KTC",
      existingSearches: ["KTCIAutoCode"],
    });

    expect(rules.some((rule) => rule.search === "KTCIAutoCode")).toBe(false);
    expect(rules.filter((rule) => rule.search === "KTCEAutoCode")).toHaveLength(2);
    expect(rules.map((rule) => rule.relationKind)).toEqual([
      "spaced",
      "prefix",
      "caa-e",
      "caa-e-full",
    ]);
  });

  it("追加选中规则时保留旧规则并忽略重复和空搜索词", () => {
    const existing = [
      { id: "spaced", search: "Auto Code", replace: "Tom Build", source: "generated" as const },
      { id: "manual", search: "Auto_Code", replace: "Tom_Build", source: "user" as const },
    ];
    const appended = ktcAppendAssociatedReplacementRuleDrafts([
      { id: "duplicate", search: "Auto Code", replace: "Other", source: "generated" },
      { id: "primary-copy", search: "AutoCode", replace: "Other", source: "user" },
      { id: "empty", search: "", replace: "Ignored", source: "user" },
      { id: "new", search: "KTCIAutoCode", replace: "KTCITomBuild", source: "generated" },
    ], existing, ["AutoCode"]);

    expect(appended.map((rule) => rule.id)).toEqual(["spaced", "manual", "new"]);
  });

  it("不写死 AutoCode 或 CAA I/E 规则", () => {
    const result = ktcSuggestAssociatedReplacementRules("WidgetFactory", "PartBuilder", "App");
    expect(result.rules.map((rule) => [rule.search, rule.replace])).toEqual([
      ["Widget Factory", "Part Builder"],
      ["AppWidgetFactory", "AppPartBuilder"],
    ]);
    expect(JSON.stringify(result.rules)).not.toContain("KTCI");
  });

  it("重新生成时移除旧自动行、旧模板和空草稿", () => {
    const suggested = ktcSuggestAssociatedReplacementRules("KeyinCode", "TomBuild", "KTC").rules;
    const merged = ktcMergeAssociatedReplacementRules(suggested, [
      { id: "associated-spaced", search: "Old Name", replace: "Old Target", enabled: true, source: "generated" },
      { id: "ktce", search: "KTCEAutoCode", replace: "KTCEAutoBuild", enabled: true },
      { id: "ktc", search: "KTCAutoCode", replace: "KTCTomBuild", enabled: true },
      { id: "auto-space", search: "Auto Code", replace: "Tom Build", enabled: true },
      { id: "auto", search: "AutoCode", replace: "TomBuild", enabled: true },
      { id: "extra-empty", search: "", replace: "", enabled: true, source: "user" },
    ]);

    expect(merged.map((rule) => [rule.search, rule.replace])).toEqual([
      ["Keyin Code", "Tom Build"],
      ["KTCKeyinCode", "KTCTomBuild"],
    ]);
  });

  it("保留非空自定义规则和被用户修改过的旧模板行", () => {
    const suggested = ktcSuggestAssociatedReplacementRules("CaaStudy", "TomBuild", "KTC").rules;
    const merged = ktcMergeAssociatedReplacementRules(suggested, [
      { id: "custom", search: "Caa_Study", replace: "Tom_Build", enabled: true, source: "user" },
      { id: "auto", search: "EditedAutoCode", replace: "EditedTomBuild", enabled: true },
    ]);

    expect(merged.slice(-2)).toEqual([
      expect.objectContaining({ search: "Caa_Study", source: "user", relationKind: "custom" }),
      expect.objectContaining({ search: "EditedAutoCode", source: "user", relationKind: "custom" }),
    ]);
  });

  it("自定义规则与建议搜索词相同时优先保留自定义版本", () => {
    const suggested = ktcSuggestAssociatedReplacementRules("CaaStudy", "TomBuild").rules;
    const merged = ktcMergeAssociatedReplacementRules(suggested, [
      { id: "custom", search: "Caa Study", replace: "Manual Target", enabled: false, source: "user" },
    ]);

    expect(merged).toEqual([
      expect.objectContaining({ search: "Caa Study", replace: "Manual Target", enabled: false, source: "user" }),
    ]);
  });

  it("分别生成常用和 CAA 规则时保留另一组", () => {
    const common = ktcSuggestAssociatedReplacementRules("AutoCode", "TomBuild", "KTC", "KTC", "common").rules;
    const withCommon = ktcMergeAssociatedReplacementRules(common, [], ["spaced", "prefix"]);
    const caa = ktcSuggestAssociatedReplacementRules("AutoCode", "TomBuild", "KTC", "KTC", "caa-tail").rules;
    const merged = ktcMergeAssociatedReplacementRules(caa, withCommon, KTC_CAA_RELATION_KINDS);

    expect(merged.map((rule) => rule.relationKind)).toEqual(["caa-i", "caa-e", "spaced", "prefix"]);
  });

  it("切换 CAA 模式时替换冲突模式而不同时保留", () => {
    const tail = ktcSuggestAssociatedReplacementRules("AutoCode", "TomBuild", "KTC", "KTC", "caa-tail").rules;
    const withTail = ktcMergeAssociatedReplacementRules(tail, [], KTC_CAA_RELATION_KINDS);
    const full = ktcSuggestAssociatedReplacementRules("AutoCode", "TomBuild", "KTC", "KTC", "caa-full").rules;
    const switched = ktcMergeAssociatedReplacementRules(full, withTail, KTC_CAA_RELATION_KINDS);

    expect(switched.map((rule) => [rule.relationKind, rule.search, rule.replace])).toEqual([
      ["caa-i-full", "KTCIAutoCode", "KTCITomBuild"],
      ["caa-e-full", "KTCEAutoCode", "KTCETomBuild"],
    ]);
  });
});
