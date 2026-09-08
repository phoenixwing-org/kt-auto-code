import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ktcReadModuleToolDefinitions } from "../modules/moduleTools.js";
import { KTC_TOOL_REGISTRATION_BY_ID } from "../tools/toolRegistrationCatalog.js";

const BUILT_IN_TOOL_ID_BY_DESCRIPTOR: Readonly<Record<string, string>> = {
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

describe("Tool display metadata SSOT boundary", () => {
  it("每个内置 KtTool 都必须存在中央 toolRegistrationCatalog.json", async () => {
    const extensionSource = await readFile(path.resolve("src/extension.ts"), "utf8");
    const descriptorNames = [...extensionSource.matchAll(/registerBuiltInTool\((\w+)\);/gu)]
      .map((match) => match[1]!);
    const registeredToolIds = descriptorNames.map((name) => BUILT_IN_TOOL_ID_BY_DESCRIPTOR[name]);

    expect(registeredToolIds).not.toContain(undefined);
    for (const toolId of registeredToolIds) {
      expect(KTC_TOOL_REGISTRATION_BY_ID[toolId!], toolId).toBeDefined();
    }
  });

  it("外部可选模块文案从其版本管理的已验证 manifest 原样投影", async () => {
    const manifest = {
      version: "3.4.5",
      ktAutoCodeModule: {
        id: "drawing-review",
        title: "Review",
        commandPrefix: "ktDrawingReview.",
        tools: [{
          id: "drawingReviewOpen",
          title: "完整审图名称",
          shortTitle: "审图",
          description: "版本 3.4.5 提供的说明",
          command: "ktDrawingReview.open",
          requirement: "none",
        }],
      },
    };
    const [tool] = ktcReadModuleToolDefinitions(manifest, "drawing-review");
    const providerSource = await readFile(path.resolve("src/sidebar/sidebarViewProvider.ts"), "utf8");
    const projection = sourceBetween(
      providerSource,
      "const optionalTools = contributions.flatMap",
      "const tools = [",
    );

    expect(tool).toMatchObject({
      title: "完整审图名称",
      shortTitle: "审图",
      description: "版本 3.4.5 提供的说明",
    });
    expect(projection).toContain("...tool");
    expect(projection).not.toMatch(/\btitle\s*:/u);
    expect(projection).not.toMatch(/\bshortTitle\s*:/u);
    expect(projection).not.toMatch(/\bdescription\s*:/u);
  });

  it("Block Host 强制使用 module manifest 文案而不接受 provider 改名", async () => {
    const providerSource = await readFile(path.resolve("src/sidebar/sidebarViewProvider.ts"), "utf8");
    const projection = sourceBetween(
      providerSource,
      "private async sendActiveModuleBlock",
      "async activateModule",
    );
    const providerSpreadAt = projection.indexOf("...providerContent");
    const manifestTitleAt = projection.indexOf("title: manifestTitle", providerSpreadAt);
    const manifestDescriptionAt = projection.indexOf(
      "description: manifestTool?.description",
      providerSpreadAt,
    );

    expect(projection).toContain(
      "const manifestTool = this.getModuleToolSummary(moduleId, this.activeToolId)",
    );
    expect(providerSpreadAt).toBeGreaterThanOrEqual(0);
    expect(manifestTitleAt).toBeGreaterThan(providerSpreadAt);
    expect(manifestDescriptionAt).toBeGreaterThan(providerSpreadAt);
  });

  it("Preview catalog 仅添加 surface 决策，不复制或覆盖显示文案", async () => {
    const previewCatalogSource = await readFile(
      path.resolve("ui-preview/src/previewToolCatalog.ts"),
      "utf8",
    );
    const projection = sourceBetween(
      previewCatalogSource,
      "function previewDescriptorFromRegistration",
      "/**\n * Converts the current Code Assistant tree",
    );

    expect(projection).toContain("...metadata");
    expect(projection).not.toMatch(/\btitle\s*:/u);
    expect(projection).not.toMatch(/\bshortTitle\s*:/u);
    expect(projection).not.toMatch(/\bdescription\s*:/u);
  });
});

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}
