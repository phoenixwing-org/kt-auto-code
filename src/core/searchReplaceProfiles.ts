import type { KtcReplacementRuleDraft } from "./associatedReplacementRules.js";

export const KTC_SEARCH_REPLACE_PROFILE_VERSION = 1;

export interface KtcSearchReplaceProfileOptions {
  preserveCase: boolean;
  text: boolean;
  file: boolean;
  dir: boolean;
  includeIgnored: boolean;
  scope: string;
}

export interface KtcSearchReplaceProfileDraft {
  search: string;
  replace: string;
  sourcePrefix: string;
  targetPrefix: string;
  associatedRules: readonly KtcReplacementRuleDraft[];
  options: KtcSearchReplaceProfileOptions;
}

export interface KtcSearchReplaceProfile extends KtcSearchReplaceProfileDraft {
  id: string;
  label: string;
  updatedAt: string;
}

export interface KtcSearchReplaceProfileDocument {
  version: typeof KTC_SEARCH_REPLACE_PROFILE_VERSION;
  profiles: readonly KtcSearchReplaceProfile[];
}

export interface KtcSearchReplaceProfileSummary {
  id: string;
  label: string;
  updatedAt: string;
}

const relationKinds = new Set([
  "spaced",
  "prefix",
  "caa-i",
  "caa-e",
  "caa-i-full",
  "caa-e-full",
  "custom",
]);

export function ktcEmptySearchReplaceProfileDocument(): KtcSearchReplaceProfileDocument {
  return { version: KTC_SEARCH_REPLACE_PROFILE_VERSION, profiles: [] };
}

export function ktcParseSearchReplaceProfileDocument(text: string): KtcSearchReplaceProfileDocument {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.version !== KTC_SEARCH_REPLACE_PROFILE_VERSION || !Array.isArray(value.profiles)) {
    throw new Error("搜索替换规则档案格式无效或版本不受支持");
  }
  if (value.profiles.length > 200) throw new Error("搜索替换规则档案数量超过 200 个");
  const profiles = value.profiles.map((profile, index) => parseProfile(profile, index));
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const profile of profiles) {
    const normalizedLabel = profile.label.toLocaleLowerCase();
    if (ids.has(profile.id)) throw new Error(`规则档案 id 重复：${profile.id}`);
    if (labels.has(normalizedLabel)) throw new Error(`规则档案名称重复：${profile.label}`);
    ids.add(profile.id);
    labels.add(normalizedLabel);
  }
  return {
    version: KTC_SEARCH_REPLACE_PROFILE_VERSION,
    profiles,
  };
}

export function ktcCreateSearchReplaceProfile(
  draft: KtcSearchReplaceProfileDraft,
  identity: { id: string; label: string; updatedAt: string },
): KtcSearchReplaceProfile {
  const label = identity.label.trim();
  if (!label) throw new Error("规则档案名称不能为空");
  const associatedRules = draft.associatedRules.filter((rule) => (
    rule.search.trim() !== "" || rule.replace.trim() !== ""
  ));
  return parseProfile({ ...draft, associatedRules, ...identity, label }, 0);
}

export function ktcUpsertSearchReplaceProfile(
  document: KtcSearchReplaceProfileDocument,
  profile: KtcSearchReplaceProfile,
): KtcSearchReplaceProfileDocument {
  const index = document.profiles.findIndex((item) => item.id === profile.id);
  const profiles = [...document.profiles];
  if (index < 0) profiles.push(profile);
  else profiles[index] = profile;
  profiles.sort((left, right) => left.label.localeCompare(right.label));
  return { version: KTC_SEARCH_REPLACE_PROFILE_VERSION, profiles };
}

export function ktcSearchReplaceProfileSummaries(
  document: KtcSearchReplaceProfileDocument,
): readonly KtcSearchReplaceProfileSummary[] {
  return document.profiles.map(({ id, label, updatedAt }) => ({ id, label, updatedAt }));
}

function parseProfile(value: unknown, index: number): KtcSearchReplaceProfile {
  if (!isRecord(value)) throw new Error(`规则档案 #${index + 1} 不是对象`);
  const associatedRules = Array.isArray(value.associatedRules) ? value.associatedRules : [];
  if (associatedRules.length > 500) throw new Error(`规则档案 #${index + 1} 的关联规则超过 500 条`);
  const parsedRules = associatedRules.map((rule, ruleIndex) => parseRule(rule, ruleIndex));
  if (!isRecord(value.options)) throw new Error(`规则档案 #${index + 1} 缺少 options`);
  const options = {
    preserveCase: booleanValue(value.options.preserveCase, "preserveCase"),
    text: booleanValue(value.options.text, "text"),
    file: booleanValue(value.options.file, "file"),
    dir: booleanValue(value.options.dir, "dir"),
    includeIgnored: booleanValue(value.options.includeIgnored, "includeIgnored"),
    scope: stringValue(value.options.scope, "scope"),
  };
  if (!options.text && !options.file && !options.dir) {
    throw new Error(`规则档案 #${index + 1} 至少需要一个替换范围`);
  }
  const search = requiredString(value.search, "search");
  const replace = stringValue(value.replace, "replace");
  if ((options.file || options.dir) && replace === "") {
    throw new Error(`规则档案 #${index + 1} 的文件或文件夹目标不能为空`);
  }
  if ((options.file || options.dir) && parsedRules.some((rule) => rule.enabled !== false && rule.replace === "")) {
    throw new Error(`规则档案 #${index + 1} 的关联文件或文件夹目标不能为空`);
  }
  return {
    id: requiredString(value.id, "id"),
    label: requiredString(value.label, "label"),
    updatedAt: requiredString(value.updatedAt, "updatedAt"),
    search,
    replace,
    sourcePrefix: stringValue(value.sourcePrefix, "sourcePrefix"),
    targetPrefix: stringValue(value.targetPrefix, "targetPrefix"),
    associatedRules: parsedRules,
    options,
  };
}

function parseRule(value: unknown, index: number): KtcReplacementRuleDraft {
  if (!isRecord(value)) throw new Error(`关联规则 #${index + 1} 不是对象`);
  const relationKind = value.relationKind ?? "custom";
  if (typeof relationKind !== "string" || !relationKinds.has(relationKind)) {
    throw new Error(`关联规则 #${index + 1} 的 relationKind 无效`);
  }
  const source = value.source ?? "user";
  if (source !== "generated" && source !== "user") {
    throw new Error(`关联规则 #${index + 1} 的 source 无效`);
  }
  return {
    id: requiredString(value.id, "rule.id"),
    parentId: optionalString(value.parentId, "rule.parentId"),
    relationKind: relationKind as KtcReplacementRuleDraft["relationKind"],
    source,
    search: requiredString(value.search, "rule.search"),
    replace: stringValue(value.replace, "rule.replace"),
    enabled: value.enabled === undefined ? true : booleanValue(value.enabled, "rule.enabled"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, key: string): string {
  if (typeof value !== "string") throw new Error(`${key} 必须是字符串`);
  if (value.length > 4096) throw new Error(`${key} 超过 4096 个字符`);
  return value;
}

function requiredString(value: unknown, key: string): string {
  const result = stringValue(value, key).trim();
  if (!result) throw new Error(`${key} 不能为空`);
  return result;
}

function optionalString(value: unknown, key: string): string | undefined {
  return value === undefined ? undefined : stringValue(value, key);
}

function booleanValue(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${key} 必须是布尔值`);
  return value;
}
