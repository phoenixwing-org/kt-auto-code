import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { KtcEditorPrimaryCompanionSnapshot } from "../../core/editorPrimaryCompanionContracts.js";
import type { KtcPackageIncludePreviewSession } from "./packageIncludeService.js";

const mocks = vi.hoisted(() => ({ create: vi.fn(), preview: vi.fn(), apply: vi.fn(), confirm: vi.fn(), pick: vi.fn(), folder: vi.fn(), command: vi.fn() }));
vi.mock("vscode", () => ({
  Uri: { file: (fsPath: string) => ({ fsPath, toString: () => fsPath }), joinPath: (_base: unknown, ...parts: string[]) => ({ toString: () => parts.join("/") }) },
  ViewColumn: { Active: 1 }, workspace: { textDocuments: [] }, commands: { executeCommand: mocks.command },
  window: { createWebviewPanel: mocks.create, showWarningMessage: mocks.confirm, showQuickPick: mocks.pick, showOpenDialog: mocks.folder },
}));
vi.mock("../../projectEnvironment.js", () => ({ ktcReadProjectEnvironment: async () => ({ values: [] }) }));
vi.mock("./packageIncludeService.js", async (original) => ({ ...await original<object>(), ktcPreviewPackageIncludes: mocks.preview, ktcApplyPackageIncludes: mocks.apply }));
import * as vscode from "vscode";
import { KtcPackageIncludeViewController } from "./packageIncludeViewController.js";

let root: string;
const session: KtcPackageIncludePreviewSession = { files: [], mappingSnapshot: { headerPaths: [], ignorePatterns: [], useBuiltInIgnore: true }, preview: { coreIncludeDirectory: "/include", targetDirectory: "/target", headerCount: 1, scannedFileCount: 1, ignoredDirectoryCount: 0, unsupportedFileCount: 0, skippedHeaderCount: 0, skippedHeaders: [], collisions: [], rows: [{ id: "x:1", filePath: "/target/x.cpp", relativePath: "x.cpp", fileName: "x.cpp", directory: "", line: 1, oldValue: '#include "X.h"', newValue: "#include <Pkg/X.h>" }] } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.preview.mockReset().mockResolvedValue(session); mocks.apply.mockReset().mockResolvedValue({ changedFiles: 1, changedIncludes: 1 }); mocks.confirm.mockReset().mockResolvedValue("写入修正");
  root = mkdtempSync(join(tmpdir(), "ktc-include-safety-")); mkdirSync(join(root, "include"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
async function setup() {
  let receive!: (message: unknown) => void, dispose!: () => void;
  const panel = { active: true, visible: true, viewColumn: 1, reveal: vi.fn(), dispose: () => dispose(),
    onDidDispose: (listener: () => void) => { dispose = listener; }, onDidChangeViewState: vi.fn(),
    webview: { html: "", cspSource: "test", asWebviewUri: (value: unknown) => value, postMessage: vi.fn(), onDidReceiveMessage: (listener: (message: unknown) => void) => { receive = listener; } },
  };
  mocks.create.mockReturnValue(panel);
  const snapshots: KtcEditorPrimaryCompanionSnapshot[] = [], log = vi.fn();
  const view = new KtcPackageIncludeViewController(vscode.Uri.file("/extension"), { get: <T>() => join(root, "include") as T, update: vi.fn() }, log, { onDidChange: (snapshot) => snapshots.push(snapshot) });
  await view.show(root); receive({ type: "ready" });
  await vi.waitFor(() => expect(snapshots.at(-1)?.ready).toBe(true));
  const latest = () => snapshots.at(-1)!;
  const action = (actionId: string, payload?: unknown) => { const s = latest(); return view.runPrimaryCompanionAction({ toolId: "packageIncludes", panelId: s.panelId, sessionId: s.sessionId, revision: s.revision, actionId, payload }); };
  return { view, latest, snapshots, log, action, receive, panel };
}
it("正式 typed Primary 同时投影双根与 Ignore；任务编辑不跟随再次打开带入的全局目录", async () => {
  const app = await setup();
  expect(app.latest().primary).toMatchObject({ kind: "packageIncludes", model: { packageDirectory: join(root, "include"), targetDirectory: root, packageDirectoryExists: true, targetDirectoryExists: true, ignore: { enabled: true, gitEnabled: true } } });
  await app.action("updateDraft", { packageDirectory: join(root, "include"), targetDirectory: join(root, "include") });
  await app.view.show("/different-global-directory");
  expect(app.latest().primary?.model).toMatchObject({ targetDirectory: join(root, "include") });
  expect(app.latest().actions.map((action) => action.id)).toContain("pickPackageDirectory");
});
it.each(["/current/project", "", undefined])("关闭后重开工程目录只取当前上下文 %s，不恢复上次草稿", async (currentDirectory) => {
  const app = await setup();
  await app.action("updateDraft", { packageDirectory: join(root, "include"), targetDirectory: "/previous/manual-input" });
  app.view.dispose();
  await app.view.show(currentDirectory);
  app.receive({ type: "ready" });
  const expected = currentDirectory ?? "";
  expect(app.latest().primary?.model).toMatchObject({ targetDirectory: expected });
  expect(app.panel.webview.html).toContain(`contextPath:${JSON.stringify(expected)},scrollMode:'vertical'`);
  expect(app.panel.webview.html).not.toContain("/previous/manual-input");
  expect(mocks.preview).not.toHaveBeenCalled();
});
it("现有任务清空工程草稿后再次显示，不自动恢复旧默认目录", async () => {
  const app = await setup();
  await app.action("updateDraft", { packageDirectory: join(root, "include"), targetDirectory: "" });
  await app.view.show("/different-global-directory");
  expect(app.latest().primary?.model).toMatchObject({ targetDirectory: "" });
  expect(mocks.preview).not.toHaveBeenCalled();
});
it("Primary 拒绝错误 session/revision、非allowlist和非法目录payload；关闭后原token不可执行", async () => {
  const app = await setup(), snapshot = app.latest();
  const token = { toolId: "packageIncludes" as const, panelId: snapshot.panelId, sessionId: snapshot.sessionId, revision: snapshot.revision, actionId: "updateDraft" };
  for (const payload of [{ packageDirectory: "a".repeat(4097), targetDirectory: root }, { packageDirectory: "/ok", targetDirectory: "bad\0path" }, { packageDirectory: "/ok" }]) expect(await app.view.runPrimaryCompanionAction({ ...token, payload })).toBe(false);
  expect(await app.view.runPrimaryCompanionAction({ ...token, revision: token.revision + 1 })).toBe(false);
  expect(await app.action("deleteEverything")).toBe(false);
  app.view.dispose(); expect(await app.view.runPrimaryCompanionAction({ ...token, actionId: "preview" })).toBe(false);
});
it("扫描中切换 Ignore 立即 abort；迟到结果不能恢复session/写入资格", async () => {
  const pending = deferred<KtcPackageIncludePreviewSession>(); mocks.preview.mockReturnValueOnce(pending.promise);
  const app = await setup(), running = app.action("preview");
  await vi.waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce());
  app.view.setIgnoreSources({ ignoreEnabled: false });
  expect(mocks.preview.mock.calls[0]![0].signal.aborted).toBe(true);
  pending.resolve(session); await running;
  expect(app.latest().status).toBe("idle");
  expect(app.latest().primary?.model).toMatchObject({ summary: [{ label: "扫描", value: "未开始" }, { label: "命中", value: "0 处" }] });
  app.receive({ type: "apply" }); expect(mocks.confirm).not.toHaveBeenCalled();
});
it("关闭 Right 后扫描完成不发布新的active/done投影", async () => {
  const pending = deferred<KtcPackageIncludePreviewSession>(); mocks.preview.mockReturnValueOnce(pending.promise);
  const app = await setup(), running = app.action("preview");
  await vi.waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce()); app.view.dispose();
  const count = app.snapshots.length; pending.resolve(session); await running;
  expect(app.snapshots).toHaveLength(count); expect(app.latest().lifecycle).toBe("disposed");
});
it("写入 modal 等待期间 Ignore 变化，确认返回也不调用写盘服务", async () => {
  const confirmation = deferred<string>(); mocks.confirm.mockReturnValueOnce(confirmation.promise);
  const app = await setup(); await app.action("preview"); app.receive({ type: "apply" });
  await vi.waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  app.view.setIgnoreSources({ gitIgnoreEnabled: false }); confirmation.resolve("写入修正");
  await vi.waitFor(() => expect(app.log).toHaveBeenCalledWith(expect.stringContaining("确认期间任务或 Ignore 已变化")));
  expect(mocks.apply).not.toHaveBeenCalled();
});
it("开关未改变但 Ignore 正文变化也会使扫描预览失效", async () => {
  mkdirSync(join(root, ".git")); writeFileSync(join(root, ".gitignore"), "old-output/\n");
  const app = await setup(); await app.action("preview");
  writeFileSync(join(root, ".gitignore"), "new-output/\n"); app.view.refreshIgnorePolicy();
  expect(app.latest().status).toBe("idle"); app.receive({ type: "apply" }); expect(mocks.confirm).not.toHaveBeenCalled();
});
it("旧 provider 尚在写盘时取消/关闭不会释放互斥；重开必须等写盘结束", async () => {
  const writing = deferred<{ changedFiles: number; changedIncludes: number }>(); mocks.apply.mockReturnValueOnce(writing.promise);
  const app = await setup(); await app.action("preview"); app.receive({ type: "apply" });
  await vi.waitFor(() => expect(mocks.apply).toHaveBeenCalledOnce());
  app.view.dispose(); await app.view.show(root); app.receive({ type: "ready" });
  await vi.waitFor(() => expect(app.latest().ready).toBe(true));
  expect(await app.action("preview")).toBe(false);
  expect(mocks.apply.mock.calls[0]![1].signal.aborted).toBe(true);
  writing.resolve({ changedFiles: 1, changedIncludes: 1 });
  await vi.waitFor(() => expect(app.latest().actions.find((action) => action.id === "preview")?.enabled).toBe(true));
  expect(app.latest().status).not.toBe("running");
  expect(app.latest().primary?.model).toMatchObject({ busy: false });
  expect(app.log).toHaveBeenCalledWith(expect.stringContaining("已写入 1 个文件，不自动回滚"));
});

it("预览标待写入；成功保留原行及已写入回执，不自动重扫或重复写，Ignore变化才撤销", async () => {
  const app = await setup(); await app.action("preview");
  const latest = () => app.panel.webview.postMessage.mock.calls.at(-1)![0];
  expect(latest()).toMatchObject({ writeState: "pending", canApply: true, preview: session.preview });
  app.receive({ type: "apply" });
  await vi.waitFor(() => expect(latest()).toMatchObject({ status: "done", writeState: "written", canApply: false }));
  expect(latest().preview).toBe(session.preview); expect(mocks.preview).toHaveBeenCalledTimes(1);
  app.receive({ type: "apply" }); expect(mocks.apply).toHaveBeenCalledTimes(1);
  await app.view.show(root);
  expect(latest()).toMatchObject({ writeState: "written", preview: session.preview, canApply: false });
  expect(latest().message).toContain("已修正 1 个文件中的 1 处");
  await app.action("preview");
  expect(mocks.preview).toHaveBeenCalledTimes(2);
  expect(latest()).toMatchObject({ writeState: "pending", canApply: true });
  app.view.setIgnoreSources({ ignoreEnabled: false });
  expect(latest()).toMatchObject({ preview: undefined, writeState: undefined, canApply: false });
});

it("确认取消仍是待写入，原行保留且不调用写盘服务", async () => {
  mocks.confirm.mockResolvedValueOnce(undefined);
  const app = await setup(); await app.action("preview"); app.receive({ type: "apply" });
  await vi.waitFor(() => expect(app.log).toHaveBeenCalledWith(expect.stringContaining("已取消")));
  expect(app.panel.webview.postMessage.mock.calls.at(-1)![0]).toMatchObject({ writeState: "pending", preview: session.preview, canApply: true });
  expect(mocks.apply).not.toHaveBeenCalled(); expect(mocks.preview).toHaveBeenCalledTimes(1);
});

it.each(["服务抛错", "回执数量不一致"])("%s 保留原行并全部标待核对，不能误标已写入或重复执行", async (scenario) => {
  if (scenario === "服务抛错") mocks.apply.mockRejectedValueOnce(new Error("后续写入失败；部分文件可能已修改"));
  else mocks.apply.mockResolvedValueOnce({ changedFiles: 0, changedIncludes: 0 });
  const app = await setup(); await app.action("preview"); app.receive({ type: "apply" });
  const latest = () => app.panel.webview.postMessage.mock.calls.at(-1)![0];
  await vi.waitFor(() => expect(latest()).toMatchObject({ status: "error", writeState: "unverified", canApply: false }));
  expect(latest().preview).toBe(session.preview); expect(latest().message).toContain("待核对");
  expect(latest().message).toContain(scenario === "服务抛错" ? "后续写入失败" : "回执与冻结预览不一致");
  app.receive({ type: "apply" }); expect(mocks.apply).toHaveBeenCalledTimes(1);
  expect(mocks.preview).toHaveBeenCalledTimes(1);
  await app.view.show(root);
  expect(latest()).toMatchObject({ status: "error", writeState: "unverified", preview: session.preview, canApply: false });
  await app.action("updateDraft", { packageDirectory: join(root, "include"), targetDirectory: join(root, "include") });
  expect(latest()).toMatchObject({ preview: undefined, writeState: undefined, canApply: false });
});
