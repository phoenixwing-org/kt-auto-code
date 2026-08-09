import { describe, expect, it } from "vitest";
import { KtcCompactManagerLabelStyle } from "./KtcCompactManagerLabel.js";

describe("compact manager label rule", () => {
  it("只允许连续标签容器在整行末尾省略", () => {
    expect(KtcCompactManagerLabelStyle).toContain(".ktc-compact-label { display: block;");
    expect(KtcCompactManagerLabelStyle).toContain("overflow: hidden; text-overflow: ellipsis; white-space: nowrap;");
    expect(KtcCompactManagerLabelStyle.match(/text-overflow:\s*ellipsis/gu)).toHaveLength(1);
    expect(KtcCompactManagerLabelStyle).not.toMatch(/ktc-compact-label-primary[^}]*overflow/gu);
    expect(KtcCompactManagerLabelStyle).not.toMatch(/ktc-compact-label-secondary[^}]*overflow/gu);
  });
});
