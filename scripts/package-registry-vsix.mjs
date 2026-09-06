#!/usr/bin/env node
import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureGitBuildState,
  createBuildProvenance,
  writeBuildProvenance,
  writeTextAtomically,
} from "./release-artifact-provenance.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = repoRoot;
const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
const outputRoot = path.join(repoRoot, "dist", "vsix");
const output = path.join(outputRoot, `kt-auto-code-${manifest.version}.vsix`);
const artifact = `dist/vsix/${path.basename(output)}`;
const vsceCli = path.join(repoRoot, "node_modules", "@vscode", "vsce", "vsce");
const leakedWingVariables = ["PHOENIX_WING_ROOT", "PHOENIX_WING_DEV_MODE"]
  .filter((name) => process.env[name] !== undefined);

if (leakedWingVariables.length > 0) {
  throw new Error(
    `Registry VSIX packaging rejects local Wing variables: ${leakedWingVariables.join(", ")}`,
  );
}

mkdirSync(outputRoot, { recursive: true });
const before = captureGitBuildState(repoRoot);

const result = spawnSync(process.execPath, [
  vsceCli,
  "package",
  "--no-dependencies",
  "--baseContentUrl",
  "https://gitee.com/phoenixwing/kt-auto-code/blob/develop",
  "--baseImagesUrl",
  "https://gitee.com/phoenixwing/kt-auto-code/raw/develop",
  "--out",
  output,
], {
  cwd: extensionRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const after = captureGitBuildState(repoRoot);
const artifactBytes = readFileSync(output);
const provenance = createBuildProvenance({
  artifact,
  version: manifest.version,
  artifactBytes,
  before,
  after,
});
writeTextAtomically(`${output}.sha256`, `${provenance.sha256}  ${path.basename(output)}\n`);
writeBuildProvenance(output, provenance);

process.stdout.write(`[package] VSIX: ${path.relative(repoRoot, output)}\n`);
process.stdout.write(`[package] SHA-256: ${provenance.sha256}\n`);
process.stdout.write(
  `[package] Build provenance: commit ${provenance.commit}, clean=${provenance.clean}, `
  + `stable=${provenance.stable}, sourceCleanAndStable=${provenance.sourceCleanAndStable}\n`,
);
