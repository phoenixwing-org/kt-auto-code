import { describe, expect, it } from "vitest";
import {
  ktcMoveRibbonTool,
  ktcNormalizeRibbonLayout,
  ktcResetCodeRibbonLayout,
  ktcToggleRibbonToolPin,
  type KtcRibbonLayoutTool,
} from "./ribbonLayout.js";

const CODE_TOOLS: readonly KtcRibbonLayoutTool[] = [
  { id: "codeRename", moduleId: "code" },
  { id: "codegen", moduleId: "code" },
  { id: "git", moduleId: "code" },
  { id: "run", moduleId: "code" },
  { id: "codeAssistant", moduleId: "code" },
];

describe("Ribbon layout state", () => {
  it("creates the first-run Code defaults from an empty persisted state", () => {
    expect(ktcNormalizeRibbonLayout(CODE_TOOLS)).toEqual({
      pinnedToolIds: [
        "codeAssistant", "git", "run", "codeRename", "codegen",
      ],
      toolOrder: [
        "codeAssistant", "git", "run", "codeRename", "codegen",
      ],
    });
  });

  it("filters unknown and duplicate IDs from persisted state and the catalog", () => {
    const tools = [...CODE_TOOLS, { id: "git", moduleId: "cad" as const }];
    expect(ktcNormalizeRibbonLayout(tools, {
      pinnedToolIds: ["git", "missing", "git", 42],
      toolOrder: ["run", "missing", "run", "git"],
    })).toEqual({
      pinnedToolIds: ["codeAssistant", "git"],
      toolOrder: [
        "codeAssistant", "run", "git", "codeRename", "codegen",
      ],
    });
  });

  it("appends a normal newly contributed tool without pinning it in a known module", () => {
    const previousTools = CODE_TOOLS.filter((tool) => tool.id !== "run");
    const previous = ktcNormalizeRibbonLayout(previousTools);
    expect(ktcNormalizeRibbonLayout(CODE_TOOLS, previous)).toEqual({
      pinnedToolIds: [
        "codeAssistant", "git", "codeRename", "codegen",
      ],
      toolOrder: [...previous.toolOrder, "run"],
    });
  });

  it("upgrades an old saved layout by pinning 代码辅助 at its approved default position once", () => {
    const oldTools = CODE_TOOLS.filter((tool) => tool.id !== "codeAssistant");
    const oldLayout = ktcNormalizeRibbonLayout(oldTools);
    const upgraded = ktcNormalizeRibbonLayout(CODE_TOOLS, oldLayout);
    expect(upgraded.pinnedToolIds).toContain("codeAssistant");
    expect(upgraded.toolOrder.indexOf("codeAssistant")).toBe(upgraded.toolOrder.indexOf("run") - 1);
    expect(upgraded.toolOrder.indexOf("codeAssistant")).toBeLessThan(upgraded.toolOrder.indexOf("run"));

    const userUnpinned = ktcToggleRibbonToolPin(upgraded, CODE_TOOLS, "codeAssistant").layout;
    expect(ktcNormalizeRibbonLayout(CODE_TOOLS, userUnpinned).pinnedToolIds).not.toContain("codeAssistant");
  });

  it("首次启动时按代码辅助、Git、Run、替换、自动代码排序", () => {
    const layout = ktcNormalizeRibbonLayout(CODE_TOOLS);
    expect(layout.pinnedToolIds).toEqual(["codeAssistant", "git", "run", "codeRename", "codegen"]);
  });

  it("只重置 Code 默认顺序与固定项，保留 CAD 的顺序和固定状态", () => {
    const tools = [...CODE_TOOLS, { id: "cadOpen", moduleId: "cad" as const }];
    const reset = ktcResetCodeRibbonLayout({
      toolOrder: ["codegen", "cadOpen", "run", "git", "codeRename", "codeAssistant"],
      pinnedToolIds: ["codegen", "cadOpen"],
    }, tools);
    expect(reset.toolOrder).toEqual(["codeAssistant", "git", "run", "codeRename", "codegen", "cadOpen"]);
    expect(reset.pinnedToolIds).toEqual(["codeAssistant", "git", "run", "codeRename", "codegen", "cadOpen"]);
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
    const after = ktcMoveRibbonTool(original, CODE_TOOLS, "run", "codegen", "after");
    expect(after.changed).toBe(true);
    const before = ktcMoveRibbonTool(after.layout, CODE_TOOLS, "run", "git", "before");
    expect(before.changed).toBe(true);
    expect(before.layout.pinnedToolIds).toEqual([
      "codeAssistant", "run", "git", "codeRename", "codegen",
    ]);
  });

  it("moves unpinned tools so a later pin keeps the chosen position", () => {
    const original = ktcToggleRibbonToolPin(
      ktcNormalizeRibbonLayout(CODE_TOOLS),
      CODE_TOOLS,
      "git",
    ).layout;
    const moved = ktcMoveRibbonTool(original, CODE_TOOLS, "git", "codegen", "before");
    expect(moved.changed).toBe(true);
    expect(moved.layout.pinnedToolIds).not.toContain("git");
    expect(moved.layout.toolOrder.indexOf("git")).toBeLessThan(
      moved.layout.toolOrder.indexOf("codegen"),
    );
    const repinned = ktcToggleRibbonToolPin(moved.layout, CODE_TOOLS, "git");
    expect(repinned.layout.pinnedToolIds.indexOf("git")).toBeLessThan(
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
