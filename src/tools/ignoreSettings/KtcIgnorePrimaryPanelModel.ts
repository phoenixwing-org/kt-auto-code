import { ktcNormalizeIgnoreRule, type KtcIgnoreRuleAction, type KtcIgnoreWriteTarget } from "../../core/ignoreManagerModel.js";
import { KTC_IGNORE_PRESETS, type KtcIgnorePresetId } from "../../core/ignorePresets.js";
import type { KtcIgnoreGroupRecommendation } from "../../core/ignoreRecommendation.js";
import type { KtcIgnoreRecommendationReport } from "../../ignoreRecommendationTypes.js";
import type { IgnoreConfigSummary, IgnoreMergedRuleSummary, IgnoreTargetSummary } from "../types.js";

export type KtcIgnoreSourceId = "builtIn" | "git" | "custom";
export type KtcIgnorePanelSectionId = "sources" | "builtIn" | "effective" | "recommendations";
export type KtcIgnoreRuleScope = "preset" | "recommendation";

export interface KtcIgnoreSourceSelection {
  readonly builtIn: boolean;
  readonly git: boolean;
  readonly custom: boolean;
}

/** Host-supplied data only; UI expansion and rule selection stay in the component reducer. */
export interface KtcIgnorePrimaryPanelModel {
  readonly config?: IgnoreConfigSummary;
  readonly recommendations?: KtcIgnoreRecommendationReport;
  readonly sourceEnabled?: Partial<KtcIgnoreSourceSelection>;
  readonly selectedTarget?: KtcIgnoreWriteTarget;
  readonly running?: boolean;
  readonly message?: string;
}

export interface KtcIgnorePrimaryPanelState {
  readonly selectedTarget: KtcIgnoreWriteTarget;
  /** Automatic follows Git-first for each directory; explicit preserves the user's target within that directory. */
  readonly targetSelectionMode: "automatic" | "explicit";
  readonly explicitTarget: KtcIgnoreWriteTarget | undefined;
  readonly targetContextKey: string;
  readonly openSections: readonly KtcIgnorePanelSectionId[];
  readonly openPresetIds: readonly KtcIgnorePresetId[];
  readonly openRecommendationIds: readonly string[];
  readonly selectedPresetRuleKeys: readonly string[];
  readonly selectedRecommendationRuleKeys: readonly string[];
  readonly recommendationSignature: string;
}

export type KtcIgnorePrimaryPanelStateAction =
  | { readonly type: "selectTarget"; readonly target: KtcIgnoreWriteTarget }
  | { readonly type: "setSectionOpen"; readonly section: KtcIgnorePanelSectionId; readonly open: boolean }
  | { readonly type: "setPresetOpen"; readonly presetId: KtcIgnorePresetId; readonly open: boolean }
  | { readonly type: "setRecommendationOpen"; readonly groupId: string; readonly open: boolean }
  | {
      readonly type: "setRuleSelected";
      readonly scope: KtcIgnoreRuleScope;
      readonly ruleKey: string;
      readonly selected: boolean;
    };

export type KtcIgnoreRulePresence = "missing" | "git" | "phoenix" | "both" | "blocked";

export interface KtcIgnoreTargetViewModel extends IgnoreTargetSummary {
  readonly selected: boolean;
  readonly statusText: string;
}

export interface KtcIgnoreRuleViewModel {
  readonly key: string;
  readonly value: string;
  readonly description?: string;
  readonly sources: readonly KtcIgnoreWriteTarget[];
  readonly presence: KtcIgnoreRulePresence;
  readonly statusLabel: string;
  readonly selected: boolean;
  readonly canAppend: boolean;
  readonly canRemove: boolean;
  readonly blocked: boolean;
  readonly reviewRequired: boolean;
  readonly trackedPaths: readonly string[];
}

export interface KtcIgnorePresetViewModel {
  readonly id: KtcIgnorePresetId;
  readonly title: string;
  readonly description: string;
  readonly open: boolean;
  readonly rules: readonly KtcIgnoreRuleViewModel[];
  readonly actionableCount: number;
}

export interface KtcIgnoreRecommendationViewModel {
  readonly groupId: string;
  readonly title: string;
  readonly description: string;
  readonly confidenceLabel: "高" | "中" | "低";
  readonly reviewRequired: boolean;
  readonly open: boolean;
  readonly rules: readonly KtcIgnoreRuleViewModel[];
  readonly appendCount: number;
  readonly existingCount: number;
  readonly blockedCount: number;
  readonly secondLine: string;
  readonly evidenceText: string;
}

export interface KtcIgnorePrimaryPanelViewModel {
  readonly hasWorkspace: boolean;
  readonly running: boolean;
  readonly message: string;
  readonly sourceEnabled: KtcIgnoreSourceSelection;
  readonly selectedTarget: KtcIgnoreWriteTarget;
  readonly targets: readonly KtcIgnoreTargetViewModel[];
  readonly openSections: Readonly<Record<KtcIgnorePanelSectionId, boolean>>;
  readonly presets: readonly KtcIgnorePresetViewModel[];
  /** Host-owned built-in directory rules; intentionally separate from editable Git/Phoenix rules. */
  readonly builtInRules: readonly string[];
  readonly builtInRuleCount: number;
  readonly effectiveRules: readonly IgnoreMergedRuleSummary[];
  readonly recommendations?: KtcIgnoreRecommendationReport;
  readonly recommendationGroups: readonly KtcIgnoreRecommendationViewModel[];
}

const DEFAULT_SOURCE_SELECTION: KtcIgnoreSourceSelection = {
  builtIn: true,
  git: true,
  custom: false,
};

const DEFAULT_OPEN_SECTIONS: readonly KtcIgnorePanelSectionId[] = ["sources", "recommendations"];

export function ktcCreateIgnorePrimaryPanelState(
  model?: KtcIgnorePrimaryPanelModel,
): KtcIgnorePrimaryPanelState {
  const recommendationSignature = ktcIgnoreRecommendationSignature(model?.recommendations);
  const explicitTarget = model?.selectedTarget && targetAvailable(model.config, model.selectedTarget)
    ? model.selectedTarget
    : undefined;
  return {
    selectedTarget: explicitTarget ?? preferredTarget(model),
    targetSelectionMode: explicitTarget ? "explicit" : "automatic",
    explicitTarget,
    targetContextKey: targetContextKey(model),
    openSections: DEFAULT_OPEN_SECTIONS,
    openPresetIds: [],
    openRecommendationIds: [],
    selectedPresetRuleKeys: [],
    selectedRecommendationRuleKeys: defaultRecommendationRuleKeys(model?.recommendations),
    recommendationSignature,
  };
}

/** Keeps transient choices while removing stale rules and falling back from an unavailable target. */
export function ktcReconcileIgnorePrimaryPanelState(
  state: KtcIgnorePrimaryPanelState,
  model?: KtcIgnorePrimaryPanelModel,
): KtcIgnorePrimaryPanelState {
  const recommendationSignature = ktcIgnoreRecommendationSignature(model?.recommendations);
  const recommendationChanged = recommendationSignature !== state.recommendationSignature;
  const presetKeys = new Set(KTC_IGNORE_PRESETS.flatMap((preset) => preset.rules.map(ruleKey)).filter(Boolean));
  const recommendationKeys = new Set(recommendationRuleValues(model?.recommendations).map(ruleKey).filter(Boolean));
  const nextContextKey = targetContextKey(model);
  const contextChanged = nextContextKey !== state.targetContextKey;
  const modelExplicitTarget = model?.selectedTarget && targetAvailable(model.config, model.selectedTarget)
    ? model.selectedTarget
    : undefined;
  const explicitTarget = contextChanged
    ? modelExplicitTarget
    : state.targetSelectionMode === "explicit" ? (state.explicitTarget ?? state.selectedTarget) : undefined;
  const targetSelectionMode = explicitTarget ? "explicit" as const : "automatic" as const;
  const selectedTarget = explicitTarget && targetAvailable(model?.config, explicitTarget)
    ? explicitTarget
    : preferredTarget(model);
  return {
    ...state,
    selectedTarget,
    targetSelectionMode,
    explicitTarget,
    targetContextKey: nextContextKey,
    openPresetIds: state.openPresetIds.filter((id) => KTC_IGNORE_PRESETS.some((preset) => preset.id === id)),
    openRecommendationIds: recommendationChanged
      ? []
      : state.openRecommendationIds.filter((id) => model?.recommendations?.recommendations.some((group) => group.groupId === id)),
    selectedPresetRuleKeys: state.selectedPresetRuleKeys.filter((key) => presetKeys.has(key)),
    selectedRecommendationRuleKeys: recommendationChanged
      ? defaultRecommendationRuleKeys(model?.recommendations)
      : state.selectedRecommendationRuleKeys.filter((key) => recommendationKeys.has(key)),
    recommendationSignature,
  };
}

export function ktcReduceIgnorePrimaryPanelState(
  state: KtcIgnorePrimaryPanelState,
  action: KtcIgnorePrimaryPanelStateAction,
): KtcIgnorePrimaryPanelState {
  switch (action.type) {
    case "selectTarget":
      return {
        ...state,
        selectedTarget: action.target,
        targetSelectionMode: "explicit",
        explicitTarget: action.target,
      };
    case "setSectionOpen":
      return { ...state, openSections: setMembership(state.openSections, action.section, action.open) };
    case "setPresetOpen":
      return { ...state, openPresetIds: setMembership(state.openPresetIds, action.presetId, action.open) };
    case "setRecommendationOpen":
      return { ...state, openRecommendationIds: setMembership(state.openRecommendationIds, action.groupId, action.open) };
    case "setRuleSelected": {
      const key = action.scope === "preset" ? "selectedPresetRuleKeys" : "selectedRecommendationRuleKeys";
      return { ...state, [key]: setMembership(state[key], action.ruleKey, action.selected) };
    }
  }
}

export function ktcBuildIgnorePrimaryPanelViewModel(
  model: KtcIgnorePrimaryPanelModel | undefined,
  state: KtcIgnorePrimaryPanelState,
): KtcIgnorePrimaryPanelViewModel {
  const config = model?.config;
  const selectedTarget = state.selectedTarget;
  const target = targetSummary(config, selectedTarget);
  const effectiveByKey = new Map((config?.mergedRules ?? []).map((rule) => [rule.normalizedValue, rule]));
  const presets = KTC_IGNORE_PRESETS.map((preset) => {
    const rules = preset.rules.map((value) => buildRuleView({
      value,
      selectedKeys: state.selectedPresetRuleKeys,
      selectedTarget,
      targetAvailable: target.available,
      effectiveByKey,
    }));
    return {
      id: preset.id,
      title: preset.title,
      description: preset.description,
      open: state.openPresetIds.includes(preset.id),
      rules,
      actionableCount: rules.filter((rule) => rule.canAppend || rule.canRemove).length,
    };
  });
  const recommendationGroups = (model?.recommendations?.recommendations ?? []).map((group) =>
    recommendationView(group, state, selectedTarget, target.available, effectiveByKey));
  const builtInRuleValues = builtInRules(config);
  return {
    hasWorkspace: !!config,
    running: model?.running === true,
    message: model?.message ?? config?.statusText ?? "请先打开工作区文件夹。",
    sourceEnabled: { ...DEFAULT_SOURCE_SELECTION, ...model?.sourceEnabled },
    selectedTarget,
    targets: (["git", "phoenix"] as const).map((candidate) => targetView(config, candidate, selectedTarget)),
    openSections: {
      sources: state.openSections.includes("sources"),
      builtIn: state.openSections.includes("builtIn"),
      effective: state.openSections.includes("effective"),
      recommendations: state.openSections.includes("recommendations"),
    },
    presets,
    builtInRules: builtInRuleValues,
    builtInRuleCount: builtInRuleValues.length || config?.builtInPatternCount || 0,
    effectiveRules: config?.mergedRules ?? [],
    recommendations: model?.recommendations,
    recommendationGroups,
  };
}

/** Stable, de-duplicated rule values selected for one concrete mutation. */
export function ktcSelectedIgnoreRules(
  view: KtcIgnorePrimaryPanelViewModel,
  scope: KtcIgnoreRuleScope,
  action: KtcIgnoreRuleAction,
): readonly string[] {
  const groups = scope === "preset" ? view.presets : view.recommendationGroups;
  const result = new Map<string, string>();
  for (const group of groups) {
    for (const rule of group.rules) {
      const actionable = action === "append" ? rule.canAppend : rule.canRemove;
      if (rule.selected && actionable && !result.has(rule.key)) result.set(rule.key, rule.value);
    }
  }
  return [...result.values()];
}

export function ktcIgnoreRecommendationSignature(report?: KtcIgnoreRecommendationReport): string {
  if (!report) return "";
  return JSON.stringify({
    workspace: report.workspace,
    catalogError: report.catalogError ?? "",
    groups: report.recommendations.map((group) => ({
      id: group.groupId,
      suggested: group.suggestedRules.map((rule) => rule.value),
      existing: group.existingRules.map((rule) => rule.value),
      blocked: group.blockedRules.map((item) => item.rule.value),
    })),
  });
}

function recommendationView(
  group: KtcIgnoreGroupRecommendation,
  state: KtcIgnorePrimaryPanelState,
  selectedTarget: KtcIgnoreWriteTarget,
  available: boolean,
  effectiveByKey: ReadonlyMap<string, IgnoreMergedRuleSummary>,
): KtcIgnoreRecommendationViewModel {
  const rules = recommendationRules(group).map((rule) => buildRuleView({
    ...rule,
    selectedKeys: state.selectedRecommendationRuleKeys,
    selectedTarget,
    targetAvailable: available,
    effectiveByKey,
    reviewRequired: group.reviewRequired,
  }));
  const appendCount = rules.filter((rule) => rule.canAppend).length;
  const existingCount = rules.filter((rule) => rule.sources.length > 0).length;
  const blockedCount = rules.filter((rule) => rule.blocked && rule.sources.length === 0).length;
  const preview = rules.slice(0, 4).map((rule) => rule.value).join(" · ");
  return {
    groupId: group.groupId,
    title: group.title,
    description: group.description,
    confidenceLabel: group.confidence === "high" ? "高" : group.confidence === "medium" ? "中" : "低",
    reviewRequired: group.reviewRequired,
    open: state.openRecommendationIds.includes(group.groupId),
    rules,
    appendCount,
    existingCount,
    blockedCount,
    secondLine: [group.description, preview].filter(Boolean).join(" · "),
    evidenceText: group.evidence.map((evidence) => evidence.label).join("；"),
  };
}

function recommendationRules(group: KtcIgnoreGroupRecommendation): readonly {
  value: string;
  description?: string;
  blocked?: boolean;
  trackedPaths?: readonly string[];
}[] {
  const result = new Map<string, {
    value: string;
    description?: string;
    blocked?: boolean;
    trackedPaths?: readonly string[];
  }>();
  for (const rule of [...group.suggestedRules, ...group.existingRules]) {
    const key = ruleKey(rule.value);
    if (key && !result.has(key)) result.set(key, { value: rule.value, description: rule.description });
  }
  for (const item of group.blockedRules) {
    const key = ruleKey(item.rule.value);
    if (key) result.set(key, {
      value: item.rule.value,
      description: item.rule.description,
      blocked: true,
      trackedPaths: item.trackedPaths,
    });
  }
  return [...result.values()];
}

function buildRuleView(input: {
  readonly value: string;
  readonly description?: string;
  readonly blocked?: boolean;
  readonly trackedPaths?: readonly string[];
  readonly reviewRequired?: boolean;
  readonly selectedKeys: readonly string[];
  readonly selectedTarget: KtcIgnoreWriteTarget;
  readonly targetAvailable: boolean;
  readonly effectiveByKey: ReadonlyMap<string, IgnoreMergedRuleSummary>;
}): KtcIgnoreRuleViewModel {
  const normalized = ktcNormalizeIgnoreRule(input.value);
  const key = normalized?.identity ?? input.value;
  const effective = input.effectiveByKey.get(key);
  const sources = effective?.sources ?? [];
  const targetPresent = effective?.presentIn[input.selectedTarget] === true;
  const git = effective?.presentIn.git === true;
  const phoenix = effective?.presentIn.phoenix === true;
  const presence: KtcIgnoreRulePresence = input.blocked && sources.length === 0
    ? "blocked"
    : git && phoenix ? "both" : git ? "git" : phoenix ? "phoenix" : "missing";
  const canRemove = input.targetAvailable && targetPresent;
  // A rule present in the other source can still be copied to the selected write target.
  const canAppend = input.targetAvailable && !input.blocked && !targetPresent;
  return {
    key,
    value: normalized?.value ?? input.value,
    description: input.description,
    sources,
    presence,
    statusLabel: ruleStatusLabel(presence, input.selectedTarget, targetPresent),
    selected: input.selectedKeys.includes(key) && (canAppend || canRemove),
    canAppend,
    canRemove,
    blocked: input.blocked === true,
    reviewRequired: input.reviewRequired === true,
    trackedPaths: input.trackedPaths ?? [],
  };
}

function ruleStatusLabel(
  presence: KtcIgnoreRulePresence,
  selectedTarget: KtcIgnoreWriteTarget,
  targetPresent: boolean,
): string {
  if (presence === "blocked") return "命中 Git 跟踪文件";
  if (presence === "missing") return "可添加";
  if (presence === "both") return targetPresent ? "Git + Phoenix · 可从当前目标去除" : "Git + Phoenix";
  const sourceLabel = presence === "git" ? "Git" : "Phoenix";
  const targetLabel = selectedTarget === "git" ? "Git" : "Phoenix";
  return targetPresent ? `${sourceLabel} 已有 · 可去除` : `${sourceLabel} 已有 · 可添加到 ${targetLabel}`;
}

function targetView(
  config: IgnoreConfigSummary | undefined,
  target: KtcIgnoreWriteTarget,
  selectedTarget: KtcIgnoreWriteTarget,
): KtcIgnoreTargetViewModel {
  const summary = targetSummary(config, target);
  const state = !summary.available
    ? "不可用"
    : summary.dirty ? `${summary.patternCount} 条 · 未保存`
      : summary.exists ? `${summary.patternCount} 条`
        : "将在首次添加规则时创建";
  return { ...summary, selected: target === selectedTarget, statusText: state };
}

function targetSummary(config: IgnoreConfigSummary | undefined, target: KtcIgnoreWriteTarget): IgnoreTargetSummary {
  const found = config?.targets.find((candidate) => candidate.target === target);
  if (found) return found;
  return {
    target,
    label: target === "git" ? "Git .gitignore" : "Phoenix .ignore",
    relativePath: target === "git" ? ".gitignore" : ".phoenix/.ignore",
    exists: false,
    available: target === "phoenix" && !!config,
    dirty: false,
    patternCount: 0,
  };
}

function preferredTarget(model?: KtcIgnorePrimaryPanelModel): KtcIgnoreWriteTarget {
  if (model?.selectedTarget && targetAvailable(model.config, model.selectedTarget)) return model.selectedTarget;
  if (targetAvailable(model?.config, "git")) return "git";
  if (targetAvailable(model?.config, "phoenix")) return "phoenix";
  return model?.selectedTarget ?? "git";
}

function targetAvailable(config: IgnoreConfigSummary | undefined, target: KtcIgnoreWriteTarget): boolean {
  return targetSummary(config, target).available;
}

function targetContextKey(model?: KtcIgnorePrimaryPanelModel): string {
  if (!model?.config) return "";
  return model.config.targets
    .map((target) => `${target.target}:${target.fullPath ?? ""}`)
    .join("|");
}

function builtInRules(config: IgnoreConfigSummary | undefined): readonly string[] {
  const patterns = config?.builtInPatterns ?? [];
  const result = new Map<string, string>();
  for (const pattern of patterns) {
    const normalized = ktcNormalizeIgnoreRule(pattern);
    if (normalized && !result.has(normalized.identity)) result.set(normalized.identity, normalized.value);
  }
  return [...result.values()];
}

function defaultRecommendationRuleKeys(report?: KtcIgnoreRecommendationReport): readonly string[] {
  const group = report?.recommendations.find((candidate) =>
    candidate.defaultSelected && !candidate.reviewRequired && candidate.suggestedRules.length > 0);
  return group ? [...new Set(group.suggestedRules.map((rule) => ruleKey(rule.value)).filter(Boolean))] : [];
}

function recommendationRuleValues(report?: KtcIgnoreRecommendationReport): readonly string[] {
  return report?.recommendations.flatMap((group) => [
    ...group.suggestedRules.map((rule) => rule.value),
    ...group.existingRules.map((rule) => rule.value),
    ...group.blockedRules.map((item) => item.rule.value),
  ]) ?? [];
}

function ruleKey(value: string): string {
  return ktcNormalizeIgnoreRule(value)?.identity ?? "";
}

function setMembership<T>(values: readonly T[], value: T, present: boolean): readonly T[] {
  if (present) return values.includes(value) ? values : [...values, value];
  return values.filter((candidate) => candidate !== value);
}
