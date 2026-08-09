import { describe, expect, it } from "vitest";
import { KtcCreateGitModel, type KtcGitIdentity } from "./KtcGitModel.js";

const identity: KtcGitIdentity = {
  name: "Phoenix Wing",
  email: "3301647@qq.com",
  date: "1784357700 +0800",
  dateLabel: "2026/7/18 14:55:00 GMT+0800",
};

describe("Git Primary model", () => {
  it("只突出简报与本地 commit 合并，并投影仓库上下文", () => {
    const model = KtcCreateGitModel({
      repositories: [{
        id: "file:///workspace/PNXCaaStudy",
        name: "PNXCaaStudy",
        branch: "sort",
        upstream: "check/sort",
        head: "4b4622df4580439c1b93876a87565c2420a4f253",
        clean: true,
        operationState: "idle",
        commits: [
          {
            oid: "8f8f40e4ddff2ae6f790801c31004c7da50851e7",
            parentOids: ["1111111111111111111111111111111111111111"],
            subject: "准备",
            body: "",
            author: identity,
            committer: identity,
          },
          {
            oid: "4b4622df4580439c1b93876a87565c2420a4f253",
            parentOids: ["8f8f40e4ddff2ae6f790801c31004c7da50851e7"],
            subject: "修复：补齐曲线分割命令构造控制符 审查：Kevin",
            body: "",
            author: identity,
            committer: identity,
            isHead: true,
          },
        ],
      }],
    });

    const project = model.projects[0];
    expect(model.selectedRepositoryId).toBe("file:///workspace/PNXCaaStudy");
    expect(project?.actions.map((action) => action.id)).toEqual(["squashLocalCommits"]);
    expect(project?.repository).toMatchObject({ upstreamLabel: "check/sort", headLabel: "4b4622d" });
    expect(project?.commits[0]).toMatchObject({ shortOid: "4b4622d", isHead: true });
    expect(project?.actions[0]).toMatchObject({ enabled: true, buttonLabel: "选择并预检" });
  });

  it("detached HEAD 保留只读简报并阻断合并入口", () => {
    const model = KtcCreateGitModel({
      repositories: [{
        id: "repo",
        name: "repo",
        detached: true,
        head: "abcdef0123",
        clean: true,
        commits: [{
          oid: "abcdef0123",
          parentOids: ["1234567890"],
          subject: "HEAD",
          body: "",
          author: identity,
          committer: identity,
          isHead: true,
        }],
      }],
    });

    expect(model.projects[0]?.actions).toEqual([
      expect.objectContaining({ id: "squashLocalCommits", enabled: false }),
    ]);
    expect(model.projects[0]?.repository.branchLabel).toBe("detached/abcdef0");
  });

  it("默认只显示 20 条，并按仓库限制增量显示更多 commit", () => {
    const commits = Array.from({ length: 45 }, (_, index) => ({
      oid: String(index).padStart(40, "0"),
      parentOids: index === 0 ? [] : [String(index - 1).padStart(40, "0")],
      subject: `commit ${index}`,
      body: "",
      author: identity,
      committer: identity,
      isHead: index === 44,
    }));
    const initial = KtcCreateGitModel({ repositories: [{ id: "repo", name: "repo", clean: true, commits }] });
    const expanded = KtcCreateGitModel({
      repositories: [{ id: "repo", name: "repo", clean: true, commits, recentCommitLimit: 40 }],
    });
    expect(initial.projects[0]).toMatchObject({ visibleCommitLimit: 20, totalCommitCount: 45, hasMoreCommits: true });
    expect(initial.projects[0]?.commits).toHaveLength(20);
    expect(expanded.projects[0]).toMatchObject({ visibleCommitLimit: 40, totalCommitCount: 45, hasMoreCommits: true });
    expect(expanded.projects[0]?.commits).toHaveLength(40);
  });

  it("保持有效的所选仓库，并在仓库消失时回退到第一项", () => {
    const repositories = [
      { id: "repo-a", name: "A", clean: true },
      { id: "repo-b", name: "B", clean: true },
    ];
    expect(KtcCreateGitModel({ repositories, selectedRepositoryId: "repo-b" }).selectedRepositoryId).toBe("repo-b");
    expect(KtcCreateGitModel({ repositories, selectedRepositoryId: "missing" }).selectedRepositoryId).toBe("repo-a");
    expect(KtcCreateGitModel({ repositories: [] }).statusText).toBe("当前工作区未发现 Git 仓库。");
  });

  it("区分工作区与用户仓库，并允许未读取仓库作为按需占位", () => {
    const model = KtcCreateGitModel({
      repositories: [
        { id: "workspace", name: "Workspace", loaded: false, sourceGroup: "workspace" },
        { id: "external", name: "External", loaded: false, sourceGroup: "external" },
      ],
    });
    expect(model.projects[0]?.repository).toMatchObject({
      groupLabel: "当前工作区",
      loaded: false,
      external: false,
      stateLabel: "选择后读取",
    });
    expect(model.projects[1]?.repository).toMatchObject({
      groupLabel: "我的仓库",
      loaded: false,
      external: true,
    });
    expect(model.projects[1]?.actions[0]).toMatchObject({ enabled: false });
  });

  it("投影可停止的递进仓库搜索，并允许轻量 commit 点击后再做合并预检", () => {
    const model = KtcCreateGitModel({
      workspaceFolderCount: 1,
      discovery: { status: "searching", scannedDirectories: 120, foundRepositories: 1 },
      repositories: [{
        id: "repo",
        name: "repo",
        branch: "develop",
        head: "abcdef0123456789",
        loaded: true,
        sourceGroup: "workspace",
        commits: [{
          oid: "abcdef0123456789",
          subject: "轻量摘要",
          body: "",
          author: identity,
          committer: identity,
          isHead: true,
        }],
      }],
    });

    expect(model).toMatchObject({
      workspaceFolderCount: 1,
      workspaceRepositoryCount: 1,
      discovery: { status: "searching", scannedDirectories: 120, foundRepositories: 1 },
    });
    expect(model.statusText).toContain("已检查 120 个目录");
    expect(model.projects[0]?.actions[0]).toMatchObject({ enabled: true });
  });

});
