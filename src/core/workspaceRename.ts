import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isIgnoredPath, loadDotIgnore } from "./dotIgnore.js";
import { detectFileEncoding, type DetectedEncoding } from "./fileEncoding.js";
import { DEFAULT_SKIP_DIR_NAMES } from "./workspace/scanScope.js";
import { ktcIsPathInsideWorkspace } from "./workspace/workspacePath.js";
import {
  replaceBufferByRules,
  replaceStringByRules,
  resolveReplacementRules,
  type ReplacementRule,
  type ReplacementTextEncoding,
  type ResolvedReplacementRule,
  type RuleMatchSummary,
} from "./replacementRules.js";

export type RenameLevel = "dir" | "file" | "text";

export interface WorkspaceRenameOptions {
  root?: string;
  oldName?: string;
  newName?: string;
  rules?: readonly ReplacementRule[];
  /** Used only when an ASCII source file receives a non-ASCII replacement. */
  defaultEncoding?: "utf8" | "gbk";
  preserveCase?: boolean;
  levels: readonly RenameLevel[];
  scope?: string;
  /** Workspace-relative files captured before preview; parent directories remain eligible for path rename. */
  includePaths?: readonly string[];
  includeIgnored?: boolean;
  ignorePatterns?: readonly string[];
  apply?: boolean;
  /** Find matching text and names without calculating or writing replacements. */
  searchOnly?: boolean;
}

export interface WorkspaceRenameHit {
  id: string;
  relativePath: string;
  fullPath: string;
  originalFullPath: string;
  plannedFullPath: string;
  level: RenameLevel;
  occurrences: number;
  lines?: number[];
  detectedEncoding?: DetectedEncoding;
  newPath?: string;
  status: "preview" | "applied" | "skipped" | "error";
  detail?: string;
  ruleMatches?: RuleMatchSummary[];
}

export interface WorkspaceRenameSummary {
  rules: number;
  matchedRules: number;
  directories: number;
  files: number;
  textFiles: number;
  replacements: number;
  skipped: number;
  errors: number;
}

export interface WorkspaceRenameReport {
  root: string;
  applied: boolean;
  searchOnly?: boolean;
  hits: WorkspaceRenameHit[];
  summary: WorkspaceRenameSummary;
}

interface WalkEntry {
  fullPath: string;
  relativePath: string;
  kind: "dir" | "file";
}

// Preserve the original desktop tool workflow: update file content first,
// then rename files, and finally rename directories.
const LEVEL_ORDER: readonly RenameLevel[] = ["text", "file", "dir"];
const BINARY_PROBE_BYTES = 8192;
const TEMP_RENAME_SUFFIX = ".__kt_rename_tmp__";
const BINARY_EXTENSIONS = new Set([
  ".7z", ".a", ".bmp", ".bz2", ".class", ".dll", ".dylib", ".eot", ".exe",
  ".fcstd", ".gif", ".gz", ".icns", ".ico", ".jpeg", ".jpg", ".o", ".otf",
  ".pdf", ".png", ".pyc", ".rar", ".so", ".tar", ".ttf", ".wasm", ".webp",
  ".woff", ".woff2", ".zip",
]);

function emptySummary(ruleCount: number): WorkspaceRenameSummary {
  return { rules: ruleCount, matchedRules: 0, directories: 0, files: 0, textFiles: 0, replacements: 0, skipped: 0, errors: 0 };
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function rulesForOptions(opts: WorkspaceRenameOptions): ResolvedReplacementRule[] {
  const source = opts.rules ?? [{ search: opts.oldName ?? "", replace: opts.newName ?? "" }];
  const effectiveSource = opts.searchOnly
    ? source.map((rule) => ({ ...rule, replace: `${rule.search}_` }))
    : source;
  // Automatic case expansion remains disabled until its matching rules are validated.
  return resolveReplacementRules(effectiveSource, false);
}

function validateOptions(opts: WorkspaceRenameOptions, rules: readonly ResolvedReplacementRule[]): void {
  if (opts.defaultEncoding !== undefined && opts.defaultEncoding !== "utf8" && opts.defaultEncoding !== "gbk") {
    throw new Error("默认编码只支持 UTF-8 或 GBK");
  }
  if (rules.some((rule) => !rule.replace) && opts.levels.some((level) => level !== "text")) {
    throw new Error("替换内容不能为空：文件名或文件夹名不能为空");
  }
  if (opts.levels.length === 0) throw new Error("至少选择一种改名级别");
  if (opts.levels.some((level) => !LEVEL_ORDER.includes(level))) {
    throw new Error("改名级别只支持 dir / file / text");
  }
  if (opts.levels.some((level) => level !== "text")) {
    for (const value of rules.flatMap((rule) => [rule.search, rule.replace])) {
      if (basename(value) !== value || value === "." || value === "..") {
        throw new Error("目录/文件改名只接受名称，不允许路径分隔符");
      }
    }
  }
}

export function ktcResolveWorkspaceWorkingDirectory(root: string, scope?: string): string {
  const workspaceRoot = resolve(root);
  const requested = scope?.trim();
  if (!requested || requested === "." || requested === "/") return workspaceRoot;
  const target = isAbsolute(requested)
    ? resolve(requested)
    : resolve(workspaceRoot, requested.replace(/^[/\\]+/, ""));
  if (!ktcIsPathInsideWorkspace(workspaceRoot, target)) {
    throw new Error("工作目录必须在当前 VS Code 工作区内");
  }
  if (!existsSync(target)) throw new Error(`工作目录不存在：${scope}`);
  if (!statSync(target).isDirectory()) throw new Error(`工作目录必须是文件夹：${scope}`);
  let cursor = workspaceRoot;
  for (const segment of relative(workspaceRoot, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`工作目录不能经过符号链接：${scope}`);
    }
  }
  return target;
}

function collectEntries(opts: WorkspaceRenameOptions, root: string, start: string): WalkEntry[] {
  const patterns = [...(opts.ignorePatterns ?? loadDotIgnore(root))];
  const out: WalkEntry[] = [];

  function walk(dir: string): void {
    let names: string[];
    try {
      names = readdirSync(dir).sort((a, b) => a.localeCompare(b));
    } catch {
      return;
    }
    for (const name of names) {
      const fullPath = join(dir, name);
      let stat;
      try {
        if (lstatSync(fullPath).isSymbolicLink()) continue;
        stat = statSync(fullPath);
      } catch {
        continue;
      }
      const relativePath = normalizeRelativePath(relative(root, fullPath));
      if (!opts.includeIgnored && isIgnoredPath(relativePath, patterns)) continue;
      if (stat.isDirectory()) {
        if (DEFAULT_SKIP_DIR_NAMES.has(name) || name.startsWith(".")) continue;
        out.push({ fullPath, relativePath, kind: "dir" });
        walk(fullPath);
      } else if (stat.isFile()) {
        out.push({ fullPath, relativePath, kind: "file" });
      }
    }
  }

  const startStat = statSync(start);
  if (startStat.isDirectory()) {
    if (start !== root) {
      out.push({ fullPath: start, relativePath: normalizeRelativePath(relative(root, start)), kind: "dir" });
    }
    walk(start);
  } else if (startStat.isFile()) {
    out.push({ fullPath: start, relativePath: normalizeRelativePath(relative(root, start)), kind: "file" });
  }
  if (!opts.includePaths) return out;
  const included = new Set(opts.includePaths.map(normalizeRelativePath));
  return out.filter((entry) => entry.kind === "file"
    ? included.has(entry.relativePath)
    : [...included].some((path) => path === entry.relativePath || path.startsWith(`${entry.relativePath}/`)));
}

function isProbablyText(fullPath: string, bytes: Buffer): boolean {
  if (BINARY_EXTENSIONS.has(extname(fullPath).toLowerCase())) return false;
  return !bytes.subarray(0, BINARY_PROBE_BYTES).includes(0);
}

function asciiOnly(value: string): boolean {
  return /^[\x00-\x7f]*$/.test(value);
}

function linesForOffsets(bytes: Buffer, offsets: readonly number[]): number[] {
  const lines: number[] = [];
  let line = 1;
  let offsetIndex = 0;
  for (let i = 0; i < bytes.length && offsetIndex < offsets.length; i++) {
    while (offsetIndex < offsets.length && offsets[offsetIndex] === i) {
      if (lines[lines.length - 1] !== line) lines.push(line);
      offsetIndex++;
    }
    if (bytes[i] === 0x0a) line++;
  }
  return lines;
}

function textRuleEncoding(
  encoding: DetectedEncoding,
  rules: readonly ResolvedReplacementRule[],
  defaultEncoding: "utf8" | "gbk",
): ReplacementTextEncoding | undefined {
  if (encoding === "ascii") {
    return rules.some((rule) => !asciiOnly(rule.replace)) ? defaultEncoding : "ascii";
  }
  if (encoding === "utf8" || encoding === "utf8-bom") {
    return "utf8";
  }
  if (encoding === "gbk") return "gbk";
  return undefined;
}

function scanTextEntry(
  entry: WalkEntry,
  opts: WorkspaceRenameOptions,
  rules: readonly ResolvedReplacementRule[],
  apply: boolean,
): WorkspaceRenameHit | undefined {
  const bytes = readFileSync(entry.fullPath);
  if (!isProbablyText(entry.fullPath, bytes)) return undefined;
  const detected = detectFileEncoding(bytes).detected;
  const defaultEncoding = opts.defaultEncoding ?? "utf8";
  const ruleEncoding = textRuleEncoding(detected, rules, defaultEncoding);
  if (!ruleEncoding) {
    return detected === "utf16-le" || detected === "utf16-be" || detected === "utf32-le"
      || detected === "utf32-be" || detected === "unknown"
      ? {
          id: `text:${entry.relativePath}`,
          relativePath: entry.relativePath,
          fullPath: entry.fullPath,
          originalFullPath: entry.fullPath,
          plannedFullPath: entry.fullPath,
          level: "text",
          occurrences: 0,
          detectedEncoding: detected,
          status: "skipped",
          detail: `暂不对 ${detected} 文件做文本替换`,
        }
      : undefined;
  }
  const replaced = replaceBufferByRules(bytes, rules, ruleEncoding);
  if (replaced.offsets.length === 0) return undefined;
  const hit: WorkspaceRenameHit = {
    id: `text:${entry.relativePath}`,
    relativePath: entry.relativePath,
    fullPath: entry.fullPath,
    originalFullPath: entry.fullPath,
    plannedFullPath: entry.fullPath,
    level: "text",
    occurrences: replaced.offsets.length,
    lines: linesForOffsets(bytes, replaced.offsets),
    detectedEncoding: detected,
    status: apply ? "applied" : "preview",
    detail: opts.searchOnly
      ? "只读搜索；未修改文件内容"
      : detected === "ascii" && ruleEncoding !== "ascii"
      ? `原文件为 ASCII 且目标含双字节字符，按默认 ${ruleEncoding === "gbk" ? "GBK" : "UTF-8"} 编码写入；保留其余字节和换行`
      : "按检测编码生成字节序列后精确替换；保留其余字节、BOM 和换行",
    ruleMatches: replaced.matches,
  };
  if (apply) writeFileSync(entry.fullPath, replaced.output);
  return hit;
}

function pathMatches(
  entries: readonly WalkEntry[],
  rules: readonly ResolvedReplacementRule[],
  level: "dir" | "file",
): WalkEntry[] {
  const matches = entries.filter((entry) =>
    entry.kind === level && replaceStringByRules(basename(entry.fullPath), rules).matches.length > 0);
  if (level === "dir") {
    return matches.sort((a, b) => b.relativePath.split("/").length - a.relativePath.split("/").length);
  }
  return matches.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function replacedBaseName(entry: WalkEntry, rules: readonly ResolvedReplacementRule[]): string {
  return replaceStringByRules(basename(entry.fullPath), rules).output;
}

function destinationFor(entry: WalkEntry, rules: readonly ResolvedReplacementRule[]): { fullPath: string; relativePath: string } {
  const replacedName = replacedBaseName(entry, rules);
  const fullPath = join(dirname(entry.fullPath), replacedName);
  const parent = dirname(entry.relativePath).replace(/\\/g, "/");
  return { fullPath, relativePath: parent === "." ? replacedName : `${parent}/${replacedName}` };
}

function pathIdentity(fullPath: string): string {
  return process.platform === "win32" || process.platform === "darwin"
    ? fullPath.toLocaleLowerCase("en-US")
    : fullPath;
}

function isSameFileSystemEntry(source: string, destination: string): boolean {
  if (source === destination) return true;
  if (!existsSync(destination)) return false;
  try {
    const sourceStat = statSync(source);
    const destinationStat = statSync(destination);
    return sourceStat.dev === destinationStat.dev && sourceStat.ino === destinationStat.ino;
  } catch {
    return false;
  }
}

function pathConflictDetails(
  entries: readonly WalkEntry[],
  rules: readonly ResolvedReplacementRule[],
): Map<string, string> {
  const conflicts = new Map<string, string>();
  const byDestination = new Map<string, Array<{ entry: WalkEntry; relativePath: string }>>();

  for (const entry of entries) {
    const destination = destinationFor(entry, rules);
    const key = pathIdentity(destination.fullPath);
    const group = byDestination.get(key) ?? [];
    group.push({ entry, relativePath: destination.relativePath });
    byDestination.set(key, group);
  }

  for (const group of byDestination.values()) {
    if (group.length < 2) continue;
    const detail = `多个项目将改为同一目标：${group[0]!.relativePath}`;
    for (const { entry } of group) conflicts.set(entry.fullPath, detail);
  }

  for (const entry of entries) {
    if (conflicts.has(entry.fullPath)) continue;
    const destination = destinationFor(entry, rules);
    if (existsSync(destination.fullPath)
      && !isSameFileSystemEntry(entry.fullPath, destination.fullPath)) {
      conflicts.set(entry.fullPath, `目标已存在：${destination.relativePath}`);
    }
  }
  return conflicts;
}

function safeRename(entry: WalkEntry, rules: readonly ResolvedReplacementRule[]): void {
  const replacedName = replacedBaseName(entry, rules);
  const destination = destinationFor(entry, rules).fullPath;
  if (entry.fullPath === destination) return;
  if (existsSync(destination)) {
    let sameFile = false;
    try {
      sameFile = statSync(entry.fullPath).ino === statSync(destination).ino;
    } catch {
      sameFile = false;
    }
    if (!sameFile) throw new Error(`目标已存在：${destination}`);
  }
  if (basename(entry.fullPath).toLowerCase() === replacedName.toLowerCase()) {
    let temporary = `${entry.fullPath}${TEMP_RENAME_SUFFIX}`;
    let index = 0;
    while (existsSync(temporary)) temporary = `${entry.fullPath}${TEMP_RENAME_SUFFIX}${++index}`;
    renameSync(entry.fullPath, temporary);
    try {
      renameSync(temporary, destination);
    } catch (error) {
      try {
        if (!existsSync(entry.fullPath)) renameSync(temporary, entry.fullPath);
      } catch {
        throw new Error(`仅大小写改名失败，且无法恢复临时路径：${temporary}`);
      }
      throw error;
    }
  } else {
    renameSync(entry.fullPath, destination);
  }
}

function pathHit(
  entry: WalkEntry,
  opts: WorkspaceRenameOptions,
  rules: readonly ResolvedReplacementRule[],
  level: "dir" | "file",
  conflictDetail?: string,
): WorkspaceRenameHit {
  const replacement = replaceStringByRules(basename(entry.fullPath), rules);
  const destination = opts.searchOnly
    ? { fullPath: entry.fullPath, relativePath: entry.relativePath }
    : destinationFor(entry, rules);
  const hit: WorkspaceRenameHit = {
    id: `${level}:${entry.relativePath}`,
    relativePath: entry.relativePath,
    fullPath: entry.fullPath,
    originalFullPath: entry.fullPath,
    plannedFullPath: destination.fullPath,
    level,
    occurrences: replacement.matches.reduce((sum, item) => sum + item.occurrences, 0),
    newPath: destination.relativePath,
    status: conflictDetail ? "error" : opts.apply ? "applied" : "preview",
    detail: opts.searchOnly ? "只读搜索；未修改名称" : conflictDetail,
    ruleMatches: replacement.matches,
  };
  if (!opts.apply || conflictDetail) return hit;
  try {
    safeRename(entry, rules);
    hit.fullPath = destination.fullPath;
  } catch (error) {
    hit.status = "error";
    hit.detail = error instanceof Error ? error.message : String(error);
  }
  return hit;
}

function summarize(
  hits: readonly WorkspaceRenameHit[],
  ruleCount: number,
): WorkspaceRenameSummary {
  const summary = emptySummary(ruleCount);
  const matchedRuleIds = new Set<string>();
  for (const hit of hits) {
    for (const match of hit.ruleMatches ?? []) matchedRuleIds.add(match.ruleId.replace(/:upper$/, ""));
    if (hit.status === "skipped") {
      summary.skipped++;
      continue;
    }
    if (hit.status === "error") {
      summary.errors++;
      continue;
    }
    if (hit.level === "dir") summary.directories++;
    if (hit.level === "file") summary.files++;
    if (hit.level === "text") summary.textFiles++;
    summary.replacements += hit.occurrences;
  }
  summary.matchedRules = matchedRuleIds.size;
  return summary;
}

function rebaseDescendantPath(fullPath: string, sourceDir: string, targetDir: string): string {
  const child = relative(sourceDir, fullPath);
  if (child === "") return targetDir;
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) return fullPath;
  return join(targetDir, child);
}

function finalizePlannedPaths(root: string, hits: WorkspaceRenameHit[], applied: boolean): void {
  const directoryMappings = hits
    .filter((hit) => hit.level === "dir" && hit.status !== "error" && hit.status !== "skipped")
    .map((hit) => ({ source: hit.originalFullPath, target: hit.plannedFullPath }));
  if (directoryMappings.length === 0) return;

  for (const hit of hits) {
    hit.plannedFullPath = directoryMappings.reduce(
      (current, mapping) => rebaseDescendantPath(current, mapping.source, mapping.target),
      hit.plannedFullPath,
    );
    if (hit.newPath !== undefined) {
      hit.newPath = normalizeRelativePath(relative(root, hit.plannedFullPath));
    }
    if (applied && hit.status === "applied") hit.fullPath = hit.plannedFullPath;
  }
}

export function runWorkspaceRename(opts: WorkspaceRenameOptions): WorkspaceRenameReport {
  const rules = rulesForOptions(opts);
  validateOptions(opts, rules);
  const root = resolve(opts.root ?? process.cwd());
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`工作目录不存在：${root}`);

  if (opts.apply) {
    const preflight = runWorkspaceRename({ ...opts, apply: false });
    if (preflight.summary.errors > 0) return preflight;
  }

  const hits: WorkspaceRenameHit[] = [];
  let workingDirectory = ktcResolveWorkspaceWorkingDirectory(root, opts.scope);

  for (const level of LEVEL_ORDER) {
    if (!opts.levels.includes(level)) continue;
    const entries = collectEntries(opts, root, workingDirectory);
    if (level === "text") {
      for (const entry of entries) {
        if (entry.kind !== "file") continue;
        try {
          const hit = scanTextEntry(entry, opts, rules, opts.apply ?? false);
          if (hit) hits.push(hit);
        } catch (error) {
          hits.push({
            id: `text:${entry.relativePath}`,
            relativePath: entry.relativePath,
            fullPath: entry.fullPath,
            originalFullPath: entry.fullPath,
            plannedFullPath: entry.fullPath,
            level: "text",
            occurrences: 0,
            status: "error",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else {
      const matches = pathMatches(entries, rules, level);
      const conflicts = opts.searchOnly ? new Map<string, string>() : pathConflictDetails(matches, rules);
      const levelHits = matches.map((entry) => pathHit(
        entry,
        opts,
        rules,
        level,
        conflicts.get(entry.fullPath),
      ));
      hits.push(...levelHits);
      if (level === "dir" && opts.apply) {
        const workingDirectoryHit = levelHits.find((hit) => (
          hit.originalFullPath === workingDirectory && hit.status === "applied"
        ));
        if (workingDirectoryHit) workingDirectory = workingDirectoryHit.fullPath;
      }
    }
  }

  const ruleCount = opts.rules?.filter((rule) => rule.enabled !== false && rule.search).length ?? 1;
  finalizePlannedPaths(root, hits, opts.apply ?? false);
  return { root, applied: opts.apply ?? false, searchOnly: opts.searchOnly ?? false, hits, summary: summarize(hits, ruleCount) };
}
