import {
  PNW_CODE_UUID_RESULTS_ACTION,
  PnwCodeUuidResultsPanel,
  pnwCodeDefineUuidResultsPanel,
} from "@phoenix-wing/code-core/ui";

export const KTC_UUID_RESULTS_PANEL_TAG = "ktc-uuid-results-panel";
export const KTC_UUID_RESULTS_ACTION = PNW_CODE_UUID_RESULTS_ACTION;
export { PnwCodeUuidResultsPanel as KtcUuidResultsPanel };
export type {
  PnwCodeUuidResultsActionDetail as KtcUuidResultsActionDetail,
  PnwCodeUuidResultsPanelModel as KtcUuidResultsPanelModel,
} from "@phoenix-wing/code-core/ui";

/** 兼容插件既有 ktc tag；结果 DOM、状态标签与交互协议全部来自 Wing。 */
export function ktcDefineUuidResultsPanel(
  tagName = KTC_UUID_RESULTS_PANEL_TAG,
): typeof PnwCodeUuidResultsPanel {
  return pnwCodeDefineUuidResultsPanel(tagName);
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-uuid-results-panel": PnwCodeUuidResultsPanel;
  }
}
