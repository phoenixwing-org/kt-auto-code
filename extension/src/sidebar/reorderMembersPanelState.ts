export type KtcReorderMembersPanelPresentation = "ribbon" | "detailBlock";

export type KtcReorderMembersRowState =
  | "unchanged"
  | "pending"
  | "cancelled"
  | "applied"
  | "blocked"
  | "reverted";

export interface KtcReorderMembersPanelRow {
  readonly uri: string;
  readonly relativePath: string;
  readonly kind: "header" | "source";
  readonly encoding: string;
  readonly changed: boolean;
  readonly state: KtcReorderMembersRowState;
  readonly warnings: readonly string[];
}

/** Host snapshot consumed by the browser-only member-sort page shell. */
export interface KtcReorderMembersPanelModel {
  readonly presentation: KtcReorderMembersPanelPresentation;
  readonly status: "idle" | "running" | "done" | "error";
  readonly message?: string;
  readonly scanned?: number;
  readonly reorderResults?: readonly KtcReorderMembersPanelRow[];
  readonly reorderRevision?: number;
  readonly reorderSelectedUris?: readonly string[];
}

export interface KtcReorderMembersSelectionState {
  readonly selectedUris: readonly string[];
  readonly revision?: number;
}

export interface KtcReorderMembersPanelProjection {
  readonly hasCache: boolean;
  readonly running: boolean;
  readonly changedRows: readonly KtcReorderMembersPanelRow[];
  readonly unchangedRows: readonly KtcReorderMembersPanelRow[];
  readonly pendingRows: readonly KtcReorderMembersPanelRow[];
  readonly selectedPendingUris: readonly string[];
  readonly allPendingSelected: boolean;
  readonly somePendingSelected: boolean;
  readonly applyDisabled: boolean;
  readonly worksetDisabled: boolean;
  readonly applyLabel: string;
}

export function ktcNextReorderSelection(
  previous: KtcReorderMembersSelectionState,
  next: Pick<KtcReorderMembersPanelModel, "reorderResults" | "reorderRevision" | "reorderSelectedUris">,
): KtcReorderMembersSelectionState {
  if (!Array.isArray(next.reorderResults)) {
    return { selectedUris: [...previous.selectedUris], revision: previous.revision };
  }
  const pending = new Set(next.reorderResults
    .filter((row) => row.state === "pending")
    .map((row) => row.uri));
  if (Array.isArray(next.reorderSelectedUris)) {
    return {
      selectedUris: unique(next.reorderSelectedUris.filter((uri) => pending.has(uri))),
      revision: next.reorderRevision,
    };
  }
  if (previous.revision === undefined || next.reorderRevision !== previous.revision) {
    return { selectedUris: [...pending], revision: next.reorderRevision };
  }
  return {
    selectedUris: unique(previous.selectedUris.filter((uri) => pending.has(uri))),
    revision: previous.revision,
  };
}

export function ktcSetReorderSelection(
  current: KtcReorderMembersSelectionState,
  model: Pick<KtcReorderMembersPanelModel, "reorderResults">,
  requestedUris: readonly string[],
): KtcReorderMembersSelectionState {
  const pending = new Set((model.reorderResults ?? [])
    .filter((row) => row.state === "pending")
    .map((row) => row.uri));
  return {
    selectedUris: unique(requestedUris.filter((uri) => pending.has(uri))),
    revision: current.revision,
  };
}

export function ktcProjectReorderMembersPanel(
  model: KtcReorderMembersPanelModel,
  selection: KtcReorderMembersSelectionState,
): KtcReorderMembersPanelProjection {
  const hasCache = Array.isArray(model.reorderResults);
  const rows = hasCache
    ? model.reorderResults!.filter((row) => row.state !== "cancelled")
    : [];
  const changedRows = rows.filter((row) => row.state !== "unchanged");
  const unchangedRows = rows.filter((row) => row.state === "unchanged");
  const pendingRows = changedRows.filter((row) => row.state === "pending");
  const pending = new Set(pendingRows.map((row) => row.uri));
  const selectedPendingUris = unique(selection.selectedUris.filter((uri) => pending.has(uri)));
  const running = model.status === "running";
  return {
    hasCache,
    running,
    changedRows,
    unchangedRows,
    pendingRows,
    selectedPendingUris,
    allPendingSelected: pendingRows.length > 0 && selectedPendingUris.length === pendingRows.length,
    somePendingSelected: selectedPendingUris.length > 0 && selectedPendingUris.length < pendingRows.length,
    applyDisabled: running || selectedPendingUris.length === 0,
    worksetDisabled: running || !hasCache,
    applyLabel: selectedPendingUris.length > 0
      ? `应用所选（${selectedPendingUris.length}）`
      : "应用所选",
  };
}

export function ktcReorderStateLabel(value: KtcReorderMembersRowState): string {
  return ({
    pending: "待写盘",
    applied: "已写盘",
    blocked: "未写入",
    reverted: "已还原",
    unchanged: "无变更",
    cancelled: "已移除",
  })[value];
}

export function ktcReorderStateMark(value: KtcReorderMembersRowState): string {
  return ({
    pending: "M",
    applied: "✓",
    blocked: "!",
    reverted: "↶",
    unchanged: "—",
    cancelled: "",
  })[value];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
