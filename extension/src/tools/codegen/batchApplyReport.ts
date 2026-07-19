import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";
import {
  ktcCodegenBatchApplyTotals,
  type KtcCodegenBatchApplyItemResult,
} from "./batchApplyV1.js";

export interface KtcCodegenBatchApplyReportIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
}

export interface KtcCodegenBatchApplyReportItem extends KtcCodegenBatchApplyItemResult {
  readonly preflightRegionCount: number;
  readonly preflightArtifactCount: number;
  readonly preflightDiagnosticCount: number;
  readonly preflightErrorCount: number;
  readonly modifiedFileCount: number;
  readonly writtenRegionCount: number;
  readonly elapsedMilliseconds: number;
  readonly issues: readonly KtcCodegenBatchApplyReportIssue[];
}

export interface KtcCodegenBatchApplyReport {
  readonly elapsedMilliseconds: number;
  readonly items: readonly KtcCodegenBatchApplyReportItem[];
  readonly totals: ReturnType<typeof ktcCodegenBatchApplyTotals>;
  readonly errorCount: number;
  readonly warningCount: number;
}

export function ktcCodegenBatchApplyReport(
  items: readonly KtcCodegenBatchApplyReportItem[],
  elapsedMilliseconds: number,
): KtcCodegenBatchApplyReport {
  return {
    elapsedMilliseconds: finiteDuration(elapsedMilliseconds),
    items: [...items],
    totals: ktcCodegenBatchApplyTotals(items),
    errorCount: items.reduce(
      (total, item) => total + item.issues.filter((issue) => issue.severity === "error").length,
      0,
    ),
    warningCount: items.reduce(
      (total, item) => total + item.issues.filter((issue) => issue.severity === "warning").length,
      0,
    ),
  };
}

export function ktcCodegenBatchApplyReportIssues(
  diagnostics: readonly KtCodegenDiagnostic[],
  fallbackFile?: string,
): readonly KtcCodegenBatchApplyReportIssue[] {
  const seen = new Set<string>();
  const issues: KtcCodegenBatchApplyReportIssue[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "error" && diagnostic.severity !== "warning") continue;
    const file = diagnostic.path?.file ?? fallbackFile;
    const line = diagnostic.path?.row === undefined
      ? undefined
      : Math.max(1, Math.trunc(diagnostic.path.row) + 1);
    const key = `${diagnostic.severity}\u0000${diagnostic.code}\u0000${diagnostic.message}\u0000${file ?? ""}\u0000${line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      ...(file ? { file } : {}),
      ...(line === undefined ? {} : { line }),
    });
  }
  return issues;
}

export function ktcCodegenBatchApplyReportFailure(
  code: string,
  message: string,
  file?: string,
): KtcCodegenBatchApplyReportIssue {
  return { severity: "error", code, message, ...(file ? { file } : {}) };
}

function finiteDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
