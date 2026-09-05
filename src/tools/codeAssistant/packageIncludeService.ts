import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import {
  KTC_CMAKE_PACKAGE_HEADER_EXTENSIONS,
  KTC_CMAKE_PACKAGE_TARGET_EXTENSIONS,
  ktcApplyCmakePackageIncludeMatches,
  ktcBuildCmakePackageHeaderMap,
  ktcFindCmakePackageIncludeMatches,
  type KtcCmakePackageHeaderCollision,
  type KtcCmakePackageIncludeMatch,
} from "../../core/cmakePackageIncludes.js";
import { isIgnoredPath, shouldSkipDirName } from "../../core/dotIgnore.js";
import {
  shouldSkipDefaultDirectoryName,
  shouldSkipScanSafetyEntryName,
} from "../../core/workspace/scanScope.js";
import { ktcDecodeSourceText, ktcEncodeSourceText, type KtcDecodedSourceText } from "../../core/sourceTextCodec.js";

export interface KtcPackageIncludePreviewRow {
  readonly id: string;
  readonly filePath: string;
  readonly relativePath: string;
  readonly fileName: string;
  readonly directory: string;
  readonly line: number;
  readonly oldValue: string;
  readonly newValue: string;
}

export interface KtcPackageIncludePreview {
  readonly coreIncludeDirectory: string;
  readonly targetDirectory: string;
  readonly headerCount: number;
  readonly scannedFileCount: number;
  readonly ignoredDirectoryCount: number;
  readonly unsupportedFileCount: number;
  readonly skippedHeaderCount: number;
  readonly skippedHeaders: readonly string[];
  readonly collisions: readonly KtcCmakePackageHeaderCollision[];
  readonly rows: readonly KtcPackageIncludePreviewRow[];
}

interface KtcPackageIncludeSessionFile {
  readonly filePath: string;
  readonly relativePath: string;
  readonly fingerprint: string;
  readonly encoding: KtcDecodedSourceText["encoding"];
  readonly matches: readonly KtcCmakePackageIncludeMatch[];
}

export interface KtcPackageIncludePreviewSession {
  readonly preview: KtcPackageIncludePreview;
  readonly files: readonly KtcPackageIncludeSessionFile[];
}

export interface KtcPackageIncludeApplyResult {
  readonly changedFiles: number;
  readonly changedIncludes: number;
}

/**
 * ROOT_DIR_INCLUDE points at the public KtCore directory. The package map
 * needs its parent (.../include) so it can retain KtCore/... in results.
 */
export function ktcResolvePackageIncludeDirectoryFromPublicInclude(includeRoot: string): string {
  const value = includeRoot.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!value) return "";
  const absolute = resolve(value);
  return basename(absolute).toLocaleLowerCase("en-US") === "ktcore" ? dirname(absolute) : absolute;
}

/**
 * KtCore headers are shared on every platform. When ROOT_DIR_INCLUDE is
 * absent, their canonical location is ROOT_DIR/SDK_PREFIX/core/include.
 * SDK_PREFIX is one directory segment and defaults to "kt".
 */
export function ktcResolveDefaultPackageIncludeDirectory(rootDirectory: string, sdkPrefix = "kt"): string {
  const value = rootDirectory.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!value) return "";
  const prefix = sdkPrefix.trim().replace(/^(["'])(.*)\1$/, "$2") || "kt";
  if (isAbsolute(prefix) || prefix === "." || prefix === ".." || /[\\/]/u.test(prefix)) {
    throw new Error("SDK_PREFIX 必须是单个目录名称。");
  }
  return resolve(value, prefix, "core", "include");
}

async function checkedDirectory(value: string, label: string): Promise<string> {
  if (!value.trim()) throw new Error(`${label}不能为空。`);
  const absolute = isAbsolute(value) ? resolve(value) : resolve(value);
  const info = await stat(absolute).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`${label}不存在或不是目录：${absolute}`);
  return absolute;
}

interface KtcPackageIncludeWalkResult {
  readonly files: readonly string[];
  readonly ignoredDirectoryCount: number;
}

async function walkFiles(
  root: string,
  extensions: ReadonlySet<string>,
  ignorePatterns: readonly string[],
  useBuiltInIgnore: boolean,
  signal?: AbortSignal,
): Promise<KtcPackageIncludeWalkResult> {
  const directories = [root];
  const files: string[] = [];
  let ignoredDirectoryCount = 0;
  while (directories.length > 0) {
    if (signal?.aborted) throw new Error("已停止扫描。");
    const current = directories.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (signal?.aborted) throw new Error("已停止扫描。");
      if (shouldSkipScanSafetyEntryName(entry.name)) {
        if (entry.isDirectory()) ignoredDirectoryCount += 1;
        continue;
      }
      const filePath = join(current, entry.name);
      if (entry.isDirectory()) {
        const relativePath = relative(root, filePath).replace(/\\/g, "/");
        const ignored = (useBuiltInIgnore && shouldSkipDefaultDirectoryName(entry.name))
          || shouldSkipDirName(entry.name, [...ignorePatterns])
          || isIgnoredPath(`${relativePath}/`, [...ignorePatterns]);
        if (ignored) ignoredDirectoryCount += 1;
        else directories.push(filePath);
      } else if (entry.isFile() && extensions.has(extname(entry.name).toLocaleLowerCase("en-US"))) {
        const relativePath = relative(root, filePath).replace(/\\/g, "/");
        if (!isIgnoredPath(relativePath, [...ignorePatterns])) files.push(filePath);
      }
    }
  }
  return { files: files.sort((a, b) => a.localeCompare(b)), ignoredDirectoryCount };
}

export async function ktcPreviewPackageIncludes(options: {
  readonly coreIncludeDirectory: string;
  readonly targetDirectory: string;
  readonly coreIgnorePatterns?: readonly string[];
  readonly targetIgnorePatterns?: readonly string[];
  readonly useBuiltInIgnore?: boolean;
  readonly signal?: AbortSignal;
}): Promise<KtcPackageIncludePreviewSession> {
  const coreIncludeDirectory = await checkedDirectory(options.coreIncludeDirectory, "CORE include 目录");
  const targetDirectory = await checkedDirectory(options.targetDirectory, "目标目录");
  const coreWalk = await walkFiles(
    coreIncludeDirectory,
    KTC_CMAKE_PACKAGE_HEADER_EXTENSIONS,
    options.coreIgnorePatterns ?? [],
    options.useBuiltInIgnore ?? true,
    options.signal,
  );
  if (coreWalk.files.length === 0) {
    throw new Error("CORE include 中未找到 .h 或 .hpp 文件。");
  }
  const map = ktcBuildCmakePackageHeaderMap(coreWalk.files.map((filePath) => relative(coreIncludeDirectory, filePath)));

  const targetWalk = await walkFiles(
    targetDirectory,
    KTC_CMAKE_PACKAGE_TARGET_EXTENSIONS,
    options.targetIgnorePatterns ?? [],
    options.useBuiltInIgnore ?? true,
    options.signal,
  );
  const rows: KtcPackageIncludePreviewRow[] = [];
  const files: KtcPackageIncludeSessionFile[] = [];
  let unsupportedFileCount = 0;
  for (const filePath of targetWalk.files) {
    if (options.signal?.aborted) throw new Error("已停止扫描。");
    const decoded = ktcDecodeSourceText(await readFile(filePath));
    if (!decoded) {
      unsupportedFileCount += 1;
      continue;
    }
    const matches = ktcFindCmakePackageIncludeMatches(decoded.text, map.mappings);
    if (matches.length === 0) continue;
    const relativePath = relative(targetDirectory, filePath).replace(/\\/g, "/");
    files.push({ filePath, relativePath, fingerprint: decoded.fingerprint, encoding: decoded.encoding, matches });
    for (const match of matches) {
      rows.push({
        id: `${relativePath}:${match.line}`,
        filePath,
        relativePath,
        fileName: basename(filePath),
        directory: dirname(relativePath).replace(/\\/g, "/").replace(/^\.$/, ""),
        line: match.line,
        oldValue: match.oldValue,
        newValue: match.newValue,
      });
    }
  }

  return {
    preview: {
      coreIncludeDirectory,
      targetDirectory,
      headerCount: map.mappings.size,
      scannedFileCount: targetWalk.files.length,
      ignoredDirectoryCount: coreWalk.ignoredDirectoryCount + targetWalk.ignoredDirectoryCount,
      unsupportedFileCount,
      skippedHeaderCount: map.skippedUnqualifiedHeaders.length,
      skippedHeaders: map.skippedUnqualifiedHeaders,
      collisions: map.collisions,
      rows,
    },
    files,
  };
}

/** Fails closed when any previewed file has changed after Preview. */
export async function ktcApplyPackageIncludes(session: KtcPackageIncludePreviewSession): Promise<KtcPackageIncludeApplyResult> {
  for (const file of session.files) {
    const current = ktcDecodeSourceText(await readFile(file.filePath));
    if (!current || current.fingerprint !== file.fingerprint) {
      throw new Error(`预览后文件已改变，请重新预览：${file.relativePath}`);
    }
  }
  let changedFiles = 0;
  let changedIncludes = 0;
  for (const file of session.files) {
    const current = ktcDecodeSourceText(await readFile(file.filePath));
    if (!current) throw new Error(`无法读取文件：${file.relativePath}`);
    const text = ktcApplyCmakePackageIncludeMatches(current.text, file.matches);
    if (text === current.text) continue;
    await writeFile(file.filePath, ktcEncodeSourceText(text, file.encoding));
    changedFiles += 1;
    changedIncludes += file.matches.length;
  }
  return { changedFiles, changedIncludes };
}
