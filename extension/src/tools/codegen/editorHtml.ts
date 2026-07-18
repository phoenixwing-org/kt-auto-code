import type * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import type { KtcCodegenEditorModel } from "./editorContracts.js";
import {
  KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
  ktcNormalizeCodegenEditorLayout,
  type KtcCodegenEditorLayoutState,
} from "./editorLayoutState.js";

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
  initialLayout: KtcCodegenEditorLayoutState = KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  const basePath = extensionUri.path.replace(/\/$/, "");
  const tableComponentUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/codegen-table.js` }),
  );
  const controlCatalogUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/codegen-control-catalog.js` }),
  );
  const model = safeJson(initialModel);
  const layout = safeJson(ktcNormalizeCodegenEditorLayout(initialLayout));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    html { width: 100%; height: 100%; margin: 0; }
    body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      min-height: 100%;
      margin: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)) transparent;
      padding: 8px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font: 13px/1.35 var(--vscode-font-family);
    }
    body::-webkit-scrollbar { width: 12px; height: 12px; }
    body::-webkit-scrollbar-track { background: transparent; }
    body::-webkit-scrollbar-thumb { min-height: 28px; background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)); border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
    body::-webkit-scrollbar-thumb:hover { background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, .9)); }
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
      position: relative;
      flex: 0 0 auto;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      background: var(--vscode-editor-background);
    }
    .control-drawer[open] {
      display: block;
      height: auto;
      min-height: 0;
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
    .control-drawer[open] > ktc-codegen-control-panel {
      position: static;
      display: block;
      height: auto;
      min-height: 0;
      overflow: visible;
    }
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
    <ktc-codegen-control-panel id="control-panel" mode="full"></ktc-codegen-control-panel>
  </details>
  <script nonce="${nonce}" src="${tableComponentUri}"></script>
  <script nonce="${nonce}" src="${controlCatalogUri}"></script>
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
    const controlPanel = document.getElementById("control-panel");
    let model = ${model};
    let editorLayout = ${layout};
    let controlsModel = model.controls;
    let dirtyNotified = !!model.dirty;
    let draftSyncTimer;

    function post(message) {
      vscode.postMessage(Object.assign({ toolId: "codegen", uri: model.uri }, message));
    }

    function persistEditorLayout(next) {
      editorLayout = Object.assign({}, editorLayout, next);
      post({ type: "codegenEditorLayout", layout: editorLayout });
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

    function syncControlSummary() {
      const headerSummary = document.getElementById("control-summary");
      if (!controlsModel.preflight) {
        headerSummary.textContent = "尚未预检 · Apply 可自动执行";
        return;
      }
      const plan = controlsModel.preflight.plan;
      const issueCount = plan.diagnostics.filter((item) => item.severity === "error" || item.severity === "warning").length;
      headerSummary.textContent = plan.markerRegions.length + " 命中 · " + issueCount + " 问题";
    }

    function setControlsModel(next) {
      const gainedPreflight = !controlsModel.preflight && !!next.preflight;
      controlsModel = next;
      model.controls = next;
      controlPanel.model = controlsModel;
      syncControlSummary();
      if (gainedPreflight) controlDrawer.open = true;
    }

    table.setData(model.table);
    syncHeader();
    controlPanel.model = controlsModel;
    controlPanel.splitRatio = editorLayout.controlSplitPercent;
    syncControlSummary();

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
    controlPanel.addEventListener("ktc-codegen-control-selection-change", (event) => {
      const selected = new Set(event.detail.blockKeys);
      controlsModel = {
        ...controlsModel,
        selectedBlockKeys: [...event.detail.blockKeys],
        singleSelectionMode: !!event.detail.singleMode,
        preflightAvailable: false,
        missingTemplates: [],
        preflight: undefined,
        blocks: controlsModel.blocks.map((block) => ({
          ...block,
          status: selected.has(block.key) ? "pending" : "unselected",
          hitCount: 0,
          artifactCount: 0,
        })),
      };
      model.controls = controlsModel;
      controlPanel.model = controlsModel;
      syncControlSummary();
      post({
        type: "codegenControlSelection",
        blockKeys: [...event.detail.blockKeys],
        singleMode: !!event.detail.singleMode,
      });
    });
    controlPanel.addEventListener("ktc-codegen-control-display-change", (event) => post({
      type: "codegenControlDisplay",
      showMissingTemplates: !!event.detail.showMissingTemplates,
    }));
    controlPanel.addEventListener("ktc-codegen-control-output", (event) => {
      // 同一 Webview 中可能还有 600ms 内尚未交换的整表草稿。先同步再发语义
      // 输出命令，Extension Host 会按消息顺序用最新 session 统一生成并写日志。
      exchangeDraft();
      post({
        type: "codegenControlOutput",
        scope: event.detail.scope,
        blockKey: event.detail.blockKey,
        blockKeys: event.detail.blockKeys,
      });
    });
    controlPanel.addEventListener("ktc-codegen-control-open", (event) => post({
      type: "codegenControlOpen",
      path: event.detail.path,
      line: event.detail.line,
    }));
    controlPanel.addEventListener("ktc-codegen-control-split-change", (event) => {
      persistEditorLayout({ controlSplitPercent: event.detail.percent });
    });

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
