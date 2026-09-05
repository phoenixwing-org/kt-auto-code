import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { KtcCleanRootArtifacts, KtcCleanWorkspace, KtcIsCleanupFilesystemRoot } from "./KtcManualCleanup.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "ktc-clean-")); roots.push(root); await mkdir(join(root, ".git", "objects"), { recursive: true }); await mkdir(join(root, "a", "build"), { recursive: true }); await mkdir(join(root, "objects"), { recursive: true }); await writeFile(join(root, "a", "x.obj"), "obj"); await writeFile(join(root, ".git", "objects", "keep.obj"), "keep"); return root; }

describe("manual cleanup", () => {
  it("deletes selected build artifacts and never enters .git", async () => { const root = await fixture(); expect((await KtcCleanWorkspace(root, "build")).deleted).toHaveLength(1); expect((await KtcCleanWorkspace(root, "objects")).deleted).toHaveLength(1); expect((await KtcCleanWorkspace(root, "obj")).deleted).toHaveLength(1); expect(await readFile(join(root, ".git", "objects", "keep.obj"), "utf8")).toBe("keep"); });
  it("matches Root artifact prefixes case-insensitively", async () => { const root = await fixture(); await writeFile(join(root, "XyCoreApi.HPP"), "h"); await writeFile(join(root, "xycore.dll"), "dll"); await writeFile(join(root, "other.lib"), "lib"); expect((await KtcCleanRootArtifacts(root, "XYCORE")).deleted).toHaveLength(2); expect(await readFile(join(root, "other.lib"), "utf8")).toBe("lib"); });
  it("refuses destructive cleanup at the filesystem root", async () => { const root = parse(resolve(tmpdir())).root; await expect(KtcCleanWorkspace(root, "build")).rejects.toThrow("不允许在文件系统根目录执行清理"); await expect(KtcCleanRootArtifacts(root, "XYCORE")).rejects.toThrow("不允许在文件系统根目录执行清理"); });
  it("recognizes POSIX, drive and UNC roots independently of the test host", () => { expect(KtcIsCleanupFilesystemRoot("/")).toBe(true); expect(KtcIsCleanupFilesystemRoot("C:\\")).toBe(true); expect(KtcIsCleanupFilesystemRoot("\\\\server\\share\\dir\\..")).toBe(true); expect(KtcIsCleanupFilesystemRoot("\\\\?\\UNC\\server\\share\\dir\\..")).toBe(true); expect(KtcIsCleanupFilesystemRoot("C:\\work")).toBe(false); });
  it("resolves the cleanup entry before rejecting a link to the filesystem root", async () => { const container = await mkdtemp(join(tmpdir(), "ktc-clean-link-")), link = join(container, "root-link"); roots.push(container); await symlink(parse(resolve(tmpdir())).root, link, process.platform === "win32" ? "junction" : "dir"); await expect(KtcCleanRootArtifacts(link, "XYCORE")).rejects.toThrow("不允许在文件系统根目录执行清理"); });
});
