import * as esbuild from "esbuild";
import { rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");

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
};

if (watch) {
  const context = await esbuild.context(options);
  await context.watch();
  console.log("watching KT Auto CAD extension…");
} else {
  await rm("dist", { recursive: true, force: true });
  await esbuild.build(options);
}
