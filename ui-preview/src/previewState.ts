export interface PreviewHostVisibility {
  readonly primary: boolean;
  readonly editor: boolean;
  readonly splitter: boolean;
}

export function resolvePreviewHostVisibility(primaryVisible: boolean): PreviewHostVisibility {
  return {
    primary: primaryVisible,
    editor: true,
    splitter: primaryVisible,
  };
}

export function describePrimaryVisibilityAction(nextVisible: boolean): string {
  return nextVisible ? "显示 Primary" : "隐藏 Primary";
}

export interface PreviewGroupNavigationResolution {
  readonly activateToolId: string;
  readonly surfaceToolId: string;
}

/** A group may restore an open leaf, but the group itself never becomes a surface. */
export function resolvePreviewGroupNavigation(
  currentSurfaceToolId: string,
  activeOpenLeafToolId: string,
  latestOpenLeafToolId: string,
): PreviewGroupNavigationResolution {
  const activateToolId = activeOpenLeafToolId || latestOpenLeafToolId;
  return Object.freeze({
    activateToolId,
    surfaceToolId: activateToolId || currentSurfaceToolId,
  });
}

export function touchMruItem(
  itemIds: readonly string[],
  itemId: string,
): string[] {
  return [...itemIds.filter((candidate) => candidate !== itemId), itemId];
}

export function removeMruItem(
  itemIds: readonly string[],
  itemId: string,
): string[] {
  return itemIds.filter((candidate) => candidate !== itemId);
}

export function findLatestMruItem<T extends { readonly id: string }>(
  items: readonly T[],
  mruItemIds: readonly string[],
  predicate: (item: T) => boolean = () => true,
): T | undefined {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  for (let index = mruItemIds.length - 1; index >= 0; index -= 1) {
    const item = itemsById.get(mruItemIds[index]!);
    if (item && predicate(item)) return item;
  }
  return undefined;
}
