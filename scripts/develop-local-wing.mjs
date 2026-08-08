#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_WING_ALL_PACKAGES,
  LOCAL_WING_CODE_PACKAGES,
  LOCAL_WING_ENV,
  LOCAL_WING_MODE_ENV,
  resolveLocalWingRoot,
  validateRequiredLocalWingPackages,
} from "./local-wing-resolution.mjs";
import { resolveCadSiblingRoot } from "./cad-sibling-resolution.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const codeOnly = process.argv.includes("--code-only");
const prepareOnly = process.argv.includes("--prepare-only");
const checkOnly = process.argv.includes("--check-only");
const requiredPackages = codeOnly ? LOCAL_WING_CODE_PACKAGES : LOCAL_WING_ALL_PACKAGES;
const wingRoot = resolveLocalWingRoot({ repoRoot });
const cadRoot = codeOnly ? undefined : resolveCadSiblingRoot({ repoRoot });
const protectedFiles = [
  "package.json",
  "extension/package.json",
  "pnpm-lock.yaml",
].map((path) => resolve(repoRoot, path));
if (cadRoot) {
  protectedFiles.push(resolve(cadRoot, "package.json"), resolve(cadRoot, "pnpm-lock.yaml"));
}
const before = new Map(protectedFiles.map((path) => [path, readFileSync(path, "utf8")]));

function run(command, args, options = {}) {
  console.log("> " + command + " " + args.join(" "));
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertDependencyFilesUntouched() {
  const changed = protectedFiles.filter(
    (path) => readFileSync(path, "utf8") !== before.get(path),
  );
  if (changed.length > 0) {
    throw new Error("[local-wing] 本地开发不得修改正式依赖文件：" + changed.join("、"));
  }
}

function withoutLocalWingEnvironment() {
  const environment = { ...process.env };
  delete environment[LOCAL_WING_ENV];
  delete environment[LOCAL_WING_MODE_ENV];
  return environment;
}

validateRequiredLocalWingPackages(wingRoot, requiredPackages);
console.log("[local-wing] 模式：本地并列仓库（非 npm Registry）");
console.log("[local-wing] Wing：" + wingRoot);
console.log("[local-wing] Code：" + repoRoot);
if (cadRoot) console.log("[local-wing] CAD：" + cadRoot);

if (checkOnly) {
  console.log("[local-wing] 检查通过：" + requiredPackages.join("、"));
  process.exit(0);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const registryEnvironment = withoutLocalWingEnvironment();
run(pnpm, ["verify:wing-dependencies"], { env: registryEnvironment });

const filters = requiredPackages.flatMap((packageName) => ["--filter", packageName]);
run(pnpm, ["--dir", wingRoot, ...filters, "run", "build"]);
run(process.execPath, [
  resolve(repoRoot, "scripts/verify-local-wing-marker-runtime.mjs"),
  wingRoot,
]);

const localEnvironment = {
  ...process.env,
  [LOCAL_WING_ENV]: wingRoot,
  [LOCAL_WING_MODE_ENV]: "1",
};
run(pnpm, ["ext:build"], { env: localEnvironment });
if (cadRoot) run(pnpm, ["--dir", cadRoot, "dev:prepare"], { env: localEnvironment });
assertDependencyFilesUntouched();
run(pnpm, ["verify:wing-dependencies"], { env: registryEnvironment });
console.log("[local-wing] Auto 扩展已嵌入本地 Wing dist；正式 manifests 与 lockfile 未修改");

if (prepareOnly) {
  console.log("[local-wing] prepare-only 完成，未启动 VS Code");
  process.exit(0);
}

const launchArgs = [resolve(repoRoot, "scripts/launch-extension-host.mjs")];
if (codeOnly) launchArgs.push("--code-only");
run(process.execPath, launchArgs, { env: localEnvironment });
