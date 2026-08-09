import type { KtcCodegenControlCatalogViewModel } from "./controlViewModel.js";
import type { KtcCodegenApplyReportSummary } from "./applyReportPersistence.js";
import type { KtCodegenPrimaryUiModel } from "@phoenix-wing/kt-codegen/ui";

export type { KtcCodegenApplyReportSummary } from "./applyReportPersistence.js";

export interface KtcCodegenDocumentSummary {
  readonly uri: string;
  readonly fileName: string;
  readonly displayPath: string;
  readonly itemCount: number;
  readonly className: string;
  readonly namePrefix: string;
  readonly nameMiddle: string;
  readonly nameSpace: string;
  readonly appendFunction: string;
  readonly open: boolean;
  readonly active: boolean;
  readonly dirty: boolean;
  readonly externalConflict: boolean;
  readonly externalState: "current" | "changed" | "deleted";
  readonly diagnosticCount: number;
}

/** 工作区级控制标记候选；不绑定某一份 Codegen JSON。 */
export interface KtcCodegenSourceCandidateSummary {
  readonly uri: string;
  readonly displayPath: string;
  readonly markerCount: number;
  readonly encoding: string;
  readonly eol: "lf" | "crlf";
}

export interface KtcCodegenBatchApplyProgress {
  readonly current: number;
  readonly total: number;
  readonly fileName: string;
}

export type KtcCodegenPrimaryViewModel = KtCodegenPrimaryUiModel;

export function ktcCodegenPrimaryUiModel(input: {
  readonly documents: readonly KtcCodegenDocumentSummary[];
  readonly activeUri: string | undefined;
  readonly controls: KtcCodegenControlCatalogViewModel | undefined;
  readonly candidates: readonly KtcCodegenSourceCandidateSummary[];
  readonly reports: readonly KtcCodegenApplyReportSummary[];
  readonly reportInvalidCount: number;
  readonly operation: "discovery" | "candidates" | "batch-apply" | undefined;
  readonly batch: KtcCodegenBatchApplyProgress | undefined;
  readonly running: boolean;
}): KtcCodegenPrimaryViewModel {
  const capabilities = {
    openJson: true,
    importCsv: true,
    applyAll: true,
    scanCandidates: true,
    openReportDirectory: input.reports.length > 0,
    // Registry 兼容版本会忽略该字段；并列 Wing 的共享 Primary 用它开启可选 Host 动作。
    outputControlTemplates: true,
  } as KtCodegenPrimaryUiModel["capabilities"];
  return {
    kind: "kt.codegen.primary-ui-model",
    schemaVersion: 1,
    documents: input.documents.map((entry) => ({
      id: entry.uri,
      fileName: entry.fileName,
      displayPath: entry.displayPath,
      itemCount: entry.itemCount,
      className: entry.className,
      namePrefix: entry.namePrefix,
      nameMiddle: entry.nameMiddle,
      nameSpace: entry.nameSpace,
      appendFunction: entry.appendFunction,
      open: entry.open,
      active: entry.active,
      dirty: entry.dirty,
      externalConflict: entry.externalConflict,
      externalState: entry.externalState,
      diagnosticCount: entry.diagnosticCount,
    })),
    ...(input.activeUri ? { activeId: input.activeUri } : {}),
    ...(input.controls ? { controls: input.controls } : {}),
    candidates: input.candidates.map((candidate) => ({
      id: candidate.uri,
      displayPath: candidate.displayPath,
      markerCount: candidate.markerCount,
      encoding: candidate.encoding,
      eol: candidate.eol,
    })),
    reports: input.reports.map((report) => ({
      id: report.reportId,
      subject: report.subject,
      startedAt: report.startedAt,
      applyKind: report.applyKind,
      itemCount: report.itemCount,
      health: report.health,
      change: report.change,
    })),
    reportInvalidCount: input.reportInvalidCount,
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.batch ? { batch: input.batch } : {}),
    running: input.running,
    capabilities,
  };
}
