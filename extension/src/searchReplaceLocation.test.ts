import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runWorkspaceRename } from "../../src/workspaceRename.js";
import {
  ktcClassifyWorkingDirectory,
  ktcResolveSearchReplaceLocation,
} from "./searchReplaceLocation.js";

describe("searchReplaceLocation", () => {
  const workspace = resolve("workspace-root");
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("空工作目录使用当前工作区根目录", () => {
    expect(ktcResolveSearchReplaceLocation(workspace, "")).toEqual({
      root: workspace,
      usesCurrentWorkspace: true,
    });
    expect(ktcResolveSearchReplaceLocation(workspace, ".")).toEqual({
      root: workspace,
      usesCurrentWorkspace: true,
    });
  });

  it("相对目录和工作区内绝对目录仍作为 scope", () => {
    expect(ktcResolveSearchReplaceLocation(workspace, "src/module")).toEqual({
      root: workspace,
      scope: "src/module",
      usesCurrentWorkspace: true,
    });
    const inside = join(workspace, "src", "module");
    expect(ktcResolveSearchReplaceLocation(workspace, inside)).toEqual({
      root: workspace,
      scope: inside,
      usesCurrentWorkspace: true,
    });
  });

  it("工作区外绝对目录成为独立扫描根", () => {
    const outside = join(dirname(workspace), "another-project");
    expect(ktcResolveSearchReplaceLocation(workspace, outside)).toEqual({
      root: outside,
      usesCurrentWorkspace: false,
    });
  });

  it("没有工作区时只接受绝对目录", () => {
    expect(() => ktcResolveSearchReplaceLocation(undefined, "")).toThrow("请先打开工作区");
    expect(() => ktcResolveSearchReplaceLocation(undefined, "relative")).toThrow("相对工作目录");
    const absolute = resolve("standalone-project");
    expect(ktcResolveSearchReplaceLocation(undefined, absolute)).toEqual({
      root: absolute,
      usesCurrentWorkspace: false,
    });
  });

  it("把内部目录分类为工作区相对缓存，把外部目录分类为全局缓存", () => {
    const inside = join(workspace, "src", "module");
    expect(ktcClassifyWorkingDirectory(workspace, inside)).toEqual({
      directory: inside,
      inputValue: "src/module",
      storage: "workspace",
      cacheValue: "src/module",
    });
    const outside = join(dirname(workspace), "another-project");
    expect(ktcClassifyWorkingDirectory(workspace, outside)).toEqual({
      directory: outside,
      inputValue: outside,
      storage: "global",
      cacheValue: outside,
    });
    expect(ktcClassifyWorkingDirectory(workspace, workspace)).toEqual({
      directory: workspace,
      inputValue: "",
    });
    expect(ktcClassifyWorkingDirectory(workspace, "../outside")).toBeUndefined();
  });

  it("没有工作区时可在外部扫描根完成文件名和文本替换", () => {
    const external = mkdtempSync(join(tmpdir(), "kt-external-root-"));
    temporaryDirectories.push(external);
    writeFileSync(join(external, "OldFile.txt"), "OldValue\n");
    const location = ktcResolveSearchReplaceLocation(undefined, external);

    const report = runWorkspaceRename({
      root: location.root,
      scope: location.scope,
      oldName: "Old",
      newName: "New",
      levels: ["file", "text"],
      apply: true,
    });

    expect(report.summary).toMatchObject({ files: 1, textFiles: 1, errors: 0 });
    expect(readFileSync(join(external, "NewFile.txt"), "utf8")).toBe("NewValue\n");
  });
});
