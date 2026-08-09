import { describe, expect, it } from "vitest";
import {
  ktcMoveRibbonTool,
  ktcNormalizeRibbonLayout,
  ktcToggleRibbonToolPin,
  type KtcRibbonLayoutTool,
} from "./ribbonLayout.js";

const CODE_TOOLS: readonly KtcRibbonLayoutTool[] = [
  { id: "headerAscii", moduleId: "code" },
  { id: "encodingFix", moduleId: "code" },
  { id: "ignoreSettings", moduleId: "code" },
  { id: "codeRename", moduleId: "code" },
  { id: "codegen", moduleId: "code" },
  { id: "git", moduleId: "code" },
  { id: "run", moduleId: "code" },
  { id: "reorderMembers", moduleId: "code" },
  { id: "uuidReplace", moduleId: "code" },
];

describe("Ribbon layout state", () => {
  it("creates the first-run Code defaults from an empty persisted state", () => {
    expect(ktcNormalizeRibbonLayout(CODE_TOOLS)).toEqual({
      pinnedToolIds: [
        "codeRename", "codegen", "reorderMembers", "run", "git", "uuidReplace", "headerAscii", "encodingFix",
      ],
      toolOrder: [
        "codeRename", "codegen", "reorderMembers", "run", "git", "uuidReplace", "headerAscii", "encodingFix",
        "ignoreSettings",
      ],
    });
  });

  it("filters unknown and duplicate IDs from persisted state and the catalog", () => {
    const tools = [...CODE_TOOLS, { id: "git", moduleId: "cad" as const }];
    expect(ktcNormalizeRibbonLayout(tools, {
      pinnedToolIds: ["git", "missing", "git", 42],
      toolOrder: ["run", "missing", "run", "git"],
    })).toEqual({
      pinnedToolIds: ["git"],
      toolOrder: [
        "run", "git", "headerAscii", "encodingFix", "ignoreSettings", "codeRename", "codegen",
        "reorderMembers", "uuidReplace",
      ],
    });
  });

  it("appends a newly contributed tool without pinning it in a known module", () => {
    const previousTools = CODE_TOOLS.filter((tool) => tool.id !== "run");
    const previous = ktcNormalizeRibbonLayout(previousTools);
    expect(ktcNormalizeRibbonLayout(CODE_TOOLS, previous)).toEqual({
      pinnedToolIds: [
        "codeRename", "codegen", "reorderMembers", "git", "uuidReplace", "headerAscii", "encodingFix",
      ],
      toolOrder: [...previous.toolOrder, "run"],
    });
  });

  it("pins an optional module on first install but not tools added in a later upgrade", () => {
    const beforeCad = ktcNormalizeRibbonLayout(CODE_TOOLS);
    const firstInstall = ktcNormalizeRibbonLayout([
      ...CODE_TOOLS,
      { id: "cadOpen", moduleId: "cad" },
      { id: "cadCheck", moduleId: "cad" },
    ], beforeCad);
    expect(firstInstall.pinnedToolIds.slice(-2)).toEqual(["cadOpen", "cadCheck"]);

    const upgraded = ktcNormalizeRibbonLayout([
      ...CODE_TOOLS,
      { id: "cadOpen", moduleId: "cad" },
      { id: "cadCheck", moduleId: "cad" },
      { id: "cadExport", moduleId: "cad" },
    ], firstInstall);
    expect(upgraded.toolOrder.at(-1)).toBe("cadExport");
    expect(upgraded.pinnedToolIds).not.toContain("cadExport");
  });

  it("removes tools from an uninstalled module", () => {
    const installed = ktcNormalizeRibbonLayout([
      ...CODE_TOOLS,
      { id: "cadOpen", moduleId: "cad" },
    ]);
    const afterUninstall = ktcNormalizeRibbonLayout(CODE_TOOLS, installed);
    expect(afterUninstall.toolOrder).not.toContain("cadOpen");
    expect(afterUninstall.pinnedToolIds).not.toContain("cadOpen");
  });

  it("toggles pinning without changing the saved order", () => {
    const original = ktcNormalizeRibbonLayout(CODE_TOOLS);
    const unpinned = ktcToggleRibbonToolPin(original, CODE_TOOLS, "codeRename");
    expect(unpinned).toMatchObject({ changed: true });
    expect(unpinned.layout.pinnedToolIds).not.toContain("codeRename");
    expect(unpinned.layout.toolOrder).toEqual(original.toolOrder);

    const repinned = ktcToggleRibbonToolPin(unpinned.layout, CODE_TOOLS, "codeRename");
    expect(repinned.layout.pinnedToolIds).toEqual(original.pinnedToolIds);
    expect(repinned.layout.toolOrder).toEqual(original.toolOrder);
  });

  it("moves pinned tools before and after another tool in the same module", () => {
    const original = ktcNormalizeRibbonLayout(CODE_TOOLS);
    const before = ktcMoveRibbonTool(original, CODE_TOOLS, "run", "encodingFix", "before");
    expect(before.changed).toBe(true);
    expect(before.layout.pinnedToolIds.slice(0, 3)).toEqual(["codeRename", "codegen", "reorderMembers"]);
    expect(before.layout.pinnedToolIds.indexOf("run")).toBeLessThan(before.layout.pinnedToolIds.indexOf("encodingFix"));

    const after = ktcMoveRibbonTool(before.layout, CODE_TOOLS, "run", "codegen", "after");
    expect(after.changed).toBe(true);
    expect(after.layout.pinnedToolIds).toEqual([
      "codeRename", "codegen", "run", "reorderMembers", "git", "uuidReplace", "headerAscii", "encodingFix",
    ]);
  });

  it("moves unpinned tools so a later pin keeps the chosen position", () => {
    const original = ktcToggleRibbonToolPin(
      ktcNormalizeRibbonLayout(CODE_TOOLS),
      CODE_TOOLS,
      "uuidReplace",
    ).layout;
    const moved = ktcMoveRibbonTool(original, CODE_TOOLS, "uuidReplace", "codegen", "before");
    expect(moved.changed).toBe(true);
    expect(moved.layout.pinnedToolIds).not.toContain("uuidReplace");
    expect(moved.layout.toolOrder.indexOf("uuidReplace")).toBeLessThan(
      moved.layout.toolOrder.indexOf("codegen"),
    );
    const repinned = ktcToggleRibbonToolPin(moved.layout, CODE_TOOLS, "uuidReplace");
    expect(repinned.layout.pinnedToolIds.indexOf("uuidReplace")).toBeLessThan(
      repinned.layout.pinnedToolIds.indexOf("codegen"),
    );
  });

  it("rejects cross-module moves without changing layout", () => {
    const tools: KtcRibbonLayoutTool[] = [...CODE_TOOLS, { id: "cadOpen", moduleId: "cad" }];
    const original = ktcNormalizeRibbonLayout(tools);
    const result = ktcMoveRibbonTool(original, tools, "run", "cadOpen", "before");
    expect(result).toEqual({ layout: original, changed: false, reason: "cross-module" });
  });
});
