import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  showOpenDialog: vi.fn(),
  executeCommand: vi.fn(),
  onActive: undefined as ((uri: string) => void) | undefined,
  onDispose: undefined as ((uri: string) => void) | undefined,
  panels: new Set<string>(),
}));

vi.mock("vscode", () => {
  class Uri {
    readonly scheme = "file";
    readonly path: string;
    constructor(readonly fsPath: string) { this.path = fsPath; }
    static file(path: string) { return new Uri(path); }
    static parse(value: string) { return new Uri(new URL(value).pathname); }
    toString() { return `file://${this.fsPath}`; }
  }
  return {
    Uri,
    workspace: {
      fs: { readFile: host.readFile, writeFile: host.writeFile },
      workspaceFolders: [],
      getWorkspaceFolder: () => undefined,
    },
    window: { showOpenDialog: host.showOpenDialog },
    commands: { executeCommand: host.executeCommand },
  };
});
vi.mock("./problemReporter.js", () => ({
  KtcCodegenProblemReporter: class {
    activate() {} publish() {} clear() {} dispose() {}
  },
}));
vi.mock("./workspaceWatchService.js", () => ({
  KtcCodegenWorkspaceWatchService: class { start() {} dispose() {} },
}));
vi.mock("./editorViewController.js", () => ({
  KtcCodegenEditorViewController: class {
    constructor(_uri: unknown, callbacks: { onActive: (uri: string) => void; onDispose: (uri: string) => void }) {
      host.onActive = callbacks.onActive;
      host.onDispose = callbacks.onDispose;
    }
    show(model: { uri: string }) { host.panels.add(model.uri); host.onActive!(model.uri); }
    isOpen(uri: string) { return host.panels.has(uri); }
    get openPanelCount() { return host.panels.size; }
    post() {} setDocumentState() {} dispose() { host.panels.clear(); }
  },
}));

import * as vscode from "vscode";
import type { ToolRunContext, ToolUiState } from "../types.js";
import { codegenTool, registerCodegenSupport, setCodegenRunContextFactory } from "./index.js";

const subscriptions: vscode.Disposable[] = [];
let states: ToolUiState[] = [];
let ctx: ToolRunContext;
let activatePrimary: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  host.files.clear();
  host.panels.clear();
  states = [];
  host.readFile.mockReset().mockImplementation(async (uri: vscode.Uri) => host.files.get(uri.toString()));
  host.writeFile.mockReset();
  host.executeCommand.mockReset();
  host.showOpenDialog.mockReset();
  ctx = {
    workspaceRoot: "/workspace", workspaceLabel: "workspace", workspaceFileScopeId: "",
    pluginIgnoreEnabled: false, postState: (state) => { states.push(state); }, log: vi.fn(),
  };
  activatePrimary = vi.fn(async () => undefined);
  setCodegenRunContextFactory(() => ctx, activatePrimary);
  registerCodegenSupport({
    extensionUri: vscode.Uri.file("/extension"), extension: { packageJSON: { version: "test" } },
    workspaceState: { get: () => undefined, update: async () => undefined }, subscriptions,
  } as unknown as vscode.ExtensionContext);
});
afterEach(() => { for (const subscription of subscriptions.splice(0)) subscription.dispose(); });

async function openPair() {
  const uris = ["A", "B"].map((name) => {
    const uri = vscode.Uri.file(`/workspace/${name}.json`);
    const text = JSON.stringify({
      type: "100106", version: "4.0", NamePrefix: "PNX", NameMiddle: name,
      NameSpace: "Kt", AppendFunction: "push_back",
      headers: ["NameSuffix", "ID", "Name", "ParamString", "DataType", "TCKind", "DefaultValue",
        "CATAttrInOut", "IsList", "IsOnTree", "Component", "Count", "IsParamDlg", "Unit", "Author", "CreateDate", "Notes"],
      data: [["Base", 1, "First", "First", "int", "Integer", 0, "In", 0, 0, "", 0, 0, "", "", "", ""]],
    });
    host.files.set(uri.toString(), new TextEncoder().encode(text));
    return uri;
  });
  host.showOpenDialog.mockResolvedValueOnce(uris);
  await codegenTool.handleMessage({ type: "codegenAction", toolId: "codegen", action: "openJson" }, ctx);
  expect(host.panels.size, JSON.stringify(states)).toBe(2);
  activatePrimary.mockClear();
  host.readFile.mockClear();
  return uris.map((uri) => uri.toString());
}

describe("Codegen Editor → Primary activation", () => {
  it("重新激活任一 JSON 先发布该文档草稿，再请求显示 Primary，不重新读盘/执行任务", async () => {
    const [a, b] = await openPair();
    host.onActive!(a!);
    await codegenTool.handleMessage({
      type: "codegenAction", toolId: "codegen", action: "updateMeta",
      uri: a, field: "nameMiddle", value: "A draft",
    }, ctx);
    const projectedIds: (string | undefined)[] = [];
    activatePrimary.mockImplementation(async () => { projectedIds.push(states.at(-1)?.codegen?.activeId); });

    host.onActive!(a!);
    host.onActive!(b!);
    host.onActive!(a!);

    expect(projectedIds).toEqual([a, b, a]);
    const state = states.at(-1)?.codegen;
    expect(state?.activeId).toBe(a);
    expect(state?.documents.find((document) => document.id === a)).toMatchObject({ nameMiddle: "A draft", dirty: true });
    expect(state?.documents.find((document) => document.id === b)).toMatchObject({ nameMiddle: "B", dirty: false });
    expect(host.panels.size).toBe(2);
    expect(host.readFile).not.toHaveBeenCalled();
    expect(host.writeFile).not.toHaveBeenCalled();
    expect(host.executeCommand).not.toHaveBeenCalled();
  });

  it("未知文档不打开 Primary；关闭 JSON 不关闭/重新激活 Primary，展示失败有日志", async () => {
    const [a] = await openPair();
    host.onActive!("file:///workspace/missing.json");
    expect(activatePrimary).not.toHaveBeenCalled();
    activatePrimary.mockRejectedValueOnce(new Error("view unavailable"));
    host.onActive!(a!);
    await Promise.resolve();
    expect(ctx.log).toHaveBeenCalledWith("显示自动代码 Primary 失败：view unavailable");
    activatePrimary.mockClear();
    host.panels.delete(a!);
    host.onDispose!(a!);
    expect(activatePrimary).not.toHaveBeenCalled();
    expect(host.writeFile).not.toHaveBeenCalled();
  });
});
