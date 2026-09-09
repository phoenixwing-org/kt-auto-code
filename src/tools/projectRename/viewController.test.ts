import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

const {
  createWebviewPanel,
  uriJoinPath,
  workspaceFs,
  withProgress,
  analyzeProjectRename,
  ProjectRenameCancelledError,
  showInformationMessage,
  showWarningMessage,
  showOpenDialog,
  workspaceFolders,
  executeCommand,
  FakeFileSystemError,
} = vi.hoisted(() => {
  class HoistedFileSystemError extends Error {
    constructor(message: string, readonly code: string) {
      super(message);
    }
  }
  class HoistedProjectRenameCancelledError extends Error {
    constructor() {
      super("项目改名分析已取消");
      this.name = "KtcProjectRenameCancelledError";
    }
  }
  return {
    createWebviewPanel: vi.fn(),
    uriJoinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
      fsPath: `/extension/${parts.join("/")}`,
      toString: () => `file:///extension/${parts.join("/")}`,
    })),
    workspaceFs: { stat: vi.fn(), rename: vi.fn() },
    withProgress: vi.fn(),
    analyzeProjectRename: vi.fn(),
    ProjectRenameCancelledError: HoistedProjectRenameCancelledError,
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showOpenDialog: vi.fn(),
    workspaceFolders: [{ uri: { fsPath: "/workspace/phoenix-dev-hub" } }],
    executeCommand: vi.fn(),
    FakeFileSystemError: HoistedFileSystemError,
  };
});

vi.mock("./analyzer.js", () => ({
  ktcAnalyzeProjectRename: analyzeProjectRename,
  KtcProjectRenameCancelledError: ProjectRenameCancelledError,
}));

vi.mock("vscode", () => ({
  ViewColumn: { Active: 1 },
  ProgressLocation: { Notification: 15 },
  FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
  FileSystemError: FakeFileSystemError,
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: uriJoinPath,
  },
  commands: { executeCommand },
  workspace: {
    workspaceFolders,
    fs: workspaceFs,
  },
  window: {
    createWebviewPanel,
    withProgress,
    showErrorMessage: vi.fn(),
    showInformationMessage,
    showWarningMessage,
    showOpenDialog,
  },
}));

import type * as vscode from "vscode";
import { KtcRenameHistoryStore } from "../../core/renameHistory.js";
import type { WorkspaceRenameHit } from "../../core/workspaceRename.js";
import { KtcProjectRenameHost } from "../../projectRenameHost.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import type { KtcProjectRenameAnalysisReport, KtcProjectRenameViewState } from "./contracts.js";
import {
  KtcProjectRenameViewController,
  type KtcProjectRenameCompanionEvent,
} from "./viewController.js";

interface FakeProjectRenamePanel extends vscode.WebviewPanel {
  fireViewState(active: boolean, visible: boolean): void;
}

function fakePanel(): FakeProjectRenamePanel {
  let disposeListener: (() => void) | undefined;
  let viewStateListener: ((event: vscode.WebviewPanelOnDidChangeViewStateEvent) => void) | undefined;
  const panel = {
    active: true,
    visible: true,
    viewColumn: 2,
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    fireViewState(active: boolean, visible: boolean): void {
      panel.active = active;
      panel.visible = visible;
      viewStateListener?.({ webviewPanel: panel } as vscode.WebviewPanelOnDidChangeViewStateEvent);
    },
    onDidChangeViewState: vi.fn((listener: (event: vscode.WebviewPanelOnDidChangeViewStateEvent) => void) => {
      viewStateListener = listener;
      return { dispose: vi.fn() };
    }),
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
  } as unknown as Omit<FakeProjectRenamePanel, "active" | "visible"> & { active: boolean; visible: boolean };
  return panel as FakeProjectRenamePanel;
}

describe("project rename analysis View", () => {
  beforeEach(() => {
    createWebviewPanel.mockReset();
    workspaceFs.stat.mockReset();
    workspaceFs.rename.mockReset();
    withProgress.mockReset();
    analyzeProjectRename.mockReset();
    showInformationMessage.mockReset();
    showWarningMessage.mockReset();
    showOpenDialog.mockReset();
    workspaceFolders.splice(0, workspaceFolders.length, { uri: { fsPath: "/workspace/phoenix-dev-hub" } });
    executeCommand.mockReset();
  });

  it("复用单个独立 WebviewPanel，并用共享 Right Shell 加载受 CSP 约束的浏览器 bundle", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const extensionUri = { fsPath: "/extension" } as vscode.Uri;
    const controller = new KtcProjectRenameViewController(extensionUri, new KtcProjectRenameHost());

    controller.show();
    controller.show();

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.projectRenameAnalysis",
      ktcRequireToolRegistration("projectRename").title,
      { viewColumn: 1, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] },
    );
    expect(panel.reveal).toHaveBeenCalledTimes(2);
    expect(panel.webview.html).toContain("Content-Security-Policy");
    expect(panel.webview.html).toContain("ktc-right-view-shell.js");
    expect(panel.webview.html).toContain("project-rename-analysis.js");
    expect(panel.webview.html).toContain('<ktc-right-view-shell id="right-shell">');
    expect(panel.webview.html).toContain('class="header-actions" slot="actions"');
    expect(panel.webview.html).toContain('class="analysis-context" hidden><strong>分析目录</strong><span id="root"');
    expect(panel.webview.html).not.toContain("command-header");
    expect(panel.webview.html).toMatch(/body\s*\{[^}]*margin:\s*0;[^}]*padding:\s*0;[^}]*overflow:\s*hidden;/u);
    expect(panel.webview.html).toMatch(/ktc-right-view-shell\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/u);
    expect(panel.webview.html).toMatch(/main\s*\{[^}]*max-width:\s*1240px;[^}]*padding:\s*8px;/u);
    expect(panel.webview.html.indexOf("ktc-right-view-shell.js")).toBeLessThan(
      panel.webview.html.indexOf("project-rename-analysis.js"),
    );
    expect(panel.webview.html).toMatch(/th\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/u);
    expect(panel.webview.html).toMatch(/\.col-action\s*\{[^}]*position:\s*sticky;[^}]*right:\s*0;/u);
    expect(panel.webview.html).toMatch(/\.results\s*\{[^}]*max-height:\s*min\(60vh,\s*720px\);[^}]*overflow:\s*auto;/u);
    expect(panel.webview.html).toMatch(/\.header-actions\s*\{[^}]*overflow-x:\s*auto;/u);
    expect(panel.webview.html).toContain(".results:focus-visible");
    expect(panel.webview.html).toContain('class="results" role="region" aria-label="项目改名命中结果" tabindex="0"');
    expect(panel.webview.html).toContain("var(--vscode-button-border, var(--vscode-contrastBorder, transparent))");
    expect(panel.webview.html).toContain("box-shadow: -1px 0 var(--vscode-contrastBorder, var(--vscode-panel-border, transparent))");
    expect(panel.webview.html).toMatch(/th,td \{[^}]*--vscode-contrastBorder/u);
    expect(panel.webview.html).toMatch(/\.section \{[^}]*--vscode-contrastBorder/u);
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
    expect(panel.webview.html).toContain('.section-title .scope-note { min-width: 0; flex: 1 1 160px; overflow: hidden;');
    expect(panel.webview.html).toContain('.section-title-actions { display: inline-flex; min-width: 0; max-width: 100%; flex: 0 0 auto;');
    expect(panel.webview.html).toContain('justify-content: flex-end; gap: 5px; margin-left: auto; flex-wrap: wrap;');
    const schemeActions = panel.webview.html.slice(
      panel.webview.html.indexOf('<span class="section-title-actions">'),
      panel.webview.html.indexOf('</span></summary><div class="body">'),
    );
    expect(schemeActions).toMatch(/id="add-rule"[\s\S]*id="common-rules"[\s\S]*id="caa-rules"[\s\S]*id="toggle-rules"[\s\S]*id="derive"/u);
    expect(panel.webview.html).toContain('.scheme-table-row,.rule { display: grid;');
    expect(panel.webview.html).toContain('aria-label="改名方案表格"');
    expect(panel.webview.html).toContain('<span role="columnheader">启用</span><span role="columnheader">类型</span><span role="columnheader">原来</span><span role="columnheader">目标</span><span role="columnheader">操作</span>');
    expect(panel.webview.html).toContain('id="profile"');
    expect(panel.webview.html).toContain('class="profile-panel"');
    expect(panel.webview.html).toContain('id="profile-panel" class="profile-panel" hidden');
    expect(panel.webview.html).toContain('aria-label="添加自定义规则">+ 规则</button>');
    expect(panel.webview.html).toContain('aria-label="选择常用规则">常用</button>');
    expect(panel.webview.html).toContain('aria-label="选择 CAA 规则">CAA</button>');
    expect(panel.webview.html).toContain("项目规则档案");
    expect(panel.webview.html).toContain('title="保存到当前项目 .phoenix/search-replace.json">保存</button>');
    expect(panel.webview.html).toContain('aria-label="原前缀（可选）"');
    expect(panel.webview.html).toContain("例如 Pnx / KTC");
    expect(panel.webview.html).toContain('id="rule-picker"');
    expect(panel.webview.html).toContain('class="col-action"');
    const entrySource = await readFile(new URL("./viewEntry.ts", import.meta.url), "utf8");
    expect(entrySource).toContain('const rightShell = ktcRequiredElement<KtcRightViewShell>("right-shell")');
    expect(entrySource).toContain('rightShell.model = { title: rightShellTitle, contextPath: state.root ?? "" }');
    expect(entrySource).toContain('ktcRequireToolRegistration("projectRename").title');
    expect(entrySource).not.toContain('rightShell.model = { title: "项目改名" };');
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
    firstReceiver({
      type: "derive",
      sourceName: "stale-project",
      targetName: "must-not-win",
      sourcePrefix: "",
      targetPrefix: "",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(second.webview.postMessage).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it("已绑定目录禁用 Primary 选择且拒绝旧 Right chooseRoot 消息", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri, new KtcProjectRenameHost(),
    );
    controller.show("/workspace/project-a");
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "ready" });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.ready).toBe(true));
    const snapshot = controller.getCompanionSnapshot()!;
    expect(snapshot.actions.find(({ id }) => id === "chooseRoot"))
      .toMatchObject({ enabled: false, disabledReason: expect.stringContaining("目录已固定") });
    await expect(controller.runCompanionAction({
      toolId: "projectRename", panelId: snapshot.panelId, sessionId: snapshot.sessionId,
      revision: snapshot.revision, actionId: "chooseRoot",
    })).resolves.toMatchObject({ accepted: false, reason: "action-unavailable" });
    receiver({ type: "chooseRoot" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(showOpenDialog).not.toHaveBeenCalled();
    expect(controller.getCompanionSnapshot()?.primary).toMatchObject({ model: { root: "/workspace/project-a" } });
  });

  it("无工作区启动可选择一次目录，迟到的第二次选择不能覆盖已绑定根", async () => {
    workspaceFolders.splice(0);
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri, new KtcProjectRenameHost(),
    );
    controller.show();
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "ready" });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.ready).toBe(true));
    expect(controller.getCompanionSnapshot()?.actions.find(({ id }) => id === "chooseRoot")?.enabled).toBe(true);
    let finishSecond!: (value: { fsPath: string }[]) => void;
    showOpenDialog.mockResolvedValueOnce([{ fsPath: "/workspace/first" }])
      .mockImplementationOnce(() => new Promise((resolve) => { finishSecond = resolve; }));
    receiver({ type: "chooseRoot" });
    receiver({ type: "chooseRoot" });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.primary).toMatchObject({ model: { root: "/workspace/first" } }));
    finishSecond([{ fsPath: "/workspace/late" }]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(controller.getCompanionSnapshot()?.primary).toMatchObject({ model: { root: "/workspace/first" } });
    expect(controller.getCompanionSnapshot()?.actions.find(({ id }) => id === "chooseRoot")?.enabled).toBe(false);
    expect(workspaceFolders).toHaveLength(0);
  });

  it("空目录选择期间关闭 Right，迟到选择不污染重新打开的任务", async () => {
    workspaceFolders.splice(0);
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri, new KtcProjectRenameHost(),
    );
    controller.show();
    let finish!: (value: { fsPath: string }[]) => void;
    showOpenDialog.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const receiver = vi.mocked(first.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "chooseRoot" });
    await vi.waitFor(() => expect(showOpenDialog).toHaveBeenCalledTimes(1));
    first.dispose();
    controller.show("/workspace/new-task");
    finish([{ fsPath: "/workspace/old-choice" }]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(controller.getCompanionSnapshot()?.primary).toMatchObject({ model: { root: "/workspace/new-task" } });
  });

  it("向 Primary 发布可识别的创建、激活、状态与关闭生命周期", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const events: KtcProjectRenameCompanionEvent[] = [];
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
      { onCompanionEvent: (event) => events.push(event) },
    );

    controller.show("/workspace/project-a");
    expect(events.map((event) => event.reason)).toEqual(["created", "shown"]);
    expect(events[0]?.snapshot).toMatchObject({
      toolId: "projectRename",
      lifecycle: "active",
      revision: 0,
      ready: false,
      summary: expect.arrayContaining([
        { label: "目录", value: "/workspace/project-a" },
        { label: "改名", value: "project-a → —" },
      ]),
      primary: {
        kind: "projectRename",
        model: {
          root: "/workspace/project-a",
          rootName: "project-a",
          rootParent: "/workspace",
        },
      },
    });
    expect(events[0]?.snapshot).not.toHaveProperty("root");
    expect(events[0]?.snapshot).not.toHaveProperty("sourceName");
    expect(events[0]?.snapshot).not.toHaveProperty("targetName");
    expect(events[0]?.snapshot).not.toHaveProperty("title");
    expect(events[0]?.snapshot.panelId).toMatch(/^projectRename-panel-/u);
    expect(events[0]?.snapshot.sessionId).toMatch(/^projectRename-session-/u);

    panel.fireViewState(false, true);
    panel.fireViewState(false, false);
    panel.fireViewState(true, true);
    expect(events.slice(-3).map((event) => event.snapshot.lifecycle))
      .toEqual(["visible", "open-inactive", "active"]);

    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "ready" });
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({
      reason: "state",
      snapshot: { revision: 1, status: "idle", projectStatus: "idle", ready: true },
    }));
    const live = controller.getCompanionSnapshot()!;

    panel.dispose();
    expect(events.at(-1)).toMatchObject({
      reason: "disposed",
      snapshot: {
        sessionId: live.sessionId,
        revision: live.revision + 1,
        lifecycle: "disposed",
        ready: false,
      },
    });
    expect(events.at(-1)?.snapshot.actions.every((action) => action.enabled === false)).toBe(true);
    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: live.panelId,
      sessionId: live.sessionId,
      revision: live.revision,
      actionId: "reveal",
    })).resolves.toEqual({ accepted: false, reason: "disposed" });
  });

  it("Primary 安全动作同时校验 panel、session、revision 与动作可用性", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
    );
    controller.show("/workspace/project-a");
    const initial = controller.getCompanionSnapshot()!;

    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: "another-panel",
      sessionId: initial.sessionId,
      revision: initial.revision,
      actionId: "reveal",
    })).resolves.toEqual({ accepted: false, reason: "panel-mismatch" });
    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: initial.panelId,
      sessionId: "old-session",
      revision: initial.revision,
      actionId: "reveal",
    })).resolves.toEqual({ accepted: false, reason: "session-mismatch" });
    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: initial.panelId,
      sessionId: initial.sessionId,
      revision: initial.revision + 1,
      actionId: "reveal",
    })).resolves.toEqual({ accepted: false, reason: "revision-mismatch" });
    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: initial.panelId,
      sessionId: initial.sessionId,
      revision: initial.revision,
      actionId: "cancel",
    })).resolves.toEqual({ accepted: false, reason: "action-unavailable" });

    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "ready" });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.revision).toBe(initial.revision + 1));
    const readyIdle = controller.getCompanionSnapshot()!;
    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: readyIdle.panelId,
      sessionId: readyIdle.sessionId,
      revision: readyIdle.revision,
      actionId: "reveal",
    })).resolves.toMatchObject({ accepted: true, snapshot: { lifecycle: "active" } });
    expect(panel.reveal).toHaveBeenCalledTimes(2);

    const mutable = controller as unknown as { state: KtcProjectRenameViewState };
    mutable.state = {
      ...mutable.state,
      status: "done",
      gitCompareAvailable: true,
      completion: {
        plannedItems: 1,
        appliedItems: 1,
        remainingItems: 0,
        targetReached: true,
        allPlannedApplied: true,
        canFinish: true,
        message: "完成",
      },
    };
    receiver({ type: "ready" });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.revision).toBe(initial.revision + 2));
    const ready = controller.getCompanionSnapshot()!;
    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: ready.panelId,
      sessionId: ready.sessionId,
      revision: ready.revision,
      actionId: "openGitChanges",
    })).resolves.toMatchObject({ accepted: true });
    expect(executeCommand).toHaveBeenCalledWith("workbench.view.scm");

    let finishGitCommand = (): void => undefined;
    executeCommand.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishGitCommand = resolve;
    }));
    const pending = controller.runCompanionAction({
      toolId: "projectRename",
      panelId: ready.panelId,
      sessionId: ready.sessionId,
      revision: ready.revision,
      actionId: "openGitChanges",
    });
    await vi.waitFor(() => expect(executeCommand).toHaveBeenCalledTimes(2));
    panel.dispose();
    finishGitCommand();
    await expect(pending).resolves.toEqual({ accepted: false, reason: "disposed" });
  });

  it("Primary 取消动作只终止当前 session 的只读分析", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    withProgress.mockImplementation(async (_options, task) => task(
      { report: vi.fn() },
      { onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })) },
    ));
    analyzeProjectRename.mockImplementation((options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new ProjectRenameCancelledError()), { once: true });
    }));
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
    );
    controller.show("/workspace/project-a");
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "ready" });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.ready).toBe(true));
    receiver({
      type: "analyze",
      sourceName: "Old Project",
      targetName: "New Project",
      sourcePrefix: "",
      targetPrefix: "",
      rules: [{ id: "display", style: "display", search: "Old Project", replace: "New Project", enabled: true }],
    });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.status).toBe("running"));
    const running = controller.getCompanionSnapshot()!;

    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: running.panelId,
      sessionId: running.sessionId,
      revision: running.revision,
      actionId: "cancel",
    })).resolves.toMatchObject({
      accepted: true,
      snapshot: { status: "idle", projectStatus: "cancelled" },
    });
    expect(controller.getCompanionSnapshot()?.revision).toBeGreaterThan(running.revision);
  });

  it("取消异步历史保存中的分析，并为下一次分析换用新的 AbortSignal", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const cancellationDispose = vi.fn();
    withProgress.mockImplementation(async (_options, task) => task(
      { report: vi.fn() },
      { onCancellationRequested: vi.fn(() => ({ dispose: cancellationDispose })) },
    ));
    const signals: AbortSignal[] = [];
    analyzeProjectRename.mockImplementation(async (options) => {
      signals.push(options.signal as AbortSignal);
      return {
        ...fakeReport(options.root, options.sourceName, options.targetName),
        reportId: options.reportId,
        rules: options.rules,
      };
    });
    let releaseHistory = (): void => undefined;
    const historyPending = new Promise<void>((resolve) => { releaseHistory = resolve; });
    const host = new KtcProjectRenameHost();
    const rememberProjectPlan = vi.spyOn(host, "rememberProjectPlan")
      .mockImplementationOnce(async () => {
        await historyPending;
        return { pairs: [], projectPlans: [] };
      })
      .mockResolvedValue({ pairs: [], projectPlans: [] });
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      host,
    );
    controller.show("/workspace/project-a");
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    const request = {
      type: "analyze",
      sourceName: "Old Project",
      targetName: "New Project",
      sourcePrefix: "",
      targetPrefix: "",
      rules: [{ id: "display", style: "display", search: "Old Project", replace: "New Project", enabled: true }],
    } as const;

    receiver(request);
    await vi.waitFor(() => expect(rememberProjectPlan).toHaveBeenCalledTimes(1));
    expect(signals[0]?.aborted).toBe(false);
    receiver({ type: "cancel" });
    expect(signals[0]?.aborted).toBe(true);

    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({ status: "cancelled", report: undefined }),
    })));
    expect((controller as unknown as { abortController?: AbortController }).abortController).toBeUndefined();
    expect((controller as unknown as { report?: KtcProjectRenameAnalysisReport }).report).toBeUndefined();

    // The first history write is still pending: cancellation must already have
    // released the task slot so a fresh analysis can complete independently.
    receiver(request);
    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({ status: "done" }),
    })));
    expect(signals).toHaveLength(2);
    expect(signals[1]).not.toBe(signals[0]);
    expect(signals[1]?.aborted).toBe(false);
    releaseHistory();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect((controller as unknown as { report?: KtcProjectRenameAnalysisReport }).report?.reportId).toBe(2);
    expect(cancellationDispose).toHaveBeenCalledTimes(2);
  });

  it("VS Code 进度通知可立即取消挂起分析并释放任务槽", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    let cancelFromProgress: (() => void) | undefined;
    const cancellationDispose = vi.fn();
    withProgress.mockImplementation(async (_options, task) => task(
      { report: vi.fn() },
      {
        onCancellationRequested: vi.fn((listener) => {
          cancelFromProgress = listener;
          return { dispose: cancellationDispose };
        }),
      },
    ));
    let signal: AbortSignal | undefined;
    let finishPendingAnalysis = (_report: KtcProjectRenameAnalysisReport): void => undefined;
    analyzeProjectRename.mockImplementationOnce((options) => {
      signal = options.signal;
      return new Promise<KtcProjectRenameAnalysisReport>((resolve) => {
        finishPendingAnalysis = resolve;
      });
    });
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(),
    );
    controller.show("/workspace/project-a");
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({
      type: "analyze",
      sourceName: "Old Project",
      targetName: "New Project",
      sourcePrefix: "",
      targetPrefix: "",
      rules: [{ id: "display", style: "display", search: "Old Project", replace: "New Project", enabled: true }],
    });

    await vi.waitFor(() => expect(cancelFromProgress).toBeTypeOf("function"));
    cancelFromProgress?.();
    expect(signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "state",
      state: expect.objectContaining({ status: "cancelled" }),
    })));
    expect((controller as unknown as { abortController?: AbortController }).abortController).toBeUndefined();
    // The analyzer has deliberately ignored AbortSignal and is still pending;
    // cancellation must nevertheless have made the View available immediately.
    expect(cancellationDispose).not.toHaveBeenCalled();
    finishPendingAnalysis(fakeReport("/workspace/project-a", "Old Project", "New Project"));
    await vi.waitFor(() => expect(cancellationDispose).toHaveBeenCalledOnce());
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

  it("Primary 方案下拉可载入、删除所选并确认清空本机方案", async () => {
    const values = new Map<string, unknown>();
    const history = new KtcRenameHistoryStore({
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key: string, value: unknown) => { values.set(key, value); },
    } as never);
    await history.rememberPair("Phoenix Old", "Phoenix New");
    await history.rememberProjectPlan("/workspace/project-a", {
      sourceName: "Phoenix Old",
      targetName: "Phoenix New",
      sourcePrefix: "PO",
      targetPrefix: "PN",
      rules: [{ id: "display", style: "display", search: "Phoenix Old", replace: "Phoenix New", enabled: true }],
    });
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      new KtcProjectRenameHost(history),
    );
    controller.show("/workspace/project-a");
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "ready" });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.ready).toBe(true));
    const ready = controller.getCompanionSnapshot()!;
    const projectOption = ready.primary?.kind === "projectRename"
      ? ready.primary.model.schemeOptions.find((option) => option.id.startsWith("project:"))
      : undefined;
    expect(projectOption).toBeDefined();
    expect(ready.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "deleteScheme", enabled: true }),
      expect.objectContaining({ id: "clearSchemes", enabled: true }),
    ]));

    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: ready.panelId,
      sessionId: ready.sessionId,
      revision: ready.revision,
      actionId: "loadScheme",
      value: "project:not-present",
    })).resolves.toEqual({ accepted: false, reason: "action-unavailable" });

    const loaded = await controller.runCompanionAction({
      toolId: "projectRename",
      panelId: ready.panelId,
      sessionId: ready.sessionId,
      revision: ready.revision,
      actionId: "loadScheme",
      value: projectOption!.id,
    });
    expect(loaded).toMatchObject({
      accepted: true,
      snapshot: {
        primary: { kind: "projectRename", model: { selectedSchemeId: projectOption!.id } },
        actions: expect.arrayContaining([expect.objectContaining({ id: "deleteScheme", enabled: true })]),
      },
    });
    if (!loaded.accepted) throw new Error("方案载入失败");

    const deleted = await controller.runCompanionAction({
      toolId: "projectRename",
      panelId: loaded.snapshot.panelId,
      sessionId: loaded.snapshot.sessionId,
      revision: loaded.snapshot.revision,
      actionId: "deleteScheme",
      value: projectOption!.id,
    });
    expect(deleted).toMatchObject({ accepted: true });
    expect(history.snapshot("/workspace/project-a").projectPlans).toEqual([]);
    if (!deleted.accepted) throw new Error("方案删除失败");

    showWarningMessage.mockResolvedValue("清空本机历史");
    await expect(controller.runCompanionAction({
      toolId: "projectRename",
      panelId: deleted.snapshot.panelId,
      sessionId: deleted.snapshot.sessionId,
      revision: deleted.snapshot.revision,
      actionId: "clearSchemes",
    })).resolves.toMatchObject({ accepted: true });
    expect(history.snapshot("/workspace/project-a")).toEqual({ pairs: [], projectPlans: [] });
  });

  it("旧会话等待确认时关闭并重开，不会执行清空历史提交或污染新会话", async () => {
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    let finishConfirmation = (_value: string | undefined): void => undefined;
    showWarningMessage.mockImplementationOnce(() => new Promise<string | undefined>((resolve) => {
      finishConfirmation = resolve;
    }));
    const host = new KtcProjectRenameHost();
    const clearRenameHistory = vi.spyOn(host, "clearRenameHistory");
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      host,
    );

    controller.show("/workspace/project-a");
    const firstReceiver = vi.mocked(first.webview.onDidReceiveMessage).mock.calls[0]![0];
    firstReceiver({ type: "clearHistory" });
    await vi.waitFor(() => expect(showWarningMessage).toHaveBeenCalledOnce());

    first.dispose();
    controller.show("/workspace/project-b");
    finishConfirmation("清空本机历史");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(clearRenameHistory).not.toHaveBeenCalled();
    expect(controller.getCompanionSnapshot()).toMatchObject({
      lifecycle: "active",
      projectStatus: "idle",
      summary: expect.arrayContaining([
        { label: "目录", value: "/workspace/project-b" },
        { label: "改名", value: "project-b → —" },
      ]),
    });
    expect(second.webview.postMessage).not.toHaveBeenCalled();
  });

  it("旧报告等待 Git 检查时关闭并重开，不会进入确认或执行写盘", async () => {
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const host = new KtcProjectRenameHost();
    const report = fakeReport("/workspace/project-a");
    (report.workspaceReport.hits as WorkspaceRenameHit[]).push({
      id: "text:README.md",
      relativePath: "README.md",
      fullPath: "/workspace/project-a/README.md",
      originalFullPath: "/workspace/project-a/README.md",
      plannedFullPath: "/workspace/project-a/README.md",
      level: "text",
      occurrences: 1,
      status: "preview",
    });
    vi.spyOn(host, "preview").mockReturnValue(report.workspaceReport);
    let finishGitState = (_value: "clean"): void => undefined;
    vi.spyOn(host, "gitState").mockImplementationOnce(() => new Promise((resolve) => {
      finishGitState = resolve;
    }));
    const apply = vi.spyOn(host, "apply");
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      host,
    );
    controller.show("/workspace/project-a");
    const mutable = controller as unknown as {
      report: KtcProjectRenameAnalysisReport;
      state: KtcProjectRenameViewState;
    };
    mutable.report = report;
    mutable.state = { ...mutable.state, status: "done" };
    const firstReceiver = vi.mocked(first.webview.onDidReceiveMessage).mock.calls[0]![0];
    firstReceiver({ type: "apply", reportId: report.reportId });
    await vi.waitFor(() => expect(host.gitState).toHaveBeenCalledWith(report.root));

    first.dispose();
    controller.show("/workspace/project-b");
    finishGitState("clean");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(showWarningMessage).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(controller.getCompanionSnapshot()).toMatchObject({
      projectStatus: "idle",
      summary: expect.arrayContaining([{ label: "目录", value: "/workspace/project-b" }]),
    });
  });

  it("关闭时将只读分析归一为已取消，并将执行中的根目录写盘标记为结果未知", async () => {
    const analyzingPanel = fakePanel();
    const renamePanel = fakePanel();
    createWebviewPanel.mockReturnValueOnce(analyzingPanel).mockReturnValueOnce(renamePanel);
    withProgress.mockImplementationOnce(async (_options, task) => task(
      { report: vi.fn() },
      { onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })) },
    ));
    let finishAnalysis = (_report: KtcProjectRenameAnalysisReport): void => undefined;
    analyzeProjectRename.mockImplementationOnce(() => new Promise((resolve) => {
      finishAnalysis = resolve;
    }));
    const events: KtcProjectRenameCompanionEvent[] = [];
    const host = new KtcProjectRenameHost();
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      host,
      { onCompanionEvent: (event) => events.push(event) },
    );
    controller.show("/workspace/project-a");
    const analyzeReceiver = vi.mocked(analyzingPanel.webview.onDidReceiveMessage).mock.calls[0]![0];
    analyzeReceiver({
      type: "analyze",
      sourceName: "Old Project",
      targetName: "New Project",
      sourcePrefix: "",
      targetPrefix: "",
      rules: [{ id: "display", style: "display", search: "Old Project", replace: "New Project", enabled: true }],
    });
    await vi.waitFor(() => expect(controller.getCompanionSnapshot()?.projectStatus).toBe("running"));
    analyzingPanel.dispose();
    expect(events.at(-1)).toMatchObject({
      reason: "disposed",
      snapshot: {
        lifecycle: "disposed",
        status: "idle",
        projectStatus: "cancelled",
        message: "等待操作。",
      },
    });
    finishAnalysis(fakeReport("/workspace/project-a"));

    controller.show("/repos/phoenix-open-issue");
    const report = fakeReport("/repos/phoenix-open-issue");
    const mutable = controller as unknown as {
      report: KtcProjectRenameAnalysisReport;
      state: KtcProjectRenameViewState;
    };
    mutable.report = report;
    mutable.state = {
      ...mutable.state,
      status: "done",
      report: {
        reportId: 7,
        rootSuggestion: { currentName: "phoenix-open-issue", suggestedName: "phoenix-issue", canRename: true },
        summary: report.workspaceReport.summary,
        riskSummary: report.riskSummary,
        stats: report.stats,
        relatedCandidates: [],
        page: { reportId: 7, rows: [], offset: 0, totalRows: 0 },
      },
    };
    showWarningMessage.mockResolvedValueOnce("重命名根目录");
    let finishRename = (): void => undefined;
    vi.spyOn(host, "renameRoot").mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRename = resolve;
    }));
    const renameReceiver = vi.mocked(renamePanel.webview.onDidReceiveMessage).mock.calls[0]![0];
    renameReceiver({ type: "renameRoot", reportId: 7 });
    await vi.waitFor(() => expect(host.renameRoot).toHaveBeenCalledOnce());
    renamePanel.dispose();

    expect(events.at(-1)).toMatchObject({
      reason: "disposed",
      snapshot: {
        lifecycle: "disposed",
        status: "error",
        projectStatus: "error",
        message: "任务遇到问题；请在右侧 View 或 Output 中查看详情。",
      },
    });
    finishRename();
    await new Promise<void>((resolve) => setImmediate(resolve));
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

  it("差异预览气泡同步写入 Output 日志", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const host = new KtcProjectRenameHost();
    vi.spyOn(host, "openTextDiff").mockRejectedValue(new Error("文本命中次数与冻结报告不一致"));
    const log = vi.fn();
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      host,
      { log },
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

    await vi.waitFor(() => expect(showWarningMessage).toHaveBeenCalledWith(
      "无法预览写盘前差异：文本命中次数与冻结报告不一致",
    ));
    expect(log).toHaveBeenCalledWith(
      "[项目改名][通知][WARN] 无法预览写盘前差异：文本命中次数与冻结报告不一致",
    );
  });

  it("Git 工作区有既有改动时改为明确确认，确认后继续写盘", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    withProgress.mockImplementation(async (_options, task) => task(
      { report: vi.fn() },
      { onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })) },
    ));
    const root = "/workspace/project-a";
    const report = fakeReport(root, "OldProject", "NewProject");
    const hit: WorkspaceRenameHit = {
      id: "text:src/index.ts",
      relativePath: "src/index.ts",
      fullPath: `${root}/src/index.ts`,
      originalFullPath: `${root}/src/index.ts`,
      plannedFullPath: `${root}/src/index.ts`,
      level: "text",
      occurrences: 1,
      sourceHash: "a".repeat(64),
      status: "preview",
    };
    (report.workspaceReport.hits as WorkspaceRenameHit[]).push(hit);
    Object.assign(report.workspaceReport.summary, { rules: 1, matchedRules: 1, textFiles: 1, replacements: 1 });
    const host = new KtcProjectRenameHost();
    vi.spyOn(host, "preview").mockReturnValue(report.workspaceReport);
    vi.spyOn(host, "gitState").mockResolvedValue("dirty");
    const apply = vi.spyOn(host, "apply").mockReturnValue({
      ...report.workspaceReport,
      applied: true,
      hits: [{ ...hit, status: "applied" }],
    });
    analyzeProjectRename.mockResolvedValue(fakeReport(root, "OldProject", "NewProject"));
    showWarningMessage.mockResolvedValue("保留现有改动并执行");
    const log = vi.fn();
    const controller = new KtcProjectRenameViewController(
      { fsPath: "/extension" } as vscode.Uri,
      host,
      { log },
    );
    controller.show(root);
    const mutable = controller as unknown as {
      report: KtcProjectRenameAnalysisReport;
      state: KtcProjectRenameViewState;
    };
    mutable.report = report;
    mutable.state = { ...mutable.state, status: "done" };
    const receiver = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0];
    receiver({ type: "apply", reportId: report.reportId });

    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(report));
    expect(showWarningMessage).toHaveBeenCalledWith(
      "执行项目改名：1 项、1 处精确替换？",
      expect.objectContaining({
        modal: true,
        detail: expect.stringContaining("Git 工作区已有未提交或未跟踪改动"),
      }),
      "保留现有改动并执行",
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Git 工作区已有未提交或未跟踪改动"));
    expect(log).toHaveBeenCalledWith("[项目改名][通知][选择] 保留现有改动并执行");
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
    ignorePatterns: [],
    useBuiltInIgnore: true,
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
