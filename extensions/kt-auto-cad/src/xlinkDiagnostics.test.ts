import { describe, expect, it } from "vitest";
import { diagnoseCadXlinks } from "./xlinkDiagnostics.js";

describe("KT Auto CAD XLink diagnostics", () => {
  it("resolves a direct relative XLink with the shared Wing rule", () => {
    const result = diagnoseCadXlinks(
      "assy/root.FCStd",
      [{ file: "../parts/bolt.FCStd", label: "Bolt" }],
      ["assy/root.FCStd", "parts/bolt.FCStd"],
    );
    expect(result.items[0]).toEqual({
      file: "../parts/bolt.FCStd",
      label: "Bolt",
      status: "resolved",
      targetRelativePath: "parts/bolt.FCStd",
      candidates: [],
      message: "已解析到 parts/bolt.FCStd",
    });
    expect(result.counts.resolved).toBe(1);
  });

  it("reports ambiguous, missing, self and non-FCStd references without writing", () => {
    const result = diagnoseCadXlinks(
      "assy/root.FCStd",
      [
        { file: "bolt.FCStd", label: null },
        { file: "missing.FCStd", label: null },
        { file: "root.FCStd", label: null },
        { file: "readme.md", label: null },
      ],
      ["assy/root.FCStd", "left/bolt.FCStd", "right/bolt.FCStd"],
    );
    expect(result.items.map((item) => item.status)).toEqual([
      "ambiguous",
      "missing",
      "self",
      "non_fcstd",
    ]);
    expect(result.items[0]?.candidates).toEqual(["left/bolt.FCStd", "right/bolt.FCStd"]);
    expect(result.items[0]?.label).toBe("bolt");
    expect(result.counts).toEqual({ resolved: 0, ambiguous: 1, missing: 1, self: 1, non_fcstd: 1 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.items)).toBe(true);
  });

  it("normalizes Windows separators and rejects an unsafe host path", () => {
    expect(diagnoseCadXlinks(
      "assy\\root.FCStd",
      [{ file: "..\\parts\\bolt.FCStd", label: null }],
      ["parts\\bolt.FCStd"],
    ).items[0]).toMatchObject({ status: "resolved", targetRelativePath: "parts/bolt.FCStd" });
    expect(() => diagnoseCadXlinks("../outside.FCStd", [], [])).toThrow(/safe workspace relative path/);
  });
});
