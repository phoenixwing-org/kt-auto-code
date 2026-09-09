import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KTC_TOOL_REGISTRATION_CATALOG } from "./tools/toolRegistrationCatalog.js";

const extensionSource = readFileSync(new URL("./extension.ts", import.meta.url), "utf8");
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { contributes?: { commands?: Array<{ command?: string }> } };

describe("Editor / Primary companion 生产注册", () => {
  it("生产 catalog 的 KtTool 名称唯一并包含三个 hidden companion leaf", () => {
    const descriptorNames = [...extensionSource.matchAll(/registerBuiltInTool\((\w+)\);/gu)]
      .map((match) => match[1]!);

    expect(descriptorNames.length).toBeGreaterThan(0);
    expect(new Set(descriptorNames).size).toBe(descriptorNames.length);
    expect(descriptorNames.filter((name) => name === "autoBuildCompanionTool")).toEqual([
      "autoBuildCompanionTool",
    ]);
    expect(descriptorNames.filter((name) => name === "packageIncludesCompanionTool")).toEqual([
      "packageIncludesCompanionTool",
    ]);
    expect(descriptorNames.filter((name) => name === "projectRenameCompanionTool")).toEqual([
      "projectRenameCompanionTool",
    ]);
  });

  it("14 个正式 KtTool 注册与 Catalog 一一对应，Group 只注册为 navigation descriptor", () => {
    const toolIdByDescriptorName: Readonly<Record<string, string>> = {
      headerAsciiTool: "headerAscii",
      encodingFixTool: "encodingFix",
      ignoreSettingsTool: "ignoreSettings",
      environmentSettingsTool: "environmentSettings",
      codeRenameTool: "codeRename",
      codegenTool: "codegen",
      reorderMembersTool: "reorderMembers",
      packageIncludesCompanionTool: "packageIncludes",
      autoBuildCompanionTool: "autoBuild",
      projectRenameCompanionTool: "projectRename",
      uuidReplaceTool: "uuidReplace",
      caaDialogTool: "caaDialog",
      KtcGitTool: "git",
      KtcRunTool: "run",
    };
    const registeredDescriptorNames = [...extensionSource.matchAll(/registerBuiltInTool\((\w+)\);/gu)]
      .map((match) => match[1]!);
    const registeredToolIds = registeredDescriptorNames.map((name) => toolIdByDescriptorName[name]);
    const catalogToolIds = KTC_TOOL_REGISTRATION_CATALOG.tools
      .map(({ toolId }) => toolId)
      .filter((toolId) => toolId !== "codeAssistant");

    expect(registeredToolIds).not.toContain(undefined);
    expect(new Set(registeredToolIds).size).toBe(14);
    expect([...registeredToolIds].sort()).toEqual([...catalogToolIds].sort());
    expect(extensionSource).toContain("registerNavigationDescriptor(codeAssistantNavigationDescriptor)");
    expect(extensionSource).not.toContain("registerBuiltInTool(codeAssistantNavigationDescriptor)");
    expect(extensionSource).not.toContain("registerTool(codeAssistantNavigationDescriptor)");
  });

  it("用户命令各贡献一次，实际注册由唯一 owning support 负责", () => {
    const commands = manifest.contributes?.commands ?? [];
    for (const command of [
      "ktAutoCode.codeAssistant.autoBuild",
      "ktAutoCode.codeAssistant.packageIncludes",
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
