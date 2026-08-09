import { describe, expect, it, vi } from "vitest";
import type { KtcReorderMembersResultActions } from "./contracts.js";
import { ktcExecuteReorderAction, type KtcReorderActionSession } from "./controller.js";
import type { KtcReorderStateRow } from "./state.js";

function row(uri: string, state: KtcReorderStateRow["state"]): KtcReorderStateRow {
  return { uri, relativePath: `src/${uri}.cpp`, kind: "source", encoding: "UTF-8", changed: state !== "unchanged", state, warnings: [] };
}

function setup(rows: KtcReorderStateRow[]): { session: KtcReorderActionSession; actions: Record<keyof KtcReorderMembersResultActions, ReturnType<typeof vi.fn>> } {
  const actions = {
    openFile: vi.fn(async () => undefined),
    previewDiff: vi.fn(async () => undefined),
    openGitDiff: vi.fn(async () => undefined),
    revert: vi.fn(async (uri: string) => ({ uri, state: "reverted" as const })),
    apply: vi.fn(async (uris: readonly string[]) => ({ updates: uris.map((uri) => ({ uri, state: "applied" as const })) })),
  };
  return {
    actions,
    session: { rows, actions, runtimeWarnings: new Map(), selected: new Set(rows.filter((item) => item.state === "pending").map((item) => item.uri)) },
  };
}

describe("member reorder action controller", () => {
  it("opens any cached row but previews only pending rows", async () => {
    const { session, actions } = setup([row("pending", "pending"), row("done", "applied")]);
    await ktcExecuteReorderAction(session, "open", ["done"]);
    await ktcExecuteReorderAction(session, "preview", ["pending"]);
    await ktcExecuteReorderAction(session, "preview", ["done"]);
    expect(actions.openFile).toHaveBeenCalledWith("done");
    expect(actions.previewDiff).toHaveBeenCalledTimes(1);
    expect(actions.previewDiff).toHaveBeenCalledWith("pending");
  });

  it("batch apply forwards only requested pending rows and updates cache", async () => {
    const { session, actions } = setup([row("one", "pending"), row("two", "pending"), row("done", "applied")]);
    const outcome = await ktcExecuteReorderAction(session, "apply", ["one", "done"]);
    expect(actions.apply).toHaveBeenCalledWith(["one"]);
    expect(session.rows.map((item) => item.state)).toEqual(["applied", "pending", "applied"]);
    expect([...session.selected]).toEqual(["two"]);
    expect(outcome.message).toContain("已写入 1 个文件");
  });

  it("records blocked apply diagnostics without dropping other selections", async () => {
    const { session, actions } = setup([row("bad", "pending"), row("other", "pending")]);
    actions.apply.mockResolvedValue({ updates: [{ uri: "bad", state: "blocked", warning: "external change" }] });
    const outcome = await ktcExecuteReorderAction(session, "apply", ["bad"]);
    expect(outcome.status).toBe("error");
    expect(session.runtimeWarnings.get("bad")).toBe("external change");
    expect([...session.selected]).toEqual(["other"]);
  });

  it("cancels candidates in place and keeps rows cached", async () => {
    const { session } = setup([row("one", "pending"), row("two", "pending")]);
    await ktcExecuteReorderAction(session, "cancel", ["one"]);
    expect(session.rows).toHaveLength(2);
    expect(session.rows[0]?.state).toBe("cancelled");
    expect([...session.selected]).toEqual(["two"]);
  });

  it("opens Git diff only for applied rows", async () => {
    const { session, actions } = setup([row("pending", "pending"), row("done", "applied")]);
    await ktcExecuteReorderAction(session, "gitDiff", ["pending"]);
    await ktcExecuteReorderAction(session, "gitDiff", ["done"]);
    expect(actions.openGitDiff).toHaveBeenCalledTimes(1);
    expect(actions.openGitDiff).toHaveBeenCalledWith("done");
  });

  it("reverts applied rows and records blocked revert warnings", async () => {
    const { session, actions } = setup([row("done", "applied")]);
    await ktcExecuteReorderAction(session, "revert", ["done"]);
    expect(session.rows[0]?.state).toBe("reverted");
    session.rows[0]!.state = "applied";
    actions.revert.mockResolvedValue({ uri: "done", state: "blocked", warning: "changed after write" });
    const outcome = await ktcExecuteReorderAction(session, "revert", ["done"]);
    expect(outcome.status).toBe("error");
    expect(session.rows[0]?.state).toBe("blocked");
    expect(session.runtimeWarnings.get("done")).toBe("changed after write");
  });
});
