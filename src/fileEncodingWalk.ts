import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadDotIgnore } from "./dotIgnore.js";
import {
  collectScopedFiles,
  DEFAULT_FILE_SCOPE,
  extensionsForEncodingScan,
  type FileScopeOptions,
} from "./scanScope.js";
import {
  convertFileToUtf8NoBom,
  detectFileEncoding,
  evaluateFileEncoding,
  sortEncodingRows,
  type EncodingFixRow,
} from "./fileEncoding.js";

export interface CollectEncodingFilesOptions {
  /** CLI 兼容：仅 .md / .mdx */
  markdownOnly?: boolean;
  scope?: FileScopeOptions;
  ignorePatterns?: string[];
}

export interface ScanFileEncodingOptions extends CollectEncodingFilesOptions {
  root?: string;
  convert?: boolean;
  issuesOnly?: boolean;
}

export interface FileEncodingWalkResult {
  row: EncodingFixRow;
  converted: boolean;
}

export interface FileEncodingWalkReport {
  root: string;
  scanned: number;
  issueFiles: number;
  convertedFiles: number;
  results: FileEncodingWalkResult[];
}

function resolveEncodingScope(opts: CollectEncodingFilesOptions): FileScopeOptions {
  if (opts.scope) {
    return opts.scope;
  }
  if (opts.markdownOnly) {
    return { includeHeaders: false, includeSource: false, includeMarkdown: true };
  }
  return DEFAULT_FILE_SCOPE;
}

export function collectEncodingFixFiles(
  root: string,
  opts: CollectEncodingFilesOptions = {},
): string[] {
  const absRoot = resolve(root);
  const scope = resolveEncodingScope(opts);
  const extensions = extensionsForEncodingScan(scope);
  if (extensions.size === 0) {
    return [];
  }
  return collectScopedFiles({
    root: absRoot,
    extensions,
    ignorePatterns: opts.ignorePatterns ?? loadDotIgnore(absRoot),
  });
}

function scanOneFile(filePath: string, root: string): EncodingFixRow {
  const buf = new Uint8Array(readFileSync(filePath));
  const info = detectFileEncoding(buf);
  const rel = relative(root, filePath).replace(/\\/g, "/");
  return evaluateFileEncoding(filePath, rel, info);
}

export function scanFileEncodings(opts: ScanFileEncodingOptions = {}): FileEncodingWalkReport {
  const root = resolve(opts.root ?? process.cwd());
  const files = collectEncodingFixFiles(root, opts);
  const issuesOnly = opts.issuesOnly ?? true;
  const results: FileEncodingWalkResult[] = [];

  for (const filePath of files) {
    const row = scanOneFile(filePath, root);
    if (issuesOnly && row.status === "ok") continue;
    results.push({ row, converted: false });
  }

  const sorted = sortEncodingRows(results.map((r) => r.row));
  const order = new Map(sorted.map((r, i) => [r.filePath, i]));
  results.sort((a, b) => (order.get(a.row.filePath) ?? 0) - (order.get(b.row.filePath) ?? 0));

  return {
    root,
    scanned: files.length,
    issueFiles: results.length,
    convertedFiles: 0,
    results,
  };
}

export function convertFileEncodings(opts: ScanFileEncodingOptions = {}): FileEncodingWalkReport {
  const root = resolve(opts.root ?? process.cwd());
  const files = collectEncodingFixFiles(root, opts);
  const results: FileEncodingWalkResult[] = [];
  let convertedFiles = 0;

  for (const filePath of files) {
    const buf = new Uint8Array(readFileSync(filePath));
    const info = detectFileEncoding(buf);
    const rel = relative(root, filePath).replace(/\\/g, "/");
    const row = evaluateFileEncoding(filePath, rel, info);
    let converted = false;

    if (opts.convert && row.convertible) {
      const out = convertFileToUtf8NoBom(buf, info);
      if (out) {
        writeFileSync(filePath, Buffer.from(out));
        converted = true;
        convertedFiles++;
        const afterRow = evaluateFileEncoding(filePath, rel, detectFileEncoding(out));
        results.push({ row: afterRow, converted: true });
        continue;
      }
    }

    if (row.status !== "ok") {
      results.push({ row, converted });
    }
  }

  const sorted = sortEncodingRows(results.map((r) => r.row));
  const order = new Map(sorted.map((r, i) => [r.filePath, i]));
  results.sort((a, b) => (order.get(a.row.filePath) ?? 0) - (order.get(b.row.filePath) ?? 0));

  return {
    root,
    scanned: files.length,
    issueFiles: results.filter((r) => r.row.status !== "ok").length,
    convertedFiles,
    results,
  };
}

export function runFileEncodingWalk(opts: ScanFileEncodingOptions = {}): FileEncodingWalkReport {
  if (opts.convert) {
    return convertFileEncodings(opts);
  }
  return scanFileEncodings(opts);
}

export function formatFileEncodingReport(report: FileEncodingWalkReport, convert: boolean): string {
  const lines: string[] = [];

  if (report.results.length === 0) {
    const empty =
      report.scanned === 0
        ? "未扫描到文件（请检查范围勾选或 .phoenix/.ignore）"
        : convert
          ? "无需转换"
          : "编码均符合 UTF-8 无 BOM 期望";
    lines.push(`${report.root}: 已扫描 ${report.scanned} 个文件，${empty}。`);
    return lines.join("\n");
  }

  for (const { row, converted } of report.results) {
    const flag =
      row.status === "ok" ? "ok"
      : row.status === "unsupported" ? "⚠"
      : "mismatch";
    lines.push(
      `${row.relativePath}\t${row.detected}\t${flag}\t${row.suggestedAction}`,
    );
    if (row.bomHex) {
      lines.push(`  BOM: ${row.bomHex}`);
    }
    lines.push(`  ${row.confidence}`);
    if (converted) lines.push("  → 已转换为 UTF-8 无 BOM");
  }

  if (convert) {
    lines.push(`共扫描 ${report.scanned} 个文件，已转换 ${report.convertedFiles} 个。`);
  } else {
    lines.push(`共扫描 ${report.scanned} 个文件，${report.issueFiles} 个不符合期望。`);
  }
  return lines.join("\n");
}

export function countConvertibleRows(results: FileEncodingWalkResult[]): {
  total: number;
  utf16: number;
  gbk: number;
  bom: number;
} {
  let utf16 = 0;
  let gbk = 0;
  let bom = 0;
  for (const { row } of results) {
    if (!row.convertible) continue;
    if (row.detected === "utf16-le" || row.detected === "utf16-be") utf16++;
    else if (row.detected === "gbk") gbk++;
    else if (row.detected === "utf8-bom") bom++;
  }
  return { total: utf16 + gbk + bom, utf16, gbk, bom };
}
