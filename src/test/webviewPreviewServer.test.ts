import { watch, type FSWatcher } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  isAllowedWebviewPreviewHost,
  readWebviewPreviewPort,
  resolveWebviewPreviewAsset,
  startWebviewPreviewServer,
  type WebviewPreviewDefinition,
} from "../../scripts/webview-preview/server.js";

describe("generic webview preview helpers", () => {
  const absoluteIndex = path.resolve("preview-index.html");
  const assets = Object.freeze({
    "/": { filename: absoluteIndex, contentType: "text/html; charset=utf-8" },
  });

  it("只接受 origin-form 请求路径和显式资源", () => {
    expect(resolveWebviewPreviewAsset("/?theme=dark", assets)?.filename).toBe(absoluteIndex);
    expect(resolveWebviewPreviewAsset("/missing", assets)).toBeUndefined();
    expect(resolveWebviewPreviewAsset("//malicious.example/path", assets)).toBeUndefined();
    expect(resolveWebviewPreviewAsset("http://malicious.example/", assets)).toBeUndefined();
  });

  it("通用端口解析器支持覆盖并拒绝缺失或越界值", () => {
    expect(readWebviewPreviewPort([], 4173)).toBe(4173);
    expect(readWebviewPreviewPort(["--port", "5173"], 4173)).toBe(5173);
    expect(() => readWebviewPreviewPort(["--port"], 4173)).toThrow("缺少端口值");
    expect(() => readWebviewPreviewPort(["--port=65536"], 4173)).toThrow("无效端口");
  });

  it("Host 仅允许当前 loopback 端口，并兼容 HTTP 80 省略端口", () => {
    expect(isAllowedWebviewPreviewHost("127.0.0.1:4173", 4173)).toBe(true);
    expect(isAllowedWebviewPreviewHost("127.0.0.1", 80)).toBe(true);
    expect(isAllowedWebviewPreviewHost("127.0.0.1:80", 80)).toBe(true);
    expect(isAllowedWebviewPreviewHost("127.0.0.1", 4173)).toBe(false);
    expect(isAllowedWebviewPreviewHost("localhost:4173", 4173)).toBe(false);
    expect(isAllowedWebviewPreviewHost("malicious.example", 80)).toBe(false);
    expect(isAllowedWebviewPreviewHost(undefined, 80)).toBe(false);
  });

  it("在构建前拒绝保留路由冲突和相对资源路径", async () => {
    const base = definitionFixture({
      staticAssets: { "/": { filename: absoluteIndex, contentType: "text/html" } },
    });
    await expect(startWebviewPreviewServer({ ...base, bundleRoute: "/" }, 0))
      .rejects.toThrow("保留路由冲突");
    await expect(startWebviewPreviewServer({
      ...base,
      staticAssets: { "/": { filename: "relative.html", contentType: "text/html" } },
    }, 0)).rejects.toThrow("绝对路径");
  });
});

describe("generic webview preview server", () => {
  it("仅在 loopback/允许路由提供资源并可重复关闭", async () => {
    const previewRoot = await mkdtemp(path.join(os.tmpdir(), "ktc-webview-preview-"));
    const entryPoint = path.join(previewRoot, "main.ts");
    const indexFile = path.join(previewRoot, "index.html");
    await writeFile(entryPoint, "document.body.dataset.preview = 'ready';\n", "utf8");
    await writeFile(indexFile, "<!doctype html><title>Preview fixture</title>\n", "utf8");
    const server = await startWebviewPreviewServer({
      label: "test fixture",
      workingDirectory: previewRoot,
      entryPoint,
      bundleRoute: "/fixture.js",
      staticAssets: {
        "/": { filename: indexFile, contentType: "text/html; charset=utf-8" },
      },
    }, 0);

    try {
      expect(server.port).toBeGreaterThan(0);
      const home = await fetch(server.url);
      expect(home.status).toBe(200);
      expect(home.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(await home.text()).toContain("Preview fixture");

      const bundle = await fetch(`${server.url}fixture.js`, { method: "HEAD" });
      expect(bundle.status).toBe(200);
      expect(bundle.headers.get("content-type")).toContain("text/javascript");
      expect((await fetch(`${server.url}package.json`)).status).toBe(404);
      expect(await requestStatus(server.port, "/", "malicious.example")).toBe(403);
      expect(await requestStatus(server.port, "http://malicious.example/", `127.0.0.1:${server.port}`)).toBe(400);
      expect(await requestStatus(server.port, "/", `127.0.0.1:${server.port}`, "POST")).toBe(405);

      const events = await fetch(`${server.url}__webview_preview_events`);
      const reader = events.body?.getReader();
      expect(reader).toBeDefined();
      expect(await readUntilEvent(reader!, "ready")).toContain("event: ready");
      await writeFile(indexFile, "<!doctype html><title>Changed fixture</title>\n", "utf8");
      expect(await readUntilEvent(reader!, "reload")).toContain("event: reload");
      await reader?.cancel();
    } finally {
      await server.close();
      await server.close();
      await rm(previewRoot, { recursive: true, force: true });
    }
  });

  it("静态文件监视器运行期报错时保持服务存活并通知客户端", async () => {
    const previewRoot = await mkdtemp(path.join(os.tmpdir(), "ktc-webview-preview-watch-error-"));
    const entryPoint = path.join(previewRoot, "main.ts");
    const indexFile = path.join(previewRoot, "index.html");
    await writeFile(entryPoint, "document.body.dataset.preview = 'ready';\n", "utf8");
    await writeFile(indexFile, "<!doctype html><title>Watcher fixture</title>\n", "utf8");

    const probeWatcher = watch(previewRoot, () => undefined);
    const watcherPrototype = Object.getPrototypeOf(probeWatcher) as FSWatcher;
    probeWatcher.close();
    const onSpy = vi.spyOn(watcherPrototype, "on");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    let server: Awaited<ReturnType<typeof startWebviewPreviewServer>> | undefined;

    try {
      server = await startWebviewPreviewServer({
        label: "watch error fixture",
        workingDirectory: previewRoot,
        entryPoint,
        bundleRoute: "/fixture.js",
        staticAssets: {
          "/": { filename: indexFile, contentType: "text/html; charset=utf-8" },
        },
      }, 0);

      const errorCallIndex = onSpy.mock.calls.findIndex(([eventName]) => eventName === "error");
      expect(errorCallIndex).toBeGreaterThanOrEqual(0);
      const staticWatcher = onSpy.mock.contexts[errorCallIndex] as FSWatcher;
      const events = await fetch(`${server.url}__webview_preview_events`);
      const reader = events.body?.getReader();
      expect(reader).toBeDefined();
      expect(await readUntilEvent(reader!, "ready")).toContain("event: ready");

      const watcherError = Object.assign(new Error("synthetic watcher failure"), { code: "EIO" });
      expect(() => staticWatcher.emit("error", watcherError)).not.toThrow();
      expect(await readUntilEvent(reader!, "watch-error")).toContain('"code":"EIO"');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("(EIO)"));
      expect((await fetch(server.url)).status).toBe(200);
      await reader?.cancel();
    } finally {
      await server?.close();
      onSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(previewRoot, { recursive: true, force: true });
    }
  });
});

function definitionFixture(
  overrides: Partial<WebviewPreviewDefinition> = {},
): WebviewPreviewDefinition {
  return {
    label: "fixture",
    workingDirectory: path.resolve("."),
    entryPoint: path.resolve("missing-entry.ts"),
    bundleRoute: "/fixture.js",
    staticAssets: {},
    ...overrides,
  };
}

async function readUntilEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  event: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let contents = "";
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`等待 SSE ${event} 超时`)), 3_000);
  });
  try {
    while (!contents.includes(`event: ${event}`)) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) throw new Error(`SSE 在 ${event} 前结束`);
      contents += decoder.decode(chunk.value, { stream: true });
    }
    return contents;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function requestStatus(
  port: number,
  requestPath: string,
  host: string,
  method = "GET",
): Promise<number> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      method,
      headers: { Host: host },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}
