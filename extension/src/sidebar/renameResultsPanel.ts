import {
  PNW_CODE_RENAME_RESULTS_ACTION,
  PnwCodeRenameResultsPanel,
  pnwCodeDefineRenameResultsPanel,
} from "@phoenix-wing/code-core/ui";

export const KTC_RENAME_RESULTS_PANEL_TAG = "ktc-rename-results-panel";
export const KTC_RENAME_RESULTS_ACTION = PNW_CODE_RENAME_RESULTS_ACTION;
export { PnwCodeRenameResultsPanel as KtcRenameResultsPanel };
export type {
  PnwCodeRenameResultsActionDetail as KtcRenameResultsActionDetail,
  PnwCodeRenameResultsPanelModel as KtcRenameResultsPanelModel,
} from "@phoenix-wing/code-core/ui";

/** 保留插件 tag；结果 DOM、状态、高亮和打开信号全部来自 Wing。 */
export function ktcDefineRenameResultsPanel(
  tagName = KTC_RENAME_RESULTS_PANEL_TAG,
): typeof PnwCodeRenameResultsPanel {
  return pnwCodeDefineRenameResultsPanel(tagName);
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-rename-results-panel": PnwCodeRenameResultsPanel;
  }
}
