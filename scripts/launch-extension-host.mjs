#!/usr/bin/env node
/**
 * 启动 Extension Development Host（与 F5「Run Extension」相同）。
 * 窗口为空时，在 Host 里点「最近」或 文件→打开文件夹 即可。
 *
 * 用法: pnpm ext:launch
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = resolve(repoRoot, "extension");

if (!existsSync(resolve(extensionPath, "dist/extension.js"))) {
  console.error("未找到 extension/dist/extension.js，请先执行: pnpm ext:build");
  process.exit(1);
}

const args = [`--extensionDevelopmentPath=${extensionPath}`];

console.log("启动 VS Code Extension Development Host …");
console.log(`  插件: ${extensionPath}`);
console.log("  工程: 启动后在 Host 窗口选择「最近」或 文件→打开文件夹");
console.log("");
console.log("提示: 标题须含 [Extension Development Host]。");

const child = spawn("code", args, { detached: true, stdio: "ignore", shell: true });
child.on("error", (err) => {
  console.error("启动失败:", err.message);
  process.exit(1);
});
child.unref();
