import { describe, it, expect } from "vitest";
import {
  ensurePhoenixIgnore,
  isIgnoredPath,
  loadDotIgnore,
  phoenixIgnoreFile,
  shouldSkipDirName,
  syncPhoenixIgnoreFromGit,
} from "./dotIgnore.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("dotIgnore", () => {
  it("从 .phoenix/.ignore 加载规则", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-phoenix-"));
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "vendor/\n# comment\nlegacy.cpp\n");
    expect(phoenixIgnoreFile(root).replace(/\\/g, "/")).toContain("/.phoenix/.ignore");
    expect(loadDotIgnore(root)).toEqual(["vendor/", "legacy.cpp"]);
  });
  it("不存在时从 .gitignore 同步生成 .phoenix/.ignore", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-phoenix-"));
    writeFileSync(join(root, ".gitignore"), "node_modules/\ndist/\n");
    const info = ensurePhoenixIgnore(root);
    expect(info.syncedFromGit).toBe(true);
    expect(info.patternCount).toBe(2);
    expect(loadDotIgnore(root)).toEqual(["node_modules/", "dist/"]);
  });

  it("无 .gitignore 时创建空模板", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-phoenix-"));
    const info = ensurePhoenixIgnore(root);
    expect(info.syncedFromGit).toBe(false);
    expect(info.exists).toBe(true);
    expect(loadDotIgnore(root)).toEqual([]);
  });

  it("已存在时不覆盖", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-phoenix-"));
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "custom/\n");
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    ensurePhoenixIgnore(root);
    expect(loadDotIgnore(root)).toEqual(["custom/"]);
  });

  it("手动同步覆盖为 .gitignore 内容", () => {
    const root = mkdtempSync(join(tmpdir(), "kt-phoenix-"));
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "old/\n");
    writeFileSync(join(root, ".gitignore"), "new/\n");
    const info = syncPhoenixIgnoreFromGit(root);
    expect(info.syncedFromGit).toBe(true);
    expect(loadDotIgnore(root)).toEqual(["new/"]);
  });

  it("匹配目录规则 build/", () => {
    const patterns = ["build/", "Debug/"];
    expect(isIgnoredPath("src/foo.cpp", patterns)).toBe(false);
    expect(isIgnoredPath("build/out.cpp", patterns)).toBe(true);
    expect(shouldSkipDirName("build", patterns)).toBe(true);
    expect(shouldSkipDirName("src", patterns)).toBe(false);
  });

  it("匹配通配符与精确路径", () => {
    const patterns = ["**/vendor/**", "legacy/old.cpp"];
    expect(isIgnoredPath("thirdparty/vendor/lib.cpp", patterns)).toBe(true);
    expect(isIgnoredPath("legacy/old.cpp", patterns)).toBe(true);
    expect(isIgnoredPath("legacy/new.cpp", patterns)).toBe(false);
  });
});
