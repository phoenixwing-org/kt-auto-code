import { pnwProjectGitCommitGraphRows } from "@phoenix-wing/git-core";
import type { KtcGitRepositoryInput } from "../../src/core/git/KtcGitModel.js";
import type { KtcPnwGitCommitGraphCommit } from "../../src/tools/git/KtcGitWingAdapter.js";

/** Synthetic repository only: graph lanes use Wing's existing pure projection. */
export function createPreviewGitSquashFixture(repository: KtcGitRepositoryInput, branch: string) {
  const original = [...(repository.commits ?? [])].reverse();
  const identity = { name: "Preview Developer", email: "developer@example.com", date: "1789014000 +0800" };
  const oid = (value: string) => value.padEnd(40, "0");
  const main: KtcPnwGitCommitGraphCommit[] = original.map((commit, index) => ({
    oid: commit.oid,
    parentOids: original[index + 1] ? [original[index + 1]!.oid] : [],
    subject: index === 1 ? "很长的提交说明：保留当前分支和工作树身份，提交说明自动截断，作者、时间与操作始终可达。".repeat(3) : commit.subject,
    author: identity, committer: identity, decorations: [],
  }));
  if (branch === "topic/demo") main.unshift(
    { oid: oid("c2"), parentOids: [oid("c1")], subject: "示例 topic：第二条修订", author: identity, committer: identity, decorations: [] },
    { oid: oid("c1"), parentOids: main[0] ? [main[0].oid] : [], subject: "示例 topic：第一条修订", author: identity, committer: identity, decorations: [] },
  );
  const commits = [...main];
  if (main.length > 8) {
    main[4] = { ...main[4]!, subject: "合并：已合入的分叉（分叉只读）", parentOids: [main[5]!.oid, oid("f2")] };
    commits[4] = main[4];
    commits.splice(5, 0, { oid: oid("f2"), parentOids: [oid("f1")], subject: "分叉：后续修订", author: identity, committer: identity, decorations: [{ kind: "local-branch", name: "refs/heads/merged-topic", displayName: "merged-topic" }] });
    commits.splice(7, 0, { oid: oid("f1"), parentOids: [main[7]!.oid], subject: "分叉：初始修订", author: identity, committer: identity, decorations: [] });
  }
  const history = commits.map((commit, index): KtcPnwGitCommitGraphCommit => ({
    ...commit,
    author: { ...commit.author, date: `${1789014000 - index * 60} +0800` },
    committer: { ...commit.committer, date: `${1789014000 - index * 60} +0800` },
    decorations: index === 0 ? [
      { name: "HEAD", displayName: "HEAD", kind: "head" },
      { name: `refs/heads/${branch}`, displayName: branch, kind: "local-branch" },
    ] : commit.decorations,
    ...(index === 2 ? { remoteTrackingRefs: [
      { name: `refs/remotes/origin/${branch}`, displayName: `origin/${branch}`, oid: commit.oid },
      { name: "refs/remotes/origin/HEAD", displayName: "origin/HEAD", oid: commit.oid, symbolicTarget: `refs/remotes/origin/${branch}` },
    ] } : {}),
  }));
  return { commits: history, graphRows: pnwProjectGitCommitGraphRows(history).rows, mainOids: main.map(({ oid }) => oid) };
}
