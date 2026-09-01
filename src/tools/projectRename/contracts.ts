import type { KtcRenameResultRowViewModel } from "../../core/renameResultViewModel.js";
import type { WorkspaceRenameReport } from "../../core/workspaceRename.js";

export const KTC_PROJECT_RENAME_VARIANT_STYLES = [
  "display",
  "kebab",
  "snake",
  "camel",
  "pascal",
  "upper-snake",
] as const;

export type KtcProjectRenameVariantStyle = typeof KTC_PROJECT_RENAME_VARIANT_STYLES[number];
export type KtcProjectRenameRuleStyle = KtcProjectRenameVariantStyle | "custom";

export interface KtcProjectRenameRule {
  readonly id: string;
  readonly style: KtcProjectRenameRuleStyle;
  readonly search: string;
  readonly replace: string;
  readonly enabled: boolean;
}

export type KtcProjectRenameCategory =
  | "package-contract"
  | "environment"
  | "build-config"
  | "ci"
  | "source"
  | "documentation"
  | "file-name"
  | "directory"
  | "content";

export type KtcProjectRenameRisk = "high" | "medium" | "low";

export interface KtcProjectRenameHitAssessment {
  readonly category: KtcProjectRenameCategory;
  readonly categoryLabel: string;
  readonly risk: KtcProjectRenameRisk;
  readonly riskReason: string;
  readonly replacementPreview: string;
}

export interface KtcProjectRenameScanStats {
  readonly scannedDirectories: number;
  readonly scannedFiles: number;
  readonly skippedBinaryFiles: number;
  readonly skippedLargeFiles: number;
  readonly skippedUnsupportedEncodingFiles: number;
  readonly truncated: boolean;
}

export interface KtcProjectRenameRelatedCandidate {
  readonly id: string;
  readonly search: string;
  readonly replace: string;
  readonly occurrences: number;
  readonly matchedItems: number;
  readonly reason: string;
}

export interface KtcProjectRenameCompletion {
  readonly plannedItems: number;
  readonly appliedItems: number;
  readonly remainingItems: number;
  readonly targetReached: boolean;
  readonly allPlannedApplied: boolean;
  readonly canFinish: boolean;
  readonly message: string;
}

export interface KtcProjectRenameAnalysisReport {
  readonly reportId: number;
  readonly root: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly rules: readonly KtcProjectRenameRule[];
  readonly rootSuggestion?: { readonly currentName: string; readonly suggestedName: string };
  readonly workspaceReport: WorkspaceRenameReport;
  readonly assessments: Readonly<Record<string, KtcProjectRenameHitAssessment>>;
  readonly riskSummary: Readonly<Record<KtcProjectRenameRisk, number>>;
  readonly stats: KtcProjectRenameScanStats;
  readonly relatedCandidates: readonly KtcProjectRenameRelatedCandidate[];
}

export interface KtcProjectRenameResultRow extends KtcRenameResultRowViewModel, KtcProjectRenameHitAssessment {}

export interface KtcProjectRenameResultPage {
  readonly reportId: number;
  readonly rows: readonly KtcProjectRenameResultRow[];
  readonly offset: number;
  readonly totalRows: number;
  readonly nextOffset?: number;
}

export interface KtcProjectRenameReportSummary {
  readonly reportId: number;
  readonly rootSuggestion?: {
    readonly currentName: string;
    readonly suggestedName: string;
    readonly canRename?: boolean;
    readonly renameReason?: string;
  };
  readonly summary: WorkspaceRenameReport["summary"];
  readonly riskSummary: Readonly<Record<KtcProjectRenameRisk, number>>;
  readonly stats: KtcProjectRenameScanStats;
  readonly relatedCandidates: readonly KtcProjectRenameRelatedCandidate[];
  readonly page: KtcProjectRenameResultPage;
}

export interface KtcProjectRenameViewState {
  readonly root?: string;
  readonly status: "idle" | "running" | "applying" | "done" | "cancelled" | "error";
  readonly message: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly rules: readonly KtcProjectRenameRule[];
  readonly progress?: { readonly scannedFiles: number; readonly matchedItems: number };
  readonly report?: KtcProjectRenameReportSummary;
  readonly completion?: KtcProjectRenameCompletion;
}

export type KtcProjectRenameViewInboundMessage =
  | { readonly type: "ready" }
  | { readonly type: "chooseRoot" }
  | { readonly type: "derive"; readonly sourceName: string; readonly targetName: string }
  | {
      readonly type: "analyze";
      readonly sourceName: string;
      readonly targetName: string;
      readonly rules: readonly KtcProjectRenameRule[];
    }
  | { readonly type: "cancel" }
  | { readonly type: "apply"; readonly reportId: number }
  | { readonly type: "finish" }
  | { readonly type: "renameRoot"; readonly reportId: number }
  | { readonly type: "loadMore"; readonly reportId: number; readonly offset: number }
  | { readonly type: "open"; readonly reportId: number; readonly rowId: string };

export type KtcProjectRenameViewOutboundMessage =
  | { readonly type: "state"; readonly state: KtcProjectRenameViewState }
  | { readonly type: "page"; readonly page: KtcProjectRenameResultPage };
