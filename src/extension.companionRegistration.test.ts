import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const extensionSource = readFileSync(new URL("./extension.ts", import.meta.url), "utf8");
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { contributes?: { commands?: Array<{ command?: string }> } };

describe("Editor / Primary companion 生产注册", () => {
  it("生产 catalog 的 descriptor 名称唯一并包含两个 hidden companion", () => {
    const descriptorNames = [...extensionSource.matchAll(/registerTool\((\w+)\);/gu)]
      .map((match) => match[1]!);

    expect(descriptorNames.length).toBeGreaterThan(0);
    expect(new Set(descriptorNames).size).toBe(descriptorNames.length);
    expect(descriptorNames.filter((name) => name === "autoBuildCompanionTool")).toEqual([
      "autoBuildCompanionTool",
    ]);
    expect(descriptorNames.filter((name) => name === "projectRenameCompanionTool")).toEqual([
      "projectRenameCompanionTool",
    ]);
  });

  it("用户命令各贡献一次，实际注册由唯一 owning support 负责", () => {
    const commands = manifest.contributes?.commands ?? [];
    for (const command of [
      "ktAutoCode.codeAssistant.autoBuild",
      "ktAutoCode.projectRenameAnalysis.open",
    ]) {
      expect(commands.filter((candidate) => candidate.command === command)).toHaveLength(1);
    }

    expect(extensionSource.match(/registerCodeAssistantSupport\(context\)/gu)).toHaveLength(1);
    expect(extensionSource.match(/ktcRegisterProjectRenameAnalysis\(context\)/gu)).toHaveLength(1);
  });

  it("目录 Header 命令各注册一次并只切换 Provider 展示状态", () => {
    const commands = manifest.contributes?.commands ?? [];
    for (const command of ["ktAutoCode.directory.show", "ktAutoCode.directory.hide"]) {
      expect(commands.filter((candidate) => candidate.command === command)).toHaveLength(1);
      expect(extensionSource.split(`registerCommand("${command}"`)).toHaveLength(2);
    }
    expect(extensionSource).toContain("sidebarProvider?.setDirectoryVisible(true)");
    expect(extensionSource).toContain("sidebarProvider?.setDirectoryVisible(false)");
  });

  it("Host bridge 绑定同一 Provider，并由 ExtensionContext dispose 明确解除", () => {
    expect(extensionSource).toContain(
      "activate: (toolId) => sidebarProvider!.activateEditorCompanionTool(toolId)",
    );
    expect(extensionSource).toContain(
      "onDidChange: (snapshot) => sidebarProvider!.updateEditorCompanion(snapshot)",
    );
    expect(extensionSource).toContain("setCodeAssistantPrimaryCompanionHost(undefined)");
    expect(extensionSource).toContain("setProjectRenamePrimaryCompanionHost(undefined)");
    const deactivateBody = extensionSource.slice(extensionSource.indexOf("export function deactivate"));
    expect(deactivateBody.indexOf("setCodeAssistantPrimaryCompanionHost(undefined)")).toBeLessThan(
      deactivateBody.indexOf("sidebarProvider = undefined"),
    );
    expect(deactivateBody.indexOf("setProjectRenamePrimaryCompanionHost(undefined)")).toBeLessThan(
      deactivateBody.indexOf("sidebarProvider = undefined"),
    );
    expect(deactivateBody.indexOf("clearRegisteredTools()")).toBeGreaterThan(
      deactivateBody.indexOf("sidebarProvider = undefined"),
    );
  });
});
