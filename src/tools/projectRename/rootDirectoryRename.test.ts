import { describe, expect, it } from "vitest";
import { ktcPlanProjectRenameRootDirectory } from "./rootDirectoryRename.js";

describe("project rename root directory plan", () => {
  it("允许改名工作区之外的仓库根目录", () => {
    expect(ktcPlanProjectRenameRootDirectory(
      "/repos/phoenix-open-issue",
      "phoenix-issue",
      ["/workspace/kt-auto-code"],
    )).toEqual({
      allowed: true,
      sourcePath: "/repos/phoenix-open-issue",
      destinationPath: "/repos/phoenix-issue",
      reason: "将只重命名仓库根目录；不会修改目录内部内容。",
    });
  });

  it("拒绝改名当前工作区根目录或包含工作区的父目录", () => {
    expect(ktcPlanProjectRenameRootDirectory(
      "/workspace/phoenix-open-issue",
      "phoenix-issue",
      ["/workspace/phoenix-open-issue"],
    ).allowed).toBe(false);
    expect(ktcPlanProjectRenameRootDirectory(
      "/workspace",
      "renamed-workspace-parent",
      ["/workspace/phoenix-open-issue"],
    ).allowed).toBe(false);
  });

  it("允许改名工作区中的普通子目录", () => {
    expect(ktcPlanProjectRenameRootDirectory(
      "/workspace/packages/phoenix-open-issue",
      "phoenix-issue",
      ["/workspace"],
    ).allowed).toBe(true);
  });

  it("拒绝路径穿越和无变化名称", () => {
    expect(ktcPlanProjectRenameRootDirectory("/repos/old", "../new", []).allowed).toBe(false);
    expect(ktcPlanProjectRenameRootDirectory("/repos/old", "old", []).allowed).toBe(false);
  });
});
