import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KtcCleanRootArtifacts,
  KtcCleanPreviewedRootArtifacts,
  KtcCleanWorkspace,
  KtcIsCleanupFilesystemRoot,
  KtcPreviewRootArtifacts,
} from "./KtcManualCleanup.js";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "ktc-clean-")); roots.push(root); await mkdir(join(root, ".git", "objects"), { recursive: true }); await mkdir(join(root, "a", "build"), { recursive: true }); await mkdir(join(root, "objects"), { recursive: true }); await writeFile(join(root, "a", "x.obj"), "obj"); await writeFile(join(root, ".git", "objects", "keep.obj"), "keep"); return root; }

describe("manual cleanup", () => {
  it("deletes selected build artifacts and never enters .git", async () => { const root = await fixture(); expect((await KtcCleanWorkspace(root, "build")).deleted).toHaveLength(1); expect((await KtcCleanWorkspace(root, "objects")).deleted).toHaveLength(1); expect((await KtcCleanWorkspace(root, "obj")).deleted).toHaveLength(1); expect(await readFile(join(root, ".git", "objects", "keep.obj"), "utf8")).toBe("keep"); });
  it("previews Root artifacts without deleting and execution deletes exactly that preview", async () => {
    const root = await fixture();
    const header = join(root, "XyCoreApi.HPP"), library = join(root, "xycore.dll"), unrelated = join(root, "other.lib");
    await writeFile(header, "h");
    await writeFile(library, "dll");
    await writeFile(unrelated, "lib");

    const preview = await KtcPreviewRootArtifacts(root, "- XyCore*");
    expect(preview.root).toBe(await realpath(root));
    expect([...preview.matched].sort()).toEqual([
      join(preview.root, "XyCoreApi.HPP"),
      join(preview.root, "xycore.dll"),
    ].sort());
    expect(await readFile(header, "utf8")).toBe("h");
    expect(await readFile(library, "utf8")).toBe("dll");

    const result = await KtcCleanRootArtifacts(root, "- XyCore*");
    expect(result.root).toBe(preview.root);
    expect([...result.deleted].sort()).toEqual([...preview.matched].sort());
    await expect(access(header)).rejects.toThrow();
    await expect(access(library)).rejects.toThrow();
    expect(await readFile(unrelated, "utf8")).toBe("lib");
  });
  it("does not delete matching files created after the accepted preview", async () => {
    const root = await fixture();
    const confirmed = join(root, "XyCoreConfirmed.h"), late = join(root, "XyCoreLate.dll");
    await writeFile(confirmed, "confirmed");
    const preview = await KtcPreviewRootArtifacts(root, "- XyCore*");
    await writeFile(late, "late");

    const result = await KtcCleanPreviewedRootArtifacts(preview);
    expect(result.deleted).toEqual([join(preview.root, "XyCoreConfirmed.h")]);
    await expect(access(confirmed)).rejects.toThrow();
    expect(await readFile(late, "utf8")).toBe("late");
  });
  it("refuses a confirmed file whose identity changed at the same path", async () => {
    const root = await fixture();
    const stable = join(root, "KtAStable.obj"), confirmed = join(root, "KtZGenerated.obj");
    await writeFile(stable, "stable");
    await writeFile(confirmed, "first identity");
    const preview = await KtcPreviewRootArtifacts(root, "- Kt*");

    await writeFile(confirmed, "replacement with a different identity");

    await expect(KtcCleanPreviewedRootArtifacts(preview)).rejects.toThrow("自确认预览后已变化");
    expect(await readFile(stable, "utf8")).toBe("stable");
    expect(await readFile(confirmed, "utf8")).toBe("replacement with a different identity");
  });
  it("refuses cleanup when ROOT_DIR was replaced after the accepted preview", async () => {
    const root = await fixture();
    const confirmed = join(root, "KtGenerated.obj");
    await writeFile(confirmed, "original");
    const preview = await KtcPreviewRootArtifacts(root, "- Kt*");
    const originalRoot = `${root}-original`;
    roots.push(originalRoot);

    await rename(root, originalRoot);
    await mkdir(root);
    await writeFile(join(root, "KtGenerated.obj"), "replacement root");

    await expect(KtcCleanPreviewedRootArtifacts(preview)).rejects.toThrow("ROOT_DIR 自确认预览后已变化");
    expect(await readFile(join(root, "KtGenerated.obj"), "utf8")).toBe("replacement root");
    expect(await readFile(join(originalRoot, "KtGenerated.obj"), "utf8")).toBe("original");
  });
  it("honors cooperative cancellation after full validation and before deleting any file", async () => {
    const root = await fixture();
    const first = join(root, "KtFirst.obj"), second = join(root, "KtSecond.obj");
    await writeFile(first, "first");
    await writeFile(second, "second");
    const preview = await KtcPreviewRootArtifacts(root, "- Kt*");
    const shouldContinue = vi.fn(() => false);

    await expect(KtcCleanPreviewedRootArtifacts(preview, { shouldContinue }))
      .rejects.toThrow("Root 清理已取消；未继续删除项目");

    expect(shouldContinue).toHaveBeenCalledTimes(1);
    expect(await readFile(first, "utf8")).toBe("first");
    expect(await readFile(second, "utf8")).toBe("second");
  });
  it("Root preview and cleanup both skip .git and symbolic links", async () => {
    const root = await fixture(), linkedRoot = await mkdtemp(join(tmpdir(), "ktc-clean-linked-"));
    roots.push(linkedRoot);
    const visible = join(root, "XyCoreVisible.h"), gitFile = join(root, ".git", "XyCoreHidden.hpp"), linkedFile = join(linkedRoot, "XyCoreLinked.dll");
    await writeFile(visible, "visible");
    await writeFile(gitFile, "git");
    await writeFile(linkedFile, "linked");
    await symlink(linkedRoot, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");

    const preview = await KtcPreviewRootArtifacts(root, "- XyCore*");
    expect(preview.matched).toEqual([join(preview.root, "XyCoreVisible.h")]);

    const result = await KtcCleanRootArtifacts(root, "- XyCore*");
    expect(result.deleted).toEqual(preview.matched);
    expect(await readFile(gitFile, "utf8")).toBe("git");
    expect(await readFile(linkedFile, "utf8")).toBe("linked");
  });
  it("refuses preview and destructive cleanup at the filesystem root", async () => { const root = parse(resolve(tmpdir())).root; await expect(KtcCleanWorkspace(root, "build")).rejects.toThrow("不允许在文件系统根目录执行清理"); await expect(KtcPreviewRootArtifacts(root, "XYCORE")).rejects.toThrow("不允许在文件系统根目录执行清理"); await expect(KtcCleanRootArtifacts(root, "XYCORE")).rejects.toThrow("不允许在文件系统根目录执行清理"); });
  it("recognizes POSIX, drive and UNC roots independently of the test host", () => { expect(KtcIsCleanupFilesystemRoot("/")).toBe(true); expect(KtcIsCleanupFilesystemRoot("C:\\")).toBe(true); expect(KtcIsCleanupFilesystemRoot("\\\\server\\share\\dir\\..")).toBe(true); expect(KtcIsCleanupFilesystemRoot("\\\\?\\UNC\\server\\share\\dir\\..")).toBe(true); expect(KtcIsCleanupFilesystemRoot("C:\\work")).toBe(false); });
  it("resolves the cleanup entry before rejecting a link to the filesystem root", async () => { const container = await mkdtemp(join(tmpdir(), "ktc-clean-link-")), link = join(container, "root-link"); roots.push(container); await symlink(parse(resolve(tmpdir())).root, link, process.platform === "win32" ? "junction" : "dir"); await expect(KtcPreviewRootArtifacts(link, "XYCORE")).rejects.toThrow("不允许在文件系统根目录执行清理"); await expect(KtcCleanRootArtifacts(link, "XYCORE")).rejects.toThrow("不允许在文件系统根目录执行清理"); });
  it("uses the structured default for exact direct directories and direct files only", async () => {
    const root = await fixture(), nestedObject = join(root, "a", "x.obj"), object = join(root, "module.obj"), pnx = join(root, "PNXRuntime.bin");
    await writeFile(object, "obj");
    await writeFile(pnx, "pnx");
    const preview = await KtcPreviewRootArtifacts(root, KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML);
    expect(preview.rules).toEqual({
      unlinkDirectories: [],
      directories: ["objects", "build"],
      files: ["*.obj", "*.exp", "*.pdb", "test_*.exe"],
    });
    expect(preview.matched).toEqual([
      join(preview.root, "module.obj"),
      join(preview.root, "objects"),
    ].sort((left, right) => left.localeCompare(right)));
    expect(await readFile(nestedObject, "utf8")).toBe("obj");
    expect(await readFile(pnx, "utf8")).toBe("pnx");
  });
  it("deletes a fully frozen direct directory tree without following its links", async () => {
    const root = await fixture(), target = join(root, "build"), linkedRoot = await mkdtemp(join(tmpdir(), "ktc-clean-source-"));
    roots.push(linkedRoot);
    await mkdir(join(target, "nested"), { recursive: true });
    await writeFile(join(target, "nested", "artifact.obj"), "artifact");
    await writeFile(join(linkedRoot, "keep.txt"), "keep");
    await symlink(linkedRoot, join(target, "external"), process.platform === "win32" ? "junction" : "dir");
    const preview = await KtcPreviewRootArtifacts(root, "delete:\n  directories:\n    - build\n  files: []");
    expect(preview.targets[0]?.kind).toBe("directory");
    expect(preview.targets[0]?.tree.some(({ kind }) => kind === "directory-link")).toBe(true);

    const result = await KtcCleanPreviewedRootArtifacts(preview);
    expect(result.deleted).toEqual([join(preview.root, "build")]);
    await expect(access(target)).rejects.toThrow();
    expect(await readFile(join(linkedRoot, "keep.txt"), "utf8")).toBe("keep");
  });
  it("refuses a directory tree that gained an unconfirmed child after preview", async () => {
    const root = await fixture(), target = join(root, "build");
    await mkdir(target);
    await writeFile(join(target, "confirmed.obj"), "confirmed");
    const preview = await KtcPreviewRootArtifacts(root, "delete:\n  directories:\n    - build\n  files: []");
    await writeFile(join(target, "late.obj"), "late");

    await expect(KtcCleanPreviewedRootArtifacts(preview)).rejects.toThrow("自确认预览后已变化");
    expect(await readFile(join(target, "confirmed.obj"), "utf8")).toBe("confirmed");
    expect(await readFile(join(target, "late.obj"), "utf8")).toBe("late");
  });
  it("unlinks matching direct directory links while preserving their source", async () => {
    const root = await fixture(), linkedRoot = await mkdtemp(join(tmpdir(), "ktc-clean-unlink-source-"));
    roots.push(linkedRoot);
    await writeFile(join(linkedRoot, "keep.txt"), "keep");
    const link = join(root, "DemoLibrary");
    await symlink(linkedRoot, link, process.platform === "win32" ? "junction" : "dir");
    const yaml = "unlinkDirectories:\n  - 'Demo*'\ndelete:\n  directories: []\n  files: []";
    const preview = await KtcPreviewRootArtifacts(root, yaml);
    expect(preview.matched).toEqual([join(preview.root, "DemoLibrary")]);
    expect(preview.targets[0]?.kind).toBe("directory-link");

    await KtcCleanPreviewedRootArtifacts(preview);
    await expect(access(link)).rejects.toThrow();
    expect(await readFile(join(linkedRoot, "keep.txt"), "utf8")).toBe("keep");
  });
});
