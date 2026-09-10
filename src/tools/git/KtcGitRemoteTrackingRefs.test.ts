import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

const { graphPage } = vi.hoisted(() => ({ graphPage: vi.fn() }));
vi.mock("@phoenix-wing/git-node", async importOriginal => ({
  ...await importOriginal<typeof import("@phoenix-wing/git-node")>(), pnwReadGitCommitGraphPage: graphPage,
}));
import { KtcAttachGitRemoteTrackingRefs, KtcParseGitRemoteTrackingRefs, KtcReadGitRemoteTrackingRefs } from "./KtcGitRemoteTrackingRefs.js";
import { KtcGitWingAdapter, type KtcPnwGitCommitGraphPage } from "./KtcGitWingAdapter.js";

const execFile = promisify(execFileCallback);
const roots: string[] = [];
afterEach(async () => { graphPage.mockReset(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ktc-remote-tip-")); roots.push(root);
  const git = async (...args: string[]) => (await execFile("git", args, { cwd: root })).stdout.trim();
  await git("init", "-b", "main"); await git("config", "user.name", "Remote Ref Test"); await git("config", "user.email", "refs@example.invalid");
  await git("commit", "--allow-empty", "-m", "same title"); const base = await git("rev-parse", "HEAD");
  await git("commit", "--allow-empty", "-m", "same title"); const head = await git("rev-parse", "HEAD");
  await git("update-ref", "refs/remotes/gitee/develop", base);
  await git("update-ref", "refs/remotes/github/develop", base);
  await git("symbolic-ref", "refs/remotes/github/HEAD", "refs/remotes/github/develop");
  await git("branch", "gitee/develop", head); await git("tag", "github/develop", head);
  return { root, git, base, head };
}

describe("local remote-tracking graph tips", () => {
  it("reads exact local remote refs and symbolic HEAD, never confuses same-name branches/tags", async () => {
    const { root, base } = await fixture();
    const refs = await KtcReadGitRemoteTrackingRefs(root);
    expect(refs).toEqual([
      { name: "refs/remotes/gitee/develop", displayName: "gitee/develop", oid: base },
      { name: "refs/remotes/github/HEAD", displayName: "github/HEAD", oid: base, symbolicTarget: "refs/remotes/github/develop" },
      { name: "refs/remotes/github/develop", displayName: "github/develop", oid: base },
    ]);
  });

  it("decorates only exact tip OIDs without expanding commits, changing parents or rewriting Wing pagination", async () => {
    const { root, head, base } = await fixture();
    const identity = { name: "Test", email: "test@example.invalid", date: "1780000000 +0000" };
    const page: KtcPnwGitCommitGraphPage = {
      root, headOid: head, refsScope: "head", hasMore: true, nextBeforeCursor: "unchanged-opaque-cursor",
      commits: [head, base].map((oid, index) => ({ oid, parentOids: index ? [] : [base], subject: "same title", author: identity, committer: identity, decorations: [] })),
      graphRows: [head, base].map(commitOid => ({ commitOid, lane: 0, laneCount: 1, lanesBefore: [commitOid], lanesAfter: [], parentEdges: [] })),
    };
    graphPage.mockResolvedValue(page);
    const signal = new AbortController().signal;
    const actual = await new KtcGitWingAdapter().readCommitGraphPage(root, { expectedHeadOid: head, beforeCursor: "prior-cursor", limit: 2, refsScope: "head", signal });
    expect(graphPage).toHaveBeenCalledExactlyOnceWith(root, { expectedHeadOid: head, beforeCursor: "prior-cursor", limit: 2, refsScope: "head", signal });
    expect(actual.commits.map(commit => commit.oid)).toEqual([head, base]);
    expect(actual.graphRows).toBe(page.graphRows); expect(actual.nextBeforeCursor).toBe(page.nextBeforeCursor); expect(actual.refsScope).toBe("head");
    expect(actual.commits[0]).toBe(page.commits[0]); expect(actual.commits[0]?.remoteTrackingRefs).toBeUndefined();
    expect(actual.commits[1]?.remoteTrackingRefs).toHaveLength(3);
    expect(actual.commits[1]?.parentOids).toBe(page.commits[1]?.parentOids);
    expect(page.commits[1]?.remoteTrackingRefs).toBeUndefined();
    expect(KtcAttachGitRemoteTrackingRefs([page.commits[0]!], await KtcReadGitRemoteTrackingRefs(root))).toEqual([page.commits[0]]);
  });

  it("observes only the next local snapshot after a ref moves, without fetching", async () => {
    const { root, head, git } = await fixture();
    await git("update-ref", "refs/remotes/github/develop", head);
    expect((await KtcReadGitRemoteTrackingRefs(root)).filter(ref => ref.oid === head).map(ref => ref.name)).toEqual(["refs/remotes/github/HEAD", "refs/remotes/github/develop"]);
  });

  it("cancels the read instead of applying late decorations", async () => {
    const { root } = await fixture(); const controller = new AbortController(); controller.abort();
    await expect(KtcReadGitRemoteTrackingRefs(root, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("accepts empty refs and ignores non-commit objects", () => {
    expect(KtcParseGitRemoteTrackingRefs("")).toEqual([]);
    expect(KtcParseGitRemoteTrackingRefs(`refs/remotes/a/tree\0${"a".repeat(40)}\0tree\0\n`)).toEqual([]);
  });

  it.each([
    `refs/heads/origin/main\0${"a".repeat(40)}\0commit\0\n`,
    `refs/tags/origin/main\0${"a".repeat(40)}\0commit\0\n`,
    `refs/remotes/origin/main\0${"a".repeat(41)}\0commit\0\n`,
    `refs/remotes/origin/HEAD\0${"a".repeat(40)}\0commit\0refs/heads/main\n`,
    `refs/remotes/origin/main\0${"a".repeat(40)}\n`,
  ])("rejects malformed/non-remote records instead of claiming a remote tip", (output) => {
    expect(() => KtcParseGitRemoteTrackingRefs(output)).toThrow("本地远端跟踪引用格式异常");
  });
});
