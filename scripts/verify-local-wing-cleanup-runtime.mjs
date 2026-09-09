#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RUN_CLEANUP_RUNTIME_EXPORTS = Object.freeze([
  "pnwPreviewRecursiveCleanupArtifacts",
  "pnwCleanPreviewedRecursiveArtifacts",
  "pnwPreviewGitUntrackedCleanup",
  "pnwExecuteGitUntrackedCleanup",
]);

function requiredFile(path) {
  if (!existsSync(path)) throw new Error(`[local-wing] Run cleanup runtime 缺少构建入口：${path}`);
  return path;
}

/** Verify declarations, rather than accepting Host call-site strings as implementation evidence. */
export function verifyRunCleanupBundleImplementations(bundle, label = "Extension bundle") {
  const missing = RUN_CLEANUP_RUNTIME_EXPORTS.filter(
    (name) => !bundle.includes(`async function ${name}(`),
  );
  if (missing.length > 0) {
    throw new Error(`${label} 缺少 Run cleanup 真实实现：${missing.join("、")}`);
  }
  return RUN_CLEANUP_RUNTIME_EXPORTS;
}

/** Import only the freshly built run-node entry and inspect exports; never invoke cleanup. */
export async function verifyLocalWingCleanupRuntime(wingRoot) {
  const entry = requiredFile(resolve(wingRoot, "packages/run-node/dist/index.js"));
  const runtimeUrl = `${pathToFileURL(entry).href}?cleanupRuntimeCheck=${Date.now()}-${Math.random()}`;
  const runtime = await import(runtimeUrl);
  const missing = RUN_CLEANUP_RUNTIME_EXPORTS.filter((name) => typeof runtime[name] !== "function");
  if (missing.length > 0) {
    throw new Error(`[local-wing] Run cleanup runtime 缺少函数导出：${missing.join("、")}`);
  }
  const result = Object.freeze({ exports: Object.freeze([...RUN_CLEANUP_RUNTIME_EXPORTS]) });
  console.log(`[local-wing] Run cleanup runtime 自检通过：${result.exports.join("、")}`);
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const wingRoot = process.argv[2];
  if (!wingRoot) {
    console.error("用法：node scripts/verify-local-wing-cleanup-runtime.mjs <phoenix-wing-root>");
    process.exit(1);
  }
  await verifyLocalWingCleanupRuntime(resolve(wingRoot));
}
