import type { ReplacementRule } from "./replacementRules.js";

export type KtcAssociatedRelationKind =
  | "spaced"
  | "prefix"
  | "caa-i"
  | "caa-e"
  | "caa-i-full"
  | "caa-e-full";
export type KtcAssociatedRulePreset = "common" | "caa-tail" | "caa-full";

export const KTC_CAA_RELATION_KINDS: readonly KtcAssociatedRelationKind[] = [
  "caa-i",
  "caa-e",
  "caa-i-full",
  "caa-e-full",
];

export interface KtcAssociatedReplacementRule extends ReplacementRule {
  id: string;
  parentId: string;
  relationKind: KtcAssociatedRelationKind;
  source: "generated";
}

export interface KtcReplacementRuleDraft extends ReplacementRule {
  id: string;
  parentId?: string;
  relationKind?: KtcAssociatedRelationKind | "custom";
  source?: "generated" | "user";
}

export interface KtcAssociatedNameAnalysis {
  searchTokens: readonly string[];
  replaceTokens: readonly string[];
  confident: boolean;
}

export interface KtcAssociatedRuleSuggestion {
  analysis: KtcAssociatedNameAnalysis;
  rules: readonly KtcAssociatedReplacementRule[];
}

const legacyTemplateRules = new Map<string, Pick<ReplacementRule, "search" | "replace">>([
  ["ktce", { search: "KTCEAutoCode", replace: "KTCEAutoBuild" }],
  ["ktc", { search: "KTCAutoCode", replace: "KTCTomBuild" }],
  ["auto-space", { search: "Auto Code", replace: "Tom Build" }],
  ["auto", { search: "AutoCode", replace: "TomBuild" }],
]);

export function ktcSplitNameTokens(value: string): readonly string[] {
  return value.trim()
    .split(/\s+/)
    .flatMap((part) => part.match(/[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+/g) ?? [part])
    .filter(Boolean);
}

export function ktcSuggestAssociatedReplacementRules(
  search: string,
  replace: string,
  sourcePrefix = "",
  targetPrefix = sourcePrefix,
  preset: KtcAssociatedRulePreset = "common",
): KtcAssociatedRuleSuggestion {
  const searchTokens = ktcSplitNameTokens(search);
  const replaceTokens = ktcSplitNameTokens(replace);
  const parent = { id: "primary", search, replace, enabled: true };
  const relationKinds: readonly KtcAssociatedRelationKind[] = preset === "common"
    ? ["spaced", "prefix"]
    : preset === "caa-full"
      ? ["caa-i-full", "caa-e-full"]
      : ["caa-i", "caa-e"];
  const rules = relationKinds
    .map((kind) => ktcSuggestAssociatedReplacementRule(kind, parent, sourcePrefix, targetPrefix))
    .filter((rule): rule is KtcAssociatedReplacementRule => rule !== undefined);
  return {
    analysis: {
      searchTokens,
      replaceTokens,
      confident: searchTokens.length > 0 && replaceTokens.length > 0,
    },
    rules,
  };
}

export function ktcSuggestAssociatedReplacementRule(
  relationKind: KtcAssociatedRelationKind,
  parent: Pick<KtcReplacementRuleDraft, "id" | "search" | "replace" | "relationKind">,
  sourcePrefix = "",
  targetPrefix = sourcePrefix,
): KtcAssociatedReplacementRule | undefined {
  const search = parent.search.trim();
  const replace = parent.replace.trim();
  if (search === "" || replace === "") return undefined;

  const searchTokens = ktcSplitNameTokens(search);
  const replaceTokens = ktcSplitNameTokens(replace);
  let derivedSearch: string;
  let derivedReplace: string;

  if (relationKind === "spaced") {
    if (searchTokens.length < 2 || replaceTokens.length < 2) return undefined;
    derivedSearch = searchTokens.join(" ");
    derivedReplace = replaceTokens.join(" ");
  } else if (relationKind === "prefix") {
    if (sourcePrefix === "") return undefined;
    if (search.startsWith(sourcePrefix) && (targetPrefix === "" || replace.startsWith(targetPrefix))) {
      return undefined;
    }
    derivedSearch = `${sourcePrefix}${search}`;
    derivedReplace = `${targetPrefix}${replace}`;
  } else {
    if (sourcePrefix === "" || searchTokens.length < 2 || replaceTokens.length < 1) return undefined;
    if (parent.relationKind?.startsWith("caa-")) return undefined;
    const infix = relationKind === "caa-i" || relationKind === "caa-i-full" ? "I" : "E";
    const fullName = relationKind === "caa-i-full" || relationKind === "caa-e-full";
    const baseSearch = search.startsWith(sourcePrefix) ? search.slice(sourcePrefix.length) : search;
    const baseReplace = targetPrefix !== "" && replace.startsWith(targetPrefix)
      ? replace.slice(targetPrefix.length)
      : replace;
    const baseSearchTokens = ktcSplitNameTokens(baseSearch);
    const baseReplaceTokens = ktcSplitNameTokens(baseReplace);
    if (baseSearchTokens.length < 2 || baseReplaceTokens.length < 1) return undefined;
    const sourceStem = baseSearchTokens.slice(0, -1).join("");
    const targetTail = baseReplaceTokens.at(-1) ?? "";
    derivedSearch = `${sourcePrefix}${infix}${baseSearchTokens.join("")}`;
    derivedReplace = fullName
      ? `${targetPrefix}${infix}${baseReplaceTokens.join("")}`
      : `${targetPrefix}${infix}${sourceStem}${targetTail}`;
  }

  if (derivedSearch === search && derivedReplace === replace) return undefined;
  return {
    id: `associated-${relationKind}-${parent.id}`,
    parentId: parent.id,
    relationKind,
    source: "generated",
    search: derivedSearch,
    replace: derivedReplace,
    enabled: true,
  };
}

/**
 * Replaces stale generated rows while retaining non-empty rows that the user
 * created or edited. The legacy fixed AutoCode template predates source tags,
 * so only its unchanged values are removed during migration.
 */
export function ktcMergeAssociatedReplacementRules(
  suggested: readonly KtcAssociatedReplacementRule[],
  existing: readonly KtcReplacementRuleDraft[],
  replaceKinds?: readonly KtcAssociatedRelationKind[],
): readonly KtcReplacementRuleDraft[] {
  const replacedKinds = replaceKinds ? new Set(replaceKinds) : undefined;
  const retainedGenerated = existing.filter((rule) => (
    rule.source === "generated"
    && replacedKinds !== undefined
    && rule.relationKind !== undefined
    && rule.relationKind !== "custom"
    && !replacedKinds.has(rule.relationKind)
  ));
  const userRules = existing
    .filter((rule) => rule.source !== "generated")
    .filter((rule) => rule.search.trim() !== "" || rule.replace.trim() !== "")
    .filter((rule) => {
      const legacy = legacyTemplateRules.get(rule.id);
      return !legacy || legacy.search !== rule.search || legacy.replace !== rule.replace;
    })
    .map((rule) => ({
      ...rule,
      relationKind: rule.relationKind ?? "custom",
      source: "user" as const,
    }));
  const userSearches = new Set(userRules.map((rule) => rule.search).filter(Boolean));
  const generatedRules: KtcReplacementRuleDraft[] = [];
  const generatedSearches = new Set<string>();
  for (const rule of [...suggested, ...retainedGenerated]) {
    if (userSearches.has(rule.search) || generatedSearches.has(rule.search)) continue;
    generatedSearches.add(rule.search);
    generatedRules.push(rule);
  }
  return [...generatedRules, ...userRules];
}
