export interface KtcToolSurfaceIntentInput {
  readonly requestedToolId: string;
  readonly activeToolId: string;
  readonly openToolIds: readonly string[];
  readonly source: "ribbon" | "menu";
  readonly collapsed: boolean;
}

export type KtcToolSurfaceIntent =
  | { readonly kind: "toggle"; readonly collapsed: boolean }
  | { readonly kind: "activate"; readonly collapsed: false };

/**
 * Keeps presentation-only collapse separate from logical Tool activation.
 * A repeated click on the current Ribbon entry never reaches the Host.
 */
export function ktcResolveToolSurfaceIntent(
  input: KtcToolSurfaceIntentInput,
): KtcToolSurfaceIntent {
  const repeatsCurrentRibbonTool = input.source === "ribbon"
    && input.requestedToolId === input.activeToolId
    && input.openToolIds.includes(input.requestedToolId);
  return repeatsCurrentRibbonTool
    ? { kind: "toggle", collapsed: !input.collapsed }
    : { kind: "activate", collapsed: false };
}
