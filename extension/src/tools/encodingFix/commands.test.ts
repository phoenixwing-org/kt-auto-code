import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  showWarningMessage: vi.fn(async () => undefined),
  runFileEncodingWalk: vi.fn(async () => ({
    root: "/workspace",
    targetPolicy: { defaultTarget: "utf8" },
    results: [{
      row: {
        filePath: "/workspace/src/Part.cpp",
        relativePath: "src/Part.cpp",
        detected: "gbk",
        expected: "utf8",
        status: "mismatch",
        suggestedAction: "GBK → UTF-8",
        confidence: "high",
      },
      converted: false,
    }],
    scanned: 1,
    issueFiles: 1,
    convertedFiles: 0,
  })),
}));

vi.mock("vscode", () => ({
  Uri: { file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }) },
  window: { showWarningMessage: host.showWarningMessage },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback: unknown) => fallback) })),
  },
}));

vi.mock("../../../../src/fileEncodingWalk.js", () => ({
  countConvertibleRows: vi.fn(() => ({ total: 1, utf16: 0, actions: { "GBK → UTF-8": 1 } })),
  formatFileEncodingReport: vi.fn(() => "report"),
  runFileEncodingWalk: host.runFileEncodingWalk,
}));

vi.mock("../../worksets.js", () => ({
  ktcResolveWorkspaceFileScope: vi.fn(async () => ({ kind: "workspace", label: "整个工作区" })),
}));

vi.mock("../../ignoreConfig.js", () => ({ resolveWorkspaceIgnorePatterns: vi.fn(() => []) }));
vi.mock("../../workbench/editorMatchHighlight.js", () => ({ ktcClearEditorMatchHighlights: vi.fn() }));

import type { ToolRunContext, ToolUiState } from "../types.js";
import { runEncodingFixAction } from "./commands.js";

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
      postState: (state) => states.push(state),
      log: (line) => logs.push(line),
    },
  };
}

beforeEach(() => {
  host.showWarningMessage.mockClear();
  host.runFileEncodingWalk.mockClear();
});

describe("encoding fix Controller state", () => {
  it("reports a missing workspace without entering the running state", async () => {
    const { ctx, states } = context(undefined);
    await runEncodingFixAction("scan", ctx);
    expect(states).toEqual([{ status: "error", message: "请先打开工作区文件夹。" }]);
  });

  it("ends the running state on conversion cancellation without posting empty result fields", async () => {
    const { ctx, states, logs } = context("/workspace");
    await runEncodingFixAction("convert", ctx);

    expect(states.map(({ status }) => status)).toEqual(["running", "running", "idle"]);
    expect(states.at(-1)).toEqual({ status: "idle", message: "已取消转换。" });
    expect(host.runFileEncodingWalk).toHaveBeenCalledOnce();
    expect(host.showWarningMessage).toHaveBeenCalledOnce();
    expect(logs).toEqual([]);
  });
});
