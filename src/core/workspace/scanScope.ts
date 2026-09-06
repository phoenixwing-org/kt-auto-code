import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isIgnoredPath, shouldSkipDirName } from "../dotIgnore.js";

export const HEADER_EXTENSIONS = new Set([
  ".h", ".hh", ".hpp", ".hxx", ".inl",
]);

export const CPP_SOURCE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cxx", ".m", ".mm",
  ".catdlg", ".catnls", ".catrsc",
]);

export const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);

export const SOURCE_EXTENSIONS = new Set([
  ...HEADER_EXTENSIONS,
  ...CPP_SOURCE_EXTENSIONS,
]);

/** SCM metadata and Phoenix's own state are traversal safety boundaries, not optional Ignore rules. */
export const SCAN_SAFETY_SKIP_ENTRY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".phoenix",
]);

export const DEFAULT_SKIP_DIR_NAMES = new Set([
  ".vs",
  ".cache",
  ".next",
  ".nuxt",
  ".turbo",
  ".pnpm-store",
  "node_modules",
  "__pycache__",
  "dist",
  "build",
  "debug",
  "release",
  "coverage",
  "target",
  "out",
  "bin",
  "obj",
  ".venv",
  ".cursor",
  "install_config_win_b64",
  "win_b64",
  "intel_a",
  "toolsdata",
  "catenv",
  "importedinterfaces",
  "various",
  "protectedgenerated",
  "localgenerated",
  "objects",
]);

/** Common generated/cache directories are matched case-insensitively on every host. */
export function shouldSkipDefaultDirectoryName(name: string): boolean {
  return DEFAULT_SKIP_DIR_NAMES.has(name.toLocaleLowerCase("en-US"));
}

/** Never traverse source-control metadata or Phoenix's own generated state. */
export function shouldSkipScanSafetyEntryName(name: string): boolean {
  return SCAN_SAFETY_SKIP_ENTRY_NAMES.has(name.toLocaleLowerCase("en-US"));
}

export interface FileScopeOptions {
  includeHeaders: boolean;
  includeSource: boolean;
  includeMarkdown: boolean;
}

export const DEFAULT_FILE_SCOPE: FileScopeOptions = {
  includeHeaders: true,
  includeSource: true,
  includeMarkdown: true,
};

export function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? "" : filePath.slice(dot).toLowerCase();
}

/** 字节级扫描（头文件 ASCII 修正）扩展名 */
export function extensionsForByteScan(scope: FileScopeOptions): Set<string> {
  const out = new Set<string>();
  if (scope.includeHeaders) {
    for (const e of HEADER_EXTENSIONS) out.add(e);
  }
  if (scope.includeSource) {
    for (const e of CPP_SOURCE_EXTENSIONS) out.add(e);
  }
  return out;
}

/** 整文件编码修正扩展名 */
export function extensionsForEncodingScan(scope: FileScopeOptions): Set<string> {
  const out = extensionsForByteScan(scope);
  if (scope.includeMarkdown) {
    for (const e of MARKDOWN_EXTENSIONS) out.add(e);
  }
  return out;
}

export interface CollectScopedFilesOptions {
  root: string;
  extensions: Set<string>;
  ignorePatterns?: string[];
  skipDirNames?: Set<string>;
  useBuiltInIgnore?: boolean;
}

/** 按扩展名 + `.phoenix/.ignore` 递归收集文件 */
export function collectScopedFiles(opts: CollectScopedFilesOptions): string[] {
  const absRoot = resolve(opts.root);
  const ignorePatterns = opts.ignorePatterns ?? [];
  const skipDirs = opts.skipDirNames;
  const out: string[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        const skippedByDirectoryName = shouldSkipScanSafetyEntryName(name) || (skipDirs
          ? skipDirs.has(name)
          : opts.useBuiltInIgnore !== false
            && shouldSkipDefaultDirectoryName(name));
        if (skippedByDirectoryName) continue;
        if (shouldSkipDirName(name, ignorePatterns)) continue;
        const relDir = relative(absRoot, full).replace(/\\/g, "/");
        if (isIgnoredPath(`${relDir}/`, ignorePatterns)) continue;
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      const ext = extensionOf(full);
      if (!opts.extensions.has(ext)) continue;
      const rel = relative(absRoot, full).replace(/\\/g, "/");
      if (isIgnoredPath(rel, ignorePatterns)) continue;
      out.push(full);
    }
  }

  walk(absRoot);
  return out.sort();
}
