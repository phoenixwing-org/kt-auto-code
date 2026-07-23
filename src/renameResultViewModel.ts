import type {
  WorkspaceRenameReport,
  WorkspaceRenameSummary,
} from "./workspaceRename.js";
import {
  pnwCodePageRenameResultRows,
  pnwCodeProjectRenameResults,
  type PnwCodeRenameResultRow,
} from "@phoenix-wing/code-core/ui/model";

export type KtcRenameResultRowViewModel = PnwCodeRenameResultRow & {
  /** @deprecated Use originalPath. Kept until all Auto Webview adapters migrate. */
  originalFullPath: string;
  /** @deprecated Use plannedPath. Kept until all Auto Webview adapters migrate. */
  plannedFullPath: string;
};

export interface KtcRenameResultViewModel {
  root: string;
  applied: boolean;
  summary: WorkspaceRenameSummary;
  rows: readonly KtcRenameResultRowViewModel[];
}

export interface KtcRenameResultPage extends Omit<KtcRenameResultViewModel, "rows"> {
  rows: readonly KtcRenameResultRowViewModel[];
  offset: number;
  totalRows: number;
  nextOffset?: number;
}

export function ktcBuildRenameResultViewModel(report: WorkspaceRenameReport): KtcRenameResultViewModel {
  const rows = pnwCodeProjectRenameResults({
    root: report.root,
    applied: report.applied,
    hits: report.hits.map((hit) => ({
      id: hit.id,
      relativePath: hit.relativePath,
      originalPath: hit.originalFullPath,
      plannedPath: hit.plannedFullPath,
      targetPath: hit.newPath,
      level: hit.level,
      occurrences: hit.occurrences,
      lines: hit.lines,
      encoding: hit.detectedEncoding,
      status: hit.status,
      detail: hit.detail,
      matches: hit.ruleMatches,
    })),
  }).map((row) => ({
    ...row,
    originalFullPath: row.originalPath,
    plannedFullPath: row.plannedPath,
  }));
  return {
    root: report.root,
    applied: report.applied,
    summary: report.summary,
    rows,
  };
}

export function ktcPageRenameResultViewModel(
  report: KtcRenameResultViewModel,
  requestedOffset = 0,
  requestedPageSize = 300,
): KtcRenameResultPage {
  const page = pnwCodePageRenameResultRows(
    report.root,
    report.applied,
    report.rows,
    requestedOffset,
    requestedPageSize,
  );
  return {
    ...page,
    summary: report.summary,
    rows: page.rows as readonly KtcRenameResultRowViewModel[],
  };
}
