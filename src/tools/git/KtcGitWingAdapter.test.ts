import { describe, expect, it } from "vitest";
import { KtcGitWingAdapter, type KtcPnwGitCommitSummary } from "./KtcGitWingAdapter.js";

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
  it("兼容已发布 Wing 并保留 subject 与 body 之间的空行和全部正文", () => {
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
