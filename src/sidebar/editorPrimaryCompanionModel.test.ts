import { describe, expect, it } from "vitest";
import {
  ktcEditorPrimaryCompanionStatusMessage,
  type KtcEditorPrimaryCompanionStatus,
} from "../core/editorPrimaryCompanionContracts.js";
import {
  ktcActivateEditorPrimaryTool,
  ktcCloseEditorPrimaryTool,
  ktcCreateEditorPrimaryCompanionState,
  ktcIsEditorPrimaryCompanionToolId,
  ktcRegisterEditorPrimaryCompanion,
  ktcResolveEditorPrimaryCompanionRoute,
  ktcUpdateEditorPrimaryCompanion,
  ktcValidateEditorPrimaryCompanionRoute,
  type KtcEditorPrimaryActivationSource,
  type KtcEditorPrimaryCompanionState,
} from "./editorPrimaryCompanionModel.js";

function acceptedState(
  result: ReturnType<typeof ktcRegisterEditorPrimaryCompanion>
    | ReturnType<typeof ktcUpdateEditorPrimaryCompanion>,
): KtcEditorPrimaryCompanionState {
  expect(result.accepted).toBe(true);
  if (!result.accepted) throw new Error(result.reason);
  return result.state;
}

describe("Editor to Primary companion model", () => {
  it("projects only allowlisted short status text and ignores untrusted details", () => {
    const unsafeDetails = [
      "/Users/example/private-project",
      String.raw`C:\Users\example\private-project`,
      String.raw`\\private-server\secret-share\project`,
      "https://user:test-token@example.com/private.git",
      "Authorization: Bearer synthetic-test-token-not-a-secret",
      "Command failed: git -C /private/project fetch --prune origin",
      `secret=${"x".repeat(4_096)}`,
    ];
    const statuses: readonly KtcEditorPrimaryCompanionStatus[] = [
      "idle",
      "running",
      "done",
      "error",
    ];

    for (const status of statuses) {
      const projected = unsafeDetails.map((detail) => (
        ktcEditorPrimaryCompanionStatusMessage(status, detail)
      ));
      expect(new Set(projected).size).toBe(1);
      expect(projected[0]!.length).toBeLessThan(80);
      for (const detail of unsafeDetails) expect(projected[0]).not.toContain(detail);
    }
  });

  it("activates one ordinary tool identically from every entry level", () => {
    const sources: readonly KtcEditorPrimaryActivationSource[] = ["ribbon", "menu", "editor", "command"];
    const states = sources.map((source) => ktcActivateEditorPrimaryTool(
      ktcCreateEditorPrimaryCompanionState({
        openToolIds: ["headerAscii", "codeRename"],
        activeToolId: "codeRename",
      }),
      { toolId: "searchReplace", source, preserveFocus: source === "editor" },
    ));

    expect(states.every((state) => state.activeToolId === "searchReplace")).toBe(true);
    expect(states.every((state) => state.openToolIds.join() === "headerAscii,codeRename,searchReplace"))
      .toBe(true);
    expect(states).toEqual(sources.map(() => states[0]));
  });

  it("recognizes only the two prototype companion tool IDs", () => {
    expect(ktcIsEditorPrimaryCompanionToolId("projectRename")).toBe(true);
    expect(ktcIsEditorPrimaryCompanionToolId("autoBuild")).toBe(true);
    expect(ktcIsEditorPrimaryCompanionToolId("searchReplace")).toBe(false);
  });

  it("keeps open-inactive and visible Editors registered without activating them", () => {
    let state = ktcActivateEditorPrimaryTool(
      ktcCreateEditorPrimaryCompanionState(),
      { toolId: "searchReplace", source: "ribbon" },
    );
    state = acceptedState(ktcRegisterEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 1,
      lifecycle: "open-inactive",
    }));
    state = acceptedState(ktcRegisterEditorPrimaryCompanion(state, {
      panelId: "build-panel",
      toolId: "autoBuild",
      sessionId: "build-1",
      revision: 4,
      lifecycle: "visible",
    }));

    expect(state.activeToolId).toBe("searchReplace");
    expect(state.companions.map(({ lifecycle }) => lifecycle)).toEqual(["open-inactive", "visible"]);
  });

  it("reports preserve-focus intent when an Editor activates its companion", () => {
    const registered = ktcRegisterEditorPrimaryCompanion(
      ktcCreateEditorPrimaryCompanionState(),
      {
        panelId: "rename-panel",
        toolId: "projectRename",
        sessionId: "rename-1",
        revision: 0,
        lifecycle: "active",
      },
    );

    expect(registered).toMatchObject({
      accepted: true,
      activation: { toolId: "projectRename", source: "editor", preserveFocus: true },
      state: { activeToolId: "projectRename", openToolIds: ["projectRename"] },
    });
  });

  it("lets the most recently active Editor win across visible split groups", () => {
    let state = ktcCreateEditorPrimaryCompanionState();
    state = acceptedState(ktcRegisterEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 0,
      lifecycle: "visible",
    }));
    state = acceptedState(ktcRegisterEditorPrimaryCompanion(state, {
      panelId: "build-panel",
      toolId: "autoBuild",
      sessionId: "build-1",
      revision: 0,
      lifecycle: "visible",
    }));
    state = acceptedState(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 0,
      lifecycle: "active",
    }));
    state = acceptedState(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "build-panel",
      toolId: "autoBuild",
      sessionId: "build-1",
      revision: 0,
      lifecycle: "active",
    }));

    expect(state.activeToolId).toBe("autoBuild");
    expect(state.openToolIds).toEqual(["projectRename", "autoBuild"]);
    expect(ktcResolveEditorPrimaryCompanionRoute(state)).toMatchObject({
      panelId: "build-panel",
      toolId: "autoBuild",
      sessionId: "build-1",
    });

    state = acceptedState(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 1,
      lifecycle: "active",
    }));
    expect(state.activeToolId).toBe("projectRename");
    expect(state.openToolIds).toEqual(["autoBuild", "projectRename"]);
  });

  it("routes a companion tool to its most recently active session", () => {
    let state = acceptedState(ktcRegisterEditorPrimaryCompanion(
      ktcCreateEditorPrimaryCompanionState(),
      {
        panelId: "rename-left",
        toolId: "projectRename",
        sessionId: "rename-left-1",
        revision: 2,
        lifecycle: "active",
      },
    ));
    state = acceptedState(ktcRegisterEditorPrimaryCompanion(state, {
      panelId: "rename-right",
      toolId: "projectRename",
      sessionId: "rename-right-1",
      revision: 8,
      lifecycle: "visible",
    }));

    expect(ktcResolveEditorPrimaryCompanionRoute(state, "projectRename")).toMatchObject({
      panelId: "rename-left",
      sessionId: "rename-left-1",
    });

    state = acceptedState(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "rename-right",
      toolId: "projectRename",
      sessionId: "rename-right-1",
      revision: 8,
      lifecycle: "active",
    }));
    expect(ktcResolveEditorPrimaryCompanionRoute(state, "projectRename")).toMatchObject({
      panelId: "rename-right",
      sessionId: "rename-right-1",
    });
  });

  it("does not fall back when a Primary click makes the Editor inactive", () => {
    let state = acceptedState(ktcRegisterEditorPrimaryCompanion(
      ktcCreateEditorPrimaryCompanionState({ openToolIds: ["searchReplace"] }),
      {
        panelId: "rename-panel",
        toolId: "projectRename",
        sessionId: "rename-1",
        revision: 2,
        lifecycle: "active",
      },
    ));
    expect(state.activeToolId).toBe("projectRename");

    state = acceptedState(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 2,
      lifecycle: "visible",
    }));
    expect(state.activeToolId).toBe("projectRename");

    state = acceptedState(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 2,
      lifecycle: "open-inactive",
    }));
    expect(state.activeToolId).toBe("projectRename");
  });

  it("rejects late revisions and messages from a replaced session", () => {
    let state = acceptedState(ktcRegisterEditorPrimaryCompanion(
      ktcCreateEditorPrimaryCompanionState(),
      {
        panelId: "rename-panel",
        toolId: "projectRename",
        sessionId: "rename-1",
        revision: 7,
        lifecycle: "active",
      },
    ));

    const late = ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 6,
      lifecycle: "visible",
    });
    expect(late).toMatchObject({ accepted: false, reason: "stale-revision" });
    expect(late.state).toBe(state);

    state = acceptedState(ktcRegisterEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-2",
      revision: 0,
      lifecycle: "active",
    }));
    const replacedSession = ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 99,
      lifecycle: "active",
    });
    expect(replacedSession).toMatchObject({ accepted: false, reason: "session-mismatch" });
  });

  it("requires an exact session and revision before routing a Primary action", () => {
    const state = acceptedState(ktcRegisterEditorPrimaryCompanion(
      ktcCreateEditorPrimaryCompanionState(),
      {
        panelId: "build-panel",
        toolId: "autoBuild",
        sessionId: "build-9",
        revision: 12,
        lifecycle: "active",
      },
    ));

    expect(ktcValidateEditorPrimaryCompanionRoute(state, {
      toolId: "autoBuild",
      sessionId: "build-8",
      revision: 12,
    })).toEqual({ accepted: false, reason: "session-mismatch" });
    expect(ktcValidateEditorPrimaryCompanionRoute(state, {
      toolId: "autoBuild",
      sessionId: "build-9",
      revision: 11,
    })).toEqual({ accepted: false, reason: "revision-mismatch" });
    expect(ktcValidateEditorPrimaryCompanionRoute(state, {
      toolId: "autoBuild",
      sessionId: "build-9",
      revision: 12,
    })).toMatchObject({
      accepted: true,
      route: { panelId: "build-panel", toolId: "autoBuild", sessionId: "build-9", revision: 12 },
    });
  });

  it("keeps a disposed tombstone and rejects late attempts to revive it", () => {
    let state = acceptedState(ktcRegisterEditorPrimaryCompanion(
      ktcCreateEditorPrimaryCompanionState(),
      {
        panelId: "build-panel",
        toolId: "autoBuild",
        sessionId: "build-1",
        revision: 3,
        lifecycle: "active",
      },
    ));
    state = acceptedState(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "build-panel",
      toolId: "autoBuild",
      sessionId: "build-1",
      revision: 4,
      lifecycle: "disposed",
    }));

    expect(ktcResolveEditorPrimaryCompanionRoute(state, "autoBuild")).toBeUndefined();
    expect(ktcValidateEditorPrimaryCompanionRoute(state, {
      toolId: "autoBuild",
      sessionId: "build-1",
      revision: 4,
    })).toEqual({ accepted: false, reason: "disposed" });
    expect(ktcUpdateEditorPrimaryCompanion(state, {
      panelId: "build-panel",
      toolId: "autoBuild",
      sessionId: "build-1",
      revision: 5,
      lifecycle: "active",
    })).toMatchObject({ accepted: false, reason: "disposed" });
  });

  it("closes only the Primary companion and restores MRU without disposing its Editor", () => {
    let state = ktcActivateEditorPrimaryTool(
      ktcCreateEditorPrimaryCompanionState(),
      { toolId: "searchReplace", source: "menu" },
    );
    state = acceptedState(ktcRegisterEditorPrimaryCompanion(state, {
      panelId: "rename-panel",
      toolId: "projectRename",
      sessionId: "rename-1",
      revision: 5,
      lifecycle: "active",
    }));
    const companionsBeforeClose = state.companions;

    const closed = ktcCloseEditorPrimaryTool(state, "projectRename");
    expect(closed).toMatchObject({ closed: true, closedToolId: "projectRename", nextToolId: "searchReplace" });
    expect(closed.state.activeToolId).toBe("searchReplace");
    expect(closed.state.openToolIds).toEqual(["searchReplace"]);
    expect(closed.state.companions).toBe(companionsBeforeClose);
    expect(ktcResolveEditorPrimaryCompanionRoute(closed.state, "projectRename")).toMatchObject({
      panelId: "rename-panel",
      sessionId: "rename-1",
    });
  });
});
