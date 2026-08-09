import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./replacementRules.ts", import.meta.url), "utf8");

describe("replacement rules shared core boundary", () => {
  it("delegates rule resolution, string replacement and name suggestions to Wing", () => {
    expect(source).toContain('from "@phoenix-wing/code-core"');
    expect(source).toContain("pnwCodeResolveReplacementRules(rules, preserveCase)");
    expect(source).toContain("pnwCodeReplaceStringByRules(input, rules)");
    expect(source).toContain("pnwCodeSuggestNameReplacement(currentName, rules, preserveCase)");
    expect(source).not.toContain("function winningStringRule");
    expect(source).not.toContain("const bySearch = new Map<string, ResolvedReplacementRule>()");
  });
});
