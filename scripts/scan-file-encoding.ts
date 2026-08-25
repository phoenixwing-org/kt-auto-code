#!/usr/bin/env tsx
/**
 * 整文件编码预检与转换（GBK / BOM / UTF-16 → UTF-8 无 BOM）。
 *
 * 用法见 docs/编码修正.md
 */
import { resolve } from "node:path";
import {
  formatFileEncodingReport,
  runFileEncodingWalk,
} from "../src/core/fileEncodingWalk.js";

interface CliOptions {
  convert: boolean;
  markdownOnly: boolean;
  root: string;
}

function usage(): never {
  console.error(`用法: scan-file-encoding.ts [选项] [根目录]

选项:
  --convert       将可转换文件写为 UTF-8 无 BOM（GBK / 去 BOM / UTF-16）
  --markdown      仅扫描 .md / .mdx
  -h, --help      显示帮助

示例:
  pnpm scan-file-encoding
  pnpm scan-file-encoding --convert
  pnpm scan-file-encoding --markdown D:\\path\\to\\project

未指定目录时默认扫描当前工作目录。`);
  process.exit(2);
}

function parseArgs(argv: string[]): CliOptions {
  let convert = false;
  let markdownOnly = false;
  let root = process.cwd();
  const positional: string[] = [];

  for (const arg of argv) {
    if (arg === "--convert" || arg === "--fix") {
      convert = true;
      continue;
    }
    if (arg === "--markdown" || arg === "--md") {
      markdownOnly = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") usage();
    positional.push(arg);
  }

  if (positional.length > 0) {
    root = resolve(positional[positional.length - 1]!);
  }

  return { convert, markdownOnly, root };
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const report = runFileEncodingWalk({
    root: opts.root,
    convert: opts.convert,
    markdownOnly: opts.markdownOnly,
  });

  console.log(formatFileEncodingReport(report, opts.convert));

  if (report.issueFiles > 0 && !opts.convert) {
    process.exitCode = 1;
  }
}

main();
