#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = repoRoot;
const wingRoot = path.resolve(repoRoot, "../phoenix-wing");
const manifest = JSON.parse(readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
const bundlePath = path.join(extensionRoot, "dist", "extension.js");
const bundle = readFileSync(bundlePath, "utf8");

if (Number(process.versions.node.split(".")[0]) < 22) {
  throw new Error(`Local Wing VSIX packaging requires Node 22+, got ${process.version}`);
}
if (!bundle.includes(JSON.stringify(wingRoot))) {
  throw new Error("Refusing to package: dist/extension.js is not the verified sibling Wing bundle");
}
if (bundle.includes('require("@phoenix-wing/git-core")')
  || bundle.includes('require("@phoenix-wing/git-node")')
  || bundle.includes('require("@phoenix-wing/run-core")')
  || bundle.includes('require("@phoenix-wing/run-node")')) {
  throw new Error("Refusing to package: Git/Run Wing dependencies were not bundled");
}

const outputRoot = path.join(repoRoot, "dist", "vsix");
const output = path.join(outputRoot, `kt-auto-code-${manifest.version}.vsix`);
const receiptPath = path.join(outputRoot, `kt-auto-code-${manifest.version}.local-wing.json`);
mkdirSync(outputRoot, { recursive: true });
if (existsSync(receiptPath)) unlinkSync(receiptPath);
const require = createRequire(import.meta.url);
const { pack } = require("../node_modules/@vscode/vsce/out/package.js");
const result = await pack({
  cwd: extensionRoot,
  packagePath: output,
  dependencies: false,
  useYarn: false,
  baseContentUrl: "https://gitee.com/phoenixwing/kt-auto-code/blob/develop",
  baseImagesUrl: "https://gitee.com/phoenixwing/kt-auto-code/raw/develop",
});

const archive = readFileSync(output);
const sha256 = createHash("sha256").update(archive).digest("hex");
writeFileSync(`${output}.sha256`, `${sha256}  ${path.basename(output)}\n`, "utf8");
const receipt = {
  schemaVersion: 1,
  kind: "kt.auto-code.local-wing-vsix",
  version: manifest.version,
  node: process.version,
  wingRoot,
  artifact: path.basename(output),
  bytes: statSync(output).size,
  files: result.files.length,
  sha256,
  publishable: false,
  note: "Local sibling Wing candidate only; rebuild from Registry packages before Marketplace publication.",
};
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
