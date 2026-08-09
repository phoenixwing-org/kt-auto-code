import type {
  KtcCodegenApplyChange,
  KtcCodegenApplyHealth,
  KtcCodegenApplyReasonCode,
} from "./applyOutcome.js";
import {
  KTC_CODEGEN_APPLY_REPORT_KIND,
  KTC_CODEGEN_APPLY_REPORT_SCHEMA_VERSION,
  type KtcCodegenApplyReportKind,
  type KtcCodegenBatchApplyReport,
  type KtcCodegenBatchApplyReportIssue,
} from "./batchApplyReport.js";

export const KTC_CODEGEN_APPLY_REPORT_DIRECTORY = ".phoenix/reports/codegen";

export interface KtcCodegenStoredLocation {
  readonly workspaceFolder: string;
  readonly path: string;
  readonly line?: number;
}

export interface KtcCodegenStoredApplyReportIssue
  extends Omit<KtcCodegenBatchApplyReportIssue, "file" | "line"> {
  readonly location?: KtcCodegenStoredLocation;
}

export interface KtcCodegenStoredApplyReportItem {
  readonly fileName: string;
  readonly json: KtcCodegenStoredLocation;
  readonly health: KtcCodegenApplyHealth;
  readonly change: KtcCodegenApplyChange;
  readonly reasonCode: KtcCodegenApplyReasonCode;
  readonly errorCount: number;
  readonly preflightRegionCount: number;
  readonly preflightArtifactCount: number;
  readonly preflightDiagnosticCount: number;
  readonly preflightErrorCount: number;
  readonly modifiedFileCount: number;
  readonly writtenRegionCount: number;
  readonly elapsedMilliseconds: number;
  readonly issues: readonly KtcCodegenStoredApplyReportIssue[];
}

export interface KtcCodegenStoredApplyReport {
  readonly kind: typeof KTC_CODEGEN_APPLY_REPORT_KIND;
  readonly schemaVersion: typeof KTC_CODEGEN_APPLY_REPORT_SCHEMA_VERSION;
  readonly reportId: string;
  readonly applyKind: KtcCodegenApplyReportKind;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly health: KtcCodegenApplyHealth;
  readonly change: KtcCodegenApplyChange;
  readonly summary: {
    readonly itemCount: number;
    readonly modifiedFileCount: number;
    readonly writtenRegionCount: number;
    readonly errorCount: number;
    readonly warningCount: number;
  };
  readonly elapsedMilliseconds: number;
  readonly items: readonly KtcCodegenStoredApplyReportItem[];
}

export interface KtcCodegenApplyReportSummary {
  readonly reportId: string;
  readonly fileName: string;
  readonly applyKind: KtcCodegenApplyReportKind;
  readonly startedAt: string;
  readonly health: KtcCodegenApplyHealth;
  readonly change: KtcCodegenApplyChange;
  readonly itemCount: number;
  readonly subject: string;
}

export function ktcCodegenApplyReportFileName(report: KtcCodegenBatchApplyReport): string {
  const timestamp = new Date(report.startedAt).toISOString()
    .replaceAll(":", "-")
    .replace(".", "-");
  const subject = report.applyKind === "single"
    ? portableSubject(report.items[0]?.fileName.replace(/\.json$/iu, "") ?? "codegen")
    : `${report.items.length}-json`;
  const shortId = report.reportId.replaceAll("-", "").slice(0, 8).toLowerCase() || "report";
  return `${timestamp}__${report.applyKind}__${subject}__${shortId}.json`;
}

export function ktcCodegenApplyReportSummary(
  report: KtcCodegenStoredApplyReport,
  fileName: string,
): KtcCodegenApplyReportSummary {
  return {
    reportId: report.reportId,
    fileName,
    applyKind: report.applyKind,
    startedAt: report.startedAt,
    health: report.health,
    change: report.change,
    itemCount: report.items.length,
    subject: report.applyKind === "single"
      ? report.items[0]?.fileName ?? "Codegen JSON"
      : `${report.items.length} 份 JSON`,
  };
}

export function ktcSerializeStoredCodegenApplyReport(report: KtcCodegenStoredApplyReport): Uint8Array {
  if (!ktcValidStoredCodegenApplyReport(report)) throw new Error("Codegen Apply 报告数据无效，拒绝写盘");
  return new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`);
}

export function ktcParseStoredCodegenApplyReport(content: Uint8Array): KtcCodegenStoredApplyReport | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
    return ktcValidStoredCodegenApplyReport(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function ktcValidStoredCodegenApplyReport(value: unknown): value is KtcCodegenStoredApplyReport {
  if (!isRecord(value)
    || value.kind !== KTC_CODEGEN_APPLY_REPORT_KIND
    || value.schemaVersion !== KTC_CODEGEN_APPLY_REPORT_SCHEMA_VERSION
    || typeof value.reportId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/iu.test(value.reportId)
    || (value.applyKind !== "single" && value.applyKind !== "batch")
    || !validIso(value.startedAt) || !validIso(value.finishedAt)
    || !health(value.health) || !change(value.change)
    || !isRecord(value.summary)
    || !count(value.summary.itemCount) || !count(value.summary.modifiedFileCount)
    || !count(value.summary.writtenRegionCount) || !count(value.summary.errorCount)
    || !count(value.summary.warningCount)
    || !count(value.elapsedMilliseconds)
    || !Array.isArray(value.items) || value.items.length === 0
    || !value.items.every(validItem)) return false;
  if (value.applyKind === "single" && value.items.length !== 1) return false;
  return value.summary.itemCount === value.items.length
    && value.health === aggregateHealth(value.items)
    && value.change === aggregateChange(value.items)
    && value.summary.modifiedFileCount === sum(value.items, "modifiedFileCount")
    && value.summary.writtenRegionCount === sum(value.items, "writtenRegionCount")
    && value.summary.errorCount === value.items.reduce(
      (total, item) => total + item.issues.filter((issue) => issue.severity === "error").length,
      0,
    )
    && value.summary.warningCount === value.items.reduce(
      (total, item) => total + item.issues.filter((issue) => issue.severity === "warning").length,
      0,
    );
}

function validItem(value: unknown): value is KtcCodegenStoredApplyReportItem {
  return isRecord(value)
    && typeof value.fileName === "string" && value.fileName.length > 0
    && validLocation(value.json, false)
    && health(value.health) && change(value.change) && reason(value.reasonCode)
    && count(value.errorCount) && count(value.preflightRegionCount)
    && count(value.preflightArtifactCount) && count(value.preflightDiagnosticCount)
    && count(value.preflightErrorCount) && count(value.modifiedFileCount)
    && count(value.writtenRegionCount) && count(value.elapsedMilliseconds)
    && Array.isArray(value.issues) && value.issues.every(validIssue);
}

function validIssue(value: unknown): value is KtcCodegenStoredApplyReportIssue {
  return isRecord(value)
    && (value.severity === "error" || value.severity === "warning")
    && typeof value.code === "string" && typeof value.message === "string"
    && (value.location === undefined || validLocation(value.location, true));
}

function validLocation(value: unknown, lineAllowed: boolean): value is KtcCodegenStoredLocation {
  if (!isRecord(value)
    || typeof value.workspaceFolder !== "string" || value.workspaceFolder.length === 0
    || typeof value.path !== "string" || !validRelativePath(value.path)) return false;
  return value.line === undefined || (lineAllowed && Number.isInteger(value.line) && Number(value.line) >= 1);
}

function validRelativePath(value: string): boolean {
  return value.length > 0
    && value.length <= 4096
    && !value.startsWith("/")
    && !value.startsWith("\\")
    && !/^[a-z]:/iu.test(value)
    && !value.split(/[\\/]/u).some((segment) => segment === "" || segment === "." || segment === "..");
}

function aggregateHealth(items: readonly { readonly health: KtcCodegenApplyHealth }[]): KtcCodegenApplyHealth {
  return items.some((item) => item.health === "error")
    ? "error"
    : items.some((item) => item.health === "warning") ? "warning" : "success";
}

function aggregateChange(items: readonly { readonly change: KtcCodegenApplyChange }[]): KtcCodegenApplyChange {
  const changes = new Set(items.map((item) => item.change));
  if (changes.has("partial") || (changes.has("updated") && changes.has("not-applied"))) return "partial";
  if (changes.has("updated")) return "updated";
  if (changes.has("not-applied")) return changes.has("unchanged") ? "partial" : "not-applied";
  return "unchanged";
}

function sum(
  items: readonly KtcCodegenStoredApplyReportItem[],
  field: "modifiedFileCount" | "writtenRegionCount",
): number {
  return items.reduce((total, item) => total + item[field], 0);
}

function portableSubject(value: string): string {
  const subject = value.normalize("NFKD")
    .replace(/[^a-z0-9._-]+/giu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return subject || "codegen";
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function health(value: unknown): value is KtcCodegenApplyHealth {
  return value === "success" || value === "warning" || value === "error";
}

function change(value: unknown): value is KtcCodegenApplyChange {
  return value === "updated" || value === "unchanged" || value === "partial" || value === "not-applied";
}

function reason(value: unknown): value is KtcCodegenApplyReasonCode {
  return value === "content-updated" || value === "content-unchanged" || value === "no-artifact"
    || value === "preflight-missing" || value === "session-missing" || value === "apply-blocked"
    || value === "encode-failed" || value === "write-failed" || value === "receipt-warning"
    || value === "partial-with-errors" || value === "unexpected-error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
