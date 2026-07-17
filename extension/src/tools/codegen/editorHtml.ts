import type * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import type { KtcCodegenEditorModel } from "../types.js";

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/** 当前编辑区 JSON View：组合文档工具栏、Wing Table 与可收缩控制符/预检 Block。 */
export function getCodegenEditorHtml(
  webview: Pick<vscode.Webview, "cspSource" | "asWebviewUri">,
  extensionUri: vscode.Uri,
  initialModel: KtcCodegenEditorModel,
): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  const basePath = extensionUri.path.replace(/\/$/, "");
  const componentUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/codegen-table.js` }),
  );
  const model = safeJson(initialModel);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; }
    body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      overflow: hidden;
      padding: 8px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font: 13px/1.35 var(--vscode-font-family);
    }
    button {
      min-height: 27px;
      padding: 3px 10px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 3px;
      font: inherit;
      cursor: pointer;
    }
    button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button:focus-visible, summary:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .view-toolbar {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 6px;
      min-height: 42px;
      padding: 6px 8px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-sideBar-background);
    }
    .document-title { flex: 1 1 180px; min-width: 120px; margin-right: auto; }
    .document-title strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .document-title span { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .document-title span.dirty { color: var(--vscode-editorWarning-foreground); }
    .document-title span.conflict { color: var(--vscode-errorForeground); }
    .separator { width: 1px; height: 22px; margin: 0 2px; background: var(--vscode-panel-border); }
    kt-codegen-table { flex: 1 1 auto; min-height: 120px; }
    .control-drawer {
      flex: 0 0 auto;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-editor-background);
    }
    .control-drawer[open] {
      display: flex;
      height: min(44vh, 460px);
      min-height: min(230px, 44vh);
      flex-direction: column;
    }
    .control-drawer > summary {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 6px 10px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      cursor: pointer;
      user-select: none;
    }
    .control-drawer > summary::-webkit-details-marker { display: none; }
    .control-drawer > summary::before { content: "›"; font-size: 18px; line-height: 1; }
    .control-drawer[open] > summary::before { transform: rotate(90deg); }
    .control-summary-title { color: var(--vscode-foreground); font-weight: 650; }
    .control-summary-meta { margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .control-toolbar {
      display: flex;
      flex: 0 0 auto;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-top: 1px solid var(--vscode-panel-border);
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    }
    .control-toolbar .spacer { flex: 1 1 auto; }
    .control-grid {
      display: grid;
      flex: 1 1 auto;
      grid-template-columns: minmax(280px, 42%) minmax(360px, 58%);
      min-height: 0;
      overflow: hidden;
    }
    .control-section {
      display: flex;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      flex-direction: column;
    }
    .control-catalog { border-right: 1px solid var(--vscode-panel-border); }
    .control-scroll-region {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      overflow-x: auto;
      overflow-y: scroll;
      overscroll-behavior: contain;
      scrollbar-gutter: stable both-edges;
    }
    .control-scroll-region:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    .control-results-content { min-width: 520px; }
    .section-title {
      position: sticky;
      z-index: 3;
      top: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 31px;
      padding: 5px 9px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
      border-bottom: 1px solid var(--vscode-panel-border);
      font-size: 11px;
      font-weight: 650;
    }
    .block-row {
      display: grid;
      grid-template-columns: 22px 30px minmax(0, 1fr) auto;
      align-items: center;
      gap: 5px;
      min-width: 520px;
      min-height: 38px;
      padding: 3px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .block-row:hover, .hit:hover, .diagnostic:hover { background: var(--vscode-list-hoverBackground); }
    .block-id { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
    .block-copy { display: grid; min-width: 0; }
    .block-name, .block-key { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .block-name { font-weight: 600; }
    .block-key { color: var(--vscode-descriptionForeground); font: 10px/1.3 var(--vscode-editor-font-family); }
    .tags { display: flex; gap: 4px; }
    .tag { padding: 1px 5px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .tag.deprecated { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); }
    .preflight-summary { padding: 8px 9px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
    .hit {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 3px 8px;
      padding: 7px 9px;
      border-bottom: 1px solid var(--vscode-panel-border);
      cursor: pointer;
    }
    .hit:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .hit strong, .hit span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hit span { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .diagnostic {
      display: block;
      width: calc(100% - 16px);
      height: auto;
      margin: 6px 8px;
      padding: 7px 9px;
      color: var(--vscode-foreground);
      background: var(--vscode-textBlockQuote-background);
      border: 0;
      border-left: 3px solid var(--vscode-editorWarning-foreground);
      border-radius: 2px;
      text-align: left;
      cursor: default;
    }
    .diagnostic.located { cursor: pointer; }
    .diagnostic.error { border-left-color: var(--vscode-errorForeground); }
    .diagnostic-code { display: block; margin-bottom: 2px; font-weight: 650; }
    .diagnostic-location { display: block; margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .preview { margin: 8px; padding: 9px; overflow: auto; color: var(--vscode-editor-foreground); background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 5px; font: 12px/1.45 var(--vscode-editor-font-family); white-space: pre; }
    .empty { padding: 22px 12px; color: var(--vscode-descriptionForeground); text-align: center; }
    body.vscode-high-contrast kt-codegen-table,
    body.vscode-high-contrast-light kt-codegen-table {
      --pnw-kt-codegen-border: var(--vscode-contrastBorder, var(--vscode-panel-border));
      --pnw-kt-codegen-focus: var(--vscode-focusBorder);
    }
    body.vscode-high-contrast .view-toolbar,
    body.vscode-high-contrast .control-drawer,
    body.vscode-high-contrast-light .view-toolbar,
    body.vscode-high-contrast-light .control-drawer {
      border-color: var(--vscode-contrastBorder, var(--vscode-panel-border));
    }
    body.vscode-high-contrast button:focus-visible,
    body.vscode-high-contrast summary:focus-visible,
    body.vscode-high-contrast-light button:focus-visible,
    body.vscode-high-contrast-light summary:focus-visible {
      outline-width: 2px;
    }
    @media (max-width: 800px) {
      .view-toolbar { align-items: stretch; flex-wrap: wrap; }
      .document-title { flex: 1 0 100%; }
      .view-toolbar button { flex: 1 1 auto; }
      .separator { display: none; }
      .control-drawer[open] { height: min(58vh, 520px); min-height: min(260px, 58vh); }
      .control-grid {
        grid-template-columns: 1fr;
        grid-template-rows: repeat(2, minmax(0, 1fr));
        overflow: hidden;
      }
      .control-section { overflow: hidden; }
      .control-catalog { border-right: 0; border-bottom: 1px solid var(--vscode-panel-border); }
    }
  </style>
</head>
<body>
  <header class="view-toolbar" aria-label="Codegen 文档操作">
    <div class="document-title">
      <strong id="file-name"></strong>
      <span id="document-state" role="status" aria-live="polite" aria-atomic="true">Codegen JSON 编辑 View</span>
    </div>
    <button id="preflight" type="button" aria-label="运行 Codegen 预检" aria-pressed="false">预检</button>
    <button id="controls" type="button" aria-expanded="false">控制符 / 结果</button>
    <button id="apply" type="button" title="没有缓存时会先自动预检；写入前重验源码指纹">Apply</button>
    <span class="separator" aria-hidden="true"></span>
    <button id="revert" type="button" disabled>↶ 还原</button>
    <button class="primary" id="save" type="button">保存 JSON</button>
  </header>
  <kt-codegen-table id="codegen-table"></kt-codegen-table>
  <details class="control-drawer" id="control-drawer">
    <summary>
      <span class="control-summary-title">控制符与预检</span>
      <span class="control-summary-meta" id="control-summary">尚未预检</span>
    </summary>
    <div class="control-toolbar" aria-label="控制符选择预设">
      <button id="control-all" type="button">全选</button>
      <button id="control-none" type="button">全不选</button>
      <button id="control-cpp" type="button">C++ only</button>
      <button id="control-field" type="button">Field Code</button>
      <span class="spacer"></span>
      <button id="control-single" type="button" aria-pressed="false">单选</button>
    </div>
    <div class="control-grid">
      <section class="control-section control-catalog" aria-label="控制符目录">
        <div class="section-title"><span>控制符目录</span><span id="control-selected-count"></span></div>
        <div id="control-blocks" class="control-scroll-region" tabindex="0" aria-label="可滚动的控制符目录列表"></div>
      </section>
      <section class="control-section" aria-label="预检命中、诊断与 Artifact 预览">
        <div class="section-title"><span>预检命中与问题</span><span id="control-cache-state"></span></div>
        <div class="control-scroll-region" tabindex="0" aria-label="可滚动的预检结果列表">
          <div class="control-results-content">
            <div id="control-preflight-summary" class="preflight-summary" role="status" aria-live="polite"></div>
            <div id="control-regions"></div>
            <div id="control-diagnostics"></div>
            <pre id="control-preview" class="preview" hidden></pre>
          </div>
        </div>
      </section>
    </div>
  </details>
  <script nonce="${nonce}" src="${componentUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const table = document.getElementById("codegen-table");
    const fileName = document.getElementById("file-name");
    const documentState = document.getElementById("document-state");
    const save = document.getElementById("save");
    const revert = document.getElementById("revert");
    const preflight = document.getElementById("preflight");
    const controls = document.getElementById("controls");
    const controlDrawer = document.getElementById("control-drawer");
    let model = ${model};
    let controlsModel = model.controls;
    let selected = new Set(controlsModel.selectedBlockKeys || []);
    let singleMode = !!controlsModel.singleSelectionMode;
    let dirtyNotified = !!model.dirty;
    let draftSyncTimer;

    function post(message) {
      vscode.postMessage(Object.assign({ toolId: "codegen", uri: model.uri }, message));
    }

    function syncHeader() {
      fileName.textContent = model.fileName;
      save.textContent = model.dirty ? "保存 JSON *" : "保存 JSON";
      documentState.textContent = model.externalConflict
        ? "外部文件已变更 · 请重新加载或保存时处理"
        : model.dirty ? "Codegen JSON 编辑 View · 未保存" : "Codegen JSON 编辑 View";
      documentState.className = model.externalConflict ? "conflict" : model.dirty ? "dirty" : "";
      revert.textContent = model.externalConflict && !model.dirty ? "↻ 重新加载" : "↶ 还原";
      revert.disabled = !model.dirty && !model.externalConflict;
    }

    function markDirty(itemCount) {
      const firstDirty = !model.dirty;
      model.dirty = true;
      syncHeader();
      if (firstDirty && !dirtyNotified) {
        dirtyNotified = true;
        post({ type: "codegenEditorDirty", itemCount });
      }
      return firstDirty;
    }

    function currentExchangeModel() {
      return {
        uri: model.uri,
        fileName: model.fileName,
        table: table.getData(),
        controls: controlsModel,
        dirty: true,
        externalConflict: !!model.externalConflict,
      };
    }

    function exchangeDraft() {
      clearTimeout(draftSyncTimer);
      if (!model.dirty) return;
      post({ type: "codegenEditorExchange", action: "sync", model: currentExchangeModel() });
    }

    function updateSelectedCount() {
      document.getElementById("control-selected-count").textContent = selected.size + " / " + controlsModel.blocks.length;
    }

    function sendSelection(selectionChanged) {
      if (selectionChanged && controlsModel.preflight) {
        controlsModel.preflight = undefined;
        renderPreflight();
      }
      post({ type: "codegenControlSelection", blockKeys: [...selected], singleMode });
      updateSelectedCount();
    }

    function renderBlocks() {
      const root = document.getElementById("control-blocks");
      const fragment = document.createDocumentFragment();
      for (const block of controlsModel.blocks) {
        const label = document.createElement("label");
        label.className = "block-row";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = selected.has(block.key);
        check.onchange = () => {
          if (check.checked && singleMode) selected.clear();
          if (check.checked) selected.add(block.key); else selected.delete(block.key);
          if (singleMode) renderBlocks();
          sendSelection(true);
        };
        const id = document.createElement("span");
        id.className = "block-id";
        id.textContent = String(block.legacyId);
        const copy = document.createElement("span");
        copy.className = "block-copy";
        const name = document.createElement("span");
        name.className = "block-name";
        name.textContent = block.title;
        const key = document.createElement("span");
        key.className = "block-key";
        key.textContent = block.controlWords;
        copy.title = block.notes;
        copy.append(name, key);
        const tags = document.createElement("span");
        tags.className = "tags";
        const platform = document.createElement("span");
        platform.className = "tag";
        platform.textContent = block.platform;
        tags.append(platform);
        if (block.legacyState === "legacy-deprecated") {
          const deprecated = document.createElement("span");
          deprecated.className = "tag deprecated";
          deprecated.textContent = "deprecated";
          tags.append(deprecated);
        }
        label.append(check, id, copy, tags);
        fragment.append(label);
      }
      root.replaceChildren(fragment);
      updateSelectedCount();
    }

    function applyPreset(keys) {
      const next = new Set(keys);
      const selectionChanged = next.size !== selected.size || [...next].some((key) => !selected.has(key));
      singleMode = false;
      document.getElementById("control-single").setAttribute("aria-pressed", "false");
      selected.clear();
      for (const key of keys) selected.add(key);
      renderBlocks();
      sendSelection(selectionChanged);
    }

    function renderPreflight() {
      const summary = document.getElementById("control-preflight-summary");
      const regions = document.getElementById("control-regions");
      const diagnostics = document.getElementById("control-diagnostics");
      const preview = document.getElementById("control-preview");
      const headerSummary = document.getElementById("control-summary");
      preview.hidden = true;
      if (!controlsModel.preflight) {
        document.getElementById("control-cache-state").textContent = "";
        headerSummary.textContent = "尚未预检 · Apply 可自动执行";
        summary.textContent = "尚未预检。可点击页面上方“预检”，或直接点击 Apply 自动预检并写入源码。";
        regions.replaceChildren();
        diagnostics.replaceChildren();
        return;
      }
      const plan = controlsModel.preflight.plan;
      const issueCount = plan.diagnostics.filter((item) => item.severity === "error" || item.severity === "warning").length;
      document.getElementById("control-cache-state").textContent = controlsModel.preflight.reused ? "缓存" : "新计划";
      headerSummary.textContent = plan.markerRegions.length + " 命中 · " + issueCount + " 问题";
      summary.textContent = plan.markerRegions.length + " 个区域 · " + plan.artifacts.length
        + " 个产物 · " + plan.diagnostics.length + " 条诊断";
      const artifactByRegion = new Map(plan.artifacts.map((artifact) => [artifact.regionId, artifact]));
      const regionFragment = document.createDocumentFragment();
      for (const region of plan.markerRegions) {
        const row = document.createElement("div");
        row.className = "hit";
        row.tabIndex = 0;
        row.setAttribute("role", "button");
        const title = document.createElement("strong");
        title.textContent = region.blockKey;
        const line = document.createElement("span");
        line.textContent = region.path + ":" + (region.start.line + 1) + " · " + region.classId;
        const open = document.createElement("button");
        open.type = "button";
        open.textContent = "打开";
        open.onclick = (event) => {
          event.stopPropagation();
          post({ type: "codegenControlOpen", path: region.path, line: region.start.line });
        };
        const showPreview = () => {
          const artifact = artifactByRegion.get(region.id);
          preview.textContent = artifact ? artifact.content : "该区域没有生成 Artifact。";
          preview.hidden = false;
        };
        row.setAttribute("aria-label", "预览 " + region.blockKey + "，" + line.textContent);
        row.onclick = showPreview;
        row.onkeydown = (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          showPreview();
        };
        row.append(title, open, line);
        regionFragment.append(row);
      }
      if (!plan.markerRegions.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "当前配置与所选控制符没有命中源码区域。";
        regionFragment.append(empty);
      }
      regions.replaceChildren(regionFragment);

      const diagnosticFragment = document.createDocumentFragment();
      for (const item of plan.diagnostics) {
        const located = item.path && item.path.file && Number.isInteger(item.path.row);
        const row = document.createElement(located ? "button" : "div");
        if (located) row.type = "button";
        row.className = "diagnostic " + item.severity + (located ? " located" : "");
        const code = document.createElement("span");
        code.className = "diagnostic-code";
        code.textContent = item.severity.toUpperCase() + " · " + item.code;
        const message = document.createElement("span");
        message.textContent = item.message;
        row.append(code, message);
        if (located) {
          const location = document.createElement("span");
          location.className = "diagnostic-location";
          location.textContent = item.path.file + ":" + (item.path.row + 1);
          row.append(location);
          row.title = "打开并定位到问题行";
          row.onclick = () => post({
            type: "codegenControlOpen",
            path: item.path.file,
            line: item.path.row,
          });
        }
        diagnosticFragment.append(row);
      }
      diagnostics.replaceChildren(diagnosticFragment);
    }

    function setControlsModel(next) {
      const gainedPreflight = !controlsModel.preflight && !!next.preflight;
      controlsModel = next;
      model.controls = next;
      selected = new Set(controlsModel.selectedBlockKeys || []);
      singleMode = !!controlsModel.singleSelectionMode;
      document.getElementById("control-single").setAttribute("aria-pressed", String(singleMode));
      renderBlocks();
      renderPreflight();
      if (gainedPreflight) controlDrawer.open = true;
    }

    table.setData(model.table);
    syncHeader();
    renderBlocks();
    renderPreflight();

    table.addEventListener("kt-codegen-table-dirty-change", (event) => {
      if (event.detail && event.detail.dirty && markDirty(event.detail.itemCount)) exchangeDraft();
    });
    table.addEventListener("kt-codegen-table-change", (event) => {
      const firstDirty = markDirty(event.detail ? event.detail.itemCount : table.getData().items.length);
      clearTimeout(draftSyncTimer);
      if (firstDirty) exchangeDraft();
      else draftSyncTimer = setTimeout(exchangeDraft, 600);
    });
    save.onclick = () => post({ type: "codegenEditorExchange", action: "save", model: currentExchangeModel() });
    revert.onclick = () => post({ type: "codegenEditorAction", action: "revert" });
    preflight.onclick = () => {
      if (preflight.dataset.running === "true") {
        post({ type: "codegenEditorAction", action: "cancelPreflight" });
      } else {
        post({ type: "codegenEditorAction", action: "preflight", table: table.getData() });
      }
    };
    controls.onclick = () => { controlDrawer.open = !controlDrawer.open; };
    controlDrawer.ontoggle = () => controls.setAttribute("aria-expanded", String(controlDrawer.open));
    document.getElementById("apply").onclick = () => post({
      type: "codegenEditorAction", action: "apply", table: table.getData(),
    });
    document.getElementById("control-all").onclick = () => applyPreset(controlsModel.presets.all);
    document.getElementById("control-none").onclick = () => applyPreset(controlsModel.presets.none);
    document.getElementById("control-cpp").onclick = () => applyPreset(controlsModel.presets.cppOnly);
    document.getElementById("control-field").onclick = () => applyPreset(controlsModel.presets.fieldCode);
    document.getElementById("control-single").onclick = (event) => {
      singleMode = !singleMode;
      event.currentTarget.setAttribute("aria-pressed", String(singleMode));
      if (singleMode && selected.size > 1) {
        const first = selected.values().next().value;
        selected.clear();
        if (first) selected.add(first);
        renderBlocks();
        sendSelection(true);
      } else {
        sendSelection(false);
      }
    };

    document.addEventListener("visibilitychange", () => { if (document.hidden) exchangeDraft(); });
    window.addEventListener("beforeunload", exchangeDraft);
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "codegenModel") {
        model = message.model;
        dirtyNotified = !!model.dirty;
        table.setData(model.table);
        setControlsModel(model.controls);
        syncHeader();
      } else if (message.type === "codegenControlsModel") {
        setControlsModel(message.model);
      } else if (message.type === "codegenDocumentState") {
        model.dirty = !!message.dirty;
        model.externalConflict = !!message.externalConflict;
        if (model.dirty) dirtyNotified = true;
        syncHeader();
      } else if (message.type === "codegenPreflightState") {
        preflight.dataset.running = String(!!message.running);
        preflight.textContent = message.running ? "取消预检" : "预检";
        preflight.setAttribute("aria-pressed", String(!!message.running));
        preflight.setAttribute("aria-label", message.running ? "取消 Codegen 预检" : "运行 Codegen 预检");
        if (message.running) controlDrawer.open = true;
      } else if (message.type === "codegenStatus") {
        if (message.status === "saved") {
          clearTimeout(draftSyncTimer);
          model.dirty = false;
          model.externalConflict = false;
          dirtyNotified = false;
          table.markCheckpoint(message.documentRevision ?? table.getData().documentRevision);
          model.table = table.getData();
          syncHeader();
        }
        table.setStatus(message.status, message.message || "");
        table.setAttribute("aria-busy", String(message.status === "saving"));
        save.disabled = message.status === "saving";
      }
    });
    post({ type: "codegenEditorAction", action: "ready" });
  </script>
</body>
</html>`;
}
