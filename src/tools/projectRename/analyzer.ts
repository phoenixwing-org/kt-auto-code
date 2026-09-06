import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import iconv from "iconv-lite";
import { createHash } from "node:crypto";
import { isIgnoredPath, loadDotIgnore, shouldSkipDirName } from "../../core/dotIgnore.js";
import { detectFileEncoding, type DetectedEncoding } from "../../core/fileEncoding.js";
import {
  replaceBufferByRules,
  replaceStringByRules,
  resolveReplacementRules,
  type ReplacementRule,
  type ReplacementTextEncoding,
  type ResolvedReplacementRule,
} from "../../core/replacementRules.js";
import {
  ktcFinalizeWorkspaceRenamePlannedPaths,
  ktcIsProbablyTextFile,
  ktcLinesForByteOffsets,
  ktcSummarizeWorkspaceRenameHits,
  type WorkspaceRenameHit,
} from "../../core/workspaceRename.js";
import {
  shouldSkipDefaultDirectoryName,
  shouldSkipScanSafetyEntryName,
} from "../../core/workspace/scanScope.js";
import { ktcRenamePathSegmentProblem, ktcRenamePathsReferToSameEntry } from "../../core/renamePathSegment.js";
import { ktcSuggestNameReplacement } from "../../core/replacementRules.js";
import type {
  KtcProjectRenameAnalysisReport,
  KtcProjectRenameCategory,
  KtcProjectRenameHitAssessment,
  KtcProjectRenameRisk,
  KtcProjectRenameRule,
} from "./contracts.js";
import {
  ktcCountUncoveredProjectRenameCandidates,
  ktcDeriveProjectRenameRelatedCandidateDrafts,
  ktcFinalizeProjectRenameRelatedCandidates,
  type KtcProjectRenameRelatedCandidateDraft,
} from "./relatedCandidates.js";

const KTC_PROJECT_RENAME_MAX_FILE_BYTES = 8 * 1024 * 1024;
const KTC_PROJECT_RENAME_MAX_HITS = 20_000;
const KTC_PROJECT_RENAME_BATCH_SIZE = 12;

interface KtcProjectRenameEntry {
  readonly fullPath: string;
  readonly relativePath: string;
  readonly kind: "dir" | "file";
  readonly size?: number;
}

export interface KtcProjectRenameAnalysisOptions {
  readonly reportId: number;
  readonly root: string;
  readonly sourceName: string;
  readonly targetName: string;
  readonly rules: readonly KtcProjectRenameRule[];
  readonly ignorePatterns?: readonly string[];
  readonly useBuiltInIgnore?: boolean;
  readonly maxFileBytes?: number;
  readonly maxHits?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: { readonly scannedFiles: number; readonly matchedItems: number }) => void;
}

export class KtcProjectRenameCancelledError extends Error {
  constructor() {
    super("项目改名分析已取消");
    this.name = "KtcProjectRenameCancelledError";
  }
}

export async function ktcAnalyzeProjectRename(
  options: KtcProjectRenameAnalysisOptions,
): Promise<KtcProjectRenameAnalysisReport> {
  ktcThrowIfProjectRenameCancelled(options.signal);
  const root = resolve(options.root);
  // Copy caller-owned arrays before the first await so a long-running analysis
  // and its eventual execution plan share one immutable Ignore scope.
  const requestedIgnorePatterns = options.ignorePatterns === undefined
    ? undefined
    : [...options.ignorePatterns];
  const useBuiltInIgnore = options.useBuiltInIgnore ?? true;
  const rootStat = await stat(root);
  ktcThrowIfProjectRenameCancelled(options.signal);
  if (!rootStat.isDirectory()) throw new Error(`分析根目录必须是文件夹：${root}`);
  const activeRules = ktcActiveProjectRenameRules(options.rules);
  if (activeRules.length === 0) throw new Error("至少需要一条启用且完整的改名规则");
  const resolvedRules = resolveReplacementRules(activeRules, false);
  const activeRuleIdentities = new Set(activeRules.map((rule) => `${rule.search}\u0000${rule.replace}`));
  const relatedDrafts = ktcDeriveProjectRenameRelatedCandidateDrafts(options.sourceName, options.targetName)
    .filter((draft) => !activeRuleIdentities.has(`${draft.search}\u0000${draft.replace}`));
  const relatedOccurrences = new Map<string, number>();
  const relatedItems = new Map<string, number>();
  const recordRelatedCandidates = (input: string): void => {
    const counts = ktcCountUncoveredProjectRenameCandidates(input, relatedDrafts);
    for (const [id, count] of Object.entries(counts)) {
      relatedOccurrences.set(id, (relatedOccurrences.get(id) ?? 0) + count);
      relatedItems.set(id, (relatedItems.get(id) ?? 0) + 1);
    }
  };
  const ignorePatterns = Object.freeze(requestedIgnorePatterns ?? [...loadDotIgnore(root)]);
  const entries = await ktcCollectProjectRenameEntries(root, ignorePatterns, useBuiltInIgnore, options.signal);
  for (const entry of entries) {
    ktcThrowIfProjectRenameCancelled(options.signal);
    recordRelatedCandidates(basename(entry.fullPath));
  }
  const hits: WorkspaceRenameHit[] = [];
  const assessments: Record<string, KtcProjectRenameHitAssessment> = {};
  const maxHits = options.maxHits ?? KTC_PROJECT_RENAME_MAX_HITS;
  const stats = {
    scannedDirectories: entries.filter((entry) => entry.kind === "dir").length,
    scannedFiles: 0,
    skippedBinaryFiles: 0,
    skippedLargeFiles: 0,
    skippedUnsupportedEncodingFiles: 0,
    truncated: false,
  };

  const pathEntries = entries.filter((entry) => (
    replaceStringByRules(basename(entry.fullPath), resolvedRules).matches.length > 0
  )).sort((left, right) => (
    left.kind === right.kind
      ? left.kind === "dir"
        ? right.relativePath.split("/").length - left.relativePath.split("/").length
        : left.relativePath.localeCompare(right.relativePath)
      : left.kind === "file" ? -1 : 1
  ));
  const pathTargets = new Map<string, KtcProjectRenameEntry[]>();
  for (const entry of pathEntries) {
    ktcThrowIfProjectRenameCancelled(options.signal);
    if (hits.length >= maxHits) {
      stats.truncated = true;
      break;
    }
    const replacement = replaceStringByRules(basename(entry.fullPath), resolvedRules);
    const segmentProblem = ktcRenamePathSegmentProblem(replacement.output);
    const targetPath = segmentProblem ? entry.fullPath : join(dirname(entry.fullPath), replacement.output);
    const targetRelativePath = segmentProblem ? entry.relativePath : ktcRelativeProjectPath(root, targetPath);
    if (!segmentProblem) {
      const identity = ktcProjectPathIdentity(targetPath);
      const targetEntries = pathTargets.get(identity) ?? [];
      targetEntries.push(entry);
      pathTargets.set(identity, targetEntries);
    }
    const hit: WorkspaceRenameHit = {
      id: `${entry.kind === "dir" ? "dir" : "file"}:${entry.relativePath}`,
      relativePath: entry.relativePath,
      fullPath: entry.fullPath,
      originalFullPath: entry.fullPath,
      plannedFullPath: targetPath,
      level: entry.kind === "dir" ? "dir" : "file",
      occurrences: replacement.matches.reduce((sum, match) => sum + match.occurrences, 0),
      newPath: targetRelativePath,
      status: segmentProblem ? "error" : "preview",
      detail: segmentProblem ?? "只读项目改名分析；未修改名称",
      ruleMatches: replacement.matches,
    };
    hits.push(hit);
    assessments[hit.id] = ktcAssessProjectRenameHit(hit);
  }
  await ktcApplyProjectRenamePathConflicts(pathTargets, hits, assessments, options.signal);

  const files = entries.filter((entry) => entry.kind === "file");
  for (let offset = 0; offset < files.length && !stats.truncated; offset += KTC_PROJECT_RENAME_BATCH_SIZE) {
    ktcThrowIfProjectRenameCancelled(options.signal);
    const batch = files.slice(offset, offset + KTC_PROJECT_RENAME_BATCH_SIZE);
    const results = await Promise.all(batch.map((entry) => ktcScanProjectRenameTextEntry(
      entry,
      resolvedRules,
      relatedDrafts,
      options.maxFileBytes ?? KTC_PROJECT_RENAME_MAX_FILE_BYTES,
      options.signal,
    )));
    for (const result of results) {
      for (const [id, count] of Object.entries(result.relatedCandidateCounts)) {
        relatedOccurrences.set(id, (relatedOccurrences.get(id) ?? 0) + count);
        relatedItems.set(id, (relatedItems.get(id) ?? 0) + 1);
      }
      stats.scannedFiles += 1;
      if (result.kind === "binary") stats.skippedBinaryFiles += 1;
      if (result.kind === "large") stats.skippedLargeFiles += 1;
      if (result.kind === "unsupported") stats.skippedUnsupportedEncodingFiles += 1;
      if (result.kind !== "hit") continue;
      if (hits.length >= maxHits) {
        stats.truncated = true;
        break;
      }
      hits.push(result.hit);
      assessments[result.hit.id] = ktcAssessProjectRenameHit(result.hit);
    }
    options.onProgress?.({ scannedFiles: stats.scannedFiles, matchedItems: hits.length });
    await new Promise<void>((resolveYield) => setImmediate(resolveYield));
    ktcThrowIfProjectRenameCancelled(options.signal);
  }

  ktcFinalizeWorkspaceRenamePlannedPaths(root, hits, false);
  const riskSummary: Record<KtcProjectRenameRisk, number> = { high: 0, medium: 0, low: 0 };
  for (const hit of hits) riskSummary[assessments[hit.id]!.risk] += 1;
  const rootSuggestion = ktcSuggestNameReplacement(basename(root), activeRules, false);
  return {
    reportId: options.reportId,
    root,
    sourceName: options.sourceName,
    targetName: options.targetName,
    rules: options.rules.map((rule) => ({ ...rule })),
    ignorePatterns,
    useBuiltInIgnore,
    ...(rootSuggestion ? {
      rootSuggestion: { currentName: rootSuggestion.currentName, suggestedName: rootSuggestion.suggestedName },
    } : {}),
    workspaceReport: {
      root,
      applied: false,
      searchOnly: false,
      hits,
      summary: ktcSummarizeWorkspaceRenameHits(hits, activeRules.length),
    },
    assessments,
    riskSummary,
    stats,
    relatedCandidates: ktcFinalizeProjectRenameRelatedCandidates(
      relatedDrafts,
      relatedOccurrences,
      relatedItems,
    ),
  };
}

function ktcActiveProjectRenameRules(rules: readonly KtcProjectRenameRule[]): ReplacementRule[] {
  const searches = new Set<string>();
  const result: ReplacementRule[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !rule.search || !rule.replace || searches.has(rule.search)) continue;
    searches.add(rule.search);
    result.push({ id: rule.id, search: rule.search, replace: rule.replace, enabled: true });
  }
  return result;
}

async function ktcCollectProjectRenameEntries(
  root: string,
  ignorePatterns: readonly string[],
  useBuiltInIgnore: boolean,
  signal?: AbortSignal,
): Promise<KtcProjectRenameEntry[]> {
  const result: KtcProjectRenameEntry[] = [];
  const walk = async (directory: string): Promise<void> => {
    ktcThrowIfProjectRenameCancelled(signal);
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      ktcThrowIfProjectRenameCancelled(signal);
      if (entry.isSymbolicLink()) continue;
      if (shouldSkipScanSafetyEntryName(entry.name)) continue;
      const fullPath = join(directory, entry.name);
      const relativePath = ktcRelativeProjectPath(root, fullPath);
      if (entry.isDirectory()) {
        if ((useBuiltInIgnore && shouldSkipDefaultDirectoryName(entry.name))
          || shouldSkipDirName(entry.name, [...ignorePatterns])
          || isIgnoredPath(`${relativePath}/`, [...ignorePatterns])) continue;
        result.push({ fullPath, relativePath, kind: "dir" });
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || isIgnoredPath(relativePath, [...ignorePatterns])) continue;
      try {
        const fileStat = await lstat(fullPath);
        if (fileStat.isSymbolicLink() || !fileStat.isFile()) continue;
        result.push({ fullPath, relativePath, kind: "file", size: fileStat.size });
      } catch {
        // Files may disappear during a long analysis; skip them without failing the whole report.
      }
    }
  };
  await walk(root);
  return result;
}

type KtcProjectRenameTextScanResult =
  | {
      readonly kind: "none" | "binary" | "large" | "unsupported";
      readonly relatedCandidateCounts: Readonly<Record<string, number>>;
    }
  | {
      readonly kind: "hit";
      readonly hit: WorkspaceRenameHit;
      readonly relatedCandidateCounts: Readonly<Record<string, number>>;
    };

async function ktcScanProjectRenameTextEntry(
  entry: KtcProjectRenameEntry,
  rules: readonly ResolvedReplacementRule[],
  relatedDrafts: readonly KtcProjectRenameRelatedCandidateDraft[],
  maxFileBytes: number,
  signal?: AbortSignal,
): Promise<KtcProjectRenameTextScanResult> {
  ktcThrowIfProjectRenameCancelled(signal);
  if ((entry.size ?? 0) > maxFileBytes) return { kind: "large", relatedCandidateCounts: {} };
  let bytes: Buffer;
  try {
    bytes = await readFile(entry.fullPath);
  } catch {
    return { kind: "none", relatedCandidateCounts: {} };
  }
  ktcThrowIfProjectRenameCancelled(signal);
  if (bytes.length > maxFileBytes) return { kind: "large", relatedCandidateCounts: {} };
  if (!ktcIsProbablyTextFile(entry.fullPath, bytes)) return { kind: "binary", relatedCandidateCounts: {} };
  const detected = detectFileEncoding(bytes).detected;
  const encoding = ktcProjectRenameTextEncoding(detected, rules);
  const text = ktcDecodeProjectRenameText(bytes, detected);
  if (!encoding || text === undefined) return { kind: "unsupported", relatedCandidateCounts: {} };
  const relatedCandidateCounts = ktcCountUncoveredProjectRenameCandidates(text, relatedDrafts);
  ktcThrowIfProjectRenameCancelled(signal);
  let replaced;
  try {
    replaced = replaceBufferByRules(bytes, rules, encoding);
  } catch {
    return { kind: "unsupported", relatedCandidateCounts: {} };
  }
  if (replaced.offsets.length === 0) return { kind: "none", relatedCandidateCounts };
  return {
    kind: "hit",
    relatedCandidateCounts,
    hit: {
      id: `text:${entry.relativePath}`,
      relativePath: entry.relativePath,
      fullPath: entry.fullPath,
      originalFullPath: entry.fullPath,
      plannedFullPath: entry.fullPath,
      level: "text",
      occurrences: replaced.offsets.length,
      lines: ktcLinesForByteOffsets(bytes, replaced.offsets),
      detectedEncoding: detected,
      sourceHash: createHash("sha256").update(bytes).digest("hex"),
      status: "preview",
      detail: "只读项目改名分析；未修改文件内容",
      ruleMatches: replaced.matches,
    },
  };
}

function ktcDecodeProjectRenameText(bytes: Buffer, detected: DetectedEncoding): string | undefined {
  if (detected === "ascii" || detected === "utf8") return bytes.toString("utf8");
  if (detected === "utf8-bom") return bytes.subarray(3).toString("utf8");
  if (detected === "gbk") return iconv.decode(bytes, "gbk");
  return undefined;
}

function ktcProjectRenameTextEncoding(
  detected: DetectedEncoding,
  rules: readonly ResolvedReplacementRule[],
): ReplacementTextEncoding | undefined {
  if (detected === "ascii") {
    return rules.some((rule) => !/^[\x00-\x7f]*$/u.test(rule.replace)) ? "utf8" : "ascii";
  }
  if (detected === "utf8" || detected === "utf8-bom") return "utf8";
  if (detected === "gbk") return "gbk";
  return undefined;
}

async function ktcApplyProjectRenamePathConflicts(
  pathTargets: ReadonlyMap<string, readonly KtcProjectRenameEntry[]>,
  hits: WorkspaceRenameHit[],
  assessments: Record<string, KtcProjectRenameHitAssessment>,
  signal?: AbortSignal,
): Promise<void> {
  const bySource = new Map(hits.filter((hit) => hit.level !== "text").map((hit) => [hit.originalFullPath, hit]));
  for (const entries of pathTargets.values()) {
    ktcThrowIfProjectRenameCancelled(signal);
    if (entries.length < 2) continue;
    for (const entry of entries) {
      const hit = bySource.get(entry.fullPath);
      if (hit) ktcMarkProjectRenameConflict(hit, assessments, `多个来源映射到同一目标：${hit.newPath}`);
    }
  }
  for (const hit of hits.filter((candidate) => candidate.level !== "text" && candidate.status !== "error")) {
    ktcThrowIfProjectRenameCancelled(signal);
    if (hit.originalFullPath === hit.plannedFullPath) continue;
    let targetStat;
    try {
      targetStat = await lstat(hit.plannedFullPath);
    } catch (error) {
      ktcThrowIfProjectRenameCancelled(signal);
      if (ktcProjectRenamePathIsMissing(error)) continue;
      ktcMarkProjectRenameConflict(hit, assessments, `无法安全检查目标路径：${hit.newPath}`);
      continue;
    }
    if (targetStat.isSymbolicLink()) {
      ktcMarkProjectRenameConflict(hit, assessments, `目标已存在：${hit.newPath}`);
      continue;
    }
    let sourceStat;
    let sourceRealPath;
    let targetRealPath;
    try {
      [sourceStat, sourceRealPath, targetRealPath] = await Promise.all([
        lstat(hit.originalFullPath),
        realpath(hit.originalFullPath),
        realpath(hit.plannedFullPath),
      ]);
    } catch {
      ktcThrowIfProjectRenameCancelled(signal);
      // The destination entry exists (lstat succeeded) but at least one path
      // cannot be canonicalized, including a dangling symlink. Fail closed.
      ktcMarkProjectRenameConflict(hit, assessments, `目标已存在且无法安全确认：${hit.newPath}`);
      continue;
    }
    ktcThrowIfProjectRenameCancelled(signal);
    const samePathIdentity = ktcProjectPathIdentity(hit.originalFullPath)
      === ktcProjectPathIdentity(hit.plannedFullPath);
    if (samePathIdentity && ktcRenamePathsReferToSameEntry(
      sourceRealPath,
      targetRealPath,
      sourceStat,
      targetStat,
    )) continue;
    ktcMarkProjectRenameConflict(hit, assessments, `目标已存在：${hit.newPath}`);
  }
}

function ktcProjectRenamePathIsMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

function ktcMarkProjectRenameConflict(
  hit: WorkspaceRenameHit,
  assessments: Record<string, KtcProjectRenameHitAssessment>,
  detail: string,
): void {
  hit.status = "error";
  hit.detail = detail;
  assessments[hit.id] = {
    ...ktcAssessProjectRenameHit(hit),
    risk: "high",
    riskReason: "目标路径冲突会阻断改名",
  };
}

function ktcAssessProjectRenameHit(hit: WorkspaceRenameHit): KtcProjectRenameHitAssessment {
  const category = ktcProjectRenameCategory(hit);
  const risk = hit.status === "error" ? "high" : ktcProjectRenameCategoryRisk(category, hit.relativePath);
  return {
    category,
    categoryLabel: ktcProjectRenameCategoryLabel(category),
    risk,
    riskReason: hit.status === "error" ? "目标路径冲突会阻断改名" : ktcProjectRenameRiskReason(category, risk),
    replacementPreview: (hit.ruleMatches ?? [])
      .slice(0, 4)
      .map((match) => `${match.search} → ${match.replace} ×${match.occurrences}`)
      .join(" · "),
  };
}

function ktcProjectRenameCategory(hit: WorkspaceRenameHit): KtcProjectRenameCategory {
  if (hit.level === "dir") return "directory";
  if (hit.level === "file") return "file-name";
  const path = hit.relativePath.replace(/\\/gu, "/");
  const lower = path.toLocaleLowerCase("en-US");
  const name = basename(lower);
  if (name === "package.json" || /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/u.test(lower)) {
    return "package-contract";
  }
  if (lower.startsWith(".github/") || /(?:^|\/)(?:gitlab-ci\.yml|azure-pipelines\.ya?ml|jenkinsfile)$/u.test(lower)) return "ci";
  if (name.startsWith(".env") || (hit.ruleMatches ?? []).some((match) => /^[A-Z][A-Z0-9_]+$/u.test(match.search))) {
    return "environment";
  }
  if (/(?:^|\/)(?:vite|webpack|rollup|rspack|tsconfig|eslint|prettier|babel|postcss|tailwind|turbo|nx)[^/]*\.(?:[cm]?[jt]s|json|ya?ml)$/u.test(lower)) {
    return "build-config";
  }
  if (/\.(?:md|mdx|rst|adoc|txt)$/u.test(lower) || /(?:^|\/)docs?\//u.test(lower)) return "documentation";
  if (/\.(?:[cm]?[jt]sx?|vue|svelte|astro|css|scss|less|html)$/u.test(lower)) return "source";
  return "content";
}

function ktcProjectRenameCategoryLabel(category: KtcProjectRenameCategory): string {
  const labels: Record<KtcProjectRenameCategory, string> = {
    "package-contract": "包与锁文件",
    environment: "环境变量",
    "build-config": "构建配置",
    ci: "CI / 自动化",
    source: "源码与引用",
    documentation: "文档",
    "file-name": "文件名",
    directory: "目录名",
    content: "其他文本",
  };
  return labels[category];
}

function ktcProjectRenameCategoryRisk(category: KtcProjectRenameCategory, path: string): KtcProjectRenameRisk {
  if (category === "package-contract" && basename(path).toLocaleLowerCase("en-US") === "package.json") return "high";
  if (category === "environment" || category === "build-config" || category === "ci") return "high";
  if (category === "documentation") return "low";
  return "medium";
}

function ktcProjectRenameRiskReason(category: KtcProjectRenameCategory, risk: KtcProjectRenameRisk): string {
  if (category === "package-contract") return "可能影响包名、依赖解析或锁文件一致性";
  if (category === "environment") return "生产者与消费者必须同步更新";
  if (category === "build-config") return "可能影响构建入口、别名或输出路径";
  if (category === "ci") return "可能影响自动化、发布或部署";
  if (category === "documentation") return "通常只影响说明与链接";
  if (category === "directory" || category === "file-name") return "路径变化需要同步检查引用与大小写";
  return risk === "medium" ? "需要复核代码引用和公开契约" : "需要人工复核";
}

function ktcRelativeProjectPath(root: string, fullPath: string): string {
  return relative(root, fullPath).replace(/\\/gu, "/");
}

function ktcProjectPathIdentity(path: string): string {
  return process.platform === "win32" || process.platform === "darwin"
    ? path.toLocaleLowerCase("en-US")
    : path;
}

function ktcThrowIfProjectRenameCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new KtcProjectRenameCancelledError();
}
