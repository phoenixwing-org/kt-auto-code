import type { KtCodegenDiagnostic } from "@phoenix-wing/kt-codegen";

export interface KtcCodegenApplyOutcome {
  readonly modifiedFileCount: number;
  readonly writtenRegionCount: number;
  readonly diagnostics: readonly KtCodegenDiagnostic[];
}

export function ktcCodegenApplyOutcome(
  diagnostics: readonly KtCodegenDiagnostic[],
  modifiedFileCount = 0,
  writtenRegionCount = 0,
): KtcCodegenApplyOutcome {
  return {
    modifiedFileCount: count(modifiedFileCount),
    writtenRegionCount: count(writtenRegionCount),
    diagnostics: [...diagnostics],
  };
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
