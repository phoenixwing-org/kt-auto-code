/*
 * Copyright 2024-2026 Shanghai Kuntai Co.
 * SPDX-License-Identifier: Apache-2.0
 *
 * The rename algorithm was derived from a 2024 Shanghai Kuntai Windows
 * application (C++, Qt, and .NET) and redesigned for this VS Code extension.
 * Software Copyright Registration No.: 2024SR1374380
 */

import iconv from "iconv-lite";
import {
  pnwCodeReplaceStringByRules,
  pnwCodeResolveReplacementRules,
  pnwCodeSuggestNameReplacement,
} from "@phoenix-wing/code-core";
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
  return [...pnwCodeResolveReplacementRules(rules, preserveCase)];
}

export function replaceStringByRules(
  input: string,
  rules: readonly ResolvedReplacementRule[],
): { output: string; matches: RuleMatchSummary[] } {
  const result = pnwCodeReplaceStringByRules(input, rules);
  return { output: result.output, matches: [...result.matches] };
}

/** Returns a display-only rename suggestion without touching the file system. */
export function ktcSuggestNameReplacement(
  currentName: string,
  rules: readonly ReplacementRule[],
  preserveCase: boolean,
): KtcNameReplacementSuggestion | undefined {
  const suggestion = pnwCodeSuggestNameReplacement(currentName, rules, preserveCase);
  return suggestion ? { ...suggestion, matches: [...suggestion.matches] } : undefined;
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
