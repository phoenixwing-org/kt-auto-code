import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeHost = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
  openExternal: vi.fn<(uri: unknown) => Promise<boolean>>(async () => true),
  configurationValues: new Map<string, unknown>(),
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
    ConfigurationTarget: { Workspace: "workspace", WorkspaceFolder: "workspaceFolder" },
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
        appendLine: vi.fn(),
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
  ToolRunContext,
  ToolUiState,
  WebviewInboundMessage,
  WebviewOutboundMessage,
} from "../tools/types.js";
import { registerTool } from "../tools/registry.js";
import { encodingFixTool } from "../tools/encodingFix/index.js";
import { reorderMembersTool } from "../tools/reorderMembers/index.js";
import {
  SidebarViewProvider,
  ktcWelcomeExtensionSummaries,
} from "./sidebarViewProvider.js";

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

const testTool: KtTool = {
  id: TEST_TOOL_ID,
  title: "Transient picker test",
  description: "Host transient state boundary",
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
  toolStates: Map<string, ToolUiState>;
  onMessage(message: WebviewInboundMessage, source: vscode.WebviewView): Promise<void>;
  sendInit(target: vscode.WebviewView): Promise<void>;
  setToolState(toolId: string, state: ToolUiState, transientTarget?: vscode.WebviewView): void;
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

function createProvider(): {
  provider: SidebarViewProvider;
  internals: ProviderInternals;
  module: FakeWebviewView;
  globalState: vscode.Memento;
} {
  const globalState = memory();
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

describe("SidebarViewProvider transient tool state", () => {
  beforeEach(() => {
    vscodeHost.executeCommand.mockClear();
    vscodeHost.openExternal.mockClear();
    vscodeHost.configurationValues.clear();
    nextState = {
      status: "idle",
      message: "请选择要添加的关联规则。",
      associatedRulePicker: picker,
    };
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

  it("代码辅助 Tree 折叠状态保存到用户级 globalState 并在 init 时回传", async () => {
    const { internals, module, globalState } = createProvider();
    const state = {
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

  it("选择代码辅助叶子后收起目录并立即回传当前功能", async () => {
    const { internals, module, globalState } = createProvider();

    await internals.onMessage({ type: "selectTool", toolId: "encodingFix" }, module);

    expect(globalState.get("ktAutoCode.codeAssistant.treeUi.v1")).toMatchObject({ treeExpanded: false });
    expect(module.messages.filter((message) => message.type === "init").at(-1)).toMatchObject({
      type: "init",
      activeToolId: "codeAssistant",
      codeAssistantFeature: "encodingFix",
      codeAssistantTreeUiState: { treeExpanded: false },
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

  it("运行诊断快照只公开 Sidebar 资源计数和工具 ID", () => {
    const { provider, internals } = createProvider();
    internals.setToolState("headerAscii", { status: "done", message: "/private/secret.h" });

    expect(provider.getRuntimeDiagnosticsSnapshot()).toEqual({
      resolvedViews: 1,
      ribbonResolved: false,
      modulePanelResolved: true,
      ribbonVisible: false,
      modulePanelVisible: true,
      openToolCount: 0,
      openToolIds: [],
      retainedToolStateCount: 1,
      moduleBlockProviderCount: 0,
    });
    expect(JSON.stringify(provider.getRuntimeDiagnosticsSnapshot())).not.toContain("secret.h");
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
    expect(module.title).toBe("工具栏");
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

  it("当前 Block 已打开可见时不重复激活或滚动共享 Panel", async () => {
    const { provider, module } = createProvider();
    await provider.showTool(TEST_TOOL_ID);
    vscodeHost.executeCommand.mockClear();
    (module.show as ReturnType<typeof vi.fn>).mockClear();
    const messageCount = module.messages.length;

    await provider.showTool(TEST_TOOL_ID);

    expect(vscodeHost.executeCommand).not.toHaveBeenCalled();
    expect(module.show).not.toHaveBeenCalled();
    expect(module.messages).toHaveLength(messageCount);
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
