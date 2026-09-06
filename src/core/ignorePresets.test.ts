import { describe, expect, it } from "vitest";
import {
  ktcAppendIgnorePreset,
  ktcAppendIgnoreGroup,
  ktcGetIgnorePreset,
  ktcMergeGitIgnore,
  ktcPrimaryCustomIgnoreRules,
  ktcRemoveIgnorePreset,
  ktcRemoveIgnoreGroup,
  ktcSetPrimaryCustomIgnoreRules,
} from "./ignorePresets.js";

describe("ignorePresets", () => {
  it("追加预设幂等且保留用户内容", () => {
    const source = "custom/\n";
    const once = ktcAppendIgnorePreset(source, "caa");
    const twice = ktcAppendIgnorePreset(once, "caa");
    expect(twice).toBe(once);
    expect(once).toContain("custom/\n");
    expect(once).toContain("preset:caa v4");
    expect(once).toContain("win_b64/");
  });

  it("追加时升级旧版本受管块", () => {
    const old = [
      "# >>> KT Auto Code preset:caa v0",
      "old-output/",
      "# <<< KT Auto Code preset:caa v0",
      "",
    ].join("\n");
    const updated = ktcAppendIgnorePreset(old, "caa");
    expect(updated).not.toContain("v0");
    expect(updated).not.toContain("old-output/");
    expect(updated).toContain("preset:caa v4");
  });

  it("去除预设不影响块外同名规则", () => {
    const source = "build/\n";
    const withPreset = ktcAppendIgnorePreset(source, "cpp");
    expect(ktcRemoveIgnorePreset(withPreset, "cpp")).toBe(source + "\n");
  });

  it("受管块不完整时安全失败", () => {
    expect(() => ktcAppendIgnorePreset("# >>> KT Auto Code preset:web v1\n", "web"))
      .toThrow("受管块不完整");
  });

  it("合并 gitignore 保留注释并去除重复行", () => {
    const merged = ktcMergeGitIgnore("custom/\n", "# build\ndist/\ndist/\n");
    expect(merged).toContain("# Synced from .gitignore");
    expect(merged).toContain("# build");
    expect(merged.match(/dist\//g)).toHaveLength(1);
    expect(ktcMergeGitIgnore(merged, "new/\n")).not.toContain("dist/");
  });

  it("保留 CRLF", () => {
    const result = ktcAppendIgnorePreset("custom/\r\n", "web");
    expect(result).toContain("\r\n# >>>");
    expect(result.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("预设目录可读", () => {
    expect(ktcGetIgnorePreset("caa").title).toBe("CAA");
    expect(ktcGetIgnorePreset("web").rules).toContain("node_modules/");
    expect(ktcGetIgnorePreset("caa").rules).toEqual(expect.arrayContaining([
      "*.d", "*.obj", "*.pch", "*.dll", "*.lib", "*.exe", "*.lvl",
      "ToolsData/", "Objects/", "win_b64/", "Install_config_win_b64/", "CATIAV5Level.lvl",
    ]));
    expect(ktcGetIgnorePreset("caa").rules).not.toEqual(expect.arrayContaining(["error.md", ".obsidian/", ".phoenix/", "*.bat", ".vscode/"]));
    expect(ktcGetIgnorePreset("cpp").rules).toEqual(expect.arrayContaining(["build_debug/", "build_release/"]));
  });

  it("按小组追加、去重和单独去除", () => {
    const source = "custom/\nwin_b64\n";
    const result = ktcAppendIgnoreGroup(source, {
      id: "caa-platform",
      title: "CAA 平台输出",
      catalogVersion: 5,
      rules: ["win_b64/", "intel_a/", "intel_a/"],
    });
    expect(result).toContain("group:caa-platform v5");
    expect(result.match(/win_b64/g)).toHaveLength(1);
    expect(result.match(/intel_a\//g)).toHaveLength(1);
    expect(ktcRemoveIgnoreGroup(result, "caa-platform")).toBe(source + "\n");
  });

  it("小组规则已全部存在时不增加空受管块", () => {
    const source = "build/\n";
    expect(ktcAppendIgnoreGroup(source, {
      id: "cpp-cmake",
      title: "C++ / CMake",
      catalogVersion: 5,
      rules: ["build/"],
    })).toBe(source);
  });

  it("Primary 自定义规则独立保存、去重并可清空", () => {
    const source = ktcAppendIgnorePreset("manual/\n", "web");
    const saved = ktcSetPrimaryCustomIgnoreRules(source, ["ImportedInterfaces/", "build/", "build/"]);
    expect(ktcPrimaryCustomIgnoreRules(saved)).toEqual(["ImportedInterfaces/", "build/"]);
    expect(saved).toContain("preset:web");
    expect(ktcSetPrimaryCustomIgnoreRules(saved, [])).toContain("preset:web");
    expect(ktcPrimaryCustomIgnoreRules(ktcSetPrimaryCustomIgnoreRules(saved, []))).toEqual([]);
  });
});
