import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Plugin } from "esbuild";
import {
  readWebviewPreviewPort,
  resolveWebviewPreviewAsset,
  startWebviewPreviewServer,
  type WebviewPreviewServer,
  type WebviewPreviewStaticAsset,
  type WebviewPreviewStaticAssets,
} from "./webview-preview/server.js";
import {
  createLocalWingEsbuildPlugin,
  LOCAL_WING_CODE_PACKAGES,
  resolveLocalWingRoot,
  validateRequiredLocalWingPackages,
} from "./local-wing-resolution.mjs";

const scriptFile = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptFile), "..");
const previewRoot = path.join(repositoryRoot, "ui-preview");
const previewEntry = path.join(previewRoot, "src", "main.ts");
const previewRuntimeRoot = path.join(repositoryRoot, "scripts", "webview-preview");
const defaultPort = 4173;

export type KtcPreviewAsset = WebviewPreviewStaticAsset;

const STATIC_ASSETS: WebviewPreviewStaticAssets = Object.freeze({
  "/": { filename: path.join(previewRoot, "index.html"), contentType: "text/html; charset=utf-8" },
  "/index.html": { filename: path.join(previewRoot, "index.html"), contentType: "text/html; charset=utf-8" },
  "/styles.css": { filename: path.join(previewRoot, "styles.css"), contentType: "text/css; charset=utf-8" },
  "/__webview_preview_client.js": {
    filename: path.join(previewRuntimeRoot, "client.js"),
    contentType: "text/javascript; charset=utf-8",
  },
});

export function ktcResolvePrimaryPreviewAsset(requestUrl: string): KtcPreviewAsset | undefined {
  return resolveWebviewPreviewAsset(requestUrl, STATIC_ASSETS);
}

export function ktcReadPrimaryPreviewPort(args: readonly string[]): number {
  return readWebviewPreviewPort(args, defaultPort);
}

export type KtcPrimaryPreviewServer = WebviewPreviewServer;

export async function ktcStartPrimaryPreviewServer(
  options: { readonly port?: number } = {},
): Promise<KtcPrimaryPreviewServer> {
  const wingRoot = resolveLocalWingRoot({ repoRoot: repositoryRoot });
  validateRequiredLocalWingPackages(wingRoot, LOCAL_WING_CODE_PACKAGES);
  process.stdout.write(`[ui-preview] Wing：${wingRoot}\n`);
  return startWebviewPreviewServer({
    label: "KT Auto Code · Primary + Editor",
    workingDirectory: repositoryRoot,
    entryPoint: previewEntry,
    bundleRoute: "/primary-preview.js",
    staticAssets: STATIC_ASSETS,
    esbuildPlugins: [createLocalWingEsbuildPlugin(wingRoot) as Plugin],
  }, options.port ?? defaultPort);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(path.resolve(entry)).href === import.meta.url);
}

async function runDirect(): Promise<void> {
  const preview = await ktcStartPrimaryPreviewServer({ port: ktcReadPrimaryPreviewPort(process.argv.slice(2)) });
  const shutdown = async (): Promise<void> => {
    await preview.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (isDirectRun()) {
  void runDirect().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ui-preview] ${message}\n`);
    process.exitCode = 1;
  });
}
