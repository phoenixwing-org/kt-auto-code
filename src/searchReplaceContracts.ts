import type { KtcReplacementRuleDraft } from "./associatedReplacementRules.js";
import type { RenameLevel } from "./workspaceRename.js";

export interface KtcSearchReplaceRequest {
  oldName: string;
  newName: string;
  rules?: readonly KtcReplacementRuleDraft[];
  defaultEncoding?: "utf8" | "gbk";
  preserveCase?: boolean;
  levels: readonly RenameLevel[];
  scope?: string;
  /** Optional workspace-relative file snapshot expanded from a named workset. */
  includePaths?: readonly string[];
  scopeLabel?: string;
  includeIgnored?: boolean;
}

export type KtcSearchReplaceRunResult = "completed" | "cancelled" | "blocked" | "error";

export type KtcSearchReplacePanelMessage =
  | { type: "ready" }
  | { type: "loadMore"; reportId: number; offset: number }
  | { type: "openPath"; path: string; level: RenameLevel; line?: number };

export function ktcIsSearchReplacePanelMessage(
  value: unknown,
): value is KtcSearchReplacePanelMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "ready") return true;
  if (message.type === "loadMore") {
    return isNonNegativeInteger(message.reportId) && isNonNegativeInteger(message.offset);
  }
  if (message.type !== "openPath") return false;
  return typeof message.path === "string"
    && message.path.length > 0
    && (message.level === "dir" || message.level === "file" || message.level === "text")
    && (message.line === undefined || isPositiveInteger(message.line));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
