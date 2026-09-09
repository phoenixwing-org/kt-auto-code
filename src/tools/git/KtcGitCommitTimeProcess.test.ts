import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

import { KtcRunGit } from "./KtcGitCommitTimeService.js";

class KtcFakeStream extends EventEmitter {
  readonly setEncoding = vi.fn();
  readonly end = vi.fn((...args: unknown[]) => {
    this.finish = args.at(-1) as (error?: Error | null) => void;
  });
  finish?: (error?: Error | null) => void;
}

function KtcFakeChild() {
  return Object.assign(new EventEmitter(), {
    stdin: new KtcFakeStream(), stdout: new KtcFakeStream(), stderr: new KtcFakeStream(),
  });
}

beforeEach(() => { mocks.spawn.mockReset(); });

describe("Git mutation process stdin boundary", () => {
  it("无input用ignore且不写空串，保持stdout/stderr及成功退出码", async () => {
    const child = KtcFakeChild(); mocks.spawn.mockReturnValue(child);
    const pending = KtcRunGit(["status", "--porcelain"], "/fixture");
    expect(mocks.spawn).toHaveBeenCalledWith("git", ["status", "--porcelain"], expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }));
    expect(child.stdin.end).not.toHaveBeenCalled();
    child.stdout.emit("data", "status-output"); child.stderr.emit("data", "notice"); child.emit("close", 0);
    await expect(pending).resolves.toEqual({ exitCode: 0, stdout: "status-output", stderr: "notice" });
  });

  it("有input等待写入完成和进程close两个条件，显式空输入只发送EOF", async () => {
    const child = KtcFakeChild(); mocks.spawn.mockReturnValue(child);
    const pending = KtcRunGit(["commit-tree"], "/fixture", { input: "" });
    const settled = vi.fn(); void pending.then(settled);
    expect(mocks.spawn).toHaveBeenCalledWith("git", ["commit-tree"], expect.objectContaining({ stdio: ["pipe", "pipe", "pipe"] }));
    expect(child.stdin.end.mock.calls[0]).toEqual([expect.any(Function)]);
    child.emit("close", 0); await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    child.stdin.finish?.();
    await expect(pending).resolves.toMatchObject({ exitCode: 0 });
  });

  it.each(["before-close", "after-close"] as const)("stdin EPIPE %s 被捕获，close 0也必须失败", async (order) => {
    const child = KtcFakeChild(); mocks.spawn.mockReturnValue(child);
    const pending = KtcRunGit(["commit-tree"], "/fixture", { input: "message\n" });
    const failure = expect(pending).rejects.toThrow("Git 输入写入失败：write EPIPE");
    expect(child.stdin.end.mock.calls[0]?.[0]).toBe("message\n");
    if (order === "after-close") child.emit("close", 0);
    expect(() => child.stdin.emit("error", new Error("write EPIPE"))).not.toThrow();
    if (order === "before-close") child.emit("close", 0);
    child.stdin.finish?.(new Error("write EPIPE"));
    await failure;
  });

  it("end callback单独报告写入失败时也不能成功", async () => {
    const child = KtcFakeChild(); mocks.spawn.mockReturnValue(child);
    const pending = KtcRunGit(["commit-tree"], "/fixture", { input: "message\n" });
    const failure = expect(pending).rejects.toThrow("callback EPIPE");
    child.stdin.finish?.(new Error("callback EPIPE")); child.emit("close", 0);
    await failure;
  });

  it.each([0, 23])("allowFailure允许返回输入失败，但退出码%d不伪报成功且保留诊断", async (code) => {
    const child = KtcFakeChild(); mocks.spawn.mockReturnValue(child);
    const pending = KtcRunGit(["commit-tree"], "/fixture", { input: "message\n", allowFailure: true });
    child.stderr.emit("data", "git diagnostic");
    child.stdin.emit("error", new Error("write EPIPE")); child.emit("close", code);
    const result = await pending;
    expect(result.exitCode).toBe(code === 0 ? -1 : code);
    expect(result.stderr).toBe("git diagnostic\nGit 输入写入失败：write EPIPE");
  });

  it.each([false, true])("普通非零退出遵循allowFailure=%s", async (allowFailure) => {
    const child = KtcFakeChild(); mocks.spawn.mockReturnValue(child);
    const pending = KtcRunGit(["symbolic-ref"], "/fixture", { allowFailure });
    const result = allowFailure ? expect(pending).resolves.toMatchObject({ exitCode: 7, stderr: "not a branch" })
      : expect(pending).rejects.toThrow("not a branch");
    child.stderr.emit("data", "not a branch"); child.emit("close", 7);
    await result;
  });

  it("spawn错误仍reject，随后stdin错误不会成为未捕获异常", async () => {
    const child = KtcFakeChild(); mocks.spawn.mockReturnValue(child);
    const pending = KtcRunGit(["commit-tree"], "/missing", { input: "message\n", allowFailure: true });
    const failure = expect(pending).rejects.toThrow("spawn ENOENT");
    child.emit("error", new Error("spawn ENOENT"));
    expect(() => child.stdin.emit("error", new Error("write EPIPE"))).not.toThrow();
    child.emit("close", -2);
    await failure;
  });
});
