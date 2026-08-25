/** Compares two validated Git selections without trusting their display order. */
export function KtcSameGitOidSelection(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  if (leftSet.size !== left.length) return false;
  return right.every((oid) => leftSet.has(oid));
}

export interface KtcGitRangeCommit {
  readonly oid: string;
  readonly parentOids: readonly string[];
}

export interface KtcGitRangeSelection {
  readonly selectedOids: readonly string[];
  readonly selectableOids: readonly string[];
  readonly anchorOid?: string;
  readonly endpointOid?: string;
}

export interface KtcGitRangeSelectionProjection {
  readonly selection: KtcGitRangeSelection;
  readonly missingOids: readonly string[];
}

/** Validates the OID-only selection contract received from any UI or saved state. */
export function KtcValidateGitSelectionOids(requestedOids: readonly string[]): readonly string[] {
  if (requestedOids.length > 100) throw new Error("一次最多选择 100 个 commit。");
  if (requestedOids.some((oid) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(oid))) {
    throw new Error("合并选择包含无效 commit OID。");
  }
  const unique = new Set(requestedOids);
  if (unique.size !== requestedOids.length) throw new Error("合并选择包含重复 commit。");
  return [...requestedOids];
}

/**
 * Reconciles persisted OIDs with a freshly read graph. This pure projection is
 * the only place that turns old checkbox identity into selected/selectable rows.
 */
export function KtcProjectGitRangeSelection(
  commits: readonly KtcGitRangeCommit[],
  requestedOids: readonly string[],
): KtcGitRangeSelectionProjection {
  const requested = KtcValidateGitSelectionOids(requestedOids);
  const known = new Set(commits.map((commit) => commit.oid));
  const missingOids = requested.filter((oid) => !known.has(oid));
  return {
    selection: KtcCreateGitRangeSelection(commits, missingOids.length === 0 ? requested : []),
    missingOids,
  };
}

/** Removes blank separator rows from an automatically generated squash draft. */
export function KtcCompactGitCommitMessage(message: string): string {
  return message
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

/**
 * A branch line is deliberately a DOM-free projection of Git's first-parent
 * history.  The graph renderer may draw merge lanes, but rewrite eligibility
 * is decided only from this explicit data.
 */
export interface KtcGitBranchLine {
  readonly name: string;
  readonly firstParentOids: readonly string[];
}

export interface KtcGitBranchRangeAssessment {
  readonly kind: "empty" | "not-contiguous" | "current-branch" | "other-branch" | "ambiguous-branch";
  readonly selectedOids: readonly string[];
  readonly currentBranchName?: string;
  readonly candidateBranchNames: readonly string[];
}

/**
 * Determines the branch that owns a selected first-parent interval without
 * inspecting SVG lanes, checkbox state, or any VS Code object.  A range may
 * be valid on a non-current local branch; the controller can then ask the
 * user to switch before invoking Wing's current-branch-only squash preflight.
 */
export function KtcAssessGitBranchRange(
  branches: readonly KtcGitBranchLine[],
  currentBranchName: string | undefined,
  selectedOids: readonly string[],
): KtcGitBranchRangeAssessment {
  const selected = [...new Set(selectedOids)];
  if (selected.length === 0) {
    return { kind: "empty", selectedOids: [], ...(currentBranchName ? { currentBranchName } : {}), candidateBranchNames: [] };
  }
  const candidates = branches
    .filter((branch) => KtcIsContiguousOidInterval(branch.firstParentOids, selected))
    .map((branch) => branch.name);
  if (candidates.length === 0) {
    return { kind: "not-contiguous", selectedOids: selected, ...(currentBranchName ? { currentBranchName } : {}), candidateBranchNames: [] };
  }
  if (currentBranchName && candidates.includes(currentBranchName)) {
    return { kind: "current-branch", selectedOids: selected, currentBranchName, candidateBranchNames: candidates };
  }
  if (candidates.length === 1) {
    return { kind: "other-branch", selectedOids: selected, ...(currentBranchName ? { currentBranchName } : {}), candidateBranchNames: candidates };
  }
  return { kind: "ambiguous-branch", selectedOids: selected, ...(currentBranchName ? { currentBranchName } : {}), candidateBranchNames: candidates };
}

function KtcIsContiguousOidInterval(firstParentOids: readonly string[], selectedOids: readonly string[]): boolean {
  const indexes = selectedOids.map((oid) => firstParentOids.indexOf(oid));
  if (indexes.some((index) => index < 0)) return false;
  const min = Math.min(...indexes);
  const max = Math.max(...indexes);
  return max - min + 1 === selectedOids.length;
}

/**
 * Creates a first-parent-only interval. Merge parents are deliberately excluded:
 * the Wing squash contract rewrites one linear local-branch history at a time.
 */
export function KtcCreateGitRangeSelection(
  commits: readonly KtcGitRangeCommit[],
  requestedOids: readonly string[] = [],
): KtcGitRangeSelection {
  const known = new Set(commits.map((commit) => commit.oid));
  const selected = commits.filter((commit) => requestedOids.includes(commit.oid)).map((commit) => commit.oid);
  if (selected.length === 0) return { selectedOids: [], selectableOids: commits.map((commit) => commit.oid) };
  const anchorOid = selected[0]!;
  const endpointOid = selected.at(-1)!;
  const range = KtcGitFirstParentRange(commits, anchorOid, endpointOid);
  if (!range || selected.some((oid) => !range.includes(oid))) {
    return KtcGitRangeFromEndpoints(commits, anchorOid, anchorOid);
  }
  return KtcGitRangeFromEndpoints(commits, anchorOid, endpointOid);
}

/** Applies one checkbox or drag-end intent without trusting a Webview-provided OID set. */
export function KtcUpdateGitRangeSelection(
  commits: readonly KtcGitRangeCommit[],
  current: KtcGitRangeSelection,
  targetOid: string,
  checked: boolean,
  dragAnchorOid?: string,
): KtcGitRangeSelection {
  const known = new Set(commits.map((commit) => commit.oid));
  if (!known.has(targetOid)) throw new Error("合并区间包含未加载的 commit。");

  const anchorOid = current.anchorOid && known.has(current.anchorOid)
    ? current.anchorOid
    : dragAnchorOid && known.has(dragAnchorOid)
      ? dragAnchorOid
      : undefined;
  if (!anchorOid) {
    return checked
      ? KtcGitRangeFromEndpoints(commits, targetOid, targetOid)
      : KtcCreateGitRangeSelection(commits);
  }

  if (checked) {
    return KtcGitFirstParentRange(commits, anchorOid, targetOid)
      ? KtcGitRangeFromEndpoints(commits, anchorOid, targetOid)
      : current;
  }

  if (!current.selectedOids.includes(targetOid)) return current;
  if (targetOid === anchorOid) return KtcCreateGitRangeSelection(commits);
  const endpointOid = current.endpointOid ?? current.selectedOids.at(-1);
  if (!endpointOid) return KtcCreateGitRangeSelection(commits);
  const directionalRange = KtcGitFirstParentRange(commits, anchorOid, endpointOid);
  const targetIndex = directionalRange?.indexOf(targetOid) ?? -1;
  if (!directionalRange || targetIndex <= 0) return current;
  return KtcGitRangeFromEndpoints(commits, anchorOid, directionalRange[targetIndex - 1]!);
}

/** Returns the anchor-to-endpoint path when both commits are first-parent comparable. */
export function KtcGitFirstParentRange(
  commits: readonly KtcGitRangeCommit[],
  anchorOid: string,
  endpointOid: string,
): readonly string[] | undefined {
  const byOid = new Map(commits.map((commit) => [commit.oid, commit]));
  const anchorToEndpoint = KtcWalkFirstParents(byOid, anchorOid, endpointOid);
  if (anchorToEndpoint) return anchorToEndpoint;
  const endpointToAnchor = KtcWalkFirstParents(byOid, endpointOid, anchorOid);
  return endpointToAnchor ? [...endpointToAnchor].reverse() : undefined;
}

function KtcGitRangeFromEndpoints(
  commits: readonly KtcGitRangeCommit[],
  anchorOid: string,
  endpointOid: string,
): KtcGitRangeSelection {
  const range = KtcGitFirstParentRange(commits, anchorOid, endpointOid) ?? [anchorOid];
  const selectedSet = new Set(range);
  const selectableSet = new Set(
    commits
      .filter((commit) => KtcGitFirstParentRange(commits, anchorOid, commit.oid))
      .map((commit) => commit.oid),
  );
  return {
    anchorOid,
    endpointOid: range.at(-1),
    selectedOids: commits.filter((commit) => selectedSet.has(commit.oid)).map((commit) => commit.oid),
    selectableOids: commits.filter((commit) => selectableSet.has(commit.oid)).map((commit) => commit.oid),
  };
}

function KtcWalkFirstParents(
  byOid: ReadonlyMap<string, KtcGitRangeCommit>,
  fromOid: string,
  toOid: string,
): readonly string[] | undefined {
  const result: string[] = [];
  const visited = new Set<string>();
  let currentOid: string | undefined = fromOid;
  while (currentOid && !visited.has(currentOid)) {
    result.push(currentOid);
    if (currentOid === toOid) return result;
    visited.add(currentOid);
    currentOid = byOid.get(currentOid)?.parentOids[0];
  }
  return undefined;
}
