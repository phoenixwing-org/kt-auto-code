import type { KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlBlockViewModel } from "./controlViewModel.js";

export interface KtcCodegenControlCatalogSelection {
  readonly blockKeys: readonly KtCodegenBlockKey[];
  readonly singleMode: boolean;
}

export type KtcCodegenControlStatusFilter = "hit" | "missing" | "selected" | "all";
export type KtcCodegenControlScopeFilter = "all" | "cpp-only" | "field-code";

export interface KtcCodegenControlCatalogFilter {
  readonly status: KtcCodegenControlStatusFilter;
  readonly scope: KtcCodegenControlScopeFilter;
}

/** “看什么”只投影可见行，不修改 Preflight/Apply 的勾选范围。 */
export function ktcFilterCodegenControlBlocks(
  blocks: readonly KtcCodegenControlBlockViewModel[],
  selectedBlockKeys: readonly KtCodegenBlockKey[],
  filter: KtcCodegenControlCatalogFilter,
  scopes: {
    readonly cppOnly: readonly KtCodegenBlockKey[];
    readonly fieldCode: readonly KtCodegenBlockKey[];
  },
): readonly KtcCodegenControlBlockViewModel[] {
  const selected = new Set(selectedBlockKeys);
  const scoped = filter.scope === "cpp-only"
    ? new Set(scopes.cppOnly)
    : filter.scope === "field-code"
      ? new Set(scopes.fieldCode)
      : undefined;
  return blocks.filter((block) => {
    if (scoped && !scoped.has(block.key)) return false;
    if (filter.status === "all") return true;
    if (filter.status === "selected") return selected.has(block.key);
    return block.status === filter.status;
  });
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
