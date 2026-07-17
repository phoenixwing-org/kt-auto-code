#!/usr/bin/env node
import { resolve } from "node:path";
import {
  CODEGEN_QA_REPORT_RELATIVE,
  recordCodegenFixtureVerification,
  verifyCodegenFixture,
} from "./codegen-fixture-qa.mjs";

const args = process.argv.slice(2);
const workspaceArg = args.find((value) => !value.startsWith("--"));
if (!workspaceArg) {
  console.error("用法：pnpm ext:verify:codegen -- <临时工作区> [--checkpoint-a|--checkpoint-c|--checkpoint-e]");
  process.exit(2);
}
const checkpoint = args.includes("--checkpoint-a") ? "a"
  : args.includes("--checkpoint-c") ? "c"
    : args.includes("--checkpoint-e") ? "e"
      : "source";
const workspacePath = resolve(workspaceArg);

try {
  const report = verifyCodegenFixture(workspacePath, checkpoint);
  recordCodegenFixtureVerification(workspacePath, report);
  console.log(`Codegen fixture 验收 · checkpoint ${checkpoint.toUpperCase()} · ${workspacePath}`);
  for (const item of report.checks) console.log(`${item.ok ? "✅" : "❌"} ${item.message}`);
  console.log(`报告已更新：${resolve(workspacePath, CODEGEN_QA_REPORT_RELATIVE)}`);
  if (report.ok && checkpoint === "a") {
    console.log(`界面确认后记录：pnpm ext:report:codegen -- ${workspacePath} --checkpoint A --status passed --diagnostics-copied`);
  } else if (report.ok && checkpoint === "c") {
    console.log(`界面确认后记录：pnpm ext:report:codegen -- ${workspacePath} --checkpoint C --status passed`);
  } else if (report.ok && checkpoint === "e") {
    console.log(`界面确认后记录：pnpm ext:report:codegen -- ${workspacePath} --checkpoint E --status passed`);
  }
  console.log(`查看进度：pnpm ext:report:codegen -- ${workspacePath}`);
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  console.error(`验收失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
