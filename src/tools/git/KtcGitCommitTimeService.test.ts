import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  KtcAnalyzeGitCommitTimeReset,
  KtcExecuteGitCommitTimeReset,
  KtcSuggestGitCommitTime,
} from "./KtcGitCommitTimeService.js";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Git commit time reset", () => {
  it("在相邻两条之间推导默认时间；缺少相邻节点时保留原时间", () => {
    const commits = [
      { oid: "a", committer: { date: "300 +0000" } },
      { oid: "b", committer: { date: "200 +0000" } },
      { oid: "c", committer: { date: "100 +0000" } },
    ];
    expect(KtcSuggestGitCommitTime(commits, "b", 999)).toBe(KtcFormatLocal(200));
    expect(KtcSuggestGitCommitTime(commits, "a", 999)).toBe(KtcFormatLocal(300));
  });

  it("同步重置目标 Author/Committer 时间并原样重建线性后续历史", async () => {
    const root = await repository();
    await commit(root, "one", "2026-08-20T08:00:00+08:00");
    const targetOid = await commit(root, "two", "2026-08-21T08:00:00+08:00");
    const oldHeadOid = await commit(root, "three", "2026-08-22T08:00:00+08:00");
    const oldHeadTree = await git(root, ["rev-parse", `${oldHeadOid}^{tree}`]);
    const oldNewestTimes = await git(root, ["show", "-s", "--format=%at%x00%ct", oldHeadOid]);

    const analysis = await KtcAnalyzeGitCommitTimeReset(root, targetOid, oldHeadOid);
    expect(analysis.branchName).toBe("test");
    expect(analysis.targetSubject).toBe("two");
    expect(analysis.affectedOids).toEqual([targetOid, oldHeadOid]);

    const date = "1787288400 +0800";
    const result = await KtcExecuteGitCommitTimeReset({ repositoryRoot: root, targetOid, expectedHeadOid: oldHeadOid, date });
    expect(result.oldHeadOid).toBe(oldHeadOid);
    expect(result.newHeadOid).not.toBe(oldHeadOid);
    expect(result.rewritten).toHaveLength(2);
    expect(await git(root, ["show", "-s", "--format=%at%x00%ct", result.rewritten[0]!.newOid])).toBe("1787288400\0 1787288400".replace("\0 ", "\0"));
    expect(await git(root, ["show", "-s", "--format=%at%x00%ct", result.newHeadOid])).toBe(oldNewestTimes);
    expect(await git(root, ["rev-parse", `${result.newHeadOid}^{tree}`])).toBe(oldHeadTree);
    expect(await git(root, ["rev-parse", result.backupRef])).toBe(oldHeadOid);
    expect(await git(root, ["status", "--porcelain"])).toBe("");
  });

  it("远端引用包含目标 commit 时拒绝改写", async () => {
    const root = await repository();
    await commit(root, "base", "2026-08-19T08:00:00+08:00");
    const targetOid = await commit(root, "one", "2026-08-20T08:00:00+08:00");
    const headOid = await commit(root, "two", "2026-08-21T08:00:00+08:00");
    await git(root, ["update-ref", "refs/remotes/origin/test", headOid]);
    await expect(KtcAnalyzeGitCommitTimeReset(root, targetOid, headOid)).rejects.toThrow("已被其他分支、标签或远端引用");
  });
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ktc-git-time-"));
  roots.push(root);
  await git(root, ["init", "--initial-branch=test"]);
  await git(root, ["config", "user.name", "Phoenix Wing"]);
  await git(root, ["config", "user.email", "3301647@qq.com"]);
  return root;
}

async function commit(root: string, subject: string, date: string): Promise<string> {
  await writeFile(join(root, "value.txt"), `${subject}\n`, "utf8");
  await git(root, ["add", "value.txt"]);
  await git(root, ["commit", "--no-gpg-sign", "--message", subject], {
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date,
  });
  return await git(root, ["rev-parse", "HEAD"]);
}

async function git(root: string, args: readonly string[], env: Readonly<Record<string, string>> = {}): Promise<string> {
  const result = await run("git", [...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return result.stdout.trim();
}

function KtcFormatLocal(timestamp: number): string {
  const value = new Date(timestamp * 1_000);
  const date = [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((item, index) => item.toString().padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
  const time = [value.getHours(), value.getMinutes(), value.getSeconds()]
    .map((item) => item.toString().padStart(2, "0"))
    .join(":");
  return `${date} ${time}`;
}
