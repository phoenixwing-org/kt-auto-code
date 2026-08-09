export interface KtcToolBlockCloseResult {
  readonly openToolIds: readonly string[];
  readonly nextToolId?: string;
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
