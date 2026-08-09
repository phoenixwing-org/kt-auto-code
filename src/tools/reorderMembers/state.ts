import type { ReorderFileResultSummary } from "../types.js";

export interface KtcReorderStateRow extends Omit<ReorderFileResultSummary, "warnings"> {
  warnings: readonly string[];
}

export function ktcReorderResultSummaries(
  rows: readonly KtcReorderStateRow[],
  runtimeWarnings: ReadonlyMap<string, string> = new Map(),
): ReorderFileResultSummary[] {
  return rows.map((row) => ({
    ...row,
    warnings: [...row.warnings, runtimeWarnings.get(row.uri)].filter((value): value is string => Boolean(value)),
  }));
}

export function ktcPendingReorderUris(
  rows: readonly KtcReorderStateRow[],
  requestedUris: readonly string[],
): string[] {
  const requested = new Set(requestedUris);
  return rows.filter((row) => row.state === "pending" && requested.has(row.uri)).map((row) => row.uri);
}

export function ktcCancelReorderRows(
  rows: readonly KtcReorderStateRow[],
  requestedUris: readonly string[],
): number {
  const requested = new Set(requestedUris);
  let cancelled = 0;
  for (const row of rows) {
    if (row.state !== "pending" || !requested.has(row.uri)) continue;
    row.state = "cancelled";
    cancelled += 1;
  }
  return cancelled;
}
