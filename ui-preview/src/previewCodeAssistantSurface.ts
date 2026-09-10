import { createPreviewHeaderAsciiSurface, createPreviewEncodingFixSurface } from "./previewTextRepairSurface.js";
import { createPreviewReorderMembersSurface, createPreviewUuidReplaceSurface } from "./previewSelectionToolsSurface.js";
import { createPreviewCaaSurface } from "./previewCaaSurface.js";

interface PrimarySurface {
  createPrimary(): HTMLElement;
  directoryChanged(): void;
  dispose(): void;
}

/** Preview-only factory registry. Logical navigation never resets a tool's draft or result. */
export function createPreviewCodeAssistantSurfaces(options: {
  readonly directory: () => string;
  readonly log: (line: string) => void;
}) {
  const factories: Readonly<Record<string, () => PrimarySurface>> = {
    headerAscii: () => createPreviewHeaderAsciiSurface(options),
    encodingFix: () => createPreviewEncodingFixSurface(options),
    reorderMembers: () => createPreviewReorderMembersSurface(options),
    uuidReplace: () => createPreviewUuidReplaceSurface(options),
    caaDialog: () => createPreviewCaaSurface(options),
  };
  const surfaces = new Map<string, PrimarySurface>();
  function reset(): void {
    for (const surface of surfaces.values()) surface.dispose();
    surfaces.clear();
  }
  return {
    createPrimary(toolId: string): HTMLElement | undefined {
      if (!Object.hasOwn(factories, toolId)) return undefined;
      let surface = surfaces.get(toolId);
      if (!surface) { surface = factories[toolId]!(); surfaces.set(toolId, surface); }
      return surface.createPrimary();
    },
    directoryChanged(): void { for (const surface of surfaces.values()) surface.directoryChanged(); },
    reset,
    dispose: reset,
  };
}
