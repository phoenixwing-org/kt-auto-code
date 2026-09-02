import { describe, expect, it } from "vitest";
import { ktcParseProjectRenameViewMessage } from "./viewMessages.js";

describe("project rename Webview messages", () => {
  it("接受经过完整校验的分析请求", () => {
    expect(ktcParseProjectRenameViewMessage({
      type: "analyze",
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      sourcePrefix: "PDH",
      targetPrefix: "PH",
      rules: [{ id: "custom-prefix", style: "custom", search: "Pdh", replace: "Pnh", enabled: true }],
    })).toMatchObject({ type: "analyze", rules: [{ search: "Pdh", replace: "Pnh" }] });
  });

  it("拒绝伪造样式、超长值和非法分页", () => {
    expect(ktcParseProjectRenameViewMessage({
      type: "analyze",
      sourceName: "old",
      targetName: "new",
      sourcePrefix: "",
      targetPrefix: "",
      rules: [{ id: "x", style: "execute", search: "old", replace: "new", enabled: true }],
    })).toBeUndefined();
    expect(ktcParseProjectRenameViewMessage({ type: "derive", sourceName: "x".repeat(257), targetName: "y", sourcePrefix: "", targetPrefix: "" }))
      .toBeUndefined();
    expect(ktcParseProjectRenameViewMessage({ type: "loadMore", reportId: 1, offset: -1 })).toBeUndefined();
  });

  it("仅允许有限的报告行标识用于打开定位", () => {
    expect(ktcParseProjectRenameViewMessage({ type: "renameRoot", reportId: 2 }))
      .toEqual({ type: "renameRoot", reportId: 2 });
    expect(ktcParseProjectRenameViewMessage({ type: "renameRoot", reportId: 0 })).toBeUndefined();
    expect(ktcParseProjectRenameViewMessage({ type: "apply", reportId: 2 }))
      .toEqual({ type: "apply", reportId: 2 });
    expect(ktcParseProjectRenameViewMessage({ type: "apply", reportId: "2" })).toBeUndefined();
    expect(ktcParseProjectRenameViewMessage({ type: "previewFirstDiff", reportId: 2 }))
      .toEqual({ type: "previewFirstDiff", reportId: 2 });
    expect(ktcParseProjectRenameViewMessage({ type: "previewDiff", reportId: 2, rowId: "text:src/index.ts" }))
      .toEqual({ type: "previewDiff", reportId: 2, rowId: "text:src/index.ts" });
    expect(ktcParseProjectRenameViewMessage({ type: "finish" })).toEqual({ type: "finish" });
    expect(ktcParseProjectRenameViewMessage({ type: "loadProjectHistory", id: "history-1" }))
      .toEqual({ type: "loadProjectHistory", id: "history-1" });
    expect(ktcParseProjectRenameViewMessage({
      type: "deleteHistory",
      entry: { kind: "pair", source: "Phoenix Hub", target: "Phoenix Desk" },
    })).toEqual({
      type: "deleteHistory",
      entry: { kind: "pair", source: "Phoenix Hub", target: "Phoenix Desk" },
    });
    expect(ktcParseProjectRenameViewMessage({ type: "clearHistory" })).toEqual({ type: "clearHistory" });
    expect(ktcParseProjectRenameViewMessage({ type: "openGitChanges" })).toEqual({ type: "openGitChanges" });
    expect(ktcParseProjectRenameViewMessage({ type: "open", reportId: 2, rowId: "text:src/index.ts" }))
      .toEqual({ type: "open", reportId: 2, rowId: "text:src/index.ts" });
    expect(ktcParseProjectRenameViewMessage({ type: "open", reportId: 2, rowId: "bad\nrow" }))
      .toBeUndefined();
  });
});
