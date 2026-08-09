import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./dotIgnore.ts", import.meta.url), "utf8");

describe("Auto Ignore shared-core boundary", () => {
  it("keeps file/cache ownership locally and delegates pure rule semantics to Wing", () => {
    expect(source).toContain('from "@phoenix-wing/code-core"');
    expect(source).toContain("return pnwCodeParseIgnoreText(text)");
    expect(source).toContain("return pnwCodeIsIgnoredPath(relativePath, patterns)");
    expect(source).toContain("return pnwCodeShouldSkipDirName(dirName, patterns)");
    expect(source).toContain("const ignorePatternCache = new Map");
    expect(source).not.toContain("function globToRegExp(");
  });
});
