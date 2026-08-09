import type { KtcModuleId } from "../modules/moduleState.js";

export interface KtcRibbonLayoutV1 {
  pinnedToolIds: string[];
  toolOrder: string[];
}

/** The small, Host-neutral part of a tool contribution needed by Ribbon layout. */
export interface KtcRibbonLayoutTool {
  readonly id: string;
  readonly moduleId?: KtcModuleId;
}

export type KtcRibbonToolPlacement = "before" | "after";

export type KtcRibbonLayoutMutationReason =
  | "unknown-tool"
  | "cross-module"
  | "unchanged";

export interface KtcRibbonLayoutMutationResult {
  readonly layout: KtcRibbonLayoutV1;
  readonly changed: boolean;
  readonly reason?: KtcRibbonLayoutMutationReason;
}

export const KTC_DEFAULT_CODE_RIBBON_TOOL_IDS = Object.freeze([
  "codeRename",
  "codegen",
  "reorderMembers",
  "run",
  "git",
  "uuidReplace",
  "headerAscii",
  "encodingFix",
] as const);

interface NormalizedTool {
  readonly id: string;
  readonly moduleId: KtcModuleId;
}

/**
 * Reconciles persisted layout with the current contribution catalog.
 *
 * A missing persisted value is a first-run layout. An existing empty layout is
 * intentional (the user may have unpinned everything), so it is not treated as
 * first run. Optional modules are pinned when their first tool IDs appear; a new
 * tool added later to an already-known module is only appended to the order.
 */
export function ktcNormalizeRibbonLayout(
  toolsInput: readonly KtcRibbonLayoutTool[],
  persisted?: unknown,
): KtcRibbonLayoutV1 {
  const tools = normalizeTools(toolsInput);
  const available = new Set(tools.map((tool) => tool.id));
  const value = isRecord(persisted) ? persisted : undefined;
  const persistedOrder = uniqueAvailableIds(value?.toolOrder, available);
  const persistedPinned = uniqueAvailableIds(value?.pinnedToolIds, available);
  const defaultCodeTools = new Set<string>(KTC_DEFAULT_CODE_RIBBON_TOOL_IDS);
  const knownToolIds = new Set(persistedOrder);
  const knownOptionalModules = new Set(
    tools
      .filter((tool) => tool.moduleId !== "code" && knownToolIds.has(tool.id))
      .map((tool) => tool.moduleId),
  );
  const catalogOrder = tools.map((tool) => tool.id);
  const defaultOrder = [
    ...KTC_DEFAULT_CODE_RIBBON_TOOL_IDS.filter((id) => available.has(id)),
    ...catalogOrder.filter((id) => !defaultCodeTools.has(id)),
  ];
  const toolOrder = value
    ? [...persistedOrder, ...catalogOrder.filter((id) => !knownToolIds.has(id))]
    : defaultOrder;

  const pinned = new Set(persistedPinned);
  if (!value) {
    for (const tool of tools) {
      if (tool.moduleId !== "code" || defaultCodeTools.has(tool.id)) pinned.add(tool.id);
    }
  } else {
    for (const tool of tools) {
      if (tool.moduleId !== "code" && !knownOptionalModules.has(tool.moduleId)) pinned.add(tool.id);
    }
  }

  return {
    pinnedToolIds: toolOrder.filter((id) => pinned.has(id)),
    toolOrder,
  };
}

export function ktcToggleRibbonToolPin(
  layoutInput: KtcRibbonLayoutV1,
  toolsInput: readonly KtcRibbonLayoutTool[],
  toolId: string,
): KtcRibbonLayoutMutationResult {
  const tools = normalizeTools(toolsInput);
  const tool = tools.find((candidate) => candidate.id === toolId);
  const layout = ktcNormalizeRibbonLayout(tools, layoutInput);
  if (!tool) return { layout, changed: false, reason: "unknown-tool" };

  const pinned = new Set(layout.pinnedToolIds);
  if (pinned.has(toolId)) pinned.delete(toolId);
  else pinned.add(toolId);
  return {
    layout: {
      pinnedToolIds: layout.toolOrder.filter((id) => pinned.has(id)),
      toolOrder: [...layout.toolOrder],
    },
    changed: true,
  };
}

export function ktcMoveRibbonTool(
  layoutInput: KtcRibbonLayoutV1,
  toolsInput: readonly KtcRibbonLayoutTool[],
  sourceId: string,
  targetId: string,
  placement: KtcRibbonToolPlacement,
): KtcRibbonLayoutMutationResult {
  const tools = normalizeTools(toolsInput);
  const byId = new Map(tools.map((tool) => [tool.id, tool]));
  const layout = ktcNormalizeRibbonLayout(tools, layoutInput);
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return { layout, changed: false, reason: "unknown-tool" };
  if (source.moduleId !== target.moduleId) {
    return { layout, changed: false, reason: "cross-module" };
  }
  if (sourceId === targetId) return { layout, changed: false, reason: "unchanged" };

  const nextOrder = layout.toolOrder.filter((id) => id !== sourceId);
  const targetIndex = nextOrder.indexOf(targetId);
  nextOrder.splice(targetIndex + (placement === "after" ? 1 : 0), 0, sourceId);
  if (sameItems(nextOrder, layout.toolOrder)) {
    return { layout, changed: false, reason: "unchanged" };
  }

  const pinned = new Set(layout.pinnedToolIds);
  return {
    layout: {
      pinnedToolIds: nextOrder.filter((id) => pinned.has(id)),
      toolOrder: nextOrder,
    },
    changed: true,
  };
}

function normalizeTools(tools: readonly KtcRibbonLayoutTool[]): NormalizedTool[] {
  const normalized: NormalizedTool[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!tool || typeof tool.id !== "string" || tool.id.length === 0 || seen.has(tool.id)) continue;
    seen.add(tool.id);
    normalized.push({ id: tool.id, moduleId: tool.moduleId ?? "code" });
  }
  return normalized;
}

function uniqueAvailableIds(value: unknown, available: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !available.has(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameItems(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
