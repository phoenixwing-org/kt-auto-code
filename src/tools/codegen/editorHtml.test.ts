// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import {
  KT_CODEGEN_BLOCK_PRESENTATIONS,
  KT_CODEGEN_LEGACY_BLOCKS,
  KtCodegenController,
  ktCodegenBlockKeysForPreset,
} from "@phoenix-wing/kt-codegen";
import { getCodegenEditorHtml } from "./editorHtml.js";
import { ktCodegenDefineTableElement } from "@phoenix-wing/kt-codegen/table";
import { ktCodegenDefineControlPanelElement, KtCodegenControlPanel } from "@phoenix-wing/kt-codegen/ui";
import { ktcDefineRightViewShell } from "../../ui/KtcRightViewShell.js";
import type { KtcCodegenEditorOutboundMessage } from "./editorContracts.js";
import type { KtcCodegenControlViewModel } from "./controlViewModel.js";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

function fixtureHtml(): string {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getCodegenEditorHtml>[1];
    return getCodegenEditorHtml({
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
    }, undefined, "/workspace");
}

function mountHtml(html: string) {
  ktcDefineRightViewShell();
  ktCodegenDefineTableElement();
  ktCodegenDefineControlPanelElement("ktc-codegen-control-panel");
  vi.stubGlobal("Option", function Option(text = "", value = "") {
    const option = document.createElement("option"); option.text = text; option.value = value; return option;
  });
  const parsed = new DOMParser().parseFromString(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gu, ""), "text/html");
  document.body.innerHTML = parsed.body.innerHTML;
  const messages: Record<string, unknown>[] = [];
  const listeners: ((event: MessageEvent) => void)[] = [];
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1]!;
  new Function("acquireVsCodeApi", "window", script)(
    () => ({ postMessage: (message: Record<string, unknown>) => messages.push(message) }),
    { innerHeight: 748, addEventListener(type: string, listener: (event: MessageEvent) => void) { if (type === "message") listeners.push(listener); } },
  );
  return {
    messages,
    receive: (data: KtcCodegenEditorOutboundMessage) => listeners.forEach((listener) => listener({ data } as MessageEvent)),
    button: (id: string) => document.getElementById(id) as HTMLButtonElement,
    panel: document.getElementById("control-panel") as HTMLElement & { collapsed: boolean; model: KtcCodegenControlViewModel },
  };
}

describe("codegen editor HTML", () => {
  it("生成一 JSON 一 View 的17列表格原型并保持脚本可解析", () => {
    const html = fixtureHtml();
    expect(html).toContain('<ktc-right-view-shell id="codegen-right-shell">');
    expect(html).toContain("test-webview:/extension/dist/ktc-right-view-shell.js");
    expect(html).toContain('title: "自动代码"');
    expect(html).toContain('contextPath: "/workspace/example.json"');
    expect(html).toContain('contextLabel: model.fileName + " @ " + "workspace"');
    expect(html).toContain('scrollMode: "none"');
    expect(html).not.toContain("Codegen JSON 编辑 View");
    expect(html).not.toContain('id="file-name"');
    expect(html).toContain('class="document-actions" slot="actions"');
    expect(html.indexOf('slot="actions"')).toBeLessThan(html.indexOf('<main class="codegen-main">'));
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
    expect(html).toContain(">重新加载</button>");
    expect(html).toContain('action: "preflight"');
    expect(html).toContain('action: "cancelPreflight"');
    expect(html).toContain('message.type === "codegenPreflightState"');
    expect(html).toContain('model.externalConflict');
    expect(html).toContain('.document-state.conflict');
    expect(html).toContain('id="document-state" role="status" aria-live="polite"');
    expect(html).toContain('preflight.setAttribute("aria-pressed"');
    expect(html).toContain('table.setAttribute("aria-busy"');
    expect(html).not.toContain("view-toolbar");
    expect(html).not.toContain("document-title");
    const actionsRule = html.match(/\.document-actions \{([^}]*)\}/u)?.[1];
    expect(actionsRule).toContain("width: max-content");
    expect(actionsRule).toContain("white-space: nowrap");
    expect(actionsRule).not.toMatch(/border|sticky|background|wrap: wrap/u);
    expect(html).toContain('body.vscode-high-contrast kt-codegen-table');
    expect(html).toContain('body.vscode-high-contrast-light kt-codegen-table');
    expect(html).toContain('--vscode-contrastBorder');
    expect(html).toContain('--ktc-ui-border: var(--vscode-contrastBorder, var(--vscode-focusBorder));');
    expect(html).toContain('--ktc-ui-active-border: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder));');
    expect(html).toContain('button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border');
    expect(html).toContain('<ktc-codegen-control-panel id="control-panel" collapsible>');
    expect(html).not.toContain("height: min(44vh, 460px)");
    expect(html).toContain("overflow-y: auto");
    expect(html.match(/overflow-y: auto/g)).toHaveLength(1);
    expect(html).toContain("scrollbar-gutter: stable");
    expect(html).toContain(".codegen-main::-webkit-scrollbar-thumb");
    expect(html).toContain("rgba(121, 121, 121, .7)");
    expect(html).toContain("kt-codegen-table { flex: 0 0 auto; min-height: 0; }");
    expect(html).not.toContain("kt-codegen-table { flex: 1 1 auto");
    expect(html).not.toContain("min-height: 230px");
    expect(html).not.toContain('@media (max-width: 760px)');
    expect(html).not.toContain("height: 540px; min-height: 540px");
    expect(html).not.toContain("inset: 34px 0 0");
    expect(html).toContain("position: static");
    const controlPanelRule = html.match(
      /#control-panel \{([^}]*)\}/u,
    )?.[1];
    expect(controlPanelRule).toBeTruthy();
    expect(controlPanelRule).not.toContain("overflow");
    expect(html).not.toContain('.view-toolbar button.secondary-action { display: none; }');
    expect(html).not.toContain("control-drawer");
    expect(html).not.toContain("control-summary");
    expect(html).toContain('<button id="controls" type="button" aria-expanded="false" aria-controls="control-panel">预检结果</button>');
    expect(html).not.toContain("控制符与预检");
    expect(html).not.toContain("控制符 / 结果");
    expect(html).not.toContain('type: "codegenControlSelection"');
    expect(html).not.toContain('type: "codegenControlDisplay"');
    expect(html).not.toContain('type: "codegenControlOutput"');
    expect(html).toContain('type: "codegenControlOpen"');
    expect(html).toContain('type: "codegenControlCopyEnd"');
    expect(html).toContain('blockKey: event.detail.blockKey');
    expect(html).toContain('new ResizeObserver(syncDetailStickyTop)');
    expect(html).toContain('detailResizeObserver.observe(codegenMain)');
    expect(html).toContain('"--pnw-codegen-detail-sticky-top"');
    expect(html).toContain('"--pnw-codegen-detail-height"');
    expect(html).toContain('window.addEventListener("resize", syncDetailStickyTop)');
    expect(html).toContain('type: "codegenEditorLayout"');
    expect(html).toContain('"kt-codegen-control-split-change"');
    expect(html).toContain("controlPanel.splitRatio = initialLayout.controlSplitPercent");
    expect(html).toContain('message.type === "codegenControlsModel"');
    expect(html).toContain("controls.onclick = () => setControlsExpanded(controlPanel.collapsed)");
    expect(html).toContain('"kt-codegen-control-collapse-change"');
    expect(html).not.toContain("controlsExpanded");
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
    expect(html).toContain('id="apply" type="button" title="没有缓存时会先自动预检；写入前重验源码指纹">应用</button>');
    expect(html).toContain("没有缓存时会先自动预检");
    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();

    // The detail is sized to its actual scrollport, excluding the Right shell header.
    const syncDetailBody = script!.match(/function syncDetailStickyTop\(\) \{([\s\S]*?)\n    \}/u)?.[1];
    expect(syncDetailBody).toBeTruthy();
    const syncDetail = new Function("codegenMain", "window", "document", syncDetailBody!);
    const properties: Record<string, string> = {};
    const styleDocument = { body: { style: { setProperty(key: string, value: string) { properties[key] = value; } } } };
    const mainViewport = { clientHeight: 704 };
    syncDetail(mainViewport, { innerHeight: 748 }, styleDocument);
    expect(properties["--pnw-codegen-detail-sticky-top"]).toBe("8px");
    expect(properties["--pnw-codegen-detail-height"]).toBe("688px");
    mainViewport.clientHeight = 480;
    syncDetail(mainViewport, { innerHeight: 748 }, styleDocument);
    expect(properties["--pnw-codegen-detail-sticky-top"]).toBe("8px");
    expect(properties["--pnw-codegen-detail-height"]).toBe("464px");
    mainViewport.clientHeight = 200;
    syncDetail(mainViewport, { innerHeight: 748 }, styleDocument);
    expect(properties["--pnw-codegen-detail-height"]).toBe("240px");
    mainViewport.clientHeight = 0;
    syncDetail(mainViewport, { innerHeight: 748 }, styleDocument);
    expect(properties["--pnw-codegen-detail-height"]).toBe("240px");
    syncDetail(null, { innerHeight: 748 }, styleDocument);
    expect(properties["--pnw-codegen-detail-height"]).toBe("732px");

    // Run the shipped program against the real Shell and Wing components: moving
    // controls into the Header must preserve their messages and accessible states.
    const { messages, receive, button } = mountHtml(html);
    const shell = document.querySelector("ktc-right-view-shell")!;
    const context = shell.shadowRoot!.querySelector<HTMLElement>(".context")!;
    expect(shell.shadowRoot!.querySelector(".title")!.textContent).toBe("自动代码");
    expect(context.textContent).toBe("example.json @ workspace");
    expect(context.title).toBe("/workspace/example.json");
    expect(document.querySelector(".codegen-main header")).toBeNull();
    const actionIds = Array.from(document.querySelectorAll('[slot="actions"] button'), (button) => button.id);
    expect(actionIds).toEqual(["preflight", "controls", "apply", "reload", "save"]);
    const documentState = document.getElementById("document-state")!;
    expect(documentState.hidden).toBe(true);
    button("preflight").click();
    expect(messages.at(-1)).toMatchObject({ type: "codegenEditorAction", action: "preflight", uri: "file:///workspace/example.json" });
    receive({ type: "codegenPreflightState", running: true });
    expect(button("controls").getAttribute("aria-expanded")).toBe("true");
    expect(button("preflight").textContent).toBe("取消预检");
    button("preflight").click();
    expect(messages.at(-1)).toMatchObject({ action: "cancelPreflight" });
    button("controls").click();
    expect(button("controls").getAttribute("aria-expanded")).toBe("false");
    button("apply").click();
    expect(messages.at(-1)).toMatchObject({ action: "apply" });
    button("reload").click();
    expect(messages.at(-1)).toMatchObject({ action: "reload" });
    button("save").click();
    expect(messages.at(-1)).toMatchObject({ type: "codegenEditorExchange", action: "save" });
    receive({ type: "codegenDocumentState", dirty: true, externalConflict: false, externalState: "current" });
    expect(documentState.hidden).toBe(false);
    expect(documentState.textContent).toBe("未保存");
    expect(button("save").textContent).toBe("保存 JSON *");
    receive({ type: "codegenDocumentState", dirty: true, externalConflict: true, externalState: "changed" });
    expect(documentState.textContent).toBe("外部变更");
    expect(documentState.getAttribute("aria-label")).toContain("请重新加载或保存时处理");
    receive({ type: "codegenDocumentState", dirty: true, externalConflict: false, externalState: "deleted" });
    expect(documentState.textContent).toBe("已删除");
    expect(documentState.title).toContain("当前内容仍保留");
    receive({ type: "codegenStatus", status: "saving", message: "正在保存" });
    expect(button("save").disabled).toBe(true);

    const entry = readFileSync(new NodeURL("./tableEntry.ts", import.meta.url), "utf8");
    expect(entry).toContain('@phoenix-wing/kt-codegen/table');
    expect(entry).toContain("ktCodegenDefineTableElement()");
    const controlEntry = readFileSync(new NodeURL("./controlCatalogEntry.ts", import.meta.url), "utf8");
    expect(controlEntry).toContain('@phoenix-wing/kt-codegen/ui');
    expect(controlEntry).toContain('ktCodegenDefineControlPanelElement("ktc-codegen-control-panel")');
    const layoutFixture = readFileSync(
      new NodeURL("../../../tests/webview/codegen-control-panel-layout.html", import.meta.url),
      "utf8",
    );
    const fixturePanelRule = layoutFixture.match(
      /#control-panel \{([^}]*)\}/u,
    )?.[1];
    expect(fixturePanelRule).toBeTruthy();
    expect(fixturePanelRule).not.toContain("overflow");
    expect(layoutFixture).not.toContain("control-drawer");
    expect(layoutFixture).toContain('id="control-panel" collapsible');
  });

  // Old Registry comparison may skip the unavailable capability. The controlled
  // local Wing gate must execute and fail if it accidentally resolves old dist.
  it.skipIf(!("collapsible" in KtCodegenControlPanel.prototype) && process.env.PHOENIX_WING_DEV_MODE !== "1")(
    "本地 Wing 单 Header 折叠：toolbar/组件双向同步，首次预检展开，刷新保留收起",
    () => {
      expect("collapsible" in KtCodegenControlPanel.prototype).toBe(true);
      const { panel, receive, button } = mountHtml(fixtureHtml());
      const collapseButton = () => panel.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
      expect(panel.collapsed).toBe(true);
      expect(collapseButton().getAttribute("aria-expanded")).toBe("false");
      receive({ type: "codegenPreflightState", running: true });
      expect(panel.collapsed).toBe(false);
      expect(button("controls").getAttribute("aria-expanded")).toBe("true");
      button("controls").click();
      expect(panel.collapsed).toBe(true);
      expect(collapseButton().getAttribute("aria-expanded")).toBe("false");
      collapseButton().click();
      expect(panel.collapsed).toBe(false);
      expect(button("controls").getAttribute("aria-expanded")).toBe("true");
      collapseButton().click();
      expect(button("controls").getAttribute("aria-expanded")).toBe("false");
      const resultModel: KtcCodegenControlViewModel = {
        ...panel.model,
        preflight: {
          plan: new KtCodegenController().analyze({ targets: ["cpp.parameter"], blockKeys: [], snapshot: { files: [] } }),
          reused: false, createdAt: "2026-09-10T00:00:00Z", state: "ready", message: "测试预检已完成",
        },
      };
      receive({ type: "codegenControlsModel", model: resultModel });
      expect(panel.collapsed).toBe(false);
      expect(button("controls").getAttribute("aria-expanded")).toBe("true");
      collapseButton().click();
      receive({ type: "codegenControlsModel", model: resultModel });
      expect(panel.collapsed).toBe(true);
      expect(Array.from(panel.shadowRoot!.querySelectorAll("button"), (entry) => entry.textContent)
        .filter((text) => /^(命中|问题|全部) \d/u.test(text ?? ""))).toHaveLength(3);
      expect(panel.shadowRoot!.querySelector('input[aria-label="显示左侧源码路径"]')).not.toBeNull();
    },
  );
});
