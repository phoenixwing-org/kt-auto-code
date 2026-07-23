import { describe, expect, it } from "vitest";
import {
  KtcChooseGitRepositoryId,
  KtcCollectGitRepositoryCandidates,
  KtcDescribeGitRepository,
} from "./KtcGitRepositoryDiscovery.js";

describe("Git repository discovery", () => {
  it("合并多根工作区、VS Code 仓库和 submodule，并按输入路径去重", () => {
    const candidates = KtcCollectGitRepositoryCandidates({
      workspaceFolders: [
        { name: "App", fsPath: "/workspace/app" },
        { name: "Lib", fsPath: "/workspace/lib" },
      ],
      gitRepositories: [
        { rootPath: "/workspace/app", submodulePaths: ["packages/core", "packages/ui"] },
        { rootPath: "/workspace/lib" },
      ],
      activeFilePath: "/workspace/app/packages/core/src/index.ts",
    });

    expect(candidates.map((candidate) => [candidate.startPath, candidate.source])).toEqual([
      ["/workspace/app", "workspace"],
      ["/workspace/lib", "workspace"],
      ["/workspace/app/packages/core", "submodule"],
      ["/workspace/app/packages/ui", "submodule"],
      ["/workspace/app/packages/core/src", "active-editor"],
    ]);
  });

  it("接收 VS Code 已发现的独立嵌套仓库，拒绝工作区外仓库", () => {
    const candidates = KtcCollectGitRepositoryCandidates({
      workspaceFolders: [{ name: "Trial", fsPath: "/workspace/trial" }],
      gitRepositories: [
        { rootPath: "/workspace/trial/tools/repo" },
        { rootPath: "/outside/repo" },
      ],
    });

    expect(candidates.map((candidate) => candidate.startPath)).toEqual([
      "/workspace/trial",
      "/workspace/trial/tools/repo",
    ]);
  });

  it("活动文件可补足尚未被 Git API 发现的仓库入口", () => {
    const candidates = KtcCollectGitRepositoryCandidates({
      workspaceFolders: [{ name: "Trial", fsPath: "/workspace/trial" }],
      activeFilePath: "/workspace/trial/nested/src/main.cpp",
    });
    expect(candidates.at(-1)).toMatchObject({
      startPath: "/workspace/trial/nested/src",
      workspaceName: "Trial",
      source: "active-editor",
    });
  });

  it("显示仓库名与工作区相对路径，并优先选择当前或活动文件最深仓库", () => {
    expect(KtcDescribeGitRepository(
      "/workspace/trial/packages/core",
      "core",
      [{ name: "Trial", fsPath: "/workspace/trial" }],
    )).toMatchObject({ name: "core", relativePath: "Trial/packages/core" });

    const roots = ["/workspace/trial", "/workspace/trial/packages/core"];
    expect(KtcChooseGitRepositoryId({
      repositoryRoots: roots,
      currentId: "/workspace/trial",
      activeFilePath: "/workspace/trial/packages/core/src/a.ts",
    })).toBe("/workspace/trial");
    expect(KtcChooseGitRepositoryId({
      repositoryRoots: roots,
      activeFilePath: "/workspace/trial/packages/core/src/a.ts",
    })).toBe("/workspace/trial/packages/core");
    expect(KtcChooseGitRepositoryId({
      repositoryRoots: roots,
      storedId: "/workspace/trial/packages/core",
    })).toBe("/workspace/trial/packages/core");
  });
});
