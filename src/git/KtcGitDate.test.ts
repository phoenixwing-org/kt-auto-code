import { describe, expect, it } from "vitest";
import { KtcFormatGitDate, KtcNormalizeGitDateInput } from "./KtcGitDate.js";

describe("Git editable date", () => {
  it("round-trips the Git instant through the current machine timezone", () => {
    const canonical = "1784357700 +0800";
    const editable = KtcFormatGitDate(canonical);
    expect(editable).not.toMatch(/[+-]\d{2}:?\d{2}$/u);
    expect(KtcNormalizeGitDateInput(editable).split(" ")[0]).toBe("1784357700");
  });

  it("accepts minute precision and rejects impossible dates", () => {
    expect(KtcFormatGitDate(KtcNormalizeGitDateInput("2026-07-18 14:55"))).toBe("2026-07-18 14:55:00");
    expect(() => KtcNormalizeGitDateInput("2026-02-30 14:55:00")).toThrow("时间值无效");
  });
});
