import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const vscodeHost = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
  openExternal: vi.fn<(uri: unknown) => Promise<boolean>>(async () => true),
  configurationValues: new Map<string, unknown>(),
  outputLines: [] as string[],
}));

vi.mock("vscode", () => {
  class Uri {
    static file(fsPath: string) { return new Uri(fsPath); }
    static parse(value: string) { return new Uri(value); }
    static joinPath(base: Uri, ...segments: string[]) {
      return new Uri([base.fsPath, ...segments].join("/").replace(/\/+/g, "/"));
    }

    readonly path: string;

    constructor(readonly fsPath: string) {
      this.path = fsPath;
    }

    with(change: { path?: string }) {
      return new Uri(change.path ?? this.path);
    }

    toString() { return `file://${this.fsPath}`; }
  }

  return {
    ConfigurationTarget: { Global: "global", Workspace: "workspace", WorkspaceFolder: "workspaceFolder" },
    Uri,
    commands: {
      executeCommand: vscodeHost.executeCommand,
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    extensions: { all: [] },
    env: { openExternal: vscodeHost.openExternal },
    workspace: {
      workspaceFolders: undefined,
      textDocuments: [],
      getConfiguration: vi.fn((section: string) => ({
        get: vi.fn((key: string, fallback: unknown) => (
          vscodeHost.configurationValues.has(`${section}.${key}`)
            ? vscodeHost.configurationValues.get(`${section}.${key}`)
            : fallback
        )),
        update: vi.fn(async (key: string, value: unknown) => {
          vscodeHost.configurationValues.set(`${section}.${key}`, value);
        }),
      })),
      fs: {},
    },
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn((line: string) => vscodeHost.outputLines.push(line)),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
  };
});

import * as vscode from "vscode";
import type {
  KtTool,
  KtcAssociatedRulePickerState,
  KtcWorkingContext,
  ToolRunContext,
  ToolUiState,
  WebviewInboundMessage,
  WebviewOutboundMessage,
} from "../tools/types.js";
import type { KtcEditorPrimaryCompanionSnapshot } from "../core/editorPrimaryCompanionContracts.js";
import {
  ktcIgnoreController,
  type KtcIgnoreControllerResult,
} from "../ignoreController.js";
import { registerTool } from "../tools/registry.js";
import { encodingFixTool } from "../tools/encodingFix/index.js";
import { reorderMembersTool } from "../tools/reorderMembers/index.js";
import {
  SidebarViewProvider,
  ktcRunSignalContractError,
  ktcWelcomeExtensionSummaries,
} from "./sidebarViewProvider.js";
import type { KtcEditorPrimaryCompanionState } from "./editorPrimaryCompanionModel.js";

const TEST_TOOL_ID = "transientPickerTest";
const SECOND_TEST_TOOL_ID = "transientPickerSecondTest";
const picker: KtcAssociatedRulePickerState = {
  title: "选择关联规则",
  candidates: [],
};

let nextState: ToolUiState = {
  status: "idle",
  message: "请选择要添加的关联规则。",
  associatedRulePicker: picker,
};
const testToolDidShow = vi.fn();

const testTool: KtTool = {
  id: TEST_TOOL_ID,
  title: "Transient picker test",
  description: "Host transient state boundary",
  runActions: ["open", "picker", "complete"],
  registerCommands() {},
  getPanelModel() {
    return {
      summary: {
        id: TEST_TOOL_ID,
        title: this.title,
        description: this.description,
      },
    };
  },
  onDidShow: testToolDidShow,
  async handleMessage(_message: WebviewInboundMessage, ctx: ToolRunContext) {
    ctx.postState(nextState);
  },
  async runAction(_action: string, ctx: ToolRunContext) {
    ctx.postState(nextState);
  },
};

registerTool(testTool);
registerTool(encodingFixTool);
registerTool(reorderMembersTool);
registerTool({
  ...testTool,
  id: "codeAssistant",
  title: "代码辅助",
  getPanelModel() {
    return { summary: { id: "codeAssistant", title: this.title, description: this.description } };
  },
});
const runEditorCompanionAction = vi.fn(async () => undefined);
registerTool({
  ...testTool,
  id: "autoBuild",
  title: "自动编译",
  ribbonVisible: false,
  getPanelModel() {
    return {
      summary: {
        id: "autoBuild",
        title: this.title,
        description: this.description,
        ribbonVisible: false,
      },
    };
  },
  runEditorCompanionAction,
});
const runProjectRenameCompanionAction = vi.fn(async () => undefined);
registerTool({
  ...testTool,
  id: "projectRename",
  title: "项目改名",
  ribbonVisible: false,
  getPanelModel() {
    return {
      summary: {
        id: "projectRename",
        title: this.title,
        description: this.description,
        ribbonVisible: false,
      },
    };
  },
  runEditorCompanionAction: runProjectRenameCompanionAction,
});
registerTool({
  ...testTool,
  id: SECOND_TEST_TOOL_ID,
  title: "Transient picker second test",
  getPanelModel() {
    return {
      summary: {
        id: SECOND_TEST_TOOL_ID,
        title: this.title,
        description: this.description,
      },
    };
  },
});

interface FakeWebviewView extends vscode.WebviewView {
  readonly messages: WebviewOutboundMessage[];
}

interface ProviderInternals {
  moduleView?: vscode.WebviewView;
  activeToolId: string;
  codeAssistantFeatureId?: string;
  directoryVisible: boolean;
  openToolIds: string[];
  toolStates: Map<string, ToolUiState>;
  editorCompanionState: KtcEditorPrimaryCompanionState;
  editorCompanionSnapshots: Map<string, KtcEditorPrimaryCompanionSnapshot>;
  retiredEditorCompanionSessions: Map<"autoBuild" | "projectRename", string[]>;
  ignoreContextRoot?: string;
  onMessage(message: WebviewInboundMessage, source: vscode.WebviewView): Promise<void>;
  sendInit(target: vscode.WebviewView): Promise<void>;
  setToolState(toolId: string, state: ToolUiState, transientTarget?: vscode.WebviewView): void;
  getWorkingContext(): KtcWorkingContext;
  postWorkingContext(): void;
  updateEditorCompanion(snapshot: KtcEditorPrimaryCompanionSnapshot): Promise<void>;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function workingContext(resolvedDirectory: string): KtcWorkingContext {
  return {
    selectedDirectory: resolvedDirectory,
    resolvedDirectory,
    label: resolvedDirectory.split("/").at(-1) ?? resolvedDirectory,
    pluginIgnoreEnabled: false,
    builtInIgnoreEnabled: true,
    gitIgnoreEnabled: true,
    customIgnoreEnabled: false,
    gitIgnoreExists: true,
  };
}

function memory(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get<T>(key: string, fallback?: T): T | undefined {
      return values.has(key) ? values.get(key) as T : fallback;
    },
    async update(key: string, value: unknown) {
      if (value === undefined) values.delete(key);
      else values.set(key, value);
    },
  } as vscode.Memento;
}

function extensionUri(): vscode.Uri {
  return vscode.Uri.file("/extension");
}

function webviewView(viewType: string): FakeWebviewView {
  const messages: WebviewOutboundMessage[] = [];
  return {
    viewType,
    messages,
    visible: true,
    title: "",
    description: undefined,
    badge: undefined,
    webview: {
      cspSource: "test-webview",
      options: {},
      html: "",
      asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
      postMessage: vi.fn((message: WebviewOutboundMessage) => {
        messages.push(message);
        return Promise.resolve(true);
      }),
    },
    show: vi.fn(),
    onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as FakeWebviewView;
}

function createProvider(options?: { globalState?: vscode.Memento }): {
  provider: SidebarViewProvider;
  internals: ProviderInternals;
  module: FakeWebviewView;
  globalState: vscode.Memento;
} {
  const globalState = options?.globalState ?? memory();
  const provider = new SidebarViewProvider(extensionUri(), globalState, memory());
  const internals = provider as unknown as ProviderInternals;
  const module = webviewView(SidebarViewProvider.moduleViewType);
  internals.moduleView = module;
  return { provider, internals, module, globalState };
}

function stateMessages(view: FakeWebviewView): Extract<WebviewOutboundMessage, { type: "state" }>[] {
  return view.messages.filter(
    (message): message is Extract<WebviewOutboundMessage, { type: "state" }> => message.type === "state",
  );
}

function companionSnapshot(
  toolId: "autoBuild" | "projectRename",
  panelId: string,
  overrides: Partial<KtcEditorPrimaryCompanionSnapshot> = {},
): KtcEditorPrimaryCompanionSnapshot {
  return {
    panelId,
    toolId,
    sessionId: `${panelId}-session`,
    revision: 0,
    lifecycle: "visible",
    title: toolId === "autoBuild" ? "自动编译" : "项目改名",
    status: "idle",
    message: "已连接",
    ready: true,
    summary: [],
    actions: [{ id: "reveal", label: "显示", enabled: true }],
    ...overrides,
  };
}

function setInstalledExtensions(...extensions: readonly unknown[]): void {
  const installed = vscode.extensions.all as unknown as unknown[];
  installed.splice(0, installed.length, ...extensions);
}

describe("SidebarViewProvider transient tool state", () => {
  beforeEach(() => {
    setInstalledExtensions();
    vscodeHost.executeCommand.mockClear();
    vscodeHost.openExternal.mockClear();
    vscodeHost.configurationValues.clear();
    vscodeHost.outputLines.length = 0;
    runEditorCompanionAction.mockClear();
    runProjectRenameCompanionAction.mockClear();
    testToolDidShow.mockClear();
    nextState = {
      status: "idle",
      message: "请选择要添加的关联规则。",
      associatedRulePicker: picker,
    };
  });

  afterEach(() => {
    setInstalledExtensions();
    vi.restoreAllMocks();
  });

  it("欢迎页固定列出 Code/CAD 的安装状态与版本", () => {
    expect(ktcWelcomeExtensionSummaries([
      { id: "KUNTAI.KT-AUTO-CODE", packageJSON: { version: " 0.6.1 " } },
      { id: "another.extension", packageJSON: { version: "9.0.0" } },
    ])).toEqual([
      {
        id: "kuntai.kt-auto-code",
        title: "KT Auto Code",
        moduleId: "code",
        installed: true,
        version: "0.6.1",
      },
      {
        id: "kuntai.kt-auto-cad",
        title: "KT Auto CAD",
        moduleId: "cad",
        installed: false,
      },
    ]);
  });

  it("Toolbar Strip 箭头把明确的展开方式保存到用户设置", async () => {
    const { internals, module } = createProvider();

    await internals.onMessage({ type: "setRibbonStyle", style: "compact" }, module);
    expect(vscodeHost.configurationValues.get("ktAutoCode.sidebar.toolPickerStyle")).toBe("compact");

    await internals.onMessage({ type: "setRibbonStyle", style: "ribbon" }, module);
    expect(vscodeHost.configurationValues.get("ktAutoCode.sidebar.toolPickerStyle")).toBe("ribbon");

    await internals.onMessage(
      { type: "setRibbonStyle", style: "invalid" } as unknown as WebviewInboundMessage,
      module,
    );
    expect(vscodeHost.configurationValues.get("ktAutoCode.sidebar.toolPickerStyle")).toBe("ribbon");
  });

  it("读取 Toolbar 展示设置时把未知值收敛为展开态", async () => {
    vscodeHost.configurationValues.set("ktAutoCode.sidebar.toolPickerStyle", "future-mode");
    const { internals, module } = createProvider();

    await internals.sendInit(module);

    expect(module.messages.find((message) => message.type === "init")).toMatchObject({
      type: "init",
      sidebarStyle: "ribbon",
    });
  });

  it("目录行默认显示并通过 init 交付给 Webview", async () => {
    const { internals, module } = createProvider();

    await internals.sendInit(module);

    expect(module.messages.find((message) => message.type === "init")).toMatchObject({
      type: "init",
      directoryVisible: true,
    });
  });

  it("初始化时恢复用户隐藏选择并同步原生 Header Context", async () => {
    const globalState = memory();
    await globalState.update("ktAutoCode.sidebar.directoryVisible.v1", false);
    const { provider, internals, module } = createProvider({ globalState });
    vscodeHost.executeCommand.mockClear();

    await provider.initializeModuleState();
    await internals.sendInit(module);

    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "ktAutoCode.modulePanel.directoryVisible",
      false,
    );
    expect(module.messages.find((message) => message.type === "init")).toMatchObject({
      type: "init",
      directoryVisible: false,
    });
  });

  it("切换目录行只持久化展示状态，不改变目录、当前工具、MRU 或任务状态", async () => {
    const { provider, internals, module, globalState } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    internals.setToolState(TEST_TOOL_ID, { status: "done", message: "任务结果保持" });
    const workingContextBefore = internals.getWorkingContext();
    const activeToolBefore = internals.activeToolId;
    const openToolsBefore = [...internals.openToolIds];
    const taskStateBefore = internals.toolStates.get(TEST_TOOL_ID);
    module.messages.length = 0;
    vscodeHost.executeCommand.mockClear();

    await provider.setDirectoryVisible(false);

    expect(globalState.get("ktAutoCode.sidebar.directoryVisible.v1")).toBe(false);
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "ktAutoCode.modulePanel.directoryVisible",
      false,
    );
    expect(module.messages).toEqual([{ type: "directoryVisibility", visible: false }]);
    expect(internals.getWorkingContext()).toEqual(workingContextBefore);
    expect(internals.activeToolId).toBe(activeToolBefore);
    expect(internals.openToolIds).toEqual(openToolsBefore);
    expect(internals.toolStates.get(TEST_TOOL_ID)).toBe(taskStateBefore);

    await provider.setDirectoryVisible(true);
    expect(globalState.get("ktAutoCode.sidebar.directoryVisible.v1")).toBe(true);
    expect(module.messages.at(-1)).toEqual({ type: "directoryVisibility", visible: true });
    expect(internals.activeToolId).toBe(activeToolBefore);
    expect(internals.openToolIds).toEqual(openToolsBefore);
    expect(internals.toolStates.get(TEST_TOOL_ID)).toBe(taskStateBefore);
  });

  it("hidden companion 可由 Registry 寻址但不会进入 Ribbon 或自定义布局", async () => {
    const { internals, module } = createProvider();

    await internals.sendInit(module);

    const init = module.messages.find((message) => message.type === "init");
    expect(init?.type).toBe("init");
    if (!init || init.type !== "init") throw new Error("缺少 init 消息");
    const ids = init.tools.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(init.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "autoBuild", title: "自动编译", ribbonVisible: false }),
      expect.objectContaining({ id: "projectRename", title: "项目改名", ribbonVisible: false }),
    ]));
    expect(init.ribbonLayout.toolOrder).not.toContain("autoBuild");
    expect(init.ribbonLayout.toolOrder).not.toContain("projectRename");
    expect(init.ribbonLayout.pinnedToolIds).not.toContain("autoBuild");
    expect(init.ribbonLayout.pinnedToolIds).not.toContain("projectRename");
  });

  it("Ignore 消息严格串行执行，并在每次真实执行期间发布 running 状态", async () => {
    const { internals, module } = createProvider();
    vi.spyOn(internals, "getWorkingContext").mockReturnValue(workingContext("/workspace/project-a"));
    const first = deferred<KtcIgnoreControllerResult>();
    const second = deferred<KtcIgnoreControllerResult>();
    let activeOperations = 0;
    let maxActiveOperations = 0;
    const handle = vi.spyOn(ktcIgnoreController, "handle")
      .mockImplementationOnce(async () => {
        activeOperations += 1;
        maxActiveOperations = Math.max(maxActiveOperations, activeOperations);
        const result = await first.promise;
        activeOperations -= 1;
        return result;
      })
      .mockImplementationOnce(async () => {
        activeOperations += 1;
        maxActiveOperations = Math.max(maxActiveOperations, activeOperations);
        const result = await second.promise;
        activeOperations -= 1;
        return result;
      });

    const firstOperation = internals.onMessage({ type: "openIgnoreTarget", target: "git" }, module);
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(1));
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "ignoreSettings",
      state: { status: "running", message: "正在更新 Ignore…" },
    });

    const secondOperation = internals.onMessage({ type: "openIgnoreTarget", target: "phoenix" }, module);
    await Promise.resolve();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(activeOperations).toBe(1);

    first.resolve({ message: "第一项完成" });
    await firstOperation;
    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(2));
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "ignoreSettings",
      state: { status: "running", message: "正在更新 Ignore…" },
    });
    expect(maxActiveOperations).toBe(1);

    second.resolve({ message: "第二项完成" });
    await secondOperation;
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "ignoreSettings",
      state: { status: "done", message: "第二项完成" },
    });
    expect(maxActiveOperations).toBe(1);
    expect(handle.mock.calls.map((call) => call[1])).toEqual([
      "/workspace/project-a",
      "/workspace/project-a",
    ]);
  });

  it("切换 resolved 工作目录会清除旧 Ignore 状态，并丢弃迟到的旧目录结果", async () => {
    const { internals, module } = createProvider();
    let currentRoot = "/workspace/project-a";
    vi.spyOn(internals, "getWorkingContext").mockImplementation(() => workingContext(currentRoot));
    vi.spyOn(ktcIgnoreController, "snapshot").mockReturnValue(undefined);
    const invalidate = vi.spyOn(ktcIgnoreController, "invalidateRecommendations");
    const pending = deferred<KtcIgnoreControllerResult>();
    const handle = vi.spyOn(ktcIgnoreController, "handle").mockImplementation(async () => pending.promise);
    internals.ignoreContextRoot = currentRoot;
    internals.setToolState("ignoreSettings", {
      status: "done",
      message: "旧目录分析完成",
      ignoreRecommendations: {
        workspace: "project-a",
        truncated: false,
        recommendations: [],
      },
      ignoreSelectedGroupIds: ["old-group"],
    });
    module.messages.length = 0;

    const oldOperation = internals.onMessage({ type: "analyzeIgnore" }, module);
    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce());
    expect(stateMessages(module).at(-1)?.state.status).toBe("running");

    currentRoot = "/workspace/project-b";
    internals.postWorkingContext();

    const stateAfterSwitch = internals.toolStates.get("ignoreSettings");
    expect(invalidate).toHaveBeenCalledOnce();
    expect(stateAfterSwitch).toEqual({
      status: "idle",
      message: "目录已切换，请重新分析 Ignore 建议。",
      ignoreRecommendations: undefined,
      ignoreSelectedGroupIds: [],
    });
    const stateMessageCountAfterSwitch = stateMessages(module).length;

    pending.resolve({
      message: "旧目录迟到的分析结果",
      recommendations: {
        workspace: "project-a",
        truncated: false,
        recommendations: [],
      },
    });
    await oldOperation;

    expect(internals.toolStates.get("ignoreSettings")).toEqual(stateAfterSwitch);
    expect(stateMessages(module)).toHaveLength(stateMessageCountAfterSwitch);
    expect(JSON.stringify(module.messages)).not.toContain("旧目录迟到的分析结果");
  });

  it("代码辅助 Navigator 布局与折叠状态保存到用户级 globalState 并在 init 时回传", async () => {
    const { internals, module, globalState } = createProvider();
    const state = {
      navigatorMode: "grid" as const,
      treeExpanded: false,
      cppOrganizeExpanded: false,
      fileToolsExpanded: true,
      caaExpanded: false,
      reorderActionsExpanded: false,
      reorderResultsExpanded: true,
    };

    await internals.onMessage({ type: "setCodeAssistantTreeUiState", state }, module);
    expect(globalState.get("ktAutoCode.codeAssistant.treeUi.v1")).toEqual(state);

    await internals.sendInit(module);
    expect(module.messages.find((message) => message.type === "init")).toMatchObject({
      type: "init",
      codeAssistantTreeUiState: state,
    });
  });

  it("旧版 Tree 偏好没有布局字段时迁移为大纲模式", async () => {
    const globalState = memory();
    await globalState.update("ktAutoCode.codeAssistant.treeUi.v1", {
      treeExpanded: false,
      cppOrganizeExpanded: true,
      fileToolsExpanded: false,
      caaExpanded: true,
    });
    const { internals, module } = createProvider({ globalState });

    await internals.sendInit(module);

    expect(module.messages.find((message) => message.type === "init")).toMatchObject({
      type: "init",
      codeAssistantTreeUiState: {
        navigatorMode: "outline",
        treeExpanded: false,
        cppOrganizeExpanded: true,
        fileToolsExpanded: false,
        caaExpanded: true,
      },
    });
  });

  it("选择真实叶子直接进入当前 Block 与 MRU，且不折叠功能目录", async () => {
    const { internals, module, globalState } = createProvider();

    for (const toolId of ["encodingFix", "reorderMembers", "autoBuild"]) {
      await internals.onMessage({ type: "selectTool", toolId }, module);
      expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
        type: "init",
        activeToolId: toolId,
        codeAssistantFeature: undefined,
        codeAssistantTreeUiState: { treeExpanded: true },
      });
    }

    expect(globalState.get("ktAutoCode.codeAssistant.treeUi.v1")).toBeUndefined();
    expect(internals.openToolIds).toEqual(["encodingFix", "reorderMembers", "autoBuild"]);
  });

  it("Ribbon、menu 与 command 入口共享同一 leaf 激活状态", async () => {
    const resultingStates: Array<{ activeToolId: string; openToolIds: string[] }> = [];

    for (const source of ["ribbon", "menu", "command"] as const) {
      const { provider, internals, module } = createProvider();
      if (source === "command") await provider.showTool("encodingFix");
      else await internals.onMessage({ type: "selectTool", toolId: "encodingFix", source }, module);
      resultingStates.push({
        activeToolId: internals.activeToolId,
        openToolIds: [...internals.openToolIds],
      });
    }

    expect(resultingStates).toEqual([
      { activeToolId: "encodingFix", openToolIds: ["encodingFix"] },
      { activeToolId: "encodingFix", openToolIds: ["encodingFix"] },
      { activeToolId: "encodingFix", openToolIds: ["encodingFix"] },
    ]);
  });

  it("独立编辑器 View 叶子不会自动收起功能目录", async () => {
    const { internals, module } = createProvider();

    await internals.onMessage({ type: "openCodeAssistantFeature", feature: "packageIncludes" }, module);

    expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
      type: "init",
      activeToolId: TEST_TOOL_ID,
      codeAssistantFeature: "packageIncludes",
      codeAssistantTreeUiState: { treeExpanded: true },
    });
  });

  it("先打开 packageIncludes 再激活 direct leaf 时清理 legacy inner feature", async () => {
    const { provider, internals, module } = createProvider();
    await provider.showTool("codeAssistant");
    vscodeHost.executeCommand.mockClear();

    await internals.onMessage({ type: "openCodeAssistantFeature", feature: "packageIncludes" }, module);
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith("ktAutoCode.codeAssistant.packageIncludes");
    expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
      type: "init",
      activeToolId: "codeAssistant",
      codeAssistantFeature: "packageIncludes",
    });

    await internals.onMessage({ type: "selectTool", toolId: "encodingFix" }, module);

    expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
      type: "init",
      activeToolId: "encodingFix",
      codeAssistantFeature: undefined,
    });
    expect(internals.codeAssistantFeatureId).toBeUndefined();
  });

  it("从功能目录启动自动编译只调用 Editor 命令，不写入 legacy inner feature", async () => {
    const { provider, internals, module } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    module.messages.length = 0;
    vscodeHost.executeCommand.mockClear();

    await internals.onMessage({ type: "openCodeAssistantFeature", feature: "autoBuild" }, module);

    expect(vscodeHost.executeCommand).toHaveBeenCalledWith("ktAutoCode.codeAssistant.autoBuild");
    expect(module.messages.filter((message) => message.type === "init")).toEqual([]);
    expect(internals.codeAssistantFeatureId).toBeUndefined();
    expect(internals.activeToolId).toBe(TEST_TOOL_ID);
    expect(internals.openToolIds).toEqual([TEST_TOOL_ID]);
  });

  it("visible 与 open-inactive 生命周期只更新摘要，不激活 Primary 或抢焦点", async () => {
    const { provider, internals, module } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    module.messages.length = 0;
    vscodeHost.executeCommand.mockClear();

    const visible = companionSnapshot("projectRename", "rename-background", {
      revision: 1,
      lifecycle: "visible",
      message: "后台可见",
    });
    await internals.updateEditorCompanion(visible);
    await internals.updateEditorCompanion({
      ...visible,
      revision: 2,
      lifecycle: "open-inactive",
      message: "后台打开",
    });

    expect(module.messages.filter((message) => message.type === "openTools")).toEqual([]);
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "projectRename",
      state: { editorCompanion: { panelId: "rename-background", lifecycle: "open-inactive" } },
    });
    expect(provider.getRuntimeDiagnosticsSnapshot().openToolIds).toEqual([TEST_TOOL_ID]);
    expect(vscodeHost.executeCommand).not.toHaveBeenCalledWith("workbench.view.extension.kt-auto-code");
  });

  it("未知 Editor 的首条 disposed 快照不登记也不落入工具状态", async () => {
    const { internals, module } = createProvider();

    await internals.updateEditorCompanion(companionSnapshot("projectRename", "unknown-panel", {
      lifecycle: "disposed",
      ready: false,
    }));

    expect(internals.toolStates.has("projectRename")).toBe(false);
    expect(stateMessages(module)).toEqual([]);
    expect(vscodeHost.outputLines).toContainEqual(expect.stringContaining("已忽略未登记 Editor 的 dispose 快照"));
  });

  it("同一 panelId 的新 session 重新注册，并拒绝旧 session 动作", async () => {
    const { internals, module } = createProvider();
    const first = companionSnapshot("projectRename", "reused-panel", {
      sessionId: "rename-session-1",
      revision: 4,
      lifecycle: "active",
      message: "旧任务",
    });
    const replacement = companionSnapshot("projectRename", "reused-panel", {
      sessionId: "rename-session-2",
      revision: 0,
      lifecycle: "active",
      message: "新任务",
    });

    await internals.updateEditorCompanion(first);
    await internals.updateEditorCompanion(replacement);

    await internals.updateEditorCompanion({
      ...first,
      revision: 99,
      lifecycle: "active",
      message: "旧任务迟到",
    });

    expect(internals.editorCompanionState.companions).toEqual([
      expect.objectContaining({ panelId: "reused-panel", sessionId: "rename-session-2", revision: 0 }),
    ]);
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "projectRename",
      state: { message: "新任务", editorCompanion: { sessionId: "rename-session-2" } },
    });
    expect(vscodeHost.outputLines).toContainEqual(expect.stringContaining("retired Editor session"));

    await internals.onMessage({
      type: "editorCompanionAction",
      panelId: first.panelId,
      toolId: "projectRename",
      sessionId: first.sessionId,
      revision: first.revision,
      actionId: "reveal",
    }, module);
    expect(runProjectRenameCompanionAction).not.toHaveBeenCalled();

    await internals.onMessage({
      type: "editorCompanionAction",
      panelId: replacement.panelId,
      toolId: "projectRename",
      sessionId: replacement.sessionId,
      revision: replacement.revision,
      actionId: "reveal",
    }, module);
    expect(runProjectRenameCompanionAction).toHaveBeenCalledOnce();
  });

  it("只保留每个工具最近的无路径 tombstone，并立即释放 disposed 完整快照", async () => {
    const { internals, module } = createProvider();
    let lastClosed: KtcEditorPrimaryCompanionSnapshot | undefined;

    for (const toolId of ["projectRename", "autoBuild"] as const) {
      for (let index = 0; index < 7; index += 1) {
        const panelId = `${toolId}-closed-${index}`;
        const live = companionSnapshot(toolId, panelId, {
          revision: 1,
          lifecycle: "visible",
          message: `/private/${toolId}/${index}`,
          summary: [{ label: "目录", value: `/private/${toolId}/${index}` }],
        });
        lastClosed = { ...live, revision: 2, lifecycle: "disposed", status: "error", ready: false };
        await internals.updateEditorCompanion(live);
        await internals.updateEditorCompanion(lastClosed);
      }
    }

    expect(internals.editorCompanionSnapshots.size).toBe(0);
    for (const toolId of ["projectRename", "autoBuild"] as const) {
      expect(internals.editorCompanionState.companions.filter((session) => (
        session.toolId === toolId && session.lifecycle === "disposed"
      ))).toHaveLength(4);
      const projected = internals.toolStates.get(toolId)?.editorCompanion;
      expect(projected).toMatchObject({
        toolId,
        lifecycle: "disposed",
        status: "error",
        ready: false,
        summary: [],
        actions: [],
      });
      expect(JSON.stringify(projected)).not.toContain("/private/");
      expect(internals.retiredEditorCompanionSessions.get(toolId)).toHaveLength(7);
      expect(JSON.stringify(internals.retiredEditorCompanionSessions.get(toolId))).not.toContain("/private/");
    }

    expect(lastClosed).toBeDefined();
    await internals.onMessage({
      type: "editorCompanionAction",
      panelId: lastClosed!.panelId,
      toolId: lastClosed!.toolId,
      sessionId: lastClosed!.sessionId,
      revision: lastClosed!.revision,
      actionId: "reveal",
    }, module);
    expect(runEditorCompanionAction).not.toHaveBeenCalled();
    expect(runProjectRenameCompanionAction).not.toHaveBeenCalled();
  });

  it("Editor 激活只更新同一 Primary toolId，不抢回 Editor 焦点", async () => {
    const { internals, module } = createProvider();
    const snapshot: KtcEditorPrimaryCompanionSnapshot = {
      panelId: "auto-build-panel-1",
      toolId: "autoBuild",
      sessionId: "auto-build-session-1",
      revision: 3,
      lifecycle: "active",
      title: "自动编译",
      status: "running",
      message: "正在执行",
      ready: true,
      summary: [{ label: "任务", value: "1 个进行中" }],
      actions: [{ id: "openOutput", label: "Output", enabled: true }],
    };

    await internals.updateEditorCompanion(snapshot);

    expect(module.messages.filter((message) => message.type === "openTools").at(-1)).toMatchObject({
      type: "openTools",
      activeToolId: "autoBuild",
      openToolIds: ["autoBuild"],
    });
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "autoBuild",
      state: { status: "running", editorCompanion: snapshot },
    });
    expect(vscodeHost.executeCommand).not.toHaveBeenCalledWith("workbench.view.extension.kt-auto-code");
  });

  it("同一工具只投影当前 route，后台更新不覆盖且 dispose 后回退存活会话", async () => {
    const { internals, module } = createProvider();
    const left = companionSnapshot("projectRename", "rename-left", {
      sessionId: "rename-left-session",
      revision: 2,
      lifecycle: "active",
      message: "左侧任务",
    });
    const right = companionSnapshot("projectRename", "rename-right", {
      sessionId: "rename-right-session",
      revision: 5,
      lifecycle: "visible",
      message: "右侧后台任务",
    });

    await internals.updateEditorCompanion(left);
    await internals.updateEditorCompanion(right);
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "projectRename",
      state: { message: "左侧任务", editorCompanion: { panelId: "rename-left" } },
    });

    await internals.updateEditorCompanion({
      ...right,
      revision: 6,
      lifecycle: "open-inactive",
      message: "右侧仍在后台",
    });
    expect(stateMessages(module).at(-1)?.state.editorCompanion?.panelId).toBe("rename-left");

    await internals.updateEditorCompanion({
      ...right,
      revision: 7,
      lifecycle: "active",
      message: "右侧成为当前任务",
    });
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "projectRename",
      state: { message: "右侧成为当前任务", editorCompanion: { panelId: "rename-right" } },
    });

    await internals.updateEditorCompanion({
      ...right,
      revision: 8,
      lifecycle: "disposed",
      status: "idle",
      message: "右侧已关闭",
      ready: false,
    });
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "projectRename",
      state: { message: "左侧任务", editorCompanion: { panelId: "rename-left", lifecycle: "active" } },
    });

    await internals.onMessage({
      type: "editorCompanionAction",
      panelId: left.panelId,
      toolId: "projectRename",
      sessionId: left.sessionId,
      revision: left.revision,
      actionId: "reveal",
    }, module);
    expect(runProjectRenameCompanionAction).toHaveBeenCalledOnce();
  });

  it("Primary companion 动作要求 route、revision 与启用状态完全匹配", async () => {
    const { internals, module } = createProvider();
    const snapshot: KtcEditorPrimaryCompanionSnapshot = {
      panelId: "auto-build-panel-2",
      toolId: "autoBuild",
      sessionId: "auto-build-session-2",
      revision: 7,
      lifecycle: "active",
      title: "自动编译",
      status: "done",
      message: "完成",
      ready: true,
      summary: [],
      actions: [
        { id: "openOutput", label: "Output", enabled: true },
        { id: "stop", label: "停止", enabled: false },
      ],
    };
    await internals.updateEditorCompanion(snapshot);

    await internals.onMessage({
      type: "editorCompanionAction",
      panelId: snapshot.panelId,
      toolId: "autoBuild",
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
      actionId: "openOutput",
    }, module);
    expect(runEditorCompanionAction).toHaveBeenCalledOnce();

    for (const rejected of [
      { panelId: "wrong-panel", sessionId: snapshot.sessionId, revision: snapshot.revision, actionId: "openOutput" },
      { panelId: snapshot.panelId, sessionId: "wrong-session", revision: snapshot.revision, actionId: "openOutput" },
      { panelId: snapshot.panelId, sessionId: snapshot.sessionId, revision: snapshot.revision - 1, actionId: "openOutput" },
      { panelId: snapshot.panelId, sessionId: snapshot.sessionId, revision: snapshot.revision, actionId: "stop" },
      { panelId: snapshot.panelId, sessionId: snapshot.sessionId, revision: snapshot.revision, actionId: "missing" },
    ]) {
      await internals.onMessage({
        type: "editorCompanionAction",
        toolId: "autoBuild",
        ...rejected,
      }, module);
    }

    const notReady = { ...snapshot, revision: 8, lifecycle: "active" as const, ready: false };
    await internals.updateEditorCompanion(notReady);
    await internals.onMessage({
      type: "editorCompanionAction",
      panelId: notReady.panelId,
      toolId: "autoBuild",
      sessionId: notReady.sessionId,
      revision: notReady.revision,
      actionId: "openOutput",
    }, module);

    const disposed = { ...notReady, revision: 9, lifecycle: "disposed" as const };
    await internals.updateEditorCompanion(disposed);
    await internals.onMessage({
      type: "editorCompanionAction",
      panelId: disposed.panelId,
      toolId: "autoBuild",
      sessionId: disposed.sessionId,
      revision: disposed.revision,
      actionId: "openOutput",
    }, module);
    expect(runEditorCompanionAction).toHaveBeenCalledOnce();
  });

  it("run 信号必须使用真实叶子和受支持动作", async () => {
    expect(ktcRunSignalContractError({ type: "run", toolId: "headerAscii", action: "scan" }, ["scan", "fix"])).toBeUndefined();
    expect(ktcRunSignalContractError({ type: "run", toolId: "codeAssistant", action: "scan" }, ["openPackageIncludes"]))
      .toContain("不支持动作");

    const { internals, module } = createProvider();
    await internals.onMessage({ type: "run", toolId: "codeAssistant", action: "scan" }, module);

    expect(vscodeHost.outputLines).toContainEqual(expect.stringContaining("[Primary][信号][ERROR]"));
    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "codeAssistant",
      state: { status: "error" },
    });
  });

  it("Tool Surface × 关闭 direct companion leaf 时恢复 MRU，但保留任务与 Editor 会话", async () => {
    const { provider, internals, module } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    const autoBuild = companionSnapshot("autoBuild", "auto-build-close", {
      sessionId: "auto-build-close-session",
      revision: 3,
      lifecycle: "active",
      status: "done",
      message: "编译完成",
    });
    await internals.updateEditorCompanion(autoBuild);
    const taskStateBefore = internals.toolStates.get("autoBuild");
    const sessionBefore = internals.editorCompanionState.companions[0];
    const snapshotBefore = internals.editorCompanionSnapshots.get(autoBuild.panelId);
    module.messages.length = 0;

    await internals.onMessage({ type: "closeToolBlock" }, module);

    expect(internals.activeToolId).toBe(TEST_TOOL_ID);
    expect(internals.openToolIds).toEqual([TEST_TOOL_ID]);
    expect(internals.toolStates.get("autoBuild")).toBe(taskStateBefore);
    expect(internals.editorCompanionState.companions).toContain(sessionBefore);
    expect(internals.editorCompanionSnapshots.get(autoBuild.panelId)).toBe(snapshotBefore);
    expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
      type: "init",
      activeToolId: TEST_TOOL_ID,
      openToolIds: [TEST_TOOL_ID],
      moduleState: { active: "code" },
    });
  });

  it("Tool Surface × 跨 Code/CAD 恢复 MRU 时同步激活模块并刷新 Webview", async () => {
    setInstalledExtensions({
      id: "kuntai.kt-auto-cad",
      extensionUri: vscode.Uri.file("/cad-extension"),
      packageJSON: {
        ktAutoCodeModule: {
          id: "cad",
          title: "CAD",
          order: 20,
          commandPrefix: "ktAutoCad.",
          tools: [{
            id: "cadFilename",
            shortTitle: "文件名",
            title: "CAD 文件名",
            description: "CAD 文件名工具",
            command: "ktAutoCad.block.filename",
            requirement: "none",
          }],
        },
      },
    });
    const { provider, internals, module } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    await provider.showModuleTool("cad", "cadFilename");
    expect(provider.getModuleState().active).toBe("cad");
    expect(internals.activeToolId).toBe("cadFilename");
    module.messages.length = 0;

    await provider.closeToolBlock();

    expect(provider.getModuleState().active).toBe("code");
    expect(internals.activeToolId).toBe(TEST_TOOL_ID);
    expect(internals.openToolIds).toEqual([TEST_TOOL_ID]);
    expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
      type: "init",
      activeToolId: TEST_TOOL_ID,
      openToolIds: [TEST_TOOL_ID],
      moduleState: { active: "code" },
    });
  });

  it("关闭后台逻辑工具只刷新 MRU 投影，不重复运行当前工具的 onDidShow", async () => {
    const { provider, internals, module } = createProvider();
    await provider.showTool(SECOND_TEST_TOOL_ID);
    await provider.showTool(TEST_TOOL_ID);
    const didShowCountBeforeClose = testToolDidShow.mock.calls.length;
    expect(didShowCountBeforeClose).toBeGreaterThan(0);
    module.messages.length = 0;

    await provider.closeToolBlock(SECOND_TEST_TOOL_ID);

    expect(internals.activeToolId).toBe(TEST_TOOL_ID);
    expect(internals.openToolIds).toEqual([TEST_TOOL_ID]);
    expect(testToolDidShow).toHaveBeenCalledTimes(didShowCountBeforeClose);
    expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
      type: "init",
      activeToolId: TEST_TOOL_ID,
      openToolIds: [TEST_TOOL_ID],
    });
  });

  it("关闭成员排序会清空 Host 会话状态并回到代码辅助 Tree", async () => {
    const { internals, module } = createProvider();
    internals.setToolState("reorderMembers", {
      status: "done",
      message: "已扫描",
      scanned: 2,
      reorderResults: [],
      reorderSelectedUris: [],
    });
    module.messages.length = 0;

    await internals.onMessage({ type: "clearReorderMembersSession", toolId: "reorderMembers" }, module);

    expect(stateMessages(module).at(-1)).toMatchObject({
      toolId: "reorderMembers",
      state: { status: "idle", scanned: 0, reorderResults: [], reorderSelectedUris: [] },
    });
  });

  it("欢迎页链接、设置与安装动作只调用对应宿主入口", async () => {
    const { internals, module } = createProvider();

    await internals.onMessage({ type: "welcomeAction", action: "openRepository" }, module);
    expect(vscodeHost.openExternal).toHaveBeenCalledOnce();
    expect(String(vscodeHost.openExternal.mock.calls[0]?.[0])).toContain("phoenixwing/kt-auto-code");

    await internals.onMessage({ type: "welcomeAction", action: "openInstallGuide" }, module);
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "workbench.extensions.search",
      "@id:kuntai.kt-auto-code",
    );

    await internals.onMessage({ type: "welcomeAction", action: "openSettings" }, module);
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "workbench.action.openSettings",
      "@ext:kuntai.kt-auto-code",
    );

    await internals.onMessage({ type: "welcomeAction", action: "openDiagnostics" }, module);
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith("ktAutoCode.runtimeDiagnostics.open");

    await internals.onMessage({
      type: "welcomeAction",
      action: "installExtension",
      extensionId: "kuntai.kt-auto-cad",
    }, module);
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "workbench.extensions.installExtension",
      "kuntai.kt-auto-cad",
    );
  });

  it("运行诊断快照不公开普通状态或 companion 摘要中的路径正文", async () => {
    const { provider, internals } = createProvider();
    internals.setToolState("headerAscii", { status: "done", message: "/private/secret.h" });
    await internals.updateEditorCompanion(companionSnapshot("projectRename", "private-panel", {
      message: "/private/project-name",
      summary: [{ label: "目录", value: "/private/project-name" }],
    }));

    expect(provider.getRuntimeDiagnosticsSnapshot()).toEqual({
      resolvedViews: 1,
      ribbonResolved: false,
      modulePanelResolved: true,
      ribbonVisible: false,
      modulePanelVisible: true,
      openToolCount: 0,
      openToolIds: [],
      retainedToolStateCount: 2,
      moduleBlockProviderCount: 0,
    });
    expect(JSON.stringify(provider.getRuntimeDiagnosticsSnapshot())).not.toContain("secret.h");
    expect(JSON.stringify(provider.getRuntimeDiagnosticsSnapshot())).not.toContain("project-name");
  });

  it("编码目标写入后立即刷新 GBK 选项并废弃旧预检结果", async () => {
    const { internals, module } = createProvider();
    internals.setToolState("encodingFix", {
      status: "done",
      message: "旧 UTF-8 预检结果",
      encodingResults: [{
        file: "Part.cpp",
        relativePath: "src/Part.cpp",
        fullPath: "/workspace/src/Part.cpp",
        detected: "UTF-8",
        expected: "UTF-8",
        status: "ok",
        suggestedAction: "无需转换",
      }],
      scanned: 1,
      issueFiles: 0,
    });
    module.messages.length = 0;

    await internals.onMessage({
      type: "setEncodingDefaultTarget",
      toolId: "encodingFix",
      target: "gbk",
    }, module);

    expect(vscodeHost.configurationValues.get("ktAutoCode.encodingFix.defaultTarget")).toBe("gbk");
    expect([...module.messages].reverse().find((message) => (
      message.type === "options" && message.toolId === "encodingFix"
    ))).toEqual({
      type: "options",
      toolId: "encodingFix",
      options: {
        encodingDefaultTarget: "gbk",
        encodingHeaderTarget: "inherit",
        encodingSourceTarget: "inherit",
        encodingMarkdownTarget: "inherit",
      },
    });
    expect(stateMessages(module).at(-1)).toEqual({
      type: "state",
      toolId: "encodingFix",
      state: {
        status: "idle",
        message: "项目编码目标已更新，请重新预检。",
        encodingResults: [],
        scanned: 0,
        issueFiles: 0,
        fixedFiles: 0,
      },
    });
  });

  it("共享工具界面只向标题菜单发布当前活动工具", async () => {
    const { provider, module } = createProvider();

    await provider.showTool(TEST_TOOL_ID);
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "ktAutoCode.modulePanel.activeTool",
      TEST_TOOL_ID,
    );
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "ktAutoCode.modulePanelVisible",
      true,
    );

    await provider.closeToolBlock();
    expect(module.title).toBe("KT Auto Code");
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "ktAutoCode.modulePanelVisible",
      false,
    );
    expect(vscodeHost.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "ktAutoCode.modulePanel.activeTool",
      "",
    );
  });

  it("当前 Tool Surface 已打开时只发送显示意图，不重复激活或滚动共享 Panel", async () => {
    const { provider, module } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    vscodeHost.executeCommand.mockClear();
    (module.show as ReturnType<typeof vi.fn>).mockClear();
    module.messages.length = 0;

    await provider.showTool(TEST_TOOL_ID);

    expect(vscodeHost.executeCommand).not.toHaveBeenCalled();
    expect(module.show).not.toHaveBeenCalled();
    expect(module.messages).toEqual([{ type: "revealToolSurface", toolId: TEST_TOOL_ID }]);
  });

  it("共享 Panel 可见时切换不同 Block 只更新内容，不重新 show 导致外层滚动回顶", async () => {
    const { provider, module } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    (module.show as ReturnType<typeof vi.fn>).mockClear();
    const messageCount = module.messages.length;

    await provider.showTool(SECOND_TEST_TOOL_ID);

    expect(module.show).not.toHaveBeenCalled();
    expect(module.messages.length).toBeGreaterThan(messageCount);
    expect([...module.messages].reverse().find((message) => message.type === "init")).toMatchObject({
      type: "init",
      activeToolId: SECOND_TEST_TOOL_ID,
    });
  });

  it("只把一次性 picker 发给唯一 Shell Webview", async () => {
    const { internals, module } = createProvider();

    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "picker" }, module);

    expect(stateMessages(module)).toEqual([
      expect.objectContaining({
        toolId: TEST_TOOL_ID,
        state: expect.objectContaining({ associatedRulePicker: picker }),
      }),
    ]);
    expect(internals.toolStates.get(TEST_TOOL_ID)).toEqual({
      status: "idle",
      message: "请选择要添加的关联规则。",
    });
  });

  it("后续普通状态广播不会回弹旧 picker", async () => {
    const { internals, module } = createProvider();
    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "picker" }, module);
    module.messages.length = 0;

    nextState = { status: "done", message: "关联规则已更新。" };
    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "complete" }, module);

    expect(stateMessages(module)).toEqual([{
      type: "state",
      toolId: TEST_TOOL_ID,
      state: { status: "done", message: "关联规则已更新。" },
    }]);
    expect(internals.toolStates.get(TEST_TOOL_ID)).toEqual({
      status: "done",
      message: "关联规则已更新。",
    });
  });

  it("没有请求来源的 Host 状态也会丢弃 picker 并只广播 durable 数据", () => {
    const { internals, module } = createProvider();
    internals.setToolState(TEST_TOOL_ID, nextState);

    expect(stateMessages(module)[0]?.state).toEqual({
      status: "idle",
      message: "请选择要添加的关联规则。",
    });
    expect(internals.toolStates.get(TEST_TOOL_ID)).not.toHaveProperty("associatedRulePicker");
  });

  it("Webview 重建后 init 只重放 durable 状态", async () => {
    const { internals, module } = createProvider();
    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "picker" }, module);

    const rebuilt = webviewView(SidebarViewProvider.moduleViewType);
    await internals.sendInit(rebuilt);

    expect(rebuilt.messages[0]).toEqual(expect.objectContaining({ type: "init" }));
    const replay = stateMessages(rebuilt).find((message) => message.toolId === TEST_TOOL_ID);
    expect(replay?.state).toEqual({
      status: "idle",
      message: "请选择要添加的关联规则。",
    });
    expect(replay?.state).not.toHaveProperty("associatedRulePicker");
  });

  it("清理历史 map 中可能残留的 picker，保持防御性 init 边界", () => {
    const { internals, module } = createProvider();
    internals.toolStates.set(TEST_TOOL_ID, nextState);

    internals.setToolState(TEST_TOOL_ID, { status: "running", message: "处理中…" }, module);

    expect(internals.toolStates.get(TEST_TOOL_ID)).toEqual({
      status: "running",
      message: "处理中…",
    });
    expect(stateMessages(module)[0]?.state).not.toHaveProperty("associatedRulePicker");
  });
});
