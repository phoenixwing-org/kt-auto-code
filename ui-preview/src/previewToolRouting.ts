import type { PreviewToolDescriptor } from "./previewToolCatalog.js";

export type PreviewPrimarySurfaceKind = "full" | "companion";
export type PreviewOpenItemKind = "primary" | "right";

export interface PreviewToolRoute {
  readonly primaryKind: PreviewPrimarySurfaceKind;
  readonly rightPanelId: string | null;
  readonly openItemKind: PreviewOpenItemKind;
}

/**
 * Projects one validated Tool descriptor into Host-neutral preview routing.
 * A Tool with a Right surface remains one logical open item whether its
 * required Primary surface is full or a companion.
 */
export function resolvePreviewToolRoute(
  descriptor: PreviewToolDescriptor,
): PreviewToolRoute {
  return Object.freeze({
    primaryKind: descriptor.surfaces.primary.kind,
    rightPanelId: descriptor.surfaces.right?.panelId ?? null,
    openItemKind: descriptor.surfaces.right ? "right" : "primary",
  });
}
