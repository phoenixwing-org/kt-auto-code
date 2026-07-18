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

export type KtcCodegenControlGroupId = "cpp" | "qt" | "caa";

/** Tree 只采用这一层固定显示分组；不得用分组顺序改写 Host blockKeys。 */
export const KTC_CODEGEN_CONTROL_GROUPS = [
  { id: "cpp", label: "C++" },
  { id: "qt", label: "Qt" },
  { id: "caa", label: "CAA" },
] as const satisfies readonly {
  readonly id: KtcCodegenControlGroupId;
  readonly label: string;
}[];

export interface KtcCodegenControlGroup {
  readonly id: KtcCodegenControlGroupId;
  readonly label: string;
  readonly blocks: readonly KtcCodegenControlBlockViewModel[];
}

export interface KtcCodegenControlVisibleSelectionState {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly disabled: boolean;
  readonly selectedCount: number;
  readonly visibleCount: number;
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

/**
 * 把 legacyId 全局目录投影为固定一层 Tree。组内仍按 legacyId，deprecated 不过滤。
 * 此函数只服务显示；调用方输出时必须继续使用未分组的 canonical 顺序。
 */
export function ktcGroupCodegenControlBlocks(
  blocks: readonly KtcCodegenControlBlockViewModel[],
): readonly KtcCodegenControlGroup[] {
  const canonical = [...blocks].sort((left, right) => left.legacyId - right.legacyId);
  return KTC_CODEGEN_CONTROL_GROUPS.map((group) => ({
    ...group,
    blocks: canonical.filter((block) => block.platform === group.id),
  }));
}

/** 组 checkbox 只描述当前组合筛选可见项，不把隐藏项计入三态。 */
export function ktcCodegenControlVisibleSelectionState(
  visibleBlockKeys: readonly KtCodegenBlockKey[],
  selectedBlockKeys: readonly KtCodegenBlockKey[],
): KtcCodegenControlVisibleSelectionState {
  const visible = new Set(visibleBlockKeys);
  const selected = new Set(selectedBlockKeys);
  let selectedCount = 0;
  for (const key of visible) if (selected.has(key)) selectedCount += 1;
  const visibleCount = visible.size;
  return {
    checked: visibleCount > 0 && selectedCount === visibleCount,
    indeterminate: selectedCount > 0 && selectedCount < visibleCount,
    disabled: visibleCount === 0,
    selectedCount,
    visibleCount,
  };
}

/**
 * 批量勾选/取消仅作用于当前可见 key；结果始终恢复 canonical legacyId 顺序。
 * 批量勾选会退出单选模式，和现有“选中当前筛选”语义一致；取消不改变模式。
 */
export function ktcNextCodegenControlVisibleSelection(
  current: KtcCodegenControlCatalogSelection,
  visibleBlockKeys: readonly KtCodegenBlockKey[],
  checked: boolean,
  canonicalBlockKeys: readonly KtCodegenBlockKey[],
): KtcCodegenControlCatalogSelection {
  const selected = new Set(current.blockKeys);
  for (const key of visibleBlockKeys) {
    if (checked) selected.add(key);
    else selected.delete(key);
  }
  return {
    blockKeys: canonicalBlockKeys.filter((key) => selected.has(key)),
    singleMode: checked ? false : current.singleMode,
  };
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
