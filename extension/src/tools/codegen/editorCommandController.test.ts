import type { KtCodegenTableData } from "@phoenix-wing/kt-codegen";
import { describe, expect, it, vi } from "vitest";
import type {
  KtcCodegenControlMessage,
  KtcCodegenEditorModel,
} from "./editorContracts.js";
import type { KtcCodegenDocumentModel, KtcCodegenTableAcceptance } from "./documentModel.js";
import type { KtcCodegenEditorCommand } from "./editorMessageRouter.js";
import type { KtcCodegenOperationTimer } from "./operationTimer.js";
import {
  ktcExecuteCodegenEditorCommand,
  type KtcCodegenEditorCommandActions,
} from "./editorCommandController.js";

const URI = "file:///workspace/Demo.json";
const TABLE: KtCodegenTableData = {
  kind: "kt.codegen.table-data",
  schemaVersion: 1,
  documentRevision: 3,
  selectedRow: null,
  items: [],
};
const MODEL: KtcCodegenEditorModel = {
  uri: URI,
  fileName: "Demo.json",
  table: TABLE,
  controls: {
    kind: "kt.codegen.control-view-model",
    schemaVersion: 1,
    uri: URI,
    fileName: "Demo.json",
    blocks: [],
    selectedBlockKeys: [],
    singleSelectionMode: false,
    showMissingTemplates: false,
    preflightAvailable: false,
    missingTemplates: [],
    presets: { all: [], none: [], cppOnly: [], fieldCode: [] },
  },
  dirty: false,
  externalConflict: false,
};
const CONTROL: KtcCodegenControlMessage = {
  type: "codegenControlDisplay",
  toolId: "codegen",
  uri: URI,
  showMissingTemplates: true,
};
const PREFLIGHT = { plan: { canApply: true } };

function timer(elapsed = "240 ms"): KtcCodegenOperationTimer {
  return {
    elapsedMilliseconds: vi.fn(() => 240),
    elapsedText: vi.fn(() => elapsed),
  };
}

function fakeSession(
  events: string[],
  acceptance: KtcCodegenTableAcceptance = "unchanged",
  preflight: unknown = undefined,
) {
  const raw = {
    identity: { uri: URI, fsPath: "/workspace/Demo.json", fileName: "Demo.json" },
    preflight,
    markTableDirty: vi.fn((itemCount: number) => {
      events.push(`dirty:${itemCount}`);
    }),
    acceptTable: vi.fn((_table: KtCodegenTableData) => {
      events.push(`accept:${acceptance}`);
      return acceptance;
    }),
  };
  return {
    raw,
    session: raw as unknown as KtcCodegenDocumentModel,
  };
}

function fakeActions(
  events: string[],
  actionTimer = timer(),
  overrides: Partial<KtcCodegenEditorCommandActions> = {},
): KtcCodegenEditorCommandActions {
  const actions: KtcCodegenEditorCommandActions = {
    startTimer: vi.fn(() => {
      events.push("timer");
      return actionTimer;
    }),
    handleControl: vi.fn(async () => {
      events.push("control");
    }),
    didMutate: vi.fn((message?: string) => {
      events.push(`mutate:${message ?? "default"}`);
    }),
    postStatus: vi.fn((message) => {
      events.push(`status:${message.message}`);
    }),
    publishModel: vi.fn(() => {
      events.push("model");
    }),
    publish: vi.fn((message: string) => {
      events.push(`publish:${message}`);
    }),
    log: vi.fn((line: string) => {
      events.push(`log:${line}`);
    }),
    save: vi.fn(async () => {
      events.push("save");
    }),
    revert: vi.fn(async () => {
      events.push("revert");
    }),
    cancelPreflight: vi.fn((uri: string) => {
      events.push(`cancel:${uri}`);
    }),
    runPreflight: vi.fn(async (value?: KtcCodegenOperationTimer) => {
      events.push(value ? "preflight:timer" : "preflight:default");
    }),
    apply: vi.fn(async (value: KtcCodegenOperationTimer) => {
      events.push(value === actionTimer ? "apply:timer" : "apply:other");
    }),
  };
  return Object.assign(actions, overrides);
}

async function execute(
  command: KtcCodegenEditorCommand,
  acceptance: KtcCodegenTableAcceptance = "unchanged",
  preflight: unknown = undefined,
) {
  const events: string[] = [];
  const { raw, session } = fakeSession(events, acceptance, preflight);
  const actions = fakeActions(events);
  await ktcExecuteCodegenEditorCommand(session, command, actions);
  return { actions, events, raw, session };
}

describe("Codegen editor command controller", () => {
  it("覆盖 ignore、control 与 dirty 的无副作用、委托和 Model→Host 顺序", async () => {
    const ignored = await execute({ kind: "ignore" });
    expect(ignored.events).toEqual([]);
    expect(ignored.raw.markTableDirty).not.toHaveBeenCalled();
    expect(ignored.raw.acceptTable).not.toHaveBeenCalled();

    const controlled = await execute({ kind: "control", message: CONTROL });
    expect(controlled.events).toEqual(["control"]);
    expect(controlled.actions.handleControl).toHaveBeenCalledWith(CONTROL);

    const dirty = await execute({ kind: "dirty", itemCount: 7 });
    expect(dirty.events).toEqual([
      "dirty:7",
      "mutate:正在编辑 Demo.json；尚未写盘。",
    ]);
  });

  it("覆盖 exchange stale、accepted、unchanged 三态与 save/sync 顺序", async () => {
    const stale = await execute({ kind: "exchange", action: "save", model: MODEL }, "stale");
    expect(stale.events).toEqual([
      "accept:stale",
      "status:文档已在其他界面更新，请先还原或重新打开后再保存。",
    ]);
    expect(stale.actions.save).not.toHaveBeenCalled();

    const accepted = await execute({ kind: "exchange", action: "sync", model: MODEL }, "accepted");
    expect(accepted.events).toEqual([
      "accept:accepted",
      "mutate:default",
      "publish:已接收 Demo.json 的整表草稿。",
    ]);

    const unchanged = await execute({ kind: "exchange", action: "save", model: MODEL });
    expect(unchanged.events).toEqual(["accept:unchanged", "save"]);
    expect(unchanged.actions.didMutate).not.toHaveBeenCalled();
  });

  it("ready、revert 与 cancelPreflight 精确委托各自 Host 动作", async () => {
    const ready = await execute({ kind: "ready" });
    expect(ready.events).toEqual(["model"]);

    const revert = await execute({ kind: "revert" });
    expect(revert.events).toEqual(["revert"]);

    const cancel = await execute({ kind: "cancelPreflight" });
    expect(cancel.events).toEqual([`cancel:${URI}`]);
  });

  it("Preflight 先启动计时、接收表后传递同一 timer，stale 时停止", async () => {
    const accepted = await execute({ kind: "preflight", table: TABLE }, "accepted");
    expect(accepted.events).toEqual([
      "timer",
      "accept:accepted",
      "mutate:已接收 Demo.json 的最新整表草稿。",
      "preflight:timer",
    ]);
    expect(accepted.actions.runPreflight).toHaveBeenCalledWith(
      expect.objectContaining({ elapsedText: expect.any(Function) }),
    );

    const stale = await execute({ kind: "preflight", table: TABLE }, "stale");
    expect(stale.events).toEqual([
      "timer",
      "accept:stale",
      "status:表格 revision 已过期，请先还原或重新打开。",
    ]);
    expect(stale.actions.runPreflight).not.toHaveBeenCalled();
  });

  it("Apply 有现成 plan 时覆盖 unchanged、accepted、stale 并复用动作总 timer", async () => {
    const actionTimer = timer("1.20 s");
    const events: string[] = [];
    const { session } = fakeSession(events, "unchanged", PREFLIGHT);
    const actions = fakeActions(events, actionTimer);

    await ktcExecuteCodegenEditorCommand(session, { kind: "apply", table: TABLE }, actions);

    expect(events).toEqual(["timer", "accept:unchanged", "apply:timer"]);
    expect(actions.apply).toHaveBeenCalledWith(actionTimer);
    expect(actions.runPreflight).not.toHaveBeenCalled();

    const accepted = await execute({ kind: "apply", table: TABLE }, "accepted", PREFLIGHT);
    expect(accepted.events).toEqual([
      "timer",
      "accept:accepted",
      "mutate:已接收 Demo.json 的最新整表草稿。",
      "apply:timer",
    ]);

    const stale = await execute({ kind: "apply", table: TABLE }, "stale", PREFLIGHT);
    expect(stale.events).toEqual([
      "timer",
      "accept:stale",
      "status:表格 revision 已过期，请先还原或重新打开。",
    ]);
    expect(stale.actions.runPreflight).not.toHaveBeenCalled();
    expect(stale.actions.apply).not.toHaveBeenCalled();
  });

  it("Apply 自动预检保留独立计时语义，并覆盖重读 plan 成功与无 plan 停止", async () => {
    const actionTimer = timer("2.40 s");
    const successEvents: string[] = [];
    const successSession = fakeSession(successEvents);
    const successActions = fakeActions(successEvents, actionTimer, {
      runPreflight: vi.fn(async (value?: KtcCodegenOperationTimer) => {
        successEvents.push(value === undefined ? "preflight:own-timer" : "preflight:wrong-timer");
        successSession.raw.preflight = PREFLIGHT;
      }),
    });
    await ktcExecuteCodegenEditorCommand(successSession.session, { kind: "apply" }, successActions);
    expect(successEvents).toEqual(["timer", "preflight:own-timer", "apply:timer"]);
    expect(successActions.startTimer).toHaveBeenCalledTimes(1);
    expect(successActions.runPreflight).toHaveBeenCalledWith();
    expect(successActions.apply).toHaveBeenCalledWith(actionTimer);

    const stopTimer = timer("3.60 s");
    const stopEvents: string[] = [];
    const stopSession = fakeSession(stopEvents);
    const stopActions = fakeActions(stopEvents, stopTimer);
    await ktcExecuteCodegenEditorCommand(stopSession.session, { kind: "apply" }, stopActions);
    expect(stopEvents).toEqual([
      "timer",
      "preflight:default",
      "log:[Codegen][Apply] 自动预检未产生可用计划，将记录未应用报告；耗时 3.60 s。",
      "apply:timer",
    ]);
    expect(stopTimer.elapsedText).toHaveBeenCalledTimes(1);
    expect(stopActions.apply).toHaveBeenCalledWith(stopTimer);
  });
});
