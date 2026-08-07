import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  KT_CODEGEN_BLOCK_PRESENTATIONS,
  KT_CODEGEN_LEGACY_BLOCKS,
  ktCodegenBlockKeysForPreset,
} from "@phoenix-wing/kt-codegen";
import { getCodegenEditorHtml } from "./editorHtml.js";

describe("codegen editor HTML", () => {
  it("生成一 JSON 一 View 的17列表格原型并保持脚本可解析", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getCodegenEditorHtml>[1];
    const html = getCodegenEditorHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getCodegenEditorHtml>[0], extensionUri, {
      uri: "file:///workspace/example.json",
      fileName: "example.json",
      table: {
        kind: "kt.codegen.table-data",
        schemaVersion: 1,
        documentRevision: 0,
        selectedRow: null,
        items: [],
      },
      controls: {
        kind: "kt.codegen.control-ui-model",
        schemaVersion: 1,
        documentId: "file:///workspace/example.json",
        uri: "file:///workspace/example.json",
        fileName: "example.json",
        blocks: KT_CODEGEN_LEGACY_BLOCKS.map((block) => ({
          ...block,
          ...KT_CODEGEN_BLOCK_PRESENTATIONS[block.legacyId],
          controlWords: block.key,
          status: "pending" as const,
          hitCount: 0,
          artifactCount: 0,
        })),
        unclosed: [],
        selectedBlockKeys: KT_CODEGEN_LEGACY_BLOCKS.map((block) => block.key),
        singleSelectionMode: false,
        showMissingTemplates: false,
        preflightAvailable: false,
        missingTemplates: [],
        presets: {
          all: ktCodegenBlockKeysForPreset("all"),
          none: ktCodegenBlockKeysForPreset("none"),
          cppOnly: ktCodegenBlockKeysForPreset("cpp-only"),
          fieldCode: ktCodegenBlockKeysForPreset("field-code"),
        },
      },
      dirty: false,
      externalConflict: false,
      externalState: "current",
    });
    expect(html).toContain("Codegen JSON 编辑 View");
    expect(html).toContain('<kt-codegen-table id="codegen-table" layout="page" collapsible>');
    expect(html).not.toContain('<kt-codegen-table id="codegen-table" layout="contained"');
    expect(html).toContain("test-webview:/extension/dist/codegen-table.js");
    expect(html).toContain("test-webview:/extension/dist/codegen-control-catalog.js");
    expect(html).toContain('type: "codegenEditorDirty"');
    expect(html).toContain('type: "codegenEditorExchange"');
    expect(html).toContain('action: "save"');
    expect(html).toContain('action: "sync"');
    expect(html).not.toContain('type: "codegenEditorCell"');
    expect(html).toContain('action: "reload"');
    expect(html).toContain("↻ 重新加载");
    expect(html).toContain('action: "preflight"');
    expect(html).toContain('action: "cancelPreflight"');
    expect(html).toContain('message.type === "codegenPreflightState"');
    expect(html).toContain('model.externalConflict');
    expect(html).toContain('↻ 重新加载');
    expect(html).toContain('span.conflict');
    expect(html).toContain('id="document-state" role="status" aria-live="polite"');
    expect(html).toContain('preflight.setAttribute("aria-pressed"');
    expect(html).toContain('table.setAttribute("aria-busy"');
    expect(html).toContain('flex-wrap: wrap');
    const viewToolbarRule = html.match(/\.view-toolbar \{([^}]*)\}/u)?.[1];
    expect(viewToolbarRule).toBeTruthy();
    expect(viewToolbarRule).toContain("position: sticky");
    expect(viewToolbarRule).toContain("top: 0");
    expect(viewToolbarRule).toContain("z-index: 20");
    expect(viewToolbarRule).toContain("background: var(--vscode-sideBar-background)");
    expect(viewToolbarRule).toContain("box-shadow: 0 2px 0 var(--vscode-panel-border)");
    expect(html).toContain('body.vscode-high-contrast kt-codegen-table');
    expect(html).toContain('body.vscode-high-contrast-light kt-codegen-table');
    expect(html).toContain('--vscode-contrastBorder');
    expect(html).toContain('--ktc-ui-border: var(--vscode-contrastBorder, var(--vscode-focusBorder));');
    expect(html).toContain('--ktc-ui-active-border: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder));');
    expect(html).toContain('button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border');
    expect(html).toContain('@media (max-width: 800px)');
    expect(html).toContain('<ktc-codegen-control-panel id="control-panel" mode="full">');
    expect(html).not.toContain("height: min(44vh, 460px)");
    expect(html).toContain("overflow-y: auto");
    expect(html.match(/overflow-y: auto/g)).toHaveLength(1);
    expect(html).toContain("scrollbar-gutter: stable");
    expect(html).toContain("body::-webkit-scrollbar-thumb");
    expect(html).toContain("rgba(121, 121, 121, .7)");
    expect(html).toContain("kt-codegen-table { flex: 0 0 auto; min-height: 0; }");
    expect(html).not.toContain("kt-codegen-table { flex: 1 1 auto");
    expect(html).not.toContain("min-height: 230px");
    expect(html).not.toContain('@media (max-width: 760px)');
    expect(html).not.toContain("height: 540px; min-height: 540px");
    expect(html).not.toContain("inset: 34px 0 0");
    expect(html).toContain("position: static");
    const controlDrawerPanelRule = html.match(
      /\.control-drawer\[open\] > ktc-codegen-control-panel \{([^}]*)\}/u,
    )?.[1];
    expect(controlDrawerPanelRule).toBeTruthy();
    expect(controlDrawerPanelRule).not.toContain("overflow");
    const controlDrawerRule = html.match(/\.control-drawer \{([^}]*)\}/u)?.[1];
    expect(controlDrawerRule).toBeTruthy();
    expect(controlDrawerRule).toContain("overflow: visible");
    expect(controlDrawerRule).not.toContain("overflow: hidden");
    expect(html).not.toContain('.view-toolbar button.secondary-action { display: none; }');
    expect(html).toContain('id="control-drawer"');
    expect(html).toContain('<button id="controls" type="button" aria-expanded="false">预检结果</button>');
    expect(html).toContain('<span class="control-summary-title">预检结果</span>');
    expect(html).not.toContain("控制符与预检");
    expect(html).not.toContain("控制符 / 结果");
    expect(html).not.toContain('type: "codegenControlSelection"');
    expect(html).not.toContain('type: "codegenControlDisplay"');
    expect(html).not.toContain('type: "codegenControlOutput"');
    expect(html).toContain('type: "codegenControlOpen"');
    expect(html).toContain('type: "codegenControlCopyEnd"');
    expect(html).toContain('blockKey: event.detail.blockKey');
    expect(html).toContain('new ResizeObserver(syncDetailStickyTop).observe(viewToolbar)');
    expect(html).toContain('"--pnw-codegen-detail-sticky-top"');
    expect(html).toContain('"--pnw-codegen-detail-height"');
    expect(html).toContain('window.addEventListener("resize", syncDetailStickyTop)');
    expect(html).toContain('type: "codegenEditorLayout"');
    expect(html).toContain('"kt-codegen-control-split-change"');
    expect(html).toContain("controlPanel.splitRatio = initialLayout.controlSplitPercent");
    expect(html).toContain('message.type === "codegenControlsModel"');
    expect(html).toContain("controlDrawer.open = !controlDrawer.open");
    expect(html).toContain('action: "apply"');
    expect(html).toContain('id="batch-overlay"');
    expect(html).toContain('message.type === "codegenBatchState"');
    expect(html).toContain('batchOverlay.hidden = !message.running');
    expect(html).toContain('document.body.setAttribute("aria-busy"');
    expect(html).toContain("position: fixed");
    expect(html).toContain("cursor: progress");
    expect(html).toContain('"kt-codegen-table-dirty-change"');
    expect(html).toContain('"kt-codegen-table-change"');
    expect(html).not.toContain('"kt-codegen-table-collapse-change"');
    expect(html).not.toContain("table.collapsed =");
    expect(html).toContain("setTimeout(exchangeDraft, 600)");
    expect(html).toContain("if (firstDirty) exchangeDraft()");
    expect(html.indexOf("table.markCheckpoint")).toBeLessThan(
      html.indexOf("table.setStatus(message.status"),
    );
    expect(html).not.toContain('id="namePrefix"');
    expect(html).not.toContain('class="properties"');
    expect(html).not.toContain("PrivateWidget");
    expect(html).toContain("Apply 可自动执行");
    expect(html).toContain("没有缓存时会先自动预检");
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();

    const entry = readFileSync(new URL("./tableEntry.ts", import.meta.url), "utf8");
    expect(entry).toContain('@phoenix-wing/kt-codegen/table');
    expect(entry).toContain("ktCodegenDefineTableElement()");
    const controlEntry = readFileSync(new URL("./controlCatalogEntry.ts", import.meta.url), "utf8");
    expect(controlEntry).toContain('@phoenix-wing/kt-codegen/ui');
    expect(controlEntry).toContain('ktCodegenDefineControlPanelElement("ktc-codegen-control-panel")');
    const layoutFixture = readFileSync(
      new URL("../../../test-fixtures/codegen-control-panel-layout.html", import.meta.url),
      "utf8",
    );
    const fixturePanelRule = layoutFixture.match(
      /\.control-drawer\[open\] > ktc-codegen-control-panel \{([^}]*)\}/u,
    )?.[1];
    expect(fixturePanelRule).toBeTruthy();
    expect(fixturePanelRule).not.toContain("overflow");
  });
});
