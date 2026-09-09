import { beforeEach, describe, expect, it, vi } from "vitest";

const wing = vi.hoisted(() => {
  class Combo {
    model = {};
  }
  return {
    Combo,
    define: vi.fn(),
    normalize: vi.fn((value) => Object.freeze({ source: "wing", ...(value ?? {}) })),
  };
});

vi.mock("@phoenix-wing/code-core/ui", () => ({
  PnwCombo: wing.Combo,
  pnwCodeDefineCombo: wing.define,
  pnwNormalizeComboModel: wing.normalize,
}));

beforeEach(() => vi.clearAllMocks());

describe("PnwCombo Wing compatibility adapter", () => {
  it("把规范化和标签注册统一委托给 Wing", async () => {
    const combo = await import("./PnwComboWingAdapter.js");
    const input = {
      ariaLabel: "选择方案",
      placeholder: "请选择…",
      emptyText: "暂无方案",
      items: [],
      disabled: false,
      clearEnabled: false,
      clearLabel: "全部清空",
    };

    expect(combo.normalizePnwComboModel(null)).toMatchObject({ source: "wing" });
    expect(combo.normalizePnwComboModel(input)).toMatchObject({ source: "wing", ariaLabel: "选择方案" });
    expect(wing.normalize).toHaveBeenNthCalledWith(1, undefined);
    expect(wing.normalize).toHaveBeenNthCalledWith(2, input);
    expect(combo.pnwDefineCombo("pnw-combo-test")).toBe(wing.Combo);
    expect(wing.define).toHaveBeenCalledWith("pnw-combo-test");
    expect(combo.PnwCombo).toBe(wing.Combo);
  });
});
