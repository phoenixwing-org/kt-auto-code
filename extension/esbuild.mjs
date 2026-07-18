import * as esbuild from "esbuild";
import { rm } from "node:fs/promises";
import {
  LOCAL_WING_CODE_PACKAGES,
  localWingBuildContextFromEnvironment,
  verifyLocalWingBuildResults,
} from "../scripts/local-wing-resolution.mjs";

const watch = process.argv.includes("--watch");
const localWing = localWingBuildContextFromEnvironment();
const localWingPlugins = localWing?.plugins ?? [];
const extensionBuildProvenance = {
  __KTC_WING_BUILD_MODE__: JSON.stringify(localWing ? "local" : "registry"),
  // Registry bundle 不记录构建机路径；本地 bundle 只记录用户明确选择的 Wing 根。
  __KTC_WING_BUILD_ROOT__: JSON.stringify(localWing?.wingRoot ?? ""),
};

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
  metafile: Boolean(localWing),
  define: extensionBuildProvenance,
  plugins: localWingPlugins,
};

/** @type {import('esbuild').BuildOptions} */
const codegenTableOptions = {
  entryPoints: ["src/tools/codegen/tableEntry.ts"],
  bundle: true,
  outfile: "dist/codegen-table.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
  metafile: Boolean(localWing),
  plugins: localWingPlugins,
};

/** @type {import('esbuild').BuildOptions} */
const codegenControlCatalogOptions = {
  entryPoints: ["src/tools/codegen/controlCatalogEntry.ts"],
  bundle: true,
  outfile: "dist/codegen-control-catalog.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
  metafile: Boolean(localWing),
  plugins: localWingPlugins,
};

/** @type {import('esbuild').BuildOptions} */
const codegenPrimaryPanelOptions = {
  entryPoints: ["src/tools/codegen/primaryPanelEntry.ts"],
  bundle: true,
  outfile: "dist/codegen-primary-panel.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
  metafile: Boolean(localWing),
  plugins: localWingPlugins,
};

/** @type {import('esbuild').BuildOptions} */
const reorderMembersPanelOptions = {
  entryPoints: ["src/sidebar/reorderMembersPanelEntry.ts"],
  bundle: true,
  outfile: "dist/reorder-members-panel.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
  metafile: Boolean(localWing),
  plugins: localWingPlugins,
};

/** @type {import('esbuild').BuildOptions} */
const associatedRulePickerOptions = {
  entryPoints: ["src/sidebar/associatedRulePickerEntry.ts"],
  bundle: true,
  outfile: "dist/associated-rule-picker.js",
  platform: "browser",
  format: "iife",
  target: "es2022",
  sourcemap: true,
  logLevel: "info",
  metafile: Boolean(localWing),
  plugins: localWingPlugins,
};

/** @type {import('esbuild').BuildOptions} */
const extensionHostSmokeOptions = {
  entryPoints: ["src/test/extensionHostSmoke.ts"],
  bundle: true,
  outfile: "dist/test/extension-host-smoke.js",
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
  metafile: Boolean(localWing),
  plugins: localWingPlugins,
};

if (watch) {
  const extensionContext = await esbuild.context(extensionOptions);
  const tableContext = await esbuild.context(codegenTableOptions);
  const controlCatalogContext = await esbuild.context(codegenControlCatalogOptions);
  const primaryPanelContext = await esbuild.context(codegenPrimaryPanelOptions);
  const reorderMembersPanelContext = await esbuild.context(reorderMembersPanelOptions);
  const associatedRulePickerContext = await esbuild.context(associatedRulePickerOptions);
  await Promise.all([
    extensionContext.watch(), tableContext.watch(), controlCatalogContext.watch(), primaryPanelContext.watch(),
    reorderMembersPanelContext.watch(), associatedRulePickerContext.watch(),
  ]);
  console.log("watching extension…");
} else {
  await rm("dist", { recursive: true, force: true });
  const results = await Promise.all([
    esbuild.build(extensionOptions),
    esbuild.build(codegenTableOptions),
    esbuild.build(codegenControlCatalogOptions),
    esbuild.build(codegenPrimaryPanelOptions),
    esbuild.build(reorderMembersPanelOptions),
    esbuild.build(associatedRulePickerOptions),
    esbuild.build(extensionHostSmokeOptions),
  ]);
  if (localWing) {
    verifyLocalWingBuildResults({
      results,
      wingRoot: localWing.wingRoot,
      expectedPackages: LOCAL_WING_CODE_PACKAGES,
    });
  }
}
