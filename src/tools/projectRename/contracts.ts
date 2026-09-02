import type { KtcRenameResultRowViewModel } from "../../core/renameResultViewModel.js";
import type {
  KtcAssociatedRelationKind,
  KtcReplacementRuleDraft,
} from "../../core/associatedReplacementRules.js";
import type { KtcSearchReplaceProfileSummary } from "../../core/searchReplaceProfiles.js";
import type { WorkspaceRenameReport } from "../../core/workspaceRename.js";
import type { KtcAssociatedRulePickerState } from "../types.js";
import type {
  KtcProjectRenameHistoryEntry,
  KtcRenamePairHistoryEntry,
} from "../../core/renameHistory.js";

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
  readonly parentId?: string;
  readonly relationKind?: KtcAssociatedRelationKind | "custom";
  readonly source?: "generated" | "user";
}

export type KtcProjectRenameRulePickerMode = "custom" | "common" | "caa";

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
  readonly sourcePrefix: string;
  readonly targetPrefix: string;
  readonly rules: readonly KtcProjectRenameRule[];
  readonly profiles: readonly KtcSearchReplaceProfileSummary[];
  readonly selectedProfileId?: string;
  readonly profileLabel: string;
  readonly profileError?: string;
  readonly renameHistory: readonly KtcRenamePairHistoryEntry[];
  readonly projectHistory: readonly KtcProjectRenameHistoryEntry[];
  readonly progress?: { readonly scannedFiles: number; readonly matchedItems: number };
  readonly report?: KtcProjectRenameReportSummary;
  readonly completion?: KtcProjectRenameCompletion;
  readonly gitCompareAvailable?: boolean;
}

export type KtcProjectRenameViewInboundMessage =
  | { readonly type: "ready" }
  | { readonly type: "chooseRoot" }
  | {
      readonly type: "derive";
      readonly sourceName: string;
      readonly targetName: string;
      readonly sourcePrefix: string;
      readonly targetPrefix: string;
    }
  | {
      readonly type: "analyze";
      readonly sourceName: string;
      readonly targetName: string;
      readonly sourcePrefix: string;
      readonly targetPrefix: string;
      readonly rules: readonly KtcProjectRenameRule[];
    }
  | { readonly type: "loadProfile"; readonly id: string }
  | { readonly type: "loadProjectHistory"; readonly id: string }
  | {
      readonly type: "deleteHistory";
      readonly entry:
        | { readonly kind: "pair"; readonly source: string; readonly target: string }
        | { readonly kind: "project"; readonly id: string };
    }
  | { readonly type: "clearHistory" }
  | {
      readonly type: "saveProfile";
      readonly label: string;
      readonly sourceName: string;
      readonly targetName: string;
      readonly sourcePrefix: string;
      readonly targetPrefix: string;
      readonly rules: readonly KtcProjectRenameRule[];
    }
  | {
      readonly type: "requestRulePicker";
      readonly mode: KtcProjectRenameRulePickerMode;
      readonly sourceName: string;
      readonly targetName: string;
      readonly sourcePrefix: string;
      readonly targetPrefix: string;
      readonly rules: readonly KtcProjectRenameRule[];
    }
  | { readonly type: "cancel" }
  | { readonly type: "openGitChanges" }
  | { readonly type: "previewFirstDiff"; readonly reportId: number }
  | { readonly type: "previewDiff"; readonly reportId: number; readonly rowId: string }
  | { readonly type: "apply"; readonly reportId: number }
  | { readonly type: "finish" }
  | { readonly type: "renameRoot"; readonly reportId: number }
  | { readonly type: "loadMore"; readonly reportId: number; readonly offset: number }
  | { readonly type: "open"; readonly reportId: number; readonly rowId: string };

export type KtcProjectRenameViewOutboundMessage =
  | { readonly type: "state"; readonly state: KtcProjectRenameViewState }
  | { readonly type: "page"; readonly page: KtcProjectRenameResultPage }
  | { readonly type: "rulePicker"; readonly picker: KtcAssociatedRulePickerState };

export function ktcProjectRenameRuleAsDraft(rule: KtcProjectRenameRule): KtcReplacementRuleDraft {
  return {
    id: rule.id,
    search: rule.search,
    replace: rule.replace,
    enabled: rule.enabled,
    ...(rule.parentId ? { parentId: rule.parentId } : {}),
    ...(rule.relationKind ? { relationKind: rule.relationKind } : {}),
    ...(rule.source ? { source: rule.source } : {}),
  };
}
