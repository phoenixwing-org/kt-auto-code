import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ktcReadPrimaryPreviewPort,
  ktcResolvePrimaryPreviewAsset,
} from "../../scripts/preview-primary-ui.js";

describe("Primary UI preview server helpers", () => {
  it("只解析显式公开的原型资源", () => {
    expect(ktcResolvePrimaryPreviewAsset("/")?.contentType).toContain("text/html");
    expect(ktcResolvePrimaryPreviewAsset("/styles.css?rev=2")?.contentType).toContain("text/css");
    expect(path.basename(ktcResolvePrimaryPreviewAsset("/__webview_preview_client.js")?.filename ?? "")).toBe("client.js");
    expect(ktcResolvePrimaryPreviewAsset("/package.json")).toBeUndefined();
    expect(ktcResolvePrimaryPreviewAsset("/../package.json")).toBeUndefined();
    expect(ktcResolvePrimaryPreviewAsset("/%2e%2e/package.json")).toBeUndefined();
    expect(ktcResolvePrimaryPreviewAsset("/src/sidebar/panelHtml.ts")).toBeUndefined();
  });

  it("支持 Vite 风格端口参数并拒绝危险值", () => {
    expect(ktcReadPrimaryPreviewPort([])).toBe(4173);
    expect(ktcReadPrimaryPreviewPort(["--port", "5173"])).toBe(5173);
    expect(ktcReadPrimaryPreviewPort(["--port=6173"])).toBe(6173);
    expect(() => ktcReadPrimaryPreviewPort(["--port"])).toThrow("缺少端口值");
    expect(() => ktcReadPrimaryPreviewPort(["--port=0"])).toThrow("无效端口");
    expect(() => ktcReadPrimaryPreviewPort(["--port=70000"])).toThrow("无效端口");
  });

  it("按目录、Toolbar、当前工具、打开项四段模拟 Primary 原型外壳", async () => {
    const html = await readFile(path.resolve("ui-preview/index.html"), "utf8");
    const toolbarAt = html.indexOf("class=\"preview-toolbar-strip\"");
    const directoryAt = html.indexOf("class=\"preview-directory-row\"");
    const currentToolAt = html.indexOf("class=\"preview-current-tool\"");
    const openItemsAt = html.indexOf("id=\"preview-open-items-bar\"");
    const editorAt = html.indexOf("class=\"preview-editor\"");
    const outputAt = html.indexOf("id=\"preview-system-output\"");

    expect(toolbarAt).toBeGreaterThan(0);
    expect(directoryAt).toBeGreaterThan(0);
    expect(toolbarAt).toBeGreaterThan(directoryAt);
    expect(currentToolAt).toBeGreaterThan(toolbarAt);
    expect(openItemsAt).toBeGreaterThan(currentToolAt);
    expect(openItemsAt).toBeLessThan(editorAt);
    expect(outputAt).toBeGreaterThan(html.lastIndexOf("</ktc-right-view-shell>"));
    expect(html.match(/id="preview-system-output"/gu)).toHaveLength(1);
    expect(html.match(/data-action="toggle-output"/gu)).toHaveLength(1);
    expect(html).not.toContain("preview-build-output");
    expect(html).not.toContain("preview-tool-area");
    expect(html.match(/data-action="toggle-primary"/gu)).toHaveLength(1);
    expect(html).not.toContain("data-host-option");
    expect(html).toContain("data-current-tool-icon");
    expect(html).not.toContain("data-action=\"toggle-current-tool\"");
    expect(html).not.toContain("class=\"preview-current-tool-toggle\"");
    expect(html.indexOf("data-action=\"toggle-directory\"")).toBeLessThan(html.indexOf("data-action=\"open-ignore\""));
    expect(html.indexOf("data-action=\"open-ignore\"")).toBeLessThan(html.indexOf("data-action=\"open-settings\""));
  });

  it("只把已确认的 AutoBuild 摘要与维护入口移入 Primary", async () => {
    const [html, source] = await Promise.all([
      readFile(path.resolve("ui-preview/index.html"), "utf8"),
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
    ]);

    expect(source).toContain("preview-primary-config-bar");
    expect(source).toContain("preview-primary-maintenance");
    expect(source).toContain("运行概览");
    expect(source).toContain("项目摘要");
    expect(source).toContain("工程环境");
    expect(source.indexOf("section.append(heading, metrics, actions, configBar")).toBeGreaterThan(0);
    expect(html).not.toContain("preview-build-config-bar");
    expect(html).not.toContain("手动清理 Root");
    expect(html).toContain("构建配置");
    expect(html).toContain("项目表");
    expect(html).toContain("任务列表");
    expect(html).toContain("库探测结果");
  });
});
