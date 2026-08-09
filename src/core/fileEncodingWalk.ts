import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { loadDotIgnore } from "./dotIgnore.js";
import {
  collectScopedFiles,
  DEFAULT_FILE_SCOPE,
  extensionsForEncodingScan,
  type FileScopeOptions,
} from "./workspace/scanScope.js";
import {
  convertFileToExpectedEncoding,
  DEFAULT_ENCODING_TARGET_POLICY,
  detectFileEncoding,
  encodingTargetPolicySummary,
  evaluateFileEncoding,
  expectedEncodingLabel,
  getExpectationForFile,
  sortEncodingRows,
  type EncodingFixRow,
  type EncodingTargetPolicy,
} from "./fileEncoding.js";

export interface CollectEncodingFilesOptions {
  /** CLI 兼容：仅 .md / .mdx */
  markdownOnly?: boolean;
  scope?: FileScopeOptions;
  ignorePatterns?: string[];
  /** Optional exact workspace-relative file set, normally expanded from a workset. */
  includePaths?: readonly string[];
}

export interface ScanFileEncodingOptions extends CollectEncodingFilesOptions {
  root?: string;
  convert?: boolean;
  issuesOnly?: boolean;
  targetPolicy?: EncodingTargetPolicy;
}

export interface FileEncodingWalkResult {
  row: EncodingFixRow;
  converted: boolean;
}

export interface FileEncodingWalkReport {
  root: string;
  targetPolicy: EncodingTargetPolicy;
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
  const files = collectScopedFiles({
    root: absRoot,
    extensions,
    ignorePatterns: opts.ignorePatterns ?? loadDotIgnore(absRoot),
  });
  if (!opts.includePaths) return files;
  const included = new Set(opts.includePaths.map((value) => value.replace(/\\/g, "/").replace(/^\.\//, "")));
  return files.filter((file) => included.has(relative(absRoot, file).replace(/\\/g, "/")));
}

function scanOneFile(
  filePath: string,
  root: string,
  targetPolicy: EncodingTargetPolicy,
): EncodingFixRow {
  const buf = new Uint8Array(readFileSync(filePath));
  const info = detectFileEncoding(buf);
  const rel = relative(root, filePath).replace(/\\/g, "/");
  return evaluateFileEncoding(
    filePath,
    rel,
    info,
    getExpectationForFile(filePath, targetPolicy),
    buf,
  );
}

export function scanFileEncodings(opts: ScanFileEncodingOptions = {}): FileEncodingWalkReport {
  const root = resolve(opts.root ?? process.cwd());
  const files = collectEncodingFixFiles(root, opts);
  const targetPolicy = opts.targetPolicy ?? DEFAULT_ENCODING_TARGET_POLICY;
  const issuesOnly = opts.issuesOnly ?? true;
  const results: FileEncodingWalkResult[] = [];

  for (const filePath of files) {
    const row = scanOneFile(filePath, root, targetPolicy);
    if (issuesOnly && row.status === "ok") continue;
    results.push({ row, converted: false });
  }

  const sorted = sortEncodingRows(results.map((r) => r.row));
  const order = new Map(sorted.map((r, i) => [r.filePath, i]));
  results.sort((a, b) => (order.get(a.row.filePath) ?? 0) - (order.get(b.row.filePath) ?? 0));

  return {
    root,
    targetPolicy,
    scanned: files.length,
    issueFiles: results.length,
    convertedFiles: 0,
    results,
  };
}

export function convertFileEncodings(opts: ScanFileEncodingOptions = {}): FileEncodingWalkReport {
  const root = resolve(opts.root ?? process.cwd());
  const files = collectEncodingFixFiles(root, opts);
  const targetPolicy = opts.targetPolicy ?? DEFAULT_ENCODING_TARGET_POLICY;
  const results: FileEncodingWalkResult[] = [];
  let convertedFiles = 0;

  for (const filePath of files) {
    const buf = new Uint8Array(readFileSync(filePath));
    const info = detectFileEncoding(buf);
    const rel = relative(root, filePath).replace(/\\/g, "/");
    const rule = getExpectationForFile(filePath, targetPolicy);
    const row = evaluateFileEncoding(filePath, rel, info, rule, buf);
    let converted = false;

    if (opts.convert && row.convertible) {
      const out = convertFileToExpectedEncoding(buf, info, row.expected);
      if (out) {
        writeFileSync(filePath, Buffer.from(out));
        converted = true;
        convertedFiles++;
        const afterRow = evaluateFileEncoding(
          filePath,
          rel,
          detectFileEncoding(out),
          rule,
          out,
        );
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
    targetPolicy,
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
          : `编码均符合项目目标（${encodingTargetPolicySummary(report.targetPolicy)}）`;
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
    if (converted) lines.push(`  → 已转换为 ${expectedEncodingLabel(row.expected)}`);
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
  targets: Record<"ascii" | "utf8" | "gbk", number>;
  actions: Record<string, number>;
} {
  let utf16 = 0;
  let gbk = 0;
  let bom = 0;
  const targets = { ascii: 0, utf8: 0, gbk: 0 };
  const actions: Record<string, number> = {};
  for (const { row } of results) {
    if (!row.convertible) continue;
    if (row.detected === "utf16-le" || row.detected === "utf16-be") utf16++;
    else if (row.detected === "gbk") gbk++;
    else if (row.detected === "utf8-bom") bom++;
    targets[row.expected]++;
    actions[row.suggestedAction] = (actions[row.suggestedAction] ?? 0) + 1;
  }
  return {
    total: targets.ascii + targets.utf8 + targets.gbk,
    utf16,
    gbk,
    bom,
    targets,
    actions,
  };
}
