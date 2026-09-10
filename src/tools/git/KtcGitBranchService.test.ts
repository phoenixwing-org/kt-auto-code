import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  KtcParseLocalGitBranchRefs,
  KtcReadLocalGitBranchLines,
  KtcReadLocalGitBranchOptions,
  KtcSwitchToLocalGitBranch,
} from "./KtcGitBranchService.js";

const oid = (character: string) => character.repeat(40);
const KtcFixtureExecFile = promisify(execFile);
const KtcFixtureRoots: string[] = [];
afterEach(async () => {
  await Promise.all(KtcFixtureRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Git local branch service", () => {
  it("keeps newline-delimited ref records separate", () => {
    expect(KtcParseLocalGitBranchRefs(`develop\0${oid("a")}\ntest2\0${oid("b")}\n`)).toEqual([
      { name: "develop", tipOid: oid("a") },
      { name: "test2", tipOid: oid("b") },
    ]);
  });

  it("reads first-parent histories without parsing display graph data", async () => {
    const calls: readonly (readonly string[])[] = [];
    const run = async (args: readonly string[]) => {
      (calls as (readonly string[])[]).push(args);
      if (args[0] === "for-each-ref") return { stdout: `develop\0${oid("a")}\ntopic\0${oid("b")}\n` };
      if (args.at(-1) === oid("a")) return { stdout: `${oid("a")}\n${oid("c")}\n` };
      return { stdout: `${oid("b")}\n${oid("c")}\n` };
    };
    await expect(KtcReadLocalGitBranchLines("/repo", run)).resolves.toEqual([
      { name: "develop", firstParentOids: [oid("a"), oid("c")] },
      { name: "topic", firstParentOids: [oid("b"), oid("c")] },
    ]);
    expect(calls).toHaveLength(3);
  });

  it("rejects unsafe names before issuing a command", async () => {
    let calls = 0;
    await expect(KtcSwitchToLocalGitBranch("/repo", "--orphan", async () => ({ stdout: "" }))).rejects.toThrow("无效");
    for (const name of ["", "--force", "main\0ignored", "topic\nmain"]) {
      await expect(KtcSwitchToLocalGitBranch("/repo", name, async () => { calls++; return { stdout: "" }; })).rejects.toThrow("无效");
    }
    expect(calls).toBe(0);
  });
});

describe("Git branch switch options and worktree safety", () => {
  it("returns exact local refs and marks a branch in another spaced/unicode worktree as occupied", async () => {
    const fixture = await KtcCreateBranchFixture();
    await KtcFixtureGit(["tag", "available"], fixture.root);
    const linked = path.join(fixture.base, "linked work tree 用户\nsecond line");
    await KtcFixtureGit(["worktree", "add", linked, "topic/fix"], fixture.root);
    const result = await KtcReadLocalGitBranchOptions(fixture.root);
    expect(result).toMatchObject({ root: await realpath(fixture.root), headOid: fixture.head, currentBranchName: "main" });
    expect(result.options.find(({ name }) => name === "available")).toEqual({
      name: "available", ref: "refs/heads/available", oid: fixture.head, current: false, disabled: false,
    });
    expect(result.options.find(({ name }) => name === "topic/fix")).toMatchObject({
      ref: "refs/heads/topic/fix", oid: fixture.head, disabled: true, worktreePath: await realpath(linked),
      reason: `已被其他工作树占用：${await realpath(linked)}`,
    });
    expect(result.options.find(({ current }) => current)).toMatchObject({ name: "main", disabled: false });
    expect(result.options).toHaveLength(3);
    const linkedOptions = await KtcReadLocalGitBranchOptions(linked);
    expect(linkedOptions.currentBranchName).toBe("topic/fix");
    expect(linkedOptions.options.find(({ name }) => name === "topic/fix")).toMatchObject({ current: true, disabled: false });
    expect(linkedOptions.options.find(({ name }) => name === "main")).toMatchObject({ current: false, disabled: true, worktreePath: result.root });
  });

  it("canonicalizes a symlink to the current worktree instead of treating itself as occupied", async () => {
    const fixture = await KtcCreateBranchFixture();
    const alias = path.join(fixture.base, "alias with spaces");
    await symlink(fixture.root, alias, process.platform === "win32" ? "junction" : "dir");
    const result = await KtcReadLocalGitBranchOptions(alias);
    expect(result.root).toBe(await realpath(fixture.root));
    expect(result.options.find(({ current }) => current)).toMatchObject({ name: "main", disabled: false });
  });

  it.each(["modified", "staged", "untracked"] as const)("refuses %s changes without stashing, forcing or switching", async (kind) => {
    const fixture = await KtcCreateBranchFixture();
    await writeFile(path.join(fixture.root, kind === "untracked" ? "untracked.txt" : "tracked.txt"), "user change\n", "utf8");
    if (kind === "staged") await KtcFixtureGit(["add", "tracked.txt"], fixture.root);
    const calls: (readonly string[])[] = [];
    await expect(KtcSwitchToLocalGitBranch(fixture.root, "available", async (args, root) => {
      calls.push(args);
      return KtcFixtureGit(args, root);
    })).rejects.toThrow("未提交或未跟踪改动");
    expect(calls.some((args) => ["switch", "stash", "reset", "clean"].includes(args[0]))).toBe(false);
    expect((await KtcFixtureGit(["symbolic-ref", "HEAD"], fixture.root)).stdout.trim()).toBe("refs/heads/main");
  });

  it("refuses an occupied branch before attempting a switch", async () => {
    const fixture = await KtcCreateBranchFixture();
    await KtcFixtureGit(["worktree", "add", path.join(fixture.base, "other tree"), "topic/fix"], fixture.root);
    const calls: (readonly string[])[] = [];
    await expect(KtcSwitchToLocalGitBranch(fixture.root, "topic/fix", async (args, root) => {
      calls.push(args);
      return KtcFixtureGit(args, root);
    })).rejects.toThrow("其他工作树占用");
    expect(calls.some((args) => args[0] === "switch")).toBe(false);
  });

  it("switches to an existing local branch using no-guess, then verifies ref and OID", async () => {
    const fixture = await KtcCreateBranchFixture();
    await KtcFixtureGit(["tag", "available"], fixture.root);
    const calls: (readonly string[])[] = [];
    await KtcSwitchToLocalGitBranch(fixture.root, "available", async (args, root) => {
      calls.push(args);
      return KtcFixtureGit(args, root);
    });
    expect(calls.filter((args) => args[0] === "switch")).toEqual([["switch", "--quiet", "--no-guess", "available"]]);
    const result = await KtcReadLocalGitBranchOptions(fixture.root);
    expect(result).toMatchObject({ currentBranchName: "available", headOid: fixture.head });
    expect(calls.some((args) => args.some((arg) => ["--force", "--discard-changes", "--ignore-other-worktrees"].includes(arg)))).toBe(false);
  });

  it("does not dispatch switch after its owning session is cancelled during the final reads", async () => {
    const fixture = await KtcCreateBranchFixture();
    const calls: (readonly string[])[] = [];
    let active = true;
    await expect(KtcSwitchToLocalGitBranch(fixture.root, "available", async (args, root) => {
      calls.push(args);
      const result = await KtcFixtureGit(args, root);
      if (args[0] === "status") active = false;
      return result;
    }, () => active)).rejects.toThrow("分支切换已取消，未修改工作树");
    expect(calls.some((args) => args[0] === "switch")).toBe(false);
    expect((await KtcFixtureGit(["symbolic-ref", "HEAD"], fixture.root)).stdout.trim()).toBe("refs/heads/main");
  });

  it("rejects a same-OID external ref change after checking clean status", async () => {
    const fixture = await KtcCreateBranchFixture();
    const calls: (readonly string[])[] = [];
    let statusRead = false;
    await expect(KtcSwitchToLocalGitBranch(fixture.root, "available", async (args, root) => {
      calls.push(args);
      if (args[0] === "status") statusRead = true;
      if (statusRead && args[0] === "rev-parse" && args[1] === "--symbolic-full-name") {
        return { stdout: "refs/heads/topic/fix\n" };
      }
      return KtcFixtureGit(args, root);
    }, undefined, { root: await realpath(fixture.root), headOid: fixture.head, currentRef: "refs/heads/main" }))
      .rejects.toThrow("切换前仓库、HEAD 或当前分支已变化");
    expect(calls.some((args) => args[0] === "switch")).toBe(false);
  });

  it("rejects a same-OID ref change between UI confirmation and the service's first read", async () => {
    const fixture = await KtcCreateBranchFixture();
    const calls: (readonly string[])[] = [];
    await expect(KtcSwitchToLocalGitBranch(fixture.root, "topic/fix", async (args, root) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--symbolic-full-name") {
        return { stdout: "refs/heads/available\n" };
      }
      return KtcFixtureGit(args, root);
    }, undefined, { root: await realpath(fixture.root), headOid: fixture.head, currentRef: "refs/heads/main" }))
      .rejects.toThrow("切换前仓库、HEAD 或当前分支已变化");
    expect(calls.some((args) => args[0] === "status" || args[0] === "switch")).toBe(false);
  });

  it.each(["root", "headOid"] as const)("rejects a stale confirmed %s before switching", async (field) => {
    const fixture = await KtcCreateBranchFixture();
    const calls: (readonly string[])[] = [];
    const expected = { root: await realpath(fixture.root), headOid: fixture.head, currentRef: "refs/heads/main" };
    const stale = { ...expected, [field]: field === "root" ? fixture.base : oid("a") };
    await expect(KtcSwitchToLocalGitBranch(fixture.root, "available", async (args, root) => {
      calls.push(args);
      return KtcFixtureGit(args, root);
    }, undefined, stale)).rejects.toThrow("切换前仓库、HEAD 或当前分支已变化");
    expect(calls.some((args) => args[0] === "status" || args[0] === "switch")).toBe(false);
  });

  it("accepts the confirmed source identity and an active owner without changing the safe switch command", async () => {
    const fixture = await KtcCreateBranchFixture();
    const calls: (readonly string[])[] = [];
    await KtcSwitchToLocalGitBranch(fixture.root, "available", async (args, root) => {
      calls.push(args);
      return KtcFixtureGit(args, root);
    }, () => true, { root: await realpath(fixture.root), headOid: fixture.head, currentRef: "refs/heads/main" });
    expect(calls.filter((args) => args[0] === "switch")).toEqual([["switch", "--quiet", "--no-guess", "available"]]);
    expect((await KtcFixtureGit(["symbolic-ref", "HEAD"], fixture.root)).stdout.trim()).toBe("refs/heads/available");
  });

  it("does not implicitly create a local branch from a matching remote ref", async () => {
    const fixture = await KtcCreateBranchFixture();
    await KtcFixtureGit(["update-ref", "refs/remotes/origin/remote-only", fixture.head], fixture.root);
    await expect(KtcSwitchToLocalGitBranch(fixture.root, "remote-only")).rejects.toThrow("本地分支");
    expect((await KtcReadLocalGitBranchOptions(fixture.root)).options.some(({ name }) => name === "remote-only")).toBe(false);
  });

  it("rejects a changed current branch even when both branches point at the same OID", async () => {
    const fixture = await KtcCreateBranchFixture();
    let reads = 0;
    await expect(KtcReadLocalGitBranchOptions(fixture.root, async (args, root) => {
      if (args[0] === "rev-parse" && args[1] === "--symbolic-full-name" && ++reads === 2) {
        return { stdout: "refs/heads/available\n" };
      }
      return KtcFixtureGit(args, root);
    })).rejects.toThrow("HEAD 或当前分支已变化");
  });

  it("keeps prunable occupied records disabled and rejects truncated porcelain rather than guessing", async () => {
    const fixture = await KtcCreateBranchFixture();
    const missing = path.join(fixture.base, "removed tree");
    const read = await KtcReadLocalGitBranchOptions(fixture.root, async (args, root) => {
      const result = await KtcFixtureGit(args, root);
      return args[0] === "worktree" ? {
        stdout: `${result.stdout}worktree ${missing}\0HEAD ${fixture.head}\0branch refs/heads/available\0prunable gitdir file points to missing location\0\0`,
      } : result;
    });
    expect(read.options.find(({ name }) => name === "available")).toMatchObject({ disabled: true, worktreePath: missing });
    await expect(KtcReadLocalGitBranchOptions(fixture.root, async (args, root) => args[0] === "worktree"
      ? { stdout: `worktree ${fixture.root}\0HEAD ${fixture.head}` }
      : KtcFixtureGit(args, root))).rejects.toThrow("不完整的工作树列表");
  });

  it("rejects non-full OIDs in branch options", async () => {
    const fixture = await KtcCreateBranchFixture();
    await expect(KtcReadLocalGitBranchOptions(fixture.root, async (args, root) => args[0] === "for-each-ref"
      ? { stdout: `refs/heads/main\0${"a".repeat(41)}\n` }
      : KtcFixtureGit(args, root))).rejects.toThrow("无效的完整本地分支引用");
  });
});

async function KtcCreateBranchFixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "ktc-branch-options-test-"));
  KtcFixtureRoots.push(base);
  const root = path.join(base, "main work tree");
  await mkdir(root);
  await KtcFixtureGit(["init", "-b", "main"], root);
  await KtcFixtureGit(["config", "user.name", "KT Auto Code Test"], root);
  await KtcFixtureGit(["config", "user.email", "test@example.invalid"], root);
  await writeFile(path.join(root, "tracked.txt"), "initial\n", "utf8");
  await KtcFixtureGit(["add", "tracked.txt"], root);
  await KtcFixtureGit(["commit", "--no-verify", "--no-gpg-sign", "-m", "Initial"], root);
  await KtcFixtureGit(["branch", "available"], root);
  await KtcFixtureGit(["branch", "topic/fix"], root);
  const head = (await KtcFixtureGit(["rev-parse", "HEAD"], root)).stdout.trim();
  return { base, root, head };
}

async function KtcFixtureGit(args: readonly string[], cwd: string) {
  const result = await KtcFixtureExecFile("git", [...args], { cwd, encoding: "utf8", windowsHide: true });
  return { stdout: result.stdout, stderr: result.stderr };
}
