import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KtcSearchWorkspaceGitRepositories } from "./KtcGitWorkspaceSearch.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Git workspace recursive search", () => {
  it("逐个报告目录型和文件型 .git，并跳过依赖目录", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-git-search-"));
    roots.push(root);
    await mkdir(join(root, "apps", "one", ".git"), { recursive: true });
    await mkdir(join(root, "apps", "two"), { recursive: true });
    await writeFile(join(root, "apps", "two", ".git"), "gitdir: ../actual\n");
    await mkdir(join(root, "node_modules", "hidden", ".git"), { recursive: true });
    const found: string[] = [];

    await KtcSearchWorkspaceGitRepositories([root], {
      onProgress: ({ repositoryRoot }) => { if (repositoryRoot) found.push(repositoryRoot); },
    });

    expect(found.sort()).toEqual([
      join(root, "apps", "one"),
      join(root, "apps", "two"),
    ].sort());
  });

  it("响应 AbortSignal 停止后续目录扫描", async () => {
    const root = await mkdtemp(join(tmpdir(), "ktc-git-search-"));
    roots.push(root);
    await mkdir(join(root, "one", ".git"), { recursive: true });
    await mkdir(join(root, "two", ".git"), { recursive: true });
    const cancellation = new AbortController();

    await expect(KtcSearchWorkspaceGitRepositories([root], {
      signal: cancellation.signal,
      onProgress: ({ repositoryRoot }) => {
        if (repositoryRoot) cancellation.abort();
      },
    })).rejects.toMatchObject({ name: "AbortError" });
  });
});
