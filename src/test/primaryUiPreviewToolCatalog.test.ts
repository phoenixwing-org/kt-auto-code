import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KTC_CODE_ASSISTANT_NAVIGATION } from "../tools/codeAssistant/navigation.js";
import type { KtcToolNavigatorNode } from "../ui/KtcToolNavigatorModel.js";
import {
  PREVIEW_TOOL_CATALOG,
  PREVIEW_TOOL_NAVIGATION,
  parsePreviewToolCatalog,
  previewToolIdsFromNavigation,
  resolvePreviewTool,
  toPreviewToolNavigation,
  validatePreviewToolCatalog,
  type PreviewToolDescriptor,
  type PreviewToolInstancePolicy,
  type PreviewToolNavigationNode,
  type PreviewToolSurfaces,
} from "../../ui-preview/src/previewToolCatalog.js";

const PRIMARY_TOOL_IDS = [
  "ignoreSettings",
  "environmentSettings",
  "git",
  "run",
  "reorderMembers",
  "headerAscii",
  "encodingFix",
  "uuidReplace",
  "caaDialog",
] as const;

const RIGHT_TOOL_IDS = [
  "projectRename",
  "packageIncludes",
  "codegen",
] as const;

describe("Primary UI preview tool catalog", () => {
  it("用唯一 toolId 注册 Primary 和 Right 两种 surface", () => {
    const toolIds = PREVIEW_TOOL_CATALOG.map(({ toolId }) => toolId);

    expect(new Set(toolIds).size).toBe(toolIds.length);
    for (const toolId of PRIMARY_TOOL_IDS) {
      expect(resolvePreviewTool(toolId)).toMatchObject({
        instancePolicy: { kind: "single" },
        surfaces: { primary: { kind: "full" } },
      });
      expect(resolvePreviewTool(toolId)?.surfaces.right).toBeUndefined();
    }
    for (const toolId of RIGHT_TOOL_IDS) {
      expect(resolvePreviewTool(toolId)).toMatchObject({
        instancePolicy: { kind: "single" },
        surfaces: {
          primary: { kind: "companion" },
          right: { panelId: toolId },
        },
      });
    }
    expect(resolvePreviewTool("autoBuild")).toMatchObject({
      instancePolicy: { kind: "single" },
      surfaces: {
        primary: { kind: "full" },
        right: { panelId: "autoBuild" },
      },
    });
  });

  it("解析并冻结 primary-only、primary full+right 与 right+companion", () => {
    const parsed = parsePreviewToolCatalog([
      descriptor("primaryOnly", { primary: { kind: "full" } }),
      descriptor("primaryWithRight", {
        primary: { kind: "full" },
        right: { panelId: "full-right-panel" },
      }),
      descriptor(
        "rightCompanion",
        { primary: { kind: "companion" }, right: { panelId: "companion-panel" } },
        { kind: "multiple" },
      ),
    ]);

    expect(parsed.map(({ surfaces }) => surfaces)).toEqual([
      { primary: { kind: "full" } },
      { primary: { kind: "full" }, right: { panelId: "full-right-panel" } },
      { primary: { kind: "companion" }, right: { panelId: "companion-panel" } },
    ]);
    expect(parsed[2]?.instancePolicy).toEqual({ kind: "multiple" });
    expect(Object.isFrozen(parsed)).toBe(true);
    for (const entry of parsed) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.instancePolicy)).toBe(true);
      expect(Object.isFrozen(entry.surfaces)).toBe(true);
      if (entry.surfaces.primary) expect(Object.isFrozen(entry.surfaces.primary)).toBe(true);
      if (entry.surfaces.right) expect(Object.isFrozen(entry.surfaces.right)).toBe(true);
    }
  });

  it("导航投影只保留 groupId、toolId 和判别字段", () => {
    const assertMinimalNode = (node: PreviewToolNavigationNode): void => {
      if (node.kind === "tool") {
        expect(Object.keys(node).sort()).toEqual(["kind", "toolId"]);
        return;
      }
      expect(Object.keys(node).sort()).toEqual(["children", "groupId", "kind"]);
      node.children.forEach(assertMinimalNode);
    };

    PREVIEW_TOOL_NAVIGATION.forEach(assertMinimalNode);
  });

  it("KTC Code Assistant 的每个叶子都有目录项", () => {
    const ktcLeafIds = collectKtcLeafIds(KTC_CODE_ASSISTANT_NAVIGATION);
    const projectedLeafIds = previewToolIdsFromNavigation(
      toPreviewToolNavigation(KTC_CODE_ASSISTANT_NAVIGATION),
    );

    expect(projectedLeafIds).toEqual(ktcLeafIds);
    for (const toolId of ktcLeafIds) expect(resolvePreviewTool(toolId)).toBeDefined();
    expect(validatePreviewToolCatalog(PREVIEW_TOOL_CATALOG, PREVIEW_TOOL_NAVIGATION)).toEqual({
      valid: true,
      issues: [],
      toolCount: PREVIEW_TOOL_CATALOG.length,
    });
  });

  it("Code Assistant 目录、Catalog 与 Current Tool SVG 使用同一图标语义", async () => {
    const navigationLeaves = collectKtcLeaves(KTC_CODE_ASSISTANT_NAVIGATION);
    for (const leaf of navigationLeaves) {
      expect(resolvePreviewTool(leaf.toolId)?.icon).toBe(leaf.icon);
    }

    const html = await readFile(path.resolve("ui-preview/index.html"), "utf8");
    const iconNames = new Set(PREVIEW_TOOL_CATALOG.map(({ icon }) => icon));
    for (const icon of iconNames) {
      expect(html).toContain(`id="preview-icon-${icon}"`);
    }
  });

  it("拒绝无 Primary、孤立 companion 和无效 Right", () => {
    const primary = descriptor("same", { primary: { kind: "full" } });
    const duplicate = descriptor("same", { primary: { kind: "full" } });
    const noSurface = rawDescriptor("noSurface", {});
    const rightOnly = rawDescriptor("rightOnly", { right: { panelId: "right-only-panel" } });
    const orphanCompanion = rawDescriptor("orphanCompanion", { primary: { kind: "companion" } });
    const missingPanel = rawDescriptor("missingPanel", {
      primary: { kind: "companion" },
      right: { panelId: "" },
    });
    const invalidPolicy = rawDescriptor(
      "invalidPolicy",
      { primary: { kind: "full" } },
      { kind: "shared" },
    );

    const result = validatePreviewToolCatalog([
      primary,
      duplicate,
      noSurface,
      rightOnly,
      orphanCompanion,
      missingPanel,
      invalidPolicy,
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("duplicate toolId same"),
      expect.stringContaining("primary surface is required"),
      expect.stringContaining("companion primary surface requires a right surface"),
      expect.stringContaining("panelId must be a non-empty string"),
      expect.stringContaining("instancePolicy kind must be single or multiple"),
    ]));
    expect(() => parsePreviewToolCatalog([primary, duplicate])).toThrow("duplicate toolId same");
  });

  it("拒绝导航引用未注册工具", () => {
    const navigation: readonly PreviewToolNavigationNode[] = [
      { kind: "group", groupId: "sample", children: [{ kind: "tool", toolId: "missing" }] },
    ];

    expect(validatePreviewToolCatalog([], navigation).issues)
      .toContain("navigation: missing catalog entry for missing");
  });
});

function descriptor(
  toolId: string,
  surfaces: PreviewToolSurfaces,
  instancePolicy: PreviewToolInstancePolicy = { kind: "single" },
): PreviewToolDescriptor {
  return {
    toolId,
    title: toolId,
    shortTitle: toolId,
    description: toolId,
    icon: "tool",
    groupId: "sample",
    instancePolicy,
    surfaces,
  };
}

function rawDescriptor(
  toolId: string,
  surfaces: unknown,
  instancePolicy: unknown = { kind: "single" },
): Record<string, unknown> {
  return {
    toolId,
    title: toolId,
    shortTitle: toolId,
    description: toolId,
    icon: "tool",
    groupId: "sample",
    instancePolicy,
    surfaces,
  };
}

function collectKtcLeafIds(nodes: readonly KtcToolNavigatorNode[]): readonly string[] {
  return nodes.flatMap((node) => (
    node.kind === "tool" ? [node.toolId] : collectKtcLeafIds(node.children)
  ));
}

function collectKtcLeaves(
  nodes: readonly KtcToolNavigatorNode[],
): readonly Extract<KtcToolNavigatorNode, { kind: "tool" }>[] {
  return nodes.flatMap((node) => (
    node.kind === "tool" ? [node] : collectKtcLeaves(node.children)
  ));
}
