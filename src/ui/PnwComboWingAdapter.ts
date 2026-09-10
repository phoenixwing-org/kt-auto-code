import {
  PNW_COMBO_ACTION,
  PNW_COMBO_TAG,
  PnwCombo,
  pnwCodeDefineCombo,
  pnwNormalizeComboModel,
  type PnwComboModel,
} from "@phoenix-wing/code-core/ui";

/** Preserve Auto import names; Wing owns the model, events, runtime and styling. */
export { PNW_COMBO_ACTION, PNW_COMBO_TAG, PnwCombo };
export type { PnwComboActionDetail, PnwComboItem, PnwComboModel } from "@phoenix-wing/code-core/ui";
export type PnwComboElement = PnwCombo;

export function normalizePnwComboModel(value: PnwComboModel | null | undefined): PnwComboModel {
  return pnwNormalizeComboModel(value ?? undefined);
}

export function pnwDefineCombo(tagName = PNW_COMBO_TAG): typeof PnwCombo {
  return pnwCodeDefineCombo(tagName);
}
