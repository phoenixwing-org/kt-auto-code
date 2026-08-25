import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerCommand: vi.fn(),
  showPackageIncludes: vi.fn(),
  showErrorMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
  commands: {
    registerCommand: mocks.registerCommand,
    executeCommand: vi.fn(),
  },
  window: {
    showErrorMessage: mocks.showErrorMessage,
  },
}));

vi.mock("./packageIncludeViewController.js", () => ({
  KtcPackageIncludeViewController: class {
    show = mocks.showPackageIncludes;
    dispose(): void {}
  },
}));

import type * as vscode from "vscode";
import type { ToolRunContext } from "../types.js";
import {
  codeAssistantTool,
  registerCodeAssistantSupport,
  setCodeAssistantRunContextFactory,
} from "./index.js";

function runContext(workspaceRoot: string): ToolRunContext {
  return {
    workspaceRoot,
    workspaceLabel: "selected",
    workspaceFileScopeId: "workspace",
    pluginIgnoreEnabled: true,
    postState: vi.fn(),
    log: vi.fn(),
  };
}

describe("代码辅助命令上下文", () => {
  beforeEach(() => {
    mocks.registerCommand.mockReset();
    mocks.showPackageIncludes.mockReset();
    mocks.showErrorMessage.mockReset();
    mocks.registerCommand.mockImplementation((_name, _handler) => ({ dispose: vi.fn() }));
  });

  it("从 Primary 打开 Package View 时传入当前选择的工作目录", async () => {
    const context = { subscriptions: [], workspaceState: { get: vi.fn(), update: vi.fn() } } as unknown as vscode.ExtensionContext;
    setCodeAssistantRunContextFactory(() => runContext("/workspace/selected-project"));
    registerCodeAssistantSupport(context);
    codeAssistantTool.registerCommands(context);

    const registration = mocks.registerCommand.mock.calls.find(([name]) => name === "ktAutoCode.codeAssistant.packageIncludes");
    expect(registration).toBeDefined();
    await registration?.[1]();

    expect(mocks.showPackageIncludes).toHaveBeenCalledWith("/workspace/selected-project");
  });
});
