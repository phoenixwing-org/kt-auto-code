import type { KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";

export interface KtcCodegenControlCatalogSelection {
  readonly blockKeys: readonly KtCodegenBlockKey[];
  readonly singleMode: boolean;
}

/** Web Component 的纯选择状态转换；Host 收到事件后仍会做最终协议校验。 */
export function ktcNextCodegenControlSelection(
  current: KtcCodegenControlCatalogSelection,
  blockKey: KtCodegenBlockKey,
  checked: boolean,
): KtcCodegenControlCatalogSelection {
  const selected = new Set(current.blockKeys);
  if (checked && current.singleMode) selected.clear();
  if (checked) selected.add(blockKey);
  else selected.delete(blockKey);
  return { blockKeys: [...selected], singleMode: current.singleMode };
}

export function ktcToggleCodegenControlSingleMode(
  current: KtcCodegenControlCatalogSelection,
): KtcCodegenControlCatalogSelection {
  const singleMode = !current.singleMode;
  return {
    blockKeys: singleMode && current.blockKeys.length > 1 ? current.blockKeys.slice(0, 1) : current.blockKeys,
    singleMode,
  };
}
