import * as esbuild from "esbuild";
import { rm } from "node:fs/promises";
import {
  LOCAL_WING_CAD_PACKAGES,
  localWingBuildContextFromEnvironment,
  verifyLocalWingBuildResults,
} from "../../scripts/local-wing-resolution.mjs";

const watch = process.argv.includes("--watch");
const localWing = localWingBuildContextFromEnvironment();

/** @type {import('esbuild').BuildOptions} */
const options = {
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
  plugins: localWing?.plugins ?? [],
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("watching KT Auto CAD extension…");
} else {
  await rm("dist", { recursive: true, force: true });
  const result = await esbuild.build(options);
  if (localWing) {
    verifyLocalWingBuildResults({
      results: [result],
      wingRoot: localWing.wingRoot,
      expectedPackages: LOCAL_WING_CAD_PACKAGES,
    });
  }
}
