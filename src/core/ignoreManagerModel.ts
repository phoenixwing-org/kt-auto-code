/**
 * Data-only Ignore manager model.
 *
 * Keep this module free of VS Code and filesystem dependencies so the rule
 * semantics can move to Phoenix Wing / Desk Tools without bringing a Host
 * adapter with them.
 */

export type KtcIgnoreWriteTarget = "git" | "phoenix";

export type KtcIgnoreRuleAction = "append" | "remove";

export interface KtcNormalizedIgnoreRule {
  /** Portable, trimmed representation used when a new line is appended. */
  readonly value: string;
  /** Loose comparison key used for display grouping. `foo` and `foo/` share this key. */
  readonly key: string;
  /** Write identity. A trailing slash is semantic and is therefore preserved. */
  readonly identity: string;
}

export interface KtcIgnoreRuleSourceText {
  readonly source: KtcIgnoreWriteTarget;
  readonly text: string;
}

export interface KtcMergedIgnoreRule {
  readonly value: string;
  /** Exact write identity; unlike the loose display key, a semantic trailing slash is retained. */
  readonly normalizedValue: string;
  readonly sources: readonly KtcIgnoreWriteTarget[];
  readonly presentIn: Readonly<Record<KtcIgnoreWriteTarget, boolean>>;
}

export interface KtcIgnoreRuleMutationResult {
  readonly text: string;
  readonly addedRules: readonly string[];
  readonly removedRules: readonly string[];
  /** Valid requested rules for which the requested state was already true. */
  readonly unchangedRules: readonly string[];
  readonly invalidRules: readonly string[];
}

/**
 * Normalizes only the subset shared by Phoenix scanners and the manager UI.
 * It deliberately does not attempt to claim full Git Ignore semantics.
 */
export function ktcNormalizeIgnoreRule(input: string): KtcNormalizedIgnoreRule | undefined {
  if (/[\r\n\0]/u.test(input)) return undefined;
  let value = input.trim();
  if (!value || value.startsWith("#")) return undefined;
  value = value.replace(/\\/g, "/");
  while (value.startsWith("./")) value = value.slice(2);
  if (!value) return undefined;
  const key = value.length > 1 ? value.replace(/\/+$/, "") : value;
  if (!key) return undefined;
  const identity = value.length > 1 && value.endsWith("/") ? `${key}/` : key;
  return { value, key, identity };
}

export function ktcDedupeIgnoreRules(rules: readonly string[]): readonly string[] {
  return normalizeRequestedRules(rules).rules.map((rule) => rule.value);
}

/**
 * Relocates repository-root Ignore rules to paths relative to a selected scan
 * directory. This intentionally stays within the Phoenix matcher subset: bare
 * name rules remain location-independent, while path-scoped rules are emitted
 * only when their remaining scope can be represented without broadening it.
 */
export function ktcRelocateGitIgnoreRules(
  rules: readonly string[],
  scanRootRelativePath: string,
): readonly string[] {
  const scanSegments = normalizeRelativePathSegments(scanRootRelativePath);
  if (!scanSegments) return [];
  const normalizedRules = normalizeRequestedRules(rules).rules;
  if (scanSegments.length === 0) return normalizedRules.map((rule) => rule.value);
  return ktcDedupeIgnoreRules(normalizedRules.flatMap((rule) =>
    relocateGitIgnoreRule(rule.value, scanSegments)));
}

function relocateGitIgnoreRule(rule: string, scanSegments: readonly string[]): readonly string[] {
  const rootAnchored = rule.startsWith("/");
  const withoutAnchor = rootAnchored ? rule.slice(1) : rule;
  const directoryRule = withoutAnchor.endsWith("/");
  const pathPattern = directoryRule ? withoutAnchor.replace(/\/+$/u, "") : withoutAnchor;
  if (!pathPattern) return [];

  // In the current Phoenix subset, an unanchored rule without a slash matches
  // a name at every depth and therefore needs no relocation.
  if (!rootAnchored && !pathPattern.includes("/")) return [rule];

  // A leading globstar is location-independent. Once a non-empty repository
  // prefix has already been consumed, cover both the selected root and deeper
  // descendants without changing basename matching semantics.
  if (pathPattern.startsWith("**/")) {
    return relocateLeadingGlobstarRule(pathPattern.slice(3), directoryRule);
  }

  const patternSegments = pathPattern.split("/");
  if (patternSegments.some((segment) => !segment || segment === "." || segment === "..")) return [];

  let index = 0;
  for (; index < scanSegments.length && index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index]!;
    // Wing's globstar may consume path separators. Its partial state cannot be
    // represented by a single rebased rule, so do not widen it heuristically.
    if (patternSegment.includes("**") || !matchesPathSegment(patternSegment, scanSegments[index]!)) return [];
  }

  if (index < scanSegments.length) {
    // A selected root below an ignored directory is wholly ignored. Exact file
    // rules cannot contain a directory and therefore do not apply below it.
    return directoryRule && index === patternSegments.length ? ["**"] : [];
  }

  const remaining = patternSegments.slice(index).join("/");
  if (!remaining) return directoryRule ? ["**"] : [];
  if (directoryRule) return [`${remaining}/**`];
  if (remaining === "**") return [remaining];

  // Non-directory path rules only stay root-relative in the Wing matcher when
  // the residual contains both a slash and a glob. Bare/exact residuals would
  // also match nested basenames or suffixes and are therefore conservatively
  // omitted instead of over-ignoring the selected tree.
  return hasIgnoreGlob(remaining) && remaining.includes("/") ? [remaining] : [];
}

function relocateLeadingGlobstarRule(
  suffix: string,
  directoryRule: boolean,
): readonly string[] {
  if (!suffix) return directoryRule ? ["**/"] : ["**"];
  if (directoryRule) return [`${suffix}/**`, `**/${suffix}/**`];
  if (!hasIgnoreGlob(suffix) || !suffix.includes("/")) return [suffix];
  return [suffix, `**/${suffix}`];
}

function normalizeRelativePathSegments(value: string): readonly string[] | undefined {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (!normalized || normalized === ".") return [];
  if (normalized.startsWith("/")) return undefined;
  const segments = normalized.split("/");
  return segments.some((segment) => !segment || segment === "." || segment === "..")
    ? undefined
    : segments;
}

function matchesPathSegment(pattern: string, value: string): boolean {
  if (!hasIgnoreGlob(pattern)) return pattern === value;
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${expression}$`, "u").test(value);
}

function hasIgnoreGlob(value: string): boolean {
  return value.includes("*") || value.includes("?");
}

/** Merges exact semantic rules in source order while retaining every source that contains that identity. */
export function ktcMergeIgnoreRuleSources(
  sourceTexts: readonly KtcIgnoreRuleSourceText[],
): readonly KtcMergedIgnoreRule[] {
  const merged = new Map<string, {
    value: string;
    sources: KtcIgnoreWriteTarget[];
  }>();
  for (const sourceText of sourceTexts) {
    for (const rule of ignoreRulesFromText(sourceText.text)) {
      const current = merged.get(rule.identity);
      if (!current) {
        merged.set(rule.identity, { value: rule.value, sources: [sourceText.source] });
      } else if (!current.sources.includes(sourceText.source)) {
        current.sources.push(sourceText.source);
      }
    }
  }
  return [...merged.entries()].map(([normalizedValue, entry]) => ({
    value: entry.value,
    normalizedValue,
    sources: entry.sources,
    presentIn: {
      git: entry.sources.includes("git"),
      phoenix: entry.sources.includes("phoenix"),
    },
  }));
}

/**
 * Applies a rule-level mutation without rewriting the rest of the document.
 * Append adds only absent normalized rules; remove drops every equivalent rule
 * line while retaining comments, whitespace-only lines and unrelated content.
 */
export function ktcApplyIgnoreRuleMutation(
  text: string,
  action: KtcIgnoreRuleAction,
  requestedRules: readonly string[],
): KtcIgnoreRuleMutationResult {
  const requested = normalizeRequestedRules(requestedRules);
  if (action === "append") return appendRules(text, requested.rules, requested.invalidRules);
  return removeRules(text, requested.rules, requested.invalidRules);
}

function ignoreRulesFromText(text: string): readonly KtcNormalizedIgnoreRule[] {
  return text.split(/\r\n|\n|\r/)
    .map(ktcNormalizeIgnoreRule)
    .filter((rule): rule is KtcNormalizedIgnoreRule => !!rule);
}

function normalizeRequestedRules(rules: readonly string[]): {
  rules: KtcNormalizedIgnoreRule[];
  invalidRules: string[];
} {
  const normalized: KtcNormalizedIgnoreRule[] = [];
  const invalidRules: string[] = [];
  const seen = new Set<string>();
  for (const input of rules) {
    const rule = ktcNormalizeIgnoreRule(input);
    if (!rule) {
      invalidRules.push(input);
      continue;
    }
    if (seen.has(rule.identity)) continue;
    seen.add(rule.identity);
    normalized.push(rule);
  }
  return { rules: normalized, invalidRules };
}

function appendRules(
  text: string,
  requested: readonly KtcNormalizedIgnoreRule[],
  invalidRules: readonly string[],
): KtcIgnoreRuleMutationResult {
  const existing = new Set(ignoreRulesFromText(text).map((rule) => rule.identity));
  const added = requested.filter((rule) => !existing.has(rule.identity));
  const unchanged = requested.filter((rule) => existing.has(rule.identity));
  if (added.length === 0) {
    return {
      text,
      addedRules: [],
      removedRules: [],
      unchangedRules: unchanged.map((rule) => rule.value),
      invalidRules,
    };
  }
  const newline = newlineOf(text);
  const separator = text.length === 0 || text.endsWith("\n") || text.endsWith("\r") ? "" : newline;
  return {
    text: `${text}${separator}${added.map((rule) => rule.value).join(newline)}${newline}`,
    addedRules: added.map((rule) => rule.value),
    removedRules: [],
    unchangedRules: unchanged.map((rule) => rule.value),
    invalidRules,
  };
}

function removeRules(
  text: string,
  requested: readonly KtcNormalizedIgnoreRule[],
  invalidRules: readonly string[],
): KtcIgnoreRuleMutationResult {
  const requestedIdentities = new Set(requested.map((rule) => rule.identity));
  const removedIdentities = new Set<string>();
  const parts = text.split(/(\r\n|\n|\r)/);
  let result = "";
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index] ?? "";
    const newline = parts[index + 1] ?? "";
    const normalized = ktcNormalizeIgnoreRule(line);
    if (normalized && requestedIdentities.has(normalized.identity)) {
      removedIdentities.add(normalized.identity);
      continue;
    }
    result += line + newline;
  }
  const removed = requested.filter((rule) => removedIdentities.has(rule.identity));
  const unchanged = requested.filter((rule) => !removedIdentities.has(rule.identity));
  return {
    text: result,
    addedRules: [],
    removedRules: removed.map((rule) => rule.value),
    unchangedRules: unchanged.map((rule) => rule.value),
    invalidRules,
  };
}

function newlineOf(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}
