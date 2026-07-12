import { describe, expect, it } from "vitest";
import { ktcCreateWebviewSecurity } from "./webviewSupport.js";

describe("webviewSupport", () => {
  const webview = { cspSource: "vscode-webview://kt-auto-code" };

  it("为每个 Webview 生成独立的 CSP nonce", () => {
    const first = ktcCreateWebviewSecurity(webview);
    const second = ktcCreateWebviewSecurity(webview);

    expect(first.nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second.nonce).not.toBe(first.nonce);
    expect(first.csp).toContain(`script-src 'nonce-${first.nonce}'`);
    expect(first.csp).not.toContain("img-src");
  });

  it("仅在需要图标的 Side Bar 允许 Webview 和 data 图像", () => {
    const security = ktcCreateWebviewSecurity(webview, { allowImages: true });
    expect(security.csp).toContain("img-src vscode-webview://kt-auto-code data:");
  });
});
