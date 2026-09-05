import { afterEach, describe, it, expect } from "vitest";
import {
  ensurePhoenixIgnore,
  invalidateDotIgnoreCache,
  isIgnoredPath,
  loadDotIgnore,
  parseDotIgnoreText,
  phoenixIgnoreFile,
  shouldSkipDirName,
  syncPhoenixIgnoreFromGit,
} from "./dotIgnore.js";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempDirectories: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "kt-phoenix-"));
  tempDirectories.push(root);
  return root;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("dotIgnore", () => {
  it("从 .phoenix/.ignore 加载规则", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "vendor/\n# comment\nlegacy.cpp\n");
    expect(phoenixIgnoreFile(root).replace(/\\/g, "/")).toContain("/.phoenix/.ignore");
    expect(loadDotIgnore(root)).toEqual(["vendor/", "legacy.cpp"]);
  });
  it("不存在时创建空的自定义 .phoenix/.ignore，不复制独立 Git 规则", () => {
    const root = tempRoot();
    writeFileSync(join(root, ".gitignore"), "node_modules/\ndist/\n");
    const info = ensurePhoenixIgnore(root);
    expect(info.syncedFromGit).toBe(false);
    expect(info.patternCount).toBe(0);
    expect(loadDotIgnore(root)).toEqual([]);
  });

  it("无 .gitignore 时创建空模板", () => {
    const root = tempRoot();
    const info = ensurePhoenixIgnore(root);
    expect(info.syncedFromGit).toBe(false);
    expect(info.exists).toBe(true);
    expect(loadDotIgnore(root)).toEqual([]);
  });

  it("已存在时不覆盖", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "custom/\n");
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    ensurePhoenixIgnore(root);
    expect(loadDotIgnore(root)).toEqual(["custom/"]);
  });

  it("手动同步覆盖为 .gitignore 内容", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".phoenix"));
    writeFileSync(join(root, ".phoenix", ".ignore"), "old/\n");
    writeFileSync(join(root, ".gitignore"), "new/\n");
    const info = syncPhoenixIgnoreFromGit(root);
    expect(info.syncedFromGit).toBe(true);
    expect(loadDotIgnore(root)).toEqual(["new/"]);
  });

  it("统一解析文档缓冲区与磁盘 Ignore 文本", () => {
    expect(parseDotIgnoreText("# comment\r\n build/ \r\n\r\nlegacy.cpp\n"))
      .toEqual(["build/", "legacy.cpp"]);
  });

  it("显式失效缓存后重新读取保存内容", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".phoenix"));
    const file = join(root, ".phoenix", ".ignore");
    writeFileSync(file, "old/\n");
    expect(loadDotIgnore(root)).toEqual(["old/"]);
    writeFileSync(file, "new/\n");
    invalidateDotIgnoreCache(root);
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

  it("匹配带通配符的目录规则", () => {
    const patterns = ["cmake-build-*/", "build_????/"];
    expect(isIgnoredPath("cmake-build-debug/CMakeCache.txt", patterns)).toBe(true);
    expect(shouldSkipDirName("cmake-build-release", patterns)).toBe(true);
    expect(isIgnoredPath("build_test/output.o", patterns)).toBe(true);
    expect(shouldSkipDirName("build_test", patterns)).toBe(true);
    expect(isIgnoredPath("cmake/source.cpp", patterns)).toBe(false);
  });
});
