import path from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ktcReadPrimaryPreviewPort,
  ktcResolvePrimaryPreviewAsset,
} from "../../scripts/preview-primary-ui.js";
import { PREVIEW_TOOL_CATALOG } from "../../ui-preview/src/previewToolCatalog.js";

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
    const toolbarAt = html.indexOf("<ktc-toolbar-strip");
    const directoryAt = html.indexOf("<ktc-directory-bar");
    const currentToolAt = html.indexOf("<ktc-current-tool-region");
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
    expect(html.match(/<ktc-primary-shell\b/gu)).toHaveLength(1);
    expect(html.indexOf('slot="directory"')).toBeLessThan(html.indexOf('slot="toolbar"'));
    expect(html.indexOf('slot="toolbar"')).toBeLessThan(html.indexOf('slot="current"'));
    expect(html.indexOf('slot="current"')).toBeLessThan(html.indexOf('slot="open-items"'));
    expect(html.match(/id="preview-system-output"/gu)).toHaveLength(1);
    expect(html.match(/data-action="toggle-output"/gu)).toHaveLength(1);
    expect(html).not.toContain("preview-build-output");
    expect(html).not.toContain("preview-tool-area");
    expect(html.match(/data-action="toggle-primary"/gu)).toHaveLength(1);
    expect(html).toContain('data-action="toggle-primary" data-preview-output="handled"');
    expect(html).toContain('data-action="toggle-directory" data-preview-output="handled"');
    expect(html).not.toContain("data-host-option");
    expect(html.match(/<ktc-current-tool-region\b/gu)).toHaveLength(1);
    expect(html.match(/<ktc-directory-bar\b/gu)).toHaveLength(1);
    expect(html.match(/<ktc-toolbar-strip\b/gu)).toHaveLength(1);
    expect(html.match(/slot="ribbon"/gu)).toHaveLength(1);
    expect(html.match(/slot="group-content"/gu)).toHaveLength(1);
    expect(html).not.toContain("data-current-tool-icon");
    expect(html).not.toContain("preview-current-tool-header");
    expect(html).not.toContain("data-action=\"toggle-current-tool\"");
    expect(html).not.toContain("class=\"preview-current-tool-toggle\"");
    expect(html.indexOf("data-action=\"toggle-directory\"")).toBeLessThan(html.indexOf("data-action=\"open-ignore\""));
    expect(html.indexOf("data-action=\"open-ignore\"")).toBeLessThan(html.indexOf("data-action=\"open-settings\""));
  });

  it("锁定 Ribbon 固定尺寸与下级导航缩进，不随 Primary 宽度均分拉伸", async () => {
    const [css, toolbarSource] = await Promise.all([
      readFile(path.resolve("ui-preview/styles.css"), "utf8"),
      readFile(path.resolve("src/ui/KtcToolbarStrip.ts"), "utf8"),
    ]);
    const expandedRule = css.match(/\.preview-ribbon-item\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";
    const ribbonRule = css.match(/\.preview-ribbon\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";

    expect(expandedRule).toMatch(/width:\s*var\(--ktc-ribbon-item-width, 68px\)/u);
    expect(expandedRule).toMatch(/flex:\s*0 0 var\(--ktc-ribbon-item-flex-basis, 68px\)/u);
    expect(ribbonRule).toMatch(/flex-wrap:\s*var\(--ktc-ribbon-wrap, wrap\)/u);
    expect(toolbarSource).toContain("--ktc-ribbon-item-width:68px");
    expect(toolbarSource).toContain("--ktc-ribbon-item-width:34px");
    expect(toolbarSource).toContain("--ktc-ribbon-wrap:nowrap");
    expect(toolbarSource).toContain("margin:0 4px 4px 20px; padding:4px");
  });

  it("Catalog 的 Right panelId 与 HTML Shell 严格一一对应", async () => {
    const html = await readFile(path.resolve("ui-preview/index.html"), "utf8");
    const catalogPanelIds = PREVIEW_TOOL_CATALOG.flatMap(({ surfaces }) => (
      surfaces.right ? [surfaces.right.panelId] : []
    )).sort();
    const htmlPanelIds = Array.from(
      html.matchAll(/<ktc-right-view-shell\b[^>]*\bdata-editor-panel="([^"]+)"/gu),
      (match) => match[1] ?? "",
    ).sort();

    expect(new Set(catalogPanelIds).size).toBe(catalogPanelIds.length);
    expect(new Set(htmlPanelIds).size).toBe(htmlPanelIds.length);
    expect(htmlPanelIds).toEqual(catalogPanelIds);
  });

  it("Current Tool 共享组件只由原型注册，不静默迁改正式 Host", async () => {
    const [previewSource, panelSource, buildSource] = await Promise.all([
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
      readFile(path.resolve("src/sidebar/panelHtml.ts"), "utf8"),
      readFile(path.resolve("esbuild.mjs"), "utf8"),
    ]);

    expect(previewSource).toContain("KtcCurrentToolRegionEntry.js");
    expect(previewSource).toContain("KtcDirectoryBarEntry.js");
    expect(previewSource).toContain("KtcPrimaryShellEntry.js");
    expect(previewSource).toContain("KtcToolbarStripEntry.js");
    expect(previewSource).toContain("KTC_CURRENT_TOOL_REGION_ACTION");
    expect(panelSource).not.toContain("KtcCurrentToolRegion");
    expect(panelSource).not.toContain("ktc-current-tool-region");
    expect(panelSource).not.toContain("KtcDirectoryBar");
    expect(panelSource).not.toContain("ktc-directory-bar");
    expect(panelSource).not.toContain("KtcToolbarStrip");
    expect(panelSource).not.toContain("ktc-toolbar-strip");
    expect(buildSource).not.toContain("KtcCurrentToolRegionEntry");
    expect(buildSource).not.toContain("KtcPrimaryShellEntry");
    expect(buildSource).not.toContain("KtcDirectoryBarEntry");
    expect(buildSource).not.toContain("KtcToolbarStripEntry");
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
