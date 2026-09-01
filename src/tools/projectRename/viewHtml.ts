import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";

export function ktcProjectRenameViewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "project-rename-analysis.js"),
  ).toString();
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>大型项目改名分析</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 8px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.45 var(--vscode-font-family); }
  main { max-width: 1240px; margin: 0 auto; }
  h1,h2 { margin: 0; } h1 { font-size: 20px; } h2 { font-size: 14px; }
  button,input { font: inherit; } button { min-height: 28px; padding: 3px 10px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 2px; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); } button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); } button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); } button:disabled { opacity: .55; cursor: not-allowed; }
  input[type=text] { width: 100%; min-height: 28px; padding: 4px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); }
  input[type=checkbox] { width: 16px; height: 16px; }
  .header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .muted { color: var(--vscode-descriptionForeground); }
  .command-header { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -8px -8px 8px; padding: 7px 8px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
  .view-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .view-heading strong { flex: none; overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
  .view-heading span { min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .header-actions { display: flex; flex: none; gap: 7px; }
  .notice { padding: 7px 9px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-editorInfo-foreground); }
  .notice.error { border-left-color: var(--vscode-editorError-foreground); } .notice.running { border-left-color: var(--vscode-progressBar-background); }
  .section { margin-top: 12px; overflow: hidden; border: 1px solid var(--pnw-workbench-border, var(--vscode-panel-border)); background: var(--pnw-workbench-surface, var(--vscode-editor-background)); }
  .section-title { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 5px 9px; background: var(--vscode-sideBarSectionHeader-background); }
  details.section > summary { cursor: pointer; list-style: none; }
  details.section > summary::-webkit-details-marker { display: none; }
  details.section > summary::before { width: 12px; flex: 0 0 12px; color: var(--vscode-descriptionForeground); content: "›"; font-size: 18px; line-height: 1; transform: rotate(0deg); transition: transform .1s ease; }
  details.section[open] > summary { border-bottom: 1px solid var(--pnw-workbench-border, var(--vscode-panel-border)); }
  details.section[open] > summary::before { transform: rotate(90deg); }
  details.section > summary:hover { background: var(--pnw-control-hover-bg, var(--vscode-list-hoverBackground)); }
  details.section > summary:focus-visible { outline: 2px solid var(--pnw-focus-ring, var(--vscode-focusBorder)); outline-offset: -2px; }
  .section-title .count { color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .section-title-actions { display: inline-flex; min-width: 0; align-items: center; gap: 5px; margin-left: auto; }
  .body { padding: 10px; }
  .names { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 10px; }
  label { display: grid; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .rules { display: grid; gap: 4px; margin-top: 10px; }
  .rule { display: grid; grid-template-columns: 24px minmax(90px,.55fr) minmax(120px,1fr) 20px minmax(120px,1fr) 28px; align-items: center; gap: 5px; }
  .rule .style { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .related-candidates { margin-top: 10px; padding: 8px; border: 1px solid var(--pnw-workbench-border, var(--vscode-panel-border)); background: var(--vscode-textBlockQuote-background); }
  .related-candidates-title { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; }
  .related-candidates-title span { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .related-candidates-list { display: grid; gap: 5px; margin-top: 7px; }
  .related-candidate { display: grid; grid-template-columns: minmax(110px,1fr) 20px minmax(110px,1fr) auto auto; align-items: center; gap: 6px; }
  .related-candidate code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .related-candidate .count { color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
  .icon { min-width: 28px; padding: 2px; }
  .summary { display: grid; grid-template-columns: repeat(6,minmax(90px,1fr)); gap: 7px; }
  .metric { min-width: 0; padding: 8px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); }
  .metric strong { display: block; font-size: 18px; } .metric span { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .risk-high { color: var(--vscode-editorError-foreground); } .risk-medium { color: var(--vscode-editorWarning-foreground); } .risk-low { color: var(--vscode-testing-iconPassed); }
  .root-suggestion { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 6px 10px; margin-top: 8px; padding: 6px; background: var(--vscode-textCodeBlock-background); }
  .root-suggestion .reason { grid-column: 1 / -1; font-size: 11px; }
  .completion { display: grid; grid-template-columns: auto repeat(3,auto) minmax(0,1fr); align-items: center; gap: 7px; margin-top: 8px; padding: 7px; border: 1px solid var(--vscode-panel-border); }
  .completion .gate { padding: 1px 6px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; white-space: nowrap; }
  .completion .passed { color: var(--vscode-testing-iconPassed); }
  .results { overflow: auto; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th,td { padding: 6px 7px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--vscode-panel-border); overflow-wrap: anywhere; }
  th { position: sticky; z-index: 1; top: 0; background: var(--vscode-sideBarSectionHeader-background); }
  .col-risk { width: 72px; } .col-kind { width: 110px; } .col-count { width: 58px; text-align: right; } .col-action { width: 58px; }
  .path { color: var(--vscode-descriptionForeground); font-size: 11px; } .preview { margin-top: 2px; }
  .badge { display: inline-block; padding: 1px 5px; border: 1px solid currentColor; border-radius: 9px; font-size: 10px; }
  .footer { display: flex; justify-content: center; padding: 10px; }
  [hidden] { display: none !important; }
  @media (max-width: 760px) { .command-header { align-items: flex-start; flex-wrap: wrap; } .view-heading { flex-basis: 100%; } .header-actions { flex-wrap: wrap; } .view-heading span { display: block; } .names,.summary { grid-template-columns: 1fr 1fr; } .completion { grid-template-columns: 1fr 1fr; } .completion strong,.completion .message { grid-column: 1 / -1; } .section-title { flex-wrap: wrap; } .section-title-actions { flex-basis: 100%; margin-left: 20px; } .rule { grid-template-columns: 24px minmax(70px,.5fr) 1fr; } .rule .arrow { display: none; } .rule input[data-role=replace] { grid-column: 3; } .rule .icon { grid-column: 2; } .related-candidate { grid-template-columns: minmax(100px,1fr) 20px minmax(100px,1fr); } .related-candidate .count,.related-candidate button { grid-column: 3; justify-self: start; } }
</style></head><body>
  <header class="command-header"><div class="view-heading"><strong>大型项目改名分析</strong><span id="root">未选择分析目录</span></div><div class="header-actions"><button id="choose-root">选择目录…</button><button id="analyze" class="primary">分析</button><button id="cancel" hidden>取消</button><button id="apply" disabled>执行改名</button><button id="finish" disabled>结束任务</button></div></header>
<main>
  <div id="notice" class="notice">正在准备分析器…</div>
  <details class="section" open><summary class="section-title"><h2>名称与规则</h2><span id="rules-count" class="count">0 条启用</span><span class="section-title-actions"><button id="derive" data-section-action>重新派生</button><button id="add-rule" data-section-action>添加显式规则</button></span></summary><div class="body">
    <div class="names"><label>原项目名<input id="source-name" type="text" maxlength="256" /></label><label>目标项目名<input id="target-name" type="text" maxlength="256" /></label></div>
    <div id="rules" class="rules"></div>
    <div id="related-candidates-panel" class="related-candidates" hidden><div class="related-candidates-title"><strong>相关写法（仅提示）</strong><span>可能是稳定 URL、协议或领域前缀；不会自动加入规则。</span></div><div id="related-candidates" class="related-candidates-list"></div></div>
    <div id="progress" class="muted" style="margin-top:10px"></div>
  </div></details>
  <details id="summary-section" class="section" open hidden><summary class="section-title"><h2>总览</h2><span class="count">风险与范围</span></summary><div class="body"><div id="summary" class="summary"></div><div id="root-suggestion" class="root-suggestion" hidden><span id="root-suggestion-text"></span><button id="rename-root" type="button" hidden>重命名根目录…</button><span id="root-rename-reason" class="reason muted"></span></div><div id="completion" class="completion" hidden><strong>完成门禁</strong><span id="completion-target" class="gate">目标未验证</span><span id="completion-plan" class="gate">计划未执行</span><span id="completion-remaining" class="gate">剩余 0 项</span><span id="completion-message" class="message muted"></span></div></div></details>
  <details id="results-section" class="section" open hidden><summary class="section-title"><h2>命中与风险</h2><span id="result-count" class="count"></span></summary><div class="results"><table><thead><tr><th class="col-risk">风险</th><th class="col-kind">分类</th><th>来源 / 目标预览</th><th class="col-count">命中</th><th class="col-action"></th></tr></thead><tbody id="results"></tbody></table></div><div class="footer"><button id="load-more" hidden>加载更多</button></div></details>
</main><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
