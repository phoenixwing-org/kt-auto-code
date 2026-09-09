export interface KtcToolSurfaceIntentInput {
  readonly requestedToolId: string;
  readonly activeToolId: string;
  readonly openToolIds: readonly string[];
  readonly source: "ribbon" | "menu";
  /** Legacy Webview state. Current Tool is now always expanded. */
  readonly collapsed: boolean;
}

export type KtcToolSurfaceIntent = { readonly kind: "activate"; readonly collapsed: false };

/**
 * Every Toolbar/Menu interaction is a logical Tool activation. The legacy
 * collapsed input is deliberately accepted but never restored or toggled.
 */
export function ktcResolveToolSurfaceIntent(
  _input: KtcToolSurfaceIntentInput,
): KtcToolSurfaceIntent {
  return { kind: "activate", collapsed: false };
}
