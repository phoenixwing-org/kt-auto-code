import { ktcGetIgnoreRulesForCategories } from "./ignoreRuleCatalog.js";

export type KtcIgnorePresetId = "caa" | "cpp" | "web";

export interface KtcIgnorePreset {
  id: KtcIgnorePresetId;
  title: string;
  description: string;
  version: number;
  rules: readonly string[];
}

export interface KtcIgnoreManagedGroup {
  id: string;
  title: string;
  catalogVersion: number;
  rules: readonly string[];
}

interface KtcIgnorePresetDefinition {
  id: KtcIgnorePresetId;
  title: string;
  description: string;
  version: number;
  categories: readonly string[];
}

const KTC_IGNORE_PRESET_DEFINITIONS: readonly KtcIgnorePresetDefinition[] = [
  {
    id: "caa",
    title: "CAA",
    description: "CAA 生成物、平台输出与本地工程配置",
    version: 4,
    categories: ["caa"],
  },
  {
    id: "cpp",
    title: "C++",
    description: "CMake、MSBuild 与编译中间文件",
    version: 3,
    categories: ["cpp"],
  },
  {
    id: "web",
    title: "Web",
    description: "Node 依赖、构建、缓存与覆盖率输出",
    version: 1,
    categories: ["web"],
  },
];

export const KTC_IGNORE_PRESETS: readonly KtcIgnorePreset[] = KTC_IGNORE_PRESET_DEFINITIONS.map((definition) => ({
  id: definition.id,
  title: definition.title,
  description: definition.description,
  version: definition.version,
  rules: ktcGetIgnoreRulesForCategories(definition.categories).map((rule) => rule.value),
}));

export function ktcGetIgnorePreset(id: KtcIgnorePresetId): KtcIgnorePreset {
  const preset = KTC_IGNORE_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`未知 Ignore 预设：${id}`);
  return preset;
}

function markers(key: string): { start: string; end: string } {
  return {
    start: `# >>> KT Auto Code ${key}`,
    end: `# <<< KT Auto Code ${key}`,
  };
}

function newlineOf(text: string): "\r\n" | "\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function findManagedBlock(text: string, key: string): { start: number; end: number } | undefined {
  const marker = markers(key);
  const start = text.indexOf(marker.start);
  const endMarker = text.indexOf(marker.end);
  if (start < 0 && endMarker < 0) return undefined;
  if (start < 0 || endMarker < 0 || endMarker < start) {
    throw new Error(`Ignore 受管块不完整：${key}`);
  }
  const afterEnd = endMarker + marker.end.length;
  const end = text.startsWith("\r\n", afterEnd)
    ? afterEnd + 2
    : text.startsWith("\n", afterEnd) ? afterEnd + 1 : afterEnd;
  return { start, end };
}

function renderManagedBlock(key: string, lines: readonly string[], newline: string): string {
  const marker = markers(key);
  return [marker.start, ...lines, marker.end].join(newline) + newline;
}

function upsertManagedBlock(text: string, key: string, lines: readonly string[]): string {
  const newline = newlineOf(text);
  const block = renderManagedBlock(key, lines, newline);
  const found = findManagedBlock(text, key);
  if (found) return text.slice(0, found.start) + block + text.slice(found.end);
  if (!text) return block;
  const separator = text.endsWith(newline + newline) ? "" : text.endsWith(newline) ? newline : newline + newline;
  return text + separator + block;
}

function removeManagedBlockByPrefix(text: string, prefix: string): string {
  const start = text.indexOf(`# >>> KT Auto Code ${prefix}`);
  if (start < 0) return text;
  const versionEnd = text.indexOf("\n", start);
  const firstLine = text.slice(start, versionEnd < 0 ? text.length : versionEnd).replace(/\r$/, "");
  const key = firstLine.slice("# >>> KT Auto Code ".length);
  const found = findManagedBlock(text, key);
  if (!found) return text;
  let result = text.slice(0, found.start) + text.slice(found.end);
  if (found.start > 0 && result.slice(0, found.start).endsWith("\n\n") && result.slice(found.start).startsWith("\n")) {
    result = result.slice(0, found.start) + result.slice(found.start + 1);
  }
  return result;
}

function canonicalIgnoreRule(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function existingIgnoreRules(text: string): Set<string> {
  return new Set(text.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map(canonicalIgnoreRule));
}

export function ktcAppendIgnorePreset(text: string, id: KtcIgnorePresetId): string {
  const preset = ktcGetIgnorePreset(id);
  const withoutOldVersion = ktcRemoveIgnorePreset(text, id);
  return upsertManagedBlock(
    withoutOldVersion,
    `preset:${preset.id} v${preset.version}`,
    [`# ${preset.description}`, ...preset.rules],
  );
}

export function ktcRemoveIgnorePreset(text: string, id: KtcIgnorePresetId): string {
  return removeManagedBlockByPrefix(text, `preset:${id} `);
}

export function ktcAppendIgnoreGroup(text: string, group: KtcIgnoreManagedGroup): string {
  const withoutCurrent = ktcRemoveIgnoreGroup(text, group.id);
  const existing = existingIgnoreRules(withoutCurrent);
  const rules = group.rules.filter((rule, index, all) => {
    const canonical = canonicalIgnoreRule(rule);
    return canonical !== "" && !existing.has(canonical)
      && all.findIndex((candidate) => canonicalIgnoreRule(candidate) === canonical) === index;
  });
  if (rules.length === 0) return withoutCurrent;
  return upsertManagedBlock(
    withoutCurrent,
    `group:${group.id} v${group.catalogVersion}`,
    [`# ${group.title}`, ...rules],
  );
}

export function ktcRemoveIgnoreGroup(text: string, groupId: string): string {
  return removeManagedBlockByPrefix(text, `group:${groupId} `);
}

export function ktcMergeGitIgnore(text: string, gitIgnoreText: string): string {
  const lines = gitIgnoreText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, all) => line.length > 0 && all.indexOf(line) === index);
  return upsertManagedBlock(text, "source:gitignore", ["# Synced from .gitignore", ...lines]);
}
