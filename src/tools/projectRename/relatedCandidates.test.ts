import { describe, expect, it } from "vitest";
import {
  ktcCountUncoveredProjectRenameCandidates,
  ktcDeriveProjectRenameRelatedCandidateDrafts,
  ktcFinalizeProjectRenameRelatedCandidates,
} from "./relatedCandidates.js";

describe("project rename related candidates", () => {
  it("派生短写法和额外大小写，但不把完整名称内的子串计为候选", () => {
    const drafts = ktcDeriveProjectRenameRelatedCandidateDrafts("Phoenix Open Issue", "Phoenix Issue");
    expect(drafts).toEqual(expect.arrayContaining([
      expect.objectContaining({ search: "open-issue", replace: "issue" }),
      expect.objectContaining({ search: "OpenIssue", replace: "Issue" }),
      expect.objectContaining({ search: "phoenix open issue", replace: "phoenix issue" }),
    ]));
    const counts = ktcCountUncoveredProjectRenameCandidates(
      "phoenix-open-issue /open-issue OpenIssueEntity phoenix open issue",
      drafts,
    );
    const bySearch = new Map(drafts.map((draft) => [draft.search, counts[draft.id] ?? 0]));
    expect(bySearch.get("open-issue")).toBe(1);
    expect(bySearch.get("OpenIssue")).toBe(1);
    expect(bySearch.get("phoenix open issue")).toBe(1);
  });

  it("只输出真实命中的候选并按次数排序", () => {
    const drafts = ktcDeriveProjectRenameRelatedCandidateDrafts("Phoenix Open Issue", "Phoenix Issue");
    const openIssue = drafts.find((draft) => draft.search === "open-issue")!;
    const pascal = drafts.find((draft) => draft.search === "OpenIssue")!;
    const result = ktcFinalizeProjectRenameRelatedCandidates(
      drafts,
      new Map([[openIssue.id, 2], [pascal.id, 5]]),
      new Map([[openIssue.id, 1], [pascal.id, 3]]),
    );
    expect(result).toEqual([
      expect.objectContaining({ search: "OpenIssue", occurrences: 5, matchedItems: 3 }),
      expect.objectContaining({ search: "open-issue", occurrences: 2, matchedItems: 1 }),
    ]);
  });
});
