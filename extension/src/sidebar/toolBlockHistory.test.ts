import { describe, expect, it } from "vitest";
import { ktcActivateToolBlock, ktcCloseToolBlock } from "./toolBlockHistory.js";

describe("tool Block MRU history", () => {
  it("打开已有 Block 时移到最近使用位置且不重复", () => {
    expect(ktcActivateToolBlock(["headerAscii", "encodingFix", "codeRename"], "encodingFix"))
      .toEqual(["headerAscii", "codeRename", "encodingFix"]);
  });

  it("关闭当前 Block 后恢复最近使用的剩余 Block", () => {
    expect(ktcCloseToolBlock(["headerAscii", "codeRename", "encodingFix"], "encodingFix"))
      .toEqual({ openToolIds: ["headerAscii", "codeRename"], nextToolId: "codeRename" });
  });

  it("关闭最后一个 Block 后不再选择替代项", () => {
    expect(ktcCloseToolBlock(["headerAscii"], "headerAscii"))
      .toEqual({ openToolIds: [], nextToolId: undefined });
  });

  it("不同模块工具共用多打开与 MRU 顺序", () => {
    const codeOpen = ktcActivateToolBlock([], "codeRename");
    const cadFilenameOpen = ktcActivateToolBlock(codeOpen, "cadFilename");
    const cadScanOpen = ktcActivateToolBlock(cadFilenameOpen, "cadScan");
    expect(cadScanOpen).toEqual(["codeRename", "cadFilename", "cadScan"]);
    expect(ktcCloseToolBlock(cadScanOpen, "cadScan")).toEqual({
      openToolIds: ["codeRename", "cadFilename"],
      nextToolId: "cadFilename",
    });
  });
});
