import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ktcLoadWorkspaceIgnoreRuleCatalog,
  ktcWorkspaceIgnoreRuleConfigPath,
} from "./ignoreRuleConfigRepository.js";
import { ktcResolveIgnoreGroupRules } from "./ignoreRuleCatalog.js";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "kt-ignore-config-"));
}

describe("ignoreRuleConfigRepository", () => {
  it("工作区无配置时使用内置目录且不创建文件", () => {
    const root = tempRoot();
    const snapshot = ktcLoadWorkspaceIgnoreRuleCatalog(root);
    expect(snapshot.workspaceConfigExists).toBe(false);
    expect(snapshot.error).toBeUndefined();
    expect(snapshot.catalog.groups.some((group) => group.id === "caa-platform")).toBe(true);
  });

  it("加载并合并工作区规则与小组", () => {
    const root = tempRoot();
    const configPath = ktcWorkspaceIgnoreRuleConfigPath(root);
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      version: 1,
      rules: [{
        id: "workspace-output",
        value: "workspace-output/",
        kind: "directory",
        categories: ["workspace", "build-output"],
        description: "工作区输出",
      }],
      groups: [{
        id: "workspace-output",
        title: "工作区输出",
        description: "当前项目输出",
        ruleIds: ["workspace-output"],
      }],
    }));
    const snapshot = ktcLoadWorkspaceIgnoreRuleCatalog(root);
    expect(snapshot.workspaceConfigExists).toBe(true);
    expect(snapshot.error).toBeUndefined();
    expect(ktcResolveIgnoreGroupRules("workspace-output", snapshot.catalog).map((rule) => rule.value))
      .toEqual(["workspace-output/"]);
  });

  it("配置无效时返回错误并保留内置目录", () => {
    const root = tempRoot();
    const configPath = ktcWorkspaceIgnoreRuleConfigPath(root);
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, "{ invalid json");
    const snapshot = ktcLoadWorkspaceIgnoreRuleCatalog(root);
    expect(snapshot.workspaceConfigExists).toBe(true);
    expect(snapshot.error).toContain("JSON 无效");
    expect(snapshot.catalog.groups.some((group) => group.id === "caa-platform")).toBe(true);
  });
});
