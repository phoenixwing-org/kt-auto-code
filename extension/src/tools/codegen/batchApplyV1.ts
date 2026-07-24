import {
  ktCodegenApplyReportTotals,
  type KtCodegenApplyReportChange,
  type KtCodegenApplyReportHealth,
  type KtCodegenApplyReportTotals,
} from "@phoenix-wing/kt-codegen/ui/report-model";
import type { KtcCodegenApplyReasonCode } from "./applyOutcome.js";

export interface KtcCodegenBatchApplyItemResult {
  readonly documentId: string;
  readonly fileName: string;
  readonly health: KtCodegenApplyReportHealth;
  readonly change: KtCodegenApplyReportChange;
  readonly reasonCode: KtcCodegenApplyReasonCode;
  readonly errorCount: number;
}

export type KtcCodegenBatchApplyTotals = KtCodegenApplyReportTotals;

/** 插件兼容名；真实双轴汇总算法由 Wing 共享。 */
export function ktcCodegenBatchApplyTotals(
  items: readonly KtcCodegenBatchApplyItemResult[],
): KtcCodegenBatchApplyTotals {
  return ktCodegenApplyReportTotals(items);
}

export function ktcCodegenBatchApplySummary(
  items: readonly KtcCodegenBatchApplyItemResult[],
  elapsed: string,
): string {
  const totals = ktcCodegenBatchApplyTotals(items);
  return `全部应用完成：共 ${totals.total} 份；正常 ${totals.success} 份，有警告 ${totals.warning} 份，有错误 ${totals.error} 份；已更新 ${totals.updated} 份，内容一致 ${totals.unchanged} 份，部分更新 ${totals.partial} 份，未应用 ${totals.notApplied} 份；耗时 ${elapsed}。`;
}
