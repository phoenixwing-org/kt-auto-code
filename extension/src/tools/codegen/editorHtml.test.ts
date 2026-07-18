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
    expect(html).toContain('grid-template-rows: repeat(2, minmax(0, 1fr));');
    expect(html).toContain('<ktc-codegen-control-catalog id="control-catalog" mode="full">');
    expect(html).toContain("height: min(44vh, 460px)");
    expect(html).toContain("overflow-y: scroll");
    expect(html).toContain("scrollbar-gutter: stable both-edges");
    expect(html).toContain('aria-label="可滚动的预检结果列表"');
    expect(html).toContain('.control-results-content { min-width: 520px; }');
    expect(html).not.toContain('.view-toolbar button.secondary-action { display: none; }');
    expect(html).toContain('id="control-drawer"');
    expect(html).toContain("控制符与预检");
    expect(html).toContain('type: "codegenControlSelection"');
    expect(html).toContain('type: "codegenControlDisplay"');
    expect(html).toContain('type: "codegenControlOutput"');
    expect(html).toContain('type: "codegenControlOpen"');
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
    expect(html).toContain("自动预检并写入源码");
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();

    const entry = readFileSync(new URL("./tableEntry.ts", import.meta.url), "utf8");
    expect(entry).toContain('@phoenix-wing/kt-codegen/table');
    expect(entry).toContain("ktCodegenDefineTableElement()");
    const controlEntry = readFileSync(new URL("./controlCatalogEntry.ts", import.meta.url), "utf8");
    expect(controlEntry).toContain("ktcDefineCodegenControlCatalog()");
  });
});
