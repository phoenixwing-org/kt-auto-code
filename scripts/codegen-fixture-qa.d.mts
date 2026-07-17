export interface CodegenQaBaseline {
  readonly kind: "kt.codegen.qa-baseline";
  readonly schemaVersion: 1;
  readonly createdAt: string;
  readonly sourceFileCount: number;
  readonly protectedSources: readonly { readonly path: string; readonly fingerprint: string }[];
  readonly editableJson: readonly {
    readonly path: string;
    readonly fingerprint: string;
    readonly rootKeys: readonly string[];
    readonly headers: readonly string[];
  }[];
}

export interface CodegenQaReport {
  readonly ok: boolean;
  readonly checkpoint: string;
  readonly checks: readonly { readonly id: string; readonly ok: boolean; readonly message: string }[];
}

export type CodegenQaCheckpointStatus = "pending" | "passed" | "failed" | "skipped";

export interface CodegenManualQaCheckpointUpdate {
  readonly id: string;
  readonly status: CodegenQaCheckpointStatus;
  readonly notes?: string;
  readonly vscodeVersion?: string;
  readonly diagnosticsCopied?: boolean;
  readonly themes?: Partial<Record<"dark" | "light" | "highContrast", string>>;
}

export const CODEGEN_QA_BASELINE_RELATIVE: string;
export const CODEGEN_QA_REPORT_RELATIVE: string;
export const CODEGEN_QA_REQUIRED_CHECKPOINTS: readonly string[];
export function writeCodegenFixtureBaseline(workspacePath: string): CodegenQaBaseline;
export function writeCodegenFixtureQaReport(workspacePath: string, extensionVersion?: string): Record<string, unknown>;
export function verifyCodegenFixture(workspacePath: string, checkpoint?: "source" | "a" | "c" | "e"): CodegenQaReport;
export function recordCodegenFixtureVerification(workspacePath: string, verification: CodegenQaReport): Record<string, unknown>;
export function readCodegenFixtureQaReport(workspacePath: string): Record<string, any>;
export function recordCodegenManualCheckpoint(workspacePath: string, update: CodegenManualQaCheckpointUpdate): Record<string, any>;
export function formatCodegenFixtureQaSummary(report: Record<string, any>): string;
