import type { ToolUiState, WebviewInboundMessage } from "../tools/types.js";
import type {
  KtcCaaPrimaryActionDetail,
  KtcCaaPrimaryModel,
} from "../ui/KtcCaaPrimary.js";

export type KtcCaaPrimaryState = Pick<
  ToolUiState,
  "status" | "message" | "caaDialogResults" | "caaSettingsText" | "caaDeskConnection"
>;

export interface KtcCaaPrimaryAdapterInput {
  /** Current Host state for the CAA UI tool. Undefined means it has not run yet. */
  readonly state?: KtcCaaPrimaryState;
  /** Resolved current-tool directory. Empty/undefined keeps scanning and stale rows disabled. */
  readonly directory?: string;
}

/**
 * Projects Host-owned CAA state into the serialisable, Host-neutral Primary model.
 * It deliberately does not infer connection, filesystem or session validity.
 */
export function ktcCreateCaaPrimaryModel(
  input: KtcCaaPrimaryAdapterInput,
): KtcCaaPrimaryModel {
  const state = input.state;
  const hasDirectory = Boolean(input.directory?.trim());
  const hasResultSnapshot = Array.isArray(state?.caaDialogResults);
  return {
    running: state?.status === "running" || state?.caaDeskConnection?.status === "checking",
    canScan: hasDirectory,
    resultActionsEnabled: hasDirectory && hasResultSnapshot,
    message: state?.message ?? "",
    ...(state?.caaSettingsText
      ? { environmentText: `工程环境：${state.caaSettingsText}` }
      : {}),
    connection: state?.caaDeskConnection
      ? {
          status: state.caaDeskConnection.status,
          text: state.caaDeskConnection.text,
        }
      : { status: "unknown", text: "尚未检测 Desk Tools 连接" },
    ...(hasResultSnapshot
      ? {
          rows: state!.caaDialogResults!.map((row) => ({
            uri: row.uri,
            relativePath: row.relativePath,
            selected: row.selected,
          })),
        }
      : {}),
  };
}

/** Converts one shared component intent to the existing, business-owned Host protocol. */
export function ktcCaaPrimaryMessageForAction(
  detail: KtcCaaPrimaryActionDetail,
): WebviewInboundMessage {
  switch (detail.actionId) {
    case "scan":
      return { type: "run", toolId: "caaDialog", action: "scan" };
    case "settings":
      return { type: "run", toolId: "caaDialog", action: "fix" };
    case "checkConnection":
      return { type: "run", toolId: "caaDialog", action: "checkConnection" };
    case "open":
    case "openExternal":
      return {
        type: "caaDialogAction",
        toolId: "caaDialog",
        action: detail.actionId,
        uri: detail.uri,
      };
  }
}
