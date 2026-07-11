import { describe, expect, it } from "vitest";
import { ktcBuildRenameResultViewModel } from "./renameResultViewModel.js";
import type { WorkspaceRenameReport } from "./workspaceRename.js";

function report(): WorkspaceRenameReport {
  return {
    root: "/workspace",
    applied: false,
    summary: { rules: 1, matchedRules: 1, directories: 1, files: 0, textFiles: 1, replacements: 7, skipped: 0, errors: 0 },
    hits: [
      {
        id: "dir:src/OldFolder",
        relativePath: "src/OldFolder",
        fullPath: "/workspace/src/OldFolder",
        originalFullPath: "/workspace/src/OldFolder",
        plannedFullPath: "/workspace/src/NewFolder",
        newPath: "src/NewFolder",
        level: "dir",
        occurrences: 1,
        status: "preview",
      },
      {
        id: "text:src/file.cpp",
        relativePath: "src/file.cpp",
        fullPath: "/workspace/src/file.cpp",
        originalFullPath: "/workspace/src/file.cpp",
        plannedFullPath: "/workspace/src/file.cpp",
        level: "text",
        occurrences: 6,
        lines: [2, 4, 6, 8, 10, 12],
        detectedEncoding: "utf8-bom",
        status: "preview",
      },
    ],
  };
}

describe("renameResultViewModel", () => {
  it("文件夹结果分开显示源名称、目标名称和源地址", () => {
    const row = ktcBuildRenameResultViewModel(report()).rows[0];
    expect(row).toMatchObject({
      sourceName: "OldFolder",
      targetOrPositionLabel: "NewFolder",
      sourceAddress: "src",
      originalFullPath: "/workspace/src/OldFolder",
      plannedFullPath: "/workspace/src/NewFolder",
      openPath: "/workspace/src/OldFolder",
    });
  });

  it("文本结果压缩行号并保留编码", () => {
    const row = ktcBuildRenameResultViewModel(report()).rows[1];
    expect(row).toMatchObject({
      sourceName: "file.cpp",
      sourceAddress: "src",
      targetOrPositionLabel: "L2, L4, L6, L8，……等 6 处",
      encodingLabel: "utf8-bom",
      statusLabel: "预览",
    });
  });

  it("写盘后打开计划路径", () => {
    const applied = report();
    applied.applied = true;
    applied.hits[0]!.status = "applied";
    expect(ktcBuildRenameResultViewModel(applied).rows[0]?.openPath).toBe("/workspace/src/NewFolder");
  });

  it("写盘后使用 Model 提供的最终嵌套目录路径", () => {
    const applied = report();
    applied.applied = true;
    applied.hits[0]!.status = "applied";
    applied.hits[0]!.plannedFullPath = "/workspace/NewParent/NewFolder";
    expect(ktcBuildRenameResultViewModel(applied).rows[0]).toMatchObject({
      plannedFullPath: "/workspace/NewParent/NewFolder",
      openPath: "/workspace/NewParent/NewFolder",
    });
  });
});
