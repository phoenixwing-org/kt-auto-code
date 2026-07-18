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
        kind: "kt.codegen.control-view-model",
        schemaVersion: 1,
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
    });
    expect(html).toContain("Codegen JSON 编辑 View");
    expect(html).toContain("<kt-codegen-table");
    expect(html).toContain("test-webview:/extension/dist/codegen-table.js");
    expect(html).toContain("test-webview:/extension/dist/codegen-control-catalog.js");
    expect(html).toContain('type: "codegenEditorDirty"');
    expect(html).toContain('type: "codegenEditorExchange"');
    expect(html).toContain('action: "save"');
    expect(html).toContain('action: "sync"');
    expect(html).not.toContain('type: "codegenEditorCell"');
    expect(html).toContain('action: "revert"');
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
    expect(html).toContain('body.vscode-high-contrast kt-codegen-table');
    expect(html).toContain('body.vscode-high-contrast-light kt-codegen-table');
    expect(html).toContain('--vscode-contrastBorder');
    expect(html).toContain('@media (max-width: 800px)');
    expect(html).toContain('<ktc-codegen-control-panel id="control-panel" mode="full">');
    expect(html).not.toContain("height: min(44vh, 460px)");
    expect(html).toContain("overflow-y: auto");
    expect(html).toContain("scrollbar-gutter: stable");
    expect(html).toContain("body::-webkit-scrollbar-thumb");
    expect(html).toContain("rgba(121, 121, 121, .7)");
    expect(html).toContain("min-height: 120px");
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
    expect(html).not.toContain('.view-toolbar button.secondary-action { display: none; }');
    expect(html).toContain('id="control-drawer"');
    expect(html).toContain("控制符与预检");
    expect(html).toContain('type: "codegenControlSelection"');
    expect(html).toContain('type: "codegenControlDisplay"');
    expect(html).toContain('type: "codegenControlOutput"');
    expect(html).toContain('blockKeys: event.detail.blockKeys');
    expect(html).toMatch(/ktc-codegen-control-output[\s\S]*exchangeDraft\(\);[\s\S]*type: "codegenControlOutput"/);
    expect(html).toContain('type: "codegenControlOpen"');
    expect(html).toContain('type: "codegenEditorLayout"');
    expect(html).toContain('"ktc-codegen-control-split-change"');
    expect(html).toContain("controlPanel.splitRatio = editorLayout.controlSplitPercent");
    expect(html).toContain('message.type === "codegenControlsModel"');
    expect(html).toContain("controlDrawer.open = !controlDrawer.open");
    expect(html).toContain('action: "apply"');
    expect(html).toContain('"kt-codegen-table-dirty-change"');
    expect(html).toContain('"kt-codegen-table-change"');
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
    expect(controlEntry).toContain("ktcDefineCodegenControlCatalog()");
    expect(controlEntry).toContain("ktcDefineCodegenControlPanel()");
    const controlPanelSource = readFileSync(new URL("./controlPanel.ts", import.meta.url), "utf8");
    expect(controlPanelSource).toContain(
      ':host([mode="full"]) { block-size: auto; min-block-size: 0; overflow-x: auto; overflow-y: hidden; }',
    );
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
