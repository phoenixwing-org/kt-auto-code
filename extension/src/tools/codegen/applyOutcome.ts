import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";

export type KtcCodegenApplyHealth = "success" | "warning" | "error";
export type KtcCodegenApplyChange = "updated" | "unchanged" | "partial" | "not-applied";

export type KtcCodegenApplyReasonCode =
  | "content-updated"
  | "content-unchanged"
  | "no-artifact"
  | "preflight-missing"
  | "session-missing"
  | "apply-blocked"
  | "encode-failed"
  | "write-failed"
  | "receipt-warning"
  | "partial-with-errors"
  | "unexpected-error";

export interface KtcCodegenApplyOutcome {
  readonly health: KtcCodegenApplyHealth;
  readonly change: KtcCodegenApplyChange;
  readonly reasonCode: KtcCodegenApplyReasonCode;
  readonly modifiedFileCount: number;
  readonly writtenRegionCount: number;
  readonly diagnostics: readonly KtCodegenDiagnostic[];
}

export function ktcCodegenApplyOutcome(
  diagnostics: readonly KtCodegenDiagnostic[],
  modifiedFileCount = 0,
  writtenRegionCount = 0,
  reasonCode?: KtcCodegenApplyReasonCode,
): KtcCodegenApplyOutcome {
  const files = count(modifiedFileCount);
  const regions = count(writtenRegionCount);
  const hasChanges = files > 0 || regions > 0;
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const hasWarnings = diagnostics.some((diagnostic) => diagnostic.severity === "warning");
  const health: KtcCodegenApplyHealth = hasErrors ? "error" : hasWarnings ? "warning" : "success";
  const change: KtcCodegenApplyChange = hasErrors
    ? hasChanges ? "partial" : "not-applied"
    : hasChanges ? "updated" : "unchanged";
  return {
    health,
    change,
    reasonCode: reasonCode ?? defaultReason(health, change),
    modifiedFileCount: files,
    writtenRegionCount: regions,
    diagnostics: [...diagnostics],
  };
}

function defaultReason(
  health: KtcCodegenApplyHealth,
  change: KtcCodegenApplyChange,
): KtcCodegenApplyReasonCode {
  if (health === "error") return change === "partial" ? "partial-with-errors" : "apply-blocked";
  if (health === "warning") return "receipt-warning";
  return change === "updated" ? "content-updated" : "content-unchanged";
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
