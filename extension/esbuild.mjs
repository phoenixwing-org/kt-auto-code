import * as esbuild from "esbuild";
import { rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");

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
};

if (watch) {
  const extensionContext = await esbuild.context(extensionOptions);
  const tableContext = await esbuild.context(codegenTableOptions);
  const controlCatalogContext = await esbuild.context(codegenControlCatalogOptions);
  const primaryPanelContext = await esbuild.context(codegenPrimaryPanelOptions);
  await Promise.all([
    extensionContext.watch(), tableContext.watch(), controlCatalogContext.watch(), primaryPanelContext.watch(),
  ]);
  console.log("watching extension…");
} else {
  await rm("dist", { recursive: true, force: true });
  await Promise.all([
    esbuild.build(extensionOptions),
    esbuild.build(codegenTableOptions),
    esbuild.build(codegenControlCatalogOptions),
    esbuild.build(codegenPrimaryPanelOptions),
    esbuild.build(extensionHostSmokeOptions),
  ]);
}
