/*
 * Copyright 2024-2026 Shanghai Kuntai Co.
 * SPDX-License-Identifier: Apache-2.0
 *
 * The rename algorithm was derived from a 2024 Shanghai Kuntai Windows
 * application (C++, Qt, and .NET) and redesigned for this VS Code extension.
 * Software Copyright Registration No.: 2024SR1374380
 */

import iconv from "iconv-lite";
import type {
  ReplacementRule,
  ReplacementTextEncoding,
  ResolvedReplacementRule,
  RuleMatchSummary,
} from "./replacementRuleContracts.js";

export type {
  ReplacementRule,
  ReplacementTextEncoding,
  ResolvedReplacementRule,
  RuleMatchSummary,
} from "./replacementRuleContracts.js";

export interface KtcNameReplacementSuggestion {
  currentName: string;
  suggestedName: string;
  matches: RuleMatchSummary[];
}

export const CAA_REPLACEMENT_RULES: readonly ReplacementRule[] = [
  { id: "ktci", search: "KTCIAutoCode", replace: "KTCIAutoBuild" },
  { id: "ktce", search: "KTCEAutoCode", replace: "KTCEAutoBuild" },
  { id: "ktc", search: "KTCAutoCode", replace: "KTCTomBuild" },
  { id: "auto-space", search: "Auto Code", replace: "Tom Build" },
  { id: "auto", search: "AutoCode", replace: "TomBuild" },
];

export function resolveReplacementRules(
  rules: readonly ReplacementRule[],
  preserveCase: boolean,
): ResolvedReplacementRule[] {
  const explicit = rules
    .map((rule, sourceIndex) => ({ rule, sourceIndex }))
    .filter(({ rule }) => rule.enabled !== false && rule.search.length > 0)
    .map(({ rule, sourceIndex }) => ({
      id: rule.id ?? `rule-${sourceIndex + 1}`,
      search: rule.search,
      replace: rule.replace,
      sourceIndex,
      derived: false,
    }));
  if (explicit.length === 0) throw new Error("至少需要一条非空搜索规则");
  if (explicit.some((rule) => rule.search === rule.replace)) {
    throw new Error("搜索内容与替换内容不能相同");
  }

  const all = [...explicit];
  if (preserveCase) {
    for (const rule of explicit) {
      const search = rule.search.toUpperCase();
      const replace = rule.replace.toUpperCase();
      if (search !== rule.search) {
        all.push({ ...rule, id: `${rule.id}:upper`, search, replace, derived: true });
      }
    }
  }

  const deduped: ResolvedReplacementRule[] = [];
  const bySearch = new Map<string, ResolvedReplacementRule>();
  for (const rule of all) {
    const existing = bySearch.get(rule.search);
    if (existing) {
      if (existing.replace !== rule.replace) {
        throw new Error(`搜索规则冲突：${rule.search}`);
      }
      continue;
    }
    bySearch.set(rule.search, rule);
    deduped.push(rule);
  }
  return deduped;
}

function winningStringRule(
  input: string,
  offset: number,
  rules: readonly ResolvedReplacementRule[],
): ResolvedReplacementRule | undefined {
  let winner: ResolvedReplacementRule | undefined;
  for (const rule of rules) {
    if (!input.startsWith(rule.search, offset)) continue;
    if (!winner || rule.search.length > winner.search.length) winner = rule;
  }
  return winner;
}

export function replaceStringByRules(
  input: string,
  rules: readonly ResolvedReplacementRule[],
): { output: string; matches: RuleMatchSummary[] } {
  let output = "";
  let offset = 0;
  const counts = new Map<string, number>();
  while (offset < input.length) {
    const rule = winningStringRule(input, offset, rules);
    if (!rule) {
      output += input[offset];
      offset++;
      continue;
    }
    output += rule.replace;
    counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
    offset += rule.search.length;
  }
  return { output, matches: summaries(rules, counts) };
}

/** Returns a display-only rename suggestion without touching the file system. */
export function ktcSuggestNameReplacement(
  currentName: string,
  rules: readonly ReplacementRule[],
  preserveCase: boolean,
): KtcNameReplacementSuggestion | undefined {
  const replacement = replaceStringByRules(currentName, resolveReplacementRules(rules, preserveCase));
  if (replacement.matches.length === 0 || replacement.output === currentName) return undefined;
  return {
    currentName,
    suggestedName: replacement.output,
    matches: replacement.matches,
  };
}

interface ByteRule {
  rule: ResolvedReplacementRule;
  search: Buffer;
  replace: Buffer;
}

function encodeReplacementText(value: string, encoding: ReplacementTextEncoding): Buffer {
  if (encoding !== "gbk") return Buffer.from(value, encoding);
  const encoded = iconv.encode(value, "gbk");
  if (iconv.decode(encoded, "gbk") !== value) {
    throw new Error(`目标文本无法按 GBK 编码：${value}`);
  }
  return encoded;
}

function winningByteRule(bytes: Buffer, offset: number, rules: readonly ByteRule[]): ByteRule | undefined {
  let winner: ByteRule | undefined;
  for (const rule of rules) {
    if (offset + rule.search.length > bytes.length) continue;
    if (!bytes.subarray(offset, offset + rule.search.length).equals(rule.search)) continue;
    if (!winner || rule.search.length > winner.search.length) winner = rule;
  }
  return winner;
}

export function replaceBufferByRules(
  bytes: Buffer,
  rules: readonly ResolvedReplacementRule[],
  encoding: ReplacementTextEncoding,
): { output: Buffer; offsets: number[]; matches: RuleMatchSummary[] } {
  const byteRules: ByteRule[] = rules.map((rule) => ({
    rule,
    search: encodeReplacementText(rule.search, encoding),
    replace: encodeReplacementText(rule.replace, encoding),
  }));
  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  const counts = new Map<string, number>();
  let offset = 0;
  let unchangedStart = 0;
  while (offset < bytes.length) {
    const winner = winningByteRule(bytes, offset, byteRules);
    if (!winner) {
      offset++;
      continue;
    }
    chunks.push(bytes.subarray(unchangedStart, offset), winner.replace);
    offsets.push(offset);
    counts.set(winner.rule.id, (counts.get(winner.rule.id) ?? 0) + 1);
    offset += winner.search.length;
    unchangedStart = offset;
  }
  if (offsets.length === 0) return { output: bytes, offsets, matches: [] };
  chunks.push(bytes.subarray(unchangedStart));
  return { output: Buffer.concat(chunks), offsets, matches: summaries(rules, counts) };
}

function summaries(
  rules: readonly ResolvedReplacementRule[],
  counts: ReadonlyMap<string, number>,
): RuleMatchSummary[] {
  return rules
    .filter((rule) => (counts.get(rule.id) ?? 0) > 0)
    .map((rule) => ({
      ruleId: rule.id,
      search: rule.search,
      replace: rule.replace,
      occurrences: counts.get(rule.id) ?? 0,
    }));
}
