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

  it("预览入口强制从默认并列 Wing 解析组件，不静默使用 Registry 旧包", async () => {
    const source = await readFile(path.resolve("scripts/preview-primary-ui.ts"), "utf8");
    expect(source).toContain("resolveLocalWingRoot({ repoRoot: repositoryRoot })");
    expect(source).toContain("validateRequiredLocalWingPackages(wingRoot, LOCAL_WING_CODE_PACKAGES)");
    expect(source).toContain("createLocalWingEsbuildPlugin(wingRoot)");
    expect(source).not.toContain("node_modules/@phoenix-wing");
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

  it("展开 Ribbon 按短标题收缩且不均分，紧凑态仍使用共享固定尺寸", async () => {
    const [css, toolbarSource] = await Promise.all([
      readFile(path.resolve("ui-preview/styles.css"), "utf8"),
      readFile(path.resolve("src/ui/KtcToolbarStrip.ts"), "utf8"),
    ]);
    const expandedRule = css.match(/\.preview-ribbon-item\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";
    const ribbonRule = css.match(/\.preview-ribbon\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";

    expect(expandedRule).toMatch(/width:\s*var\(--ktc-ribbon-item-width, 68px\)/u);
    expect(expandedRule).toMatch(/min-width:\s*var\(--ktc-ribbon-item-min-width, 46px\)/u);
    expect(expandedRule).toMatch(/flex:\s*0 0 var\(--ktc-ribbon-item-flex-basis, 68px\)/u);
    expect(ribbonRule).toMatch(/flex-wrap:\s*var\(--ktc-ribbon-wrap, wrap\)/u);
    expect(toolbarSource).toContain("--ktc-ribbon-item-width:max-content");
    expect(toolbarSource).toContain("--ktc-ribbon-item-min-width:var(--ktc-toolbar-expanded-item-min-width,46px)");
    expect(toolbarSource).toContain("--ktc-ribbon-item-flex-basis:auto");
    expect(toolbarSource).toContain("--ktc-ribbon-item-width:34px");
    expect(toolbarSource).toContain("--ktc-ribbon-item-min-width:34px");
    expect(toolbarSource).toContain("--ktc-ribbon-wrap:nowrap");
    expect(toolbarSource).toContain("var(--ktc-toolbar-compact-module-min-width,18px)");
    expect(toolbarSource).toContain("var(--ktc-toolbar-expanded-module-min-width,18px)");
    expect(toolbarSource).toContain("var(--ktc-toolbar-toggle-track-width,24px)");
    expect(toolbarSource).toContain("var(--ktc-toolbar-compact-module-writing-mode,vertical-rl)");
    expect(toolbarSource).toContain("var(--ktc-toolbar-compact-module-font-size,8px)");
    expect(toolbarSource).toContain("var(--ktc-toolbar-compact-module-letter-spacing,.7px)");
    expect(css).not.toMatch(/--ktc-toolbar-(?:toggle-track-width|expanded-item-min-width|expanded-module-min-width|compact-module-[\w-]+):/u);
    expect(toolbarSource).toContain("margin:0 4px 4px 20px; padding:4px");
  });

  it("Preview 外框模拟 VS Code 的双侧圆角与宿主间隙", async () => {
    const css = await readFile(path.resolve("ui-preview/styles.css"), "utf8");
    const workbenchRule = css.match(/\.preview-workbench\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";
    const primaryRule = css.match(/\.preview-primary\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";
    const editorRule = css.match(/\.preview-editor\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";
    expect(workbenchRule).toMatch(/grid-template-columns:[^;]*8px/u);
    expect(workbenchRule).toMatch(/padding:\s*6px/u);
    expect(primaryRule).toMatch(/padding-bottom:\s*6px/u);
    expect(primaryRule).toMatch(/border-radius:\s*8px/u);
    expect(editorRule).toMatch(/border-radius:\s*8px/u);
    expect(css).not.toContain('.preview-icon-button[aria-pressed="true"]');
    expect(css).toMatch(/\.preview-primary-header\s*\{[^}]*height:\s*35px;[^}]*min-height:\s*35px/u);
    expect(css).toMatch(/\.preview-icon-button\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px/u);
  });

  it("代码辅助图标和空白欢迎态跟随正式 Host", async () => {
    const [html, source, formalGroup, catalog] = await Promise.all([
      readFile(path.resolve("ui-preview/index.html"), "utf8"),
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
      readFile(path.resolve("src/tools/codeAssistant/index.ts"), "utf8"),
      readFile(path.resolve("src/tools/toolRegistrationCatalog.json"), "utf8"),
    ]);

    expect(JSON.parse(catalog).tools.find((tool: { toolId: string }) => tool.toolId === "codeAssistant")?.icon)
      .toBe("code-assistant");
    expect(formalGroup).toContain('`media/tools/${CODE_ASSISTANT_GROUP_REGISTRATION.icon}.svg`');
    expect(html).toContain('id="preview-icon-code-assistant" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"');
    expect(source).toContain('?? "KT Auto Code"');
    expect(source).toContain('welcome.setAttribute("aria-label", "KT Auto Code 欢迎")');
    expect(source).toContain('intro.textContent = "从上方工具栏选择功能，对应的 Block 会在这里打开。"');
    expect(source).toContain('["Gitee 主页", "安装说明", "快速开始", "插件设置", "运行诊断"]');
    expect(source).not.toContain('welcome.textContent = "从工具栏或代码辅助目录选择一个工具。"');
  });

  it("自动代码不再专门覆盖主题配色，两侧共用 VS Code 主题变量", async () => {
    const css = await readFile(path.resolve("ui-preview/styles.css"), "utf8");
    expect(css).not.toMatch(/:root\[data-preview-theme="(?:dark|light|hc)"\]\s+\.preview-codegen/u);
    expect(css).not.toContain("--vscode-descriptionForeground: #94a0ab");
    expect(css).toContain("--vscode-list-activeSelectionBackground");
    expect(css).toContain("--vscode-list-activeSelectionForeground");
  });

  it("自动代码双侧接入同一内存会话，移除无正式能力的生成器占位", async () => {
    const [source, html] = await Promise.all([
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
      readFile(path.resolve("ui-preview/index.html"), "utf8"),
    ]);
    expect(source.match(/createPreviewCodegenSurface\(\{/gu)).toHaveLength(1);
    for (const method of ["createPrimary", "createRight", "createRightActions", "contextDirectory"]) {
      expect(source).toContain(`previewCodegenSurface.${method}()`);
    }
    expect(source).toContain('section.className = "preview-codegen-primary"');
    expect(source).not.toContain("PREVIEW_RIGHT_PRIMARY_SAMPLE.codegen");
    expect(source).not.toContain("createPreviewCodegenPrimaryModel");
    expect(html.match(/data-codegen-right-actions/gu)).toHaveLength(1);
    expect(html.match(/data-codegen-right-content/gu)).toHaveLength(1);
    expect(html).not.toContain("选择模板");
    expect(html).not.toContain("CAA Command");
    expect(html).not.toContain("[template] Phoenix Web");
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

  it("Ribbon 静态 DOM 不复制 Catalog 文案，且没有 Group placeholder Surface", async () => {
    const [html, source] = await Promise.all([
      readFile(path.resolve("ui-preview/index.html"), "utf8"),
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
    ]);

    expect(html).toContain("data-preview-ribbon");
    expect(html).not.toContain("data-ribbon-id");
    expect(html).not.toContain("项目改名与替换");
    expect(html).not.toContain("group-placeholder");
    expect(source).toContain("PREVIEW_RIBBON_ITEMS.forEach");
    expect(source).not.toContain("GROUP_COPY");
    expect(source).not.toContain("renderGroupPlaceholder");
    expect(source).not.toContain("groupPlaceholder");
  });

  it("共享外壳组件在原型中通过公开 Entry 注册", async () => {
    const previewSource = await readFile(path.resolve("ui-preview/src/main.ts"), "utf8");

    expect(previewSource).toContain("KtcCurrentToolRegionEntry.js");
    expect(previewSource).toContain("KtcDirectoryBarEntry.js");
    expect(previewSource).toContain("KtcPrimaryShellEntry.js");
    expect(previewSource).toContain("KtcToolbarStripEntry.js");
    expect(previewSource).toContain("KTC_CURRENT_TOOL_REGION_ACTION");
  });

  it("原型与正式 Primary 适配器使用同一紧凑 Open Items 尺寸", async () => {
    const [css, panelSource, openItemsSource] = await Promise.all([
      readFile(path.resolve("ui-preview/styles.css"), "utf8"),
      readFile(path.resolve("src/sidebar/panelHtml.ts"), "utf8"),
      readFile(path.resolve("src/ui/KtcOpenItemsBar.ts"), "utf8"),
    ]);

    const previewRule = css.match(/#preview-open-items-bar\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";
    const formalRule = panelSource.match(/#open-items-bar\s*\{(?<body>[^}]*)\}/u)?.groups?.body ?? "";
    expect(previewRule).toMatch(/--ktc-open-items-bar-height:\s*27px/u);
    expect(previewRule).toMatch(/--ktc-open-items-track-gap:\s*0/u);
    expect(previewRule).toMatch(/margin:\s*0/u);
    expect(formalRule).toMatch(/--ktc-open-items-bar-height:\s*27px/u);
    expect(formalRule).toMatch(/--ktc-open-items-track-gap:\s*0/u);
    expect(formalRule).toMatch(/margin:\s*0/u);
    expect(openItemsSource).toContain("var(--ktc-open-items-bar-height,31px)");
    expect(openItemsSource).toContain("var(--ktc-open-items-track-gap,1px)");
  });

  it("搜索替换 Preview 以正式功能为准补齐 Primary 控件和默认值", async () => {
    const [source, css] = await Promise.all([
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
      readFile(path.resolve("ui-preview/styles.css"), "utf8"),
    ]);
    const replaceStart = source.indexOf("function createSearchReplacePrimary");
    const replaceEnd = source.indexOf("function renderAutoBuildSampleRows", replaceStart);
    const replaceSource = source.slice(replaceStart, replaceEnd);

    expect(replaceStart).toBeGreaterThan(0);
    expect(replaceEnd).toBeGreaterThan(replaceStart);
    expect(replaceSource).toContain('queryToggle.textContent = "⌄"');
    expect(replaceSource).toContain('searchAction.textContent = "搜索"');
    expect(replaceSource).toContain('replaceAction.textContent = "替换"');
    expect(replaceSource).toContain('document.createElement("pnw-combo")');
    expect(replaceSource).toContain('ariaLabel: "最近改名记录"');
    expect(replaceSource).toContain('clearLabel: "全部清空"');
    expect(replaceSource).not.toContain('clearHistory.textContent = "清空"');
    expect(replaceSource).toContain('variantsToggle.textContent = "常用变形"');
    expect(replaceSource).toContain('projectRename.textContent = "项目改名"');
    expect(replaceSource).toContain('[["文本", true], ["文件名", false], ["文件夹名", false]]');
    expect(replaceSource).toContain('["gbk", "GBK（本地）"]');
    expect(replaceSource).toContain('document.createElement("ktc-rename-results-panel")');
    expect(replaceSource).not.toContain('textContent = "预览"');
    expect(replaceSource).not.toContain('textContent = "应用所选"');
    expect(css).toMatch(/\.preview-search-replace-primary\s*\{[^}]*gap:\s*0/u);
    expect(css).toMatch(/\.preview-search-replace-helpers > \.preview-search-replace-project\s*\{[^}]*border-color:[^}]*background:\s*var\(--vscode-button-background\)/u);
    expect(css).toMatch(/\.preview-search-replace-variant-row\s*\{[^}]*grid-template-columns:\s*18px minmax\(0, 1fr\) minmax\(0, 1fr\) 18px 18px 18px/u);
  });

  it("AutoBuild Preview 由单一样例驱动，并锁定 Primary/Right 的迁移边界", async () => {
    const [html, source, stateSource, sampleSource, css, workbenchSource] = await Promise.all([
      readFile(path.resolve("ui-preview/index.html"), "utf8"),
      readFile(path.resolve("ui-preview/src/main.ts"), "utf8"),
      readFile(path.resolve("ui-preview/src/previewAutoBuildState.ts"), "utf8"),
      readFile(path.resolve("ui-preview/src/previewAutoBuildSample.ts"), "utf8"),
      readFile(path.resolve("ui-preview/styles.css"), "utf8"),
      readFile(path.resolve("ui-preview/src/previewAutoBuildWorkbench.ts"), "utf8"),
    ]);
    const rightStart = html.indexOf('data-editor-panel="autoBuild"');
    const rightEnd = html.indexOf("</ktc-right-view-shell>", rightStart);
    const autoBuildRight = html.slice(rightStart, rightEnd);

    expect(source).toContain("./previewAutoBuildState.js");
    expect(source).toContain("derivePreviewAutoBuildState(autoBuildState)");
    expect(source).toContain("reducePreviewAutoBuildState(autoBuildState");
    expect(source).toContain("preview-auto-build-primary");
    expect(source).toContain('activeToolId: isOpenTool(activeNavigatorToolId) ? activeNavigatorToolId : ""');
    expect(source).toContain("preview-primary-config-bar");
    expect(source).toContain("configRegion.append(configBar, recentConfig, configStatus)");
    expect(source).not.toContain("KtcCreateAutoBuildConfigurationActionIcon");
    expect(source).toContain('openConfig.textContent = "打开"');
    expect(source).toContain('reveal.textContent = "详细配置"');
    expect(css).toMatch(/\.preview-primary-config-bar\s*\{[^}]*flex-wrap:\s*wrap/u);
    expect(css).toMatch(/\.preview-primary-config-bar button\s*\{[^}]*padding:\s*2px 8px;[^}]*white-space:\s*nowrap/u);
    expect(source).toContain("section.append(configRegion, heading, actions, executionOptions, statusLine, metrics, maintenance, environment)");
    expect(source).toContain("preview-primary-maintenance");
    expect(source).toContain('sync.textContent = "同步脚本"');
    expect(stateSource).not.toContain('actionId: "openCleanup"');
    expect(stateSource).toContain('readonly type: "openCleanup"');
    expect(source).toContain("openAutoBuildCleanupDialog()");
    expect(source).toContain("preview-cleanup-dialog");
    expect(source).not.toContain("preview-primary-repository-cleanup");
    expect(source).not.toContain("preview-primary-cleanup-block");
    expect(source).not.toContain("preview-primary-project-list");
    expect(source).not.toContain("preview-primary-subheading");
    expect(source).not.toContain("/workspace/Phoenix");
    expect(source).not.toContain("auto-build.local.json");
    expect(sampleSource).toContain('../fixtures/auto-build.sample.json');
    expect(stateSource).toContain("PREVIEW_AUTO_BUILD_SAMPLE");
    expect(rightStart).toBeGreaterThan(0);
    expect(rightEnd).toBeGreaterThan(rightStart);
    const headerActions = autoBuildRight.slice(autoBuildRight.indexOf('slot="actions"'), autoBuildRight.indexOf("</div>"));
    expect(headerActions.match(/data-auto-build-action="([^"]+)"/gu)).toEqual([
      'data-auto-build-action="openCleanup"', 'data-auto-build-action="preflight"', 'data-auto-build-action="toggleRun"',
    ]);
    expect(html.match(/data-auto-build-action="openCleanup"/gu)).toHaveLength(1);
    expect(source).toContain('actionId === "preflight" || actionId === "openCleanup"');
    expect(source).toContain('[data-auto-build-action=\'openCleanup\']');
    expect(source).toContain('if (item.toolId === "autoBuild") previewAutoBuildCleanupSurface.close()');
    expect(autoBuildRight).not.toContain("preview-build-config-bar");
    expect(autoBuildRight).not.toContain("手动清理 Root");
    expect(autoBuildRight).not.toContain("并行 CMake / CAA");
    expect(autoBuildRight).not.toContain("运行前清理仓库");
    expect(autoBuildRight).not.toContain("库探测结果");
    expect(autoBuildRight).not.toContain('data-auto-build-action="openScript"');
    expect(autoBuildRight).toContain("项目与仓库");
    expect(autoBuildRight).toContain('<div class="preview-build-config-row is-head" aria-hidden="true"><span>角色</span><span>目录</span><span>分支</span></div>');
    expect(autoBuildRight).toContain("<strong>当前 ROOT_DIR</strong>");
    expect(autoBuildRight).toContain("<strong>工作目录</strong>");
    expect(autoBuildRight).toContain("<strong>ROOT_DIR_3rdParty</strong>");
    expect(autoBuildRight).toContain("<strong>CMake 项目</strong>");
    expect(css).toMatch(/\.preview-build-config-row\s*\{[^}]*grid-template-columns:\s*150px minmax\(220px, 1fr\) 150px/u);
    expect(autoBuildRight).toContain("data-auto-build-update-root");
    expect(autoBuildRight).toContain("data-auto-build-update-third-party");
    expect(autoBuildRight).toContain("data-auto-build-project-tool=\"selectDirectories\"");
    expect(autoBuildRight).toContain("data-auto-build-project-tool=\"import\"");
    expect(autoBuildRight).toContain("data-auto-build-project-tool=\"discover\"");
    expect(autoBuildRight).toContain("data-auto-build-project-tool=\"removeDisabled\"");
    expect(autoBuildRight).toContain("data-auto-build-probe-columns");
    expect(autoBuildRight).toContain("data-auto-build-project-rows");
    expect(autoBuildRight).toContain("data-auto-build-mode");
    expect(workbenchSource).toContain('`probe:${repository.id}`');
    expect(workbenchSource).toContain('`run:${repository.id}`');
    expect(workbenchSource).toContain('`update:${repository.id}`');
    expect(source).toContain("openAutoBuildManifestImportDialog()");
    expect(source).toContain("preview-manifest-dialog");
    expect(css).toMatch(/\.preview-build-table\s*\{[^}]*border-collapse:\s*separate/u);
    expect(css).toMatch(/\.preview-build-table th:last-child,\s*\n\.preview-build-table td:last-child\s*\{[^}]*position:\s*sticky;[^}]*right:\s*0/u);
    expect(css).toMatch(/\.preview-build-table th:nth-child\(9\)\s*\{\s*width:\s*92px/u);
  });
});
