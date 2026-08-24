import { describe, expect, it } from "vitest";
import { KtcSameGitOidSelection } from "./KtcGitSelection.js";

describe("Git selection", () => {
  it("treats graph order and trusted preflight order as the same selection", () => {
    const newestFirst = ["a".repeat(40), "b".repeat(40), "c".repeat(40)];
    expect(KtcSameGitOidSelection(newestFirst, [...newestFirst].reverse())).toBe(true);
  });

  it("rejects changed, missing, or duplicate selections", () => {
    const first = "a".repeat(40);
    const second = "b".repeat(40);
    expect(KtcSameGitOidSelection([first, second], [first])).toBe(false);
    expect(KtcSameGitOidSelection([first, second], [first, "c".repeat(40)])).toBe(false);
    expect(KtcSameGitOidSelection([first, first], [first, first])).toBe(false);
  });
});
