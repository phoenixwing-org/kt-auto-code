import { describe, expect, it } from "vitest";
import { ktcParseProjectRenameViewMessage } from "./viewMessages.js";

describe("project rename Webview messages", () => {
  it("接受经过完整校验的分析请求", () => {
    expect(ktcParseProjectRenameViewMessage({
      type: "analyze",
      sourceName: "Phoenix Dev Hub",
      targetName: "Phoenix Hub",
      rules: [{ id: "custom-prefix", style: "custom", search: "Pdh", replace: "Pnh", enabled: true }],
    })).toMatchObject({ type: "analyze", rules: [{ search: "Pdh", replace: "Pnh" }] });
  });

  it("拒绝伪造样式、超长值和非法分页", () => {
    expect(ktcParseProjectRenameViewMessage({
      type: "analyze",
      sourceName: "old",
      targetName: "new",
      rules: [{ id: "x", style: "execute", search: "old", replace: "new", enabled: true }],
    })).toBeUndefined();
    expect(ktcParseProjectRenameViewMessage({ type: "derive", sourceName: "x".repeat(257), targetName: "y" }))
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
    expect(ktcParseProjectRenameViewMessage({ type: "finish" })).toEqual({ type: "finish" });
    expect(ktcParseProjectRenameViewMessage({ type: "open", reportId: 2, rowId: "text:src/index.ts" }))
      .toEqual({ type: "open", reportId: 2, rowId: "text:src/index.ts" });
    expect(ktcParseProjectRenameViewMessage({ type: "open", reportId: 2, rowId: "bad\nrow" }))
      .toBeUndefined();
  });
});
