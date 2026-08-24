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
import { ktcDecodeSourceText, ktcEncodeSourceText, type KtcDecodedSourceText } from "../../core/sourceTextCodec.js";

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git", ".hg", ".svn", ".pnpm-store", "node_modules", "build", "dist", "out",
]);

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
  readonly unsupportedFileCount: number;
  readonly skippedHeaderCount: number;
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
 * absent, their canonical location is ROOT_DIR/kt/core/include.
 */
export function ktcResolveDefaultPackageIncludeDirectory(rootDirectory: string): string {
  const value = rootDirectory.trim().replace(/^(["'])(.*)\1$/, "$2");
  if (!value) return "";
  return resolve(value, "kt", "core", "include");
}

async function checkedDirectory(value: string, label: string): Promise<string> {
  if (!value.trim()) throw new Error(`${label}不能为空。`);
  const absolute = isAbsolute(value) ? resolve(value) : resolve(value);
  const info = await stat(absolute).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`${label}不存在或不是目录：${absolute}`);
  return absolute;
}

async function walkFiles(root: string, extensions: ReadonlySet<string>, signal?: AbortSignal): Promise<string[]> {
  const directories = [root];
  const files: string[] = [];
  while (directories.length > 0) {
    if (signal?.aborted) throw new Error("已停止扫描。");
    const current = directories.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (signal?.aborted) throw new Error("已停止扫描。");
      const filePath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name.toLocaleLowerCase("en-US"))) directories.push(filePath);
      } else if (entry.isFile() && extensions.has(extname(entry.name).toLocaleLowerCase("en-US"))) {
        files.push(filePath);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export async function ktcPreviewPackageIncludes(options: {
  readonly coreIncludeDirectory: string;
  readonly targetDirectory: string;
  readonly signal?: AbortSignal;
}): Promise<KtcPackageIncludePreviewSession> {
  const coreIncludeDirectory = await checkedDirectory(options.coreIncludeDirectory, "CORE include 目录");
  const targetDirectory = await checkedDirectory(options.targetDirectory, "目标目录");
  const coreHeaders = await walkFiles(coreIncludeDirectory, KTC_CMAKE_PACKAGE_HEADER_EXTENSIONS, options.signal);
  const map = ktcBuildCmakePackageHeaderMap(coreHeaders.map((filePath) => relative(coreIncludeDirectory, filePath)));
  if (map.mappings.size === 0) {
    throw new Error("CORE include 中未找到带 package 目录的可用 .h 或 .hpp 文件。");
  }

  const targetFiles = await walkFiles(targetDirectory, KTC_CMAKE_PACKAGE_TARGET_EXTENSIONS, options.signal);
  const rows: KtcPackageIncludePreviewRow[] = [];
  const files: KtcPackageIncludeSessionFile[] = [];
  let unsupportedFileCount = 0;
  for (const filePath of targetFiles) {
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
      scannedFileCount: targetFiles.length,
      unsupportedFileCount,
      skippedHeaderCount: map.skippedUnqualifiedHeaders.length,
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
