import { describe, expect, it } from "vitest";
import {
  describePrimaryVisibilityAction,
  findLatestMruItem,
  removeMruItem,
  resolvePreviewHostVisibility,
  touchMruItem,
} from "../../ui-preview/src/previewState.js";

describe("Primary UI preview state", () => {
  it("Right View 始终存在，只切换 Primary 与分隔条", () => {
    expect(resolvePreviewHostVisibility(true)).toEqual({ primary: true, editor: true, splitter: true });
    expect(resolvePreviewHostVisibility(false)).toEqual({ primary: false, editor: true, splitter: false });
  });

  it("记录 Primary 切换后的实际动作，不受按钮下一状态标签影响", () => {
    expect(describePrimaryVisibilityAction(false)).toBe("隐藏 Primary");
    expect(describePrimaryVisibilityAction(true)).toBe("显示 Primary");
  });

  it("重复激活只更新 MRU，不产生重复项", () => {
    let mru = ["A", "B", "C"];
    mru = touchMruItem(mru, "A");
    mru = touchMruItem(mru, "B");
    expect(mru).toEqual(["C", "A", "B"]);
    expect(new Set(mru).size).toBe(mru.length);
  });

  it("关闭当前项后恢复真正的最近项，并可按宿主类型筛选", () => {
    const items = [
      { id: "tool:A", kind: "right" },
      { id: "tool:B", kind: "primary" },
      { id: "tool:C", kind: "right" },
    ] as const;
    const afterClose = removeMruItem(["tool:C", "tool:B", "tool:A"], "tool:A");
    expect(findLatestMruItem(items, afterClose)?.id).toBe("tool:B");
    expect(findLatestMruItem(items, afterClose, (item) => item.kind === "right")?.id).toBe("tool:C");
  });
});
