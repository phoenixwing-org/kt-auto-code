import type { KtcIgnorePolicyBlockModel } from "../ui/KtcIgnorePolicyBlock.js";
import type { KtcEditorPrimaryCompanionAction } from "./editorPrimaryCompanionContracts.js";

export const KTC_PACKAGE_INCLUDES_PATH_MAX_LENGTH = 4096;
export const KTC_PACKAGE_INCLUDES_PRIMARY_ACTION_IDS = [
  "preview", "reveal", "openEnvironment", "pickEnvironmentPackageDirectory", "pickPackageDirectory", "updateDraft",
] as const;
export type KtcPackageIncludesPrimaryActionId = typeof KTC_PACKAGE_INCLUDES_PRIMARY_ACTION_IDS[number];
export interface KtcPackageIncludesDirectoryDraft {
  readonly packageDirectory: string;
  readonly targetDirectory: string;
}
export function ktcIsPackageIncludesDirectoryDraft(value: unknown): value is KtcPackageIncludesDirectoryDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return Object.keys(draft).every((key) => key === "packageDirectory" || key === "targetDirectory")
    && [draft.packageDirectory, draft.targetDirectory].every((path) => typeof path === "string"
      && path.length <= KTC_PACKAGE_INCLUDES_PATH_MAX_LENGTH && !/[\0\r\n]/u.test(path));
}

/** Trusted, serializable projection; never arbitrary Controller error text. */
export interface KtcPackageIncludesPrimaryViewModel extends KtcPackageIncludesDirectoryDraft {
  readonly busy: boolean;
  readonly packageDirectoryExists: boolean;
  readonly targetDirectoryExists: boolean;
  readonly scanStatus: string;
  readonly summary: readonly { readonly label: string; readonly value: string }[];
  readonly ignore: KtcIgnorePolicyBlockModel;
}
export interface KtcPackageIncludesPrimaryPanelModel extends KtcPackageIncludesPrimaryViewModel {
  readonly sessionId: string;
  readonly revision: number;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly actions: readonly KtcEditorPrimaryCompanionAction[];
}
export type KtcPackageIncludesPrimaryActionDetail =
  | { readonly actionId: "updateDraft"; readonly payload: KtcPackageIncludesDirectoryDraft }
  | { readonly actionId: Exclude<KtcPackageIncludesPrimaryActionId, "updateDraft"> };
