import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./renameResultViewModel.ts", import.meta.url), "utf8");

describe("Auto search/replace shared result boundary", () => {
  it("maps the Host report into Wing and keeps only compatibility fields locally", () => {
    expect(source).toContain('from "@phoenix-wing/code-core/ui/model"');
    expect(source).toContain("pnwCodeProjectRenameResults({");
    expect(source).toContain("pnwCodePageRenameResultRows(");
    expect(source).not.toContain("function pathParts(");
    expect(source).not.toContain("function lineSummary(");
  });
});
