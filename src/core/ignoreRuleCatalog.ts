import rawCatalog from "./ignoreRuleCatalog.json";

export type KtcIgnoreRuleKind = "directory" | "file" | "pattern";

export interface KtcIgnoreRuleDefinition {
  id: string;
  value: string;
  kind: KtcIgnoreRuleKind;
  categories: readonly string[];
  description: string;
  override?: boolean;
}

export interface KtcIgnoreRuleGroupDefinition {
  id: string;
  title: string;
  description: string;
  ruleIds: readonly string[];
  includeCategories: readonly string[];
  excludeCategories: readonly string[];
  reviewRequired: boolean;
  defaultSelected: boolean;
  override?: boolean;
}

export interface KtcIgnoreRuleCatalogDocument {
  version: number;
  rules: readonly KtcIgnoreRuleDefinition[];
  groups: readonly KtcIgnoreRuleGroupDefinition[];
}

function requiredString(item: Record<string, unknown>, key: string, context: string): string {
  const value = item[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${context} 的 ${key} 无效`);
  return value;
}

function stringArray(item: Record<string, unknown>, key: string, context: string): string[] {
  const value = item[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim() !== "")) {
    throw new Error(`${context} 的 ${key} 无效`);
  }
  return [...new Set(value)];
}

function optionalBoolean(item: Record<string, unknown>, key: string, context: string): boolean | undefined {
  const value = item[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${context} 的 ${key} 无效`);
  return value;
}

function validateId(id: string, context: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`${context} ID 只允许小写字母、数字和连字符：${id}`);
}

function validateRuleValue(value: string, kind: KtcIgnoreRuleKind, context: string): void {
  const normalized = value.replace(/\\/g, "/");
  if (/[\r\n\0]/.test(value) || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`${context} 包含危险路径：${value}`);
  }
  if (kind === "directory" && !normalized.endsWith("/")) throw new Error(`${context} 的目录规则必须以 / 结尾：${value}`);
  if (kind === "file" && (normalized.endsWith("/") || value.includes("*") || value.includes("?"))) {
    throw new Error(`${context} 的文件规则不能使用目录结尾或通配符：${value}`);
  }
}

function parseRule(value: unknown, index: number): KtcIgnoreRuleDefinition {
  const context = `Ignore 规则 #${index + 1}`;
  if (!value || typeof value !== "object") throw new Error(`${context} 无效`);
  const item = value as Record<string, unknown>;
  const id = requiredString(item, "id", context);
  const ruleValue = requiredString(item, "value", context);
  const kind = requiredString(item, "kind", context);
  const description = requiredString(item, "description", context);
  const categories = stringArray(item, "categories", context);
  const override = optionalBoolean(item, "override", context);
  validateId(id, context);
  if (!["directory", "file", "pattern"].includes(kind)) throw new Error(`${context} 的 kind 无效：${kind}`);
  if (categories.length === 0) throw new Error(`${context} 至少需要一个分类`);
  validateRuleValue(ruleValue, kind as KtcIgnoreRuleKind, context);
  return { id, value: ruleValue, kind: kind as KtcIgnoreRuleKind, categories, description, override };
}

function parseGroup(value: unknown, index: number): KtcIgnoreRuleGroupDefinition {
  const context = `Ignore 小组 #${index + 1}`;
  if (!value || typeof value !== "object") throw new Error(`${context} 无效`);
  const item = value as Record<string, unknown>;
  const id = requiredString(item, "id", context);
  const title = requiredString(item, "title", context);
  const description = requiredString(item, "description", context);
  const ruleIds = stringArray(item, "ruleIds", context);
  const includeCategories = stringArray(item, "includeCategories", context);
  const excludeCategories = stringArray(item, "excludeCategories", context);
  const reviewRequired = optionalBoolean(item, "reviewRequired", context) ?? false;
  const defaultSelected = optionalBoolean(item, "defaultSelected", context) ?? false;
  const override = optionalBoolean(item, "override", context);
  validateId(id, context);
  for (const ruleId of ruleIds) validateId(ruleId, context);
  if (ruleIds.length === 0 && includeCategories.length === 0) {
    throw new Error(`${context} 至少需要 ruleIds 或 includeCategories`);
  }
  return { id, title, description, ruleIds, includeCategories, excludeCategories, reviewRequired, defaultSelected, override };
}

function assertUniqueIds(items: readonly { id: string }[], context: string): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${context} ID 重复：${item.id}`);
    ids.add(item.id);
  }
}

export function ktcParseIgnoreRuleCatalog(value: unknown): KtcIgnoreRuleCatalogDocument {
  if (!value || typeof value !== "object") throw new Error("Ignore 规则目录必须是对象");
  const catalog = value as { version?: unknown; rules?: unknown; groups?: unknown };
  if (!Number.isInteger(catalog.version) || (catalog.version as number) < 1) {
    throw new Error("Ignore 规则目录 version 必须是正整数");
  }
  if (catalog.rules !== undefined && !Array.isArray(catalog.rules)) throw new Error("Ignore 规则目录 rules 必须是数组");
  if (catalog.groups !== undefined && !Array.isArray(catalog.groups)) throw new Error("Ignore 规则目录 groups 必须是数组");
  const rules = (catalog.rules ?? []).map(parseRule);
  const groups = (catalog.groups ?? []).map(parseGroup);
  assertUniqueIds(rules, "Ignore 规则");
  assertUniqueIds(groups, "Ignore 小组");
  return { version: catalog.version as number, rules, groups };
}

export function ktcParseIgnoreRuleCatalogText(text: string): KtcIgnoreRuleCatalogDocument {
  try {
    return ktcParseIgnoreRuleCatalog(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Ignore 规则目录 JSON 无效：${error.message}`);
    throw error;
  }
}

export function ktcMergeIgnoreRuleCatalogs(
  base: KtcIgnoreRuleCatalogDocument,
  extension: KtcIgnoreRuleCatalogDocument,
): KtcIgnoreRuleCatalogDocument {
  const rules = new Map(base.rules.map((rule) => [rule.id, { ...rule, override: undefined }]));
  for (const rule of extension.rules) {
    if (rules.has(rule.id) && rule.override !== true) throw new Error(`覆盖内置 Ignore 规则必须设置 override: true：${rule.id}`);
    rules.set(rule.id, { ...rule, override: undefined });
  }
  const groups = new Map(base.groups.map((group) => [group.id, { ...group, override: undefined }]));
  for (const group of extension.groups) {
    if (groups.has(group.id) && group.override !== true) throw new Error(`覆盖内置 Ignore 小组必须设置 override: true：${group.id}`);
    groups.set(group.id, { ...group, override: undefined });
  }
  return { version: base.version, rules: [...rules.values()], groups: [...groups.values()] };
}

const KTC_IGNORE_RULE_CATALOG_DOCUMENT = ktcParseIgnoreRuleCatalog(rawCatalog);

export const KTC_IGNORE_RULE_CATALOG_VERSION = KTC_IGNORE_RULE_CATALOG_DOCUMENT.version;
export const KTC_IGNORE_RULE_CATALOG: readonly KtcIgnoreRuleDefinition[] = KTC_IGNORE_RULE_CATALOG_DOCUMENT.rules;
export const KTC_IGNORE_RULE_GROUPS: readonly KtcIgnoreRuleGroupDefinition[] = KTC_IGNORE_RULE_CATALOG_DOCUMENT.groups;

export function ktcGetBuiltinIgnoreRuleCatalog(): KtcIgnoreRuleCatalogDocument {
  return KTC_IGNORE_RULE_CATALOG_DOCUMENT;
}

export function ktcGetIgnoreRulesForCategories(
  categories: readonly string[],
  catalog: KtcIgnoreRuleCatalogDocument = KTC_IGNORE_RULE_CATALOG_DOCUMENT,
): readonly KtcIgnoreRuleDefinition[] {
  const selected = new Set(categories);
  return catalog.rules.filter((rule) => rule.categories.some((category) => selected.has(category)));
}

export function ktcListIgnoreCategories(
  catalog: KtcIgnoreRuleCatalogDocument = KTC_IGNORE_RULE_CATALOG_DOCUMENT,
): readonly string[] {
  return [...new Set(catalog.rules.flatMap((rule) => rule.categories))].sort((a, b) => a.localeCompare(b));
}

export function ktcResolveIgnoreGroupRules(
  groupId: string,
  catalog: KtcIgnoreRuleCatalogDocument = KTC_IGNORE_RULE_CATALOG_DOCUMENT,
): readonly KtcIgnoreRuleDefinition[] {
  const group = catalog.groups.find((item) => item.id === groupId);
  if (!group) throw new Error(`未知 Ignore 小组：${groupId}`);
  const explicitIds = new Set(group.ruleIds);
  for (const ruleId of explicitIds) {
    if (!catalog.rules.some((rule) => rule.id === ruleId)) throw new Error(`Ignore 小组 ${groupId} 引用了未知规则：${ruleId}`);
  }
  const selected = catalog.rules.filter((rule) => {
    const explicit = explicitIds.has(rule.id);
    const categoryMatch = group.includeCategories.length > 0
      && group.includeCategories.every((category) => rule.categories.includes(category));
    const excluded = group.excludeCategories.some((category) => rule.categories.includes(category));
    return (explicit || categoryMatch) && !excluded;
  });
  const values = new Set<string>();
  return selected.filter((rule) => !values.has(rule.value) && values.add(rule.value));
}
