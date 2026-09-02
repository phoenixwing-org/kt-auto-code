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
import { KtcRenameHistoryStore } from "../../core/renameHistory.js";
import type { WorkspaceRenameHit } from "../../core/workspaceRename.js";
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
      "项目改名",
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
    expect(panel.webview.html).toContain("预览差异…");
    expect(panel.webview.html).toContain("结束任务");
    expect(panel.webview.html).toContain("重命名根目录…");
    expect(panel.webview.html.match(/<details[^>]*class="section"/gu)).toHaveLength(3);
    expect(panel.webview.html).toContain("data-section-action");
    expect(panel.webview.html).toContain("--pnw-workbench-border");
    expect(panel.webview.html).toContain("--pnw-control-hover-bg");
    expect(panel.webview.html).toContain("相关写法（仅提示）");
    expect(panel.webview.html).toContain("不会自动加入规则");
    expect(panel.webview.html).toContain("related-candidates-panel");
    expect(panel.webview.html).toContain('id="rename-history"');
    expect(panel.webview.html).toContain('id="delete-history"');
    expect(panel.webview.html).toContain('id="clear-history"');
    expect(panel.webview.html).toContain('class="header-history"');
    expect(panel.webview.html).not.toContain('class="quick-actions"');
    expect(panel.webview.html).toContain('默认：文本 · 文件名 · 文件夹名 · UTF-8');
    expect(panel.webview.html).toContain('id="toggle-rules"');
    expect(panel.webview.html).toContain('aria-label="取消勾选全部规则">全不选</button>');
    expect(panel.webview.html).toContain('.scheme-grid,.rule { display: grid;');
    expect(panel.webview.html).toContain('id="profile"');
    expect(panel.webview.html).toContain('class="profile-panel"');
    expect(panel.webview.html).toContain('class="profile-actions"');
    expect(panel.webview.html).toContain('aria-label="添加自定义规则">+ 规则</button>');
    expect(panel.webview.html).toContain('aria-label="选择常用规则">常用</button>');
    expect(panel.webview.html).toContain('aria-label="选择 CAA 规则">CAA</button>');
    expect(panel.webview.html).toContain("项目规则档案");
    expect(panel.webview.html).toContain('title="保存到当前项目 .phoenix/search-replace.json">保存</button>');
    expect(panel.webview.html).toContain("CAA / C++ 源前缀（可选）");
    expect(panel.webview.html).toContain('id="rule-picker"');
    expect(panel.webview.html).toContain('class="col-action"');
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

  it("从 Primary 打开时带入已填写名称与启用的简单规则，但不自动分析", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
    );

    controller.show({
      root: "/workspace/phoenix-dev-hub",
      sourceName: "phoenix-dev-hub",
      targetName: "phoenix-hub",
      rules: [
        { search: "phoenix-dev-hub", replace: "phoenix-hub", enabled: true },
        { search: "PHOENIXDEVHUB", replace: "PHOENIXHUB", enabled: true },
      ],
    });
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "ready" });

    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({
        root: "/workspace/phoenix-dev-hub",
        status: "idle",
        sourceName: "phoenix-dev-hub",
        targetName: "phoenix-hub",
        rules: expect.arrayContaining([
          expect.objectContaining({ style: "kebab", search: "phoenix-dev-hub", replace: "phoenix-hub", enabled: true }),
          expect.objectContaining({ style: "custom", search: "PHOENIXDEVHUB", replace: "PHOENIXHUB", enabled: true }),
        ]),
      }),
    })));
  });

  it("相关候选只会加入为默认关闭的显式规则", async () => {
    const source = await readFile(new URL("./viewEntry.ts", import.meta.url), "utf8");
    expect(source).toContain('add.textContent = "加入规则（默认关闭）"');
    expect(source).toContain('enabled: false');
    expect(source).toContain('target.textContent = "已加入（未启用）"');
  });

  it("按分析目录恢复本机完整项目方案，不信任 Webview 回传规则", async () => {
    const values = new Map<string, unknown>();
    const history = new KtcRenameHistoryStore({
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key: string, value: unknown) => { values.set(key, value); },
    } as never);
    const snapshot = await history.rememberProjectPlan("/workspace/project-a", {
      sourceName: "Phoenix Open Issue",
      targetName: "Phoenix Issue",
      sourcePrefix: "POI",
      targetPrefix: "PI",
      rules: [{ id: "kebab", style: "kebab", search: "phoenix-open-issue", replace: "phoenix-issue", enabled: true }],
    });
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(history),
    );
    controller.show("/workspace/project-a");
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "loadProjectHistory", id: snapshot.projectPlans[0]!.id });

    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({
        sourceName: "Phoenix Open Issue",
        targetName: "Phoenix Issue",
        sourcePrefix: "POI",
        rules: [expect.objectContaining({ search: "phoenix-open-issue", enabled: true })],
      }),
    })));
  });

  it("可删除所选记录，并在确认后清空全部本机历史但不改项目档案", async () => {
    const values = new Map<string, unknown>();
    const history = new KtcRenameHistoryStore({
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key: string, value: unknown) => { values.set(key, value); },
    } as never);
    await history.rememberPair("Sensitive Old", "Safe New");
    await history.rememberProjectPlan("/workspace/project-a", {
      sourceName: "Project Secret",
      targetName: "Project Public",
      sourcePrefix: "",
      targetPrefix: "",
      rules: [],
    });
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(history),
    );
    controller.show("/workspace/project-a");
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "deleteHistory", entry: { kind: "pair", source: "Sensitive Old", target: "Safe New" } });
    await vi.waitFor(() => expect(history.snapshot("/workspace/project-a").pairs
      .some((entry) => entry.source === "Sensitive Old")).toBe(false));

    showWarningMessage.mockResolvedValue("清空本机历史");
    receiver({ type: "clearHistory" });
    await vi.waitFor(() => expect(history.snapshot("/workspace/project-a"))
      .toEqual({ pairs: [], projectPlans: [] }));
    expect(showWarningMessage).toHaveBeenCalledWith(
      "清空全部本机改名历史？",
      expect.objectContaining({ modal: true }),
      "清空本机历史",
    );
  });

  it("根目录改名只发送报告版本，不信任 Webview 提供的路径", async () => {
    const source = await readFile(new URL("./viewEntry.ts", import.meta.url), "utf8");
    expect(source).toContain('type: "renameRoot", reportId: currentReportId');
    expect(source).not.toContain('type: "renameRoot", root:');
    expect(source).toContain('type: "apply", reportId: currentReportId');
    expect(source).toContain("reportDirty = true");
    expect(source).toContain("请先重新分析，再执行改名");
  });

  it("文本行只提交报告和行标识，由 Host 从冻结报告生成差异", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const host = new KtcProjectRenameHost();
    const openTextDiff = vi.spyOn(host, "openTextDiff").mockResolvedValue();
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      host,
    );
    controller.show("/workspace/project-a");
    const report = fakeReport("/workspace/project-a");
    (report.workspaceReport.hits as WorkspaceRenameHit[]).push({
      id: "text:src/index.ts",
      relativePath: "src/index.ts",
      fullPath: "/workspace/project-a/src/index.ts",
      originalFullPath: "/workspace/project-a/src/index.ts",
      plannedFullPath: "/workspace/project-a/src/index.ts",
      level: "text",
      occurrences: 1,
      status: "preview",
    });
    (controller as unknown as { report: KtcProjectRenameAnalysisReport }).report = report;
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "previewDiff", reportId: 7, rowId: "text:src/index.ts" });

    await vi.waitFor(() => expect(openTextDiff).toHaveBeenCalledWith(report, "text:src/index.ts"));
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
