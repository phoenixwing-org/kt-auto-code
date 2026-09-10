import { beforeEach, describe, expect, it, vi } from "vitest";

const { createWebviewPanel } = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
}));

vi.mock("vscode", () => ({
  ViewColumn: { Active: 1 },
  Uri: {
    parse: (value: string) => {
      const parsed = new URL(value);
      return { scheme: parsed.protocol.slice(0, -1), fsPath: decodeURIComponent(parsed.pathname) };
    },
  },
  window: { createWebviewPanel },
}));

import type * as vscode from "vscode";
import type {
  KtcCodegenEditorInboundMessage,
  KtcCodegenEditorModel,
} from "./editorContracts.js";
import { KtcCodegenEditorViewController } from "./editorViewController.js";

interface FakePanel extends vscode.WebviewPanel {
  fireMessage(message: KtcCodegenEditorInboundMessage): void;
  fireActive(active: boolean): void;
  fireDispose(): void;
}

function model(uri: string, fileName: string, dirty = false): KtcCodegenEditorModel {
  return {
    uri,
    fileName,
    table: {
      kind: "kt.codegen.table-data",
      schemaVersion: 1,
      documentRevision: 0,
      selectedRow: null,
      items: [],
    },
    controls: {
      kind: "kt.codegen.control-ui-model",
      schemaVersion: 1,
      documentId: uri,
      uri,
      fileName,
      blocks: [],
      unclosed: [],
      selectedBlockKeys: [],
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: false,
      missingTemplates: [],
      presets: { all: [], none: [], cppOnly: [], fieldCode: [] },
    },
    dirty,
    externalConflict: false,
    externalState: "current",
  };
}

function fakePanel(): FakePanel {
  let messageListener: ((message: KtcCodegenEditorInboundMessage) => void) | undefined;
  let viewStateListener: ((event: { webviewPanel: vscode.WebviewPanel }) => void) | undefined;
  let disposeListener: (() => void) | undefined;
  const webview = {
    cspSource: "test-webview",
    html: "",
    asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
    postMessage: vi.fn(() => Promise.resolve(true)),
    onDidReceiveMessage: vi.fn((listener: (message: KtcCodegenEditorInboundMessage) => void) => {
      messageListener = listener;
      return { dispose: vi.fn() };
    }),
  };
  const panel = {
    active: true,
    visible: true,
    viewColumn: 1,
    title: "",
    webview,
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    onDidChangeViewState: vi.fn((listener: typeof viewStateListener) => {
      viewStateListener = listener;
      return { dispose: vi.fn() };
    }),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
    fireMessage(message: KtcCodegenEditorInboundMessage) { messageListener?.(message); },
    fireActive(active: boolean) {
      panel.active = active;
      viewStateListener?.({ webviewPanel: panel as unknown as vscode.WebviewPanel });
    },
    fireDispose() { disposeListener?.(); },
  };
  return panel as unknown as FakePanel;
}

function extensionUri(): vscode.Uri {
  return {
    path: "/extension",
    with(change: { path?: string }) { return { ...this, ...change }; },
    toString() { return "file:///extension"; },
  } as vscode.Uri;
}

describe("KtcCodegenEditorViewController", () => {
  beforeEach(() => createWebviewPanel.mockReset());

  it("在当前编辑区建立一 JSON 一标签，重复打开只定位原标签", () => {
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const callbacks = {
      onMessage: vi.fn(),
      onActive: vi.fn(),
      onDispose: vi.fn(),
    };
    const views = new KtcCodegenEditorViewController(extensionUri(), callbacks);

    views.show(model("file:///workspace/A.json", "A.json"));
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.codegenEditor",
      "A.json",
      { viewColumn: 1, preserveFocus: false },
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
    );
    expect(first.webview.html).toContain("A.json");
    expect(first.webview.html).toContain('contextPath: "/workspace/A.json"');
    expect(views.isOpen("file:///workspace/A.json")).toBe(true);

    views.show(model("file:///workspace/A.json", "A.json"));
    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(first.reveal).toHaveBeenCalledWith(first.viewColumn, false);

    views.show(model("file:///workspace/B.json", "B.json", true));
    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
    expect(createWebviewPanel.mock.calls[1]?.[2]).toEqual({ viewColumn: 1, preserveFocus: false });
    expect(createWebviewPanel.mock.calls[1]?.[1]).toBe("B.json");
  });

  it("把标签激活、消息和关闭准确路由到对应 JSON，会话总释放不误报关闭", () => {
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const callbacks = {
      onMessage: vi.fn(),
      onActive: vi.fn(),
      onDispose: vi.fn(),
    };
    const views = new KtcCodegenEditorViewController(extensionUri(), callbacks);
    views.show(model("file:///workspace/A.json", "A.json"));
    views.show(model("file:///workspace/B.json", "B.json"));

    callbacks.onActive.mockClear();
    first.fireActive(false);
    first.fireActive(true);
    expect(callbacks.onActive).toHaveBeenCalledTimes(1);
    expect(callbacks.onActive).toHaveBeenCalledWith("file:///workspace/A.json");

    const message = {
      type: "codegenEditorAction",
      toolId: "codegen",
      uri: "file:///workspace/A.json",
      action: "ready",
    } as KtcCodegenEditorInboundMessage;
    first.fireMessage(message);
    expect(callbacks.onMessage).toHaveBeenCalledWith("file:///workspace/A.json", message);

    views.post("file:///workspace/B.json", { type: "codegenStatus", status: "idle", message: "ok" });
    expect(second.webview.postMessage).toHaveBeenCalledWith({
      type: "codegenStatus", status: "idle", message: "ok",
    });
    views.setDocumentState("file:///workspace/B.json", "B.json", false, true);
    expect(second.title).toBe("B.json");

    first.fireDispose();
    expect(views.isOpen("file:///workspace/A.json")).toBe(false);
    expect(callbacks.onDispose).toHaveBeenCalledWith("file:///workspace/A.json");

    callbacks.onDispose.mockClear();
    views.dispose();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(callbacks.onDispose).not.toHaveBeenCalled();
  });

  it("同名 JSON 不追加目录，仍按 URI 隔离更新、消息与关闭", () => {
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const callbacks = { onMessage: vi.fn(), onActive: vi.fn(), onDispose: vi.fn() };
    const views = new KtcCodegenEditorViewController(extensionUri(), callbacks);
    const firstUri = "file:///workspace/one/参数.json";
    const secondUri = "file:///workspace/two/参数.json";
    views.show(model(firstUri, "参数.json"));
    views.show(model(secondUri, "参数.json"));
    expect(createWebviewPanel.mock.calls.map((call) => call[1])).toEqual(["参数.json", "参数.json"]);
    expect(views.openPanelCount).toBe(2);
    for (const dirty of [false, true]) {
      for (const conflict of [false, true]) {
        views.setDocumentState(firstUri, "参数.json", dirty, conflict);
        expect(first.title).toBe("参数.json");
      }
    }
    views.setDocumentState(secondUri, "新参数.json", true, true);
    expect(second.title).toBe("新参数.json");
    expect(first.title).toBe("参数.json");
    views.show(model(firstUri, "参数.json"));
    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
    expect(first.reveal).toHaveBeenCalledOnce();
    first.fireDispose();
    views.setDocumentState(firstUri, "已关闭.json", false, false);
    expect(second.title).toBe("新参数.json");
    expect(views.isOpen(secondUri)).toBe(true);
    expect(callbacks.onDispose).toHaveBeenCalledWith(firstUri);
  });

  it("把预检结果左右比例下发给 full View 并持久化拖动结果", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValueOnce(panel);
    const callbacks = {
      onMessage: vi.fn(),
      onActive: vi.fn(),
      onDispose: vi.fn(),
    };
    const workspaceState = {
      get: vi.fn(() => ({ controlSplitPercent: 61 })),
      update: vi.fn(() => Promise.resolve()),
    };
    const views = new KtcCodegenEditorViewController(extensionUri(), callbacks, workspaceState);
    views.show(model("file:///workspace/A.json", "A.json"));

    expect(panel.webview.html).toContain('"controlSplitPercent":61');
    panel.fireMessage({
      type: "codegenEditorLayout",
      toolId: "codegen",
      uri: "file:///workspace/A.json",
      layout: { controlSplitPercent: 99 },
    });
    expect(workspaceState.update).toHaveBeenCalledWith(
      "ktAutoCode.codegen.editorLayout.v1",
      { controlSplitPercent: 75 },
    );
    expect(callbacks.onMessage).not.toHaveBeenCalled();
  });
});
