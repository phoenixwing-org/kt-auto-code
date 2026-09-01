import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

const {
  createWebviewPanel,
  uriJoinPath,
  workspaceFs,
  showInformationMessage,
  showWarningMessage,
  FakeFileSystemError,
} = vi.hoisted(() => {
  class HoistedFileSystemError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  }
  return {
    createWebviewPanel: vi.fn(),
    uriJoinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
      fsPath: `/extension/${parts.join("/")}`,
      toString: () => `file:///extension/${parts.join("/")}`,
    })),
    workspaceFs: { stat: vi.fn(), rename: vi.fn() },
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    FakeFileSystemError: HoistedFileSystemError,
  };
});

vi.mock("vscode", () => ({
  ViewColumn: { Active: 1 },
  ProgressLocation: { Notification: 15 },
  FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
  FileSystemError: FakeFileSystemError,
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: uriJoinPath,
  },
  commands: { executeCommand: vi.fn() },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "/workspace/phoenix-dev-hub" } }],
    fs: workspaceFs,
  },
  window: {
    createWebviewPanel,
    showErrorMessage: vi.fn(),
    showInformationMessage,
    showWarningMessage,
  },
}));

import type * as vscode from "vscode";
import { KtcProjectRenameHost } from "../../projectRenameHost.js";
import type { KtcProjectRenameAnalysisReport, KtcProjectRenameViewState } from "./contracts.js";
import { KtcProjectRenameViewController } from "./viewController.js";

function fakePanel(): vscode.WebviewPanel {
  let disposeListener: (() => void) | undefined;
  return {
    viewColumn: 2,
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
    webview: {
      cspSource: "vscode-webview://project-rename",
      html: "",
      asWebviewUri: vi.fn((uri: { toString(): string }) => ({ toString: () => `webview:${uri.toString()}` })),
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
      postMessage: vi.fn(async () => true),
    },
  } as unknown as vscode.WebviewPanel;
}

describe("project rename analysis View", () => {
  beforeEach(() => {
    createWebviewPanel.mockReset();
    workspaceFs.stat.mockReset();
    workspaceFs.rename.mockReset();
    showInformationMessage.mockReset();
    showWarningMessage.mockReset();
  });

  it("复用单个独立 WebviewPanel，并加载受 CSP 约束的浏览器 bundle", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const extensionUri = { fsPath: "/extension" } as vscode.Uri;
    const controller = new KtcProjectRenameViewController(extensionUri, new KtcProjectRenameHost());

    controller.show();
    controller.show();

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.projectRenameAnalysis",
      "大型项目改名分析",
      { viewColumn: 1, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] },
    );
    expect(panel.reveal).toHaveBeenCalledTimes(2);
    expect(panel.webview.html).toContain("Content-Security-Policy");
    expect(panel.webview.html).toContain("project-rename-analysis.js");
    expect(panel.webview.html).toContain("command-header");
    expect(panel.webview.html).toContain("position: sticky");
    expect(panel.webview.html).toContain("分析目录");
    expect(panel.webview.html).toContain("执行改名");
    expect(panel.webview.html).toContain("结束任务");
    expect(panel.webview.html).toContain("重命名根目录…");
    expect(panel.webview.html.match(/<details[^>]*class="section"/gu)).toHaveLength(3);
    expect(panel.webview.html).toContain("data-section-action");
    expect(panel.webview.html).toContain("--pnw-workbench-border");
    expect(panel.webview.html).toContain("--pnw-control-hover-bg");
    expect(panel.webview.html).toContain("相关写法（仅提示）");
    expect(panel.webview.html).toContain("不会自动加入规则");
    expect(panel.webview.html).toContain("related-candidates-panel");
  });

  it("重复打开只聚焦现有任务，关闭后才用新目录创建任务", async () => {
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
    );

    controller.show("/workspace/project-a");
    const firstReceiver = vi.mocked(first.webview.onDidReceiveMessage).mock.calls[0]![0];
    firstReceiver({ type: "ready" });
    await vi.waitFor(() => expect(first.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({ root: "/workspace/project-a", sourceName: "project-a" }),
    })));

    controller.show("/workspace/project-b");
    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(first.reveal).toHaveBeenCalledTimes(2);
    expect(first.webview.postMessage).toHaveBeenCalledTimes(1);

    first.dispose();
    controller.show("/workspace/project-b");
    const secondReceiver = vi.mocked(second.webview.onDidReceiveMessage).mock.calls[0]![0];
    secondReceiver({ type: "ready" });
    await vi.waitFor(() => expect(second.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({ root: "/workspace/project-b", sourceName: "project-b" }),
    })));
    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("相关候选只会加入为默认关闭的显式规则", async () => {
    const source = await readFile(new URL("./viewEntry.ts", import.meta.url), "utf8");
    expect(source).toContain('add.textContent = "加入规则（默认关闭）"');
    expect(source).toContain('enabled: false');
    expect(source).toContain('target.textContent = "已加入（未启用）"');
  });

  it("根目录改名只发送报告版本，不信任 Webview 提供的路径", async () => {
    const source = await readFile(new URL("./viewEntry.ts", import.meta.url), "utf8");
    expect(source).toContain('type: "renameRoot", reportId: currentReportId');
    expect(source).not.toContain('type: "renameRoot", root:');
    expect(source).toContain('type: "apply", reportId: currentReportId');
    expect(source).toContain("reportDirty = true");
    expect(source).toContain("请先重新分析，再执行改名");
  });

  it("仅在外部根目录通过确认且目标不存在时执行单层改名", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    showWarningMessage.mockResolvedValue("重命名根目录");
    workspaceFs.stat
      .mockResolvedValueOnce({ type: 2 })
      .mockRejectedValueOnce(new FakeFileSystemError("missing", "FileNotFound"));
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
    );
    controller.show("/repos/phoenix-open-issue");
    const mutable = controller as unknown as {
      report: KtcProjectRenameAnalysisReport;
      state: KtcProjectRenameViewState;
    };
    mutable.report = fakeReport("/repos/phoenix-open-issue");
    mutable.state = {
      ...mutable.state,
      status: "done",
      report: {
        reportId: 7,
        rootSuggestion: {
          currentName: "phoenix-open-issue",
          suggestedName: "phoenix-issue",
          canRename: true,
        },
        summary: mutable.report.workspaceReport.summary,
        riskSummary: mutable.report.riskSummary,
        stats: mutable.report.stats,
        relatedCandidates: [],
        page: { reportId: 7, rows: [], offset: 0, totalRows: 0 },
      },
    };
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "renameRoot", reportId: 7 });

    await vi.waitFor(() => expect(workspaceFs.rename).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: "/repos/phoenix-open-issue" }),
      expect.objectContaining({ fsPath: "/repos/phoenix-issue" }),
      { overwrite: false },
    ));
    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({ root: "/repos/phoenix-issue", status: "idle", report: undefined }),
    })));
  });

  it("当前工作区根目录只保留建议，不执行改名", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
    );
    controller.show("/workspace/phoenix-dev-hub");
    (controller as unknown as { report: KtcProjectRenameAnalysisReport }).report = fakeReport(
      "/workspace/phoenix-dev-hub",
      "phoenix-dev-hub",
      "phoenix-hub",
    );
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "renameRoot", reportId: 7 });

    await vi.waitFor(() => expect(showWarningMessage).toHaveBeenCalledWith(expect.stringContaining("当前 VS Code 工作区")));
    expect(workspaceFs.rename).not.toHaveBeenCalled();
  });
});

function fakeReport(
  root: string,
  currentName = "phoenix-open-issue",
  suggestedName = "phoenix-issue",
): KtcProjectRenameAnalysisReport {
  return {
    reportId: 7,
    root,
    sourceName: currentName,
    targetName: suggestedName,
    rules: [],
    rootSuggestion: { currentName, suggestedName },
    workspaceReport: {
      root,
      applied: false,
      searchOnly: false,
      hits: [],
      summary: {
        rules: 0,
        matchedRules: 0,
        files: 0,
        directories: 0,
        textFiles: 0,
        replacements: 0,
        skipped: 0,
        errors: 0,
      },
    },
    assessments: {},
    riskSummary: { high: 0, medium: 0, low: 0 },
    stats: {
      scannedDirectories: 0,
      scannedFiles: 0,
      skippedBinaryFiles: 0,
      skippedLargeFiles: 0,
      skippedUnsupportedEncodingFiles: 0,
      truncated: false,
    },
    relatedCandidates: [],
  };
}
