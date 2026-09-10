import { describe, expect, it } from "vitest";
import {
  KtcAssessGitBranchRange,
  KtcCompactGitCommitMessage,
  KtcCreateGitRangeSelection,
  KtcLoadedGitFirstParentOids,
  KtcProjectGitRangeSelection,
  KtcSameGitOidSelection,
  KtcUpdateGitRangeSelection,
  KtcValidateGitSelectionOids,
} from "./KtcGitSelection.js";

describe("Git selection", () => {
  it("reconciles persisted OIDs against a freshly read graph without UI state", () => {
    const [head, middle, base, missing] = ["a", "b", "c", "d"].map((value) => value.repeat(40));
    const graph = [
      { oid: head!, parentOids: [middle!] },
      { oid: middle!, parentOids: [base!] },
      { oid: base!, parentOids: [] },
    ];
    expect(KtcProjectGitRangeSelection(graph, [head!, base!])).toMatchObject({
      missingOids: [],
      selection: { selectedOids: [head, middle, base], anchorOid: head, endpointOid: base },
    });
    expect(KtcProjectGitRangeSelection(graph, [head!, missing!])).toMatchObject({
      missingOids: [missing],
      selection: { selectedOids: [] },
    });
    expect(() => KtcValidateGitSelectionOids([head!, head!])).toThrow("重复");
  });

  it("compacts generated squash messages without blank separator rows", () => {
    expect(KtcCompactGitCommitMessage("标题一\n\n标题二\n\r\n- 说明\n")).toBe("标题一\n标题二\n- 说明");
  });

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

  it("selects a continuous first-parent interval and disables another branch", () => {
    const [head, middle, base, side] = ["a", "b", "c", "d"].map((value) => value.repeat(40));
    const commits = [
      { oid: head!, parentOids: [middle!, side!] },
      { oid: side!, parentOids: [base!] },
      { oid: middle!, parentOids: [base!] },
      { oid: base!, parentOids: [] },
    ];
    const anchored = KtcCreateGitRangeSelection(commits, [head!]);
    expect(anchored.selectableOids).toEqual([head, middle, base]);
    expect(KtcUpdateGitRangeSelection(commits, anchored, base!, true)).toMatchObject({
      anchorOid: head,
      endpointOid: base,
      selectedOids: [head, middle, base],
      selectableOids: [head, middle, base],
    });
    expect(KtcUpdateGitRangeSelection(commits, anchored, side!, true)).toEqual(anchored);
  });

  it("projects only the frozen current first-parent line as initially selectable", () => {
    const [head, middle, base, side] = ["a", "b", "c", "d"].map((value) => value.repeat(40));
    const commits = [
      { oid: head!, parentOids: [middle!, side!] },
      { oid: side!, parentOids: [base!], subject: "相同标题" },
      { oid: middle!, parentOids: [base!], subject: "相同标题" },
      { oid: base!, parentOids: [] },
    ];
    const firstParentOids = KtcLoadedGitFirstParentOids(commits, head!);
    expect(firstParentOids).toEqual([head, middle, base]);
    expect(KtcCreateGitRangeSelection(commits, [], firstParentOids)).toEqual({
      selectedOids: [],
      selectableOids: [head, middle, base],
    });
    expect(KtcProjectGitRangeSelection(commits, [side!], firstParentOids)).toMatchObject({
      missingOids: [],
      ineligibleOids: [side],
      selection: { selectedOids: [], selectableOids: [head, middle, base] },
    });
  });

  it("keeps a middle current-branch interval selectable with side nodes interleaved", () => {
    const [head, upper, middle, base, side] = ["a", "b", "c", "d", "e"].map((value) => value.repeat(40));
    const commits = [
      { oid: head!, parentOids: [upper!, side!] },
      { oid: side!, parentOids: [base!] },
      { oid: upper!, parentOids: [middle!] },
      { oid: middle!, parentOids: [base!] },
      { oid: base!, parentOids: [] },
    ];
    const firstParentOids = KtcLoadedGitFirstParentOids(commits, head!);
    expect(KtcCreateGitRangeSelection(commits, [upper!, base!], firstParentOids)).toMatchObject({
      anchorOid: upper,
      endpointOid: base,
      selectedOids: [upper, middle, base],
      selectableOids: [head, upper, middle, base],
    });
  });

  it("recomputes first-parent eligibility after a page adds the missing parent", () => {
    const [head, middle, base, side] = ["a", "b", "c", "d"].map((value) => value.repeat(40));
    const firstPage = [
      { oid: head!, parentOids: [middle!, side!] },
      { oid: side!, parentOids: [base!] },
    ];
    expect(KtcLoadedGitFirstParentOids(firstPage, head!)).toEqual([head]);
    const allPages = [...firstPage, { oid: middle!, parentOids: [base!] }, { oid: base!, parentOids: [] }];
    expect(KtcCreateGitRangeSelection(
      allPages,
      [],
      KtcLoadedGitFirstParentOids(allPages, head!),
    ).selectableOids).toEqual([head, middle, base]);
  });

  it("rejects a forged selection for a loaded non-current first-parent commit", () => {
    const [head, base, side] = ["a", "b", "c"].map((value) => value.repeat(40));
    const commits = [
      { oid: head!, parentOids: [base!, side!] },
      { oid: side!, parentOids: [base!] },
      { oid: base!, parentOids: [] },
    ];
    const eligible = [head!, base!];
    const empty = KtcCreateGitRangeSelection(commits, [], eligible);
    expect(() => KtcUpdateGitRangeSelection(commits, empty, side!, true, undefined, eligible))
      .toThrow("非当前分支，不能合并");
  });

  it("shrinks at an unchecked boundary and clears when the anchor is unchecked", () => {
    const [head, middle, base] = ["a", "b", "c"].map((value) => value.repeat(40));
    const commits = [
      { oid: head!, parentOids: [middle!] },
      { oid: middle!, parentOids: [base!] },
      { oid: base!, parentOids: [] },
    ];
    const selected = KtcCreateGitRangeSelection(commits, [head!, middle!, base!]);
    expect(KtcUpdateGitRangeSelection(commits, selected, base!, false).selectedOids).toEqual([head, middle]);
    expect(KtcUpdateGitRangeSelection(commits, selected, middle!, false).selectedOids).toEqual([head]);
    expect(KtcUpdateGitRangeSelection(commits, selected, head!, false).selectedOids).toEqual([]);
  });

  it("uses the drag start as the anchor and fills every intermediate commit", () => {
    const [head, middle, base] = ["a", "b", "c"].map((value) => value.repeat(40));
    const commits = [
      { oid: head!, parentOids: [middle!] },
      { oid: middle!, parentOids: [base!] },
      { oid: base!, parentOids: [] },
    ];
    const empty = KtcCreateGitRangeSelection(commits);
    expect(KtcUpdateGitRangeSelection(commits, empty, base!, true, head!)).toMatchObject({
      anchorOid: head,
      endpointOid: base,
      selectedOids: [head, middle, base],
    });
  });

  it("identifies a continuous interval on another local branch from pure branch lines", () => {
    const [developHead, topicHead, shared, root] = ["a", "b", "c", "d"].map((value) => value.repeat(40));
    const assessment = KtcAssessGitBranchRange([
      { name: "develop", firstParentOids: [developHead!, shared!, root!] },
      { name: "topic", firstParentOids: [topicHead!, shared!, root!] },
    ], "develop", [topicHead!, shared!]);
    expect(assessment).toEqual({
      kind: "other-branch",
      selectedOids: [topicHead, shared],
      currentBranchName: "develop",
      candidateBranchNames: ["topic"],
    });
  });

  it("does not confuse graph connectivity with a non-contiguous branch interval", () => {
    const [head, middle, base] = ["a", "b", "c"].map((value) => value.repeat(40));
    const assessment = KtcAssessGitBranchRange([
      { name: "develop", firstParentOids: [head!, middle!, base!] },
    ], "develop", [head!, base!]);
    expect(assessment.kind).toBe("not-contiguous");
  });
});
