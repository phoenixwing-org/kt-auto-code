#!/usr/bin/env tsx
/**
 * 扫描源文件在 GBK（CP936）/ UTF-8 下的非法字节，并可就地修复 Windows-1252 弯引号等。
 *
 * 用法见 doc/源文件编码扫描.md
 */
import { resolve } from "node:path";
import {
  formatWorkspaceReport,
  runWorkspaceEncodingScan,
} from "../src/sourceEncodingWalk.js";

interface CliOptions {
  fix: boolean;
  headersOnly: boolean;
  asciiOnly: boolean;
  root: string;
}

function usage(): never {
  console.error(`用法: scan-source-encoding.ts [选项] [根目录]

选项:
  --fix       写回修复（弯引号 → ASCII 等）
  --headers   仅扫描/修复头文件 (.h/.hpp/...)
  --ascii     头文件纯 ASCII：扫描 GBK 中文，修复时一并清除（建议与 --headers 同用）
  -h, --help  显示帮助

示例:
  pnpm scan-encoding
  pnpm scan-encoding --headers
  pnpm scan-encoding --fix --headers
  pnpm scan-encoding --fix --headers D:\\path\\to\\caa\\project

未指定目录时默认扫描当前工作目录。`);
  process.exit(2);
}

function parseArgs(argv: string[]): CliOptions {
  let fix = false;
  let headersOnly = false;
  let asciiOnly = false;
  let root = process.cwd();

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--fix") {
      fix = true;
      continue;
    }
    if (arg === "--headers" || arg === "--headers-only") {
      headersOnly = true;
      continue;
    }
    if (arg === "--ascii" || arg === "--ascii-only") {
      asciiOnly = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") usage();
    positional.push(arg);
  }

  if (positional.length > 0) {
    root = resolve(positional[positional.length - 1]!);
  }

  return { fix, headersOnly, asciiOnly, root };
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const report = runWorkspaceEncodingScan({
    root: opts.root,
    headersOnly: opts.headersOnly,
    fix: opts.fix,
    asciiOnly: opts.asciiOnly,
  });

  console.log(formatWorkspaceReport(report, opts.fix));

  if (report.issueFiles > 0 && !opts.fix) {
    process.exitCode = 1;
  }
}

main();
