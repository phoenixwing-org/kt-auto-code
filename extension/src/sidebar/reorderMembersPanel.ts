import {
  PNW_CODE_REORDER_MEMBERS_PANEL_ACTION,
  PnwCodeReorderMembersPanel,
  pnwCodeDefineReorderMembersPanel,
} from "@phoenix-wing/code-core/ui";

export const KTC_REORDER_MEMBERS_PANEL_TAG = "ktc-reorder-members-panel";
export const KTC_REORDER_MEMBERS_PANEL_ACTION = PNW_CODE_REORDER_MEMBERS_PANEL_ACTION;
export { PnwCodeReorderMembersPanel as KtcReorderMembersPanel };
export type {
  PnwCodeReorderMembersPanelActionDetail as KtcReorderMembersPanelActionDetail,
} from "@phoenix-wing/code-core/ui";

/** 兼容既有 Webview tag；业务 DOM、状态和事件全部来自 Wing。 */
export function ktcDefineReorderMembersPanel(
  tagName = KTC_REORDER_MEMBERS_PANEL_TAG,
): typeof PnwCodeReorderMembersPanel {
  return pnwCodeDefineReorderMembersPanel(tagName);
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-reorder-members-panel": PnwCodeReorderMembersPanel;
  }
}
