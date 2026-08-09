import { describe, expect, it } from "vitest";
import {
  KTC_IGNORE_RULE_CATALOG_VERSION,
  ktcGetBuiltinIgnoreRuleCatalog,
  ktcGetIgnoreRulesForCategories,
  ktcListIgnoreCategories,
  ktcMergeIgnoreRuleCatalogs,
  ktcParseIgnoreRuleCatalog,
  ktcParseIgnoreRuleCatalogText,
  ktcResolveIgnoreGroupRules,
} from "./ignoreRuleCatalog.js";

describe("ignoreRuleCatalog", () => {
  it("CAA 规则保留类型、多标签和说明", () => {
    const rule = ktcGetIgnoreRulesForCategories(["windows", "build-output"])
      .find((item) => item.id === "caa-win-b64");
    expect(rule).toMatchObject({
      value: "win_b64/",
      kind: "directory",
      description: "CAA V5 Windows 64 位平台输出目录（MkmkOS_VAR）",
    });
    expect(rule?.categories).toEqual(expect.arrayContaining(["caa", "windows", "build-output"]));
  });

  it("分类可组合查询，目录版本与分类列表可用", () => {
    const rules = ktcGetIgnoreRulesForCategories(["cmake", "debug"]);
    expect(rules.map((item) => item.id)).toEqual(expect.arrayContaining(["cpp-build", "cpp-build-debug"]));
    expect(KTC_IGNORE_RULE_CATALOG_VERSION).toBe(5);
    expect(ktcListIgnoreCategories()).toEqual(expect.arrayContaining(["caa", "cmake", "phoenix", "web"]));
  });

  it("CAA 专用目录使用真实含义和分类", () => {
    const byId = new Map(ktcGetIgnoreRulesForCategories(["caa"]).map((rule) => [rule.id, rule]));
    expect(byId.get("caa-intel-a")).toMatchObject({
      description: "CAA V5 Windows 32 位平台输出目录（MkmkOS_VAR）",
      categories: expect.arrayContaining(["caa", "windows", "x86", "mkmk-os", "build-output"]),
    });
    expect(byId.get("caa-catenv")).toMatchObject({
      description: "CATIA/CAA V5 运行环境定义文件目录",
      categories: expect.arrayContaining(["runtime-environment", "environment", "config"]),
    });
    expect(byId.get("caa-imported-interfaces")).toMatchObject({
      description: "mkmk 生成的外部接口映射与转接头文件目录",
      categories: expect.arrayContaining(["interfaces", "interface-map", "generated"]),
    });
    expect(byId.get("caa-protected-generated")?.categories).toEqual(expect.arrayContaining(["protected", "interface-code", "tie"]));
    expect(byId.get("caa-local-generated")?.categories).toEqual(expect.arrayContaining(["module-local", "generated-source"]));
  });

  it("原生编译产物覆盖对象、预编译头、库、模块和可执行文件", () => {
    const nativeRules = ktcGetIgnoreRulesForCategories(["native-build"]);
    expect(nativeRules.map((rule) => rule.value)).toEqual(expect.arrayContaining([
      "*.d", "*.slo", "*.lo", "*.o", "*.obj", "*.gch", "*.pch",
      "*.so", "*.dylib", "*.dll", "*.mod", "*.smod",
      "*.lai", "*.la", "*.a", "*.lib", "*.exe", "*.out", "*.app", "*.lvl",
    ]));
    expect(nativeRules.find((rule) => rule.value === "*.dll")?.categories)
      .toEqual(expect.arrayContaining(["windows", "dynamic-library"]));
    expect(nativeRules.find((rule) => rule.value === "*.smod")?.categories)
      .toEqual(expect.arrayContaining(["fortran", "module"]));
  });

  it("项目特有规则可查询，但不混入通用 CAA 分类", () => {
    const projectRules = ktcGetIgnoreRulesForCategories(["pnx-caa-study"]);
    expect(projectRules.map((rule) => rule.value)).toEqual(expect.arrayContaining([
      "error.md", ".obsidian/", ".phoenix/", ".cache/", "wasm/", "*.bigray",
      "*.zip", "*.ppm", "*.history.obj", "output/*.*", "my.cmake", "temp.md", "*.bat", ".vscode/",
    ]));
    const caaRules = ktcGetIgnoreRulesForCategories(["caa"]);
    expect(caaRules.map((rule) => rule.value)).not.toEqual(expect.arrayContaining(["*.bat", ".vscode/", "temp.md"]));
    expect(projectRules.find((rule) => rule.value === "*.bat")?.categories).toContain("review-required");
  });

  it("内置规则按小组渐进解析", () => {
    expect(ktcResolveIgnoreGroupRules("caa-platform").map((rule) => rule.value))
      .toEqual(["win_b64/", "Install_config_win_b64/", "CATIAV5Level.lvl", "intel_a/"]);
    expect(ktcResolveIgnoreGroupRules("caa-generated").map((rule) => rule.value))
      .toEqual(["ProtectedGenerated/", "LocalGenerated/"]);
    const risky = ktcResolveIgnoreGroupRules("review-required");
    expect(risky.map((rule) => rule.value)).toEqual(expect.arrayContaining(["*.zip", "*.ppm", "*.bat", ".vscode/"]));
    expect(ktcGetBuiltinIgnoreRuleCatalog().groups.find((group) => group.id === "review-required")?.reviewRequired).toBe(true);
  });

  it("工作区目录可追加规则和小组", () => {
    const extension = ktcParseIgnoreRuleCatalogText(JSON.stringify({
      version: 1,
      rules: [{
        id: "workspace-cache",
        value: ".workspace-cache/",
        kind: "directory",
        categories: ["workspace", "cache"],
        description: "工作区缓存",
      }],
      groups: [{
        id: "workspace-local",
        title: "工作区本地规则",
        description: "当前工作区扩展",
        includeCategories: ["workspace"],
      }],
    }));
    const merged = ktcMergeIgnoreRuleCatalogs(ktcGetBuiltinIgnoreRuleCatalog(), extension);
    expect(ktcResolveIgnoreGroupRules("workspace-local", merged).map((rule) => rule.value))
      .toEqual([".workspace-cache/"]);
  });

  it("覆盖内置规则必须显式声明", () => {
    const overrideRule = {
      id: "caa-tools-data",
      value: "CustomToolsData/",
      kind: "directory",
      categories: ["caa"],
      description: "自定义工具数据",
    };
    const withoutFlag = ktcParseIgnoreRuleCatalog({ version: 1, rules: [overrideRule] });
    expect(() => ktcMergeIgnoreRuleCatalogs(ktcGetBuiltinIgnoreRuleCatalog(), withoutFlag))
      .toThrow("override: true");
    const withFlag = ktcParseIgnoreRuleCatalog({ version: 1, rules: [{ ...overrideRule, override: true }] });
    const merged = ktcMergeIgnoreRuleCatalogs(ktcGetBuiltinIgnoreRuleCatalog(), withFlag);
    expect(merged.rules.find((rule) => rule.id === "caa-tools-data")?.value).toBe("CustomToolsData/");
  });

  it("拒绝危险路径和非法目录规则", () => {
    expect(() => ktcParseIgnoreRuleCatalog({
      version: 1,
      rules: [{ id: "bad-parent", value: "../secret", kind: "pattern", categories: ["bad"], description: "bad" }],
    })).toThrow("危险路径");
    expect(() => ktcParseIgnoreRuleCatalog({
      version: 1,
      rules: [{ id: "bad-dir", value: "build", kind: "directory", categories: ["bad"], description: "bad" }],
    })).toThrow("必须以 / 结尾");
  });
});
