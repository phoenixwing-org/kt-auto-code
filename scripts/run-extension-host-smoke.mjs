#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionPath = join(repoRoot, "extension");
const testPath = join(extensionPath, "dist", "test", "extension-host-smoke.js");
const fixturePath = join(repoRoot, "tests", "fixtures", "codegen-manual-workspace");
const macCode = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";
const command = process.env.KTC_VSCODE_EXECUTABLE
  || (process.platform === "darwin" && existsSync(macCode) ? macCode : "code");

if (!existsSync(testPath)) throw new Error(`Extension Host 测试 bundle 不存在：${testPath}`);
if (!existsSync(fixturePath)) throw new Error(`Codegen fixture 不存在：${fixturePath}`);

const tempBase = process.env.KTC_EXTENSION_HOST_TEMP_ROOT
  || (process.platform === "darwin" ? "/tmp" : tmpdir());
const tempRoot = mkdtempSync(join(tempBase, "ktc-eh-"));
const workspacePath = join(tempRoot, "workspace");
const receiptPath = join(workspacePath, ".phoenix", "extension-host-smoke-v1.json");

try {
  cpSync(fixturePath, workspacePath, { recursive: true });
  const args = [
    `--extensionDevelopmentPath=${extensionPath}`,
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
  ];
  process.stdout.write(`[q2] launching real VS Code Extension Host: ${command}\n`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, KTC_EXTENSION_HOST_SMOKE: "1" },
    encoding: "utf8",
    stdio: "inherit",
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`VS Code Extension Host exited with ${String(result.status)} (${String(result.signal)})`);
  }
  if (!existsSync(receiptPath)) throw new Error(`Extension Host 未写入验收回执：${receiptPath}`);
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (
    receipt.kind !== "kt.auto-code.extension-host-smoke"
    || receipt.schemaVersion !== 1
    || receipt.extension?.id !== "kuntai.kt-auto-code"
    || receipt.extension?.active !== true
    || receipt.flows?.open !== true
    || receipt.flows?.preview !== true
    || receipt.flows?.conflict !== true
    || receipt.flows?.apply !== true
    || receipt.flows?.saveReload !== true
    || receipt.flows?.rollback !== true
    || receipt.flows?.gitBlock !== true
    || receipt.flows?.gitEmptyState !== true
    || receipt.flows?.runBlock !== true
    || !receipt.evidence?.commands?.includes("ktAutoCode.git.open")
    || !receipt.evidence?.commands?.includes("ktAutoCode.run.open")
  ) {
    throw new Error(`Extension Host 回执不完整：${JSON.stringify(receipt)}`);
  }
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write("[q2] real VS Code Extension Host representative flow passed\n");
} finally {
  if (process.env.KTC_KEEP_EXTENSION_HOST_SMOKE === "1") {
    process.stdout.write(`[q2] kept ${tempRoot}\n`);
  } else {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
