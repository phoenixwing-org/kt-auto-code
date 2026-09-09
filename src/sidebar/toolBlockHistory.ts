export interface KtcToolBlockCloseResult {
  readonly openToolIds: readonly string[];
  readonly nextToolId?: string;
}

export interface KtcNormalizedToolBlockHistory {
  readonly openToolIds: readonly string[];
  readonly activeToolId?: string;
}

/**
 * Reconciles persisted MRU state against Tool-surface ids. Group ids are kept
 * out by omitting them from `validToolIds`; an invalid active id falls back to
 * the most recently opened valid Tool, or to Welcome when no Tool remains.
 */
export function ktcNormalizeToolBlockHistory(
  openToolIds: readonly string[],
  activeToolId: string | undefined,
  validToolIds: ReadonlySet<string>,
): KtcNormalizedToolBlockHistory {
  const seen = new Set<string>();
  let normalized = openToolIds.filter((toolId) => {
    if (!toolId || !validToolIds.has(toolId) || seen.has(toolId)) return false;
    seen.add(toolId);
    return true;
  });
  const active = activeToolId && normalized.includes(activeToolId)
    ? activeToolId
    : normalized.at(-1);
  if (active) normalized = [...normalized.filter((toolId) => toolId !== active), active];
  return { openToolIds: normalized, activeToolId: active };
}

/** MRU order: the last id is the currently visible, most recently used Block. */
export function ktcActivateToolBlock(openToolIds: readonly string[], toolId: string): string[] {
  return [...openToolIds.filter((candidate) => candidate !== toolId), toolId];
}

/** Closes one logical Block and restores the most recently used remaining Block. */
export function ktcCloseToolBlock(openToolIds: readonly string[], toolId: string): KtcToolBlockCloseResult {
  const remaining = openToolIds.filter((candidate) => candidate !== toolId);
  return { openToolIds: remaining, nextToolId: remaining.at(-1) };
}

/** Keeps one open Block, makes it current, and closes every other logical Block. */
export function ktcCloseOtherToolBlocks(
  openToolIds: readonly string[],
  toolId: string,
): KtcToolBlockCloseResult {
  if (!openToolIds.includes(toolId)) {
    return { openToolIds: [...openToolIds], nextToolId: openToolIds.at(-1) };
  }
  return { openToolIds: [toolId], nextToolId: toolId };
}
