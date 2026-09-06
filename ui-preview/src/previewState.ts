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
