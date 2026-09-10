import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { lstatSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import * as wing from "./autoBuildCleanupWingAdapter.js";
import { KtcAutoBuildCleanupYamlWorkspace } from "./autoBuildCleanupYamlWorkspace.js";

const fixtures: string[] = [];
const rules = "delete:\n  files:\n    - '*.obj'";
async function fixture(): Promise<string> {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "ktc-yaml-cleanup-")));
  fixtures.push(directory); return directory;
}
async function source(root: string, name: string, yaml = rules): Promise<string> {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "cleanup.yaml"), yaml);
  return directory;
}
function exists(file: string): boolean { try { lstatSync(file); return true; } catch { return false; } }
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of fixtures.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("saved cleanup.yaml workspace", () => {
  it("discovers multiple canonical parents, skips metadata and directory/YAML links, deduplicates roots", async () => {
    const root = await fixture();
    const a = await source(root, "a");
    await source(root, "b");
    await source(root, ".git/hidden");
    await source(root, "node_modules/hidden");
    await symlink(a, path.join(root, "linked"), "junction");
    await mkdir(path.join(root, "linked-file"));
    await symlink(path.join(a, "cleanup.yaml"), path.join(root, "linked-file/cleanup.yaml"));
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const items = await workspace.discover([root, a, root]);
    expect(items.map((item) => item.root)).toEqual([a, path.join(root, "b")]);
    expect(items.every((item) => item.revision === 1 && item.id && item.status === "待清理")).toBe(true);
    expect(workspace.warnings.join("\n")).toContain("跳过链接");
    expect((await workspace.readForOpen(items[0]!.id)).yaml).toBe(rules);
  });

  it("cleans real direct children through Wing, keeps nested files and the other source, retains row results", async () => {
    const root = await fixture();
    const a = await source(root, "a"), b = await source(root, "b");
    await writeFile(path.join(a, "first.obj"), "a");
    await writeFile(path.join(b, "second.obj"), "b");
    await mkdir(path.join(a, "nested"));
    await writeFile(path.join(a, "nested/keep.obj"), "nested");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const [first, second] = await workspace.discover([root]);
    const result = await workspace.clean(first!.id, first!.revision);
    expect(result.root).toBe(a);
    expect(result.deleted).toEqual([path.join(a, "first.obj")]);
    expect(result.source.revision).toBe(2);
    expect(exists(path.join(a, "first.obj"))).toBe(false);
    expect(exists(path.join(a, "nested/keep.obj"))).toBe(true);
    expect(exists(path.join(b, "second.obj"))).toBe(true);
    expect(workspace.getSource(second!.id)).toEqual(second);
    expect((await workspace.discover([root])).find(({ id }) => id === first!.id)?.status).toBe("已清理 1 项");
    await expect(workspace.clean(first!.id, 1)).rejects.toThrow("版本已失效");
  });

  it("delegates selected directory trees to Wing and never follows their links", async () => {
    const root = await fixture();
    const a = await source(root, "a", "delete:\n  directories:\n    - objects");
    const outside = path.join(root, "outside");
    await mkdir(outside); await writeFile(path.join(outside, "keep.obj"), "keep");
    await mkdir(path.join(a, "objects"));
    await writeFile(path.join(a, "objects/remove.obj"), "remove");
    await symlink(outside, path.join(a, "objects/link"), "junction");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const [item] = await workspace.discover([a]);
    expect((await workspace.clean(item!.id, item!.revision)).deleted).toEqual([path.join(a, "objects")]);
    expect(await readFile(path.join(outside, "keep.obj"), "utf8")).toBe("keep");
  });

  it("returns disabled invalid rules for editing and refuses traversal, broad rules and its own YAML", async () => {
    const root = await fixture();
    for (const [name, yaml] of [["bad", "delete:\n  directories:\n    - ../outside"], ["git", "delete:\n  directories:\n    - .git"]]) await source(root, name!, yaml);
    const self = await source(root, "self", "delete:\n  files:\n    - '*.yaml'");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const rows = await workspace.discover([root]);
    for (const item of rows.filter(({ disabledReason }) => disabledReason)) {
      await expect(workspace.clean(item.id, item.revision)).rejects.toThrow();
      expect((await workspace.readForOpen(item.id)).yaml).toBeTruthy();
    }
    expect(rows.filter(({ disabledReason }) => disabledReason)).toHaveLength(2);
    const selfRow = rows.find(({ root: directory }) => directory === self)!;
    await expect(workspace.clean(selfRow.id, selfRow.revision)).rejects.toThrow("配置自身");
    expect(exists(path.join(self, "cleanup.yaml"))).toBe(true);
  });

  it("rejects home/filesystem root/relative/symlink scope without scanning them", async () => {
    const root = await fixture();
    const a = await source(root, "a");
    const link = path.join(root, "alias"); await symlink(a, link, "junction");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    expect(await workspace.discover([path.parse(root).root, homedir(), ".", link])).toEqual([]);
    expect(workspace.warnings).toHaveLength(4);
  });

  it("does not delete a selected tree containing nested Git metadata", async () => {
    const root = await fixture();
    const a = await source(root, "a", "delete:\n  directories:\n    - build");
    await mkdir(path.join(a, "build/.git"), { recursive: true });
    await writeFile(path.join(a, "build/keep.obj"), "keep");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace(); const [item] = await workspace.discover([a]);
    await expect(workspace.clean(item!.id, item!.revision)).rejects.toThrow("Git 元数据");
    expect(exists(path.join(a, "build/keep.obj"))).toBe(true);
  });

  it("publishes transparent depth/count/entry/byte caps", async () => {
    const root = await fixture();
    await source(root, "a/deep"); await source(root, "b");
    const depthLimited = new KtcAutoBuildCleanupYamlWorkspace({ limits: { maxDepth: 0 } });
    expect(await depthLimited.discover([root])).toEqual([]);
    expect(depthLimited.warnings.join()).toContain("深度 0");
    const sourceLimited = new KtcAutoBuildCleanupYamlWorkspace({ limits: { maxSources: 1 } });
    expect(await sourceLimited.discover([root])).toHaveLength(1);
    expect(sourceLimited.warnings.join()).toContain("YAML 数量");
    const directoryLimited = new KtcAutoBuildCleanupYamlWorkspace({ limits: { maxDirectories: 1 } });
    await directoryLimited.discover([root]); expect(directoryLimited.warnings.join()).toContain("目录数量");
    const entryLimited = new KtcAutoBuildCleanupYamlWorkspace({ limits: { maxEntries: 1 } });
    await entryLimited.discover([root]); expect(entryLimited.warnings.join()).toContain("目录项数量");
    const byteLimited = new KtcAutoBuildCleanupYamlWorkspace({ limits: { maxYamlBytes: 5 } });
    expect(await byteLimited.discover([root])).toEqual([]); expect(byteLimited.warnings.join()).toContain("体积超过 5");
    expect(() => new KtcAutoBuildCleanupYamlWorkspace({ limits: { maxSources: 1_000 } })).toThrow("上限");
  });

  it("rejects saved-file changes and stale revisions, then re-discovers the new version", async () => {
    const root = await fixture(); const a = await source(root, "a");
    await writeFile(path.join(a, "keep.obj"), "keep");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const [item] = await workspace.discover([root]);
    await writeFile(item!.path, `${rules}\n# changed`);
    await expect(workspace.readForOpen(item!.id)).rejects.toThrow("已变化");
    await expect(workspace.clean(item!.id, item!.revision)).rejects.toThrow("已变化");
    expect(exists(path.join(a, "keep.obj"))).toBe(true);
    const [updated] = await workspace.discover([root]);
    expect(updated!.id).toBe(item!.id); expect(updated!.revision).toBeGreaterThan(item!.revision);
    expect(updated!.disabledReason).toBeUndefined();
  });

  it("rejects dirty documents without deleting and resets retryable row error after re-discovery", async () => {
    const root = await fixture(); const a = await source(root, "a");
    await writeFile(path.join(a, "keep.obj"), "keep");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const [item] = await workspace.discover([root]);
    const isDirty = vi.fn(() => true);
    await expect(workspace.clean(item!.id, item!.revision, { isDirty })).rejects.toThrow("未保存");
    expect(isDirty).toHaveBeenCalledWith(item!.path);
    expect(exists(path.join(a, "keep.obj"))).toBe(true);
    const [updated] = await workspace.discover([root]);
    expect(updated!.disabledReason).toBeUndefined();
    expect((await workspace.clean(updated!.id, updated!.revision, { isDirty: () => false })).deleted).toHaveLength(1);
  });

  it("rejects a replaced directory ancestor even when the YAML inode/content are retained", async () => {
    const root = await fixture(); const a = await source(root, "a");
    await writeFile(path.join(a, "keep.obj"), "keep");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const [item] = await workspace.discover([root]);
    await rename(a, path.join(root, "original")); await mkdir(a);
    await rename(path.join(root, "original/cleanup.yaml"), path.join(a, "cleanup.yaml"));
    await rename(path.join(root, "original/keep.obj"), path.join(a, "keep.obj"));
    await expect(workspace.clean(item!.id, item!.revision)).rejects.toThrow("祖先身份已变化");
    expect(exists(path.join(a, "keep.obj"))).toBe(true);
  });

  it("rejects replacement YAML links and directory links after discovery", async () => {
    const root = await fixture(); const a = await source(root, "a"), b = await source(root, "b");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    const [first] = await workspace.discover([a]);
    await rename(first!.path, path.join(a, "original.yaml")); await symlink(path.join(b, "cleanup.yaml"), first!.path);
    await expect(workspace.readForOpen(first!.id)).rejects.toThrow("链接");
    await expect(workspace.clean(first!.id, first!.revision)).rejects.toThrow("链接");
    await workspace.discover([b]);
    const [second] = workspace.sources;
    await rename(b, path.join(root, "old-b")); await symlink(path.join(root, "old-b"), b, "junction");
    await expect(workspace.clean(second!.id, second!.revision)).rejects.toThrow("链接");
  });

  it("freezes exact Wing targets so a new direct-child match is not also deleted", async () => {
    const root = await fixture(); const a = await source(root, "a");
    await writeFile(path.join(a, "old.obj"), "old");
    const preview = wing.ktcPreviewWingCleanupArtifacts;
    vi.spyOn(wing, "ktcPreviewWingCleanupArtifacts").mockImplementation(async (...args) => {
      const frozen = await preview(...args); await writeFile(path.join(a, "new.obj"), "new"); return frozen;
    });
    const workspace = new KtcAutoBuildCleanupYamlWorkspace(); const [item] = await workspace.discover([a]);
    expect((await workspace.clean(item!.id, item!.revision)).deleted).toEqual([path.join(a, "old.obj")]);
    expect(exists(path.join(a, "new.obj"))).toBe(true);
  });

  it("revalidates YAML after preview and at Wing's destructive checkpoints", async () => {
    const root = await fixture(); const a = await source(root, "a");
    await writeFile(path.join(a, "keep.obj"), "keep");
    const execute = wing.ktcCleanPreviewedWingArtifacts;
    vi.spyOn(wing, "ktcCleanPreviewedWingArtifacts").mockImplementation(async (preview, options) => {
      writeFileSync(path.join(a, "cleanup.yaml"), `${rules}\n# changed just before Wing`);
      return execute(preview, options);
    });
    const workspace = new KtcAutoBuildCleanupYamlWorkspace(); const [item] = await workspace.discover([a]);
    await expect(workspace.clean(item!.id, item!.revision)).rejects.toThrow("已变化");
    expect(exists(path.join(a, "keep.obj"))).toBe(true);
  });

  it("rejects a changed saved rule before invoking Wing execution", async () => {
    const root = await fixture(); const a = await source(root, "a");
    await writeFile(path.join(a, "keep.obj"), "keep");
    const preview = wing.ktcPreviewWingCleanupArtifacts;
    vi.spyOn(wing, "ktcPreviewWingCleanupArtifacts").mockImplementation(async (...args) => {
      const result = await preview(...args); await writeFile(path.join(a, "cleanup.yaml"), `${rules}\n# changed`); return result;
    });
    const execute = vi.spyOn(wing, "ktcCleanPreviewedWingArtifacts");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace(); const [item] = await workspace.discover([a]);
    await expect(workspace.clean(item!.id, item!.revision)).rejects.toThrow("已变化");
    expect(execute).not.toHaveBeenCalled(); expect(exists(path.join(a, "keep.obj"))).toBe(true);
  });

  it("rejects concurrent requests and cancels a closed session before Wing execution", async () => {
    const root = await fixture(); const a = await source(root, "a");
    await writeFile(path.join(a, "keep.obj"), "keep");
    let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const preview = wing.ktcPreviewWingCleanupArtifacts;
    vi.spyOn(wing, "ktcPreviewWingCleanupArtifacts").mockImplementation(async (...args) => { entered(); await barrier; return preview(...args); });
    const workspace = new KtcAutoBuildCleanupYamlWorkspace(); const [item] = await workspace.discover([a]);
    const running = workspace.clean(item!.id, item!.revision);
    await ready;
    await expect(workspace.clean(item!.id, item!.revision)).rejects.toThrow("正在进行");
    await expect(workspace.discover([a])).rejects.toThrow("正在进行");
    workspace.dispose(); release();
    await expect(running).rejects.toThrow("已取消");
    expect(exists(path.join(a, "keep.obj"))).toBe(true);
    await expect(workspace.discover([a])).rejects.toThrow("已关闭");
  });

  it("cancels discovery/cleaning and makes previous scope IDs unusable", async () => {
    const root = await fixture(); const a = await source(root, "a"), b = await source(root, "b");
    await writeFile(path.join(a, "keep.obj"), "keep");
    const workspace = new KtcAutoBuildCleanupYamlWorkspace();
    await expect(workspace.discover([a], { shouldContinue: () => false })).rejects.toThrow("已取消");
    const [item] = await workspace.discover([a]);
    await expect(workspace.clean(item!.id, item!.revision, { shouldContinue: () => false })).rejects.toThrow("已取消");
    expect(exists(path.join(a, "keep.obj"))).toBe(true);
    await workspace.discover([b]);
    expect(() => workspace.getSource(item!.id)).toThrow("已失效");
    const [newItem] = workspace.sources; workspace.invalidate();
    expect(() => workspace.getSource(newItem!.id)).toThrow("已失效");
  });
});
