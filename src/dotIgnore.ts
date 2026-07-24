import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  pnwCodeIsIgnoredPath,
  pnwCodeParseIgnoreText,
  pnwCodeShouldSkipDirName,
} from "@phoenix-wing/code-core";

/** 工作区下 Phoenix 配置目录 */
export const PHOENIX_CONFIG_DIR = ".phoenix";

/** `.phoenix/.ignore` 路径 */
export function phoenixIgnoreFile(root: string): string {
  return join(root, PHOENIX_CONFIG_DIR, ".ignore");
}

export function gitIgnoreFile(root: string): string {
  return join(root, ".gitignore");
}

export interface IgnoreConfigInfo {
  ignorePath: string;
  exists: boolean;
  patternCount: number;
  gitIgnoreExists: boolean;
  syncedFromGit: boolean;
  statusText: string;
}

const SYNC_HEADER =
  "# Synced from .gitignore by KT Auto Code\n"
  + "# 扫描跳过规则；目录以 / 结尾，支持 * 与 **\n\n";

const ignorePatternCache = new Map<string, { mtimeMs: number; size: number; patterns: string[] }>();

/** 若不存在 `.phoenix/.ignore`，从 `.gitignore` 同步（或创建空文件） */
export function ensurePhoenixIgnore(root: string): IgnoreConfigInfo {
  const file = phoenixIgnoreFile(root);
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    const gitFile = gitIgnoreFile(root);
    if (existsSync(gitFile)) {
      writeFileSync(file, SYNC_HEADER + readFileSync(gitFile, "utf8"), "utf8");
      ignorePatternCache.delete(file);
      return buildIgnoreConfigInfo(root, true);
    }
    writeFileSync(
      file,
      "# KT Auto Code scan ignore rules\n# 可手动添加，或点击「从 .gitignore 同步」\n\n",
      "utf8",
    );
    ignorePatternCache.delete(file);
    return buildIgnoreConfigInfo(root, false);
  }
  return buildIgnoreConfigInfo(root, false);
}

/** 强制用 `.gitignore` 覆盖 `.phoenix/.ignore` */
export function syncPhoenixIgnoreFromGit(root: string): IgnoreConfigInfo {
  const gitFile = gitIgnoreFile(root);
  if (!existsSync(gitFile)) {
    return {
      ...buildIgnoreConfigInfo(root, false),
      statusText: "工作区无 .gitignore，无法同步",
    };
  }
  mkdirSync(join(root, PHOENIX_CONFIG_DIR), { recursive: true });
  writeFileSync(phoenixIgnoreFile(root), SYNC_HEADER + readFileSync(gitFile, "utf8"), "utf8");
  ignorePatternCache.delete(phoenixIgnoreFile(root));
  return buildIgnoreConfigInfo(root, true);
}

export function buildIgnoreConfigInfo(root: string, syncedFromGit: boolean): IgnoreConfigInfo {
  const ignorePath = phoenixIgnoreFile(root);
  const exists = existsSync(ignorePath);
  const patternCount = exists ? loadDotIgnore(root).length : 0;
  const gitIgnoreExists = existsSync(gitIgnoreFile(root));
  let statusText: string;
  if (syncedFromGit) {
    statusText = `已从 .gitignore 同步，${patternCount} 条规则`;
  } else if (exists) {
    statusText = `${patternCount} 条跳过规则`;
  } else {
    statusText = "未配置";
  }
  return {
    ignorePath,
    exists,
    patternCount,
    gitIgnoreExists,
    syncedFromGit,
    statusText,
  };
}

/** 确保 ignore 文件存在后返回规则 */
export function resolveIgnorePatterns(root: string): string[] {
  ensurePhoenixIgnore(root);
  return loadDotIgnore(root);
}

export function parseDotIgnoreText(text: string): string[] {
  return pnwCodeParseIgnoreText(text);
}

export function invalidateDotIgnoreCache(root: string): void {
  ignorePatternCache.delete(phoenixIgnoreFile(root));
}

/** 读取工作区 `.phoenix/.ignore` 中的规则（类似 .gitignore 子集） */
export function loadDotIgnore(root: string): string[] {
  const file = phoenixIgnoreFile(root);
  if (!existsSync(file)) {
    return [];
  }
  try {
    const stat = statSync(file);
    const cached = ignorePatternCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return [...cached.patterns];
    }
    const patterns = parseDotIgnoreText(readFileSync(file, "utf8"));
    ignorePatternCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, patterns });
    return [...patterns];
  } catch {
    ignorePatternCache.delete(file);
    return [];
  }
}

/** 相对路径是否命中 `.ignore` 规则 */
export function isIgnoredPath(relativePath: string, patterns: string[]): boolean {
  return pnwCodeIsIgnoredPath(relativePath, patterns);
}

/** 遍历时是否跳过该目录名 */
export function shouldSkipDirName(dirName: string, patterns: string[]): boolean {
  return pnwCodeShouldSkipDirName(dirName, patterns);
}
