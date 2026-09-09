import { KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH } from "../../core/rootCleanupPatterns.js";
import {
  KTC_AUTO_BUILD_CLEANUP_MODE_IDS,
  type KtcAutoBuildCleanupModeId,
} from "./autoBuildCleanupViewModel.js";

export interface KtcAutoBuildCleanupDialogRequest {
  readonly modeId: KtcAutoBuildCleanupModeId;
  readonly targetIds: readonly string[];
  readonly rulesYaml: string;
}

export type KtcAutoBuildCleanupDialogPayload =
  | { readonly kind: "cancel" }
  | { readonly kind: "preview"; readonly request: KtcAutoBuildCleanupDialogRequest }
  | {
    readonly kind: "execute";
    readonly request: KtcAutoBuildCleanupDialogRequest;
    readonly previewToken: string;
  };

const MAX_TARGETS = 512;
const MAX_ID_LENGTH = 512;
const MAX_TOKEN_LENGTH = 512;

export function ktcParseAutoBuildCleanupDialogPayload(
  value: unknown,
): KtcAutoBuildCleanupDialogPayload | undefined {
  if (!record(value)) return undefined;
  if (value.kind === "cancel") return Object.freeze({ kind: "cancel" });
  if (value.kind !== "preview" && value.kind !== "execute") return undefined;
  const request = parseRequest(value.request);
  if (!request) return undefined;
  if (value.kind === "preview") return Object.freeze({ kind: "preview", request });
  if (typeof value.previewToken !== "string"
    || value.previewToken.length === 0
    || value.previewToken.length > MAX_TOKEN_LENGTH) return undefined;
  return Object.freeze({ kind: "execute", request, previewToken: value.previewToken });
}

function parseRequest(value: unknown): KtcAutoBuildCleanupDialogRequest | undefined {
  if (!record(value)
    || typeof value.modeId !== "string"
    || !KTC_AUTO_BUILD_CLEANUP_MODE_IDS.includes(value.modeId as KtcAutoBuildCleanupModeId)
    || !Array.isArray(value.targetIds)
    || value.targetIds.length === 0
    || value.targetIds.length > MAX_TARGETS
    || typeof value.rulesYaml !== "string"
    || value.rulesYaml.length > KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH) return undefined;
  const ids = new Set<string>();
  for (const candidate of value.targetIds) {
    if (typeof candidate !== "string"
      || candidate.length === 0
      || candidate.length > MAX_ID_LENGTH
      || ids.has(candidate)) return undefined;
    ids.add(candidate);
  }
  return Object.freeze({
    modeId: value.modeId as KtcAutoBuildCleanupModeId,
    targetIds: Object.freeze([...ids]),
    rulesYaml: value.rulesYaml,
  });
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
