import { describe, expect, it, vi } from "vitest";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import {
  ktcCreateAutoBuildCleanupPlan,
  ktcFormatAutoBuildCleanupPlan,
} from "./autoBuildCleanupPlan.js";

function configuration(): KtcAutoBuildConfiguration {
  return {
    schemaVersion: 2,
    rootDirectory: "E:/Phoenix/subdirectory",
    thirdPartyDirectory: "E:/Phoenix-3rdParty/vendor",
    workingDirectory: "E:/projects",
    rootBranch: "develop",
    branch: "develop",
    cmakeBranch: "master",
    buildExecutionMode: "sequential",
    clean: false,
    projects: [
      {
        id: "core",
        enabled: true,
        name: "KtCore",
        path: "KtCore",
        branch: "develop",
        operations: { update: true, cmake: true, caa: false, linkCaa: false },
      },
      {
        id: "disabled",
        enabled: false,
        name: "Disabled",
        path: "Disabled",
        branch: "develop",
        operations: { update: true, cmake: true, caa: false, linkCaa: false },
      },
    ],
  };
}

describe("AutoBuild cleanup plan", () => {
  it("resolves every Git candidate to its actual top-level and lists exact CMake build actions", async () => {
    const resolveGitTopLevel = vi.fn(async (path: string) => ({
      "E:/Phoenix/subdirectory": "E:/Phoenix",
      "E:/Phoenix-3rdParty/vendor": "E:/Phoenix-3rdParty",
      "E:\\projects\\KtCore": "E:/Phoenix",
    }[path] || path));

    const identityReader = {
      readRepository: vi.fn(async (path: string) => ({
        path,
        head: path.includes("3rdParty") ? "b".repeat(40) : "a".repeat(40),
        gitDir: `${path}/.git`,
        origin: path.includes("3rdParty") ? "https://example/third.git" : "https://example/root.git",
        worktree: { path, creationTimeUtcMs: "1000" },
        gitDirectory: { path: `${path}/.git`, creationTimeUtcMs: "2000" },
      })),
      readDirectory: vi.fn(async (path: string) => ({
        path,
        exists: !path.endsWith("\\build"),
        creationTimeUtcMs: path.endsWith("\\build") ? "" : "3000",
        lastWriteTimeUtcMs: path.endsWith("\\build") ? "" : "4000",
      })),
    };

    const plan = await ktcCreateAutoBuildCleanupPlan(configuration(), resolveGitTopLevel, identityReader);

    expect(resolveGitTopLevel.mock.calls).toEqual([
      ["E:/Phoenix/subdirectory", "ROOT_DIR"],
      ["E:/Phoenix-3rdParty/vendor", "ROOT_DIR_3rdParty"],
      ["E:\\projects\\KtCore", "CMake 项目"],
    ]);
    expect(plan.repositories).toEqual(["E:/Phoenix", "E:/Phoenix-3rdParty"]);
    expect(plan.repositoryIdentities).toHaveLength(2);
    expect(plan.repositoryIdentities[0]).toMatchObject({
      path: "E:/Phoenix",
      head: "a".repeat(40),
      gitDir: "E:/Phoenix/.git",
      origin: "https://example/root.git",
      worktree: { creationTimeUtcMs: "1000" },
      gitDirectory: { creationTimeUtcMs: "2000" },
    });
    expect(plan.cmakeBuildTargets).toEqual([
      {
        path: "E:\\projects\\build",
        action: "empty-and-preserve",
        identity: {
          target: { path: "E:\\projects\\build", exists: false, creationTimeUtcMs: "", lastWriteTimeUtcMs: "" },
          parent: { path: "E:\\projects", exists: true, creationTimeUtcMs: "3000", lastWriteTimeUtcMs: "4000" },
        },
      },
      {
        path: "E:\\projects\\KtCore\\build",
        action: "delete",
        identity: {
          target: { path: "E:\\projects\\KtCore\\build", exists: false, creationTimeUtcMs: "", lastWriteTimeUtcMs: "" },
          parent: { path: "E:\\projects\\KtCore", exists: true, creationTimeUtcMs: "3000", lastWriteTimeUtcMs: "4000" },
        },
      },
    ]);
    expect(ktcFormatAutoBuildCleanupPlan(plan)).toBe([
      "Git 仓库（reset --hard + clean -ffdx）：",
      "- E:/Phoenix",
      "- E:/Phoenix-3rdParty",
      "",
      "CMake 构建目录：",
      "- [清空内容并保留目录] E:\\projects\\build",
      "- [删除整个目录] E:\\projects\\KtCore\\build",
    ].join("\n"));
  });

  it("fails closed when a repository identity is bound to a different path", async () => {
    await expect(ktcCreateAutoBuildCleanupPlan(
      { ...configuration(), projects: [] },
      async (path) => path,
      {
        readRepository: async (path) => ({
          path: `${path}-replacement`,
          head: "a".repeat(40),
          gitDir: `${path}/.git`,
          origin: "https://example/repository.git",
          worktree: { path, creationTimeUtcMs: "1000" },
          gitDirectory: { path: `${path}/.git`, creationTimeUtcMs: "2000" },
        }),
        readDirectory: async (path) => ({ path, exists: true, creationTimeUtcMs: "3000", lastWriteTimeUtcMs: "4000" }),
      },
    )).rejects.toThrow("Git 身份路径与清理目标不一致");
  });

  it("omits disabled fixed repositories from the confirmed cleanup scope", async () => {
    const resolveGitTopLevel = vi.fn(async (path: string) => path);
    const config = {
      ...configuration(),
      rootEnabled: false,
      thirdPartyEnabled: true,
      projects: [],
    };
    const plan = await ktcCreateAutoBuildCleanupPlan(config, resolveGitTopLevel, {
      readRepository: async (path) => ({
        path,
        head: "a".repeat(40),
        gitDir: `${path}/.git`,
        origin: "https://example/repo.git",
        worktree: { path, creationTimeUtcMs: "1000" },
        gitDirectory: { path: `${path}/.git`, creationTimeUtcMs: "2000" },
      }),
      readDirectory: async (path) => ({
        path,
        exists: true,
        creationTimeUtcMs: "3000",
        lastWriteTimeUtcMs: "4000",
      }),
    });

    expect(resolveGitTopLevel.mock.calls).toEqual([[config.thirdPartyDirectory, "ROOT_DIR_3rdParty"]]);
    expect(plan.repositories).toEqual([config.thirdPartyDirectory]);
  });
});
