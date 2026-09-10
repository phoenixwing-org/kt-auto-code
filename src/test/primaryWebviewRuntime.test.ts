import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import { verifyPrimaryWebviewRuntime } from "../../scripts/verify-primary-webview-runtime.mjs";
import { localWingBuildContextFromEnvironment } from "../../scripts/local-wing-resolution.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
let extensionBundle = "";
const scripts = new Map<string, string>();

beforeAll(async () => {
  const localWing = localWingBuildContextFromEnvironment();
  const output = await build({ entryPoints: [resolve(root, "src/sidebar/panelHtml.ts")],
    bundle: true, platform: "node", format: "cjs", target: "node18", write: false });
  extensionBundle = output.outputFiles[0]!.text;
  // Use the production entry list, not a Preview entry that might mask missing registration.
  const buildSource = readFileSync(resolve(root, "esbuild.mjs"), "utf8");
  const entries = [...buildSource.matchAll(/entryPoints: \["([^"]+)"\],[\s\S]*?outfile: "dist\/([^"]+)"/gu),
    ...buildSource.matchAll(/entryPoint: "([^"]+)", outfile: "dist\/([^"]+)"/gu)]
    .filter(([, , name]) => name !== "extension.js" && !name!.includes("/"));
  const browser = await build({ entryPoints: Object.fromEntries(entries.map(([, entry, name]) => [
    name!.replace(/\.js$/u, ""), resolve(root, entry!),
  ])), bundle: true, platform: "browser", format: "iife", target: "es2022", write: false,
  outdir: resolve(root, "dist/primary-runtime-test"), plugins: (localWing?.plugins ?? []) as Plugin[] });
  if (!browser.outputFiles) throw new Error("Primary browser build did not return in-memory bundles");
  for (const file of browser.outputFiles) scripts.set(`extension/dist/${basename(file.path)}`, file.text);
}, 30_000);

function readResource(path: string): string {
  const source = scripts.get(path);
  if (!source) throw new Error(`Primary requested a missing production bundle: ${path}`);
  return source;
}

describe("formal Primary first-load runtime", () => {
  it("renders fresh empty/workspace windows using real Wing components without opening Right", async () => {
    await expect(verifyPrimaryWebviewRuntime(extensionBundle, readResource)).resolves.toEqual({
      emptyWindow: true, workspaceWindow: true, cleanupRegistered: true, toolbarRendered: true, runActivated: true,
    });
  });

  it("rejects the 0.9.2 missing-registration regression even when the component implementation exists", async () => {
    await expect(verifyPrimaryWebviewRuntime(extensionBundle, (path) => path.endsWith("/ktc-run-primary-panel.js")
      ? readResource(path).replace(/\bpnwCodeDefineCleanupDialog\(\);/u, "") : readResource(path)))
      .rejects.toThrow("Primary did not register pnw-cleanup-dialog");
  });
});
