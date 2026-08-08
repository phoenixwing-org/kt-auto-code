#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_WING_ENV, LOCAL_WING_MODE_ENV } from "./local-wing-resolution.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prepareOnly = process.argv.includes("--prepare-only");
const environment = { ...process.env };
delete environment[LOCAL_WING_ENV];
delete environment[LOCAL_WING_MODE_ENV];
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  console.log("> " + command + " " + args.join(" "));
  const result = spawnSync(command, args, { cwd: repoRoot, env: environment, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("[registry-wing] 模式：npm Registry / 当前 pnpm-lock.yaml（非本地 Wing）");
run(pnpm, ["verify:wing-dependencies"]);
run(pnpm, ["ext:build"]);
if (prepareOnly) {
  console.log("[registry-wing] prepare-only 完成，未启动 VS Code");
  process.exit(0);
}
run(process.execPath, [resolve(repoRoot, "scripts/launch-extension-host.mjs"), "--code-only"]);
