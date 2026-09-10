import type * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import type { KtcCodegenEditorModel } from "./editorContracts.js";
import {
  KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
  ktcNormalizeCodegenEditorLayout,
  type KtcCodegenEditorLayoutState,
} from "./editorLayoutState.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";

const CODEGEN_TOOL_REGISTRATION = ktcRequireToolRegistration("codegen");

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

/** 当前编辑区 JSON View：组合文档工具栏、Wing Table 与可收缩预检结果 Block。 */
export function getCodegenEditorHtml(
  webview: Pick<vscode.Webview, "cspSource" | "asWebviewUri">,
  extensionUri: vscode.Uri,
  initialModel: KtcCodegenEditorModel,
  initialLayout: KtcCodegenEditorLayoutState = KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
  contextPath = "",
): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  const basePath = extensionUri.path.replace(/\/$/, "");
  const tableComponentUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/codegen-table.js` }),
  );
  const controlCatalogUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/codegen-control-catalog.js` }),
  );
  const rightViewShellUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-right-view-shell.js` }),
  );
  const model = safeJson(initialModel);
  const layout = safeJson(ktcNormalizeCodegenEditorLayout(initialLayout));
  let directory = contextPath.trim();
  if (!directory) {
    try {
      const uri = new URL(initialModel.uri);
      if (uri.protocol === "file:") {
        const path = decodeURIComponent(uri.pathname).replace(/^\/(?=[A-Za-z]:\/)/u, "");
        directory = `${uri.host ? `//${uri.host}` : ""}${path.slice(0, path.lastIndexOf("/")) || "/"}`;
      }
    } catch { /* Unknown URI schemes retain the complete URI as accessible context. */ }
  }
  const directoryName = directory.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1) || directory || "未关联目录";
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  const documentPath = directory
    ? `${directory.replace(/[\\/]+$/u, "")}${separator}${initialModel.fileName}`
    : initialModel.uri;
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
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font: 13px/1.35 var(--vscode-font-family);
    }
    ktc-right-view-shell { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; }
    .codegen-main {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      margin: 0;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)) transparent;
      padding: 8px;
    }
    body.vscode-high-contrast,
    body.vscode-high-contrast-light {
      --ktc-ui-border: var(--vscode-contrastBorder, var(--vscode-focusBorder));
      --ktc-ui-active-border: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder));
    }
    .codegen-main::-webkit-scrollbar { width: 12px; height: 12px; }
    .codegen-main::-webkit-scrollbar-track { background: transparent; }
    .codegen-main::-webkit-scrollbar-thumb { min-height: 28px; background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)); border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
    .codegen-main::-webkit-scrollbar-thumb:hover { background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, .9)); }
    button {
      min-height: 27px;
      padding: 3px 10px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border));
      border-radius: 3px;
      font: inherit;
      cursor: pointer;
    }
    button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
    button.primary {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border-color: var(--ktc-ui-border, var(--vscode-button-background));
    }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button:focus-visible, summary:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    .document-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      width: max-content;
      white-space: nowrap;
    }
    .document-actions > * { flex: 0 0 auto; }
    .document-state { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .document-state[hidden] { display: none; }
    .document-state.dirty { color: var(--vscode-editorWarning-foreground); }
    .document-state.conflict { color: var(--vscode-errorForeground); }
    .separator { width: 1px; height: 22px; margin: 0 2px; background: var(--vscode-panel-border); }
    kt-codegen-table { flex: 0 0 auto; min-height: 0; }
    #control-panel {
      position: static;
      display: block;
      flex: 0 0 auto;
      height: auto;
      min-height: 0;
    }
    .batch-overlay {
      position: fixed;
      z-index: 100;
      inset: 0;
      display: grid;
      place-content: center;
      gap: 7px;
      padding: 24px;
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-editor-background) 90%, transparent);
      text-align: center;
      cursor: progress;
    }
    .batch-overlay[hidden] { display: none; }
    .batch-overlay strong { font-size: 14px; }
    .batch-overlay span { color: var(--vscode-descriptionForeground); }
    body.vscode-high-contrast kt-codegen-table,
    body.vscode-high-contrast-light kt-codegen-table {
      --pnw-kt-codegen-border: var(--vscode-contrastBorder, var(--vscode-panel-border));
      --pnw-kt-codegen-focus: var(--vscode-focusBorder);
    }
    body.vscode-high-contrast button:focus-visible,
    body.vscode-high-contrast summary:focus-visible,
    body.vscode-high-contrast-light button:focus-visible,
    body.vscode-high-contrast-light summary:focus-visible {
      outline-width: 2px;
    }
  </style>
</head>
<body>
  <ktc-right-view-shell id="codegen-right-shell">
  <div class="document-actions" slot="actions" role="group" aria-label="自动代码文档操作">
    <span id="document-state" role="status" aria-live="polite" aria-atomic="true" class="document-state" hidden></span>
    <button id="preflight" type="button" aria-label="运行 Codegen 预检" aria-pressed="false">预检</button>
    <button id="controls" type="button" aria-expanded="false" aria-controls="control-panel">预检结果</button>
    <button id="apply" type="button" title="没有缓存时会先自动预检；写入前重验源码指纹">应用</button>
    <span class="separator" aria-hidden="true"></span>
    <button id="reload" type="button" title="重新读取磁盘 JSON；未保存时会先确认">重新加载</button>
    <button class="primary" id="save" type="button">保存 JSON</button>
  </div>
  <main class="codegen-main">
  <kt-codegen-table id="codegen-table" layout="page" collapsible></kt-codegen-table>
  <ktc-codegen-control-panel id="control-panel" collapsible></ktc-codegen-control-panel>
  <div class="batch-overlay" id="batch-overlay" role="status" aria-live="assertive"
    aria-label="全部应用正在运行，当前 JSON View 操作暂时锁定" hidden>
    <strong id="batch-overlay-title">正在全部应用</strong>
    <span id="batch-overlay-file">正在准备 JSON View…</span>
  </div>
  </main>
  </ktc-right-view-shell>
  <script nonce="${nonce}" src="${rightViewShellUri}"></script>
  <script nonce="${nonce}" src="${tableComponentUri}"></script>
  <script nonce="${nonce}" src="${controlCatalogUri}"></script>
  <script nonce="${nonce}">
    const rightShell = document.getElementById("codegen-right-shell");
    const vscode = acquireVsCodeApi();
    const table = document.getElementById("codegen-table");
    const documentState = document.getElementById("document-state");
    const save = document.getElementById("save");
    const reload = document.getElementById("reload");
    const preflight = document.getElementById("preflight");
    const controls = document.getElementById("controls");
    const controlPanel = document.getElementById("control-panel");
    const codegenMain = document.querySelector(".codegen-main");
    const batchOverlay = document.getElementById("batch-overlay");
    const batchOverlayTitle = document.getElementById("batch-overlay-title");
    const batchOverlayFile = document.getElementById("batch-overlay-file");
    let model = ${model};
    const initialLayout = ${layout};
    let controlsModel = model.controls;
    let dirtyNotified = !!model.dirty;
    let draftSyncTimer;

    function post(message) {
      vscode.postMessage(Object.assign({ toolId: "codegen", uri: model.uri }, message));
    }

    function syncDetailStickyTop() {
      // The document actions now live outside this scrollport, in the Shell Header.
      const stickyTop = 8;
      const viewportHeight = codegenMain ? codegenMain.clientHeight : window.innerHeight;
      if (viewportHeight <= 0) return;
      document.body.style.setProperty("--pnw-codegen-detail-sticky-top", stickyTop + "px");
      document.body.style.setProperty(
        "--pnw-codegen-detail-height",
        Math.max(240, viewportHeight - stickyTop - 8) + "px",
      );
    }
    const detailResizeObserver = new ResizeObserver(syncDetailStickyTop);
    if (codegenMain) detailResizeObserver.observe(codegenMain);
    window.addEventListener("resize", syncDetailStickyTop);
    syncDetailStickyTop();

    function syncHeader() {
      rightShell.model = {
        title: ${safeJson(CODEGEN_TOOL_REGISTRATION.title)},
        contextPath: ${safeJson(documentPath)},
        contextLabel: model.fileName + " @ " + ${safeJson(directoryName)},
        scrollMode: "none",
      };
      save.textContent = model.dirty ? "保存 JSON *" : "保存 JSON";
      const stateMessage = model.externalState === "deleted"
        ? "磁盘文件已删除 · 当前内容仍保留"
        : model.externalConflict
        ? "外部文件已变更 · 请重新加载或保存时处理"
        : model.dirty ? "未保存" : "";
      documentState.textContent = model.externalState === "deleted" ? "已删除"
        : model.externalConflict ? "外部变更" : stateMessage;
      documentState.hidden = !stateMessage;
      documentState.title = stateMessage;
      documentState.setAttribute("aria-label", stateMessage);
      documentState.className = "document-state " + (model.externalConflict || model.externalState === "deleted"
        ? "conflict" : model.dirty ? "dirty" : "");
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
        externalState: model.externalState || (model.externalConflict ? "changed" : "current"),
      };
    }

    function exchangeDraft() {
      clearTimeout(draftSyncTimer);
      if (!model.dirty) return;
      post({ type: "codegenEditorExchange", action: "sync", model: currentExchangeModel() });
    }

    function setControlsExpanded(expanded) {
      controlPanel.collapsed = !expanded;
      controls.setAttribute("aria-expanded", String(expanded));
    }

    function setControlsModel(next) {
      const gainedPreflight = !controlsModel.preflight && !!next.preflight;
      controlsModel = next;
      model.controls = next;
      controlPanel.model = controlsModel;
      if (gainedPreflight) setControlsExpanded(true);
    }

    table.setData(model.table);
    syncHeader();
    controlPanel.collapsible = true;
    setControlsExpanded(false);
    controlPanel.splitRatio = initialLayout.controlSplitPercent;
    controlPanel.model = controlsModel;

    table.addEventListener("kt-codegen-table-dirty-change", (event) => {
      if (event.detail && event.detail.dirty && markDirty(event.detail.itemCount)) exchangeDraft();
    });
    table.addEventListener("kt-codegen-table-change", (event) => {
      const itemCount = event.detail ? event.detail.itemCount : table.getData().items.length;
      const firstDirty = markDirty(itemCount);
      // 整表仍节流交换，但每次编辑立即使 Host 中运行的旧预检失效。
      if (!firstDirty) post({ type: "codegenEditorDirty", itemCount });
      clearTimeout(draftSyncTimer);
      if (firstDirty) exchangeDraft();
      else draftSyncTimer = setTimeout(exchangeDraft, 600);
    });
    save.onclick = () => post({ type: "codegenEditorExchange", action: "save", model: currentExchangeModel() });
    reload.onclick = () => post({ type: "codegenEditorAction", action: "reload" });
    preflight.onclick = () => {
      if (preflight.dataset.running === "true") {
        post({ type: "codegenEditorAction", action: "cancelPreflight" });
      } else {
        post({ type: "codegenEditorAction", action: "preflight", table: table.getData() });
      }
    };
    controls.onclick = () => setControlsExpanded(controlPanel.collapsed);
    controlPanel.addEventListener("kt-codegen-control-collapse-change", () => {
      controls.setAttribute("aria-expanded", String(!controlPanel.collapsed));
    });
    document.getElementById("apply").onclick = () => post({
      type: "codegenEditorAction", action: "apply", table: table.getData(),
    });
    controlPanel.addEventListener("kt-codegen-control-open", (event) => post({
      type: "codegenControlOpen",
      path: event.detail.path,
      line: event.detail.line,
    }));
    controlPanel.addEventListener("kt-codegen-control-copy-end", (event) => post({
      type: "codegenControlCopyEnd",
      blockKey: event.detail.blockKey,
      path: event.detail.path,
      line: event.detail.line,
    }));
    controlPanel.addEventListener("kt-codegen-control-split-change", (event) => post({
      type: "codegenEditorLayout",
      layout: { controlSplitPercent: event.detail.ratio },
    }));

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
        // Host 的 clean 状态可能早于本地尚未交换的编辑；仅匹配保存回执或重载清除。
        model.dirty = !!message.dirty || model.dirty;
        model.externalConflict = !!message.externalConflict;
        model.externalState = message.externalState || (model.externalConflict ? "changed" : "current");
        if (model.dirty) dirtyNotified = true;
        syncHeader();
      } else if (message.type === "codegenPreflightState") {
        preflight.dataset.running = String(!!message.running);
        preflight.textContent = message.running ? "取消预检" : "预检";
        preflight.setAttribute("aria-pressed", String(!!message.running));
        preflight.setAttribute("aria-label", message.running ? "取消 Codegen 预检" : "运行 Codegen 预检");
        if (message.running) setControlsExpanded(true);
      } else if (message.type === "codegenBatchState") {
        batchOverlay.hidden = !message.running;
        batchOverlayTitle.textContent = message.running && message.total
          ? "正在全部应用 " + (message.current ?? 0) + " / " + message.total
          : "正在全部应用";
        batchOverlayFile.textContent = message.fileName || "正在准备 JSON View…";
        document.body.setAttribute("aria-busy", String(!!message.running));
      } else if (message.type === "codegenStatus") {
        if (message.status === "saved") {
          const current = table.getData();
          const newerDraft = message.savedTable && (message.savedCurrent === false
            || JSON.stringify(current.items) !== JSON.stringify(message.savedTable.items));
          model.dirty = !!newerDraft;
          model.externalConflict = false;
          model.externalState = "current";
          dirtyNotified = !!newerDraft;
          table.markCheckpoint(message.documentRevision ?? current.documentRevision, message.savedTable?.items);
          model.table = table.getData();
          syncHeader();
          if (newerDraft) exchangeDraft();
          else clearTimeout(draftSyncTimer);
        }
        table.setStatus(message.status === "saved" && model.dirty ? "idle" : message.status,
          message.status === "saved" && model.dirty ? "已保存先前快照；较新的草稿尚未保存" : message.message || "");
        table.setAttribute("aria-busy", String(message.status === "saving"));
        save.disabled = message.status === "saving";
      }
    });
    post({ type: "codegenEditorAction", action: "ready" });
  </script>
</body>
</html>`;
}
