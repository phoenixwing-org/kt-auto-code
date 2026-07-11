import type { KtcReplacementRuleDraft } from "./associatedReplacementRules.js";
import type { RenameLevel } from "./workspaceRename.js";

export interface KtcSearchReplaceRequest {
  oldName: string;
  newName: string;
  rules?: readonly KtcReplacementRuleDraft[];
  preserveCase?: boolean;
  levels: readonly RenameLevel[];
  scope?: string;
  includeIgnored?: boolean;
}

export type KtcSearchReplaceRunResult = "completed" | "cancelled" | "error";
