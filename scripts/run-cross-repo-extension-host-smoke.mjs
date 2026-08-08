#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCadSiblingRoot } from "./cad-sibling-resolution.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codeExtensionPath = join(repoRoot, "extension");
const cadExtensionPath = resolveCadSiblingRoot({ repoRoot });
const testPath = join(codeExtensionPath, "dist", "test", "extension-host-smoke.js");
const fixturePath = join(repoRoot, "tests", "fixtures", "codegen-manual-workspace");
const macCode = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
const command = process.env.KTC_VSCODE_EXECUTABLE
  || (process.platform === "darwin" && existsSync(macCode) ? macCode : "code");

for (const required of [
  testPath,
  fixturePath,
  join(codeExtensionPath, "dist", "extension.js"),
  join(cadExtensionPath, "dist", "extension.js"),
]) {
  if (!existsSync(required)) throw new Error(`跨仓 Host 测试缺少构建产物：${required}`);
}

const tempBase = process.env.KTC_EXTENSION_HOST_TEMP_ROOT
  || (process.platform === "darwin" ? "/tmp" : tmpdir());
const tempRoot = mkdtempSync(join(tempBase, "ktc-cad-eh-"));
const workspacePath = join(tempRoot, "workspace");
const receiptPath = join(workspacePath, ".phoenix", "extension-host-smoke-v1.json");

try {
  cpSync(fixturePath, workspacePath, { recursive: true });
  const result = spawnSync(command, [
    `--extensionDevelopmentPath=${codeExtensionPath}`,
    `--extensionDevelopmentPath=${cadExtensionPath}`,
    `--extensionTestsPath=${testPath}`,
    `--user-data-dir=${join(tempRoot, "user-data")}`,
    `--extensions-dir=${join(tempRoot, "extensions")}`,
    "--disable-extensions",
    "--disable-updates",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--disable-gpu",
    "--wait",
    "--new-window",
    workspacePath,
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      KTC_EXTENSION_HOST_SMOKE: "1",
      KTC_CAD_EXTENSION_HOST_SMOKE: "1",
    },
    encoding: "utf8",
    stdio: "inherit",
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`跨仓 VS Code Extension Host 退出：${String(result.status)} (${String(result.signal)})`);
  }
  if (!existsSync(receiptPath)) throw new Error(`跨仓 Host 未写入回执：${receiptPath}`);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (receipt.extension?.active !== true
      || receipt.cadExtension?.id !== "kuntai.kt-auto-cad"
      || receipt.cadExtension?.active !== true) {
    throw new Error(`跨仓 Host 回执不完整：${JSON.stringify(receipt)}`);
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write("[integration] Auto + CAD sibling Extension Host passed\n");
} finally {
  if (process.env.KTC_KEEP_EXTENSION_HOST_SMOKE === "1") {
    process.stdout.write(`[integration] kept ${tempRoot}\n`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
