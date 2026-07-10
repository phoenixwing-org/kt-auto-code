import * as vscode from "vscode";
import type { ToolSummary, WebviewOutboundMessage } from "../tools/types.js";

export function getPanelHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kt Auto Code</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0;
      margin: 0;
    }
    .wrap { padding: 12px 16px 16px; }
    .tabs {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }
    .tab {
      padding: 4px 10px;
      border: 1px solid transparent;
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 12px;
    }
    .tab.active {
      background: var(--vscode-button-secondaryBackground);
      border-color: var(--vscode-button-border);
    }
    .tab:disabled { opacity: 0.45; cursor: default; }
    h2 {
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 8px;
    }
    .desc {
      font-size: 12px;
      line-height: 1.5;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .scope-block {
      margin-bottom: 12px;
      font-size: 12px;
    }
    .scope-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .scope-block label {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      cursor: pointer;
      line-height: 1.4;
      margin-bottom: 4px;
    }
    .scope-block label.disabled {
      opacity: 0.55;
      cursor: default;
    }
    .scope-block input { margin-top: 2px; }
    .scope-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: 4px 0 0 0;
      line-height: 1.4;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }
    button.action {
      padding: 4px 14px;
      border: none;
      border-radius: 2px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 12px;
    }
    button.action:hover { background: var(--vscode-button-hoverBackground); }
    button.action:disabled { opacity: 0.5; cursor: wait; }
    .status {
      font-size: 12px;
      margin-bottom: 10px;
      min-height: 1.2em;
    }
    .status.error { color: var(--vscode-errorForeground); }
    .results-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .results { list-style: none; padding: 0; margin: 0; }
    .results li {
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
    }
    .results li:hover { background: var(--vscode-list-hoverBackground); }
    .results .file { font-weight: 500; }
    .results .detail { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .results .file-row { padding: 6px 8px; border-radius: 4px; cursor: pointer; }
    .results .file-row:hover { background: var(--vscode-list-hoverBackground); }
    .issue-details { list-style: none; padding: 0 0 4px 12px; margin: 0; }
    .issue-details li {
      padding: 3px 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    .issue-details li:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
    .issue-details .arrow { opacity: 0.7; margin: 0 4px; }
    .issue-details .to { color: var(--vscode-foreground); }
    .empty { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .options {
      margin-bottom: 12px;
      font-size: 12px;
    }
    .options label {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      cursor: pointer;
      line-height: 1.4;
    }
    .options input { margin-top: 2px; }
    .options .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      margin-left: 20px;
    }
    .enc-row .status-ok { color: var(--vscode-testing-iconPassed); }
    .enc-row .status-warn { color: var(--vscode-editorWarning-foreground); }
    .enc-row .status-bad { color: var(--vscode-errorForeground); }
    .target-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: -6px 0 12px;
    }
    #header-options label + .hint { display: block; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="tabs" id="tabs"></div>
    <h2 id="tool-title">Kt Auto Code</h2>
    <p class="desc" id="tool-desc"></p>
    <p class="meta">工作区：<strong id="workspace-label">—</strong></p>
    <div class="scope-block" id="scope-block">
      <div class="scope-title">范围</div>
      <label>
        <input type="checkbox" id="scope-headers" />
        <span>头文件（.h / .hpp / …）</span>
      </label>
      <label>
        <input type="checkbox" id="scope-source" />
        <span>源文件（.cpp / .c / …）</span>
      </label>
      <label id="scope-md-wrap">
        <input type="checkbox" id="scope-md" />
        <span>.md 文档（仅编码修正）</span>
      </label>
    </div>
    <div class="scope-block" id="ignore-block">
      <div class="scope-title">Ignore 配置</div>
      <p class="scope-hint" id="ignore-status">—</p>
      <p class="scope-hint">工作区 <code>.phoenix/.ignore</code> 中的路径/目录将跳过（语法同 .gitignore）。</p>
      <div class="actions">
        <button class="action" id="btn-open-ignore" type="button">打开</button>
        <button class="action" id="btn-sync-ignore" type="button">从 .gitignore 同步</button>
      </div>
    </div>
    <p class="target-hint" id="target-hint" hidden>默认目标：<strong>UTF-8 无 BOM</strong></p>
    <div class="options" id="options-panel" hidden>
      <div id="header-options">
        <label>
          <input type="checkbox" id="opt-preserve-gbk" />
          <span>保留 GBK 中文注释</span>
        </label>
        <p class="hint" id="opt-hint">默认关闭：扫描并清除所有非 ASCII（推荐）。</p>
        <label style="margin-top:8px">
          <input type="checkbox" id="opt-strip-bom" />
          <span>去除 BOM（含 UTF-8 BOM / UTF-16）→ UTF-8 无 BOM</span>
        </label>
        <p class="hint" id="opt-bom-hint">预检列出 BOM；勾选后修复时去除 UTF-8 的 EF BB BF，并将 UTF-16 转为 UTF-8 无 BOM。</p>
      </div>
      <div id="encoding-options" hidden>
        <label>
          <input type="checkbox" id="opt-enc-details" />
          <span>显示详细（BOM 十六进制、检测说明）</span>
        </label>
      </div>
      <label style="margin-top:8px" id="opt-show-details-wrap">
        <input type="checkbox" id="opt-show-details" />
        <span id="opt-show-details-label">显示详细（原字符 → 修正为）</span>
      </label>
    </div>
    <div class="actions">
      <button class="action" id="btn-scan">预检</button>
      <button class="action" id="btn-fix">修复</button>
    </div>
    <p class="status" id="status"></p>
    <div class="results-title">预检结果</div>
    <ul class="results" id="results"></ul>
    <p class="empty" id="empty-hint">点击「预检」查看头文件中的问题字节。</p>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const saved = vscode.getState() || {};
    let state = {
      tools: [],
      activeToolId: "",
      toolStates: {},
      toolOptions: {},
      scope: { includeHeaders: true, includeSource: true, includeMarkdown: true },
      ignoreConfig: null,
      showDetails: !!saved.showDetails,
      showEncDetails: !!saved.showEncDetails,
    };

    const els = {
      tabs: document.getElementById("tabs"),
      title: document.getElementById("tool-title"),
      desc: document.getElementById("tool-desc"),
      workspace: document.getElementById("workspace-label"),
      scopeHeaders: document.getElementById("scope-headers"),
      scopeSource: document.getElementById("scope-source"),
      scopeMd: document.getElementById("scope-md"),
      scopeMdWrap: document.getElementById("scope-md-wrap"),
      ignoreStatus: document.getElementById("ignore-status"),
      btnOpenIgnore: document.getElementById("btn-open-ignore"),
      btnSyncIgnore: document.getElementById("btn-sync-ignore"),
      targetHint: document.getElementById("target-hint"),
      headerOptions: document.getElementById("header-options"),
      encodingOptions: document.getElementById("encoding-options"),
      encDetails: document.getElementById("opt-enc-details"),
      showDetailsWrap: document.getElementById("opt-show-details-wrap"),
      showDetailsLabel: document.getElementById("opt-show-details-label"),
      optionsPanel: document.getElementById("options-panel"),
      preserveGbk: document.getElementById("opt-preserve-gbk"),
      stripBom: document.getElementById("opt-strip-bom"),
      showDetails: document.getElementById("opt-show-details"),
      optHint: document.getElementById("opt-hint"),
      optBomHint: document.getElementById("opt-bom-hint"),
      status: document.getElementById("status"),
      results: document.getElementById("results"),
      empty: document.getElementById("empty-hint"),
      btnScan: document.getElementById("btn-scan"),
      btnFix: document.getElementById("btn-fix"),
    };

    function toolOptions() {
      return state.toolOptions[state.activeToolId] || {};
    }

    function isEncodingTool() {
      return state.activeToolId === "encodingFix";
    }

    function updateOptHint() {
      if (isEncodingTool()) {
        els.empty.textContent = "点击「预检」检查文件整体编码。";
        return;
      }
      const preserve = !!toolOptions().preserveGbk;
      els.optHint.textContent = preserve
        ? "已开启：仅修复弯引号等问题字节，GBK 中文保留。"
        : "默认关闭：扫描并清除所有非 ASCII（推荐）。";
      els.empty.textContent = preserve
        ? "点击「预检」检查弯引号等问题字节。"
        : "点击「预检」检查头文件中的非 ASCII 内容。";
    }

    function encStatusClass(status) {
      if (status === "ok") return "status-ok";
      if (status === "unsupported") return "status-warn";
      return "status-bad";
    }

    function renderHeaderResults(ts, showDetailRows) {
      const items = ts.results || [];
      if (items.length === 0) {
        els.empty.style.display = ts.status === "done" ? "block" : (ts.status === "idle" ? "block" : "none");
        if (ts.status === "done" && ts.issueFiles === 0) {
          els.empty.textContent = toolOptions().preserveGbk
            ? "未发现弯引号等问题字节。"
            : "未发现非 ASCII 或问题字节。";
        }
        return;
      }
      els.empty.style.display = "none";
      for (const item of items) {
        const block = document.createElement("li");
        block.style.listStyle = "none";
        block.style.padding = "0";
        block.style.margin = "0 0 4px";

        const row = document.createElement("div");
        row.className = "file-row";
        row.innerHTML = '<span class="file">' + escapeHtml(item.file) + '</span>' +
          ' <span class="detail">L' + item.topLine + ' ×' + item.issueCount + '</span>';
        row.onclick = () => vscode.postMessage({
          type: "openIssue",
          toolId: state.activeToolId,
          file: item.fullPath,
          line: item.topLine,
        });
        block.appendChild(row);

        if (showDetailRows && item.issues && item.issues.length) {
          const ul = document.createElement("ul");
          ul.className = "issue-details";
          for (const iss of item.issues) {
            const dli = document.createElement("li");
            dli.innerHTML = 'L' + iss.line + ':C' + iss.column + ' ' +
              escapeHtml(iss.fromLabel) + '<span class="arrow">→</span><span class="to">' +
              escapeHtml(iss.toLabel) + '</span>';
            dli.onclick = (e) => {
              e.stopPropagation();
              vscode.postMessage({
                type: "openIssue",
                toolId: state.activeToolId,
                file: item.fullPath,
                line: iss.line,
              });
            };
            ul.appendChild(dli);
          }
          block.appendChild(ul);
        }

        els.results.appendChild(block);
      }
    }

    function renderEncodingResults(ts, showEncDetails) {
      const items = ts.encodingResults || [];
      if (items.length === 0) {
        els.empty.style.display = ts.status === "done" ? "block" : (ts.status === "idle" ? "block" : "none");
        if (ts.status === "done" && ts.issueFiles === 0) {
          els.empty.textContent = "所有文件均为 UTF-8 无 BOM（或等价 ASCII）。";
        }
        return;
      }
      els.empty.style.display = "none";
      for (const item of items) {
        const block = document.createElement("li");
        block.className = "enc-row";
        block.style.listStyle = "none";
        block.style.padding = "0";
        block.style.margin = "0 0 4px";

        const row = document.createElement("div");
        row.className = "file-row";
        const action = item.suggestedAction === "—" ? "ok" : escapeHtml(item.suggestedAction);
        row.innerHTML =
          '<span class="file">' + escapeHtml(item.relativePath) + '</span>' +
          ' <span class="detail">' + escapeHtml(item.detected) +
          ' <span class="arrow">→</span> ' + escapeHtml(item.expected) + '</span>' +
          ' <span class="' + encStatusClass(item.status) + '">' + action + '</span>';
        row.onclick = () => vscode.postMessage({
          type: "openEncodingFile",
          toolId: state.activeToolId,
          file: item.fullPath,
        });
        block.appendChild(row);

        if (showEncDetails && item.detail) {
          const det = document.createElement("div");
          det.className = "detail";
          det.style.padding = "2px 8px 4px 12px";
          det.textContent = item.detail;
          block.appendChild(det);
        }

        els.results.appendChild(block);
      }
    }

    function activeTool() {
      return state.tools.find((t) => t.id === state.activeToolId);
    }

    function toolState() {
      return state.toolStates[state.activeToolId] || { status: "idle" };
    }

    function renderIgnoreConfig() {
      const cfg = state.ignoreConfig;
      if (!cfg) {
        els.ignoreStatus.textContent = "未打开工作区";
        els.btnOpenIgnore.disabled = true;
        els.btnSyncIgnore.disabled = true;
        return;
      }
      els.ignoreStatus.textContent = cfg.relativePath + " · " + cfg.statusText;
      els.btnOpenIgnore.disabled = false;
      els.btnSyncIgnore.disabled = !cfg.gitIgnoreExists;
    }

    function render() {
      const tool = activeTool();
      if (tool) {
        els.title.textContent = tool.title;
        els.desc.textContent = tool.description;
      }
      els.tabs.innerHTML = "";
      for (const t of state.tools) {
        const btn = document.createElement("button");
        btn.className = "tab" + (t.id === state.activeToolId ? " active" : "");
        btn.textContent = t.title;
        btn.onclick = () => vscode.postMessage({ type: "selectTool", toolId: t.id });
        els.tabs.appendChild(btn);
      }
      const ts = toolState();
      const running = ts.status === "running";
      const enc = isEncodingTool();
      els.btnScan.disabled = running;
      els.btnFix.disabled = running;
      els.btnFix.textContent = enc ? "转换" : "修复";

      els.targetHint.hidden = !enc;

      els.scopeHeaders.checked = !!state.scope.includeHeaders;
      els.scopeSource.checked = !!state.scope.includeSource;
      els.scopeMd.checked = !!state.scope.includeMarkdown;
      els.scopeMdWrap.className = enc ? "" : "disabled";
      els.scopeMd.disabled = !enc;

      renderIgnoreConfig();

      els.optionsPanel.hidden = false;
      els.headerOptions.hidden = enc;
      els.encodingOptions.hidden = !enc;
      els.showDetailsWrap.hidden = enc;
      if (!enc) {
        els.preserveGbk.checked = !!toolOptions().preserveGbk;
        els.stripBom.checked = !!toolOptions().stripBom;
        els.showDetails.checked = !!state.showDetails;
        updateOptHint();
      } else {
        els.encDetails.checked = !!state.showEncDetails;
        updateOptHint();
      }

      els.status.textContent = ts.message || "";
      els.status.className = "status" + (ts.status === "error" ? " error" : "");
      els.results.innerHTML = "";

      if (enc) {
        renderEncodingResults(ts, !!state.showEncDetails);
      } else {
        renderHeaderResults(ts, !!state.showDetails);
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    els.btnScan.onclick = () => vscode.postMessage({ type: "run", toolId: state.activeToolId, action: "scan" });
    els.btnFix.onclick = () => vscode.postMessage({
      type: "run",
      toolId: state.activeToolId,
      action: isEncodingTool() ? "convert" : "fix",
    });
    els.scopeHeaders.onchange = () => vscode.postMessage({
      type: "setOption", toolId: "scope", key: "includeHeaders", value: els.scopeHeaders.checked,
    });
    els.scopeSource.onchange = () => vscode.postMessage({
      type: "setOption", toolId: "scope", key: "includeSource", value: els.scopeSource.checked,
    });
    els.scopeMd.onchange = () => vscode.postMessage({
      type: "setOption", toolId: "scope", key: "includeMarkdown", value: els.scopeMd.checked,
    });
    els.btnOpenIgnore.onclick = () => vscode.postMessage({ type: "openIgnoreFile" });
    els.btnSyncIgnore.onclick = () => vscode.postMessage({ type: "syncIgnoreFromGit" });
    els.preserveGbk.onchange = () => vscode.postMessage({
      type: "setOption",
      toolId: "headerAscii",
      key: "preserveGbk",
      value: els.preserveGbk.checked,
    });
    els.stripBom.onchange = () => vscode.postMessage({
      type: "setOption",
      toolId: "headerAscii",
      key: "stripBom",
      value: els.stripBom.checked,
    });
    els.showDetails.onchange = () => {
      state.showDetails = els.showDetails.checked;
      vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails });
      render();
    };
    els.encDetails.onchange = () => {
      state.showEncDetails = els.encDetails.checked;
      vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails });
      render();
    };

    window.addEventListener("message", (e) => {
      const msg = e.data;
      if (msg.type === "init") {
        state.tools = msg.tools;
        state.activeToolId = msg.activeToolId;
        state.toolOptions = msg.toolOptions || {};
        state.scope = msg.scope || state.scope;
        state.ignoreConfig = msg.ignoreConfig || null;
        els.workspace.textContent = msg.workspaceLabel;
        render();
      } else if (msg.type === "workspace") {
        els.workspace.textContent = msg.label;
      } else if (msg.type === "scope") {
        state.scope = msg.scope;
        render();
      } else if (msg.type === "ignoreConfig") {
        state.ignoreConfig = msg.ignoreConfig || null;
        render();
      } else if (msg.type === "options") {
        state.toolOptions[msg.toolId] = msg.options;
        render();
      } else if (msg.type === "state") {
        state.toolStates[msg.toolId] = msg.state;
        render();
      }
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function postToWebview(
  webviewView: vscode.WebviewView | undefined,
  message: WebviewOutboundMessage,
): void {
  void webviewView?.webview.postMessage(message);
}
