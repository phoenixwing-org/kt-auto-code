import { describe, expect, it } from "vitest";
import { ktcCancelReorderRows, ktcPendingReorderUris, ktcReorderResultSummaries, type KtcReorderStateRow } from "./state.js";

function row(uri: string, state: KtcReorderStateRow["state"]): KtcReorderStateRow {
  return {
    uri,
    relativePath: `src/${uri}.cpp`,
    kind: "source",
    encoding: "UTF-8",
    changed: state !== "unchanged",
    state,
    warnings: [],
  };
}

describe("member reorder single-block state", () => {
  it("only applies requested rows that are still pending", () => {
    const rows = [row("pending", "pending"), row("applied", "applied"), row("other", "pending")];
    expect(ktcPendingReorderUris(rows, ["pending", "applied", "missing"])).toEqual(["pending"]);
  });

  it("cancels pending rows without dropping cached result rows", () => {
    const rows = [row("one", "pending"), row("two", "applied")];
    expect(ktcCancelReorderRows(rows, ["one", "two"])).toBe(1);
    expect(rows.map((item) => item.state)).toEqual(["cancelled", "applied"]);
  });

  it("merges runtime diagnostics into serialized Webview results", () => {
    const rows = [row("one", "blocked")];
    expect(ktcReorderResultSummaries(rows, new Map([["one", "file changed after scan"]]))[0]?.warnings)
      .toEqual(["file changed after scan"]);
  });
});
