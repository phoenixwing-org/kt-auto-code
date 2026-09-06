import type {
  KtcProjectRenameStructuredCandidate,
  KtcProjectRenameStructuredDiscovery,
} from "./structuredDiscoveryContracts.js";
import { ktcProjectRenameNameTokens } from "./nameTokenization.js";

const KTC_STRUCTURED_NAME_MAX_TOKENS = 16;
const KTC_STRUCTURED_NAME_MAX_SEPARATOR_LENGTH = 32;
const KTC_STRUCTURED_NAME_MAX_MATCHES_PER_ITEM = 200;
const KTC_STRUCTURED_NAME_MAX_MATCHES = 5_000;
const KTC_STRUCTURED_NAME_MAX_CANDIDATES = 50;
const KTC_STRUCTURED_NAME_MAX_EXAMPLES = 3;

interface KtcStructuredNameToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface KtcStructuredNamePattern {
  readonly sourceTokens: readonly string[];
  readonly targetTokens: readonly string[];
  readonly targetSourceIndexes: readonly number[];
}

interface KtcStructuredNameMatch {
  readonly sourceText: string;
  readonly targetText: string;
}

interface KtcStructuredNameCandidateCounter {
  sourceText: string;
  targetText: string;
  occurrences: number;
  matchedItems: number;
  examples: string[];
}

/**
 * Collects second-stage structured-name discoveries without feeding them into
 * the executable literal rename plan. The bounded scanner intentionally accepts
 * only visible word separators and established camel/Pascal token boundaries.
 */
export class KtcStructuredNameDiscoveryCollector {
  private readonly pattern?: KtcStructuredNamePattern;
  private readonly excludedPairs: ReadonlySet<string>;
  private readonly counters = new Map<string, KtcStructuredNameCandidateCounter>();
  private scannedItems = 0;
  private matchedItems = 0;
  private occurrences = 0;
  private truncated = false;

  readonly unsupportedReason?: string;

  constructor(
    sourceName: string,
    targetName: string,
    excludedPairs: ReadonlySet<string> = new Set(),
  ) {
    const compiled = ktcCompileStructuredNamePattern(sourceName, targetName);
    this.pattern = compiled.pattern;
    this.unsupportedReason = compiled.unsupportedReason;
    this.excludedPairs = excludedPairs;
  }

  record(input: string, location: string): void {
    if (!this.pattern || this.truncated) return;
    this.scannedItems += 1;
    const matches = ktcFindStructuredNameMatches(input, this.pattern);
    const itemTruncated = matches.length > KTC_STRUCTURED_NAME_MAX_MATCHES_PER_ITEM;
    const itemKeys = new Set<string>();
    for (const match of matches.slice(0, KTC_STRUCTURED_NAME_MAX_MATCHES_PER_ITEM)) {
      const identity = `${match.sourceText}\u0000${match.targetText}`;
      if (this.excludedPairs.has(identity)) continue;
      if (this.occurrences >= KTC_STRUCTURED_NAME_MAX_MATCHES) {
        this.truncated = true;
        break;
      }
      this.occurrences += 1;
      itemKeys.add(identity);
      const counter = this.counters.get(identity) ?? {
        sourceText: match.sourceText,
        targetText: match.targetText,
        occurrences: 0,
        matchedItems: 0,
        examples: [],
      };
      counter.occurrences += 1;
      if (counter.examples.length < KTC_STRUCTURED_NAME_MAX_EXAMPLES && !counter.examples.includes(location)) {
        counter.examples.push(location);
      }
      this.counters.set(identity, counter);
    }
    if (itemKeys.size > 0) this.matchedItems += 1;
    for (const identity of itemKeys) this.counters.get(identity)!.matchedItems += 1;
    if (itemTruncated) this.truncated = true;
  }

  snapshot(): KtcProjectRenameStructuredDiscovery {
    if (!this.pattern) {
      return {
        status: "unsupported",
        message: this.unsupportedReason ?? "当前名称不能生成安全的结构化发现模式。",
        scannedItems: 0,
        matchedItems: 0,
        occurrences: 0,
        truncated: false,
        candidates: [],
      };
    }
    const allCandidates = [...this.counters.values()].sort((left, right) => (
      right.occurrences - left.occurrences
      || right.sourceText.length - left.sourceText.length
      || ktcCompareStructuredText(left.sourceText, right.sourceText)
    ));
    const candidates: KtcProjectRenameStructuredCandidate[] = allCandidates
      .slice(0, KTC_STRUCTURED_NAME_MAX_CANDIDATES)
      .map((candidate, index) => ({
        id: `structured-${index + 1}`,
        sourceText: candidate.sourceText,
        targetText: candidate.targetText,
        occurrences: candidate.occurrences,
        matchedItems: candidate.matchedItems,
        examples: [...candidate.examples].sort(ktcCompareStructuredText),
        reason: "保留命中的连接符与大小写；当前仅供发现，不进入执行计划。",
      }));
    return {
      status: "ready",
      message: candidates.length > 0
        ? "结构化候选只读展示；执行改名仍只使用上方已启用的精确规则。"
        : "未发现精确规则之外的结构化名称写法。",
      scannedItems: this.scannedItems,
      matchedItems: this.matchedItems,
      occurrences: this.occurrences,
      truncated: this.truncated || allCandidates.length > KTC_STRUCTURED_NAME_MAX_CANDIDATES,
      candidates,
    };
  }
}

function ktcCompileStructuredNamePattern(
  sourceName: string,
  targetName: string,
): { readonly pattern?: KtcStructuredNamePattern; readonly unsupportedReason?: string } {
  const sourceTokenization = ktcTokenizeStructuredName(sourceName, "原项目名");
  if (sourceTokenization.unsupportedReason) return sourceTokenization;
  const targetTokenization = ktcTokenizeStructuredName(targetName, "目标项目名");
  if (targetTokenization.unsupportedReason) return targetTokenization;
  const sourceTokens = sourceTokenization.tokens ?? [];
  const targetTokens = targetTokenization.tokens ?? [];
  if (sourceTokens.length < 2) {
    return { unsupportedReason: "结构化发现要求原项目名至少包含两个词段。" };
  }
  if (targetTokens.length === 0) {
    return { unsupportedReason: "结构化发现要求目标项目名至少包含一个词段。" };
  }
  if (sourceTokens.length > KTC_STRUCTURED_NAME_MAX_TOKENS || targetTokens.length > KTC_STRUCTURED_NAME_MAX_TOKENS) {
    return { unsupportedReason: `结构化发现最多接受 ${KTC_STRUCTURED_NAME_MAX_TOKENS} 个词段。` };
  }
  if (targetTokens.length > sourceTokens.length) {
    return { unsupportedReason: "当前只读阶段不推断新增词段；请先使用相同或更少的目标词段。" };
  }
  let targetSourceIndexes: readonly number[];
  if (targetTokens.length === sourceTokens.length) {
    targetSourceIndexes = targetTokens.map((_token, index) => index);
  } else {
    const indexes = ktcOrderedTokenIndexes(sourceTokens, targetTokens);
    if (!indexes) {
      return {
        unsupportedReason: "减少词段时，目标词必须是原项目词段的有序子序列；当前阶段不猜测被删除的词段。",
      };
    }
    targetSourceIndexes = indexes;
  }
  return {
    pattern: {
      sourceTokens: sourceTokens.map(ktcNormalizeStructuredToken),
      targetTokens,
      targetSourceIndexes,
    },
  };
}

function ktcTokenizeStructuredName(
  value: string,
  label: string,
): { readonly tokens?: readonly string[]; readonly unsupportedReason?: string } {
  const trimmed = value.trim();
  const tokens = ktcProjectRenameNameTokens(trimmed);
  const compact = trimmed.replace(/[\t \u00a0._-]+/gu, "");
  if ((compact !== "" && !/^[A-Za-z0-9]+$/u.test(compact)) || tokens.join("") !== compact) {
    return {
      unsupportedReason: `${label}含有当前结构化发现无法无损分词的字符；暂只支持 ASCII 字母、数字、空格和 ._- 连接符。`,
    };
  }
  return { tokens };
}

function ktcOrderedTokenIndexes(
  sourceTokens: readonly string[],
  targetTokens: readonly string[],
): readonly number[] | undefined {
  const indexes: number[] = [];
  let sourceIndex = 0;
  for (const target of targetTokens) {
    const normalizedTarget = ktcNormalizeStructuredToken(target);
    while (sourceIndex < sourceTokens.length
      && ktcNormalizeStructuredToken(sourceTokens[sourceIndex]!) !== normalizedTarget) sourceIndex += 1;
    if (sourceIndex >= sourceTokens.length) return undefined;
    indexes.push(sourceIndex);
    sourceIndex += 1;
  }
  return indexes;
}

function ktcFindStructuredNameMatches(
  input: string,
  pattern: KtcStructuredNamePattern,
): readonly KtcStructuredNameMatch[] {
  const matches: KtcStructuredNameMatch[] = [];
  const tokenWindow: KtcStructuredNameToken[] = [];
  const tokenPattern = /\p{Lu}+(?=\p{Lu}\p{Ll}|\p{N}|[^\p{L}\p{N}]|$)|\p{Lu}?\p{Ll}+|\p{Lu}+|\p{N}+/gu;
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenPattern.exec(input)) !== null) {
    const text = tokenMatch[0];
    const start = tokenMatch.index;
    tokenWindow.push({ text, start, end: start + text.length });
    if (tokenWindow.length > pattern.sourceTokens.length) tokenWindow.shift();
    if (tokenWindow.length !== pattern.sourceTokens.length
      || !ktcStructuredWindowMatches(input, tokenWindow, pattern.sourceTokens)) continue;
    const sourceText = input.slice(tokenWindow[0]!.start, tokenWindow.at(-1)!.end);
    const targetText = ktcRenderStructuredTarget(input, tokenWindow, pattern);
    if (sourceText === targetText) continue;
    matches.push({ sourceText, targetText });
    if (matches.length > KTC_STRUCTURED_NAME_MAX_MATCHES_PER_ITEM) break;
  }
  return matches;
}

function ktcStructuredWindowMatches(
  input: string,
  tokens: readonly KtcStructuredNameToken[],
  expected: readonly string[],
): boolean {
  for (let index = 0; index < expected.length; index += 1) {
    const token = tokens[index]!.text;
    if (!/^[A-Za-z0-9]+$/u.test(token) || ktcNormalizeStructuredToken(token) !== expected[index]) return false;
    if (index === 0) continue;
    const separator = input.slice(tokens[index - 1]!.end, tokens[index]!.start);
    if (!ktcIsStructuredSeparator(separator)) return false;
  }
  return true;
}

function ktcIsStructuredSeparator(value: string): boolean {
  if (value === "") return true;
  if (value.length > KTC_STRUCTURED_NAME_MAX_SEPARATOR_LENGTH) return false;
  return /^[\t \u00a0]+$/u.test(value) || /^[._-]$/u.test(value);
}

function ktcRenderStructuredTarget(
  input: string,
  sourceMatches: readonly KtcStructuredNameToken[],
  pattern: KtcStructuredNamePattern,
): string {
  return pattern.targetTokens.map((targetToken, targetIndex) => {
    const sourceIndex = pattern.targetSourceIndexes[targetIndex]!;
    const transformed = ktcMatchStructuredTokenCase(targetToken, sourceMatches[sourceIndex]!.text);
    if (targetIndex === 0) return transformed;
    const previousSourceIndex = pattern.targetSourceIndexes[targetIndex - 1]!;
    const separator = input.slice(
      sourceMatches[previousSourceIndex]!.end,
      sourceMatches[previousSourceIndex + 1]!.start,
    );
    return `${separator}${transformed}`;
  }).join("");
}

function ktcMatchStructuredTokenCase(target: string, source: string): string {
  if (/^\p{Ll}[\p{Ll}\p{N}]*$/u.test(source)) return target.toLocaleLowerCase("en-US");
  if (/^(?=.*\p{Lu})[\p{Lu}\p{N}]+$/u.test(source)) return target.toLocaleUpperCase("en-US");
  if (/^\p{Lu}[\p{Ll}\p{N}]*$/u.test(source)) {
    const lower = target.toLocaleLowerCase("en-US");
    return `${lower.slice(0, 1).toLocaleUpperCase("en-US")}${lower.slice(1)}`;
  }
  return target;
}

function ktcNormalizeStructuredToken(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function ktcCompareStructuredText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
