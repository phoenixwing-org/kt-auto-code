export const KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH = 4_096;
export const KTC_ROOT_CLEANUP_PATTERN_LIMIT = 32;
export const KTC_ROOT_CLEANUP_PATTERN_MAX_LENGTH = 128;

export const KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML = [
  "delete:",
  "  directories:",
  "    - objects",
  "    - build",
  "  files:",
  "    - '*.obj'",
  "    - '*.exp'",
  "    - '*.pdb'",
  "    - 'test_*.exe'",
].join("\n");

export interface KtcRootCleanupConfiguration {
  readonly unlinkDirectories: readonly string[];
  readonly directories: readonly string[];
  readonly files: readonly string[];
}

type CleanupList = keyof KtcRootCleanupConfiguration;

/**
 * Parse the deliberately small cleanup.yaml subset shared with Functions-Cleanup.ps1.
 * It supports only unlinkDirectories and delete.directories/delete.files lists.
 * A legacy flat scalar/list remains accepted as a direct-child file rule list.
 */
export function ktcParseRootCleanupConfigurationYaml(source: string): KtcRootCleanupConfiguration {
  if (source.length > KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH) {
    throw new Error(`Root 清理规则不能超过 ${KTC_ROOT_CLEANUP_PATTERNS_MAX_LENGTH} 个字符。`);
  }
  const meaningful = source.replace(/^\uFEFF/u, "").split(/\r?\n/u)
    .map((raw, index) => ({ raw, text: raw.trim(), number: index + 1 }))
    .filter(({ text }) => text && !text.startsWith("#"));
  if (!meaningful.length) throw new Error("请至少填写一条 Root 清理规则。");

  const structured = meaningful.some(({ text }) => /^(?:unlinkDirectories|delete):/u.test(text));
  if (!structured) {
    const files = parseLegacyFileList(meaningful);
    return freezeConfiguration([], [], files);
  }

  const values: Record<CleanupList, string[]> = {
    unlinkDirectories: [],
    directories: [],
    files: [],
  };
  let section: "unlink" | "delete" | "" = "";
  let list: CleanupList | "" = "";
  for (const { raw, text, number } of meaningful) {
    if (/^unlinkDirectories:\s*(?:\[\])?\s*(?:#.*)?$/u.test(text)) {
      section = "unlink";
      list = "unlinkDirectories";
      continue;
    }
    if (/^delete:\s*(?:#.*)?$/u.test(text)) {
      section = "delete";
      list = "";
      continue;
    }
    const deleteList = /^\s{2}(directories|files):\s*(?:\[\])?\s*(?:#.*)?$/u.exec(raw);
    if (section === "delete" && deleteList) {
      list = deleteList[1] as "directories" | "files";
      continue;
    }
    const expectedIndent = section === "unlink" ? 2 : section === "delete" ? 4 : -1;
    const item = /^(\s*)-\s+(.+?)\s*$/u.exec(raw);
    if (!list || !item || item[1]?.length !== expectedIndent) {
      throw new Error(`Root 清理规则第 ${number} 行格式不受支持。`);
    }
    const scalar = unquoteScalar(stripInlineComment(item[2] ?? ""), number);
    validateValue(list, scalar, number);
    pushUnique(values[list], scalar);
    if (values.unlinkDirectories.length + values.directories.length + values.files.length
      > KTC_ROOT_CLEANUP_PATTERN_LIMIT) {
      throw new Error(`Root 清理规则合计最多 ${KTC_ROOT_CLEANUP_PATTERN_LIMIT} 条。`);
    }
  }
  if (!values.unlinkDirectories.length && !values.directories.length && !values.files.length) {
    throw new Error("请至少填写一条有效的 Root 清理规则。");
  }
  return freezeConfiguration(values.unlinkDirectories, values.directories, values.files);
}

/** Legacy helper retained for older callers: returns only direct-child file rules. */
export function ktcParseRootCleanupPatternsYaml(source: string): readonly string[] {
  return ktcParseRootCleanupConfigurationYaml(source).files;
}

export function ktcRootCleanupFilenameMatches(
  filename: string,
  patterns: readonly string[],
): boolean {
  return patterns.some((pattern) => globExpression(pattern).test(filename));
}

function parseLegacyFileList(
  meaningful: readonly { readonly raw: string; readonly text: string; readonly number: number }[],
): string[] {
  const yamlList = meaningful.some(({ text }) => text.startsWith("-"));
  if (!yamlList && meaningful.length > 1) {
    throw new Error("Root 清理规则必须使用 YAML 列表格式，每行以“- ”开头。");
  }
  const files: string[] = [];
  for (const { text, number } of meaningful) {
    if (yamlList && !/^-\s+/u.test(text)) {
      throw new Error(`Root 清理规则第 ${number} 行必须以“- ”开头。`);
    }
    const scalar = yamlList ? text.replace(/^-\s+/u, "").trim() : text;
    const pattern = unquoteScalar(stripInlineComment(scalar), number);
    validateValue("files", pattern, number);
    pushUnique(files, pattern);
    if (files.length > KTC_ROOT_CLEANUP_PATTERN_LIMIT) {
      throw new Error(`Root 清理规则最多 ${KTC_ROOT_CLEANUP_PATTERN_LIMIT} 条。`);
    }
  }
  return files;
}

function stripInlineComment(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") || trimmed.startsWith("'")) {
    const closing = trimmed.indexOf(trimmed[0]!, 1);
    if (closing > 0 && /^\s*(?:#.*)?$/u.test(trimmed.slice(closing + 1))) {
      return trimmed.slice(0, closing + 1);
    }
    return trimmed;
  }
  return trimmed.replace(/\s+#.*$/u, "").trim();
}

function unquoteScalar(value: string, line: number): string {
  if (!value) throw new Error(`Root 清理规则第 ${line} 行不能为空。`);
  const first = value[0];
  if (first !== "\"" && first !== "'") return value;
  if (value.length < 2 || value.at(-1) !== first) {
    throw new Error(`Root 清理规则第 ${line} 行引号不完整。`);
  }
  return value.slice(1, -1);
}

function validateValue(list: CleanupList, value: string, line: number): void {
  if (!value || value.length > KTC_ROOT_CLEANUP_PATTERN_MAX_LENGTH) {
    throw new Error(`Root 清理规则第 ${line} 行长度必须为 1-${KTC_ROOT_CLEANUP_PATTERN_MAX_LENGTH}。`);
  }
  if (/\p{Cc}/u.test(value)) throw new Error(`Root 清理规则第 ${line} 行包含控制字符。`);
  if (/[\\/:\[\]]/u.test(value) || value.includes("..")) {
    throw new Error(`Root 清理规则第 ${line} 行只能使用直接子项名称，不能包含路径、..、冒号或方括号。`);
  }
  if (list === "directories" && /[*?]/u.test(value)) {
    throw new Error(`Root 清理规则第 ${line} 行的目录名不支持通配符。`);
  }
  if (list !== "directories" && value.includes("**")) {
    throw new Error(`Root 清理规则第 ${line} 行不支持递归通配符 **。`);
  }
  if (value === "." || value === ".." || !/[\p{L}\p{N}]/u.test(value)) {
    throw new Error(`Root 清理规则第 ${line} 行过于宽泛，必须包含字母或数字。`);
  }
}

function pushUnique(target: string[], value: string): void {
  if (!target.some((candidate) => candidate.localeCompare(value, undefined, { sensitivity: "accent" }) === 0)) {
    target.push(value);
  }
}

function freezeConfiguration(
  unlinkDirectories: readonly string[],
  directories: readonly string[],
  files: readonly string[],
): KtcRootCleanupConfiguration {
  return Object.freeze({
    unlinkDirectories: Object.freeze([...unlinkDirectories]),
    directories: Object.freeze([...directories]),
    files: Object.freeze([...files]),
  });
}

function globExpression(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
    .replace(/\*/gu, ".*")
    .replace(/\?/gu, ".");
  return new RegExp(`^${escaped}$`, "iu");
}
