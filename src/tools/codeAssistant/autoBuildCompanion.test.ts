import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
  outputShow: vi.fn(),
  outputLines: [] as string[],
  environmentValues: [] as unknown[],
  readProjectEnvironment: vi.fn(),
}));

vi.mock("vscode", () => {
  class Uri {
    static file(fsPath: string) { return new Uri(fsPath); }
    static joinPath(base: Uri, ...segments: string[]) { return new Uri([base.fsPath, ...segments].join("/")); }
    constructor(readonly fsPath: string) {}
    toString() { return `file://${this.fsPath}`; }
  }
  return {
    Uri,
    ViewColumn: { Active: 1 },
    window: {
      createWebviewPanel: mocks.createWebviewPanel,
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn((line: string) => mocks.outputLines.push(line)),
        show: mocks.outputShow,
        dispose: vi.fn(),
      })),
      showWarningMessage: vi.fn(),
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
    },
  };
});

vi.mock("../../projectEnvironment.js", () => ({
  ktcReadProjectEnvironment: mocks.readProjectEnvironment,
}));

import * as vscode from "vscode";
import type { KtcEditorPrimaryCompanionSnapshot } from "../../core/editorPrimaryCompanionContracts.js";
import { KtcAutoBuildViewController } from "./autoBuildViewController.js";

interface FakePanel extends vscode.WebviewPanel {
  fireViewState(active: boolean, visible: boolean): void;
  fireMessage(message: unknown): void;
}

function fakePanel(): FakePanel {
  let disposeListener: (() => void) | undefined;
  let viewStateListener: ((event: vscode.WebviewPanelOnDidChangeViewStateEvent) => void) | undefined;
  let messageListener: ((message: unknown) => void) | undefined;
  const panel = {
    active: true,
    visible: true,
    viewColumn: 1,
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    fireViewState(active: boolean, visible: boolean) {
      panel.active = active;
      panel.visible = visible;
      viewStateListener?.({ webviewPanel: panel } as unknown as vscode.WebviewPanelOnDidChangeViewStateEvent);
    },
    fireMessage(message: unknown) { messageListener?.(message); },
    onDidChangeViewState: vi.fn((listener) => {
      viewStateListener = listener;
      return { dispose: vi.fn() };
    }),
    onDidDispose: vi.fn((listener) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
    webview: {
      cspSource: "test-webview",
      html: "",
      asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
      onDidReceiveMessage: vi.fn((listener) => {
        messageListener = listener;
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn(async () => true),
    },
  };
  return panel as unknown as FakePanel;
}

function memory(): Pick<vscode.Memento, "get" | "update"> {
  const values = new Map<string, unknown>();
  return {
    get: (key: string) => values.get(key),
    update: async (key: string, value: unknown) => { values.set(key, value); },
  };
}

describe("自动编译 Primary companion", () => {
  beforeEach(() => {
    mocks.createWebviewPanel.mockReset();
    mocks.outputShow.mockClear();
    mocks.outputLines.length = 0;
    mocks.environmentValues = [];
    mocks.readProjectEnvironment.mockReset();
    mocks.readProjectEnvironment.mockImplementation(async () => ({ values: mocks.environmentValues }));
  });

  it("发布 ready、焦点和 dispose 生命周期，并校验 Primary 动作 token", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );

    await controller.show("/workspace/project");
    expect(snapshots.at(-1)).toMatchObject({
      toolId: "autoBuild",
      lifecycle: "active",
      ready: false,
    });

    panel.fireMessage({ type: "ready" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const ready = snapshots.at(-1)!;
    expect(ready.summary).toEqual(expect.arrayContaining([
      { label: "目录", value: "/workspace/project" },
      { label: "平台", value: expect.any(String) },
    ]));

    await expect(controller.runPrimaryCompanionAction({
      panelId: "wrong-panel",
      toolId: "autoBuild",
      sessionId: ready.sessionId,
      revision: ready.revision,
      actionId: "openOutput",
    })).resolves.toBe(false);
    await expect(controller.runPrimaryCompanionAction({
      panelId: ready.panelId,
      toolId: "autoBuild",
      sessionId: ready.sessionId,
      revision: ready.revision,
      actionId: "openOutput",
    })).resolves.toBe(true);
    expect(mocks.outputShow).toHaveBeenCalledWith(true);

    panel.fireViewState(false, true);
    expect(snapshots.at(-1)?.lifecycle).toBe("visible");
    panel.dispose();
    expect(snapshots.at(-1)).toMatchObject({ lifecycle: "disposed", ready: false });
    expect(snapshots.at(-1)?.actions.every((action) => action.enabled === false)).toBe(true);
  });

  it("旧 panel 的 ready 异步返回与后续消息不会投递或污染重开的新会话", async () => {
    const first = fakePanel();
    const second = fakePanel();
    mocks.createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    let finishOldEnvironment = (_value: unknown): void => undefined;
    mocks.readProjectEnvironment
      .mockImplementationOnce(() => new Promise((resolve) => { finishOldEnvironment = resolve; }))
      .mockResolvedValueOnce({ values: [{ key: "customRoot", value: "/new/root" }] });
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );

    await controller.show("/workspace/old");
    first.fireMessage({ type: "ready" });
    await vi.waitFor(() => expect(mocks.readProjectEnvironment).toHaveBeenCalledTimes(1));
    first.dispose();

    await controller.show("/workspace/new");
    const newSession = snapshots.at(-1)!.sessionId;
    second.fireMessage({ type: "ready" });
    await vi.waitFor(() => expect(second.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "configuration",
      configuration: expect.objectContaining({ workingDirectory: "/workspace/new", rootDirectory: "/new/root" }),
    })));

    first.fireMessage({ type: "stop" });
    finishOldEnvironment({ values: [{ key: "customRoot", value: "/old/root" }] });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(snapshots.at(-1)).toMatchObject({
      sessionId: newSession,
      lifecycle: "active",
      ready: true,
      summary: expect.arrayContaining([{ label: "目录", value: "/workspace/new" }]),
    });
    expect(second.webview.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
      configuration: expect.objectContaining({ rootDirectory: "/old/root" }),
    }));
    expect(mocks.outputLines).not.toContain("[Auto Build] action received: stop");
  });

  it("关闭运行中的 View 发布错误终态，不遗留 running tombstone", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    const mutable = controller as unknown as {
      companionReady: boolean;
      companionStatus: "running";
      companionMessage: string;
    };
    mutable.companionReady = true;
    mutable.companionStatus = "running";
    mutable.companionMessage = "Command failed: git -C /Users/example/private fetch https://user:test-token@example.com/repo.git";

    panel.dispose();

    expect(snapshots.at(-1)).toMatchObject({
      lifecycle: "disposed",
      ready: false,
      status: "error",
      message: "任务遇到问题；请在右侧 View 或 Output 中查看详情。",
    });
    expect(snapshots.at(-1)?.message).not.toContain("/Users/example");
    expect(snapshots.at(-1)?.message).not.toContain("user:test-token");
    expect(snapshots.at(-1)?.message).not.toContain("Command failed");
    expect(snapshots.at(-1)?.actions.every((action) => !action.enabled)).toBe(true);
  });
});
