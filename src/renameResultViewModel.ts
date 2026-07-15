import type {
  RenameLevel,
  WorkspaceRenameReport,
  WorkspaceRenameSummary,
} from "./workspaceRename.js";

export interface KtcRenameResultRowViewModel {
  id: string;
  level: RenameLevel;
  sourceName: string;
  targetOrPositionLabel: string;
  sourceAddress: string;
  originalFullPath: string;
  plannedFullPath: string;
  openPath: string;
  openLine?: number;
  occurrences: number;
  encodingLabel: string;
  statusLabel: string;
  detail?: string;
  sourceHighlightTerms: readonly string[];
  editorHighlightTerms: readonly string[];
}

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

const KTC_LEVEL_STATUS: Record<string, string> = {
  preview: "预览",
  applied: "已替换",
  skipped: "已跳过",
  error: "错误",
};

function pathParts(value: string): { name: string; parent: string } {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  const index = normalized.lastIndexOf("/");
  return index < 0
    ? { name: normalized, parent: "." }
    : { name: normalized.slice(index + 1), parent: normalized.slice(0, index) || "." };
}

function lineSummary(lines: readonly number[]): string {
  if (lines.length === 0) return "—";
  const shown = lines.slice(0, 4).map((line) => `L${line}`).join(", ");
  return lines.length > 4 ? `${shown}，……等 ${lines.length} 处` : shown;
}

export function ktcBuildRenameResultViewModel(report: WorkspaceRenameReport): KtcRenameResultViewModel {
  return {
    root: report.root,
    applied: report.applied,
    summary: report.summary,
    rows: report.hits.map((hit) => {
      const source = pathParts(hit.relativePath);
      const target = pathParts(hit.newPath ?? hit.relativePath);
      const sourceHighlightTerms = [...new Set((hit.ruleMatches ?? []).map((match) => match.search).filter(Boolean))];
      const editorHighlightTerms = [...new Set((hit.ruleMatches ?? [])
        .map((match) => report.applied ? match.replace : match.search)
        .filter(Boolean))];
      return {
        id: hit.id,
        level: hit.level,
        sourceName: source.name,
        targetOrPositionLabel: hit.level === "text" ? lineSummary(hit.lines ?? []) : target.name,
        sourceAddress: source.parent,
        originalFullPath: hit.originalFullPath,
        plannedFullPath: hit.plannedFullPath,
        openPath: report.applied && hit.status === "applied" ? hit.plannedFullPath : hit.originalFullPath,
        openLine: hit.lines?.[0],
        occurrences: hit.occurrences,
        encodingLabel: hit.detectedEncoding ?? "",
        statusLabel: KTC_LEVEL_STATUS[hit.status] ?? hit.status,
        detail: hit.status === "error" || hit.status === "skipped" ? hit.detail : undefined,
        sourceHighlightTerms,
        editorHighlightTerms,
      };
    }),
  };
}

export function ktcPageRenameResultViewModel(
  report: KtcRenameResultViewModel,
  requestedOffset = 0,
  requestedPageSize = 300,
): KtcRenameResultPage {
  const normalizedOffset = Number.isFinite(requestedOffset)
    ? Math.trunc(requestedOffset)
    : 0;
  const normalizedPageSize = Number.isFinite(requestedPageSize)
    ? Math.trunc(requestedPageSize)
    : 300;
  const offset = Math.min(
    report.rows.length,
    Math.max(0, normalizedOffset),
  );
  const pageSize = Math.min(1_000, Math.max(1, normalizedPageSize));
  const rows = report.rows.slice(offset, offset + pageSize);
  const consumed = offset + rows.length;
  return {
    root: report.root,
    applied: report.applied,
    summary: report.summary,
    rows,
    offset,
    totalRows: report.rows.length,
    nextOffset: consumed < report.rows.length ? consumed : undefined,
  };
}
