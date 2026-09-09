import type { KtcAutoBuildPrimaryViewModel } from "./autoBuildPrimaryContracts.js";
import type { KtcPackageIncludesPrimaryViewModel } from "./packageIncludesPrimaryContracts.js";

export const KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS = ["projectRename", "packageIncludes", "autoBuild"] as const;

export type KtcEditorPrimaryCompanionToolId = typeof KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS[number];

/**
 * `visible` means the Editor is rendered in a split group without owning focus.
 * `open-inactive` means it remains open but is not currently visible.
 */
export type KtcEditorPrimaryCompanionLifecycle =
  | "active"
  | "visible"
  | "open-inactive"
  | "disposed";

export type KtcEditorPrimaryCompanionStatus = "idle" | "running" | "done" | "error";

const KTC_EDITOR_PRIMARY_COMPANION_STATUS_MESSAGES: Readonly<
  Record<KtcEditorPrimaryCompanionStatus, string>
> = {
  idle: "等待操作。",
  running: "任务进行中。",
  done: "任务已完成。",
  error: "任务遇到问题；请在右侧 View 或 Output 中查看详情。",
};

/**
 * Projects an operation status into a short allowlisted Primary message.
 * Untrusted detail is accepted only to make the trust boundary explicit; it is
 * never copied into the companion snapshot.
 */
export function ktcEditorPrimaryCompanionStatusMessage(
  status: KtcEditorPrimaryCompanionStatus,
  _untrustedDetail?: unknown,
): string {
  return KTC_EDITOR_PRIMARY_COMPANION_STATUS_MESSAGES[status];
}

export interface KtcEditorPrimaryCompanionSummaryItem {
  readonly label: string;
  readonly value: string;
}

export interface KtcEditorPrimaryCompanionAction {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly tone?: "primary" | "secondary" | "danger";
  readonly disabledReason?: string;
}

export interface KtcProjectRenamePrimaryOption {
  readonly id: string;
  readonly label: string;
  readonly group: "当前项目方案" | "用户最近输入" | "共享档案";
}

export interface KtcProjectRenamePrimaryViewModel {
  /** Full trusted workspace path, retained for titles and action context. */
  readonly root: string;
  /** Compact display pair: `<rootName> @ <rootParent>`. */
  readonly rootName: string;
  readonly rootParent: string;
  readonly schemeOptions: readonly KtcProjectRenamePrimaryOption[];
  readonly selectedSchemeId?: string;
  readonly profileName: string;
  readonly profileError?: string;
  readonly overview?: {
    readonly items: number;
    readonly replacements: number;
    readonly lowRisk: number;
    readonly mediumRisk: number;
    readonly highRisk: number;
    readonly categories: number;
  };
  readonly rootRename?: {
    readonly sourcePath: string;
    readonly targetPath: string;
    readonly enabled: boolean;
    readonly disabledReason?: string;
  };
}

/** Host-owned projection of one Editor session into the Primary Tool Surface. */
export interface KtcEditorPrimaryCompanionSnapshot {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  /** Monotonic within one session; Primary actions must echo this exact value. */
  readonly revision: number;
  readonly lifecycle: KtcEditorPrimaryCompanionLifecycle;
  /** @deprecated Compatibility-only input. Host display copy is resolved from toolId registration. */
  readonly title?: string;
  readonly status: KtcEditorPrimaryCompanionStatus;
  readonly message: string;
  readonly ready: boolean;
  readonly summary: readonly KtcEditorPrimaryCompanionSummaryItem[];
  readonly actions: readonly KtcEditorPrimaryCompanionAction[];
  /** Optional typed projection for a dedicated Primary renderer. */
  readonly primary?:
    | { readonly kind: "autoBuild"; readonly model: KtcAutoBuildPrimaryViewModel }
    | { readonly kind: "packageIncludes"; readonly model: KtcPackageIncludesPrimaryViewModel }
    | { readonly kind: "projectRename"; readonly model: KtcProjectRenamePrimaryViewModel };
}

export interface KtcEditorPrimaryCompanionActionToken {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  readonly revision: number;
  readonly actionId: string;
  /** Optional bounded UI value; the receiving tool remains responsible for validation. */
  readonly value?: string;
  /** Optional structured UI value; the receiving tool must validate it before use. */
  readonly payload?: unknown;
}
