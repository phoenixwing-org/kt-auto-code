#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const RECOVERY_BLOCKS = Object.freeze([
  "CMD ACTION FIA",
  "CMD ACTION PDA",
  "CMD AGENT FIA CLEAR",
  "CMD AGENT UPDATE STATE",
  "CMD SET ACTIVE FIELD",
]);
const SCAN_BLOCKS = Object.freeze([
  "CMD AGENT CONSTRUCTOR",
  "CMD AGENT DESTRUCTOR",
  ...RECOVERY_BLOCKS,
]);

function requiredFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`[local-wing] 控制符边界自检缺少${label}：${path}`);
  }
  return path;
}

/**
 * 直接执行刚构建的本地 Wing dist，防止开发 Host 在算法语义不符合预期时启动。
 * 夹具刻意包含两个缺失 End，后面的五个同级块必须完整恢复。
 */
export async function verifyLocalWingMarkerRuntime(wingRoot) {
  const packageRoot = resolve(wingRoot, "packages/kt-codegen");
  const entry = requiredFile(resolve(packageRoot, "dist/index.js"), "构建入口");
  const jsonPath = requiredFile(
    resolve(packageRoot, "tests/fixtures/legacy-v4/bom-analysis.json"),
    "PNXBomAnalysis 参数夹具",
  );
  const sourcePath = requiredFile(
    resolve(packageRoot, "tests/fixtures/source/bom-analysis-two-missing-ends.cpp"),
    "PNXBomAnalysis 反例夹具",
  );
  const runtimeUrl = `${pathToFileURL(entry).href}?markerBoundaryCheck=${Date.now()}`;
  const { KtCodegenController } = await import(runtimeUrl);
  const controller = new KtCodegenController();
  const loaded = controller.readJson(readFileSync(jsonPath, "utf8"));
  if (!loaded.ok) {
    throw new Error(
      `[local-wing] 控制符边界自检无法读取参数夹具：${JSON.stringify(loaded.diagnostics)}`,
    );
  }
  const source = readFileSync(sourcePath, "utf8");
  const result = controller.core.marker.scan(
    controller.param,
    { files: [{ path: "PNXBomAnalysisCmd.cpp", text: source, fingerprint: "local-dev-check" }] },
    SCAN_BLOCKS,
  );
  const diagnosticCodes = result.diagnostics.map((diagnostic) => diagnostic.code);
  const regionKeys = result.regions.map((region) => region.blockKey);
  const accepted = diagnosticCodes.length === 2
    && diagnosticCodes.every((code) => code === "marker.missing-end")
    && regionKeys.length === RECOVERY_BLOCKS.length
    && regionKeys.every((key, index) => key === RECOVERY_BLOCKS[index]);
  if (!accepted) {
    throw new Error(
      "[local-wing] 控制符边界自检失败："
      + `diagnostics=${JSON.stringify(diagnosticCodes)}；regions=${JSON.stringify(regionKeys)}`,
    );
  }
  const summary = Object.freeze({
    missingEnd: diagnosticCodes.length,
    recoveredRegions: regionKeys.length,
    legacyCascade: diagnosticCodes.filter(
      (code) => code === "marker.nested-start" || code === "marker.mismatched-end",
    ).length,
  });
  console.log(
    "[local-wing] 控制符边界自检通过："
    + `${summary.missingEnd} 个 missing-end；`
    + `${summary.recoveredRegions} 个后续区域；`
    + `nested/mismatched=${summary.legacyCascade}`,
  );
  return summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const wingRoot = process.argv[2];
  if (!wingRoot) {
    console.error("用法：node scripts/verify-local-wing-marker-runtime.mjs <phoenix-wing-root>");
    process.exit(1);
  }
  await verifyLocalWingMarkerRuntime(resolve(wingRoot));
}
