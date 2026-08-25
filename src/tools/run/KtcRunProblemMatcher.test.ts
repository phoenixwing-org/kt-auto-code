import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface ProblemPattern {
  readonly name: string;
  readonly regexp: string;
}

interface ProblemMatcher {
  readonly name: string;
  readonly severity?: string;
  readonly pattern: string;
}

const manifest = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
  contributes: {
    problemPatterns: readonly ProblemPattern[];
    problemMatchers: readonly ProblemMatcher[];
  };
};

describe("Run CAA Problems matcher", () => {
  it("小写 error 保持错误，大写 ERROR/WARNING 作为 warning 补充捕获", () => {
    const lower = manifest.contributes.problemPatterns.find((item) => item.name === "pnwCaaMsCompile")!;
    const upper = manifest.contributes.problemPatterns.find((item) => item.name === "pnwCaaUpperDiagnostic")!;
    const lowerPattern = new RegExp(lower.regexp);
    const upperPattern = new RegExp(upper.regexp);
    expect(lowerPattern.test("Demo.cpp(12,3): error C2065: missing symbol")).toBe(true);
    expect(lowerPattern.test("Demo.cpp(12,3): ERROR C2065: vendor diagnostic")).toBe(false);
    expect(upperPattern.test("Demo.cpp(12,3): ERROR C2065: vendor diagnostic")).toBe(true);
    expect(upperPattern.test("Demo.cpp(12): WARNING C4996: vendor diagnostic")).toBe(true);
    expect(upperPattern.test("ERROR: no file location")).toBe(false);
    expect(manifest.contributes.problemMatchers.find((item) => item.name === "pnwCaaUpperDiagnostic"))
      .toMatchObject({ severity: "warning", pattern: "$pnwCaaUpperDiagnostic" });
  });
});
