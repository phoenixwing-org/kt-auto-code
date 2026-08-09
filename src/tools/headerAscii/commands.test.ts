import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  showWarningMessage: vi.fn(async () => undefined),
  runWorkspaceEncodingScan: vi.fn(),
}));

vi.mock("vscode", () => ({
  Uri: { file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }) },
  window: { showWarningMessage: host.showWarningMessage },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback: unknown) => fallback) })),
  },
}));

vi.mock("../../core/sourceEncodingWalk.js", () => ({
  formatWorkspaceReport: vi.fn(() => "report"),
  runWorkspaceEncodingScan: host.runWorkspaceEncodingScan,
}));

vi.mock("../../worksets.js", () => ({
  ktcResolveWorkspaceFileScope: vi.fn(async () => ({ kind: "workspace", label: "整个工作区" })),
}));

vi.mock("../../ignoreConfig.js", () => ({ resolveWorkspaceIgnorePatterns: vi.fn(() => []) }));
vi.mock("../../workbench/editorMatchHighlight.js", () => ({ ktcHighlightHeaderIssues: vi.fn() }));

import type { ToolRunContext, ToolUiState } from "../types.js";
import { runHeaderAsciiAction } from "./commands.js";

function context(workspaceRoot: string | undefined): { ctx: ToolRunContext; states: ToolUiState[]; logs: string[] } {
  const states: ToolUiState[] = [];
  const logs: string[] = [];
  return {
    states,
    logs,
    ctx: {
      workspaceRoot,
      workspaceLabel: workspaceRoot ? "workspace" : "未打开工作区",
      workspaceFileScopeId: "",
      pluginIgnoreEnabled: true,
      postState: (state) => states.push(state),
      log: (line) => logs.push(line),
    },
  };
}

beforeEach(() => {
  host.showWarningMessage.mockClear();
  host.runWorkspaceEncodingScan.mockClear();
});

describe("header ASCII Controller state", () => {
  it("reports a missing workspace without entering the running state", async () => {
    const { ctx, states } = context(undefined);
    await runHeaderAsciiAction("scan", ctx);
    expect(states).toEqual([{ status: "error", message: expect.stringContaining("请先打开") }]);
  });

  it("ends the running state on modal cancellation without scanning or clearing result fields", async () => {
    const { ctx, states, logs } = context("/workspace");
    await runHeaderAsciiAction("fix", ctx);

    expect(states.map(({ status }) => status)).toEqual(["running", "running", "idle"]);
    expect(states.at(-1)).toEqual({ status: "idle", message: "已取消修复。" });
    expect(host.showWarningMessage).toHaveBeenCalledOnce();
    expect(host.runWorkspaceEncodingScan).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });
});
