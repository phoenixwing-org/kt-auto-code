import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadDotIgnore } from "./dotIgnore.js";
import {
  collectScopedFiles,
  DEFAULT_FILE_SCOPE,
  extensionsForByteScan,
  HEADER_EXTENSIONS,
  CPP_SOURCE_EXTENSIONS,
  SOURCE_EXTENSIONS,
  type FileScopeOptions,
} from "./workspace/scanScope.js";
import {
  convertToUtf8NoBom,
  createBomScanIssue,
  detectFileBom,
  type FileBomInfo,
} from "./fileBom.js";
import {
  formatSourceEncodingReport,
  sanitizeSourcePreservingEncoding,
  scanSourceEncoding,
  type SourceEncodingIssue,
} from "./sourceEncodingScan.js";
import { detectFileEncoding } from "./fileEncoding.js";

export { HEADER_EXTENSIONS, CPP_SOURCE_EXTENSIONS, SOURCE_EXTENSIONS };

export interface CollectSourceFilesOptions {
  /** CLI 兼容：仅头文件 */
  headersOnly?: boolean;
  scope?: FileScopeOptions;
  ignorePatterns?: string[];
  useBuiltInIgnore?: boolean;
  /** Optional exact workspace-relative file set, normally expanded from a workset. */
  includePaths?: readonly string[];
}

export interface ScanWorkspaceOptions extends CollectSourceFilesOptions {
  root?: string;
  fix?: boolean;
  asciiOnly?: boolean;
  stripBom?: boolean;
}

export interface FileEncodingResult {
  filePath: string;
  issues: SourceEncodingIssue[];
  fixed: boolean;
  bom?: FileBomInfo;
}

function resolveByteScope(opts: CollectSourceFilesOptions): FileScopeOptions {
  if (opts.scope) {
    return { ...opts.scope, includeMarkdown: false };
  }
  if (opts.headersOnly) {
    return { includeHeaders: true, includeSource: false, includeMarkdown: false };
  }
  return { ...DEFAULT_FILE_SCOPE, includeMarkdown: false };
}

/** 递归收集可字节扫描的源文件（受范围与 `.phoenix/.ignore` 约束） */
export function collectSourceFiles(
  root: string,
  opts: CollectSourceFilesOptions = {},
): string[] {
  const absRoot = resolve(root);
  const scope = resolveByteScope(opts);
  const extensions = extensionsForByteScan(scope);
  if (extensions.size === 0) {
    return [];
  }
  const files = collectScopedFiles({
    root: absRoot,
    extensions,
    ignorePatterns: opts.ignorePatterns ?? loadDotIgnore(absRoot),
    useBuiltInIgnore: opts.useBuiltInIgnore,
  });
  if (!opts.includePaths) return files;
  const included = new Set(opts.includePaths.map((value) => value.replace(/\\/g, "/").replace(/^\.\//, "")));
  return files.filter((file) => included.has(relative(absRoot, file).replace(/\\/g, "/")));
}

function scanFileBytes(
  buf: Uint8Array,
  bom: FileBomInfo,
  asciiOnly: boolean,
): SourceEncodingIssue[] {
  const bomIssues: SourceEncodingIssue[] =
    bom.kind !== "none" ? [createBomScanIssue(bom) as SourceEncodingIssue] : [];

  if (bom.skipByteSanitize) {
    return bomIssues;
  }

  const scanStart = bom.bomLength;
  const slice = scanStart > 0 ? buf.subarray(scanStart) : buf;
  const detected = detectFileEncoding(slice).detected;
  const byteIssues = scanSourceEncoding(slice, {
    requireAscii: asciiOnly,
    // 一份文档只按它实际检测到的编码校验：CAA 本地 GBK 与 Qt UTF-8/GBK
    // 都是合法输入，不能再用另一套编码规则制造整行误报。
    checkGbk: detected === "gbk" || detected === "unknown",
    checkUtf8: detected === "ascii" || detected === "utf8" || detected === "unknown",
  });
  if (scanStart === 0) {
    return [...bomIssues, ...byteIssues];
  }
  const adjusted = byteIssues.map((issue) => ({
    ...issue,
    offset: issue.offset + scanStart,
  }));
  return [...bomIssues, ...adjusted];
}

export function isHeaderFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  return HEADER_EXTENSIONS.has(ext);
}

/** @deprecated 使用 collectSourceFiles + scope */
export function isScannableSourceFile(filePath: string, headersOnly = false): boolean {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  if (headersOnly) return HEADER_EXTENSIONS.has(ext);
  return SOURCE_EXTENSIONS.has(ext);
}

export function scanWorkspace(opts: ScanWorkspaceOptions = {}): FileEncodingResult[] {
  const root = resolve(opts.root ?? process.cwd());
  const files = collectSourceFiles(root, opts);
  const results: FileEncodingResult[] = [];
  const asciiOnly = opts.asciiOnly ?? false;
  const stripBom = opts.stripBom ?? false;

  for (const filePath of files) {
    const buf = new Uint8Array(readFileSync(filePath));
    const bom = detectFileBom(buf);
    const issues = scanFileBytes(buf, bom, asciiOnly);
    if (issues.length === 0) continue;

    let fixed = false;

    if (opts.fix) {
      let workBuf: Uint8Array = buf;

      if (stripBom && bom.kind !== "none") {
        const converted = convertToUtf8NoBom(buf, bom);
        if (converted) {
          workBuf = converted;
          fixed = true;
        }
      } else if (!bom.skipByteSanitize) {
        const scanStart = bom.bomLength;
        const slice = scanStart > 0 ? buf.subarray(scanStart) : buf;
        const innerIssues = scanSourceEncoding(slice, { requireAscii: asciiOnly });
        if (innerIssues.length > 0) {
          const cleaned = sanitizeSourcePreservingEncoding(slice, { preserveGbk: !asciiOnly });
          workBuf =
            scanStart > 0
              ? Uint8Array.from([...buf.subarray(0, scanStart), ...cleaned])
              : cleaned;
          fixed = true;
        }
      }

      if (fixed && stripBom && bom.kind !== "none") {
        const postBom = detectFileBom(workBuf);
        if (!postBom.skipByteSanitize) {
          const innerIssues = scanSourceEncoding(workBuf, { requireAscii: asciiOnly });
          if (innerIssues.length > 0) {
            workBuf = sanitizeSourcePreservingEncoding(workBuf, { preserveGbk: !asciiOnly });
          }
        }
      }

      if (fixed) {
        writeFileSync(filePath, Buffer.from(workBuf));
      }
    }

    results.push({ filePath, issues, fixed, bom: bom.kind !== "none" ? bom : undefined });
  }

  return results;
}

export interface WorkspaceReport {
  root: string;
  scanned: number;
  issueFiles: number;
  fixedFiles: number;
  results: FileEncodingResult[];
}

export function runWorkspaceEncodingScan(opts: ScanWorkspaceOptions = {}): WorkspaceReport {
  const root = resolve(opts.root ?? process.cwd());
  const scanned = collectSourceFiles(root, opts).length;
  const results = scanWorkspace({ ...opts, root });
  const fixedFiles = results.filter((r) => r.fixed).length;

  return {
    root,
    scanned,
    issueFiles: results.length,
    fixedFiles,
    results,
  };
}

export function formatWorkspaceReport(
  report: WorkspaceReport,
  fix: boolean,
  options: { readonly fixInstruction?: string } = {},
): string {
  const lines: string[] = [];
  if (report.results.length === 0) {
    const scope =
      report.scanned === 0
        ? "未扫描到文件（请检查范围勾选或 .phoenix/.ignore）"
        : fix && report.scanned > 0
          ? "未发现需修复的字节"
          : "未发现非 ASCII / BOM / 问题字节";
    lines.push(`${report.root}: 已扫描 ${report.scanned} 个文件，${scope}。`);
    return lines.join("\n");
  }

  for (const result of report.results) {
    lines.push(formatSourceEncodingReport(result.filePath, result.issues));
    if (result.fixed) lines.push("  → 已修复并写回\n");
    else if (result.bom?.skipByteSanitize) {
      lines.push("  → 含宽字节 BOM，未做字节级修复（请使用去除 BOM / 转 UTF-8）\n");
    }
  }

  if (fix) {
    lines.push(`共 ${report.issueFiles} 个文件有问题，已修复 ${report.fixedFiles} 个。`);
  } else {
    lines.push(`共 ${report.issueFiles} 个文件有问题。${options.fixInstruction ?? "加 --fix 可自动替换为 ASCII。"}`);
  }
  return lines.join("\n");
}
