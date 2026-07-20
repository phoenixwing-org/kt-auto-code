import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeHost = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
}));

vi.mock("vscode", () => {
  class Uri {
    static file(fsPath: string) { return new Uri(fsPath); }
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
    Uri,
    commands: {
      executeCommand: vscodeHost.executeCommand,
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    extensions: { all: [] },
    workspace: {
      workspaceFolders: undefined,
      textDocuments: [],
      getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, fallback: unknown) => fallback),
        update: vi.fn(async () => undefined),
      })),
      fs: {},
    },
    window: {
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
import { SidebarViewProvider } from "./sidebarViewProvider.js";

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
  ribbonView?: vscode.WebviewView;
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
  ribbon: FakeWebviewView;
  module: FakeWebviewView;
} {
  const provider = new SidebarViewProvider(extensionUri(), memory(), memory());
  const internals = provider as unknown as ProviderInternals;
  const ribbon = webviewView(SidebarViewProvider.viewType);
  const module = webviewView(SidebarViewProvider.moduleViewType);
  internals.ribbonView = ribbon;
  internals.moduleView = module;
  return { provider, internals, ribbon, module };
}

function stateMessages(view: FakeWebviewView): Extract<WebviewOutboundMessage, { type: "state" }>[] {
  return view.messages.filter(
    (message): message is Extract<WebviewOutboundMessage, { type: "state" }> => message.type === "state",
  );
}

describe("SidebarViewProvider transient tool state", () => {
  beforeEach(() => {
    vscodeHost.executeCommand.mockClear();
    nextState = {
      status: "idle",
      message: "请选择要添加的关联规则。",
      associatedRulePicker: picker,
    };
  });

  it("共享工具界面只向标题菜单发布当前活动工具", async () => {
    const { provider } = createProvider();

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

  it.each([
    ["Ribbon", "ribbon"],
    ["Module", "module"],
  ] as const)("只把一次性 picker 发给请求来源 %s Webview", async (_label, sourceName) => {
    const { internals, ribbon, module } = createProvider();
    const source = sourceName === "ribbon" ? ribbon : module;
    const other = sourceName === "ribbon" ? module : ribbon;

    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "picker" }, source);

    expect(stateMessages(source)).toEqual([
      expect.objectContaining({
        toolId: TEST_TOOL_ID,
        state: expect.objectContaining({ associatedRulePicker: picker }),
      }),
    ]);
    expect(stateMessages(other)).toEqual([
      expect.objectContaining({
        toolId: TEST_TOOL_ID,
        state: {
          status: "idle",
          message: "请选择要添加的关联规则。",
        },
      }),
    ]);
    expect(internals.toolStates.get(TEST_TOOL_ID)).toEqual({
      status: "idle",
      message: "请选择要添加的关联规则。",
    });
  });

  it("后续普通状态广播不会回弹旧 picker", async () => {
    const { internals, ribbon, module } = createProvider();
    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "picker" }, module);
    ribbon.messages.length = 0;
    module.messages.length = 0;

    nextState = { status: "done", message: "关联规则已更新。" };
    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "complete" }, module);

    for (const view of [ribbon, module]) {
      expect(stateMessages(view)).toEqual([{
        type: "state",
        toolId: TEST_TOOL_ID,
        state: { status: "done", message: "关联规则已更新。" },
      }]);
    }
    expect(internals.toolStates.get(TEST_TOOL_ID)).toEqual({
      status: "done",
      message: "关联规则已更新。",
    });
  });

  it("没有请求来源的 Host 状态也会丢弃 picker 并只广播 durable 数据", () => {
    const { internals, ribbon, module } = createProvider();
    internals.setToolState(TEST_TOOL_ID, nextState);

    for (const view of [ribbon, module]) {
      expect(stateMessages(view)[0]?.state).toEqual({
        status: "idle",
        message: "请选择要添加的关联规则。",
      });
    }
    expect(internals.toolStates.get(TEST_TOOL_ID)).not.toHaveProperty("associatedRulePicker");
  });

  it("Webview 重建后 init 只重放 durable 状态", async () => {
    const { internals, ribbon } = createProvider();
    await internals.onMessage({ type: "run", toolId: TEST_TOOL_ID, action: "picker" }, ribbon);

    const rebuilt = webviewView(SidebarViewProvider.viewType);
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
    const { internals, ribbon, module } = createProvider();
    internals.toolStates.set(TEST_TOOL_ID, nextState);

    internals.setToolState(TEST_TOOL_ID, { status: "running", message: "处理中…" }, ribbon);

    expect(internals.toolStates.get(TEST_TOOL_ID)).toEqual({
      status: "running",
      message: "处理中…",
    });
    expect(stateMessages(ribbon)[0]?.state).not.toHaveProperty("associatedRulePicker");
    expect(stateMessages(module)[0]?.state).not.toHaveProperty("associatedRulePicker");
  });
});
