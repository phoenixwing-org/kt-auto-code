import type * as vscode from "vscode";
import type { ReorderFileResultSummary, ToolSummary, WebviewOutboundMessage } from "../tools/types.js";
import { ktcCreateWebviewSecurity } from "../webviewSupport.js";

export function ktcNextReorderSelection(
  previous: ReadonlySet<string>,
  currentRevision: number | undefined,
  next: { reorderResults?: readonly ReorderFileResultSummary[]; reorderRevision?: number; reorderSelectedUris?: readonly string[] },
): { selected: Set<string>; revision: number | undefined } {
  if (!Array.isArray(next.reorderResults)) return { selected: new Set(previous), revision: currentRevision };
  const pending = new Set(next.reorderResults.filter((row) => row.state === "pending").map((row) => row.uri));
  if (Array.isArray(next.reorderSelectedUris)) {
    return {
      selected: new Set(next.reorderSelectedUris.filter((uri) => pending.has(uri))),
      revision: next.reorderRevision,
    };
  }
  if (currentRevision === undefined || next.reorderRevision !== currentRevision) {
    return { selected: pending, revision: next.reorderRevision };
  }
  return {
    selected: new Set([...previous].filter((uri) => pending.has(uri))),
    revision: currentRevision,
  };
}

export function ktcSearchReplaceButtonState(input: {
  readonly running: boolean;
  readonly search: string;
  readonly replace: string;
  readonly text: boolean;
  readonly file: boolean;
  readonly dir: boolean;
  readonly extraRules: readonly { search: string; replace: string; enabled?: boolean }[];
}): { disabled: boolean; busy: boolean; message: string } {
  if (input.running) return { disabled: true, busy: true, message: "" };
  if (!input.text && !input.file && !input.dir) {
    return { disabled: true, busy: false, message: "请至少选择文本、文件名或文件夹名中的一项。" };
  }
  const activeRules = [
    { search: input.search, replace: input.replace, enabled: true },
    ...input.extraRules,
  ].filter((rule) => rule.enabled !== false && rule.search.length > 0);
  if (activeRules.length === 0) {
    return { disabled: true, busy: false, message: "请输入搜索内容，或添加一条已启用的关联规则。" };
  }
  if ((input.file || input.dir) && activeRules.some((rule) => rule.replace.length === 0)) {
    return { disabled: true, busy: false, message: "替换文件名或文件夹名时，替换内容不能为空。" };
  }
  return { disabled: false, busy: false, message: "" };
}

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
    body.ribbon-only .wrap { padding: 3px 10px 4px; }
    body.ribbon-only .wrap > :not(#tabs) { display: none; }
    body.ribbon-only .tabs { margin-bottom: 0; border-bottom: 0; padding: 1px 0 2px; }
    body.detail-block #tabs { display: none; }
    body.detail-block .wrap { padding-top: 7px; }
    body.detail-block .desc { display: none; }
    body.detail-block .meta { margin: 0 0 8px; }
    body.detail-block .reorder-block { margin: 0; padding: 0; border: 0; }
    body.detail-block .reorder-block h2,
    body.detail-block .reorder-summary { display: none; }
    body.detail-block .reorder-actions .action { flex: 1 1 0; }
    body.detail-block .reorder-block .status { margin: 6px 0 0; padding: 4px 6px; min-height: 0; font-size: 11px; }
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
      grid-template-columns: repeat(auto-fill, 54px);
      justify-content: start;
      gap: 3px;
      padding: 4px 0 9px;
    }
    .tab {
      position: relative;
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
    .tab[data-tooltip]::after {
      position: absolute;
      z-index: 20;
      top: calc(100% + 5px);
      left: 50%;
      width: max-content;
      max-width: min(240px, calc(100vw - 24px));
      padding: 4px 7px;
      border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border));
      border-radius: 3px;
      color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
      background: var(--vscode-editorHoverWidget-background, var(--vscode-sideBar-background));
      box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, .25));
      content: attr(data-tooltip);
      font-size: 11px;
      line-height: 1.35;
      opacity: 0;
      pointer-events: none;
      transform: translateX(-50%);
      transition: opacity .1s ease;
      white-space: nowrap;
    }
    .tab[data-tooltip]:hover::after,
    .tab[data-tooltip]:focus-visible::after { opacity: 1; }
    .tab.active {
      background: var(--vscode-button-secondaryBackground);
      border-color: var(--vscode-button-border);
    }
    .tab.open:not(.active) {
      color: var(--vscode-textLink-foreground);
      background: var(--vscode-list-inactiveSelectionBackground, var(--vscode-button-secondaryBackground));
      box-shadow: inset 0 -2px var(--vscode-textLink-foreground);
    }
    .tabs.ribbon .tab {
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      min-height: 50px;
      padding: 3px 2px 2px;
      gap: 2px;
      border-radius: 2px;
      line-height: 1.1;
      text-align: center;
      width: 54px;
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
    .tabs.ribbon .tool-icon { width: 22px; height: 22px; flex-basis: 22px; }
    .tabs.compact {
      display: grid;
      grid-template-columns: repeat(auto-fill, 42px);
      justify-content: start;
      align-items: start;
      gap: 2px;
    }
    .tabs.compact .tab {
      width: 42px;
      height: 38px;
      justify-content: center;
      padding: 5px;
    }
    .tabs.compact .tab > span:last-child { display: none; }
    .tabs.compact .tool-icon { width: 24px; height: 24px; flex: 0 0 24px; }
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
    .title-row { display: none; }
    .title-row h2 { margin-bottom: 6px; }
    .desc {
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .replace-block { margin: 10px 0 12px; }
    .reorder-block { margin: 10px 0 12px; padding: 9px; border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
    .reorder-summary { color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; margin: 6px 0; }
    .reorder-actions { display: flex; align-items: center; gap: 6px; }
    .reorder-options-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 7px 0 1px; }
    .reorder-filter { display: flex; align-items: center; gap: 5px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .reorder-groups { margin-top: 6px; }
    .reorder-group { border-top: 1px solid var(--vscode-panel-border); }
    .reorder-group-header { display: flex; align-items: center; gap: 5px; min-height: 29px; font-weight: 600; }
    .reorder-group-header .detail { margin-left: auto; font-weight: 400; }
    .reorder-list { list-style: none; padding: 0 0 0 18px; margin: 0; }
    .reorder-file-row { display: flex; align-items: center; gap: 5px; min-width: 0; min-height: 28px; padding: 2px 3px; }
    .reorder-file-row:hover { background: var(--vscode-list-hoverBackground); }
    .reorder-kind { flex: 0 0 18px; color: var(--vscode-symbolIcon-classForeground, var(--vscode-foreground)); font-weight: 600; font-size: 11px; }
    .reorder-file-main { display: flex; align-items: baseline; gap: 5px; min-width: 0; overflow: hidden; flex: 1 1 auto; cursor: pointer; }
    .reorder-file-name { flex: 0 0 auto; overflow: visible; text-overflow: clip; white-space: nowrap; }
    .reorder-file-dir { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .reorder-inline { display: flex; flex: 0 0 auto; opacity: 0; }
    .reorder-file-row:hover .reorder-inline, .reorder-inline:focus-within { opacity: 1; }
    .reorder-icon { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; font-size: 16px; line-height: 24px; }
    .reorder-icon:hover { background: var(--vscode-toolbar-hoverBackground); }
    .reorder-state { flex: 0 0 14px; width: 14px; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; text-align: right; white-space: nowrap; }
    .reorder-state.pending { color: var(--vscode-gitDecoration-modifiedResourceForeground, var(--vscode-descriptionForeground)); }
    .reorder-state.blocked { color: var(--vscode-errorForeground); }
    .reorder-state.applied { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
    .compact-tools { display: flex; justify-content: flex-end; gap: 8px; margin: -4px 0 8px; }
    .uuid-options {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 5px 8px;
      margin: -2px 0 8px;
      font-size: 12px;
    }
    .uuid-options select {
      min-width: 0;
      height: 28px;
      padding: 0 6px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    .uuid-options .hint { grid-column: 1 / -1; margin: 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .uuid-options .hint.warning { color: var(--vscode-editorWarning-foreground); }
    .caa-connection { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .caa-connection.online { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
    .caa-connection.offline, .caa-connection.incompatible { color: var(--vscode-errorForeground); }
    .compact-results { margin-top: 4px; }
    .compact-group { border-top: 1px solid var(--vscode-panel-border); }
    .compact-group:first-child { border-top: 0; }
    .compact-group-header { display: flex; align-items: center; gap: 5px; min-height: 29px; font-weight: 600; }
    .compact-group-header .detail { margin-left: auto; font-weight: 400; }
    .compact-list { list-style: none; padding: 0 0 0 18px; margin: 0; }
    .compact-file-row { display: flex; align-items: center; gap: 5px; min-width: 0; min-height: 28px; padding: 2px 3px; }
    .compact-file-row:hover { background: var(--vscode-list-hoverBackground); }
    .compact-kind { flex: 0 0 22px; color: var(--vscode-symbolIcon-classForeground, var(--vscode-foreground)); font-weight: 600; font-size: 10px; text-align: center; }
    .compact-file-main { display: flex; align-items: baseline; gap: 5px; min-width: 0; overflow: hidden; flex: 1 1 auto; cursor: pointer; }
    .compact-file-name { flex: 0 0 auto; overflow: visible; text-overflow: clip; white-space: nowrap; }
    .compact-file-dir { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .compact-inline { display: flex; flex: 0 0 auto; opacity: 0; }
    .compact-file-row:hover .compact-inline, .compact-inline:focus-within { opacity: 1; }
    .compact-icon { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; font-size: 15px; line-height: 24px; }
    .compact-icon:hover { background: var(--vscode-toolbar-hoverBackground); }
    .compact-state { flex: 0 0 auto; max-width: 86px; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .compact-state.error, .compact-state.blocked { color: var(--vscode-errorForeground); }
    .compact-state.applied, .compact-state.ok { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
    .compact-subtext { padding: 1px 4px 5px 49px; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.35; }
    .compact-rules { margin: 0; padding: 0 4px 6px 49px; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.45; }
    mark.result-hit { padding: 0 1px; color: inherit; background: var(--vscode-editor-findMatchBackground, rgba(234, 201, 58, .5)); outline: 1px solid var(--vscode-editor-findMatchBorder, transparent); border-radius: 1px; }
    .environment-block { margin: 10px 0 12px; }
    .environment-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; margin-bottom: 9px; }
    .environment-values { border-top: 1px solid var(--vscode-panel-border); }
    .environment-row { padding: 8px 2px; border-bottom: 1px solid var(--vscode-panel-border); }
    .environment-row-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .environment-name { font-family: var(--vscode-editor-font-family); font-weight: 600; }
    .environment-required { color: var(--vscode-errorForeground); font-size: 10px; }
    .environment-source { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .environment-source.ready { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
    .environment-value { display: block; width: 100%; min-width: 0; height: 28px; overflow: hidden; padding: 4px 6px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); outline: none; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font-family: var(--vscode-editor-font-family); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .environment-value:focus { border-color: var(--vscode-focusBorder); }
    .environment-value.missing { color: var(--vscode-descriptionForeground); font-style: italic; }
    .environment-row-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 5px; }
    .environment-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.35; }
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
    .working-directory { grid-template-columns: minmax(0, 1fr) 30px; }
    .working-directory input { min-width: 0; }
    .folder-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      background: var(--vscode-button-secondaryBackground, transparent);
      cursor: pointer;
    }
    .folder-button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); }
    .folder-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .replace-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 0 0 9px; }
    .action-tooltip { display: block; min-width: 0; }
    .action-tooltip .action { width: 100%; height: 100%; }
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
    .text-button:disabled { opacity: 0.45; cursor: default; }
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
    .profile-save-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; margin-bottom: 7px; }
    .profile-save-row input {
      min-width: 0;
      height: 28px;
      padding: 3px 7px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
    }
    .profile-save-row button { white-space: nowrap; }
    .prefix-fields { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; }
    .prefix-arrow { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .rule-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr) 82px; gap: 4px; align-items: center; margin-bottom: 5px; }
    .rule-row input { min-width: 0; height: 27px; padding: 3px 6px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font-family: var(--vscode-editor-font-family); }
    .rule-actions { display: flex; }
    .rule-row button { width: 20px; padding: 0; border: 0; color: var(--vscode-foreground); background: transparent; cursor: pointer; font-size: 13px; }
    .rule-row button:hover { background: var(--vscode-list-hoverBackground); }
    .rule-row button:disabled { opacity: 0.45; cursor: default; }
    .rule-tools { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-top: 6px; }
    .rule-picker-dialog {
      width: min(430px, calc(100vw - 20px));
      max-height: calc(100vh - 24px);
      padding: 0;
      border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
      border-radius: 4px;
      color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
      background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
      box-shadow: 0 8px 24px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.35));
    }
    .rule-picker-dialog::backdrop { background: rgba(0, 0, 0, 0.38); }
    .rule-picker-shell { display: flex; flex-direction: column; max-height: calc(100vh - 26px); }
    .rule-picker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 38px;
      padding: 6px 10px 6px 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .rule-picker-header strong { font-size: 12px; font-weight: 600; }
    .rule-picker-close {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
      font-size: 17px;
    }
    .rule-picker-close:hover { background: var(--vscode-toolbar-hoverBackground); }
    .rule-picker-list { overflow: auto; padding: 6px 12px 2px; }
    .rule-picker-empty { margin: 7px 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .rule-picker-row {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 7px;
      align-items: start;
      padding: 7px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .rule-picker-row > input[type="checkbox"] { margin-top: 3px; }
    .rule-picker-label { margin-bottom: 4px; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .rule-picker-values {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: 5px;
      align-items: center;
    }
    .rule-picker-values code {
      overflow: hidden;
      padding: 3px 5px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-textCodeBlock-background);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rule-picker-values input {
      min-width: 0;
      height: 27px;
      padding: 3px 6px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 2px;
      outline: none;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font-family: var(--vscode-editor-font-family);
    }
    .rule-picker-values input:focus { border-color: var(--vscode-focusBorder); }
    .rule-picker-footer {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    @media (max-width: 320px) {
      .profile-row, .prefix-fields { grid-template-columns: minmax(0, 1fr); }
      .profile-row button { justify-self: start; }
      .prefix-arrow { display: none; }
      .rule-row { grid-template-columns: 18px minmax(0, 1fr) 82px; }
      .rule-row > input[type="checkbox"] { grid-row: 1 / span 2; }
      .rule-row > input:not([type="checkbox"]) { grid-column: 2; }
      .rule-actions { grid-column: 3; grid-row: 1 / span 2; }
      .rule-picker-values { grid-template-columns: minmax(0, 1fr); }
      .rule-picker-values .prefix-arrow { display: none; }
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
    #ignore-block .ignore-primary .action { flex: 1 1 0; }
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
    button.action:not(:disabled):hover { background: var(--vscode-button-hoverBackground); }
    button.action.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.action.secondary:not(:disabled):hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.action:disabled { opacity: 0.5; cursor: not-allowed; }
    body.task-running button.action:disabled { cursor: progress; }
    .inline-validation { margin: -4px 0 8px; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.35; }
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
    .workspace-file-scope {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
      margin: -4px 0 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .workspace-file-scope select {
      min-width: 0;
      height: 28px;
      padding: 0 6px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    .workspace-file-scope .scope-error { grid-column: 2 / -1; color: var(--vscode-errorForeground); }
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
    <div class="title-row">
      <h2 id="tool-title">KT Auto Code</h2>
    </div>
    <p class="desc" id="tool-desc"></p>
    <p class="meta" id="workspace-meta">工作区：<strong id="workspace-label">—</strong></p>
    <div class="workspace-file-scope" id="workspace-file-scope" hidden>
      <label for="workspace-file-scope-select" id="workspace-file-scope-label">扫描范围</label>
      <select id="workspace-file-scope-select" aria-label="工作区文件范围"></select>
      <button class="text-button" id="btn-open-worksets" type="button" title="编辑 .phoenix/worksets.json">工作集…</button>
      <span class="scope-error" id="workspace-file-scope-error" hidden></span>
    </div>
    <div class="actions" id="general-actions">
      <button class="action secondary" id="btn-scan">预检</button>
      <button class="action" id="btn-fix">修复</button>
    </div>
    <div class="uuid-options" id="uuid-options" hidden>
      <label for="uuid-strategy">生成策略</label>
      <select id="uuid-strategy" aria-label="UUID 生成策略">
        <option value="map_per_value">同值同替换（推荐）</option>
        <option value="fresh_per_hit">每处独立新值</option>
      </select>
      <p class="hint" id="uuid-strategy-hint">相同旧 UUID 在所有文件中替换为同一个新 UUID；策略在扫描时固定。</p>
    </div>
    <div class="compact-tools" id="compact-tools" hidden>
      <button class="text-button" id="btn-caa-check-connection" type="button" hidden>检测 Desk Tools</button>
      <button class="text-button" id="btn-add-results-workset" type="button">加入工作集</button>
    </div>
    <section class="environment-block" id="environment-block" hidden>
      <div class="environment-actions">
        <button class="action" id="btn-environment-refresh" type="button">刷新系统值</button>
        <button class="action secondary" id="btn-environment-system" type="button">系统环境变量</button>
      </div>
      <div class="environment-values" id="environment-values"></div>
      <div class="environment-footer">
        <span>修改当前用户环境；不会改机器级变量。其他应用需重启后继承新值。</span>
        <button class="text-button" id="btn-environment-plugin-settings" type="button">插件设置</button>
      </div>
    </section>
    <section class="replace-block" id="replace-block" hidden>
      <div class="replace-actions">
        <span class="action-tooltip" id="replace-preview-tooltip">
          <button class="action secondary" id="btn-replace-preview" type="button" aria-describedby="replace-validation">预览</button>
        </span>
        <span class="action-tooltip" id="replace-apply-tooltip">
          <button class="action" id="btn-replace-apply" type="button" aria-describedby="replace-validation">替换</button>
        </span>
      </div>
      <p class="inline-validation" id="replace-validation" role="status"></p>
      <div class="replace-fields">
        <input id="replace-search" type="text" spellcheck="false" placeholder="搜索" aria-label="搜索内容" />
        <input id="replace-with" type="text" spellcheck="false" placeholder="替换" aria-label="替换内容" />
      </div>
      <div class="replace-options">
        <label><input id="replace-text" type="checkbox" checked />文本</label>
        <label><input id="replace-file" type="checkbox" />文件名</label>
        <label><input id="replace-dir" type="checkbox" />文件夹名</label>
        <label><input id="replace-ignored" type="checkbox" />包含 Ignore</label>
        <label title="仅原文件为 ASCII 且目标含非 ASCII 字符时使用">
          默认编码
          <select id="replace-default-encoding" aria-label="ASCII 文件目标默认编码">
            <option value="utf8">UTF-8</option>
            <option value="gbk">GBK（本地）</option>
          </select>
        </label>
        <label class="disabled" title="自动匹配大小写待后续测试开放">
          <input id="replace-preserve-case" type="checkbox" disabled />自动匹配大小写（待测试开放）
        </label>
      </div>
      <div class="replace-fields replace-scope working-directory">
        <input id="replace-scope" type="text" list="recent-working-directories" spellcheck="false" placeholder="工作目录（留空为当前工作区）" aria-label="搜索替换工作目录" title="可填相对路径或任意绝对目录；留空使用当前工作区" />
        <datalist id="recent-working-directories"></datalist>
        <button class="folder-button" id="btn-pick-working-directory" type="button" title="选择工作目录" aria-label="选择工作目录">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.82 1.2A2 2 0 0 0 12.1 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/><path d="M2 10h20"/></svg>
        </button>
      </div>
      <div class="replace-more-bar">
        <button class="text-button" id="btn-expand-rules" type="button">展开关联规则</button>
      </div>
      <div class="multi-rules" id="multi-rules" hidden>
        <div class="profile-row">
          <select id="replace-profile" aria-label="工作区规则档案">
            <option value="">规则档案…</option>
          </select>
        </div>
        <div class="profile-save-row">
          <input id="replace-profile-name" type="text" spellcheck="false" placeholder="规则档案名称" aria-label="规则档案名称" />
          <button class="text-button" id="btn-save-profile" type="button" title="保存到当前工作区；同名时直接更新">保存规则</button>
        </div>
        <div class="replace-fields prefix-fields" style="margin-bottom:7px">
          <input id="replace-source-prefix" type="text" spellcheck="false" placeholder="源前缀，如 KTC" aria-label="源名称前缀" />
          <span class="prefix-arrow">→</span>
          <input id="replace-target-prefix" type="text" spellcheck="false" placeholder="目标前缀，如 KTM" aria-label="目标名称前缀" />
        </div>
        <div id="extra-rules"></div>
        <div class="rule-tools">
          <button class="text-button" id="btn-add-rule" type="button">+ 自定义规则</button>
          <button class="text-button" id="btn-common-rules" type="button">常用规则</button>
          <button class="text-button" id="btn-caa-rules" type="button">CAA 规则</button>
        </div>
      </div>
      <p class="root-rename-hint" id="root-rename-hint" hidden>
        <span id="root-rename-message"></span><button class="text-button" id="btn-create-root-todo" type="button">创建 TODO</button>
      </p>
    </section>
    <section class="reorder-block" id="reorder-block" hidden>
      <h2>C++ 成员排序</h2>
      <p class="reorder-summary">扫描、预览、勾选并确认写回；结果保留在当前 Block。</p>
      <div class="reorder-actions">
        <button class="action" id="btn-reorder-preview" type="button">扫描</button>
        <button class="action secondary" id="btn-reorder-apply" type="button" disabled>应用所选</button>
      </div>
      <div class="reorder-options-row">
        <label class="reorder-filter"><input id="reorder-show-unchanged" type="checkbox" />显示无变更文件</label>
        <button class="text-button" id="btn-reorder-workset" type="button">加入工作集</button>
      </div>
      <p class="status" id="reorder-status"></p>
      <div class="reorder-groups" id="reorder-groups" hidden></div>
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
      <div class="actions ignore-primary">
        <button class="action secondary" id="btn-analyze-ignore" type="button">分析当前工作区</button>
        <button class="action" id="btn-apply-ignore-recommendations" type="button" hidden>追加所选推荐</button>
      </div>
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
    <p class="status" id="status"></p>
    <div class="results-title" id="results-title">预检结果</div>
    <div class="results compact-results" id="results"></div>
    <p class="empty" id="empty-hint">点击「预检」查看头文件中的问题字节。</p>
  </div>
  <dialog class="rule-picker-dialog" id="rule-picker" aria-labelledby="rule-picker-title">
    <div class="rule-picker-shell">
      <div class="rule-picker-header">
        <strong id="rule-picker-title">添加关联规则</strong>
        <button class="rule-picker-close" id="rule-picker-close" type="button" title="关闭" aria-label="关闭">×</button>
      </div>
      <div class="rule-picker-list" id="rule-picker-list"></div>
      <div class="rule-picker-footer">
        <button class="action secondary" id="rule-picker-cancel" type="button">取消</button>
        <button class="action" id="rule-picker-confirm" type="button">添加</button>
      </div>
    </div>
  </dialog>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const saved = vscode.getState() || {};
    const savedReplace = saved.replace || {};
    const legacyPrefix = savedReplace.prefix || "";
    let state = {
      tools: [],
      activeToolId: "",
      openToolIds: [],
      toolStates: {},
      toolOptions: {},
      scope: { includeHeaders: true, includeSource: true, includeMarkdown: true },
      ignoreConfig: null,
      showDetails: !!saved.showDetails,
      showEncDetails: !!saved.showEncDetails,
      sidebarStyle: "ribbon",
      presentation: "ribbon",
      recentWorkingDirectories: { workspace: [], external: [] },
      searchReplaceProfiles: [],
      searchReplaceProfileError: "",
      workspaceFileScopes: [],
      selectedWorkspaceFileScopes: {},
      workspaceFileScopeError: "",
      uuidStrategy: saved.uuidStrategy === "fresh_per_hit" ? "fresh_per_hit" : "map_per_value",
      replace: Object.assign({ search: "", with: "", text: true, file: false, dir: false, ignored: false, scope: "", expanded: false, sourcePrefix: legacyPrefix, targetPrefix: legacyPrefix, defaultEncoding: "utf8", preserveCase: false, extraRules: [], profileId: "", profileLabel: "" }, savedReplace),
    };
    state.replace.extraRules = (state.replace.extraRules || []).filter((rule) => (
      (rule.search || "").trim() || (rule.replace || "").trim()
    ));
    state.replace.defaultEncoding = state.replace.defaultEncoding === "gbk" ? "gbk" : "utf8";
    state.replace.preserveCase = false;
    let activeRulePicker = null;

    const els = {
      tabs: document.getElementById("tabs"),
      title: document.getElementById("tool-title"),
      desc: document.getElementById("tool-desc"),
      replaceBlock: document.getElementById("replace-block"),
      reorderBlock: document.getElementById("reorder-block"),
      btnReorderPreview: document.getElementById("btn-reorder-preview"),
      btnReorderApply: document.getElementById("btn-reorder-apply"),
      reorderShowUnchanged: document.getElementById("reorder-show-unchanged"),
      btnReorderWorkset: document.getElementById("btn-reorder-workset"),
      reorderStatus: document.getElementById("reorder-status"),
      reorderGroups: document.getElementById("reorder-groups"),
      replaceSearch: document.getElementById("replace-search"),
      replaceWith: document.getElementById("replace-with"),
      replaceText: document.getElementById("replace-text"),
      replaceFile: document.getElementById("replace-file"),
      replaceDir: document.getElementById("replace-dir"),
      replaceIgnored: document.getElementById("replace-ignored"),
      replaceScope: document.getElementById("replace-scope"),
      recentWorkingDirectories: document.getElementById("recent-working-directories"),
      btnPickWorkingDirectory: document.getElementById("btn-pick-working-directory"),
      btnExpandRules: document.getElementById("btn-expand-rules"),
      multiRules: document.getElementById("multi-rules"),
      replaceProfile: document.getElementById("replace-profile"),
      replaceProfileName: document.getElementById("replace-profile-name"),
      btnSaveProfile: document.getElementById("btn-save-profile"),
      replaceSourcePrefix: document.getElementById("replace-source-prefix"),
      replaceTargetPrefix: document.getElementById("replace-target-prefix"),
      defaultEncoding: document.getElementById("replace-default-encoding"),
      preserveCase: document.getElementById("replace-preserve-case"),
      extraRules: document.getElementById("extra-rules"),
      btnAddRule: document.getElementById("btn-add-rule"),
      btnCommonRules: document.getElementById("btn-common-rules"),
      btnCaaRules: document.getElementById("btn-caa-rules"),
      rulePicker: document.getElementById("rule-picker"),
      rulePickerTitle: document.getElementById("rule-picker-title"),
      rulePickerList: document.getElementById("rule-picker-list"),
      rulePickerClose: document.getElementById("rule-picker-close"),
      rulePickerCancel: document.getElementById("rule-picker-cancel"),
      rulePickerConfirm: document.getElementById("rule-picker-confirm"),
      replacePreview: document.getElementById("btn-replace-preview"),
      replaceApply: document.getElementById("btn-replace-apply"),
      replacePreviewTooltip: document.getElementById("replace-preview-tooltip"),
      replaceApplyTooltip: document.getElementById("replace-apply-tooltip"),
      replaceValidation: document.getElementById("replace-validation"),
      rootRenameHint: document.getElementById("root-rename-hint"),
      rootRenameMessage: document.getElementById("root-rename-message"),
      btnCreateRootTodo: document.getElementById("btn-create-root-todo"),
      generalActions: document.getElementById("general-actions"),
      compactTools: document.getElementById("compact-tools"),
      uuidOptions: document.getElementById("uuid-options"),
      uuidStrategy: document.getElementById("uuid-strategy"),
      uuidStrategyHint: document.getElementById("uuid-strategy-hint"),
      btnCaaCheckConnection: document.getElementById("btn-caa-check-connection"),
      btnAddResultsWorkset: document.getElementById("btn-add-results-workset"),
      environmentBlock: document.getElementById("environment-block"),
      environmentValues: document.getElementById("environment-values"),
      btnEnvironmentRefresh: document.getElementById("btn-environment-refresh"),
      btnEnvironmentSystem: document.getElementById("btn-environment-system"),
      btnEnvironmentPluginSettings: document.getElementById("btn-environment-plugin-settings"),
      workspace: document.getElementById("workspace-label"),
      workspaceMeta: document.getElementById("workspace-meta"),
      workspaceFileScope: document.getElementById("workspace-file-scope"),
      workspaceFileScopeLabel: document.getElementById("workspace-file-scope-label"),
      workspaceFileScopeSelect: document.getElementById("workspace-file-scope-select"),
      workspaceFileScopeError: document.getElementById("workspace-file-scope-error"),
      btnOpenWorksets: document.getElementById("btn-open-worksets"),
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
      btnApplyIgnoreRecommendations: document.getElementById("btn-apply-ignore-recommendations"),
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

    function isReorderMembersTool() {
      return state.activeToolId === "reorderMembers";
    }

    function isIgnoreTool() {
      return state.activeToolId === "ignoreSettings";
    }

    function isUuidTool() {
      return state.activeToolId === "uuidReplace";
    }

    function isCaaDialogTool() {
      return state.activeToolId === "caaDialog";
    }

    function isEnvironmentTool() {
      return state.activeToolId === "environmentSettings";
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

    function resultPathParts(value) {
      const normalized = String(value || "").replace(/\\\\/g, "/").replace(/^\\.\\//, "");
      const index = normalized.lastIndexOf("/");
      return index < 0
        ? { name: normalized, directory: "" }
        : { name: normalized.slice(index + 1), directory: normalized.slice(0, index) };
    }

    function resultKind(path, explicit) {
      if (explicit) return explicit;
      const lower = String(path || "").toLowerCase();
      if (/\\.(h|hpp|hh|hxx)$/.test(lower)) return "C";
      if (/\\.(c|cc|cpp|cxx)$/.test(lower)) return "C++";
      if (/\\.catdlg$/.test(lower)) return "<>";
      if (/\\.md$/.test(lower)) return "M";
      return "·";
    }

    function highlightRanges(label, terms, nonAscii) {
      const ranges = [];
      if (nonAscii) {
        for (let index = 0; index < label.length; index += 1) {
          if (label.charCodeAt(index) > 127) ranges.push([index, index + 1]);
        }
      }
      const haystack = label.toLocaleLowerCase();
      for (const raw of terms || []) {
        const term = String(raw || "");
        if (!term) continue;
        const needle = term.toLocaleLowerCase();
        let start = 0;
        while ((start = haystack.indexOf(needle, start)) >= 0) {
          ranges.push([start, start + term.length]);
          start += Math.max(1, term.length);
        }
      }
      ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      const merged = [];
      for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push(range.slice());
      }
      return merged;
    }

    function appendHighlightedText(target, label, terms, nonAscii) {
      const ranges = highlightRanges(label, terms, nonAscii);
      let cursor = 0;
      for (const range of ranges) {
        if (range[0] > cursor) target.appendChild(document.createTextNode(label.slice(cursor, range[0])));
        const mark = document.createElement("mark");
        mark.className = "result-hit";
        mark.textContent = label.slice(range[0], range[1]);
        target.appendChild(mark);
        cursor = range[1];
      }
      if (cursor < label.length) target.appendChild(document.createTextNode(label.slice(cursor)));
    }

    function createCompactIcon(text, title, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "compact-icon";
      button.textContent = text;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.onclick = (event) => { event.stopPropagation(); onClick(); };
      return button;
    }

    function createCompactRow(config) {
      const item = document.createElement("div");
      item.className = "compact-file-row";
      if (config.checkbox) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !!config.checkbox.checked;
        checkbox.disabled = !!config.checkbox.disabled;
        checkbox.setAttribute("aria-label", config.checkbox.label || ("选择 " + config.path));
        checkbox.onchange = () => config.checkbox.onChange(checkbox.checked);
        item.appendChild(checkbox);
      }
      const kind = document.createElement("span");
      kind.className = "compact-kind";
      kind.textContent = resultKind(config.path, config.kind);
      const parts = resultPathParts(config.path);
      const main = document.createElement("span");
      main.className = "compact-file-main";
      main.title = config.title || config.path;
      const name = document.createElement("span");
      name.className = "compact-file-name";
      appendHighlightedText(name, config.name || parts.name, config.highlightTerms, config.highlightNonAscii);
      const directory = document.createElement("span");
      directory.className = "compact-file-dir";
      directory.textContent = config.directory === undefined ? parts.directory : config.directory;
      main.append(name, directory);
      if (config.onOpen) main.onclick = config.onOpen;
      const actions = document.createElement("span");
      actions.className = "compact-inline";
      for (const action of config.actions || []) actions.appendChild(createCompactIcon(action.text, action.title, action.onClick));
      const status = document.createElement("span");
      status.className = "compact-state " + (config.statusClass || "");
      status.textContent = config.status || "";
      status.title = config.statusTitle || config.status || "";
      item.append(kind, main, actions, status);
      return item;
    }

    function createCompactGroup(title, detail, rows, checkbox) {
      const group = document.createElement("section");
      group.className = "compact-group";
      const header = document.createElement("div");
      header.className = "compact-group-header";
      if (checkbox) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!checkbox.checked;
        input.indeterminate = !!checkbox.indeterminate;
        input.disabled = !!checkbox.disabled;
        input.setAttribute("aria-label", checkbox.label || ("选择 " + title));
        input.onchange = () => checkbox.onChange(input.checked);
        header.appendChild(input);
      }
      const label = document.createElement("span");
      label.textContent = title;
      const description = document.createElement("span");
      description.className = "detail";
      description.textContent = detail || "";
      header.append(label, description);
      const list = document.createElement("div");
      list.className = "compact-list";
      for (const row of rows) list.appendChild(row);
      group.append(header, list);
      return group;
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
        const open = () => vscode.postMessage({ type: "openIssue", toolId: state.activeToolId, file: item.fullPath, line: item.topLine });
        const row = createCompactRow({
          path: item.relativePath || item.file,
          highlightNonAscii: true,
          status: "L" + item.topLine + " ×" + item.issueCount,
          statusClass: "error",
          onOpen: open,
          actions: [{ text: "↗", title: "打开并定位", onClick: open }],
          title: item.fullPath,
        });
        const block = document.createElement("div");
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
      const rows = items.map((item) => {
        const open = () => vscode.postMessage({ type: "openEncodingFile", toolId: state.activeToolId, file: item.fullPath });
        const row = createCompactRow({
          path: item.relativePath,
          status: item.suggestedAction === "—" ? "✓" : item.suggestedAction,
          statusClass: item.status === "ok" ? "ok" : (item.status === "unsupported" ? "" : "error"),
          statusTitle: item.detected + " → " + item.expected,
          onOpen: open,
          actions: [{ text: "↗", title: "打开文件", onClick: open }],
          title: item.fullPath + "\\n" + item.detected + " → " + item.expected,
        });

        if (showEncDetails && item.detail) {
          const det = document.createElement("div");
          det.className = "compact-subtext";
          det.textContent = item.detail;
          const wrapper = document.createElement("div");
          wrapper.append(row, det);
          return wrapper;
        }
        return row;
      });
      els.results.appendChild(createCompactGroup("文件", items.length + " 个", rows));
    }

    function renderCodeRenameResults(ts) {
      const model = ts.codeRenameResults;
      if (!model) { els.empty.style.display = "block"; els.empty.textContent = "填写规则后点击“预览”。"; return; }
      els.empty.style.display = model.rows.length ? "none" : "block";
      if (!model.rows.length) { els.empty.textContent = "没有匹配结果。"; return; }
      const rows = model.rows.map((item) => {
        const path = item.sourceAddress && item.sourceAddress !== "." ? item.sourceAddress + "/" + item.sourceName : item.sourceName;
        const open = () => vscode.postMessage({ type: "codeRenameAction", toolId: "codeRename", action: "open", rowId: item.id });
        return createCompactRow({
          path,
          name: item.sourceName,
          directory: item.sourceAddress === "." ? "" : item.sourceAddress,
          kind: ({ text: "T", file: "F", dir: "D" })[item.level],
          highlightTerms: item.sourceHighlightTerms,
          status: item.statusLabel,
          statusClass: item.statusLabel === "错误" ? "error" : (item.statusLabel === "已替换" ? "applied" : ""),
          statusTitle: item.occurrences + " 处 · " + item.targetOrPositionLabel + (item.encodingLabel ? " · " + item.encodingLabel : ""),
          onOpen: open,
          actions: [{ text: "↗", title: "打开并定位", onClick: open }],
          title: item.originalFullPath + "\\n" + item.targetOrPositionLabel + (item.detail ? "\\n" + item.detail : ""),
        });
      });
      const summary = model.summary;
      const detail = summary.replacements + " 处替换 · " + summary.errors + " 错误";
      els.results.appendChild(createCompactGroup((model.applied ? "已替换" : "预览") + " · " + rows.length + " 项", detail, rows));
    }

    function renderIgnoreResults(ts) {
      const report = ts.ignoreRecommendations;
      const selected = new Set(ts.ignoreSelectedGroupIds || []);
      els.btnApplyIgnoreRecommendations.hidden = !report;
      els.btnApplyIgnoreRecommendations.disabled = ts.status === "running" || selected.size === 0;
      els.btnApplyIgnoreRecommendations.textContent = selected.size ? "追加所选推荐（" + selected.size + "）" : "追加所选推荐";
      if (!report) { els.empty.style.display = "block"; els.empty.textContent = "点击“分析当前工作区”生成推荐。"; return; }
      if (!report.recommendations.length) { els.empty.style.display = "block"; els.empty.textContent = "没有可追加的推荐规则。"; return; }
      els.empty.style.display = "none";
      for (const group of report.recommendations) {
        const selectable = group.suggestedRules.length > 0;
        const headerRow = document.createElement("div");
        headerRow.className = "compact-subtext";
        headerRow.textContent = group.description;
        const rules = document.createElement("div");
        rules.className = "compact-rules";
        const parts = [];
        if (group.suggestedRules.length) parts.push("建议：" + group.suggestedRules.map((rule) => rule.value).join("，"));
        if (group.existingRules.length) parts.push("已有 " + group.existingRules.length + " 条");
        if (group.blockedRules.length) parts.push("有跟踪文件，阻止 " + group.blockedRules.length + " 条");
        rules.textContent = parts.join(" · ");
        const wrapper = document.createElement("div");
        wrapper.append(headerRow, rules);
        const checkbox = selectable ? {
          checked: selected.has(group.groupId), disabled: ts.status === "running", label: "选择 " + group.title,
          onChange: (checked) => {
            if (checked) selected.add(group.groupId); else selected.delete(group.groupId);
            vscode.postMessage({ type: "ignoreSelection", toolId: "ignoreSettings", groupIds: [...selected] });
            ts.ignoreSelectedGroupIds = [...selected];
            els.results.innerHTML = "";
            renderIgnoreResults(ts);
          },
        } : undefined;
        els.results.appendChild(createCompactGroup(group.title, group.confidence + (group.reviewRequired ? " · 需复核" : ""), [wrapper], checkbox));
      }
    }

    function uuidStateLabel(value) {
      return ({ pending: "待写盘", applied: "已写盘", blocked: "未写入", cancelled: "已移除" })[value] || value;
    }

    function renderUuidResults(ts) {
      const source = Array.isArray(ts.uuidResults) ? ts.uuidResults : null;
      const rows = (source || []).filter((row) => row.state !== "cancelled");
      const selected = new Set(ts.uuidSelectedUris || []);
      if (!source) { els.empty.style.display = "block"; els.empty.textContent = "点击“扫描 UUID”生成固定映射。"; return; }
      if (!rows.length) { els.empty.style.display = "block"; els.empty.textContent = "没有 UUID 候选。"; return; }
      els.empty.style.display = "none";
      const postSelection = () => vscode.postMessage({ type: "uuidSelection", toolId: "uuidReplace", uris: [...selected] });
      const createRows = (items, selectable) => items.map((item) => {
        const open = () => vscode.postMessage({ type: "uuidAction", toolId: "uuidReplace", action: "open", uris: [item.uri] });
        const actions = [];
        if (item.state === "pending" && ts.status !== "running") actions.push(
          { text: "✓", title: "应用此文件", onClick: () => vscode.postMessage({ type: "uuidAction", toolId: "uuidReplace", action: "apply", uris: [item.uri] }) },
          { text: "×", title: "从本次结果移除", onClick: () => vscode.postMessage({ type: "uuidAction", toolId: "uuidReplace", action: "cancel", uris: [item.uri] }) },
        );
        if (item.hasApplied && ts.status !== "running") actions.push({ text: "⇄", title: "在 VS Code Git 中查看差异", onClick: () => vscode.postMessage({ type: "uuidAction", toolId: "uuidReplace", action: "gitDiff", uris: [item.uri] }) });
        return createCompactRow({
          path: item.relativePath,
          checkbox: selectable ? {
            checked: selected.has(item.uri), disabled: item.state !== "pending" || ts.status === "running",
            onChange: (checked) => { if (checked) selected.add(item.uri); else selected.delete(item.uri); postSelection(); },
          } : undefined,
          status: item.state === "pending" ? item.hitCount + " 处" : uuidStateLabel(item.state),
          statusClass: item.state,
          statusTitle: uuidStateLabel(item.state) + " · " + item.encoding + (item.warnings.length ? "\\n" + item.warnings.join("\\n") : ""),
          onOpen: open,
          actions: [{ text: "↗", title: "打开第一处 UUID", onClick: open }, ...actions],
          title: item.relativePath + "\\n" + item.encoding + " · " + item.hitCount + " 处 UUID",
        });
      });
      const pending = rows.filter((row) => row.state === "pending");
      const finished = rows.filter((row) => row.state !== "pending");
      const selectedPending = pending.filter((row) => selected.has(row.uri));
      els.btnFix.disabled = ts.status === "running" || selectedPending.length === 0;
      els.btnFix.textContent = selectedPending.length ? "替换所选（" + selectedPending.length + "）" : "替换所选";
      const all = pending.length && selectedPending.length === pending.length;
      els.results.appendChild(createCompactGroup("待写盘 · " + pending.length + " 个", ts.uuidStrategy === "fresh_per_hit" ? "每处独立新值" : "同值同替换", createRows(pending, true), {
        checked: !!all, indeterminate: selectedPending.length > 0 && !all, disabled: !pending.length || ts.status === "running", label: "选择全部 UUID 文件",
        onChange: (checked) => { for (const row of pending) { if (checked) selected.add(row.uri); else selected.delete(row.uri); } postSelection(); ts.uuidSelectedUris = [...selected]; els.results.innerHTML = ""; renderUuidResults(ts); },
      }));
      if (finished.length) els.results.appendChild(createCompactGroup("已处理 · " + finished.length + " 个", "", createRows(finished, false)));
    }

    function renderCaaResults(ts) {
      const connection = ts.caaDeskConnection || { status: "checking", text: "等待检测 Desk Tools…" };
      const connectionRow = document.createElement("div");
      connectionRow.className = "caa-connection " + connection.status;
      const connectionIcon = connection.status === "online" ? "●" : (connection.status === "checking" ? "◌" : (connection.status === "custom-command" ? "◆" : "○"));
      connectionRow.textContent = connectionIcon + " " + connection.text;
      if (connection.endpoint) connectionRow.title = connection.endpoint;
      els.results.appendChild(connectionRow);
      const rows = ts.caaDialogResults;
      if (!Array.isArray(rows)) { els.empty.style.display = "block"; els.empty.textContent = "点击“扫描 CATDlg”定位文件。"; return; }
      if (!rows.length) { els.empty.style.display = "block"; els.empty.textContent = "没有找到 .CATDlg 文件。"; return; }
      els.empty.style.display = "none";
      const items = rows.map((item) => {
        const open = () => vscode.postMessage({ type: "caaDialogAction", toolId: "caaDialog", action: "open", uri: item.uri });
        return createCompactRow({
          path: item.relativePath,
          status: item.selected ? "已交接" : "",
          statusClass: item.selected ? "applied" : "",
          onOpen: open,
          actions: [
            { text: "↗", title: "在 VS Code 中打开", onClick: open },
            { text: "□", title: "在配置的外部编辑器中打开", onClick: () => vscode.postMessage({ type: "caaDialogAction", toolId: "caaDialog", action: "openExternal", uri: item.uri }) },
          ],
          title: item.relativePath,
        });
      });
      els.results.appendChild(createCompactGroup("CATDlg 文件 · " + rows.length + " 个", ts.caaSettingsText || "", items));
    }

    function renderEnvironment(ts) {
      els.environmentValues.innerHTML = "";
      const values = ts.environmentValues || [];
      if (!values.length) {
        const empty = document.createElement("div");
        empty.className = "environment-row";
        empty.textContent = ts.status === "running" ? "正在读取…" : "点击“刷新系统值”读取工程环境。";
        els.environmentValues.appendChild(empty);
        return;
      }
      for (const item of values) {
        const row = document.createElement("div");
        row.className = "environment-row";
        const head = document.createElement("div");
        head.className = "environment-row-head";
        const name = document.createElement("span");
        name.className = "environment-name";
        name.textContent = item.environmentVariable;
        head.appendChild(name);
        if (item.required) {
          const required = document.createElement("span");
          required.className = "environment-required";
          required.textContent = "必需";
          head.appendChild(required);
        }
        const source = document.createElement("span");
        source.className = "environment-source" + (item.value && item.pathExists !== false ? " ready" : "");
        source.textContent = item.value ? (item.pathExists === false ? "路径不存在" : "系统") : "未设定";
        head.appendChild(source);
        const value = document.createElement("input");
        value.type = "text";
        value.spellcheck = false;
        value.className = "environment-value" + (item.value ? "" : " missing");
        value.value = item.value || item.suggestedValue || "";
        value.placeholder = item.suggestedValue ? "建议值 " + item.suggestedValue : "输入目录或文件路径";
        value.title = item.value || "未设定";
        value.setAttribute("aria-label", item.environmentVariable);
        const actions = document.createElement("div");
        actions.className = "environment-row-actions";
        if (item.key !== "caaMkVersion") {
          const pick = document.createElement("button");
          pick.type = "button";
          pick.className = "text-button";
          pick.textContent = "选择…";
          pick.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "pick", key: item.key });
          actions.appendChild(pick);
        }
        const save = document.createElement("button");
        save.type = "button";
        save.className = "text-button";
        save.textContent = item.value ? "修改" : "新建";
        save.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "set", key: item.key, value: value.value });
        value.onkeydown = (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          save.click();
        };
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "text-button";
        clear.textContent = "清除";
        clear.disabled = !item.value;
        clear.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "clear", key: item.key });
        actions.append(save, clear);
        row.append(head, value, actions);
        els.environmentValues.appendChild(row);
      }
    }

    function activeTool() {
      return state.tools.find((t) => t.id === state.activeToolId);
    }

    function toolState() {
      return state.toolStates[state.activeToolId] || { status: "idle" };
    }

    const nextReorderSelection = ${ktcNextReorderSelection.toString()};
    const searchReplaceButtonState = ${ktcSearchReplaceButtonState.toString()};
    let reorderSelected = new Set();
    let reorderRevision;

    function acceptReorderState(ts) {
      const next = nextReorderSelection(reorderSelected, reorderRevision, ts);
      reorderSelected = next.selected;
      reorderRevision = next.revision;
    }

    function reorderStateLabel(value) {
      return ({
        pending: "待写盘",
        applied: "已写盘",
        blocked: "未写入",
        reverted: "已还原",
        unchanged: "无变更",
      })[value] || value;
    }

    function reorderStateMark(value) {
      return ({ pending: "M", applied: "✓", blocked: "!", reverted: "↶", unchanged: "—" })[value] || "";
    }

    function postReorderAction(action, uris) {
      vscode.postMessage({ type: "reorderAction", toolId: "reorderMembers", action, uris });
    }

    function postReorderSelection() {
      vscode.postMessage({ type: "reorderSelection", toolId: "reorderMembers", uris: [...reorderSelected] });
    }

    function createReorderIcon(text, title, action, uri) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reorder-icon";
      button.textContent = text;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.onclick = (event) => {
        event.stopPropagation();
        postReorderAction(action, [uri]);
      };
      return button;
    }

    function createReorderGroup(title, rows, ts, selectable) {
      const group = document.createElement("section");
      group.className = "reorder-group";
      const header = document.createElement("div");
      header.className = "reorder-group-header";
      if (selectable) {
        const pending = rows.filter((row) => row.state === "pending");
        const selected = pending.filter((row) => reorderSelected.has(row.uri));
        const all = document.createElement("input");
        all.type = "checkbox";
        all.disabled = pending.length === 0 || ts.status === "running";
        all.checked = pending.length > 0 && selected.length === pending.length;
        all.indeterminate = selected.length > 0 && selected.length < pending.length;
        all.setAttribute("aria-label", "选择全部待写盘文件");
        all.onchange = () => {
          for (const row of pending) {
            if (all.checked) reorderSelected.add(row.uri); else reorderSelected.delete(row.uri);
          }
          postReorderSelection();
          renderReorderResults(ts);
        };
        header.appendChild(all);
      }
      const label = document.createElement("span");
      label.textContent = title + " · " + rows.length + " 个";
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = "扫描 " + (ts.scanned || rows.length) + " 个";
      header.append(label, detail);
      group.appendChild(header);
      const list = document.createElement("ul");
      list.className = "reorder-list";
      for (const row of rows) {
        const item = document.createElement("li");
        item.className = "reorder-file-row";
        if (selectable) {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = reorderSelected.has(row.uri);
          checkbox.disabled = row.state !== "pending" || ts.status === "running";
          checkbox.setAttribute("aria-label", "选择 " + row.relativePath);
          checkbox.onchange = () => {
            if (checkbox.checked) reorderSelected.add(row.uri); else reorderSelected.delete(row.uri);
            postReorderSelection();
            renderReorderResults(ts);
          };
          item.appendChild(checkbox);
        }
        const kind = document.createElement("span");
        kind.className = "reorder-kind";
        kind.textContent = row.kind === "header" ? "C" : "C++";
        const main = document.createElement("span");
        main.className = "reorder-file-main";
        const parts = row.relativePath.split("/");
        const file = parts.pop() || row.relativePath;
        const name = document.createElement("span");
        name.className = "reorder-file-name";
        name.textContent = file;
        const directory = document.createElement("span");
        directory.className = "reorder-file-dir";
        directory.textContent = parts.join("/");
        main.append(name, directory);
        main.title = [row.relativePath, row.encoding, ...(row.warnings || [])].join("\\n");
        main.onclick = () => postReorderAction("open", [row.uri]);
        const actions = document.createElement("span");
        actions.className = "reorder-inline";
        if (ts.status !== "running" && row.state === "pending") {
          actions.append(
            createReorderIcon("⇄", "预览排序差异", "preview", row.uri),
            createReorderIcon("✓", "应用此文件", "apply", row.uri),
            createReorderIcon("×", "从本次结果移除", "cancel", row.uri),
          );
        } else if (ts.status !== "running" && row.state === "applied") {
          actions.append(
            createReorderIcon("⇄", "在 VS Code Git 中查看差异", "gitDiff", row.uri),
            createReorderIcon("↶", "还原本次成员排序", "revert", row.uri),
          );
        }
        const status = document.createElement("span");
        status.className = "reorder-state " + row.state;
        status.textContent = reorderStateMark(row.state);
        status.title = reorderStateLabel(row.state) + " · " + row.encoding;
        item.append(kind, main, actions, status);
        list.appendChild(item);
      }
      group.appendChild(list);
      return group;
    }

    function renderReorderResults(ts) {
      const hasCache = Array.isArray(ts.reorderResults);
      const rows = hasCache ? ts.reorderResults.filter((row) => row.state !== "cancelled") : [];
      const changed = rows.filter((row) => row.state !== "unchanged");
      const unchanged = rows.filter((row) => row.state === "unchanged");
      const pendingSelected = changed.filter((row) => row.state === "pending" && reorderSelected.has(row.uri));
      els.btnReorderApply.disabled = ts.status === "running" || pendingSelected.length === 0;
      els.btnReorderWorkset.disabled = ts.status === "running" || !hasCache;
      els.btnReorderApply.textContent = pendingSelected.length ? "应用所选（" + pendingSelected.length + "）" : "应用所选";
      els.reorderGroups.hidden = !hasCache;
      els.reorderGroups.innerHTML = "";
      if (!hasCache) return;
      els.reorderGroups.appendChild(createReorderGroup("变更文件", changed, ts, true));
      if (els.reorderShowUnchanged.checked) {
        els.reorderGroups.appendChild(createReorderGroup("无变更文件", unchanged, ts, false));
      }
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

    function updateRulePickerConfirm() {
      const selected = els.rulePickerList.querySelectorAll("[data-rule-index]:checked").length > 0;
      const customEnabled = els.rulePickerList.querySelector("[data-custom-enabled]");
      const customSearch = els.rulePickerList.querySelector("[data-custom-search]");
      els.rulePickerConfirm.disabled = !selected
        && !(customEnabled?.checked && customSearch?.value.trim());
    }

    function closeRulePicker() {
      if (els.rulePicker.open) els.rulePicker.close();
      activeRulePicker = null;
      els.rulePickerList.innerHTML = "";
    }

    function openRulePicker(picker) {
      activeRulePicker = picker;
      els.rulePickerTitle.textContent = picker.title || "添加关联规则";
      els.rulePickerList.innerHTML = "";
      if (!picker.candidates.length) {
        const empty = document.createElement("p");
        empty.className = "rule-picker-empty";
        empty.textContent = "没有新的推荐规则。";
        els.rulePickerList.appendChild(empty);
      }
      picker.candidates.forEach((candidate, index) => {
        const row = document.createElement("label");
        row.className = "rule-picker-row";
        const checked = document.createElement("input");
        checked.type = "checkbox";
        checked.checked = !!candidate.checked;
        checked.dataset.ruleIndex = String(index);
        checked.onchange = updateRulePickerConfirm;
        const content = document.createElement("div");
        const label = document.createElement("div");
        label.className = "rule-picker-label";
        label.textContent = candidate.label;
        const values = document.createElement("div");
        values.className = "rule-picker-values";
        const search = document.createElement("code");
        search.textContent = candidate.rule.search;
        search.title = candidate.rule.search;
        const arrow = document.createElement("span");
        arrow.className = "prefix-arrow";
        arrow.textContent = "→";
        const replace = document.createElement("code");
        replace.textContent = candidate.rule.replace;
        replace.title = candidate.rule.replace;
        values.append(search, arrow, replace);
        content.append(label, values);
        row.append(checked, content);
        els.rulePickerList.appendChild(row);
      });

      const customRow = document.createElement("div");
      customRow.className = "rule-picker-row";
      const customEnabled = document.createElement("input");
      customEnabled.type = "checkbox";
      customEnabled.dataset.customEnabled = "true";
      const customContent = document.createElement("div");
      const customLabel = document.createElement("div");
      customLabel.className = "rule-picker-label";
      customLabel.textContent = "自定义规则";
      const customValues = document.createElement("div");
      customValues.className = "rule-picker-values";
      const customSearch = document.createElement("input");
      customSearch.placeholder = "Source";
      customSearch.setAttribute("aria-label", "自定义规则 Source");
      customSearch.dataset.customSearch = "true";
      const customArrow = document.createElement("span");
      customArrow.className = "prefix-arrow";
      customArrow.textContent = "→";
      const customReplace = document.createElement("input");
      customReplace.placeholder = "Target";
      customReplace.setAttribute("aria-label", "自定义规则 Target");
      customReplace.dataset.customReplace = "true";
      const updateCustom = () => {
        if (customSearch.value.trim()) customEnabled.checked = true;
        updateRulePickerConfirm();
      };
      customEnabled.onchange = updateRulePickerConfirm;
      customSearch.oninput = updateCustom;
      customReplace.oninput = updateCustom;
      customSearch.onkeydown = stopTextInputEnter;
      customReplace.onkeydown = stopTextInputEnter;
      customValues.append(customSearch, customArrow, customReplace);
      customContent.append(customLabel, customValues);
      customRow.append(customEnabled, customContent);
      els.rulePickerList.appendChild(customRow);
      updateRulePickerConfirm();
      if (!els.rulePicker.open) els.rulePicker.showModal();
      if (picker.candidates.length === 0) customSearch.focus();
    }

    function renderExtraRules() {
      els.multiRules.hidden = !state.replace.expanded;
      els.btnExpandRules.textContent = state.replace.expanded ? "收起关联规则" : "展开关联规则";
      els.replaceSourcePrefix.value = state.replace.sourcePrefix || "";
      els.replaceTargetPrefix.value = state.replace.targetPrefix || "";
      els.defaultEncoding.value = state.replace.defaultEncoding;
      els.preserveCase.checked = false;
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
        addRelation.onclick = () => requestAssociatedRulePicker("row", { ...rule });
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
      els.replaceProfileName.value = state.replace.profileLabel || "";
      els.replaceProfile.disabled = !!state.searchReplaceProfileError || state.searchReplaceProfiles.length === 0;
      els.replaceProfile.title = state.searchReplaceProfileError || "填入已保存的工作区规则";
      els.btnSaveProfile.disabled = !!state.searchReplaceProfileError || !String(state.replace.profileLabel || "").trim();
    }

    function renderRecentWorkingDirectories() {
      els.recentWorkingDirectories.innerHTML = "";
      const appendOption = (directory, label) => {
        const option = document.createElement("option");
        option.value = directory;
        option.label = label;
        els.recentWorkingDirectories.appendChild(option);
      };
      for (const directory of state.recentWorkingDirectories.workspace || []) {
        appendOption(directory, "当前工作区 · " + directory);
      }
      for (const directory of state.recentWorkingDirectories.external || []) {
        appendOption(directory, "外部 · " + directory);
      }
    }

    function supportsWorkspaceFileScope() {
      return state.activeToolId === "headerAscii"
        || state.activeToolId === "encodingFix"
        || state.activeToolId === "codeRename"
        || state.activeToolId === "reorderMembers"
        || state.activeToolId === "uuidReplace"
        || state.activeToolId === "caaDialog";
    }

    function renderWorkspaceFileScope(running) {
      const supported = supportsWorkspaceFileScope();
      els.workspaceFileScope.hidden = !supported;
      if (!supported) return;
      els.workspaceFileScopeLabel.textContent = state.activeToolId === "codeRename" ? "搜索范围" : "扫描范围";
      els.workspaceFileScopeSelect.innerHTML = "";
      for (const scope of state.workspaceFileScopes || []) {
        const option = document.createElement("option");
        option.value = scope.id;
        option.textContent = scope.kind === "workset" ? "工作集 · " + scope.label : scope.label;
        option.title = scope.description || scope.label;
        els.workspaceFileScopeSelect.appendChild(option);
      }
      const selected = state.selectedWorkspaceFileScopes[state.activeToolId] || "workspace";
      const valid = (state.workspaceFileScopes || []).some((scope) => scope.id === selected);
      els.workspaceFileScopeSelect.value = valid ? selected : "workspace";
      if (!valid && state.workspaceFileScopes.some((scope) => scope.id === "workspace")) {
        state.selectedWorkspaceFileScopes[state.activeToolId] = "workspace";
        vscode.postMessage({ type: "selectWorkspaceFileScope", toolId: state.activeToolId, scopeId: "workspace" });
      }
      els.workspaceFileScopeSelect.disabled = running || state.workspaceFileScopes.length === 0;
      els.btnOpenWorksets.disabled = running;
      const searchDirectory = (state.replace.scope || "").trim();
      const windowsAbsolute = searchDirectory.length > 2
        && searchDirectory.charAt(1) === ":"
        && (searchDirectory.charAt(2) === "/" || searchDirectory.charCodeAt(2) === 92);
      const externalSearch = state.activeToolId === "codeRename"
        && (searchDirectory.startsWith("/") || windowsAbsolute);
      const message = state.workspaceFileScopeError
        || (externalSearch ? "外部工作目录不使用工作集范围。" : "");
      els.workspaceFileScopeError.textContent = message;
      els.workspaceFileScopeError.hidden = !message;
    }

    function render() {
      document.body.classList.toggle("ribbon-only", state.presentation === "ribbon");
      document.body.classList.toggle("detail-block", state.presentation === "detailBlock");
      const tool = activeTool();
      if (tool) {
        els.title.textContent = tool.title;
        els.desc.textContent = tool.description;
      }
      els.tabs.innerHTML = "";
      els.tabs.className = "tabs " + state.sidebarStyle;
      els.tabs.title = (state.openToolIds || []).length
        ? "已打开 " + state.openToolIds.length + " 个工具 Block"
        : "没有打开的工具 Block";
      for (const t of state.tools) {
        if (t.id === "environmentSettings") continue;
        const btn = document.createElement("button");
        const isOpen = (state.openToolIds || []).includes(t.id);
        const isActive = isOpen && t.id === state.activeToolId;
        btn.className = "tab" + (isOpen ? " open" : "") + (isActive ? " active" : "");
        btn.type = "button";
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        if (t.icon && t.icon.includes(":")) {
          const icon = document.createElement("span");
          icon.className = "tool-icon";
          icon.style.setProperty("--tool-icon", 'url("' + t.icon.replace(/"/g, "") + '")');
          btn.appendChild(icon);
        }
        const label = document.createElement("span");
        const shortTitles = { headerAscii: "头文件", encodingFix: "编码", ignoreSettings: "忽略", codeRename: "替换", reorderMembers: "排序", uuidReplace: "UUID", caaDialog: "CAA", environmentSettings: "环境" };
        label.textContent = shortTitles[t.id] || t.title;
        btn.appendChild(label);
        const openState = isActive
          ? " · 当前显示"
          : (isOpen ? " · 已打开，当前隐藏" : "");
        const countState = isOpen ? " · 共打开 " + state.openToolIds.length + " 个" : "";
        btn.title = t.title + openState + countState;
        btn.dataset.tooltip = t.title + openState + countState;
        btn.setAttribute("aria-label", t.title + openState);
        btn.onclick = () => vscode.postMessage({ type: "selectTool", toolId: t.id });
        els.tabs.appendChild(btn);
      }
      const ts = toolState();
      const running = ts.status === "running";
      document.body.classList.toggle("task-running", running);
      const enc = isEncodingTool();
      const header = isHeaderAsciiTool();
      const rename = isCodeRenameTool();
      const reorder = isReorderMembersTool();
      const ignore = isIgnoreTool();
      const uuid = isUuidTool();
      const caaDialog = isCaaDialogTool();
      const environment = isEnvironmentTool();
      renderWorkspaceFileScope(running);
      els.desc.hidden = ignore;
      els.replaceBlock.hidden = !rename;
      els.reorderBlock.hidden = !reorder;
      els.environmentBlock.hidden = !environment;
      els.generalActions.hidden = rename || ignore || reorder || environment;
      els.uuidOptions.hidden = !uuid;
      els.uuidStrategy.value = state.uuidStrategy;
      els.uuidStrategy.disabled = running;
      els.uuidStrategyHint.textContent = state.uuidStrategy === "fresh_per_hit"
        ? "每个命中生成不同 UUID，可能打破原有引用关系；仅在确认每处都应拥有独立身份时使用。"
        : "相同旧 UUID 在所有文件中替换为同一个新 UUID；策略在扫描时固定。";
      els.uuidStrategyHint.className = "hint" + (state.uuidStrategy === "fresh_per_hit" ? " warning" : "");
      els.compactTools.hidden = !(rename || uuid || caaDialog);
      els.btnCaaCheckConnection.hidden = !caaDialog;
      els.btnAddResultsWorkset.disabled = running || (rename && !ts.codeRenameResults) || (uuid && !Array.isArray(ts.uuidResults)) || (caaDialog && !Array.isArray(ts.caaDialogResults));
      els.ignoreBlock.hidden = !ignore;
      els.btnApplyIgnoreRecommendations.hidden = true;
      els.btnScan.disabled = running;
      els.btnFix.disabled = running;
      els.btnScan.textContent = rename ? "打开" : (ignore ? "打开规则" : (uuid ? "扫描 UUID" : (caaDialog ? "扫描 CATDlg" : "预检")));
      els.btnFix.textContent = enc ? "转换" : (ignore ? "从 .gitignore 同步" : (uuid ? "替换所选" : (caaDialog ? "CAA 设置" : "修复")));
      els.btnFix.style.display = rename ? "none" : "inline-block";

      els.targetHint.hidden = !enc;
      els.scopeBlock.hidden = rename || ignore || reorder || uuid || caaDialog || environment;

      if (reorder) {
        els.reorderStatus.textContent = ts.message || "";
        els.reorderStatus.className = "status" + (ts.status === "error" ? " error" : "");
        els.btnReorderPreview.disabled = running;
        renderReorderResults(ts);
      }

      if (rename) {
        els.replaceSearch.value = state.replace.search;
        els.replaceWith.value = state.replace.with;
        els.replaceText.checked = state.replace.text;
        els.replaceFile.checked = state.replace.file;
        els.replaceDir.checked = state.replace.dir;
        els.replaceIgnored.checked = state.replace.ignored;
        els.replaceScope.value = state.replace.scope;
        renderRecentWorkingDirectories();
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

      els.optionsPanel.hidden = rename || ignore || reorder || uuid || caaDialog || environment;
      els.headerOptions.hidden = enc;
      els.encodingOptions.hidden = !enc;
      els.showDetailsWrap.hidden = !header;
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
      els.status.hidden = reorder;
      els.resultsTitle.hidden = reorder || environment;
      els.results.hidden = reorder || environment;
      els.results.innerHTML = "";
      els.resultsTitle.textContent = header ? "问题文件" : (enc ? "编码结果" : (rename ? "替换结果" : (ignore ? "推荐规则" : (uuid ? "UUID 结果" : (caaDialog ? "CATDlg 文件" : "结果")))));

      if (environment) {
        renderEnvironment(ts);
        els.empty.style.display = "none";
      } else if (reorder) {
        els.empty.style.display = "none";
      } else if (header) {
        renderHeaderResults(ts, !!state.showDetails);
      } else if (enc) {
        renderEncodingResults(ts, !!state.showEncDetails);
      } else if (rename) {
        renderCodeRenameResults(ts);
      } else if (ignore) {
        renderIgnoreResults(ts);
      } else if (uuid) {
        renderUuidResults(ts);
      } else if (caaDialog) {
        renderCaaResults(ts);
      } else {
        els.empty.style.display = "block";
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    els.btnScan.onclick = () => {
      if (isIgnoreTool()) vscode.postMessage({ type: "openIgnoreFile" });
      else vscode.postMessage({
        type: "run",
        toolId: state.activeToolId,
        action: isCodeRenameTool() ? "open" : "scan",
        uuidStrategy: isUuidTool() ? state.uuidStrategy : undefined,
      });
    };
    els.btnReorderPreview.onclick = () => {
      vscode.postMessage({ type: "run", toolId: "reorderMembers", action: "preview" });
    };
    els.btnReorderApply.onclick = () => {
      const pending = (toolState().reorderResults || [])
        .filter((row) => row.state === "pending" && reorderSelected.has(row.uri))
        .map((row) => row.uri);
      if (pending.length) postReorderAction("apply", pending);
    };
    els.reorderShowUnchanged.onchange = () => renderReorderResults(toolState());
    els.btnReorderWorkset.onclick = () => vscode.postMessage({ type: "run", toolId: "reorderMembers", action: "addToWorkset" });
    els.btnFix.onclick = () => {
      if (isIgnoreTool()) vscode.postMessage({ type: "syncIgnoreFromGit" });
      else vscode.postMessage({
        type: "run",
        toolId: state.activeToolId,
        action: isEncodingTool() ? "convert" : "fix",
      });
    };
    els.btnAddResultsWorkset.onclick = () => vscode.postMessage({ type: "run", toolId: state.activeToolId, action: "addToWorkset" });
    els.btnCaaCheckConnection.onclick = () => vscode.postMessage({ type: "run", toolId: "caaDialog", action: "checkConnection" });
    els.uuidStrategy.onchange = () => {
      state.uuidStrategy = els.uuidStrategy.value === "fresh_per_hit" ? "fresh_per_hit" : "map_per_value";
      vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, uuidStrategy: state.uuidStrategy, replace: state.replace });
      render();
    };
    els.btnEnvironmentRefresh.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "refresh" });
    els.btnEnvironmentSystem.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "openSystemSettings" });
    els.btnEnvironmentPluginSettings.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "openPluginSettings" });
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
        defaultEncoding: els.defaultEncoding.value === "gbk" ? "gbk" : "utf8",
        preserveCase: false,
        extraRules: state.replace.extraRules,
        profileId: state.replace.profileId || "",
        profileLabel: els.replaceProfileName.value,
      };
      vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
      updateReplaceButtons();
    }
    function updateReplaceButtons() {
      const validation = searchReplaceButtonState({
        running: toolState().status === "running",
        search: els.replaceSearch.value,
        replace: els.replaceWith.value,
        text: els.replaceText.checked,
        file: els.replaceFile.checked,
        dir: els.replaceDir.checked,
        extraRules: state.replace.extraRules,
      });
      els.replacePreview.disabled = validation.disabled;
      els.replaceApply.disabled = validation.disabled;
      const disabledReason = validation.message || (validation.busy ? (toolState().message || "正在执行搜索替换…") : "");
      els.replacePreviewTooltip.title = disabledReason;
      els.replaceApplyTooltip.title = disabledReason;
      els.replacePreview.setAttribute("aria-label", disabledReason ? "预览：" + disabledReason : "预览搜索替换");
      els.replaceApply.setAttribute("aria-label", disabledReason ? "替换：" + disabledReason : "执行搜索替换");
      els.replaceValidation.textContent = validation.message;
      els.replaceValidation.hidden = !validation.message;
    }
    function runSearchReplace(action) {
      saveReplaceState();
      const levels = [];
      if (state.replace.text) levels.push("text");
      if (state.replace.file) levels.push("file");
      if (state.replace.dir) levels.push("dir");
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
          defaultEncoding: state.replace.defaultEncoding,
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
    els.defaultEncoding.onchange = saveReplaceState;
    function requestAssociatedRulePicker(mode, parentRule) {
      saveReplaceState();
      vscode.postMessage({
        type: "requestAssociatedRuleCandidates",
        toolId: "codeRename",
        mode,
        search: state.replace.search,
        replace: state.replace.with,
        sourcePrefix: state.replace.sourcePrefix,
        targetPrefix: state.replace.targetPrefix,
        parentRule,
        existingRules: state.replace.extraRules,
      });
    }
    els.btnAddRule.onclick = () => requestAssociatedRulePicker("custom");
    els.btnPickWorkingDirectory.onclick = () => vscode.postMessage({
      type: "pickSearchReplaceDirectory",
      toolId: "codeRename",
    });
    els.workspaceFileScopeSelect.onchange = () => {
      const scopeId = els.workspaceFileScopeSelect.value || "workspace";
      state.selectedWorkspaceFileScopes[state.activeToolId] = scopeId;
      vscode.postMessage({ type: "selectWorkspaceFileScope", toolId: state.activeToolId, scopeId });
    };
    els.btnOpenWorksets.onclick = () => vscode.postMessage({ type: "openWorkspaceWorksets" });
    els.replaceProfile.onchange = () => {
      if (!els.replaceProfile.value) return;
      vscode.postMessage({
        type: "loadSearchReplaceProfile",
        toolId: "codeRename",
        id: els.replaceProfile.value,
      });
    };
    els.replaceProfileName.oninput = saveReplaceState;
    els.btnSaveProfile.onclick = () => {
      saveReplaceState();
      const label = state.replace.profileLabel.trim();
      if (!label) return;
      vscode.postMessage({
        type: "saveSearchReplaceProfile",
        toolId: "codeRename",
        label,
        draft: {
          search: state.replace.search,
          replace: state.replace.with,
          sourcePrefix: state.replace.sourcePrefix,
          targetPrefix: state.replace.targetPrefix,
          associatedRules: state.replace.extraRules,
          options: {
            preserveCase: false,
            text: state.replace.text,
            file: state.replace.file,
            dir: state.replace.dir,
            includeIgnored: state.replace.ignored,
            scope: state.replace.scope,
          },
        },
      });
    };
    els.btnCommonRules.onclick = () => requestAssociatedRulePicker("common");
    els.btnCaaRules.onclick = () => requestAssociatedRulePicker("caa");
    els.rulePickerClose.onclick = closeRulePicker;
    els.rulePickerCancel.onclick = closeRulePicker;
    els.rulePicker.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeRulePicker();
    });
    els.rulePickerConfirm.onclick = () => {
      if (!activeRulePicker) return;
      const selectedRules = [];
      for (const input of els.rulePickerList.querySelectorAll("[data-rule-index]:checked")) {
        const candidate = activeRulePicker.candidates[Number(input.dataset.ruleIndex)];
        if (candidate) selectedRules.push(candidate.rule);
      }
      const customEnabled = els.rulePickerList.querySelector("[data-custom-enabled]");
      const customSearch = els.rulePickerList.querySelector("[data-custom-search]");
      const customReplace = els.rulePickerList.querySelector("[data-custom-replace]");
      if (customEnabled?.checked && customSearch?.value.trim()) {
        selectedRules.push({
          id: "custom-" + Date.now(),
          search: customSearch.value,
          replace: customReplace?.value || "",
          enabled: true,
          source: "user",
          relationKind: "custom",
        });
      }
      vscode.postMessage({
        type: "appendAssociatedRules",
        toolId: "codeRename",
        primarySearch: state.replace.search,
        rules: selectedRules,
        existingRules: state.replace.extraRules,
      });
      closeRulePicker();
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
    els.replaceScope.oninput = () => { saveReplaceState(); renderWorkspaceFileScope(toolState().status === "running"); };
    els.replaceScope.onchange = () => {
      saveReplaceState();
      if (els.replaceScope.value.trim()) {
        vscode.postMessage({
          type: "rememberSearchReplaceDirectory",
          toolId: "codeRename",
          directory: els.replaceScope.value,
        });
      }
    };
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
    els.btnApplyIgnoreRecommendations.onclick = () => vscode.postMessage({
      type: "applyIgnoreRecommendations",
      groupIds: toolState().ignoreSelectedGroupIds || [],
    });
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
        state.openToolIds = msg.openToolIds || [];
        state.toolOptions = msg.toolOptions || {};
        state.scope = msg.scope || state.scope;
        state.ignoreConfig = msg.ignoreConfig || null;
        state.sidebarStyle = msg.sidebarStyle || "ribbon";
        state.presentation = msg.presentation === "detailBlock" ? "detailBlock" : "ribbon";
        state.recentWorkingDirectories = msg.recentWorkingDirectories || { workspace: [], external: [] };
        state.searchReplaceProfiles = msg.searchReplaceProfiles || [];
        state.searchReplaceProfileError = msg.searchReplaceProfileError || "";
        state.workspaceFileScopes = msg.workspaceFileScopes || [];
        state.selectedWorkspaceFileScopes = msg.selectedWorkspaceFileScopes || {};
        state.workspaceFileScopeError = msg.workspaceFileScopeError || "";
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
      } else if (msg.type === "openTools") {
        state.activeToolId = msg.activeToolId || state.activeToolId;
        state.openToolIds = msg.openToolIds || [];
        render();
      } else if (msg.type === "workspaceFileScopes") {
        state.workspaceFileScopes = msg.scopes || [];
        state.selectedWorkspaceFileScopes = msg.selected || {};
        state.workspaceFileScopeError = msg.error || "";
        render();
      } else if (msg.type === "requestSearchReplacePreview") {
        state.activeToolId = "codeRename";
        render();
        runSearchReplace("preview");
      } else if (msg.type === "recentWorkingDirectories") {
        state.recentWorkingDirectories = msg.directories || { workspace: [], external: [] };
        renderRecentWorkingDirectories();
        if (typeof msg.selected === "string") {
          state.replace.scope = msg.selected;
          els.replaceScope.value = msg.selected;
          saveReplaceState();
        }
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
            preserveCase: false,
            text: profile.options.text,
            file: profile.options.file,
            dir: profile.options.dir,
            ignored: profile.options.includeIgnored,
            scope: profile.options.scope,
            extraRules: profile.associatedRules.map((rule) => ({ ...rule })),
            expanded: true,
            profileId: profile.id,
            profileLabel: profile.label,
          };
          vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
        }
        render();
      } else if (msg.type === "state") {
        const associatedRulePicker = msg.toolId === "codeRename" ? msg.state.associatedRulePicker : null;
        if (msg.toolId === "codeRename" && msg.state.associatedRules) {
          state.replace.extraRules = [...msg.state.associatedRules];
          vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, replace: state.replace });
        }
        state.toolStates[msg.toolId] = msg.state;
        if (msg.toolId === "uuidReplace" && msg.state.uuidStrategy) {
          state.uuidStrategy = msg.state.uuidStrategy;
          vscode.setState({ showDetails: state.showDetails, showEncDetails: state.showEncDetails, uuidStrategy: state.uuidStrategy, replace: state.replace });
        }
        if (msg.toolId === "reorderMembers") acceptReorderState(msg.state);
        render();
        if (associatedRulePicker) openRulePicker(associatedRulePicker);
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
