import { beforeEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mocks = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
  outputShow: vi.fn(),
  outputLines: [] as string[],
  environmentValues: [] as unknown[],
  readProjectEnvironment: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showWarningMessage: vi.fn(),
  previewCleanupArtifacts: vi.fn(),
  cleanPreviewedArtifacts: vi.fn(),
  previewDirectoryContents: vi.fn(),
  cleanPreviewedDirectoryContents: vi.fn(),
  previewGitForcedCleanup: vi.fn(),
  executeGitForcedCleanup: vi.fn(),
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
    workspace: { workspaceFolders: undefined },
    window: {
      createWebviewPanel: mocks.createWebviewPanel,
      createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn((line: string) => mocks.outputLines.push(line)),
        show: mocks.outputShow,
        dispose: vi.fn(),
      })),
      showWarningMessage: mocks.showWarningMessage,
      showOpenDialog: mocks.showOpenDialog,
      showSaveDialog: mocks.showSaveDialog,
    },
  };
});

vi.mock("../../projectEnvironment.js", () => ({
  ktcReadProjectEnvironment: mocks.readProjectEnvironment,
}));

vi.mock("./autoBuildCleanupWingAdapter.js", () => ({
  ktcPreviewWingCleanupArtifacts: mocks.previewCleanupArtifacts,
  ktcCleanPreviewedWingArtifacts: mocks.cleanPreviewedArtifacts,
  ktcPreviewWingDirectoryContents: mocks.previewDirectoryContents,
  ktcCleanPreviewedWingDirectoryContents: mocks.cleanPreviewedDirectoryContents,
  ktcPreviewWingGitForcedCleanup: mocks.previewGitForcedCleanup,
  ktcExecuteWingGitForcedCleanup: mocks.executeGitForcedCleanup,
}));

import * as vscode from "vscode";
import type { KtcEditorPrimaryCompanionSnapshot } from "../../core/editorPrimaryCompanionContracts.js";
import type { KtcAutoBuildConfiguration, KtcAutoBuildTask } from "./autoBuildContracts.js";
import { ktcPlanAutoBuildTasks } from "./autoBuildContracts.js";
import type { KtcAutoBuildCleanupDialogRequest } from "./autoBuildCleanupDialogContracts.js";
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

function memory(initial: Record<string, unknown> = {}): Pick<vscode.Memento, "get" | "update"> {
  const values = new Map<string, unknown>(Object.entries(initial));
  return {
    get: (key: string) => values.get(key),
    update: async (key: string, value: unknown) => { values.set(key, value); },
  };
}

function draft(overrides: Partial<KtcAutoBuildConfiguration> = {}): KtcAutoBuildConfiguration {
  return {
    schemaVersion: 2,
    rootDirectory: "/missing/root",
    thirdPartyDirectory: "/missing/third-party",
    updateRoot: false,
    updateThirdParty: false,
    workingDirectory: "/missing/workspace",
    rootBranch: "develop",
    branch: "develop",
    cmakeBranch: "master",
    projects: [],
    buildExecutionMode: "sequential",
    clean: false,
    ...overrides,
  };
}

function actionToken(snapshot: KtcEditorPrimaryCompanionSnapshot, actionId: string) {
  return {
    panelId: snapshot.panelId,
    toolId: snapshot.toolId,
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    actionId,
  };
}

describe("自动编译 Primary companion", () => {
  it("项目行 updateProject 只更新目标仓库，不触发项目构建或其他任务", async () => {
    const panel = fakePanel(); mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory(), { onDidChange: (snapshot) => snapshots.push(snapshot) });
    await controller.show("/workspace");
    panel.fireMessage({ type: "ready", documentId: "git-only" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const project = { id: "one", name: "One", path: "/workspace/One", branch: "release", enabled: true, operations: { update: false, cmake: true, caa: true, linkCaa: true } };
    const internal = controller as unknown as { updateProjectRow: ReturnType<typeof vi.fn>; runProcess: ReturnType<typeof vi.fn>; probeProjectRow: ReturnType<typeof vi.fn> };
    internal.updateProjectRow = vi.fn(async () => "skipped");
    internal.runProcess = vi.fn();
    internal.probeProjectRow = vi.fn(async () => ({ ...project, probe: { status: "modified" } }));
    panel.fireMessage({ type: "updateProject", projectId: "one", documentId: "git-only", draftRevision: 1, configuration: draft({ workingDirectory: "/workspace", projects: [project] }) });
    await vi.waitFor(() => expect(internal.updateProjectRow).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(mocks.outputLines).toContainEqual(expect.stringContaining("保留并跳过")));
    expect(internal.runProcess).not.toHaveBeenCalled();
    expect(mocks.outputLines).toContainEqual(expect.stringContaining("只更新 Git"));
    controller.dispose();
  });

  it("整批 Git 使用逐仓 TS，失败不阻断另一个独立仓库，也不启动 PowerShell", async () => {
    const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory());
    const internal = controller as unknown as {
      runProcess(task: KtcAutoBuildTask, args: string[], config: KtcAutoBuildConfiguration): Promise<number>;
      updateProjectRow: ReturnType<typeof vi.fn>;
      spawnTaskProcess: ReturnType<typeof vi.fn>;
    };
    internal.updateProjectRow = vi.fn().mockRejectedValueOnce(new Error("origin unreachable")).mockResolvedValueOnce("updated");
    internal.spawnTaskProcess = vi.fn();
    const project = (id: string) => ({ id, name: id, path: `/workspace/${id}`, branch: "main", enabled: true, operations: { update: true, cmake: false, caa: false, linkCaa: false } });
    const config = draft({ rootEnabled: false, thirdPartyEnabled: false, projects: [project("one"), project("two")] });
    const task = ktcPlanAutoBuildTasks(config)[0]!;
    expect(await internal.runProcess(task, [], config)).toBe(1);
    expect(internal.updateProjectRow).toHaveBeenCalledTimes(2);
    expect(task.children?.map((child) => child.status)).toEqual(["error", "done"]);
    expect(internal.spawnTaskProcess).not.toHaveBeenCalled();
    controller.dispose();
  });

  it.runIf(process.env.KTC_TEST_NATIVE_CMAKE === "1")("macOS/Linux 真实 CMake Release 编译，不依赖 mk.ps1；export 明确跳过", async () => {
    const base = await mkdtemp(join(tmpdir(), "ktc-native-cmake-"));
    const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory());
    try {
      const project = join(base, "Demo"); await mkdir(project);
      await writeFile(join(project, "CMakeLists.txt"), 'cmake_minimum_required(VERSION 3.16)\nproject(Demo LANGUAGES CXX)\nadd_executable(probe main.cpp)\n');
      await writeFile(join(project, "main.cpp"), 'int main() { return 0; }\n');
      await writeFile(join(project, "export.ps1"), 'throw "must not execute on POSIX"\n');
      const config = draft({ workingDirectory: base, cmakeBuildTypes: ["Release"] });
      const internal = controller as unknown as { runProcess(task: KtcAutoBuildTask, args: string[], config: KtcAutoBuildConfiguration): Promise<number> };
      const exportTask: KtcAutoBuildTask = { id: "export", name: "Export", phase: "export", path: project, status: "in_progress", commandSummary: "export.ps1" };
      expect(await internal.runProcess(exportTask, [], config)).toBe(0);
      expect(exportTask.status).toBe("skipped");
      const task: KtcAutoBuildTask = { id: "cmake", name: "CMake", phase: "cmake", path: project, status: "in_progress", commandSummary: "cmake" };
      expect(await internal.runProcess(task, [], config)).toBe(0);
      await expect(access(join(base, "build", "DemoRelease", "probe"))).resolves.toBeUndefined();
      await expect(access(join(base, "build", "DemoDebug"))).rejects.toThrow();
      expect(mocks.outputLines).toContainEqual(expect.stringContaining("未运行 export.ps1"));
      expect(mocks.outputLines.some((line) => line.includes("命令 powershell.exe"))).toBe(false);
    } finally { controller.dispose(); await rm(base, { recursive: true, force: true }); }
  }, 60_000);

  beforeEach(() => {
    mocks.createWebviewPanel.mockReset();
    mocks.outputShow.mockClear();
    mocks.outputLines.length = 0;
    mocks.environmentValues = [];
    mocks.readProjectEnvironment.mockReset();
    mocks.showOpenDialog.mockReset();
    mocks.showOpenDialog.mockResolvedValue(undefined);
    mocks.showSaveDialog.mockReset();
    mocks.showSaveDialog.mockResolvedValue(undefined);
    mocks.showWarningMessage.mockReset();
    mocks.showWarningMessage.mockResolvedValue("放弃修改");
    mocks.previewCleanupArtifacts.mockReset();
    mocks.previewCleanupArtifacts.mockImplementation(async (root: string) => ({ root, matched: [join(root, "build")] }));
    mocks.cleanPreviewedArtifacts.mockReset();
    mocks.cleanPreviewedArtifacts.mockImplementation(async (preview: { root: string; matched: readonly string[] }) => ({ root: preview.root, deleted: preview.matched }));
    mocks.previewDirectoryContents.mockReset();
    mocks.previewDirectoryContents.mockImplementation(async (root: string) => ({ root, matched: [] }));
    mocks.cleanPreviewedDirectoryContents.mockReset();
    mocks.cleanPreviewedDirectoryContents.mockImplementation(async (preview: { root: string; matched: readonly string[] }) => ({ root: preview.root, deleted: preview.matched }));
    mocks.previewGitForcedCleanup.mockReset();
    mocks.previewGitForcedCleanup.mockImplementation(async (repository: string) => ({ repository, head: "abc", trackedChanges: [], untrackedAndIgnored: [] }));
    mocks.executeGitForcedCleanup.mockReset();
    mocks.executeGitForcedCleanup.mockImplementation(async (preview: { repository: string }) => ({ repository: preview.repository, resetOutput: "", cleanOutput: "" }));
    mocks.readProjectEnvironment.mockImplementation(async () => ({ values: mocks.environmentValues }));
  });

  it("在首个 await 前锁住项目和单任务执行，拒绝并发启动", async () => {
    const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory());
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const internal = controller as unknown as {
      runRightProjectAction(action: "runProject" | "runTask", execute: () => Promise<void>): Promise<boolean>;
    };

    const first = internal.runRightProjectAction("runProject", () => gate);
    const concurrent = internal.runRightProjectAction("runTask", async () => undefined);

    await expect(concurrent).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
  });

  it("首次打开只创建当前目录的 fresh draft，不自动载入 PATH_KEY 或旧 STATE_KEY", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    mocks.environmentValues = [
      { key: "customRoot", value: "/detected/root" },
      { key: "thirdPartyRoot", value: "/detected/third" },
    ];
    const old = draft({
      workingDirectory: "/old/workspace",
      projects: [{
        id: "old",
        enabled: true,
        name: "Old",
        path: "Old",
        branch: "develop",
        operations: { update: true, cmake: true, caa: false, linkCaa: false },
      }],
    });
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory({
        "ktAutoCode.codeAssistant.autoBuild.configuration": old,
        "ktAutoCode.codeAssistant.autoBuild.lastPath": "/old/auto-build.json",
        "ktAutoCode.codeAssistant.autoBuild.recentPaths": ["/old/auto-build.json"],
      }),
    );

    await controller.show("/current/workspace");
    panel.fireMessage({ type: "ready", documentId: "fresh-document" });
    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "configuration" })));
    const configurationMessage = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; path?: string; configuration?: KtcAutoBuildConfiguration; recentPaths?: string[] })
      .find(({ type }) => type === "configuration")!;
    expect(configurationMessage).toMatchObject({
      path: "",
      recentPaths: ["/old/auto-build.json"],
      configuration: {
        rootDirectory: "/detected/root",
        thirdPartyDirectory: "/detected/third",
        workingDirectory: "/current/workspace",
        projects: [],
      },
    });
  });

  it("手动载入 JSON 保留文件自己的工作目录，不用当前目录覆盖", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ktc-auto-build-load-context-"));
    try {
      const path = join(directory, "auto-build.json");
      await writeFile(path, JSON.stringify(draft({ workingDirectory: "/json/owned/workspace" })), "utf8");
      const panel = fakePanel();
      mocks.createWebviewPanel.mockReturnValue(panel);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory({ "ktAutoCode.codeAssistant.autoBuild.recentPaths": [path] }),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      await controller.show("/current/workspace");
      panel.fireMessage({ type: "ready", documentId: "manual-load-document" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      const initial = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
        .find(({ type }) => type === "configuration")!.configuration!;
      const selecting = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "selectRecent0"));
      const request = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string; action?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      expect(request.action).toBe("selectRecent");
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: request.requestId,
        documentId: "manual-load-document",
        draftRevision: 0,
        configuration: initial,
      });
      await expect(selecting).resolves.toBe(true);
      await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/json/owned/workspace" }));
      expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: "configuration",
        path,
        configuration: expect.objectContaining({ workingDirectory: "/json/owned/workspace" }),
      }));
      await controller.show("/different/fallback");
      expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/json/owned/workspace" });
      expect(panel.webview.postMessage).not.toHaveBeenCalledWith({
        type: "workingDirectory",
        value: "/different/fallback",
      });
      panel.fireMessage({
        type: "draftChanged",
        documentId: "manual-load-document",
        draftRevision: 1,
        configuration: draft({ workingDirectory: "/different/workspace", projects: [] }),
      });
      await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({
        kind: "autoBuild",
        model: { configuration: { workingDirectoryMismatch: true } },
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
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
    expect(panel.webview.html).toContain('<ktc-right-view-shell id="autoBuildRightShell">');
    expect(panel.webview.html).toContain('id="autoBuildHeaderActions" class="header-actions" slot="actions"');
    expect(panel.webview.html).toContain('<main id="autoBuildMain" class="auto-build-main">');
    expect(panel.webview.html).not.toContain('<div class="toolbar"><button id="open">');
    expect(panel.webview.html).not.toContain('id="autoBuildPlatformHint"');
    expect(panel.webview.html).not.toContain('<label class="clean"><input id="clean"');
    expect(panel.webview.html).not.toContain("清理 Root、3rdParty 与 CMake 仓库（默认不清理）");
    expect(panel.webview.html).toContain("clean:false");
    expect(panel.webview.html).toContain("ktc-right-view-shell.js");
    expect(panel.webview.html.indexOf("ktc-right-view-shell.js"))
      .toBeLessThan(panel.webview.html.indexOf("auto-build-view.js"));
    expect(panel.webview.html).not.toContain('<pre id="output">');
    expect(panel.webview.html).not.toContain("m.type==='output'");
    expect(panel.webview.html).not.toContain("ktc-system-output-block");
    expect(snapshots.at(-1)).toMatchObject({
      toolId: "autoBuild",
      lifecycle: "active",
      ready: false,
    });
    expect(snapshots.at(-1)).not.toHaveProperty("title");

    panel.fireMessage({ type: "ready", documentId: "document-one" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    await vi.waitFor(() => expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "scriptStatus",
      status: expect.stringMatching(/^(same|different|missing|unavailable|foreign)$/u),
      source: "/extension/scripts",
    })));
    const ready = snapshots.at(-1)!;
    expect(ready.actions.slice(0, 4)).toEqual([
      expect.objectContaining({ id: "openScript", label: "脚本", enabled: true }),
      expect.objectContaining({ id: "preflight", label: "预检配置", enabled: true }),
      expect.objectContaining({ id: "start", label: "启动", enabled: true, tone: "primary" }),
      expect.objectContaining({ id: "stop", label: "停止", enabled: false, tone: "danger" }),
    ]);
    expect(ready.actions).toContainEqual(expect.objectContaining({ id: "saveAsConfig", label: "另存", enabled: true }));
    expect(ready.summary).toEqual(expect.arrayContaining([
      { label: "目录", value: "/workspace/project" },
      { label: "平台", value: expect.any(String) },
    ]));
    expect(ready.primary).toMatchObject({
      kind: "autoBuild",
      model: {
        metrics: [
          { label: "启用项目", value: "0 / 0" },
          { label: "任务", value: "0 / 0" },
          { label: "失败", value: "0" },
        ],
        configuration: {
          name: "未保存",
          fullPath: "",
          dirty: true,
          statusLabel: "尚未写盘",
          recent: [],
        },
        environmentLabel: expect.any(String),
        maintenance: { scriptStatus: expect.any(String), scriptDetail: expect.any(String) },
      },
    });

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

    const scriptSnapshot = snapshots.at(-1)!;
    await expect(controller.runPrimaryCompanionAction(actionToken(scriptSnapshot, "openScript"))).resolves.toBe(true);
    expect(panel.reveal).toHaveBeenCalledWith(panel.viewColumn, false);
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ type: "openScriptManager" });

    const opening = controller.runPrimaryCompanionAction({
      panelId: ready.panelId,
      toolId: "autoBuild",
      sessionId: ready.sessionId,
      revision: snapshots.at(-1)!.revision,
      actionId: "openConfig",
    });
    const openRequest = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; action?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    expect(openRequest.action).toBe("openConfig");
    const currentConfiguration = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
      .find(({ type }) => type === "configuration")!.configuration!;
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: openRequest.requestId,
      documentId: "document-one",
      draftRevision: 0,
      configuration: currentConfiguration,
    });
    await expect(opening).resolves.toBe(true);
    expect(mocks.showOpenDialog).toHaveBeenCalledTimes(1);

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
    first.fireMessage({ type: "ready", documentId: "old-document" });
    await vi.waitFor(() => expect(mocks.readProjectEnvironment).toHaveBeenCalledTimes(1));
    first.dispose();

    await controller.show("/workspace/new");
    const newSession = snapshots.at(-1)!.sessionId;
    second.fireMessage({ type: "ready", documentId: "new-document" });
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

  it("关闭并重开 Right 时保留实际子进程与任务，禁止并发启动且仍可停止", async () => {
    const first = fakePanel();
    const second = fakePanel();
    mocks.createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    first.fireMessage({ type: "ready", documentId: "running-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const retainedDraft = draft({
      rootDirectory: "/workspace/root-owned",
      thirdPartyDirectory: "/workspace/third-party-owned",
      updateRoot: true,
      updateThirdParty: true,
      workingDirectory: "/workspace/project",
      rootBranch: "release/root",
      branch: "release/third-party",
      cmakeBranch: "release/cmake",
      buildExecutionMode: "parallel",
      projects: [{
        id: "retained",
        enabled: true,
        name: "Retained",
        path: "Retained",
        branch: "develop",
        operations: { update: true, cmake: true, caa: false, linkCaa: false },
      }],
    });
    first.fireMessage({
      type: "draftChanged",
      documentId: "running-document",
      draftRevision: 1,
      configuration: retainedDraft,
    });
    await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "项目", value: "1 个" }));
    const child = { kill: vi.fn(() => true) };
    const mutable = controller as unknown as {
      processes: Set<typeof child>;
      tasks: Array<{ id: string; name: string; commandSummary: string; phase: "cmake"; status: "in_progress" }>;
      companionStatus: "running";
      companionMessage: string;
    };
    mutable.processes.add(child);
    mutable.tasks = [{ id: "cmake-one", name: "CMake One", commandSummary: "mk.ps1", phase: "cmake", status: "in_progress" }];
    mutable.companionStatus = "running";
    mutable.companionMessage = "进行中";

    first.dispose();
    expect(snapshots.at(-1)).toMatchObject({ lifecycle: "disposed", status: "running", ready: false });
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "任务", value: "1 个进行中" });

    await controller.show("/workspace/project");
    second.fireMessage({ type: "ready", documentId: "resumed-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)).toMatchObject({ lifecycle: "active", status: "running", ready: true }));
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "任务", value: "1 个进行中" });
    expect(second.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "configuration",
      configuration: expect.objectContaining({
        rootDirectory: "/workspace/root-owned",
        thirdPartyDirectory: "/workspace/third-party-owned",
        updateRoot: true,
        updateThirdParty: true,
        workingDirectory: "/workspace/project",
        rootBranch: "release/root",
        branch: "release/third-party",
        cmakeBranch: "release/cmake",
        buildExecutionMode: "parallel",
        projects: [expect.objectContaining({ id: "retained" })],
      }),
    }));
    expect(second.webview.postMessage).toHaveBeenCalledWith({
      type: "tasks",
      tasks: [expect.objectContaining({ id: "cmake-one", status: "in_progress" })],
    });
    expect(second.webview.postMessage).toHaveBeenCalledWith({
      type: "status",
      status: "in_progress",
      text: "之前启动的任务仍在运行；可从 Primary 或 Right 停止。",
    });
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "start")?.enabled).toBe(false);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "stop")?.enabled).toBe(true);

    await expect(controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "stop"))).resolves.toBe(true);
    expect(child.kill).toHaveBeenCalledTimes(1);
    mutable.processes.delete(child);
  });

  it("关闭并重开 Right 后继续完整双阶段计划，第二项仍启动且只在整轮结束发布终态", async () => {
    const base = await mkdtemp(join(tmpdir(), "ktc-auto-build-resume-plan-"));
    try {
      const root = join(base, "root");
      const third = join(base, "third");
      const working = join(base, "working");
      const project = join(working, "ProjectA");
      await Promise.all([mkdir(root), mkdir(third), mkdir(working)]);
      await mkdir(project);
      const first = fakePanel();
      const second = fakePanel();
      mocks.createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory(),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      const releases: Array<(code: number) => void> = [];
      const internal = controller as unknown as {
        probeProjectRow(row: KtcAutoBuildConfiguration["projects"][number], workingDirectory: string): Promise<KtcAutoBuildConfiguration["projects"][number]>;
        refreshRepositorySnapshot(configuration: KtcAutoBuildConfiguration, context: { documentId: string; draftRevision: number }): Promise<void>;
        runProcess(task: { name: string }, args: string[], configuration: KtcAutoBuildConfiguration): Promise<number>;
      };
      internal.probeProjectRow = vi.fn(async (row) => row);
      internal.refreshRepositorySnapshot = vi.fn(async () => undefined);
      internal.runProcess = vi.fn(async () => new Promise<number>((resolve) => { releases.push(resolve); }));

      await controller.show(working);
      first.fireMessage({ type: "ready", documentId: "resume-plan-one" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      const configuration = draft({
        rootDirectory: root,
        thirdPartyDirectory: third,
        workingDirectory: working,
        projects: [{
          id: "project-a",
          enabled: true,
          name: "ProjectA",
          path: "ProjectA",
          branch: "develop",
          operations: { update: false, cmake: true, caa: false, linkCaa: false },
        }],
      });
      first.fireMessage({ type: "draftChanged", documentId: "resume-plan-one", draftRevision: 1, configuration });
      await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "项目", value: "1 个" }));
      first.fireMessage({ type: "start", documentId: "resume-plan-one", draftRevision: 1, configuration });
      await vi.waitFor(() => expect(internal.runProcess).toHaveBeenCalledTimes(1));

      first.dispose();
      expect(snapshots.at(-1)).toMatchObject({ lifecycle: "disposed", status: "running", ready: false });
      await controller.show(working);
      second.fireMessage({ type: "ready", documentId: "resume-plan-two" });
      await vi.waitFor(() => expect(snapshots.at(-1)).toMatchObject({ lifecycle: "active", status: "running", ready: true }));

      releases[0]!(0);
      await vi.waitFor(() => expect(internal.runProcess).toHaveBeenCalledTimes(2));
      expect(snapshots.at(-1)?.status).toBe("running");
      const duringSecond = vi.mocked(second.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; tasks?: Array<{ status: string }> })
        .filter(({ type }) => type === "tasks")
        .at(-1)?.tasks;
      expect(duringSecond).toEqual([
        expect.objectContaining({ status: "done" }),
        expect.objectContaining({ status: "in_progress" }),
      ]);

      releases[1]!(0);
      await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe("done"));
      const finished = vi.mocked(second.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; status?: string; tasks?: Array<{ status: string }> })
        .filter(({ type }) => type === "tasks")
        .at(-1)?.tasks;
      expect(finished).toHaveLength(2);
      expect(finished?.every((task) => task.status === "done")).toBe(true);
      expect(second.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "status", status: "done" }));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("项目前置失败形成稳定 error 任务，随后运行另一项目仍保留该失败", async () => {
    const base = await mkdtemp(join(tmpdir(), "ktc-auto-build-project-prepare-"));
    try {
      const root = join(base, "root");
      const third = join(base, "third");
      const working = join(base, "working");
      await Promise.all([mkdir(root), mkdir(third), mkdir(working)]);
      await Promise.all([mkdir(join(working, "ProjectA")), mkdir(join(working, "ProjectB"))]);
      const panel = fakePanel();
      mocks.createWebviewPanel.mockReturnValue(panel);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory(),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      const internal = controller as unknown as {
        probeProjectRow(row: KtcAutoBuildConfiguration["projects"][number], workingDirectory: string): Promise<KtcAutoBuildConfiguration["projects"][number]>;
        updateProjectRow(row: KtcAutoBuildConfiguration["projects"][number], workingDirectory: string): Promise<void>;
      };
      internal.probeProjectRow = vi.fn(async (row) => row);
      internal.updateProjectRow = vi.fn(async (row) => {
        if (row.id === "project-a") throw new Error("synthetic preparation failure");
      });
      const configuration = draft({
        rootDirectory: root,
        thirdPartyDirectory: third,
        workingDirectory: working,
        projects: [
          { id: "project-a", enabled: true, name: "ProjectA", path: "ProjectA", branch: "develop", operations: { update: true, cmake: false, caa: false, linkCaa: false } },
          { id: "project-b", enabled: true, name: "ProjectB", path: "ProjectB", branch: "develop", operations: { update: true, cmake: false, caa: false, linkCaa: false } },
        ],
      });

      await controller.show(working);
      panel.fireMessage({ type: "ready", documentId: "project-prepare-document" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      panel.fireMessage({ type: "draftChanged", documentId: "project-prepare-document", draftRevision: 1, configuration });
      await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "项目", value: "2 个" }));

      panel.fireMessage({ type: "runProject", documentId: "project-prepare-document", draftRevision: 1, configuration, projectId: "project-a" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe("error"));
      await vi.waitFor(() => expect(snapshots.at(-1)?.actions.find(({ id }) => id === "start")?.enabled).toBe(true));
      panel.fireMessage({ type: "runProject", documentId: "project-prepare-document", draftRevision: 1, configuration, projectId: "project-b" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe("done"));

      const tasks = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; tasks?: Array<{ id: string; status: string }> })
        .filter(({ type }) => type === "tasks")
        .at(-1)?.tasks;
      expect(tasks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "project-prepare-project-a", status: "error" }),
        expect.objectContaining({ id: "project-prepare-project-b", status: "done" }),
      ]));
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("以 Right 单调草稿更新 Primary，并拒绝旧草稿与旧 action token", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    panel.fireMessage({ type: "ready", documentId: "draft-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));

    const firstDraft = draft({
      workingDirectory: "/workspace/first",
      projects: [{
        id: "first",
        enabled: true,
        name: "First",
        path: "First",
        branch: "develop",
        operations: { update: true, cmake: true, caa: false, linkCaa: false },
      }],
    });
    panel.fireMessage({ type: "draftChanged", documentId: "draft-document", draftRevision: 1, configuration: firstDraft });
    await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/first" }));
    const staleToken = actionToken(snapshots.at(-1)!, "preflight");
    firstDraft.projects[0]!.name = "Mutated outside Host";

    const newestDraft = draft({
      workingDirectory: "/workspace/newest",
      projects: [{
        id: "newest",
        enabled: true,
        name: "Newest",
        path: "Newest",
        branch: "release",
        operations: { update: false, cmake: false, caa: true, linkCaa: false },
      }],
    });
    panel.fireMessage({ type: "draftChanged", documentId: "draft-document", draftRevision: 3, configuration: newestDraft });
    const revisionAfterNewest = snapshots.at(-1)!.revision;
    panel.fireMessage({
      type: "draftChanged",
      documentId: "draft-document",
      draftRevision: 2,
      configuration: draft({ workingDirectory: "/workspace/stale" }),
    });

    await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/newest" }));
    expect(snapshots.at(-1)?.revision).toBe(revisionAfterNewest);
    expect(snapshots.at(-1)?.primary).toMatchObject({
      kind: "autoBuild",
      model: {
        metrics: [
          { label: "启用项目", value: "1 / 1" },
          { label: "任务", value: "0 / 0" },
          { label: "失败", value: "0" },
        ],
        environment: expect.arrayContaining([
          { label: "工作目录", value: "/workspace/newest" },
        ]),
      },
    });
    expect(snapshots.at(-1)?.primary?.model).not.toHaveProperty("projects");
    await expect(controller.runPrimaryCompanionAction(staleToken)).resolves.toBe(false);
    expect(panel.webview.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "requestConfiguration" }));
  });

  it("Primary 预检先原子读取 Right 最新草稿，首个 await 前锁住双击，并沿用正式校验与 Output", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    panel.fireMessage({ type: "ready", documentId: "action-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    panel.fireMessage({
      type: "draftChanged",
      documentId: "action-document",
      draftRevision: 1,
      configuration: draft({ rootDirectory: "/old/root" }),
    });
    await vi.waitFor(() => expect(snapshots.at(-1)?.actions.find(({ id }) => id === "preflight")?.enabled).toBe(true));
    const token = actionToken(snapshots.at(-1)!, "preflight");

    const first = controller.runPrimaryCompanionAction(token);
    const duplicate = controller.runPrimaryCompanionAction(token);
    await expect(duplicate).resolves.toBe(false);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "preflight")?.enabled).toBe(false);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "start")?.enabled).toBe(false);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "stop")?.enabled).toBe(true);

    const request = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; documentId?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    expect(request).toMatchObject({ type: "requestConfiguration", documentId: "action-document" });
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: request.requestId,
      documentId: "action-document",
      draftRevision: 2,
      configuration: draft({ rootDirectory: "", workingDirectory: "/latest/unsaved" }),
    });

    await expect(first).resolves.toBe(true);
    await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe("error"));
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/latest/unsaved" });
    expect(mocks.outputLines).toContain("[Auto Build] 预检失败：ROOT_DIR 不能为空。");
    expect(mocks.outputShow).toHaveBeenCalledWith(true);
    expect(mocks.outputLines.filter((line) => line === "[Auto Build] action received: preflight")).toHaveLength(1);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "preflight")?.enabled).toBe(true);
  });

  it("Right 自身预检也进入同一执行门禁，并忽略错误 document 的动作", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    panel.fireMessage({ type: "ready", documentId: "right-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));

    panel.fireMessage({
      type: "preflight",
      documentId: "old-document",
      draftRevision: 1,
      configuration: draft({ rootDirectory: "" }),
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mocks.outputLines).not.toContain("[Auto Build] action received: preflight");

    panel.fireMessage({
      type: "preflight",
      documentId: "right-document",
      draftRevision: 1,
      configuration: draft({ rootDirectory: "" }),
    });
    await vi.waitFor(() => expect(mocks.outputLines).toContain("[Auto Build] action received: preflight"));
    await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe("error"));
    expect(mocks.outputLines).toContain("[Auto Build] 预检失败：ROOT_DIR 不能为空。");
  });

  it("停止会取消尚未返回的 Primary 配置请求，并忽略迟到快照", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    panel.fireMessage({ type: "ready", documentId: "cancel-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const current = draft({ workingDirectory: "/workspace/current" });
    panel.fireMessage({ type: "draftChanged", documentId: "cancel-document", draftRevision: 1, configuration: current });
    await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/current" }));

    const pending = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "preflight"));
    await vi.waitFor(() => expect(snapshots.at(-1)?.actions.find(({ id }) => id === "stop")?.enabled).toBe(true));
    const request = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    await expect(controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "stop"))).resolves.toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(snapshots.at(-1)).toMatchObject({ status: "idle" });
    expect(mocks.outputLines).not.toContain(expect.stringContaining("无法读取右侧当前配置"));

    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: request.requestId,
      documentId: "cancel-document",
      draftRevision: 2,
      configuration: draft({ workingDirectory: "/workspace/late" }),
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/current" });
  });

  it("相同草稿 revision 只接受完全相同的配置快照", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    panel.fireMessage({ type: "ready", documentId: "same-revision-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const current = draft({ workingDirectory: "/workspace/current" });
    panel.fireMessage({ type: "draftChanged", documentId: "same-revision-document", draftRevision: 1, configuration: current });
    await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/current" }));

    const pending = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "preflight"));
    const request = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: request.requestId,
      documentId: "same-revision-document",
      draftRevision: 1,
      configuration: draft({ workingDirectory: "/workspace/forged" }),
    });

    await expect(pending).resolves.toBe(true);
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/current" });
    expect(snapshots.at(-1)?.status).toBe("error");
    expect(mocks.outputLines).not.toContain("[Auto Build] 配置摘要：Root=/missing/root; RootBranch=develop; 3rdParty=/missing/third-party; Branch=develop; 项目=0; CMake=0; CAA=0; Clean=false");
  });

  it("Primary 保存原子读取当前草稿，并在写盘后清除 dirty", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ktc-auto-build-save-"));
    try {
      const path = join(directory, "auto-build.json");
      mocks.showSaveDialog.mockResolvedValue(vscode.Uri.file(path));
      const panel = fakePanel();
      mocks.createWebviewPanel.mockReturnValue(panel);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory(),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      await controller.show(directory);
      panel.fireMessage({ type: "ready", documentId: "save-document" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      const current = draft({
        workingDirectory: directory,
        rootCleanupYaml: "delete:\n  directories:\n    - objects\n  files:\n    - '*.obj'",
      });
      panel.fireMessage({ type: "draftChanged", documentId: "save-document", draftRevision: 1, configuration: current });
      await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({ kind: "autoBuild", model: { configuration: { dirty: true } } }));

      const saving = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "saveConfig"));
      const request = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: request.requestId,
        documentId: "save-document",
        draftRevision: 1,
        configuration: current,
      });
      await expect(saving).resolves.toBe(true);
      expect(mocks.outputLines.filter((line) => line.includes("ERROR"))).toEqual([]);
      await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({ kind: "autoBuild", model: { configuration: { dirty: false, fullPath: path } } }));
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
        schemaVersion: 2,
        clean: false,
        workingDirectory: directory,
        rootCleanupYaml: current.rootCleanupYaml,
      });
      expect(snapshots.at(-1)?.actions.find(({ id }) => id === "saveConfig")?.enabled).toBe(false);
      expect(mocks.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
        defaultUri: expect.objectContaining({ fsPath: path }),
      }));

      const alternateWorkingDirectory = join(directory, "alternate");
      const saveAsPath = join(alternateWorkingDirectory, "auto-build.json");
      await mkdir(alternateWorkingDirectory);
      mocks.showSaveDialog.mockResolvedValue(vscode.Uri.file(saveAsPath));
      const changed = draft({ workingDirectory: alternateWorkingDirectory });
      panel.fireMessage({ type: "draftChanged", documentId: "save-document", draftRevision: 2, configuration: changed });
      await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({
        kind: "autoBuild",
        model: { configuration: { dirty: true, workingDirectoryMismatch: true } },
      }));
      expect(snapshots.at(-1)?.actions.find(({ id }) => id === "saveConfig")?.enabled).toBe(false);
      expect(snapshots.at(-1)?.actions.find(({ id }) => id === "saveAsConfig")?.enabled).toBe(false);

      const migrating = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "keepProjectsForDirectory"));
      const migrateRequest = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string; action?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      expect(migrateRequest.action).toBe("keepProjectsForDirectory");
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: migrateRequest.requestId,
        documentId: "save-document",
        draftRevision: 2,
        configuration: changed,
      });
      await expect(migrating).resolves.toBe(true);
      await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({
        kind: "autoBuild",
        model: { configuration: { dirty: true, workingDirectoryMismatch: false } },
      }));
      const migrated = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
        .reverse()
        .find(({ type }) => type === "configuration")!.configuration!;
      panel.fireMessage({
        type: "draftChanged",
        documentId: "save-document",
        draftRevision: 3,
        configuration: migrated,
      });
      await vi.waitFor(() => expect(snapshots.at(-1)?.actions.find(({ id }) => id === "saveAsConfig")?.enabled).toBe(true));

      const savingAs = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "saveAsConfig"));
      const saveAsRequest = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string; action?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      expect(saveAsRequest.action).toBe("saveAsConfig");
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: saveAsRequest.requestId,
        documentId: "save-document",
        draftRevision: 3,
        configuration: migrated,
      });
      await expect(savingAs).resolves.toBe(true);
      expect(mocks.outputLines.filter((line) => line.includes("ERROR"))).toEqual([]);
      expect(mocks.showSaveDialog).toHaveBeenLastCalledWith(expect.objectContaining({
        defaultUri: expect.objectContaining({ fsPath: saveAsPath }),
      }));
      expect(JSON.parse(await readFile(saveAsPath, "utf8"))).toMatchObject({ workingDirectory: alternateWorkingDirectory });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("关闭配置原子读取草稿，保存取消时保留原配置，选择不保存后回到 fresh draft", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const state = memory();
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      state,
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/default");
    panel.fireMessage({ type: "ready", documentId: "close-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const changed = draft({
      workingDirectory: "/workspace/default",
      rootBranch: "release",
      projects: [{
        id: "kept-until-close",
        enabled: true,
        name: "Keep until close",
        path: "Keep",
        branch: "develop",
        operations: { update: true, cmake: true, caa: false, linkCaa: false },
      }],
    });
    panel.fireMessage({ type: "draftChanged", documentId: "close-document", draftRevision: 1, configuration: changed });
    await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({ kind: "autoBuild", model: { configuration: { dirty: true } } }));

    mocks.showWarningMessage.mockResolvedValueOnce("保存");
    mocks.showSaveDialog.mockResolvedValueOnce(undefined);
    const cancelledClose = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "closeConfig"));
    const firstRequest = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; action?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    expect(firstRequest.action).toBe("closeConfig");
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: firstRequest.requestId,
      documentId: "close-document",
      draftRevision: 1,
      configuration: changed,
    });
    await expect(cancelledClose).resolves.toBe(true);
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "项目", value: "1 个" });
    expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "status",
      text: expect.stringContaining("已取消关闭"),
    }));

    mocks.showWarningMessage.mockResolvedValueOnce("不保存");
    const confirmedClose = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "closeConfig"));
    const secondRequest = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; action?: string })
      .reverse()
      .find(({ type, requestId }) => type === "requestConfiguration" && requestId !== firstRequest.requestId)!;
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: secondRequest.requestId,
      documentId: "close-document",
      draftRevision: 1,
      configuration: changed,
    });
    await expect(confirmedClose).resolves.toBe(true);
    await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "项目", value: "0 个" }));
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/default" });
    expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "status",
      text: expect.stringContaining("已关闭当前配置"),
    }));
    expect(panel.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "configuration",
      path: "",
      configuration: expect.objectContaining({ projects: [], workingDirectory: "/workspace/default" }),
    }));
  });

  it("关闭未改动的 fresh draft 不弹保存确认", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/default");
    panel.fireMessage({ type: "ready", documentId: "pristine-close-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const initial = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
      .find(({ type }) => type === "configuration")!.configuration!;
    const closing = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "closeConfig"));
    const request = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: request.requestId,
      documentId: "pristine-close-document",
      draftRevision: 0,
      configuration: initial,
    });
    await expect(closing).resolves.toBe(true);
    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
  });

  it("工作目录改变后进入显式迁移门禁，Right 路径动作被拒绝，保留项目会清除派生状态", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/old");
    panel.fireMessage({ type: "ready", documentId: "mismatch-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const projectWithProbe = {
      id: "project",
      enabled: true,
      name: "Project",
      path: "Project",
      branch: "develop",
      operations: { update: true, cmake: true, caa: false, linkCaa: false },
      probe: { capturedAt: "now", branch: "develop", commit: "abc", origin: "origin", status: "clean" as const },
    };
    panel.fireMessage({
      type: "draftChanged",
      documentId: "mismatch-document",
      draftRevision: 1,
      configuration: draft({ workingDirectory: "/workspace/old", projects: [projectWithProbe] }),
    });
    const mismatched = draft({
      workingDirectory: "/workspace/new",
      projects: [projectWithProbe],
      repositorySnapshot: {
        capturedAt: "now",
        repositories: [{ role: "CMake", path: "/workspace/old/Project", branch: "develop", commit: "abc", origin: "origin" }],
      },
    });
    panel.fireMessage({ type: "draftChanged", documentId: "mismatch-document", draftRevision: 2, configuration: mismatched });
    await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({
      kind: "autoBuild",
      model: { configuration: { workingDirectoryMismatch: true } },
    }));
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "preflight")?.enabled).toBe(false);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "saveConfig")?.enabled).toBe(false);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "saveAsConfig")?.enabled).toBe(false);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "newConfigForDirectory")?.enabled).toBe(true);
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "keepProjectsForDirectory")?.enabled).toBe(true);

    mocks.showWarningMessage.mockResolvedValueOnce("保存");
    const closing = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "closeConfig"));
    const closeRequest = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; action?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    expect(closeRequest.action).toBe("closeConfig");
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: closeRequest.requestId,
      documentId: "mismatch-document",
      draftRevision: 2,
      configuration: mismatched,
    });
    await expect(closing).resolves.toBe(true);
    expect(mocks.showSaveDialog).not.toHaveBeenCalled();
    expect(snapshots.at(-1)?.status).toBe("error");
    expect(mocks.outputLines).toContainEqual(expect.stringContaining("请先在 Primary 选择"));
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "项目", value: "1 个" });
    expect(snapshots.at(-1)?.primary).toMatchObject({
      kind: "autoBuild",
      model: { configuration: { workingDirectoryMismatch: true } },
    });

    panel.fireMessage({ type: "discoverProjectDirectories", documentId: "mismatch-document", draftRevision: 2, configuration: mismatched });
    await vi.waitFor(() => expect(snapshots.at(-1)?.status).toBe("error"));
    expect(mocks.outputLines).toContainEqual(expect.stringContaining("请先在 Primary 选择"));
    expect(mocks.showOpenDialog).not.toHaveBeenCalled();

    const keep = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "keepProjectsForDirectory"));
    const request = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; action?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    expect(request.action).toBe("keepProjectsForDirectory");
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: request.requestId,
      documentId: "mismatch-document",
      draftRevision: 2,
      configuration: mismatched,
    });
    await expect(keep).resolves.toBe(true);
    await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({
      kind: "autoBuild",
      model: { configuration: { workingDirectoryMismatch: false } },
    }));
    const migrated = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
      .reverse()
      .find(({ type }) => type === "configuration")!.configuration!;
    expect(migrated.workingDirectory).toBe("/workspace/new");
    expect(migrated.repositorySnapshot).toBeUndefined();
    expect(migrated.projects).toHaveLength(1);
    expect(migrated.projects[0]).not.toHaveProperty("probe");

    const changedAgain = draft({ ...migrated, workingDirectory: "/workspace/newer" });
    panel.fireMessage({ type: "draftChanged", documentId: "mismatch-document", draftRevision: 3, configuration: changedAgain });
    await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({
      kind: "autoBuild",
      model: { configuration: { workingDirectoryMismatch: true } },
    }));
    const create = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "newConfigForDirectory"));
    const createRequest = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; action?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    expect(createRequest.action).toBe("newConfigForDirectory");
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: createRequest.requestId,
      documentId: "mismatch-document",
      draftRevision: 3,
      configuration: changedAgain,
    });
    await expect(create).resolves.toBe(true);
    const fresh = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; path?: string; configuration?: KtcAutoBuildConfiguration })
      .reverse()
      .find(({ type }) => type === "configuration")!;
    expect(fresh.path).toBe("");
    expect(fresh.configuration).toMatchObject({ workingDirectory: "/workspace/newer", projects: [] });
    expect(fresh.configuration?.repositorySnapshot).toBeUndefined();
  });

  it("无项目 fresh draft 可以自然切换工作目录，不进入迁移门禁", async () => {
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/old");
    panel.fireMessage({ type: "ready", documentId: "fresh-directory-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    panel.fireMessage({
      type: "draftChanged",
      documentId: "fresh-directory-document",
      draftRevision: 1,
      configuration: draft({ workingDirectory: "/workspace/new", projects: [] }),
    });
    await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/new" }));
    expect(snapshots.at(-1)?.primary).toMatchObject({
      kind: "autoBuild",
      model: { configuration: { workingDirectoryMismatch: false } },
    });
    expect(snapshots.at(-1)?.actions.find(({ id }) => id === "preflight")?.enabled).toBe(true);
  });

  it("打开其他配置前保护未保存草稿，取消时不打开文件选择器", async () => {
    mocks.showWarningMessage.mockResolvedValue(undefined);
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(
      vscode.Uri.file("/extension"),
      memory(),
      { onDidChange: (snapshot) => snapshots.push(snapshot) },
    );
    await controller.show("/workspace/project");
    panel.fireMessage({ type: "ready", documentId: "discard-document" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const opening = controller.runPrimaryCompanionAction(actionToken(snapshots.at(-1)!, "openConfig"));
    const request = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; requestId?: string; action?: string })
      .reverse()
      .find(({ type }) => type === "requestConfiguration")!;
    expect(request.action).toBe("openConfig");
    panel.fireMessage({
      type: "configurationSnapshot",
      requestId: request.requestId,
      documentId: "discard-document",
      draftRevision: 1,
      configuration: draft({ workingDirectory: "/workspace/unsaved" }),
    });
    await expect(opening).resolves.toBe(true);
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("未保存修改"),
      { modal: true },
      "放弃修改",
    );
    expect(mocks.showOpenDialog).not.toHaveBeenCalled();
    expect(snapshots.at(-1)?.summary).toContainEqual({ label: "目录", value: "/workspace/unsaved" });
  });

  it("另存默认位置忽略当前 Host 不可访问的 Windows 路径并允许系统回退", async () => {
    const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory());
    const testPort = controller as unknown as {
      defaultSaveUri(configuration: KtcAutoBuildConfiguration): Promise<vscode.Uri | undefined>;
    };
    await expect(testPort.defaultSaveUri(draft({
      workingDirectory: "E:/Windows-only/project",
    }))).resolves.toBeUndefined();
  });

  it("另存默认位置依次采用当前草稿工作目录、当前 JSON 目录和插件工作目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-auto-build-save-location-"));
    try {
      const viewDirectory = join(root, "view");
      const jsonDirectory = join(root, "json");
      const pluginDirectory = join(root, "plugin");
      await Promise.all([mkdir(viewDirectory), mkdir(jsonDirectory), mkdir(pluginDirectory)]);
      const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory());
      const testPort = controller as unknown as {
        currentPath: string;
        defaultWorkingDirectory: string;
        defaultSaveUri(configuration: KtcAutoBuildConfiguration): Promise<vscode.Uri | undefined>;
      };
      testPort.currentPath = join(jsonDirectory, "named.json");
      testPort.defaultWorkingDirectory = pluginDirectory;
      await expect(testPort.defaultSaveUri(draft({ workingDirectory: viewDirectory })))
        .resolves.toMatchObject({ fsPath: join(viewDirectory, "named.json") });
      await expect(testPort.defaultSaveUri(draft({ workingDirectory: join(root, "missing") })))
        .resolves.toMatchObject({ fsPath: join(jsonDirectory, "named.json") });
      testPort.currentPath = "";
      await expect(testPort.defaultSaveUri(draft({ workingDirectory: join(root, "missing") })))
        .resolves.toMatchObject({ fsPath: join(pluginDirectory, "auto-build.json") });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("工作目录比较保留 POSIX 根路径与大小写，仅折叠 Windows 风格路径大小写", () => {
    const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory());
    const testPort = controller as unknown as {
      normalizeWorkingDirectory(value: string | undefined): string;
    };
    expect(testPort.normalizeWorkingDirectory("/")).toBe("/");
    expect(testPort.normalizeWorkingDirectory("////")).toBe("/");
    if (process.platform === "win32") {
      expect(testPort.normalizeWorkingDirectory("/Workspace/Case/")).toBe("/workspace/case");
    } else {
      expect(testPort.normalizeWorkingDirectory("/Workspace/Case/")).toBe("/Workspace/Case");
      expect(testPort.normalizeWorkingDirectory("/Workspace/Case"))
        .not.toBe(testPort.normalizeWorkingDirectory("/workspace/case"));
    }
    expect(testPort.normalizeWorkingDirectory("C:\\Workspace\\Case\\")).toBe("c:/workspace/case");
    expect(testPort.normalizeWorkingDirectory("\\\\Server\\Share\\Case\\")).toBe("//server/share/case");
    expect(testPort.normalizeWorkingDirectory("D:\\")).toBe("d:/");
  });

  it("旧 schema v2 clean 标记只迁移为手动清理，不会随预检或启动继续生效", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-auto-build-legacy-root-"));
    const third = await mkdtemp(join(tmpdir(), "ktc-auto-build-legacy-third-"));
    try {
      const panel = fakePanel();
      mocks.createWebviewPanel.mockReturnValue(panel);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory(),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      await controller.show(root);
      panel.fireMessage({ type: "ready", documentId: "legacy-clean-document" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      const legacy = draft({ rootDirectory: root, thirdPartyDirectory: third, workingDirectory: root, clean: true });
      panel.fireMessage({ type: "draftChanged", documentId: "legacy-clean-document", draftRevision: 1, configuration: legacy });
      panel.fireMessage({ type: "preflight", documentId: "legacy-clean-document", draftRevision: 1, configuration: legacy });
      await vi.waitFor(() => expect(mocks.outputLines.some((line) => line.includes("配置摘要：") && line.endsWith("Clean=false"))).toBe(true));
      expect(mocks.outputLines.some((line) => line.includes("配置摘要：") && line.endsWith("Clean=true"))).toBe(false);
      expect(mocks.outputLines).toContainEqual(expect.stringContaining("旧配置中的自动清理已关闭"));
      expect(mocks.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining("旧配置中的自动清理已关闭"));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(third, { recursive: true, force: true });
    }
  });

  it("统一对话框把 Git 与两类 CMake 目标路由到对应 Wing 能力", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-auto-build-cleanup-modes-root-"));
    const working = await mkdtemp(join(tmpdir(), "ktc-auto-build-cleanup-modes-working-"));
    try {
      const projectPath = join(working, "KtCore");
      const sharedBuild = join(working, "build");
      await mkdir(projectPath);
      await mkdir(sharedBuild);
      mocks.environmentValues = [{ key: "customRoot", value: root }];
      const panel = fakePanel();
      mocks.createWebviewPanel.mockReturnValue(panel);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory(),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      await controller.show(working);
      panel.fireMessage({ type: "ready", documentId: "cleanup-modes-document" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      const initial = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
        .find(({ type }) => type === "configuration")!.configuration!;
      const configuration = draft({
        ...initial,
        rootDirectory: root,
        workingDirectory: working,
        projects: [{
          id: "core",
          enabled: true,
          name: "KtCore",
          path: "KtCore",
          branch: "develop",
          operations: { update: true, cmake: true, caa: false, linkCaa: false },
        }],
      });
      panel.fireMessage({
        type: "draftChanged",
        documentId: "cleanup-modes-document",
        draftRevision: 1,
        configuration,
      });
      await vi.waitFor(() => expect(snapshots.at(-1)?.summary).toContainEqual({ label: "项目", value: "1 个" }));

      const gitRequest = { modeId: "git-force", targetIds: ["git:root"], rulesYaml: "" } as const;
      const gitPreview = controller.runPrimaryCompanionAction({
        ...actionToken(snapshots.at(-1)!, "cleanupDialog"),
        payload: { kind: "preview", request: gitRequest },
      });
      const gitConfigurationRequest = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: gitConfigurationRequest.requestId,
        documentId: "cleanup-modes-document",
        draftRevision: 1,
        configuration,
      });
      await expect(gitPreview).resolves.toBe(true);
      expect(mocks.previewGitForcedCleanup).toHaveBeenCalledWith(root);

      const cmakeRequest = {
        modeId: "cmake",
        targetIds: ["cmake:project:core", "cmake:shared"],
        rulesYaml: "",
      } as const;
      const cmakePreview = controller.runPrimaryCompanionAction({
        ...actionToken(snapshots.at(-1)!, "cleanupDialog"),
        payload: { kind: "preview", request: cmakeRequest },
      });
      const cmakeConfigurationRequest = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: cmakeConfigurationRequest.requestId,
        documentId: "cleanup-modes-document",
        draftRevision: 1,
        configuration,
      });
      await expect(cmakePreview).resolves.toBe(true);
      expect(mocks.previewCleanupArtifacts).toHaveBeenCalledWith(
        projectPath,
        "delete:\n  directories:\n    - build\n  files: []",
      );
      expect(mocks.previewDirectoryContents).toHaveBeenCalledWith(sharedBuild);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(working, { recursive: true, force: true });
    }
  });

  it("统一清理对话框先冻结规则命中，再用同一 token 执行", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-auto-build-root-clean-"));
    try {
      mocks.environmentValues = [{ key: "customRoot", value: root }];
      mocks.previewCleanupArtifacts.mockResolvedValue({ root, matched: [join(root, "build")] });
      const panel = fakePanel();
      mocks.createWebviewPanel.mockReturnValue(panel);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory(),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      await controller.show(root);
      panel.fireMessage({ type: "ready", documentId: "cleanup-document" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      const configuration = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
        .find(({ type }) => type === "configuration")!.configuration!;
      const request = { modeId: "rules", targetIds: ["rules:root"], rulesYaml: "- XyCore*" } as const;
      const previewing = controller.runPrimaryCompanionAction({
        ...actionToken(snapshots.at(-1)!, "cleanupDialog"),
        payload: { kind: "preview", request },
      });
      const configurationRequest = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string; action?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      expect(configurationRequest.action).toBe("cleanupDialog");
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: configurationRequest.requestId,
        documentId: "cleanup-document",
        draftRevision: 0,
        configuration,
      });
      await expect(previewing).resolves.toBe(true);
      expect(mocks.previewCleanupArtifacts).toHaveBeenCalledWith(root, "- XyCore*");
      const primaryAfterPreview = snapshots.at(-1)?.primary;
      const cleanup = primaryAfterPreview?.kind === "autoBuild"
        ? primaryAfterPreview.model.cleanup
        : undefined;
      expect(cleanup).toMatchObject({
        selectedModeId: "rules",
        rulesYaml: "- XyCore*",
        preview: { state: "ready", token: expect.any(String), items: [expect.stringContaining("build")] },
        executeEnabled: true,
      });
      const previewToken = cleanup!.preview.token!;
      await expect(controller.runPrimaryCompanionAction({
        ...actionToken(snapshots.at(-1)!, "cleanupDialog"),
        payload: { kind: "execute", request, previewToken },
      })).resolves.toBe(true);
      expect(mocks.cleanPreviewedArtifacts).toHaveBeenCalledWith(
        expect.objectContaining({ root, matched: [join(root, "build")] }),
        expect.objectContaining({ shouldContinue: expect.any(Function) }),
      );
      expect(snapshots.at(-1)?.primary).toMatchObject({
        kind: "autoBuild",
        model: { cleanup: { preview: { state: "complete" }, executeEnabled: false } },
      });
      expect(mocks.outputLines).toContainEqual(expect.stringContaining(`删除 ${join(root, "build")}`));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  async function cleanupCancellationFixture() {
    const root = await mkdtemp(join(tmpdir(), "ktc-cleanup-cancellation-"));
    const working = join(root, "workspace");
    await mkdir(working);
    mocks.environmentValues = [{ key: "customRoot", value: root }];
    const panel = fakePanel();
    mocks.createWebviewPanel.mockReturnValue(panel);
    const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
    const controller = new KtcAutoBuildViewController(vscode.Uri.file("/extension"), memory(), {
      onDidChange: (snapshot) => snapshots.push(snapshot),
    });
    await controller.show(working);
    panel.fireMessage({ type: "ready", documentId: "cleanup-cancel-fixture" });
    await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
    const configuration = vi.mocked(panel.webview.postMessage).mock.calls
      .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
      .find(({ type }) => type === "configuration")!.configuration!;
    const request = { modeId: "rules", targetIds: ["rules:root", "rules:working"], rulesYaml: "- Generated*" } as const;
    const cleanup = () => {
      const primary = snapshots.at(-1)!.primary;
      if (primary?.kind !== "autoBuild") throw new Error("Missing AutoBuild projection");
      return primary.model.cleanup;
    };
    const preview = (previewRequest: KtcAutoBuildCleanupDialogRequest = request) => {
      const action = actionToken(snapshots.at(-1)!, "cleanupDialog");
      const pending = controller.runPrimaryCompanionAction({ ...action, payload: { kind: "preview", request: previewRequest } });
      const message = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([value]) => value as { type?: string; requestId?: string }).reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      panel.fireMessage({ type: "configurationSnapshot", requestId: message.requestId,
        documentId: "cleanup-cancel-fixture", draftRevision: 0, configuration });
      return { action, pending };
    };
    return { root, controller, snapshots, request, preview, cleanup, async dispose() {
      controller.dispose(); await rm(root, { recursive: true, force: true });
    } };
  }

  it("取消已确认预览立即废弃冻结 token，不启动删除", async () => {
    const fixture = await cleanupCancellationFixture();
    try {
      await expect(fixture.preview().pending).resolves.toBe(true);
      const previewToken = fixture.cleanup().preview.token!;
      await expect(fixture.controller.runPrimaryCompanionAction({
        ...actionToken(fixture.snapshots.at(-1)!, "cleanupDialog"), payload: { kind: "cancel" },
      })).resolves.toBe(true);
      expect(fixture.cleanup()).toMatchObject({ preview: { state: "idle" }, executeEnabled: false });
      expect(fixture.cleanup().preview.token).toBeUndefined();
      await fixture.controller.runPrimaryCompanionAction({
        ...actionToken(fixture.snapshots.at(-1)!, "cleanupDialog"),
        payload: { kind: "execute", request: fixture.request, previewToken },
      });
      expect(mocks.cleanPreviewedArtifacts).not.toHaveBeenCalled();
      expect(mocks.executeGitForcedCleanup).not.toHaveBeenCalled();
      expect(mocks.outputLines).toContainEqual(expect.stringContaining("冻结结果已失效"));
    } finally { await fixture.dispose(); }
  });

  it("等待配置快照时取消立即结束预览请求，不调用 Wing 或启动删除", async () => {
    const fixture = await cleanupCancellationFixture();
    try {
      const action = actionToken(fixture.snapshots.at(-1)!, "cleanupDialog");
      const pending = fixture.controller.runPrimaryCompanionAction({
        ...action, payload: { kind: "preview", request: fixture.request },
      });
      await expect(fixture.controller.runPrimaryCompanionAction({ ...action, payload: { kind: "cancel" } })).resolves.toBe(true);
      await expect(pending).resolves.toBe(true);
      expect(mocks.previewCleanupArtifacts).not.toHaveBeenCalled();
      expect(mocks.cleanPreviewedArtifacts).not.toHaveBeenCalled();
      expect(fixture.snapshots.at(-1)!.status).toBe("idle");
      expect(fixture.cleanup().preview.token).toBeUndefined();
    } finally { await fixture.dispose(); }
  });

  it("预览中取消可使用同一操作的稍旧 revision，延迟结果不会复活 ready", async () => {
    const fixture = await cleanupCancellationFixture();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.previewCleanupArtifacts.mockImplementation(async (root: string) => {
      await gate;
      return { root, matched: [join(root, "Generated.obj")] };
    });
    try {
      const { action, pending } = fixture.preview();
      await vi.waitFor(() => expect(mocks.previewCleanupArtifacts).toHaveBeenCalledOnce());
      expect(fixture.snapshots.at(-1)!.actions.find(({ id }) => id === "cleanupDialog")!.enabled).toBe(false);
      await expect(fixture.controller.runPrimaryCompanionAction({ ...action, payload: { kind: "cancel" } })).resolves.toBe(true);
      release();
      await expect(pending).resolves.toBe(true);
      expect(fixture.cleanup().preview.state).toBe("idle");
      expect(fixture.cleanup().preview.token).toBeUndefined();
      expect(mocks.previewCleanupArtifacts).toHaveBeenCalledOnce();
      expect(mocks.cleanPreviewedArtifacts).not.toHaveBeenCalled();
      expect(fixture.snapshots.at(-1)!.status).toBe("idle");
      expect(mocks.outputLines.some((line) => line.includes("ERROR"))).toBe(false);
    } finally { release(); await fixture.dispose(); }
  });

  it("执行中取消通知 Wing 并停止下一目标，保留已删结果且不伪报完成", async () => {
    const fixture = await cleanupCancellationFixture();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let shouldContinue: (() => boolean) | undefined;
    mocks.cleanPreviewedArtifacts.mockImplementation(async (preview: { root: string; matched: readonly string[] }, options: { shouldContinue: () => boolean }) => {
      shouldContinue = options.shouldContinue;
      await gate;
      return { root: preview.root, deleted: preview.matched };
    });
    try {
      const firstPreviewAction = fixture.preview();
      await expect(firstPreviewAction.pending).resolves.toBe(true);
      const executionAction = actionToken(fixture.snapshots.at(-1)!, "cleanupDialog");
      const pending = fixture.controller.runPrimaryCompanionAction({
        ...executionAction, payload: { kind: "execute", request: fixture.request, previewToken: fixture.cleanup().preview.token! },
      });
      await vi.waitFor(() => expect(mocks.cleanPreviewedArtifacts).toHaveBeenCalledOnce());
      expect(shouldContinue?.()).toBe(true);
      // A delayed Cancel from the preceding preview must not stop this newer Execute.
      await expect(fixture.controller.runPrimaryCompanionAction({
        ...firstPreviewAction.action, payload: { kind: "cancel" },
      })).resolves.toBe(false);
      await expect(fixture.controller.runPrimaryCompanionAction({
        ...executionAction, payload: { kind: "cancel" },
      })).resolves.toBe(true);
      expect(shouldContinue?.()).toBe(false);
      release();
      await expect(pending).resolves.toBe(true);
      expect(mocks.cleanPreviewedArtifacts).toHaveBeenCalledOnce();
      expect(fixture.cleanup().preview).toMatchObject({ state: "idle", items: [expect.stringContaining("删除")] });
      expect(fixture.snapshots.at(-1)!.status).toBe("idle");
      expect(mocks.outputLines).toContainEqual(expect.stringContaining("已删除内容不会恢复"));
      expect(mocks.outputLines.some((line) => line.includes("ERROR") || line.endsWith("清理完成。"))).toBe(false);
    } finally { release(); await fixture.dispose(); }
  });

  it("取消 Git 清理保留 Wing 的已完成 reset/未运行 clean 阶段日志", async () => {
    const fixture = await cleanupCancellationFixture();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const phaseMessage = "Git reset --hard 已完成；未继续 clean，不自动回滚已完成的 reset。";
    let shouldContinue: (() => boolean) | undefined;
    mocks.executeGitForcedCleanup.mockImplementation(async (_preview: unknown, options: { shouldContinue: () => boolean }) => {
      shouldContinue = options.shouldContinue;
      await gate;
      throw new Error(phaseMessage);
    });
    try {
      const request = { modeId: "git-force", targetIds: ["git:root"], rulesYaml: "" } as const;
      await expect(fixture.preview(request).pending).resolves.toBe(true);
      const action = actionToken(fixture.snapshots.at(-1)!, "cleanupDialog");
      const pending = fixture.controller.runPrimaryCompanionAction({
        ...action, payload: { kind: "execute", request, previewToken: fixture.cleanup().preview.token! },
      });
      await vi.waitFor(() => expect(mocks.executeGitForcedCleanup).toHaveBeenCalledOnce());
      await expect(fixture.controller.runPrimaryCompanionAction({ ...action, payload: { kind: "cancel" } })).resolves.toBe(true);
      expect(shouldContinue?.()).toBe(false);
      release();
      await expect(pending).resolves.toBe(true);
      const stageLog = mocks.outputLines.findIndex((line) => line.includes(phaseMessage));
      const finalLog = mocks.outputLines.findIndex((line) => line.includes("清理已取消；已删除内容不会恢复"));
      expect(stageLog).toBeGreaterThanOrEqual(0);
      expect(finalLog).toBeGreaterThan(stageLog);
      expect(fixture.snapshots.at(-1)!.status).toBe("idle");
      expect(fixture.cleanup().preview.token).toBeUndefined();
      expect(mocks.cleanPreviewedArtifacts).not.toHaveBeenCalled();
    } finally { release(); await fixture.dispose(); }
  });

  it("配置变化会使冻结的清理预览过期并拒绝执行", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-auto-build-root-cancel-"));
    try {
      mocks.environmentValues = [{ key: "customRoot", value: root }];
      const panel = fakePanel();
      mocks.createWebviewPanel.mockReturnValue(panel);
      const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [];
      const controller = new KtcAutoBuildViewController(
        vscode.Uri.file("/extension"),
        memory(),
        { onDidChange: (snapshot) => snapshots.push(snapshot) },
      );
      await controller.show(root);
      panel.fireMessage({ type: "ready", documentId: "cleanup-cancel-document" });
      await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
      const configuration = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; configuration?: KtcAutoBuildConfiguration })
        .find(({ type }) => type === "configuration")!.configuration!;
      const request = { modeId: "rules", targetIds: ["rules:root"], rulesYaml: "- Kt*" } as const;
      const previewing = controller.runPrimaryCompanionAction({
        ...actionToken(snapshots.at(-1)!, "cleanupDialog"),
        payload: { kind: "preview", request },
      });
      const configurationRequest = vi.mocked(panel.webview.postMessage).mock.calls
        .map(([message]) => message as { type?: string; requestId?: string })
        .reverse()
        .find(({ type }) => type === "requestConfiguration")!;
      panel.fireMessage({
        type: "configurationSnapshot",
        requestId: configurationRequest.requestId,
        documentId: "cleanup-cancel-document",
        draftRevision: 0,
        configuration,
      });
      await expect(previewing).resolves.toBe(true);
      const primaryAfterPreview = snapshots.at(-1)?.primary;
      const cleanup = primaryAfterPreview?.kind === "autoBuild"
        ? primaryAfterPreview.model.cleanup
        : undefined;
      const previewToken = cleanup!.preview.token!;
      panel.fireMessage({
        type: "draftChanged",
        documentId: "cleanup-cancel-document",
        draftRevision: 1,
        configuration: { ...configuration, rootBranch: "release" },
      });
      await vi.waitFor(() => expect(snapshots.at(-1)?.primary).toMatchObject({
        kind: "autoBuild",
        model: { cleanup: { preview: { state: "idle" }, executeEnabled: false } },
      }));
      await expect(controller.runPrimaryCompanionAction({
        ...actionToken(snapshots.at(-1)!, "cleanupDialog"),
        payload: { kind: "execute", request, previewToken },
      })).resolves.toBe(true);
      expect(mocks.cleanPreviewedArtifacts).not.toHaveBeenCalled();
      expect(mocks.outputLines).toContainEqual(expect.stringContaining("清理预览已过期"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
