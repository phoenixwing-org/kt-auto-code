import type {
  KtcCodegenApplyChange,
  KtcCodegenApplyHealth,
  KtcCodegenApplyReasonCode,
} from "./applyOutcome.js";

export interface KtcCodegenBatchApplyItemResult {
  readonly uri: string;
  readonly fileName: string;
  readonly health: KtcCodegenApplyHealth;
  readonly change: KtcCodegenApplyChange;
  readonly reasonCode: KtcCodegenApplyReasonCode;
  readonly errorCount: number;
}

export interface KtcCodegenBatchApplyTotals {
  readonly total: number;
  readonly success: number;
  readonly warning: number;
  readonly error: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly partial: number;
  readonly notApplied: number;
}

export function ktcCodegenBatchApplyTotals(
  items: readonly KtcCodegenBatchApplyItemResult[],
): KtcCodegenBatchApplyTotals {
  return {
    total: items.length,
    success: items.filter((item) => item.health === "success").length,
    warning: items.filter((item) => item.health === "warning").length,
    error: items.filter((item) => item.health === "error").length,
    updated: items.filter((item) => item.change === "updated").length,
    unchanged: items.filter((item) => item.change === "unchanged").length,
    partial: items.filter((item) => item.change === "partial").length,
    notApplied: items.filter((item) => item.change === "not-applied").length,
  };
}

export function ktcCodegenBatchApplySummary(
  items: readonly KtcCodegenBatchApplyItemResult[],
  elapsed: string,
): string {
  const totals = ktcCodegenBatchApplyTotals(items);
  return `全部应用完成：共 ${totals.total} 份；正常 ${totals.success} 份，有警告 ${totals.warning} 份，有错误 ${totals.error} 份；已更新 ${totals.updated} 份，内容一致 ${totals.unchanged} 份，部分更新 ${totals.partial} 份，未应用 ${totals.notApplied} 份；耗时 ${elapsed}。`;
}
