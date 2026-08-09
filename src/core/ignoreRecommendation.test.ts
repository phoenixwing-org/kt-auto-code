import { describe, expect, it } from "vitest";
import { ktcAnalyzeIgnoreRecommendations } from "./ignoreRecommendation.js";

describe("ignoreRecommendation", () => {
  it("根据 CAA 特征推荐小组而不是整个大预设", () => {
    const recommendations = ktcAnalyzeIgnoreRecommendations({
      paths: [
        "PNXDemoWsp/PNXDemo/IdentityCard/IdentityCard.h",
        "PNXDemoWsp/PNXDemoMod.m/Imakefile.mk",
        "PNXDemoWsp/win_b64/",
      ],
      trackedPaths: [],
      existingPatterns: [],
    });
    expect(recommendations.map((item) => item.groupId)).toEqual(expect.arrayContaining([
      "caa-platform", "caa-mkmk", "caa-generated",
    ]));
    expect(recommendations.some((item) => item.groupId === "review-required" && item.defaultSelected)).toBe(false);
  });

  it("识别 CMake 和 Web 项目", () => {
    const recommendations = ktcAnalyzeIgnoreRecommendations({
      paths: ["CMakeLists.txt", "package.json", "pnpm-lock.yaml", "vite.config.ts"],
      trackedPaths: [],
      existingPatterns: [],
    });
    expect(recommendations.map((item) => item.groupId)).toEqual(expect.arrayContaining([
      "cpp-cmake", "native-object", "web-node", "web-output",
    ]));
  });

  it("已有规则不重复建议", () => {
    const recommendations = ktcAnalyzeIgnoreRecommendations({
      paths: ["package.json", "node_modules/"],
      trackedPaths: [],
      existingPatterns: ["node_modules/"],
    });
    const node = recommendations.find((item) => item.groupId === "web-node");
    expect(node?.existingRules.map((rule) => rule.value)).toContain("node_modules/");
    expect(node?.suggestedRules).toHaveLength(0);
    expect(node?.defaultSelected).toBe(false);
  });

  it("目录规则忽略结尾斜杠差异", () => {
    const recommendations = ktcAnalyzeIgnoreRecommendations({
      paths: ["win_b64/"],
      trackedPaths: ["win_b64/link.json"],
      existingPatterns: ["win_b64"],
    });
    const platform = recommendations.find((item) => item.groupId === "caa-platform");
    expect(platform?.existingRules.map((rule) => rule.value)).toContain("win_b64/");
    expect(platform?.blockedRules.map((item) => item.rule.value)).not.toContain("win_b64/");
  });

  it("命中 Git 已跟踪文件的危险规则被阻止", () => {
    const recommendations = ktcAnalyzeIgnoreRecommendations({
      paths: ["PNXTemplateBaseWsp/build.bat", "PNXTemplateBaseWsp/.vscode/launch.json"],
      trackedPaths: ["PNXTemplateBaseWsp/build.bat", "PNXTemplateBaseWsp/.vscode/launch.json"],
      existingPatterns: [],
    });
    const risky = recommendations.find((item) => item.groupId === "review-required");
    expect(risky?.reviewRequired).toBe(true);
    expect(risky?.defaultSelected).toBe(false);
    expect(risky?.blockedRules.map((item) => item.rule.value)).toEqual(expect.arrayContaining(["*.bat", ".vscode/"]));
    expect(risky?.suggestedRules.map((rule) => rule.value)).not.toEqual(expect.arrayContaining(["*.bat", ".vscode/"]));
  });

  it("补充 Desk Tools 顶层进程目录建议但不重复目录规则", () => {
    const recommendations = ktcAnalyzeIgnoreRecommendations({
      paths: ["build-local/", "build-fast/", "bin/", "dist/", "src/bin/"],
      trackedPaths: [],
      existingPatterns: [],
    });
    const processDirectories = recommendations.find((item) => item.groupId === "process-directories");
    expect(processDirectories?.suggestedRules.map((rule) => rule.value)).toEqual(["bin/", "build-*/"]);
    expect(processDirectories?.suggestedRules.map((rule) => rule.value)).not.toContain("dist/");
    expect(processDirectories?.defaultSelected).toBe(true);
  });

  it("顶层进程目录含 Git 跟踪文件时阻断建议", () => {
    const recommendations = ktcAnalyzeIgnoreRecommendations({
      paths: ["out/", "out/generated.cpp"],
      trackedPaths: ["out/generated.cpp"],
      existingPatterns: [],
    });
    const processDirectories = recommendations.find((item) => item.groupId === "process-directories");
    expect(processDirectories?.suggestedRules).toHaveLength(0);
    expect(processDirectories?.blockedRules[0]?.rule.value).toBe("out/");
    expect(processDirectories?.defaultSelected).toBe(false);
  });
});
