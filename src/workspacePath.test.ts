import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { ktcIsPathInsideWorkspace } from "./workspacePath.js";

describe("workspacePath", () => {
  const root = resolve("/workspace/project");

  it.each([
    root,
    join(root, "src"),
    join(root, "src", "file.cpp"),
    join(root, "src", "..", "README.md"),
  ])("接受工作区根目录及其子路径：%s", (target) => {
    expect(ktcIsPathInsideWorkspace(root, target)).toBe(true);
  });

  it.each([
    resolve("/workspace"),
    resolve("/workspace/project-other"),
    resolve("/outside/file.cpp"),
    join(root, "..", "sibling", "file.cpp"),
  ])("拒绝父目录、同前缀兄弟目录和外部路径：%s", (target) => {
    expect(ktcIsPathInsideWorkspace(root, target)).toBe(false);
  });
});
