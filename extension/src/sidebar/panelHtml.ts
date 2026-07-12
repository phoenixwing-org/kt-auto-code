import * as vscode from "vscode";
import type { ToolSummary, WebviewOutboundMessage } from "../tools/types.js";
import { ktcCreateWebviewSecurity } from "../webviewSupport.js";

export function getPanelHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview, { allowImages: true });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KT Auto Code</title>
  <style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0;
      margin: 0;
    }
    .wrap { padding: 8px 14px 16px; }
    .tabs {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }
    .tabs.ribbon {
      display: grid;
      grid-template-columns: repeat(4, minmax(54px, 1fr));
      gap: 1px;
      padding: 4px 0 9px;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 5px;
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
    .tabs.ribbon .tab {
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      min-height: 58px;
      padding: 5px 3px 4px;
      gap: 4px;
      border-radius: 2px;
      line-height: 1.1;
      text-align: center;
    }
    .tabs.ribbon .tab > span:last-child {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-size: 11px;
      line-height: 1.15;
    }
    .tabs.ribbon .tab.active {
      color: var(--vscode-list-activeSelectionForeground);
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .tabs.ribbon .tool-icon { width: 24px; height: 24px; flex-basis: 24px; }
    @media (max-width: 230px) {
      .tabs.ribbon { grid-template-columns: repeat(2, minmax(70px, 1fr)); }
    }
    .tab:disabled { opacity: 0.45; cursor: default; }
    .tool-icon {
      width: 15px;
      height: 15px;
      flex: 0 0 15px;
      background: currentColor;
      mask: var(--tool-icon) center / contain no-repeat;
      -webkit-mask: var(--tool-icon) center / contain no-repeat;
    }
    h2 {
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 6px;
    }
    .desc {
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .replace-block { margin: 10px 0 12px; }
    .replace-fields { display: grid; gap: 5px; }
    .replace-fields input[type="text"] {
      width: 100%;
      height: 30px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 2px;
      outline: none;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font-family: var(--vscode-editor-font-family);
    }
    .replace-fields input[type="text"]:focus { border-color: var(--vscode-focusBorder); }
    .replace-options { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 9px 0; }
    .replace-options label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
    .replace-scope { margin-top: 6px; }
    .replace-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 9px; }
    .root-rename-hint {
      margin: 7px 0 0;
      padding: 5px 7px;
      border-left: 2px solid var(--vscode-editorWarning-foreground);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textBlockQuote-background);
      font-size: 11px;
      line-height: 1.4;
    }
    .root-rename-hint .text-button { margin-left: 5px; }
    .replace-more-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 7px; }
    .text-button { border: 0; padding: 2px 0; color: var(--vscode-textLink-foreground); background: transparent; cursor: pointer; font-size: 11px; }
    .multi-rules { margin-top: 7px; padding-top: 8px; border-top: 1px solid var(--vscode-panel-border); }
    .multi-rules > label { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; margin-bottom: 7px; }
    .profile-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; margin-bottom: 7px; }
    .profile-row select {
      min-width: 0;
      height: 28px;
      padding: 2px 6px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    .profile-row button { white-space: nowrap; }
    .prefix-fields { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; }
    .prefix-arrow { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .rule-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr) 82px; gap: 4px; align-items: center; margin-bottom: 5px; }
    .rule-row input { min-width: 0; height: 27px; padding: 3px 6px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font-family: var(--vscode-editor-font-family); }
    .rule-actions { display: flex; }
    .rule-row button { width: 20px; padding: 0; border: 0; color: var(--vscode-foreground); background: transparent; cursor: pointer; font-size: 13px; }
    .rule-row button:hover { background: var(--vscode-list-hoverBackground); }
    .rule-row button:disabled { opacity: 0.45; cursor: default; }
    .rule-tools { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-top: 6px; }
    @media (max-width: 320px) {
      .profile-row, .prefix-fields { grid-template-columns: minmax(0, 1fr); }
      .profile-row button { justify-self: start; }
      .prefix-arrow { display: none; }
      .rule-row { grid-template-columns: 18px minmax(0, 1fr) 82px; }
      .rule-row > input[type="checkbox"] { grid-row: 1 / span 2; }
      .rule-row > input:not([type="checkbox"]) { grid-column: 2; }
      .rule-actions { grid-column: 3; grid-row: 1 / span 2; }
      body .preset-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      body .preset-row select { grid-column: 1 / -1; }
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
    #ignore-block { margin-top: 14px; }
    #ignore-block .scope-hint { margin: 0 0 10px; font-size: 12px; }
    #ignore-block .actions { margin: 0; gap: 6px; }
    #btn-analyze-ignore { width: 100%; margin-top: 7px; }
    .preset-row { display: grid; grid-template-columns: minmax(72px, 1fr) auto auto; gap: 6px; margin-bottom: 8px; }
    .preset-row select {
      min-width: 0;
      height: 28px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    .preset-row .action { padding-inline: 10px; }
    .actions {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    #general-actions button { flex: 1 1 0; }
    button.action {
      min-height: 28px;
      padding: 4px 12px;
      border: 1px solid transparent;
      border-radius: 2px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 12px;
    }
    button.action:hover { background: var(--vscode-button-hoverBackground); }
    button.action.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.action.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.action:disabled { opacity: 0.5; cursor: wait; }
    .status {
      font-size: 12px;
      margin: 2px 0 10px;
      padding: 6px 8px;
      min-height: 28px;
      border-left: 2px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textBlockQuote-background);
    }
    .status:empty { display: none; }
    .status.error { color: var(--vscode-errorForeground); border-left-color: var(--vscode-errorForeground); }
    .meta { margin: 10px 0 12px; font-size: 11px; color: var(--vscode-descriptionForeground); }
    .meta strong { color: var(--vscode-foreground); font-weight: 500; }
    .results-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0;
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
    <h2 id="tool-title">KT Auto Code</h2>
    <p class="desc" id="tool-desc"></p>
    <p class="meta" id="workspace-meta">工作区：<strong id="workspace-label">—</strong></p>
    <section class="replace-block" id="replace-block" hidden>
      <div class="replace-fields">
        <input id="replace-search" type="text" spellcheck="false" placeholder="搜索" aria-label="搜索内容" />
        <input id="replace-with" type="text" spellcheck="false" placeholder="替换" aria-label="替换内容" />
      </div>
      <div class="replace-options">
        <label><input id="replace-text" type="checkbox" checked />文本</label>
        <label><input id="replace-file" type="checkbox" />文件名</label>
        <label><input id="replace-dir" type="checkbox" />文件夹名</label>
        <label><input id="replace-ignored" type="checkbox" />包含 Ignore</label>
      </div>
      <div class="replace-fields replace-scope">
        <input id="replace-scope" type="text" spellcheck="false" placeholder="工作目录（留空为当前工作区）" aria-label="搜索替换工作目录" title="可填工作区内的相对或绝对路径；非根目录本身可参与改名" />
      </div>
      <div class="replace-more-bar">
        <button class="text-button" id="btn-expand-rules" type="button">展开关联规则</button>
      </div>
      <div class="multi-rules" id="multi-rules" hidden>
        <div class="profile-row">
          <select id="replace-profile" aria-label="工作区规则档案">
            <option value="">规则档案…</option>
          </select>
          <button class="text-button" id="btn-save-profile" type="button" title="保存到当前工作区">保存规则</button>
        </div>
        <div class="replace-fields prefix-fields" style="margin-bottom:7px">
          <input id="replace-source-prefix" type="text" spellcheck="false" placeholder="源前缀，如 KTC" aria-label="源名称前缀" />
          <span class="prefix-arrow">→</span>
          <input id="replace-target-prefix" type="text" spellcheck="false" placeholder="目标前缀，如 KTM" aria-label="目标名称前缀" />
        </div>
        <label><input id="replace-preserve-case" type="checkbox" />保持大小写（自动全大写）</label>
        <div id="extra-rules"></div>
        <div class="rule-tools">
          <button class="text-button" id="btn-add-rule" type="button">+ 自定义规则</button>
          <button class="text-button" id="btn-common-rules" type="button">常用规则</button>
          <button class="text-button" id="btn-caa-rules" type="button">CAA 规则 ▾</button>
        </div>
      </div>
      <div class="replace-actions">
        <button class="action secondary" id="btn-replace-preview" type="button">预览</button>
        <button class="action" id="btn-replace-apply" type="button">替换</button>
      </div>
      <p class="root-rename-hint" id="root-rename-hint" hidden>
        <span id="root-rename-message"></span><button class="text-button" id="btn-create-root-todo" type="button">创建 TODO</button>
      </p>
    </section>
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
    <div class="scope-block" id="ignore-block" hidden>
      <p class="scope-hint" id="ignore-status">—</p>
      <div class="preset-row">
        <select id="ignore-preset" aria-label="Ignore 预设">
          <option value="caa">CAA</option>
          <option value="cpp">C++</option>
          <option value="web">Web</option>
        </select>
        <button class="action" id="btn-append-preset" type="button">追加</button>
        <button class="action secondary" id="btn-remove-preset" type="button">去除</button>
      </div>
      <div class="actions">
        <button class="action secondary" id="btn-open-ignore" type="button">编辑规则</button>
        <button class="action" id="btn-sync-ignore" type="button">从 .gitignore 追加</button>
      </div>
      <button class="action secondary" id="btn-analyze-ignore" type="button">分析当前工作区</button>
    </div>
    <p class="target-hint" id="target-hint" hidden>默认目标：<strong>UTF-8</strong></p>
    <div class="options" id="options-panel" hidden>
      <div id="header-options">
        <label>
          <input type="checkbox" id="opt-preserve-gbk" />
          <span>保留 GBK 中文注释</span>
        </label>
        <p class="hint" id="opt-hint">关闭时修正全部非 ASCII。</p>
        <label style="margin-top:8px">
          <input type="checkbox" id="opt-strip-bom" />
          <span>去除 BOM（含 UTF-8 BOM / UTF-16）→ UTF-8</span>
        </label>
        <p class="hint" id="opt-bom-hint">宽字节 BOM 文件将转为 UTF-8。</p>
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
    <div class="actions" id="general-actions">
      <button class="action secondary" id="btn-scan">预检</button>
      <button class="action" id="btn-fix">修复</button>
    </div>
    <p class="status" id="status"></p>
    <div class="results-title" id="results-title">预检结果</div>
    <ul class="results" id="results"></ul>
    <p class="empty" id="empty-hint">点击「预检」查看头文件中的问题字节。</p>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const saved = vscode.getState() || {};
    const savedReplace = saved.replace || {};
    const legacyPrefix = savedReplace.prefix || "";
    let state = {
      tools: [],
      activeToolId: "",
      toolStates: {},
      toolOptions: {},
      scope: { includeHeaders: true, includeSource: true, includeMarkdown: true },
      ignoreConfig: null,
      showDetails: !!saved.showDetails,
      showEncDetails: !!saved.showEncDetails,
      sidebarStyle: "ribbon",
      searchReplaceProfiles: [],
      searchReplaceProfileError: "",
      replace: Object.assign({ search: "", with: "", text: true, file: false, dir: false, ignored: false, scope: "", expanded: false, sourcePrefix: legacyPrefix, targetPrefix: legacyPrefix, preserveCase: false, extraRules: [], profileId: "" }, savedReplace),
    };

    const els = {
      tabs: document.getElementById("tabs"),
      title: document.getElementById("tool-title"),
      desc: document.getElementById("tool-desc"),
      replaceBlock: document.getElementById("replace-block"),
      replaceSearch: document.getElementById("replace-search"),
      replaceWith: document.getElementById("replace-with"),
      replaceText: document.getElementById("replace-text"),
      replaceFile: document.getElementById("replace-file"),
      replaceDir: document.getElementById("replace-dir"),
      replaceIgnored: document.getElementById("replace-ignored"),
      replaceScope: document.getElementById("replace-scope"),
      btnExpandRules: document.getElementById("btn-expand-rules"),
      multiRules: document.getElementById("multi-rules"),
      replaceProfile: document.getElementById("replace-profile"),
      btnSaveProfile: document.getElementById("btn-save-profile"),
      replaceSourcePrefix: document.getElementById("replace-source-prefix"),
      replaceTargetPrefix: document.getElementById("replace-target-prefix"),
      preserveCase: document.getElementById("replace-preserve-case"),
      extraRules: document.getElementById("extra-rules"),
      btnAddRule: document.getElementById("btn-add-rule"),
      btnCommonRules: document.getElementById("btn-common-rules"),
      btnCaaRules: document.getElementById("btn-caa-rules"),
      replacePreview: document.getElementById("btn-replace-preview"),
      replaceApply: document.getElementById("btn-replace-apply"),
      rootRenameHint: document.getElementById("root-rename-hint"),
      rootRenameMessage: document.getElementById("root-rename-message"),
      btnCreateRootTodo: document.getElementById("btn-create-root-todo"),
      generalActions: document.getElementById("general-actions"),
      workspace: document.getElementById("workspace-label"),
      workspaceMeta: document.getElementById("workspace-meta"),
      ignoreBlock: document.getElementById("ignore-block"),
      scopeBlock: document.getElementById("scope-block"),
      scopeHeaders: document.getElementById("scope-headers"),
      scopeSource: document.getElementById("scope-source"),
      scopeMd: document.getElementById("scope-md"),
      scopeMdWrap: document.getElementById("scope-md-wrap"),
      ignoreStatus: document.getElementById("ignore-status"),
      ignorePreset: document.getElementById("ignore-preset"),
      btnAppendPreset: document.getElementById("btn-append-preset"),
      btnRemovePreset: document.getElementById("btn-remove-preset"),
      btnOpenIgnore: document.getElementById("btn-open-ignore"),
      btnSyncIgnore: document.getElementById("btn-sync-ignore"),
      btnAnalyzeIgnore: document.getElementById("btn-analyze-ignore"),
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
      resultsTitle: document.getElementById("results-title"),
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

    function isHeaderAsciiTool() {
      return state.activeToolId === "headerAscii";
    }

    function isCodeRenameTool() {
      return state.activeToolId === "codeRename";
    }

    function isIgnoreTool() {
      return state.activeToolId === "ignoreSettings";
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
          els.empty.textContent = "所有文件均符合 UTF-8 目标（含 ASCII）。";
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
        els.btnAppendPreset.disabled = true;
        els.btnRemovePreset.disabled = true;
        els.btnAnalyzeIgnore.disabled = true;
        return;
      }
      const dirty = cfg.statusText.includes("未保存") ? " · 未保存" : "";
      els.ignoreStatus.textContent = cfg.relativePath + " · " + cfg.patternCount + " 条" + dirty;
      els.btnOpenIgnore.disabled = false;
      els.btnSyncIgnore.disabled = !cfg.gitIgnoreExists;
      els.btnAppendPreset.disabled = false;
      els.btnRemovePreset.disabled = false;
      els.btnAnalyzeIgnore.disabled = false;
    }

    function renderExtraRules() {
      els.multiRules.hidden = !state.replace.expanded;
      els.btnExpandRules.textContent = state.replace.expanded ? "收起关联规则" : "展开关联规则";
      els.replaceSourcePrefix.value = state.replace.sourcePrefix || "";
      els.replaceTargetPrefix.value = state.replace.targetPrefix || "";
      els.preserveCase.checked = !!state.replace.preserveCase;
      renderSearchReplaceProfiles();
      els.extraRules.innerHTML = "";
      state.replace.extraRules.forEach((rule, index) => {
        const row = document.createElement("div");
        row.className = "rule-row";
        const search = document.createElement("input");
        search.placeholder = "搜索";
        search.value = rule.search;
        search.title = rule.source === "generated" ? "自动生成；修改后转为自定义规则" : "自定义规则";
        const replace = document.createElement("input");
        replace.placeholder = "替换";
        replace.value = rule.replace;
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = rule.enabled !== false;
        enabled.title = "启用规则";
        const actions = document.createElement("div");
        actions.className = "rule-actions";
        const up = document.createElement("button");
        up.type = "button";
        up.textContent = "↑";
        up.title = "上移";
        up.disabled = index === 0;
        const down = document.createElement("button");
        down.type = "button";
        down.textContent = "↓";
        down.title = "下移";
        down.disabled = index === state.replace.extraRules.length - 1;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "×";
        remove.title = "删除规则";
        const addRelation = document.createElement("button");
        addRelation.type = "button";
        addRelation.textContent = "▾";
        addRelation.title = "添加一种关联规则";
        addRelation.setAttribute("aria-label", "添加一种关联规则");
        search.oninput = () => { rule.search = search.value; rule.source = "user"; rule.relationKind = "custom"; saveReplaceState(); };
        replace.oninput = () => { rule.replace = replace.value; rule.source = "user"; rule.relationKind = "custom"; saveReplaceState(); };
        search.onkeydown = stopTextInputEnter;
        replace.onkeydown = stopTextInputEnter;
        enabled.onchange = () => { rule.enabled = enabled.checked; saveReplaceState(); };
        up.onclick = () => { state.replace.extraRules.splice(index - 1, 0, state.replace.extraRules.splice(index, 1)[0]); saveReplaceState(); renderExtraRules(); };
        down.onclick = () => { state.replace.extraRules.splice(index + 1, 0, state.replace.extraRules.splice(index, 1)[0]); saveReplaceState(); renderExtraRules(); };
        remove.onclick = () => { state.replace.extraRules.splice(index, 1); saveReplaceState(); renderExtraRules(); };
        addRelation.onclick = () => {
          saveReplaceState();
          vscode.postMessage({
            type: "chooseAssociatedRule",
            toolId: "codeRename",
            parentRule: { ...rule },
            sourcePrefix: state.replace.sourcePrefix,
            targetPrefix: state.replace.targetPrefix,
            existingRules: state.replace.extraRules,
          });
        };
        actions.append(up, down, remove, addRelation);
        row.append(enabled, search, replace, actions);
        els.extraRules.appendChild(row);
      });
    }

    function renderSearchReplaceProfiles() {
      const selectedId = state.replace.profileId || "";
      els.replaceProfile.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = state.searchReplaceProfileError ? "规则档案不可用" : "规则档案…";
      els.replaceProfile.appendChild(placeholder);
      for (const profile of state.searchReplaceProfiles) {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = profile.label;
        els.replaceProfile.appendChild(option);
      }
      els.replaceProfile.value = state.searchReplaceProfiles.some((profile) => profile.id === selectedId)
        ? selectedId
        : "";
      els.replaceProfile.disabled = !!state.searchReplaceProfileError || state.searchReplaceProfiles.length === 0;
      els.replaceProfile.title = state.searchReplaceProfileError || "填入已保存的工作区规则";
    }

    function render() {
      const tool = activeTool();
      if (tool) {
        els.title.textContent = tool.title;
        els.desc.textContent = tool.description;
      }
      els.tabs.innerHTML = "";
      els.tabs.className = "tabs " + state.sidebarStyle;
      for (const t of state.tools) {
        const btn = document.createElement("button");
        btn.className = "tab" + (t.id === state.activeToolId ? " active" : "");
        btn.type = "button";
        btn.setAttribute("aria-pressed", t.id === state.activeToolId ? "true" : "false");
        if (t.icon && t.icon.includes(":")) {
          const icon = document.createElement("span");
          icon.className = "tool-icon";
          icon.style.setProperty("--tool-icon", 'url("' + t.icon.replace(/"/g, "") + '")');
          btn.appendChild(icon);
        }
        const label = document.createElement("span");
        label.textContent = t.title;
        btn.appendChild(label);
        btn.title = t.title;
        btn.onclick = () => vscode.postMessage({ type: "selectTool", toolId: t.id });
        els.tabs.appendChild(btn);
      }
      const ts = toolState();
      const running = ts.status === "running";
      const enc = isEncodingTool();
      const header = isHeaderAsciiTool();
      const rename = isCodeRenameTool();
      const ignore = isIgnoreTool();
      els.desc.hidden = ignore;
      els.replaceBlock.hidden = !rename;
      els.generalActions.hidden = rename || ignore;
      els.ignoreBlock.hidden = !ignore;
      els.btnScan.disabled = running;
      els.btnFix.disabled = running;
      els.btnScan.textContent = rename ? "打开主视图" : (ignore ? "打开规则" : "预检");
      els.btnFix.textContent = enc ? "转换" : (ignore ? "从 .gitignore 同步" : "修复");
      els.btnFix.style.display = rename ? "none" : "inline-block";

      els.targetHint.hidden = !enc;
      els.scopeBlock.hidden = rename || ignore;

      if (rename) {
        els.replaceSearch.value = state.replace.search;
        els.replaceWith.value = state.replace.with;
        els.replaceText.checked = state.replace.text;
        els.replaceFile.checked = state.replace.file;
        els.replaceDir.checked = state.replace.dir;
        els.replaceIgnored.checked = state.replace.ignored;
        els.replaceScope.value = state.replace.scope;
        renderExtraRules();
        els.replacePreview.disabled = running;
        els.replaceApply.disabled = running;
        updateReplaceButtons();
        const suggestion = ts.rootRenameSuggestion;
        els.rootRenameHint.hidden = !suggestion;
        if (suggestion) {
          els.rootRenameMessage.textContent = "工作区根目录不自动改名。请自行将“"
            + suggestion.currentName + "”改为“" + suggestion.suggestedName + "”。";
        }
      } else {
        els.rootRenameHint.hidden = true;
      }

      els.scopeHeaders.checked = !!state.scope.includeHeaders;
      els.scopeSource.checked = !!state.scope.includeSource;
      els.scopeMd.checked = !!state.scope.includeMarkdown;
      els.scopeMdWrap.className = enc ? "" : "disabled";
      els.scopeMd.disabled = !enc;

      renderIgnoreConfig();

      els.optionsPanel.hidden = rename || ignore;
      els.headerOptions.hidden = enc;
      els.encodingOptions.hidden = !enc;
      els.showDetailsWrap.hidden = true;
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
      els.status.hidden = ignore;
      els.resultsTitle.hidden = header || rename || ignore;
      els.results.hidden = header || rename || ignore;
      els.results.innerHTML = "";

      if (header || rename) {
        els.empty.style.display = "none";
      } else if (ignore) {
        els.empty.style.display = "none";
      } else if (enc) {
        renderEncodingResults(ts, !!state.showEncDetails);
      } else {
        renderHeaderResults(ts, !!state.showDetails);
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    els.btnScan.onclick = () => {
      if (isIgnoreTool()) vscode.postMessage({ type: "openIgnoreFile" });
      else vscode.postMessage({ type: "run", toolId: state.activeToolId, action: isCodeRenameTool() ? "open" : "scan" });
    };
    els.btnFix.onclick = () => {
      if (isIgnoreTool()) vscode.postMessage({ type: "syncIgnoreFromGit" });
      else vscode.postMessage({
        type: "run",
        toolId: state.activeToolId,
        action: isEncodingTool() ? "convert" : "fix",
      });
    };
    function saveReplaceState() {
      els.rootRenameHint.hidden = true;
      state.replace = {
        search: els.replaceSearch.value,
        with: els.replaceWith.value,
        text: els.replaceText.checked,
        file: els.replaceFile.checked,
        dir: els.replaceDir.checked,
        ignored: els.replaceIgnored.checked,
        scope: els.replaceScope.value,
        expanded: state.replace.expanded,
        sourcePrefix: els.replaceSourcePrefix.value,
        targetPrefix: els.replaceTargetPrefix.value,
        preserveCase: els.preserveCase.checked,
        extraRules: state.replace.extraRules,
        profileId: state.replace.profileId || "",
      };
      vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
      updateReplaceButtons();
    }
    function updateReplaceButtons() {
      const noLevel = !els.replaceText.checked && !els.replaceFile.checked && !els.replaceDir.checked;
      const rules = [{ search: els.replaceSearch.value, replace: els.replaceWith.value, enabled: true }, ...state.replace.extraRules]
        .filter((rule) => rule.enabled !== false && rule.search.length > 0);
      const emptySearch = rules.length === 0;
      const emptyPathReplacement = rules.some((rule) => rule.replace.length === 0) && (els.replaceFile.checked || els.replaceDir.checked);
      const invalid = toolState().status === "running" || noLevel || emptySearch || emptyPathReplacement;
      els.replacePreview.disabled = invalid;
      els.replaceApply.disabled = invalid;
    }
    function runSearchReplace(action) {
      saveReplaceState();
      const levels = [];
      if (state.replace.dir) levels.push("dir");
      if (state.replace.file) levels.push("file");
      if (state.replace.text) levels.push("text");
      const rules = [{ id: "primary", search: state.replace.search, replace: state.replace.with, enabled: true }, ...state.replace.extraRules]
        .filter((rule) => rule.enabled !== false && rule.search.length > 0);
      vscode.postMessage({
        type: "searchReplace",
        toolId: "codeRename",
        action,
        payload: {
          oldName: state.replace.search,
          newName: state.replace.with,
          rules,
          preserveCase: state.replace.preserveCase,
          levels,
          scope: state.replace.scope,
          includeIgnored: state.replace.ignored,
        },
      });
    }
    els.replacePreview.onclick = () => runSearchReplace("preview");
    els.replaceApply.onclick = () => runSearchReplace("apply");
    els.btnCreateRootTodo.onclick = () => {
      const suggestion = toolState().rootRenameSuggestion;
      if (!suggestion) return;
      vscode.postMessage({
        type: "createRootRenameTodo",
        toolId: "codeRename",
        currentName: suggestion.currentName,
        suggestedName: suggestion.suggestedName,
      });
    };
    els.btnExpandRules.onclick = () => {
      state.replace.expanded = !state.replace.expanded;
      saveReplaceState();
      renderExtraRules();
    };
    els.preserveCase.onchange = saveReplaceState;
    els.btnAddRule.onclick = () => {
      state.replace.extraRules.push({ id: "extra-" + Date.now(), search: "", replace: "", enabled: true, source: "user", relationKind: "custom" });
      saveReplaceState();
      renderExtraRules();
    };
    els.replaceProfile.onchange = () => {
      if (!els.replaceProfile.value) return;
      vscode.postMessage({
        type: "loadSearchReplaceProfile",
        toolId: "codeRename",
        id: els.replaceProfile.value,
      });
    };
    els.btnSaveProfile.onclick = () => {
      saveReplaceState();
      vscode.postMessage({
        type: "saveSearchReplaceProfile",
        toolId: "codeRename",
        draft: {
          search: state.replace.search,
          replace: state.replace.with,
          sourcePrefix: state.replace.sourcePrefix,
          targetPrefix: state.replace.targetPrefix,
          associatedRules: state.replace.extraRules,
          options: {
            preserveCase: state.replace.preserveCase,
            text: state.replace.text,
            file: state.replace.file,
            dir: state.replace.dir,
            includeIgnored: state.replace.ignored,
            scope: state.replace.scope,
          },
        },
      });
    };
    function generateAssociatedRules(preset) {
      saveReplaceState();
      vscode.postMessage({
        type: "deriveAssociatedRules",
        toolId: "codeRename",
        search: state.replace.search,
        replace: state.replace.with,
        sourcePrefix: state.replace.sourcePrefix,
        targetPrefix: state.replace.targetPrefix,
        preset,
        existingRules: state.replace.extraRules,
      });
    }
    els.btnCommonRules.onclick = () => generateAssociatedRules("common");
    els.btnCaaRules.onclick = () => {
      saveReplaceState();
      vscode.postMessage({
        type: "chooseCaaRules",
        toolId: "codeRename",
        search: state.replace.search,
        replace: state.replace.with,
        sourcePrefix: state.replace.sourcePrefix,
        targetPrefix: state.replace.targetPrefix,
        existingRules: state.replace.extraRules,
      });
    };
    function clearGeneratedRulesAndSave() {
      const retained = state.replace.extraRules.filter((rule) => rule.source !== "generated");
      const changed = retained.length !== state.replace.extraRules.length;
      state.replace.extraRules = retained;
      saveReplaceState();
      if (changed) renderExtraRules();
    }
    function stopTextInputEnter(event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
    }
    els.replaceSearch.oninput = clearGeneratedRulesAndSave;
    els.replaceWith.oninput = clearGeneratedRulesAndSave;
    els.replaceSourcePrefix.oninput = clearGeneratedRulesAndSave;
    els.replaceTargetPrefix.oninput = clearGeneratedRulesAndSave;
    els.replaceScope.oninput = saveReplaceState;
    for (const input of [els.replaceText, els.replaceFile, els.replaceDir, els.replaceIgnored]) {
      input.onchange = saveReplaceState;
    }
    for (const input of [els.replaceSearch, els.replaceWith, els.replaceScope, els.replaceSourcePrefix, els.replaceTargetPrefix]) {
      input.onkeydown = stopTextInputEnter;
    }
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
    els.btnAnalyzeIgnore.onclick = () => vscode.postMessage({ type: "analyzeIgnore" });
    els.btnAppendPreset.onclick = () => vscode.postMessage({
      type: "applyIgnorePreset", presetId: els.ignorePreset.value, action: "append",
    });
    els.btnRemovePreset.onclick = () => vscode.postMessage({
      type: "applyIgnorePreset", presetId: els.ignorePreset.value, action: "remove",
    });
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
      vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
      render();
    };
    els.encDetails.onchange = () => {
      state.showEncDetails = els.encDetails.checked;
      vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
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
        state.sidebarStyle = msg.sidebarStyle || "ribbon";
        state.searchReplaceProfiles = msg.searchReplaceProfiles || [];
        state.searchReplaceProfileError = msg.searchReplaceProfileError || "";
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
      } else if (msg.type === "sidebarStyle") {
        state.sidebarStyle = msg.style || "ribbon";
        render();
      } else if (msg.type === "searchReplaceProfiles") {
        state.searchReplaceProfiles = msg.profiles || [];
        state.searchReplaceProfileError = msg.error || "";
        if (msg.selectedProfile) {
          const profile = msg.selectedProfile;
          state.replace = {
            ...state.replace,
            search: profile.search,
            with: profile.replace,
            sourcePrefix: profile.sourcePrefix,
            targetPrefix: profile.targetPrefix,
            preserveCase: profile.options.preserveCase,
            text: profile.options.text,
            file: profile.options.file,
            dir: profile.options.dir,
            ignored: profile.options.includeIgnored,
            scope: profile.options.scope,
            extraRules: profile.associatedRules.map((rule) => ({ ...rule })),
            expanded: true,
            profileId: profile.id,
          };
          vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
        }
        render();
      } else if (msg.type === "state") {
        if (msg.toolId === "codeRename" && msg.state.associatedRules) {
          state.replace.extraRules = [...msg.state.associatedRules];
          vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
        }
        state.toolStates[msg.toolId] = msg.state;
        render();
      }
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

export function postToWebview(
  webviewView: vscode.WebviewView | undefined,
  message: WebviewOutboundMessage,
): void {
  void webviewView?.webview.postMessage(message);
}
