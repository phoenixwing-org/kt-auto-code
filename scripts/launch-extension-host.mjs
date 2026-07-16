#!/usr/bin/env node
/**
 * 启动同时加载 KT Auto Code 与 KT Auto CAD 的 Extension Development Host。
 * 窗口为空时，在 Host 里点「最近」或 文件→打开文件夹 即可。
 *
 * 用法: pnpm ext:launch
 *       pnpm ext:launch:code
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codeExtensionPath = resolve(repoRoot, "extension");
const cadExtensionPath = resolve(repoRoot, "extensions/kt-auto-cad");
const codeOnly = process.argv.includes("--code-only");
const dryRun = process.argv.includes("--dry-run");
const extensionPaths = codeOnly
  ? [codeExtensionPath]
  : [codeExtensionPath, cadExtensionPath];

if (!dryRun) {
  for (const extensionPath of extensionPaths) {
    if (!existsSync(resolve(extensionPath, "dist/extension.js"))) {
      const buildCommand = codeOnly ? "pnpm ext:build" : "pnpm extensions:build";
      console.error(`未找到 ${resolve(extensionPath, "dist/extension.js")}，请先执行: ${buildCommand}`);
      process.exit(1);
    }
  }
}

const args = extensionPaths.map((extensionPath) => `--extensionDevelopmentPath=${extensionPath}`);
const macCode = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
const command = process.platform === "darwin" && existsSync(macCode) ? macCode : "code";

console.log("启动 VS Code Extension Development Host …");
for (const extensionPath of extensionPaths) console.log(`  插件: ${extensionPath}`);
console.log("  工作区: 空窗口（请选择「最近」或自行打开文件夹）");
console.log("");
console.log("提示: 标题须含 [Extension Development Host]。");

if (dryRun) {
  console.log(`[dry-run] ${command} ${args.join(" ")}`);
  process.exit(0);
}

const child = spawn(command, args, { detached: true, stdio: "ignore" });
child.on("error", (err) => {
  console.error("启动失败:", err.message);
  process.exit(1);
});
child.unref();
