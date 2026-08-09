import {
  KTC_CAA_RELATION_KINDS,
  ktcSuggestAssociatedReplacementRuleCandidates,
} from "../../core/associatedReplacementRules.js";
import type {
  KtcAssociatedRelationKind,
  KtcReplacementRuleDraft,
} from "../../core/associatedReplacementRules.js";
import type {
  KtcAssociatedRulePickerMode,
  KtcAssociatedRulePickerState,
} from "../types.js";

const KTC_ASSOCIATED_RULE_ITEMS: readonly {
  label: string;
  relationKind: KtcAssociatedRelationKind;
}[] = [
  { label: "空格写法", relationKind: "spaced" },
  { label: "前缀替换", relationKind: "prefix" },
  { label: "CAA I（完整名称）", relationKind: "caa-i-full" },
  { label: "CAA E（完整名称）", relationKind: "caa-e-full" },
  { label: "CAA I（末词段）", relationKind: "caa-i" },
  { label: "CAA E（末词段）", relationKind: "caa-e" },
];

export interface KtcAssociatedRulePickerOptions {
  mode: KtcAssociatedRulePickerMode;
  search: string;
  replace: string;
  sourcePrefix: string;
  targetPrefix: string;
  parentRule?: KtcReplacementRuleDraft;
  existingRules: readonly KtcReplacementRuleDraft[];
}

export function ktcCreateAssociatedRulePicker(
  options: KtcAssociatedRulePickerOptions,
): KtcAssociatedRulePickerState {
  const allKinds = KTC_ASSOCIATED_RULE_ITEMS.map((item) => item.relationKind);
  const relationKinds = options.mode === "common"
    ? allKinds.filter((kind) => kind === "spaced" || kind === "prefix")
    : options.mode === "caa"
      ? allKinds.filter((kind) => KTC_CAA_RELATION_KINDS.includes(kind))
      : allKinds;
  const parent = options.parentRule ?? {
    id: "primary",
    search: options.search,
    replace: options.replace,
  };
  const rules = ktcSuggestAssociatedReplacementRuleCandidates({
    relationKinds,
    parent,
    sourcePrefix: options.sourcePrefix,
    targetPrefix: options.targetPrefix,
    existingSearches: [options.search, ...options.existingRules.map((rule) => rule.search)],
  });

  const candidates = rules.map((rule) => ({
    id: rule.id,
    label: KTC_ASSOCIATED_RULE_ITEMS.find((item) => item.relationKind === rule.relationKind)?.label
      ?? "关联规则",
    rule,
    checked: options.mode === "common"
      || (options.mode === "caa"
        && (rule.relationKind === "caa-i-full" || rule.relationKind === "caa-e-full")),
  }));
  const defaultSelected = candidates.filter((candidate) => candidate.checked).length;
  return {
    title: options.mode === "common"
      ? "添加常用规则"
      : options.mode === "caa"
        ? "添加 CAA 规则"
        : options.mode === "row"
          ? "添加关联规则"
          : "添加自定义规则",
    summary: candidates.length > 0
      ? `${candidates.length} 条候选 · 默认选中 ${defaultSelected} 条`
      : "无推荐候选 · 可填写自定义规则",
    candidates,
  };
}
