import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolRunContext, ToolUiState } from "../types.js";

const mocks = vi.hoisted(() => ({
  workspace: { isTrusted: true },
  tasks: { taskExecutions: [] as unknown[] },
  recursivePreview: vi.fn(), recursiveExecute: vi.fn(), gitPreview: vi.fn(), gitExecute: vi.fn(),
}));
vi.mock("vscode", () => ({ workspace: mocks.workspace, tasks: mocks.tasks }));
vi.mock("@phoenix-wing/run-node", () => ({
  pnwPreviewRecursiveCleanupArtifacts: mocks.recursivePreview,
  pnwCleanPreviewedRecursiveArtifacts: mocks.recursiveExecute,
  pnwPreviewGitUntrackedCleanup: mocks.gitPreview,
  pnwExecuteGitUntrackedCleanup: mocks.gitExecute,
}));

import { KtcRunController } from "./KtcRunController.js";
import { KtcCreateRunCleanupModel, KtcParseRunCleanupPayload, type KtcRunCleanupPayload } from "./KtcRunCleanup.js";
import { KtcParseRunAction } from "./KtcRunTool.js";

const roots: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.isTrusted = true;
  mocks.tasks.taskExecutions = [];
  mocks.recursivePreview.mockImplementation(async (root: string) => ({ root, matched: [join(root, "build")], skippedPaths: [join(root, ".git")] }));
  mocks.recursiveExecute.mockImplementation(async (preview: { root: string }) => ({ root: preview.root, deleted: [join(preview.root, "build")] }));
  mocks.gitPreview.mockImplementation(async (root: string) => ({ root, repositories: [
    { repository: root, untrackedAndIgnored: ["ignored/output.obj"], preservedRepositories: [join(root, "nested")] },
  ] }));
  mocks.gitExecute.mockImplementation(async (preview: { root: string }) => ({ root: preview.root, repositories: [
    { repository: preview.root, deleted: [join(preview.root, "ignored/output.obj")], cleanOutput: "Removing ignored/output.obj" },
  ] }));
});
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), "ktc-run-cleanup-session-"));
  roots.push(temporary);
  const root = await realpath(temporary);
  const states: ToolUiState[] = [], logs: string[] = [];
  let current = true;
  const ctx: ToolRunContext = {
    workspaceRoot: root, workspaceLabel: "test", workspaceFileScopeId: "workspace", pluginIgnoreEnabled: false,
    isCurrentWorkingDirectory: () => current,
    postState: (state) => states.push(state), log: (line) => logs.push(line),
  };
  const controller = new KtcRunController();
  const projection = () => states.at(-1)!.runCleanup!;
  const send = (payload: KtcRunCleanupPayload, token = projection()) => controller.handle({
    action: "cleanupDialog", sessionId: token.sessionId, revision: token.revision, payload,
  }, ctx);
  const request = { modeId: "build", targetIds: ["workspace"], rulesYaml: "" } as const;
  return { root, controller, ctx, states, logs, projection, send, request, changeDirectory: () => { current = false; } };
}

describe("Run 统一清理 Host", () => {
  it.each(["openCleanup", "cleanGitUntracked"] as const)("%s 只打开清理对话框，绝不立即删除", async (action) => {
    const f = await fixture();
    await f.controller.handle({ action }, f.ctx);
    expect(f.projection().openRequestId).toBe(1);
    expect(f.projection().model.targets[0]!.path).toBe(f.root);
    expect(f.projection().model.executeEnabled).toBe(false);
    expect(mocks.recursivePreview).not.toHaveBeenCalled();
    expect(mocks.recursiveExecute).not.toHaveBeenCalled();
    expect(mocks.gitExecute).not.toHaveBeenCalled();
    expect(f.logs).toContainEqual(expect.stringContaining("未执行删除"));
  });

  it.each(["cleanBuild", "cleanObjects", "cleanObj"] as const)("%s 保留单击直接清理，不请求打开确认框", async (action) => {
    const f = await fixture();
    await f.controller.handle({ action }, f.ctx);
    expect(f.states.every((state) => state.runCleanup?.openRequestId === 0)).toBe(true);
    expect(mocks.recursivePreview).toHaveBeenCalledOnce();
    expect(mocks.recursiveExecute).toHaveBeenCalledOnce();
    const expected = action === "cleanBuild" ? "build" : action === "cleanObjects" ? "objects" : "*.obj";
    expect(mocks.recursivePreview.mock.calls[0]![1]).toContain(expected);
    expect(mocks.gitExecute).not.toHaveBeenCalled();
    expect(f.projection().model.preview.state).toBe("complete");
    expect(f.logs).toContainEqual(expect.stringContaining("不弹确认"));
  });

  it("预览冻结 token，执行仅将 opaque Wing 快照回传；重复执行拒绝", async () => {
    const f = await fixture();
    await f.controller.handle({ action: "openCleanup" }, f.ctx);
    await f.send({ kind: "preview", request: f.request });
    const ready = f.projection();
    expect(ready.model.preview.items).toContain(`[跳过] ${join(f.root, ".git")}`);
    const payload = { kind: "execute", request: f.request, previewToken: ready.model.preview.token! } as const;
    await f.send(payload);
    expect(mocks.recursiveExecute).toHaveBeenCalledWith(await mocks.recursivePreview.mock.results[0]!.value,
      expect.objectContaining({ shouldContinue: expect.any(Function) }));
    expect(f.projection().model.preview.state).toBe("complete");
    expect(f.logs).toContainEqual(expect.stringContaining(`删除 ${join(f.root, "build")}`));
    await f.send(payload);
    expect(mocks.recursiveExecute).toHaveBeenCalledOnce();
  });

  it("Git 模式只调用单 force/no reset 的 Wing 专用 API并显示保留仓库", async () => {
    const f = await fixture();
    const request = { ...f.request, modeId: "git-untracked" } as const;
    await f.controller.handle({ action: "cleanGitUntracked" }, f.ctx);
    await f.send({ kind: "preview", request });
    expect(f.projection().model.preview.items).toContain(`[保留嵌套仓库] ${join(f.root, "nested")}`);
    await f.send({ kind: "execute", request, previewToken: f.projection().model.preview.token! });
    expect(mocks.gitExecute).toHaveBeenCalledOnce();
    expect(mocks.recursiveExecute).not.toHaveBeenCalled();
    expect(f.projection().model.preview.state).toBe("complete");
  });

  it.each(["build", "git-untracked"] as const)("%s 预览也传递取消信号，迟到结果不得恢复授权", async (modeId) => {
    const f = await fixture();
    let finish!: () => void;
    let shouldContinue!: () => boolean;
    const pendingPreview = new Promise<void>((resolve) => { finish = resolve; });
    const capture = async (root: string, options: { shouldContinue: () => boolean }) => {
      shouldContinue = options.shouldContinue;
      await pendingPreview;
      return modeId === "build" ? { root, matched: [], skippedPaths: [] } : { root, repositories: [] };
    };
    if (modeId === "build") mocks.recursivePreview.mockImplementation((root, _yaml, options) => capture(root, options));
    else mocks.gitPreview.mockImplementation(capture);
    await f.controller.handle({ action: "openCleanup" }, f.ctx);
    const pending = f.send({ kind: "preview", request: { ...f.request, modeId } });
    expect(shouldContinue()).toBe(true);
    await f.send({ kind: "cancel" });
    expect(shouldContinue()).toBe(false);
    finish();
    await pending;
    expect(f.projection().model.preview.state).toBe("idle");
    expect(f.projection().model.preview.token).toBeUndefined();
    expect(mocks.recursiveExecute).not.toHaveBeenCalled();
    expect(mocks.gitExecute).not.toHaveBeenCalled();
  });

  it("未信任或存在运行中的 Task 时不打开清理、不调用 Wing", async () => {
    const f = await fixture();
    mocks.workspace.isTrusted = false;
    await expect(f.controller.handle({ action: "cleanBuild" }, f.ctx)).rejects.toThrow("未信任");
    mocks.workspace.isTrusted = true;
    mocks.tasks.taskExecutions = [{}];
    await expect(f.controller.handle({ action: "cleanBuild" }, f.ctx)).rejects.toThrow("Task 正在运行");
    expect(mocks.recursivePreview).not.toHaveBeenCalled();
  });

  it.each(["trust", "task", "directory"] as const)("预览后 %s 变化，执行 fail closed", async (change) => {
    const f = await fixture();
    await f.controller.handle({ action: "openCleanup" }, f.ctx);
    await f.send({ kind: "preview", request: f.request });
    const previewToken = f.projection().model.preview.token!;
    if (change === "trust") mocks.workspace.isTrusted = false;
    if (change === "task") mocks.tasks.taskExecutions = [{}];
    if (change === "directory") f.changeDirectory();
    await f.send({ kind: "execute", request: f.request, previewToken });
    expect(mocks.recursiveExecute).not.toHaveBeenCalled();
    expect(f.projection().model.preview.token).toBeUndefined();
    expect(f.projection().model.executeEnabled).toBe(false);
  });

  it("执行中取消立即通知 Wing，pending 期间不能启动第二次清理或运行任务", async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let shouldContinue!: () => boolean;
    mocks.recursiveExecute.mockImplementation(async (_preview, options) => {
      shouldContinue = options.shouldContinue;
      await gate;
      if (!shouldContinue()) throw new Error("已删除 first.obj；后续清理已取消，不回滚。");
      return { deleted: [] };
    });
    await f.controller.handle({ action: "openCleanup" }, f.ctx);
    await f.send({ kind: "preview", request: f.request });
    const ready = f.projection();
    const pending = f.send({ kind: "execute", request: f.request, previewToken: ready.model.preview.token! });
    try {
      await vi.waitFor(() => expect(mocks.recursiveExecute).toHaveBeenCalledOnce());
      await f.send({ kind: "cancel" }, ready);
      expect(shouldContinue()).toBe(false);
      await expect(f.controller.handle({ action: "cleanObjects" }, f.ctx)).rejects.toThrow("处理中");
      await expect(f.controller.handle({ action: "runTarget", targetId: "anything" }, f.ctx)).rejects.toThrow("清理仍在处理中");
    } finally { release(); await pending; }
    expect(f.projection().model.preview.state).toBe("idle");
    expect(f.logs).toContainEqual(expect.stringContaining("已删除 first.obj"));
    expect(f.logs.some((line) => line.includes("清理完成"))).toBe(false);
  });

  it("过期 session 和变更模式的执行请求不会调用 Wing", async () => {
    const f = await fixture();
    await f.controller.handle({ action: "openCleanup" }, f.ctx);
    await f.send({ kind: "preview", request: f.request });
    const old = f.projection();
    await f.send({ kind: "execute", request: { ...f.request, modeId: "objects" }, previewToken: old.model.preview.token! });
    expect(mocks.recursiveExecute).not.toHaveBeenCalled();
    await f.controller.handle({ action: "openCleanup" }, f.ctx);
    await f.send({ kind: "cancel" }, old);
    expect(f.projection().sessionId).not.toBe(old.sessionId);
    expect(f.projection().model.selectedModeId).toBe("git-untracked");
  });

  it("快捷清理内部扫描期间目录变化，直接执行也不得越过取消门禁", async () => {
    const f = await fixture();
    let release!: () => void;
    const pendingScan = new Promise<void>((resolve) => { release = resolve; });
    mocks.recursivePreview.mockImplementation(async (root: string) => {
      await pendingScan;
      return { root, matched: [join(root, "build")], skippedPaths: [] };
    });
    const pending = f.controller.handle({ action: "cleanBuild" }, f.ctx);
    f.changeDirectory();
    release();
    await pending;
    expect(mocks.recursiveExecute).not.toHaveBeenCalled();
    expect(f.projection().openRequestId).toBe(0);
    expect(f.projection().model.preview.token).toBeUndefined();
  });
});

describe("Run 清理请求边界", () => {
  it("不能借隐藏规则输入扩大目标；取消不依赖目标或执行 token", () => {
    expect(KtcParseRunCleanupPayload({ kind: "cancel", previewToken: "ignored" })).toEqual({ kind: "cancel" });
    for (const request of [
      { modeId: "git-force", targetIds: ["workspace"], rulesYaml: "" },
      { modeId: "build", targetIds: ["other"], rulesYaml: "" },
      { modeId: "build", targetIds: ["workspace"], rulesYaml: "- *" },
    ]) expect(KtcParseRunCleanupPayload({ kind: "preview", request })).toBeUndefined();
    expect(KtcParseRunAction({ type: "runAction", toolId: "run", action: "cleanupDialog", sessionId: "a", revision: -1, payload: { kind: "cancel" } })).toBeUndefined();
    expect(KtcCreateRunCleanupModel("/work", "build", { state: "idle", items: [] }).modes.every(({ risk }) => risk === "high")).toBe(true);
  });
});
