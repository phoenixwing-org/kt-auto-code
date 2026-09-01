import {
  ktcBuildRenameResultViewModel,
  ktcPageRenameResultViewModel,
} from "../../core/renameResultViewModel.js";
import type {
  KtcProjectRenameAnalysisReport,
  KtcProjectRenameReportSummary,
  KtcProjectRenameResultPage,
  KtcProjectRenameResultRow,
} from "./contracts.js";

export function ktcProjectRenameReportSummary(
  report: KtcProjectRenameAnalysisReport,
  pageSize = 200,
): KtcProjectRenameReportSummary {
  return {
    reportId: report.reportId,
    ...(report.rootSuggestion ? { rootSuggestion: report.rootSuggestion } : {}),
    summary: report.workspaceReport.summary,
    riskSummary: report.riskSummary,
    stats: report.stats,
    relatedCandidates: report.relatedCandidates,
    page: ktcProjectRenameResultPage(report, 0, pageSize),
  };
}

export function ktcProjectRenameResultPage(
  report: KtcProjectRenameAnalysisReport,
  offset = 0,
  pageSize = 200,
): KtcProjectRenameResultPage {
  const base = ktcBuildRenameResultViewModel(report.workspaceReport);
  const riskOrder = { high: 0, medium: 1, low: 2 } as const;
  const rows = base.rows.map((row): KtcProjectRenameResultRow => ({
    ...row,
    ...report.assessments[row.id]!,
  })).sort((left, right) => (
    riskOrder[left.risk] - riskOrder[right.risk]
    || left.sourceAddress.localeCompare(right.sourceAddress)
    || left.sourceName.localeCompare(right.sourceName)
  ));
  const page = ktcPageRenameResultViewModel({ ...base, rows }, offset, pageSize);
  return {
    reportId: report.reportId,
    rows: page.rows as readonly KtcProjectRenameResultRow[],
    offset: page.offset,
    totalRows: page.totalRows,
    ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
  };
}
