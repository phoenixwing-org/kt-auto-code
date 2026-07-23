import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";
import {
  KT_CODEGEN_APPLY_REPORT_KIND,
  KT_CODEGEN_APPLY_REPORT_SCHEMA_VERSION,
  ktCodegenBuildApplyReport,
  type KtCodegenApplyReportIssue,
  type KtCodegenApplyReportItem,
  type KtCodegenApplyReportUiModel,
} from "@phoenix-wing/kt-codegen/ui/report-model";
import type { KtcCodegenApplyReasonCode } from "./applyOutcome.js";

export const KTC_CODEGEN_APPLY_REPORT_KIND = KT_CODEGEN_APPLY_REPORT_KIND;
export const KTC_CODEGEN_APPLY_REPORT_SCHEMA_VERSION = KT_CODEGEN_APPLY_REPORT_SCHEMA_VERSION;
export type KtcCodegenApplyReportKind = "single" | "batch";
export type KtcCodegenBatchApplyReportIssue = KtCodegenApplyReportIssue;
export interface KtcCodegenBatchApplyReportItem extends KtCodegenApplyReportItem {
  readonly reasonCode: KtcCodegenApplyReasonCode;
}
export type KtcCodegenBatchApplyReport = Omit<KtCodegenApplyReportUiModel, "items"> & {
  readonly items: readonly KtcCodegenBatchApplyReportItem[];
};

export function ktcCodegenBatchApplyReport(
  items: readonly KtcCodegenBatchApplyReportItem[],
  elapsedMilliseconds: number,
  metadata: {
    readonly reportId?: string;
    readonly applyKind?: KtcCodegenApplyReportKind;
    readonly startedAt?: string;
    readonly finishedAt?: string;
  } = {},
): KtcCodegenBatchApplyReport {
  const finishedAt = validDate(metadata.finishedAt) ?? new Date().toISOString();
  const duration = finiteDuration(elapsedMilliseconds);
  const report = ktCodegenBuildApplyReport({
    reportId: metadata.reportId ?? globalThis.crypto.randomUUID(),
    applyKind: metadata.applyKind ?? "batch",
    startedAt: validDate(metadata.startedAt)
      ?? new Date(Math.max(0, Date.parse(finishedAt) - duration)).toISOString(),
    finishedAt,
    elapsedMilliseconds: duration,
    items,
  });
  return { ...report, items };
}

export function ktcCodegenBatchApplyReportIssues(
  diagnostics: readonly KtCodegenDiagnostic[],
  fallbackPath?: string,
): readonly KtcCodegenBatchApplyReportIssue[] {
  const seen = new Set<string>();
  const issues: KtcCodegenBatchApplyReportIssue[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "error" && diagnostic.severity !== "warning") continue;
    const path = diagnostic.path?.file ?? fallbackPath;
    const line = diagnostic.path?.row === undefined
      ? undefined
      : Math.max(1, Math.trunc(diagnostic.path.row) + 1);
    const key = `${diagnostic.severity}\u0000${diagnostic.code}\u0000${diagnostic.message}\u0000${path ?? ""}\u0000${line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(path ? { path } : {}),
      ...(line === undefined ? {} : { line }),
    });
  }
  return issues;
}

export function ktcCodegenBatchApplyReportFailure(
  code: string,
  message: string,
  path?: string,
): KtcCodegenBatchApplyReportIssue {
  return { severity: "error", code, message, ...(path ? { path } : {}) };
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function validDate(value: string | undefined): string | undefined {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : undefined;
}
