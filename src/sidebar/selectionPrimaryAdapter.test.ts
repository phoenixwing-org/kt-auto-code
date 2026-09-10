import { describe, expect, it } from "vitest";
import { ktcProjectSelectionPrimary, ktcSelectionPrimaryMessage } from "./selectionPrimaryAdapter.js";
import type { ToolUiState } from "../tools/types.js";

describe("formal Selection Primary adapter", () => {
  it("projects reorder state without changing frozen result identity, selection or row capabilities", () => {
    const state: ToolUiState = {
      status: "done", message: "已预览", scanned: 3, reorderRevision: 5,
      reorderResults: [{ uri: "file:///A.h", relativePath: "A.h", kind: "header", encoding: "UTF-8", changed: true, state: "pending", warnings: [] }],
      reorderSelectedUris: ["file:///A.h"],
    };
    const model = ktcProjectSelectionPrimary({ toolId: "reorderMembers", directory: "/repo", state });
    expect(model.reorder?.reorderResults).toBe(state.reorderResults);
    expect(model.reorder?.reorderSelectedUris).toBe(state.reorderSelectedUris);
    expect(model.reorder).toMatchObject({ presentation: "results", message: "", reorderRevision: 5,
      capabilities: { scan: false, addToWorkset: false, open: true, preview: true, apply: true, cancel: true, gitDiff: true, revert: true, selection: true } });
    expect(model).toMatchObject({ message: "已预览", running: false, scanEnabled: true });
    expect(state.message).toBe("已预览");
  });

  it("projects UUID file groups, mappings and explicit selection; removes cancelled display rows only", () => {
    const row = { uri: "file:///A.h", relativePath: "A.h", encoding: "UTF-8", hitCount: 1, firstLine: 5, state: "pending" as const, hasApplied: false, warnings: [], mappings: [] };
    const state: ToolUiState = { status: "running", uuidStrategy: "fresh_per_hit", uuidResults: [row, { ...row, uri: "cancelled", state: "cancelled" }], uuidSelectedUris: [] };
    const model = ktcProjectSelectionPrimary({ toolId: "uuidReplace", directory: "/repo", state, uuidStrategy: "fresh_per_hit" });
    expect(model).toMatchObject({ running: true, uuidStrategy: "fresh_per_hit", uuid: { presentation: "files", selectedIds: [], running: true } });
    expect(model.uuid?.files).toEqual([row]); expect(model.uuid?.files?.[0]).toBe(row);
    expect(model.uuid?.capabilities).toEqual({ selection: true, open: true, apply: true, cancel: true, gitDiff: true });
    expect(state.uuidResults).toHaveLength(2);
  });

  it("preserves default same-value strategy and distinguishes unscanned / empty results", () => {
    const model = ktcProjectSelectionPrimary({ toolId: "uuidReplace", directory: "", state: { status: "idle" } });
    expect(model.uuidStrategy).toBe("map_per_value"); expect(model.scanEnabled).toBe(false);
    expect(model.uuid?.files).toBeUndefined(); expect(model.uuid?.emptyMessage).toContain("扫描 UUID");
    expect(ktcProjectSelectionPrimary({ toolId: "uuidReplace", directory: "/repo", state: { status: "done", uuidResults: [] } }).uuid?.emptyMessage).toBe("没有 UUID 候选。");
  });

  it("a different UUID UI policy revokes selection/apply, preserves viewing, and restores the original frozen plan on switching back", () => {
    const row = { uri: "file:///A.h", relativePath: "A.h", encoding: "UTF-8", hitCount: 1, firstLine: 5, state: "pending" as const, hasApplied: false, warnings: [], mappings: [] };
    const state: ToolUiState = { status: "done", message: "旧扫描完成", uuidStrategy: "map_per_value", uuidResults: [row], uuidSelectedUris: [row.uri] };
    const changed = ktcProjectSelectionPrimary({ toolId: "uuidReplace", directory: "/repo", state, uuidStrategy: "fresh_per_hit" });
    expect(changed.message).toContain("请重新扫描");
    expect(changed.uuid).toMatchObject({ files: [row], selectedIds: [], capabilities: { selection: false, apply: false, open: true, gitDiff: true } });
    expect(changed.uuid?.files?.[0]).toBe(row);
    const restored = ktcProjectSelectionPrimary({ toolId: "uuidReplace", directory: "/repo", state, uuidStrategy: "map_per_value" });
    expect(restored.message).toBe("旧扫描完成");
    expect(restored.uuid).toMatchObject({ files: [row], selectedIds: [row.uri], capabilities: { selection: true, apply: true } });
    expect(state.uuidSelectedUris).toEqual([row.uri]); expect(state.uuidStrategy).toBe("map_per_value");
  });

  it("maps scans and local-only strategy policy without adding a Host command", () => {
    expect(ktcSelectionPrimaryMessage({ toolId: "reorderMembers", kind: "scan" })).toEqual({ type: "run", toolId: "reorderMembers", action: "scan" });
    expect(ktcSelectionPrimaryMessage({ toolId: "uuidReplace", kind: "scan", uuidStrategy: "fresh_per_hit" })).toEqual({ type: "run", toolId: "uuidReplace", action: "scan", uuidStrategy: "fresh_per_hit" });
    expect(ktcSelectionPrimaryMessage({ toolId: "uuidReplace", kind: "setStrategy", strategy: "fresh_per_hit" })).toBeUndefined();
  });

  it.each(["reorderMembers", "uuidReplace"] as const)("%s maps selection and common row actions to existing messages", (toolId) => {
    const uris = ["file:///A.h", "file:///B.h"];
    const prefix = toolId === "reorderMembers" ? "reorder" : "uuid";
    const selection = ktcSelectionPrimaryMessage({ toolId, kind: "selection", uris });
    expect(selection).toEqual({ type: `${prefix}Selection`, toolId, uris });
    expect((selection as { uris: string[] }).uris).not.toBe(uris);
    for (const action of ["open", "apply", "cancel", "gitDiff"] as const) {
      expect(ktcSelectionPrimaryMessage({ toolId, kind: "action", action, uris })).toEqual({ type: `${prefix}Action`, toolId, action, uris });
    }
  });

  it("keeps reorder diff/revert and never adds them to UUID", () => {
    for (const action of ["preview", "revert"] as const) {
      expect(ktcSelectionPrimaryMessage({ toolId: "reorderMembers", kind: "action", action, uris: ["a"] })).toEqual({ type: "reorderAction", toolId: "reorderMembers", action, uris: ["a"] });
      expect(ktcSelectionPrimaryMessage({ toolId: "uuidReplace", kind: "action", action, uris: ["a"] })).toBeUndefined();
    }
  });
});
