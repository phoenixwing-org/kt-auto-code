import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ktcUpdateAutoBuildProjectRepository } from "./autoBuildProjectUpdate.js";

const row = { id: "project", name: "Demo", path: "/workspace/Demo", branch: "main", enabled: true, operations: { update: false, cmake: true, caa: true, linkCaa: true } };

describe("AutoBuild standalone TypeScript Git update", () => {
  it("dirty skips without checkout/pull/build; the whole-run checkbox does not gate an explicit update", async () => {
    const runGit = vi.fn(async (args: string[]) => args.includes("status") ? "?? local.txt" : "/workspace/Demo");
    const log = vi.fn();
    expect(await ktcUpdateAutoBuildProjectRepository(row, "/workspace", { runGit, log })).toBe("skipped");
    expect(runGit.mock.calls.some(([args]) => args.includes("fetch") || args.includes("checkout"))).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("保留并跳过"));
  });

  it("cancellation between commands does not start the next Git mutation", async () => {
    const abort = new AbortController();
    const runGit = vi.fn(async (args: string[]) => { if (args.includes("fetch")) abort.abort(); return ""; });
    await expect(ktcUpdateAutoBuildProjectRepository(row, "/workspace", { signal: abort.signal, runGit, log: vi.fn() })).rejects.toThrow();
    expect(runGit.mock.calls.some(([args]) => args.includes("checkout"))).toBe(false);
  });

  it("rejects option-like branches before executing Git", async () => {
    const runGit = vi.fn();
    await expect(ktcUpdateAutoBuildProjectRepository({ ...row, branch: "--detach" }, "/workspace", { runGit, log: vi.fn() })).rejects.toThrow("有效的目标分支");
    expect(runGit).not.toHaveBeenCalled();
  });

  it("rechecks edits after fetch before checkout", async () => {
    let fetched = false;
    const runGit = vi.fn(async (args: string[]) => {
      if (args.includes("fetch")) fetched = true;
      return args.includes("status") && fetched ? " M source.txt" : "";
    });
    expect(await ktcUpdateAutoBuildProjectRepository(row, "/workspace", { runGit, log: vi.fn() })).toBe("skipped");
    expect(runGit.mock.calls.some(([args]) => args.includes("checkout"))).toBe(false);
  });

  it("keeps optional LFS updates and reports a missing installation", async () => {
    const log = vi.fn();
    const runGit = vi.fn(async (args: string[]) => {
      if (args.includes("version")) throw new Error("git-lfs missing");
      return "";
    });
    expect(await ktcUpdateAutoBuildProjectRepository(row, "/workspace", { runGit, log })).toBe("updated");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("未检测到 Git LFS"));
    expect(runGit.mock.calls.some(([args]) => args.includes("lfs") && args.includes("pull"))).toBe(false);
  });

  it("updates a real local clone with spaces, preserving uncommitted files on a second click", async () => {
    const base = await mkdtemp(join(tmpdir(), "ktc-git-ts-update-"));
    const exec = promisify(execFile);
    const git = async (...args: string[]) => (await exec("git", args)).stdout.trim();
    try {
      const origin = join(base, "origin.git"), producer = join(base, "producer"), target = join(base, "space project");
      await git("init", "--bare", origin);
      await git("clone", origin, producer);
      await git("-C", producer, "checkout", "-b", "main");
      await git("-C", producer, "config", "user.name", "Test");
      await git("-C", producer, "config", "user.email", "test@example.invalid");
      await writeFile(join(producer, "source.txt"), "first");
      await git("-C", producer, "add", "source.txt"); await git("-C", producer, "commit", "-m", "first");
      await git("-C", producer, "push", "origin", "main");
      await git("clone", "--branch", "main", origin, target);
      await writeFile(join(producer, "source.txt"), "second");
      await git("-C", producer, "commit", "-am", "second"); await git("-C", producer, "push", "origin", "main");
      const project = { ...row, path: target };
      expect(await ktcUpdateAutoBuildProjectRepository(project, base, { log: vi.fn() })).toBe("updated");
      expect(await readFile(join(target, "source.txt"), "utf8")).toBe("second");
      await writeFile(join(target, "local.txt"), "keep me");
      expect(await ktcUpdateAutoBuildProjectRepository(project, base, { log: vi.fn() })).toBe("skipped");
      expect(await readFile(join(target, "local.txt"), "utf8")).toBe("keep me");
    } finally { await rm(base, { recursive: true, force: true }); }
  }, 30_000);
});
