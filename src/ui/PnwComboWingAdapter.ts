import * as PnwCodeCoreUiImport from "@phoenix-wing/code-core/ui";

export const PNW_COMBO_TAG = "pnw-combo";
export const PNW_COMBO_ACTION = "pnw-combo-action";

export interface PnwComboItem {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly title?: string;
  readonly removable: boolean;
  readonly removeDisabledReason?: string;
}

export interface PnwComboModel {
  readonly ariaLabel: string;
  readonly placeholder: string;
  readonly emptyText: string;
  readonly items: readonly PnwComboItem[];
  readonly selectedId?: string;
  readonly disabled: boolean;
  readonly disabledReason?: string;
  readonly clearEnabled: boolean;
  readonly clearLabel: string;
  readonly clearDisabledReason?: string;
}

export type PnwComboActionDetail =
  | { readonly kind: "select"; readonly itemId: string }
  | { readonly kind: "remove"; readonly itemId: string }
  | { readonly kind: "clear" };

export interface PnwComboElement extends HTMLElement {
  model: PnwComboModel;
}

interface PnwComboConstructor {
  new (): PnwComboElement;
  readonly prototype: PnwComboElement;
}

interface PnwCodeCoreUiComboModule {
  readonly PnwCombo: PnwComboConstructor;
  pnwNormalizeComboModel(value?: PnwComboModel): PnwComboModel;
  pnwCodeDefineCombo(tagName?: string): void;
}

const PnwCodeCoreUi = PnwCodeCoreUiImport as unknown as PnwCodeCoreUiComboModule;

/** Compatibility export; behavior and styling are owned by Phoenix Wing. */
export const PnwCombo = PnwCodeCoreUi.PnwCombo;

export function normalizePnwComboModel(value: PnwComboModel | null | undefined): PnwComboModel {
  return PnwCodeCoreUi.pnwNormalizeComboModel(value ?? undefined);
}

export function pnwDefineCombo(tagName = PNW_COMBO_TAG): PnwComboConstructor {
  PnwCodeCoreUi.pnwCodeDefineCombo(tagName);
  return PnwCombo;
}

declare global {
  interface HTMLElementTagNameMap {
    "pnw-combo": PnwComboElement;
  }
}
