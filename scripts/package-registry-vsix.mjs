#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(repoRoot, "extension");
const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
const outputRoot = path.join(repoRoot, "dist", "vsix");
const output = path.join(outputRoot, `kt-auto-code-${manifest.version}.vsix`);
const vsceCli = path.join(extensionRoot, "node_modules", "@vscode", "vsce", "vsce");
const leakedWingVariables = ["PHOENIX_WING_ROOT", "PHOENIX_WING_DEV_MODE"]
  .filter((name) => process.env[name] !== undefined);

if (leakedWingVariables.length > 0) {
  throw new Error(
    `Registry VSIX packaging rejects local Wing variables: ${leakedWingVariables.join(", ")}`,
  );
}

mkdirSync(outputRoot, { recursive: true });

const result = spawnSync(process.execPath, [
  vsceCli,
  "package",
  "--no-dependencies",
  "--baseContentUrl",
  "https://gitee.com/phoenixwing/kt-auto-code/blob/master/extension",
  "--baseImagesUrl",
  "https://gitee.com/phoenixwing/kt-auto-code/raw/master/extension",
  "--out",
  output,
], {
  cwd: extensionRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const sha256 = createHash("sha256").update(readFileSync(output)).digest("hex");
const checksum = `${sha256}  ${path.basename(output)}\n`;
writeFileSync(`${output}.sha256`, checksum, "utf8");

process.stdout.write(`[package] VSIX: ${path.relative(repoRoot, output)}\n`);
process.stdout.write(`[package] SHA-256: ${sha256}\n`);
