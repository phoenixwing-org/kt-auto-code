#!/usr/bin/env node
import { resolve } from "node:path";
import {
  CODEGEN_QA_REPORT_RELATIVE,
  formatCodegenFixtureQaSummary,
  readCodegenFixtureQaReport,
  recordCodegenManualCheckpoint,
} from "./codegen-fixture-qa.mjs";

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const workspaceArg = args[0];
if (!workspaceArg || workspaceArg.startsWith("--")) {
  console.error("用法：pnpm ext:report:codegen -- <临时工作区> [--checkpoint A --status passed|failed|pending --note 文本]");
  process.exit(2);
}

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少值`);
  return value;
}

try {
  const workspacePath = resolve(workspaceArg);
  const checkpoint = option("--checkpoint");
  const status = option("--status");
  if (Boolean(checkpoint) !== Boolean(status)) throw new Error("--checkpoint 与 --status 必须同时提供");
  const themes = {
    dark: option("--dark-theme"),
    light: option("--light-theme"),
    highContrast: option("--high-contrast-theme"),
  };
  const hasTheme = Object.values(themes).some((value) => value !== undefined);
  const hasMetadata = args.includes("--diagnostics-copied")
    || option("--vscode-version") !== undefined
    || hasTheme;
  let report;
  if (checkpoint) {
    report = recordCodegenManualCheckpoint(workspacePath, {
      id: checkpoint,
      status,
      notes: option("--note"),
      vscodeVersion: option("--vscode-version"),
      diagnosticsCopied: args.includes("--diagnostics-copied") ? true : undefined,
      themes: hasTheme ? themes : undefined,
    });
    console.log(`已记录 Checkpoint ${checkpoint.toUpperCase()} = ${status}`);
  } else if (hasMetadata) {
    throw new Error("元数据请和一次 --checkpoint/--status 记录一起提交");
  } else {
    report = readCodegenFixtureQaReport(workspacePath);
  }
  console.log(formatCodegenFixtureQaSummary(report));
  console.log(`报告：${resolve(workspacePath, CODEGEN_QA_REPORT_RELATIVE)}`);
} catch (error) {
  console.error(`记录失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
