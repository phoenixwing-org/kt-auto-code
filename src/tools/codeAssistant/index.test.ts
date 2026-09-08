import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerCommand: vi.fn(),
  showPackageIncludes: vi.fn(),
  showAutoBuild: vi.fn(),
  runPackageIncludesPrimaryAction: vi.fn(async () => true),
  runAutoBuildPrimaryAction: vi.fn(async () => true),
  showErrorMessage: vi.fn(),
  packageCompanionPort: undefined as { onDidChange(snapshot: unknown): void } | undefined,
  autoBuildCompanionPort: undefined as { onDidChange(snapshot: unknown): void } | undefined,
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
    runPrimaryCompanionAction = mocks.runPackageIncludesPrimaryAction;
    constructor(
      _extensionUri: unknown,
      _workspaceState: unknown,
      _log: unknown,
      companion: typeof mocks.packageCompanionPort,
    ) {
      mocks.packageCompanionPort = companion;
    }
    dispose(): void {}
  },
}));

vi.mock("./autoBuildViewController.js", () => ({
  KtcAutoBuildViewController: class {
    show = mocks.showAutoBuild;
    runPrimaryCompanionAction = mocks.runAutoBuildPrimaryAction;
    constructor(_extensionUri: unknown, _workspaceState: unknown, companion: typeof mocks.autoBuildCompanionPort) {
      mocks.autoBuildCompanionPort = companion;
    }
    dispose(): void {}
  },
}));

import type * as vscode from "vscode";
import {
  clearRegisteredTools,
  getNavigationDescriptor,
  getTool,
  getTools,
  registerNavigationDescriptor,
  registerTool,
} from "../registry.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import type { ToolRunContext } from "../types.js";
import {
  autoBuildCompanionTool,
  codeAssistantNavigationDescriptor,
  packageIncludesCompanionTool,
  registerCodeAssistantSupport,
  setCodeAssistantPrimaryCompanionHost,
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
    clearRegisteredTools();
    setCodeAssistantPrimaryCompanionHost(undefined);
    mocks.registerCommand.mockReset();
    mocks.showPackageIncludes.mockReset();
    mocks.showAutoBuild.mockReset();
    mocks.runAutoBuildPrimaryAction.mockClear();
    mocks.runPackageIncludesPrimaryAction.mockClear();
    mocks.showErrorMessage.mockReset();
    mocks.packageCompanionPort = undefined;
    mocks.autoBuildCompanionPort = undefined;
    mocks.registerCommand.mockImplementation((_name, _handler) => ({ dispose: vi.fn() }));
  });

  it("从 Primary 打开头文件引用修正 View 时传入当前选择的工作目录", async () => {
    const context = { subscriptions: [], workspaceState: { get: vi.fn(), update: vi.fn() } } as unknown as vscode.ExtensionContext;
    const sequence: string[] = [];
    setCodeAssistantRunContextFactory(() => runContext("/workspace/selected-project"));
    setCodeAssistantPrimaryCompanionHost({
      activate: vi.fn(async (toolId) => { sequence.push(`activate:${toolId}`); }),
      onDidChange: vi.fn(),
    });
    mocks.showPackageIncludes.mockImplementation(async () => { sequence.push("show:editor"); });
    registerCodeAssistantSupport(context);

    const registration = mocks.registerCommand.mock.calls.find(([name]) => name === "ktAutoCode.codeAssistant.packageIncludes");
    expect(registration).toBeDefined();
    await registration?.[1]();

    expect(sequence).toEqual(["activate:packageIncludes", "show:editor"]);
    expect(mocks.showPackageIncludes).toHaveBeenCalledWith("/workspace/selected-project", {
      ignoreEnabled: true,
      builtInIgnoreEnabled: true,
      gitIgnoreEnabled: true,
      customIgnoreEnabled: true,
    });
  });

  it("打开自动编译时先激活同一个 Primary toolId，再把焦点交给 Editor", async () => {
    const sequence: string[] = [];
    const context = { subscriptions: [], workspaceState: { get: vi.fn(), update: vi.fn() } } as unknown as vscode.ExtensionContext;
    setCodeAssistantRunContextFactory(() => runContext("/workspace/selected-project"));
    setCodeAssistantPrimaryCompanionHost({
      activate: vi.fn(async (toolId) => { sequence.push(`activate:${toolId}`); }),
      onDidChange: vi.fn(),
    });
    mocks.showAutoBuild.mockImplementation(async () => { sequence.push("show:editor"); });
    registerCodeAssistantSupport(context);

    const registration = mocks.registerCommand.mock.calls.find(([name]) => name === "ktAutoCode.codeAssistant.autoBuild");
    await registration?.[1]();

    expect(sequence).toEqual(["activate:autoBuild", "show:editor"]);
    expect(mocks.showAutoBuild).toHaveBeenCalledWith("/workspace/selected-project");
  });

  it("自动编译 Primary 动作只委托给 Controller 的 session 门禁", async () => {
    const context = { subscriptions: [], workspaceState: { get: vi.fn(), update: vi.fn() } } as unknown as vscode.ExtensionContext;
    registerCodeAssistantSupport(context);
    const ctx = runContext("/workspace/selected-project");
    const token = {
      panelId: "auto-build-1",
      toolId: "autoBuild" as const,
      sessionId: "auto-build-1",
      revision: 3,
      actionId: "openOutput",
    };

    await autoBuildCompanionTool.runEditorCompanionAction?.(token, ctx);

    expect(mocks.runAutoBuildPrimaryAction).toHaveBeenCalledWith(token);
  });

  it("头文件引用修正 Primary 动作只委托给 Controller 的 session 门禁", async () => {
    const context = { subscriptions: [], workspaceState: { get: vi.fn(), update: vi.fn() } } as unknown as vscode.ExtensionContext;
    registerCodeAssistantSupport(context);
    const ctx = runContext("/workspace/selected-project");
    const token = {
      panelId: "package-includes-1",
      toolId: "packageIncludes" as const,
      sessionId: "package-includes-1",
      revision: 3,
      actionId: "reveal",
    };

    await packageIncludesCompanionTool.runEditorCompanionAction?.(token, ctx);

    expect(mocks.runPackageIncludesPrimaryAction).toHaveBeenCalledWith(token);
  });

  it("自动编译 hidden descriptor 在 Registry 中唯一可寻址且不重复注册打开命令", () => {
    const context = {
      subscriptions: [],
      workspaceState: { get: vi.fn(), update: vi.fn() },
    } as unknown as vscode.ExtensionContext;

    registerNavigationDescriptor(codeAssistantNavigationDescriptor);
    registerTool(packageIncludesCompanionTool);
    registerTool(autoBuildCompanionTool);
    registerCodeAssistantSupport(context);
    packageIncludesCompanionTool.registerCommands(context);
    autoBuildCompanionTool.registerCommands(context);

    expect(getTool("codeAssistant")).toBeUndefined();
    expect(getTools().map(({ id }) => id)).not.toContain("codeAssistant");
    expect(getNavigationDescriptor("codeAssistant")).toEqual(codeAssistantNavigationDescriptor);
    for (const lifecycleMember of ["runActions", "handleMessage", "runAction", "onDidShow"]) {
      expect(codeAssistantNavigationDescriptor).not.toHaveProperty(lifecycleMember);
    }
    expect(getTool("packageIncludes")).toBe(packageIncludesCompanionTool);
    expect(getTool("autoBuild")).toBe(autoBuildCompanionTool);
    expect(getTools().filter((tool) => tool.id === "autoBuild")).toEqual([autoBuildCompanionTool]);
    expect(autoBuildCompanionTool.ribbonVisible).toBe(false);
    expect(autoBuildCompanionTool.title).toBe(ktcRequireToolRegistration("autoBuild").title);
    expect(autoBuildCompanionTool.icon).toBe(ktcRequireToolRegistration("autoBuild").icon);
    expect(autoBuildCompanionTool.getPanelModel().summary).toMatchObject({
      id: "autoBuild",
      title: "编译工具",
      shortTitle: "编译",
      icon: "build",
      ribbonVisible: false,
    });
    expect(mocks.registerCommand.mock.calls.filter(
      ([command]) => command === "ktAutoCode.codeAssistant.autoBuild",
    )).toHaveLength(1);
  });

  it("Extension bridge 解除后，Controller 的迟到快照不再触达 Primary Provider", () => {
    const onDidChange = vi.fn();
    const context = {
      subscriptions: [],
      workspaceState: { get: vi.fn(), update: vi.fn() },
    } as unknown as vscode.ExtensionContext;
    setCodeAssistantPrimaryCompanionHost({ activate: vi.fn(), onDidChange });
    registerCodeAssistantSupport(context);

    mocks.autoBuildCompanionPort?.onDidChange({ toolId: "autoBuild", revision: 1 });
    setCodeAssistantPrimaryCompanionHost(undefined);
    mocks.autoBuildCompanionPort?.onDidChange({ toolId: "autoBuild", revision: 2 });

    expect(onDidChange).toHaveBeenCalledTimes(1);
    expect(onDidChange).toHaveBeenCalledWith({ toolId: "autoBuild", revision: 1 });
  });
});
