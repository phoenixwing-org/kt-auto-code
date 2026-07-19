export type KtcCodegenBatchApplyItemStatus = "applied" | "partial" | "not-written";

export interface KtcCodegenBatchApplyItemResult {
  readonly uri: string;
  readonly fileName: string;
  readonly status: KtcCodegenBatchApplyItemStatus;
  readonly errorCount: number;
}

export interface KtcCodegenBatchApplyTotals {
  readonly total: number;
  readonly applied: number;
  readonly partial: number;
  readonly notWritten: number;
}

export function ktcCodegenBatchApplyTotals(
  items: readonly KtcCodegenBatchApplyItemResult[],
): KtcCodegenBatchApplyTotals {
  return {
    total: items.length,
    applied: items.filter((item) => item.status === "applied").length,
    partial: items.filter((item) => item.status === "partial").length,
    notWritten: items.filter((item) => item.status === "not-written").length,
  };
}

export function ktcCodegenBatchApplySummary(
  items: readonly KtcCodegenBatchApplyItemResult[],
  elapsed: string,
): string {
  const totals = ktcCodegenBatchApplyTotals(items);
  return `全部应用完成：共 ${totals.total} 份，完成 ${totals.applied} 份，部分完成 ${totals.partial} 份，未写入 ${totals.notWritten} 份；耗时 ${elapsed}。`;
}
