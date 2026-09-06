export const KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS = ["projectRename", "autoBuild"] as const;

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

/** Host-owned projection of one Editor session into the Primary Tool Surface. */
export interface KtcEditorPrimaryCompanionSnapshot {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  /** Monotonic within one session; Primary actions must echo this exact value. */
  readonly revision: number;
  readonly lifecycle: KtcEditorPrimaryCompanionLifecycle;
  readonly title: string;
  readonly status: KtcEditorPrimaryCompanionStatus;
  readonly message: string;
  readonly ready: boolean;
  readonly summary: readonly KtcEditorPrimaryCompanionSummaryItem[];
  readonly actions: readonly KtcEditorPrimaryCompanionAction[];
}

export interface KtcEditorPrimaryCompanionActionToken {
  readonly panelId: string;
  readonly toolId: KtcEditorPrimaryCompanionToolId;
  readonly sessionId: string;
  readonly revision: number;
  readonly actionId: string;
}
