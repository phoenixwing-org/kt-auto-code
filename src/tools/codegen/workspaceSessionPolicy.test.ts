import { describe, expect, it } from "vitest";
import {
  ktcCanReleaseClosedCodegenSession,
  ktcShouldRetainCodegenSessionInList,
  ktcSortCodegenDocumentList,
} from "./workspaceSessionPolicy.js";

const removed = {
  documentPath: "/removed-root/PartParam.json",
  open: false,
  dirty: false,
  externalConflict: false,
};

describe("Codegen workspace session list policy", () => {
  it("JSON 列表按路径稳定排序，不因 active/open 状态跳位", () => {
    const first = { uri: "file:///workspace/a.json", displayPath: "a.json", active: false, open: false };
    const second = { uri: "file:///workspace/b.json", displayPath: "b.json", active: true, open: true };
    const input = [second, first];

    expect(ktcSortCodegenDocumentList(input)).toEqual([first, second]);
    expect(input).toEqual([second, first]);
    expect(ktcSortCodegenDocumentList([
      { ...first, active: true, open: true },
      { ...second, active: false, open: false },
    ]).map((entry) => entry.uri)).toEqual([first.uri, second.uri]);
  });

  it("移除根后不再显示已关闭且干净的旧会话", () => {
    expect(ktcShouldRetainCodegenSessionInList(removed, ["/current-root"])).toBe(false);
  });

  it("保留仍在当前根中或正在打开的会话", () => {
    expect(ktcShouldRetainCodegenSessionInList(
      { ...removed, documentPath: "/current-root/PartParam.json" },
      ["/current-root"],
    )).toBe(true);
    expect(ktcShouldRetainCodegenSessionInList({ ...removed, open: true }, ["/current-root"]))
      .toBe(true);
  });

  it("工作区外的 dirty/冲突草稿仍保留，避免数据不可见", () => {
    expect(ktcShouldRetainCodegenSessionInList({ ...removed, dirty: true }, [])).toBe(true);
    expect(ktcShouldRetainCodegenSessionInList({ ...removed, externalConflict: true }, []))
      .toBe(true);
  });

  it("只释放关闭、干净、current 且没有运行 owner 的 session", () => {
    const releasable = {
      open: false,
      dirty: false,
      externalState: "current" as const,
      operationCount: 0,
      preflightRunning: false,
      batchRunning: false,
    };
    expect(ktcCanReleaseClosedCodegenSession(releasable)).toBe(true);
    expect(ktcCanReleaseClosedCodegenSession({ ...releasable, open: true })).toBe(false);
    expect(ktcCanReleaseClosedCodegenSession({ ...releasable, dirty: true })).toBe(false);
    expect(ktcCanReleaseClosedCodegenSession({ ...releasable, externalState: "changed" })).toBe(false);
    expect(ktcCanReleaseClosedCodegenSession({ ...releasable, externalState: "deleted" })).toBe(false);
    expect(ktcCanReleaseClosedCodegenSession({ ...releasable, operationCount: 1 })).toBe(false);
    expect(ktcCanReleaseClosedCodegenSession({ ...releasable, preflightRunning: true })).toBe(false);
    expect(ktcCanReleaseClosedCodegenSession({ ...releasable, batchRunning: true })).toBe(false);
  });
});
