import * as esbuild from "esbuild";
import { randomBytes } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import path from "node:path";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_EVENT_ROUTE = "/__webview_preview_events";

export interface WebviewPreviewStaticAsset {
  readonly filename: string;
  readonly contentType: string;
}

export type WebviewPreviewStaticAssets = Readonly<Record<string, WebviewPreviewStaticAsset>>;

export interface WebviewPreviewDefinition {
  readonly label: string;
  readonly workingDirectory: string;
  readonly entryPoint: string;
  readonly bundleRoute: string;
  readonly staticAssets: WebviewPreviewStaticAssets;
  readonly watchFiles?: readonly string[];
  readonly eventRoute?: string;
  readonly target?: string;
  readonly sourcemap?: false | "inline";
  readonly esbuildPlugins?: readonly esbuild.Plugin[];
}

export interface WebviewPreviewServer {
  readonly url: string;
  readonly port: number;
  close(): Promise<void>;
}

export function resolveWebviewPreviewAsset(
  requestUrl: string,
  assets: WebviewPreviewStaticAssets,
): WebviewPreviewStaticAsset | undefined {
  const pathname = readRequestPathname(requestUrl);
  return pathname ? assets[pathname] : undefined;
}

export function readWebviewPreviewPort(
  args: readonly string[],
  defaultPort: number,
): number {
  const inline = args.find((value) => value.startsWith("--port="));
  const separateIndex = args.indexOf("--port");
  if (!inline && separateIndex >= 0 && args[separateIndex + 1] === undefined) {
    throw new Error("--port 缺少端口值");
  }
  const raw = inline?.slice("--port=".length)
    ?? (separateIndex >= 0 ? args[separateIndex + 1] : String(defaultPort));
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`无效端口：${raw}`);
  }
  return port;
}

export async function startWebviewPreviewServer(
  definition: WebviewPreviewDefinition,
  port: number,
): Promise<WebviewPreviewServer> {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`无效监听端口：${port}`);
  }
  const bundleRoute = assertPublicRoute(definition.bundleRoute, "bundleRoute");
  const eventRoute = assertPublicRoute(definition.eventRoute ?? DEFAULT_EVENT_ROUTE, "eventRoute");
  if (bundleRoute === eventRoute || bundleRoute === "/" || eventRoute === "/"
    || bundleRoute === "/favicon.ico" || eventRoute === "/favicon.ico") {
    throw new Error(`预览保留路由冲突：${bundleRoute} / ${eventRoute}`);
  }
  const staticAssets = validateStaticAssets(definition.staticAssets, bundleRoute, eventRoute);
  const bundleOutputFile = path.resolve(
    definition.workingDirectory,
    ".webview-preview",
    path.basename(bundleRoute),
  );
  const clients = new Set<ServerResponse>();
  let currentBundle: Uint8Array | undefined;
  let buildRevision = 0;
  let lastBuildErrorCount = 0;
  let closed = false;

  const sendEvent = (event: string, value: unknown): void => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
    clients.forEach((client) => {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    });
  };

  const captureBundlePlugin: esbuild.Plugin = {
    name: "webview-preview-memory-bundle",
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) {
          lastBuildErrorCount = result.errors.length;
          sendEvent("build-error", { count: result.errors.length });
          return;
        }
        const output = result.outputFiles?.find((candidate) => path.resolve(candidate.path) === bundleOutputFile);
        if (!output) {
          lastBuildErrorCount = 1;
          sendEvent("build-error", { count: 1 });
          return;
        }
        currentBundle = output.contents;
        lastBuildErrorCount = 0;
        buildRevision += 1;
        sendEvent("reload", { revision: buildRevision });
      });
    },
  };

  let buildContext: esbuild.BuildContext | undefined;
  try {
    buildContext = await esbuild.context({
      absWorkingDir: definition.workingDirectory,
      entryPoints: [definition.entryPoint],
      outfile: bundleOutputFile,
      bundle: true,
      format: "iife",
      platform: "browser",
      target: definition.target ?? "es2022",
      sourcemap: definition.sourcemap ?? false,
      write: false,
      logLevel: "info",
      plugins: [...(definition.esbuildPlugins ?? []), captureBundlePlugin],
    });
    await buildContext.rebuild();
    await buildContext.watch();
  } catch (error) {
    await buildContext?.dispose();
    throw error;
  }

  const server = createServer(async (request, response) => {
    setPreviewHeaders(response);
    if (!isAllowedHost(request.headers, server)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden Host");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }

    const pathname = readRequestPathname(request.url ?? "/");
    if (!pathname) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Bad Request");
      return;
    }
    if (pathname === eventRoute) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        Connection: "keep-alive",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.write(`event: ready\ndata: ${JSON.stringify({ revision: buildRevision })}\n\n`);
      if (lastBuildErrorCount > 0) {
        response.write(`event: build-error\ndata: ${JSON.stringify({ count: lastBuildErrorCount })}\n\n`);
      }
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (pathname === bundleRoute) {
      if (!currentBundle) {
        response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Preview bundle is still building.");
        return;
      }
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : currentBundle);
      return;
    }
    if (pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    const asset = staticAssets[pathname];
    if (!asset) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }
    try {
      const contents = await readFile(asset.filename);
      // srcdoc inherits the parent policy. A separate child nonce cannot relax
      // script-src 'self'; share one unguessable nonce with trusted memory UIs.
      const scriptNonce = /^text\/html(?:;|$)/iu.test(asset.contentType) ? randomBytes(24).toString("base64url") : undefined;
      let body: string | Buffer = contents;
      if (scriptNonce) {
        setPreviewHeaders(response, scriptNonce);
        const meta = `<meta name="phoenix-preview-script-nonce" content="${scriptNonce}">`;
        const html = contents.toString("utf8");
        body = /<head(?:\s[^>]*)?>/iu.test(html)
          ? html.replace(/<head(?:\s[^>]*)?>/iu, (head) => `${head}${meta}`)
          : html.replace(/^(\s*<!doctype[^>]*>)?/iu, (doctype) => `${doctype}${meta}`);
      }
      response.writeHead(200, { "Content-Type": asset.contentType });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Preview asset unavailable.");
    }
  });

  const staticWatchers = new Set<FSWatcher>();
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await listen(server, port);
    const reloadFiles = new Set([
      ...Object.values(staticAssets).map((asset) => path.resolve(asset.filename)),
      ...(definition.watchFiles ?? []).map((filename) => path.resolve(filename)),
    ]);
    const filesByDirectory = groupFilesByDirectory(reloadFiles);
    filesByDirectory.forEach((basenames, directory) => {
      const watcher = watch(directory, (_event, changedFilename) => {
        if (changedFilename && !basenames.has(changedFilename.toString())) return;
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => sendEvent("reload", { revision: ++buildRevision }), 40);
      });
      watcher.on("error", (error) => {
        watcher.close();
        staticWatchers.delete(watcher);
        if (closed) return;
        const code = readFileSystemErrorCode(error);
        process.stderr.write(
          `[webview-preview] 文件监视器异常 (${code})；相关静态资源将不再自动刷新。\n`,
        );
        sendEvent("watch-error", { code });
      });
      staticWatchers.add(watcher);
    });
  } catch (error) {
    if (reloadTimer) clearTimeout(reloadTimer);
    staticWatchers.forEach((watcher) => watcher.close());
    staticWatchers.clear();
    await Promise.allSettled([
      buildContext.dispose(),
      server.listening ? closeServer(server) : Promise.resolve(),
    ]);
    throw error;
  }

  const listeningPort = readListeningPort(server);
  const url = `http://${LOOPBACK_HOST}:${listeningPort}/`;
  process.stdout.write(`[webview-preview] ${definition.label}: ${url}\n`);
  process.stdout.write("[webview-preview] 已启用自动刷新；Ctrl+C 停止。\n");

  return {
    url,
    port: listeningPort,
    async close() {
      if (closed) return;
      closed = true;
      if (reloadTimer) clearTimeout(reloadTimer);
      staticWatchers.forEach((watcher) => watcher.close());
      staticWatchers.clear();
      clients.forEach((client) => client.end());
      clients.clear();
      const results = await Promise.allSettled([
        buildContext.dispose(),
        server.listening ? closeServer(server) : Promise.resolve(),
      ]);
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) throw new AggregateError(failures.map((failure) => failure.reason));
    },
  };
}

function validateStaticAssets(
  assets: WebviewPreviewStaticAssets,
  bundleRoute: string,
  eventRoute: string,
): WebviewPreviewStaticAssets {
  const normalized: Record<string, WebviewPreviewStaticAsset> = {};
  Object.entries(assets).forEach(([route, asset]) => {
    const publicRoute = assertPublicRoute(route, "static asset route");
    if (publicRoute === bundleRoute || publicRoute === eventRoute || publicRoute === "/favicon.ico") {
      throw new Error(`预览路由冲突：${publicRoute}`);
    }
    if (!path.isAbsolute(asset.filename)) {
      throw new Error(`预览资源必须使用绝对路径：${asset.filename}`);
    }
    normalized[publicRoute] = Object.freeze({ ...asset });
  });
  return Object.freeze(normalized);
}

function assertPublicRoute(route: string, field: string): string {
  if (!route.startsWith("/") || route.includes("?") || route.includes("#")) {
    throw new Error(`${field} 必须是无查询参数的绝对 URL 路径：${route}`);
  }
  const pathname = readRequestPathname(route);
  if (!pathname || pathname !== route) {
    throw new Error(`${field} 必须是规范化 URL 路径：${route}`);
  }
  return pathname;
}

function readRequestPathname(requestUrl: string): string | undefined {
  if (!requestUrl.startsWith("/") || requestUrl.startsWith("//")) return undefined;
  try {
    return new URL(requestUrl, `http://${LOOPBACK_HOST}`).pathname;
  } catch {
    return undefined;
  }
}

function groupFilesByDirectory(filenames: ReadonlySet<string>): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  filenames.forEach((filename) => {
    const directory = path.dirname(filename);
    const basenames = grouped.get(directory) ?? new Set<string>();
    basenames.add(path.basename(filename));
    grouped.set(directory, basenames);
  });
  return grouped;
}

export function isAllowedWebviewPreviewHost(
  host: string | undefined,
  listeningPort: number,
): boolean {
  if (!host) return false;
  if (host === `${LOOPBACK_HOST}:${listeningPort}`) return true;
  return listeningPort === 80 && host === LOOPBACK_HOST;
}

function isAllowedHost(headers: IncomingHttpHeaders, server: Server): boolean {
  return isAllowedWebviewPreviewHost(headers.host, readListeningPort(server));
}

function readFileSystemErrorCode(error: Error): string {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" && code.length > 0 ? code : "UNKNOWN";
}

function readListeningPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("预览服务尚未监听 TCP 端口");
  return address.port;
}

function setPreviewHeaders(response: ServerResponse, scriptNonce?: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'${scriptNonce ? ` 'nonce-${scriptNonce}'` : ""}; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
