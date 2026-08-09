import { describe, expect, it } from "vitest";
import { ktcIsSearchReplacePanelMessage } from "./searchReplaceContracts.js";

describe("searchReplaceContracts", () => {
  it.each([
    { type: "ready" },
    { type: "loadMore", reportId: 2, offset: 300 },
    { type: "openPath", path: "/workspace/src", level: "dir" },
    { type: "openPath", path: "/workspace/a.cpp", level: "text", line: 12 },
  ])("接受有效结果 View 消息：%j", (message) => {
    expect(ktcIsSearchReplacePanelMessage(message)).toBe(true);
  });

  it.each([
    undefined,
    { type: "loadMore", reportId: -1, offset: 0 },
    { type: "loadMore", reportId: 1, offset: Number.NaN },
    { type: "openPath", path: "", level: "file" },
    { type: "openPath", path: "/workspace/a.cpp", level: "binary" },
    { type: "openPath", path: "/workspace/a.cpp", level: "text", line: 0 },
  ])("拒绝非法结果 View 消息：%j", (message) => {
    expect(ktcIsSearchReplacePanelMessage(message)).toBe(false);
  });
});
