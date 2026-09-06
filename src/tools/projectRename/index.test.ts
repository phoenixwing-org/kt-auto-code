import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerCommand: vi.fn(),
  registerProvider: vi.fn(() => ({ dispose: vi.fn() })),
  show: vi.fn(),
  runCompanionAction: vi.fn(async () => ({ accepted: true })),
  callbacks: undefined as { onCompanionEvent?: (event: unknown) => void } | undefined,
}));

vi.mock("vscode", () => ({
  commands: { registerCommand: mocks.registerCommand },
  workspace: { registerTextDocumentContentProvider: mocks.registerProvider },
}));

vi.mock("./viewController.js", () => ({
  KtcProjectRenameViewController: class {
    show = mocks.show;
    runCompanionAction = mocks.runCompanionAction;
    constructor(_extensionUri: unknown, _host: unknown, callbacks: typeof mocks.callbacks) {
      mocks.callbacks = callbacks;
    }
    dispose(): void {}
  },
}));

vi.mock("./diffDocumentProvider.js", () => ({
  KTC_PROJECT_RENAME_DIFF_SCHEME: "ktc-project-rename",
  KtcProjectRenameDiffDocumentProvider: class { dispose(): void {} },
}));

vi.mock("../../projectRenameHost.js", () => ({ KtcProjectRenameHost: class {} }));
vi.mock("../../core/renameHistory.js", () => ({ KtcRenameHistoryStore: class {} }));

import type * as vscode from "vscode";
import { getTool, getTools, registerTool } from "../registry.js";
import type { ToolRunContext } from "../types.js";
import {
  KTC_PROJECT_RENAME_OPEN_COMMAND,
  ktcRegisterProjectRenameAnalysis,
  projectRenameCompanionTool,
  setProjectRenamePrimaryCompanionHost,
} from "./index.js";

function context(): vscode.ExtensionContext {
  return {
    extensionUri: { fsPath: "/extension" },
    globalState: {},
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

function runContext(): ToolRunContext {
  return {
    workspaceRoot: "/workspace/project",
    workspaceLabel: "project",
    workspaceFileScopeId: "workspace",
    pluginIgnoreEnabled: false,
    postState: vi.fn(),
    log: vi.fn(),
  };
}

describe("项目改名 Primary companion 接线", () => {
  beforeEach(() => {
    mocks.registerCommand.mockReset();
    mocks.registerCommand.mockImplementation((_name, _handler) => ({ dispose: vi.fn() }));
    mocks.registerProvider.mockClear();
    mocks.show.mockReset();
    mocks.runCompanionAction.mockClear();
    mocks.callbacks = undefined;
    setProjectRenamePrimaryCompanionHost(undefined);
  });

  it("命令先激活统一 toolId，再显示 Editor 并保留传入草稿", async () => {
    const sequence: string[] = [];
    setProjectRenamePrimaryCompanionHost({
      activate: vi.fn(async (toolId) => { sequence.push(`activate:${toolId}`); }),
      onDidChange: vi.fn(),
    });
    mocks.show.mockImplementation((draft) => { sequence.push(`show:${String((draft as { root?: string }).root)}`); });
    ktcRegisterProjectRenameAnalysis(context());
    const registration = mocks.registerCommand.mock.calls.find(([name]) => name === KTC_PROJECT_RENAME_OPEN_COMMAND);
    const draft = { root: "/workspace/carried", sourceName: "Old", targetName: "New" };

    await registration?.[1](draft);

    expect(sequence).toEqual(["activate:projectRename", "show:/workspace/carried"]);
    expect(mocks.show).toHaveBeenCalledWith(draft);
  });

  it("Controller 快照上送 Host，Primary 动作仍由 Controller 二次校验", async () => {
    const onDidChange = vi.fn();
    setProjectRenamePrimaryCompanionHost({ activate: vi.fn(), onDidChange });
    ktcRegisterProjectRenameAnalysis(context());
    const snapshot = { toolId: "projectRename", panelId: "panel-1", sessionId: "session-1", revision: 2 };
    mocks.callbacks?.onCompanionEvent?.({ reason: "state", snapshot });
    expect(onDidChange).toHaveBeenCalledWith(snapshot);

    const token = {
      panelId: "panel-1",
      toolId: "projectRename" as const,
      sessionId: "session-1",
      revision: 2,
      actionId: "reveal",
    };
    await projectRenameCompanionTool.runEditorCompanionAction?.(token, runContext());
    expect(mocks.runCompanionAction).toHaveBeenCalledWith(token);
  });

  it("项目改名 hidden descriptor 在 Registry 中唯一可寻址且不重复注册打开命令", () => {
    const extensionContext = context();

    registerTool(projectRenameCompanionTool);
    ktcRegisterProjectRenameAnalysis(extensionContext);
    projectRenameCompanionTool.registerCommands(extensionContext);

    expect(getTool("projectRename")).toBe(projectRenameCompanionTool);
    expect(getTools().filter((tool) => tool.id === "projectRename")).toEqual([projectRenameCompanionTool]);
    expect(projectRenameCompanionTool.ribbonVisible).toBe(false);
    expect(projectRenameCompanionTool.getPanelModel().summary).toMatchObject({
      id: "projectRename",
      ribbonVisible: false,
    });
    expect(mocks.registerCommand.mock.calls.filter(
      ([command]) => command === KTC_PROJECT_RENAME_OPEN_COMMAND,
    )).toHaveLength(1);
  });

  it("Extension bridge 解除后，Controller 的迟到快照不再触达 Primary Provider", () => {
    const onDidChange = vi.fn();
    setProjectRenamePrimaryCompanionHost({ activate: vi.fn(), onDidChange });
    ktcRegisterProjectRenameAnalysis(context());

    mocks.callbacks?.onCompanionEvent?.({
      reason: "state",
      snapshot: { toolId: "projectRename", revision: 1 },
    });
    setProjectRenamePrimaryCompanionHost(undefined);
    mocks.callbacks?.onCompanionEvent?.({
      reason: "state",
      snapshot: { toolId: "projectRename", revision: 2 },
    });

    expect(onDidChange).toHaveBeenCalledTimes(1);
    expect(onDidChange).toHaveBeenCalledWith({ toolId: "projectRename", revision: 1 });
  });
});
