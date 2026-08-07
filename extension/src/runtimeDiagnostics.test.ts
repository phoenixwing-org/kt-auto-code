import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
  showInformationMessage: vi.fn(),
  showSaveDialog: vi.fn(),
  writeText: vi.fn(),
  writeFile: vi.fn(),
  getCommands: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock("vscode", () => ({
  version: "1.99.0-test",
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  ViewColumn: { Active: 1 },
  Uri: { file: vi.fn((path: string) => ({ scheme: "file", fsPath: path, toString: () => `file://${path}` })) },
  window: {
    createWebviewPanel: host.createWebviewPanel,
    showInformationMessage: host.showInformationMessage,
    showSaveDialog: host.showSaveDialog,
  },
  env: { clipboard: { writeText: host.writeText } },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/private/workspace" } }],
    fs: { writeFile: host.writeFile },
  },
  extensions: { all: [{ id: "one" }, { id: "two" }] },
  commands: { getCommands: host.getCommands, executeCommand: host.executeCommand },
}));

import * as vscode from "vscode";
import {
  KtcRuntimeDiagnosticsPanel,
  ktcCaptureRuntimeDiagnostics,
  type KtcRuntimeDiagnosticsSystemSource,
  type KtcSidebarRuntimeDiagnostics,
} from "./runtimeDiagnostics.js";

interface FakePanel extends vscode.WebviewPanel {
  fireMessage(message: unknown): void;
  fireDispose(): void;
}

function sidebar(): KtcSidebarRuntimeDiagnostics {
  return {
    resolvedViews: 2,
    ribbonResolved: true,
    modulePanelResolved: true,
    ribbonVisible: true,
    modulePanelVisible: true,
    openToolCount: 1,
    openToolIds: ["git"],
    retainedToolStateCount: 3,
    moduleBlockProviderCount: 0,
  };
}

function systemSource(): KtcRuntimeDiagnosticsSystemSource & { memoryUsage: ReturnType<typeof vi.fn> } {
  let capture = 0;
  return {
    now: () => new Date(`2026-07-29T08:00:0${capture}.000Z`),
    snapshotId: () => `snapshot-${++capture}`,
    memoryUsage: vi.fn(() => ({
      rss: capture * 1024 * 1024,
      heapTotal: 8 * 1024 * 1024,
      heapUsed: 4 * 1024 * 1024,
      external: 1024,
      arrayBuffers: 512,
    })),
    pid: () => 4321,
    uptime: () => 20,
    nodeVersion: () => "v22.test",
    vscodeVersion: () => "1.99.0-test",
    workspaceFolderCount: () => 1,
    installedExtensionCount: () => 2,
  };
}

function fakePanel(): FakePanel {
  let messageListener: ((message: unknown) => void) | undefined;
  let disposeListener: (() => void) | undefined;
  const panel = {
    title: "",
    viewColumn: 1,
    visible: true,
    active: true,
    webview: {
      html: "",
      options: {},
      cspSource: "test",
      onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => {
        messageListener = listener;
        return { dispose: vi.fn() };
      }),
    },
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
    fireMessage(message: unknown) { messageListener?.(message); },
    fireDispose() { disposeListener?.(); },
  };
  return panel as unknown as FakePanel;
}

describe("runtime diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    host.writeText.mockResolvedValue(undefined);
    host.writeFile.mockResolvedValue(undefined);
    host.showSaveDialog.mockResolvedValue(undefined);
    host.getCommands.mockResolvedValue([]);
    host.executeCommand.mockResolvedValue(undefined);
  });

  it("明确标记 Extension Host 内存边界并仅投影 counts-only 插件状态", () => {
    const report = ktcCaptureRuntimeDiagnostics({
      extensionVersion: "0.6.1",
      extensionMode: vscode.ExtensionMode.Development,
      sidebar: sidebar(),
      codegen: {
        editorPanels: 5,
        batchReportPanelOpen: true,
        sessions: 3,
        activeSessions: 1,
        cleanSessions: 1,
        dirtySessions: 1,
        conflictSessions: 1,
        deletedSessions: 0,
        preflightTasks: 1,
        runningSessionOperations: 2,
        workspaceOperationActive: false,
        batchApplyActive: false,
        watchServiceActive: true,
        fileSystemWatcherCount: 2,
      },
      git: {
        catalogEntries: 4,
        workspaceRepositories: 3,
        userRepositories: 1,
        loadedRepositories: 1,
        selectedCommitCount: 6,
        runningWriteOperations: 0,
        summaryOpen: true,
        squashDraftOpen: false,
      },
      diagnosticsPanelOpen: true,
    }, systemSource());

    expect(report).toMatchObject({
      kind: "kt-auto-code.runtime-diagnostics",
      schemaVersion: 1,
      extension: { version: "0.6.1", mode: "development" },
      scope: {
        memoryOwner: "extension-host-process",
        includesOtherExtensions: true,
        includesWebviewRenderer: false,
        perExtensionMemoryAvailable: false,
      },
      extensionHost: {
        pid: 4321,
        memoryBytes: { heapUsed: 4 * 1024 * 1024 },
      },
      pluginResources: {
        workspaceFolderCount: 1,
        installedExtensionCount: 2,
        diagnosticsPanelOpen: true,
        sidebar: { openToolIds: ["git"], retainedToolStateCount: 3 },
        codegen: { sessions: 3, editorPanels: 5, fileSystemWatcherCount: 2 },
        git: { catalogEntries: 4, selectedCommitCount: 6, userRepositories: 1 },
      },
    });
    const json = JSON.stringify(report);
    expect(json).not.toContain("/private/workspace");
    expect(json).not.toContain("remoteUrl");
    expect(json).not.toContain("commitMessage");
  });

  it("复用一个不保留隐藏上下文的 Panel，且只在初开或手动刷新时采集", async () => {
    const panel = fakePanel();
    host.createWebviewPanel.mockReturnValue(panel);
    const source = systemSource();
    const diagnostics = new KtcRuntimeDiagnosticsPanel({
      extensionVersion: "0.6.1",
      extensionMode: vscode.ExtensionMode.Test,
      getSidebarSnapshot: sidebar,
      source,
    });

    diagnostics.open();
    expect(host.createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.runtimeDiagnostics",
      "KT Auto Code · 运行诊断",
      { viewColumn: 1, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [] },
    );
    expect(source.memoryUsage).toHaveBeenCalledTimes(1);
    expect(panel.webview.html).toContain("snapshot-1");
    expect(panel.webview.html).toContain("4.0 MiB");

    diagnostics.open();
    expect(host.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panel.reveal).toHaveBeenCalledWith(1, false);
    expect(source.memoryUsage).toHaveBeenCalledTimes(1);

    panel.fireMessage({ type: "refresh" });
    expect(source.memoryUsage).toHaveBeenCalledTimes(2);
    expect(panel.webview.html).toContain("snapshot-2");

    panel.fireMessage({ type: "copyJson" });
    await vi.waitFor(() => expect(host.writeText).toHaveBeenCalledOnce());
    expect(host.writeText.mock.calls[0]?.[0]).toContain('"snapshotId": "snapshot-2"');
    expect(source.memoryUsage).toHaveBeenCalledTimes(2);

    diagnostics.dispose();
    expect(panel.dispose).toHaveBeenCalledOnce();
  });

  it("保存当前快照并对非公开进程资源管理器命令做可用性降级", async () => {
    const panel = fakePanel();
    const target = { scheme: "file", fsPath: "/chosen/diagnostics.json" };
    host.createWebviewPanel.mockReturnValue(panel);
    host.showSaveDialog.mockResolvedValue(target);
    const diagnostics = new KtcRuntimeDiagnosticsPanel({
      extensionVersion: "0.6.1",
      extensionMode: vscode.ExtensionMode.Production,
      getSidebarSnapshot: sidebar,
      source: systemSource(),
    });
    diagnostics.open();

    panel.fireMessage({ type: "saveJson" });
    await vi.waitFor(() => expect(host.writeFile).toHaveBeenCalledOnce());
    expect(host.writeFile.mock.calls[0]?.[0]).toBe(target);
    expect(Buffer.from(host.writeFile.mock.calls[0]?.[1]).toString("utf8")).toContain("snapshot-1");

    host.getCommands.mockResolvedValue(["workbench.action.openProcessExplorer"]);
    panel.fireMessage({ type: "openProcessExplorer" });
    await vi.waitFor(() => expect(host.executeCommand).toHaveBeenCalledWith("workbench.action.openProcessExplorer"));

    host.getCommands.mockResolvedValue([]);
    panel.fireMessage({ type: "openProcessExplorer" });
    await vi.waitFor(() => expect(host.showInformationMessage).toHaveBeenCalledWith(
      "请使用“帮助 → 打开进程资源管理器”查看 Window、Extension Host 与 Webview 进程内存。",
    ));
  });
});
