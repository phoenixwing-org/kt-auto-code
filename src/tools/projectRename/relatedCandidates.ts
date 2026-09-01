import {
  KTC_PROJECT_RENAME_VARIANT_STYLES,
  type KtcProjectRenameRelatedCandidate,
} from "./contracts.js";
import {
  ktcProjectRenameNameTokens,
  ktcProjectRenameNameVariants,
} from "./nameVariants.js";

export interface KtcProjectRenameRelatedCandidateDraft {
  readonly id: string;
  readonly search: string;
  readonly replace: string;
  readonly reason: string;
  readonly coveredBySearch?: string;
}

export function ktcDeriveProjectRenameRelatedCandidateDrafts(
  sourceName: string,
  targetName: string,
): readonly KtcProjectRenameRelatedCandidateDraft[] {
  const sourceTokens = ktcProjectRenameNameTokens(sourceName);
  const targetTokens = ktcProjectRenameNameTokens(targetName);
  if (sourceTokens.length === 0 || targetTokens.length === 0) return [];
  const drafts: KtcProjectRenameRelatedCandidateDraft[] = [];
  const prefixLength = ktcCommonPrefixLength(sourceTokens, targetTokens);
  if (prefixLength > 0 && prefixLength < sourceTokens.length && prefixLength < targetTokens.length) {
    ktcAppendPartialCandidates(
      drafts,
      "suffix",
      sourceTokens.slice(prefixLength),
      targetTokens.slice(prefixLength),
      sourceTokens,
      "去掉共同前缀后的相关短写法",
    );
  }
  const suffixLength = ktcCommonSuffixLength(sourceTokens, targetTokens);
  if (suffixLength > 0 && suffixLength < sourceTokens.length && suffixLength < targetTokens.length) {
    ktcAppendPartialCandidates(
      drafts,
      "prefix",
      sourceTokens.slice(0, -suffixLength),
      targetTokens.slice(0, -suffixLength),
      sourceTokens,
      "去掉共同后缀后的相关短写法",
    );
  }
  ktcAppendCaseCandidates(drafts, sourceTokens, targetTokens);
  const identities = new Set<string>();
  return drafts.filter((draft) => {
    if (!draft.search || !draft.replace || draft.search === draft.replace) return false;
    const identity = `${draft.search}\u0000${draft.replace}`;
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

export function ktcCountUncoveredProjectRenameCandidates(
  input: string,
  drafts: readonly KtcProjectRenameRelatedCandidateDraft[],
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const draft of drafts) {
    const coverage = draft.coveredBySearch
      ? ktcLiteralRanges(input, draft.coveredBySearch)
      : [];
    const count = ktcLiteralRanges(input, draft.search).filter(([start, end]) => (
      !coverage.some(([coveredStart, coveredEnd]) => start >= coveredStart && end <= coveredEnd)
    )).length;
    if (count > 0) counts[draft.id] = count;
  }
  return counts;
}

export function ktcFinalizeProjectRenameRelatedCandidates(
  drafts: readonly KtcProjectRenameRelatedCandidateDraft[],
  occurrences: ReadonlyMap<string, number>,
  matchedItems: ReadonlyMap<string, number>,
): readonly KtcProjectRenameRelatedCandidate[] {
  return drafts.flatMap((draft) => {
    const count = occurrences.get(draft.id) ?? 0;
    if (count === 0) return [];
    return [{
      id: draft.id,
      search: draft.search,
      replace: draft.replace,
      occurrences: count,
      matchedItems: matchedItems.get(draft.id) ?? 0,
      reason: draft.reason,
    }];
  }).sort((left, right) => (
    right.occurrences - left.occurrences
    || right.search.length - left.search.length
    || left.search.localeCompare(right.search)
  ));
}

function ktcAppendPartialCandidates(
  drafts: KtcProjectRenameRelatedCandidateDraft[],
  relation: "prefix" | "suffix",
  sourceTokens: readonly string[],
  targetTokens: readonly string[],
  fullSourceTokens: readonly string[],
  reason: string,
): void {
  const source = ktcProjectRenameNameVariants(sourceTokens.join(" "));
  const target = ktcProjectRenameNameVariants(targetTokens.join(" "));
  const fullSource = ktcProjectRenameNameVariants(fullSourceTokens.join(" "));
  for (const style of KTC_PROJECT_RENAME_VARIANT_STYLES) {
    drafts.push({
      id: `related-${relation}-${style}`,
      search: source[style],
      replace: target[style],
      reason,
      coveredBySearch: fullSource[style],
    });
  }
}

function ktcAppendCaseCandidates(
  drafts: KtcProjectRenameRelatedCandidateDraft[],
  sourceTokens: readonly string[],
  targetTokens: readonly string[],
): void {
  const cases: readonly [string, (tokens: readonly string[]) => string, string][] = [
    ["lower-space", (tokens) => ktcNormalizeTokens(tokens).join(" "), "完整名称的小写空格写法"],
    ["upper-space", (tokens) => ktcNormalizeTokens(tokens).join(" ").toLocaleUpperCase("en-US"), "完整名称的全大写空格写法"],
    ["upper-kebab", (tokens) => ktcNormalizeTokens(tokens).join("-").toLocaleUpperCase("en-US"), "完整名称的全大写连字符写法"],
  ];
  const exactSearches = new Set(Object.values(ktcProjectRenameNameVariants(sourceTokens.join(" "))));
  for (const [id, render, reason] of cases) {
    const search = render(sourceTokens);
    if (exactSearches.has(search)) continue;
    drafts.push({ id: `related-${id}`, search, replace: render(targetTokens), reason });
  }
}

function ktcNormalizeTokens(tokens: readonly string[]): readonly string[] {
  return tokens.map((token) => token.toLocaleLowerCase("en-US"));
}

function ktcCommonPrefixLength(left: readonly string[], right: readonly string[]): number {
  let length = 0;
  while (length < left.length && length < right.length && ktcSameToken(left[length]!, right[length]!)) length += 1;
  return length;
}

function ktcCommonSuffixLength(left: readonly string[], right: readonly string[]): number {
  let length = 0;
  while (length < left.length && length < right.length
    && ktcSameToken(left[left.length - 1 - length]!, right[right.length - 1 - length]!)) length += 1;
  return length;
}

function ktcSameToken(left: string, right: string): boolean {
  return left.toLocaleLowerCase("en-US") === right.toLocaleLowerCase("en-US");
}

function ktcLiteralRanges(input: string, search: string): readonly [number, number][] {
  if (!search) return [];
  const ranges: [number, number][] = [];
  let offset = 0;
  while (offset <= input.length - search.length) {
    const start = input.indexOf(search, offset);
    if (start < 0) break;
    ranges.push([start, start + search.length]);
    offset = start + search.length;
  }
  return ranges;
}
