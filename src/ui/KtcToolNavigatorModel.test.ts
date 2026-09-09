import { describe, expect, it } from "vitest";
import { KTC_CODE_ASSISTANT_NAVIGATION } from "../tools/codeAssistant/navigation.js";
import {
  ktcToolNavigatorToolCount,
  ktcValidateToolNavigatorNodes,
} from "./KtcToolNavigatorModel.js";

describe("Tool Navigator model", () => {
  it("用 group | tool 非此即彼的树描述代码辅助，并统计全部叶子", () => {
    const result = ktcValidateToolNavigatorNodes(KTC_CODE_ASSISTANT_NAVIGATION);
    expect(result).toEqual({ valid: true, issues: [], toolCount: 7 });
    expect(ktcToolNavigatorToolCount(KTC_CODE_ASSISTANT_NAVIGATION)).toBe(7);
    expect(KTC_CODE_ASSISTANT_NAVIGATION.map((node) => node.kind)).toEqual(["group", "group", "group"]);
  });

  it("拒绝空分组、空引用和跨层级重复身份", () => {
    const nodes: readonly unknown[] = [
      { kind: "group", id: "empty", label: "空分组", toolId: "forbidden", children: [] },
      { kind: "tool", id: "same", toolId: "", label: "缺少引用" },
      { kind: "tool", id: "same", toolId: "headerAscii", label: "重复节点" },
      { kind: "tool", id: "other", toolId: "headerAscii", label: "重复工具", children: [] },
      { kind: "action", id: "action", label: "动作不入树" },
    ];
    const result = ktcValidateToolNavigatorNodes(nodes);
    expect(result.valid).toBe(false);
    expect(result.toolCount).toBe(3);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("group has no children"),
      expect.stringContaining("group cannot reference toolId"),
      expect.stringContaining("toolId is empty"),
      expect.stringContaining("duplicate node id"),
      expect.stringContaining("duplicate toolId headerAscii"),
      expect.stringContaining("tool cannot have children"),
      expect.stringContaining("kind must be group or tool"),
    ]));
  });
});
