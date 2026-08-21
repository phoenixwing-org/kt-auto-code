import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { KtcGitWingAdapter, type KtcPnwGitCommitSummary } from "./KtcGitWingAdapter.js";

const execFile = promisify(execFileCallback);

const commit: KtcPnwGitCommitSummary = {
  oid: "b245527fa4941655222c420df565cb59d70c5d83",
  subject: "版本：升级 Open Issue 插件至 0.7.0",
  body: [
    "",
    "- 统一根工作区、兼容包、manifest 与 descriptor 版本",
    "- 固定 0.7.0 的 .phoenix.cool 包名和部署示例",
    "- 归档生产模拟环境安装、启停与卸载保留验证",
    "- 更新当前路线、更新日志与版本回归测试",
    "- 保留 0.6.x 迁移和数据库生命周期历史证据",
    "",
  ].join("\n"),
  author: { name: "Phoenix Wing", email: "3301647@qq.com", date: "1785919551 +0800" },
  committer: { name: "Phoenix Wing", email: "3301647@qq.com", date: "1785919551 +0800" },
};

const expectedMessage = [
  "origin/develop **Commit:** b245527 ++ · 2026-08-05 16:45",
  "版本：升级 Open Issue 插件至 0.7.0 审查：@杨海华",
  "",
  "- 统一根工作区、兼容包、manifest 与 descriptor 版本",
  "- 固定 0.7.0 的 .phoenix.cool 包名和部署示例",
  "- 归档生产模拟环境安装、启停与卸载保留验证",
  "- 更新当前路线、更新日志与版本回归测试",
  "- 保留 0.6.x 迁移和数据库生命周期历史证据",
].join("\n");

describe("KtcGitWingAdapter commit 简报", () => {
  it("直接消费已发布 Wing formatter，并保留 subject 与 body 之间的空行和全部正文", () => {
    const result = new KtcGitWingAdapter().formatGroupSummaries({
      repositoryName: "phoenix-open-issue",
      upstream: "origin/develop",
      commits: [commit],
      includeCommitTime: true,
      fallbackReviewer: "杨海华",
    });

    expect(result.text).toBe(`phoenix-open-issue ${expectedMessage}`);
    expect(result.text).toContain("0.7.0 审查：@杨海华\n\n- 统一根工作区");
  });

  it("包含远端地址时仍只追加一次完整正文", () => {
    const result = new KtcGitWingAdapter().formatGroupSummaries({
      repositoryName: "phoenix-open-issue",
      upstream: "origin/develop",
      commits: [commit],
      remoteUrl: "https://gitee.com/phoenixwing/phoenix-open-issue.git",
      includeRemoteUrl: true,
      includeCommitTime: true,
      fallbackReviewer: "杨海华",
    });

    expect(result.text).toBe([
      "https://gitee.com/phoenixwing/phoenix-open-issue.git",
      expectedMessage,
    ].join("\n"));
    expect(result.text.match(/统一根工作区/gu)).toHaveLength(1);
  });
});

describe("KtcGitWingAdapter 本地 Wing 提交图联调", () => {
  it.skipIf(process.env.PHOENIX_WING_DEV_MODE !== "1")(
    "以不透明 cursor 分页，显示 merge/tag，并拒绝已变化的 HEAD",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "ktc-git-graph-"));
      const git = async (...args: readonly string[]) => execFile("git", args, { cwd: root });
      try {
        await git("init", "-b", "main");
        await git("config", "user.name", "KT Auto Test");
        await git("config", "user.email", "auto-test@example.invalid");
        await writeFile(join(root, "base.txt"), "base\n");
        await git("add", ".");
        await git("commit", "-m", "base");
        await git("checkout", "-b", "topic");
        await writeFile(join(root, "topic.txt"), "topic\n");
        await git("add", ".");
        await git("commit", "-m", "topic commit");
        await git("checkout", "main");
        await writeFile(join(root, "main.txt"), "main\n");
        await git("add", ".");
        await git("commit", "-m", "main commit");
        await git("merge", "--no-ff", "topic", "-m", "merge topic");
        await git("tag", "v0.1.0");

        const adapter = new KtcGitWingAdapter();
        const first = await adapter.readCommitGraphPage(root, {
          limit: 2,
          refsScope: "local-branches-and-tags",
        });

        expect(first.commits).toHaveLength(2);
        expect(first.graphRows).toHaveLength(2);
        expect(first.commits[0]?.parentOids).toHaveLength(2);
        expect(first.commits[0]?.decorations.some((item) => item.kind === "tag")).toBe(true);
        expect(first.nextBeforeCursor).toEqual(expect.any(String));

        const next = await adapter.readCommitGraphPage(root, {
          expectedHeadOid: first.headOid,
          beforeCursor: first.nextBeforeCursor,
          limit: 1,
          refsScope: "local-branches-and-tags",
        });
        expect(next.commits).toHaveLength(1);
        expect(next.commits[0]?.oid).not.toBe(first.commits[0]?.oid);

        await writeFile(join(root, "head-changed.txt"), "new head\n");
        await git("add", ".");
        await git("commit", "-m", "change head");
        await expect(adapter.readCommitGraphPage(root, {
          expectedHeadOid: first.headOid,
          beforeCursor: first.nextBeforeCursor,
          limit: 1,
          refsScope: "local-branches-and-tags",
        })).rejects.toThrow();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
