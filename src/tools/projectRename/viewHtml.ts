import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";

export function ktcProjectRenameViewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "project-rename-analysis.js"),
  ).toString();
  const rulePickerUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "dist", "associated-rule-picker.js"),
  ).toString();
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>项目改名</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 8px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.45 var(--vscode-font-family); }
  body.vscode-light,body.vscode-high-contrast-light { color-scheme: light; }
  body.vscode-dark,body.vscode-high-contrast { color-scheme: dark; }
  main { max-width: 1240px; margin: 0 auto; }
  h1,h2 { margin: 0; } h1 { font-size: 20px; } h2 { font-size: 14px; }
  button,input,select { font: inherit; } button { min-height: 28px; padding: 3px 10px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); } button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); } button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); } button:disabled { opacity: .55; cursor: not-allowed; }
  input[type=text] { width: 100%; min-height: 28px; padding: 4px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-contrastBorder, var(--vscode-panel-border))); }
  input[type=text]:disabled, select:disabled { color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground)); opacity: .72; }
  select { width: 100%; min-height: 28px; padding: 3px 7px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, var(--vscode-contrastBorder, var(--vscode-panel-border))); }
  input[type=checkbox] { width: 16px; height: 16px; }
  .header { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .muted { color: var(--vscode-descriptionForeground); }
  .command-header { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -8px -8px 8px; padding: 7px 8px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
  .view-heading { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .view-heading strong { flex: none; overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
  .view-heading span { min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .header-actions { display: flex; flex: none; gap: 7px; }
  .notice { padding: 7px 9px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-editorInfo-foreground); }
  .notice.quiet { padding: 2px 4px; border-left: 0; background: transparent; font-size: 11px; }
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
  .section-title .scope-note { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .section-title-actions { display: inline-flex; min-width: 0; align-items: center; gap: 5px; }
  .section-title-actions button,.profile-actions button { min-height: 24px; padding: 1px 7px; white-space: nowrap; }
  .header-history { display: inline-flex; min-width: 220px; max-width: 420px; flex: 1 1 280px; align-items: center; gap: 4px; margin-left: auto; }
  .header-history select { min-width: 120px; min-height: 24px; flex: 1 1 auto; width: auto; padding-top: 1px; padding-bottom: 1px; }
  .header-history button { min-height: 24px; flex: none; padding-top: 1px; padding-bottom: 1px; }
  .body { padding: 10px; }
  .scheme-grid,.rule { display: grid; grid-template-columns: 24px minmax(96px,140px) minmax(160px,1fr) 20px minmax(160px,1fr) 28px; align-items: end; gap: 5px; }
  .source-column { grid-column: 3; } .target-column { grid-column: 5; }
  .profile-panel { margin: 8px 0; border-top: 1px solid var(--vscode-panel-border); border-bottom: 1px solid var(--vscode-panel-border); }
  .profile-panel > summary { display: flex; min-height: 30px; align-items: center; gap: 6px; padding: 3px 5px; color: var(--vscode-descriptionForeground); cursor: pointer; list-style: none; }
  .profile-panel > summary::-webkit-details-marker { display: none; }
  .profile-panel > summary::before { width: 12px; content: "›"; font-size: 17px; line-height: 1; }
  .profile-panel[open] > summary::before { transform: rotate(90deg); }
  .profile-panel > summary:hover { color: var(--vscode-foreground); background: var(--vscode-list-hoverBackground); }
  .profile-panel .count { margin-left: auto; font-size: 11px; }
  .profile-actions { display: inline-flex; flex: none; align-items: center; gap: 4px; }
  .profile-fields { display: grid; grid-template-columns: minmax(210px,.8fr) minmax(300px,1.2fr); gap: 8px; padding: 7px 5px 8px; border-top: 1px solid var(--vscode-panel-border); }
  .profile-save { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 5px; }
  .profile-error { margin: 0; padding: 0 5px 7px; color: var(--vscode-editorError-foreground); font-size: 11px; }
  .names { margin-bottom: 8px; }
  .prefix-fields { margin-bottom: 8px; }
  .prefix-arrow { grid-column: 4; min-height: 28px; align-content: center; color: var(--vscode-descriptionForeground); text-align: center; }
  label { display: grid; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .rules { display: grid; gap: 4px; }
  .rule { align-items: center; min-height: 32px; }
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
  table { width: 100%; min-width: 920px; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  th,td { height: 34px; padding: 4px 7px; overflow: hidden; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--vscode-panel-border); text-overflow: ellipsis; white-space: nowrap; }
  th { position: sticky; z-index: 1; top: 0; background: var(--vscode-sideBarSectionHeader-background); }
  .col-risk { width: 72px; } .col-kind { width: 130px; } .col-source { width: 32%; } .col-target { width: 38%; } .col-count { width: 58px; text-align: right; }
  .col-action { position: sticky; z-index: 2; right: 0; width: 116px; background: var(--vscode-editor-background); box-shadow: -1px 0 var(--vscode-panel-border); }
  th.col-action { z-index: 3; background: var(--vscode-sideBarSectionHeader-background); }
  .row-actions { display: flex; justify-content: flex-end; gap: 4px; }
  .source-label .path { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .badge { display: inline-block; padding: 1px 5px; border: 1px solid currentColor; border-radius: 9px; font-size: 10px; }
  .footer { display: flex; justify-content: center; padding: 10px; }
  [hidden] { display: none !important; }
  @media (max-width: 900px) { .section-title { flex-wrap: wrap; } .header-history { min-width: 0; max-width: none; flex-basis: calc(100% - 82px); margin-left: 20px; } .profile-fields { grid-template-columns: 1fr; } }
  @media (max-width: 760px) { .command-header { align-items: flex-start; flex-wrap: wrap; } .view-heading { flex-basis: 100%; } .header-actions { flex-wrap: wrap; } .view-heading span { display: block; } .names,.prefix-fields,.summary { grid-template-columns: 1fr 1fr; } .source-column { grid-column: 1; } .target-column { grid-column: 2; } .prefix-arrow { display: none; } .completion { grid-template-columns: 1fr 1fr; } .completion strong,.completion .message { grid-column: 1 / -1; } .profile-panel > summary { flex-wrap: wrap; } .profile-actions { margin-left: 18px; } .rule { grid-template-columns: 24px minmax(70px,.45fr) minmax(0,1fr) 28px; align-items: center; } .rule .arrow { display: none; } .rule input[data-role=replace] { grid-column: 3; grid-row: 2; } .rule .icon { grid-column: 4; grid-row: 1 / span 2; } .related-candidate { grid-template-columns: minmax(100px,1fr) 20px minmax(100px,1fr); } .related-candidate .count,.related-candidate button { grid-column: 3; justify-self: start; } }
</style></head><body>
  <header class="command-header"><div class="view-heading"><strong>项目改名</strong><span id="root">未选择分析目录</span></div><div class="header-actions"><button id="choose-root">选择目录…</button><button id="analyze" class="primary">分析</button><button id="cancel" hidden>取消</button><button id="preview-diff" disabled>预览差异…</button><button id="apply" disabled>执行改名</button><button id="git-changes" disabled>Git 对比</button><button id="finish" disabled>结束任务</button></div></header>
<main>
  <div id="notice" class="notice quiet">正在准备分析器…</div>
  <details class="section" open><summary class="section-title"><h2>改名方案</h2><span id="rules-count" class="count">0 条启用</span><span class="scope-note" title="当前固定处理文本、文件名和文件夹名；ASCII 原文件写入非 ASCII 目标时默认使用 UTF-8">默认：文本 · 文件名 · 文件夹名 · UTF-8</span><span class="header-history" data-section-action><select id="rename-history" aria-label="最近输入和项目方案" title="恢复最近输入或当前目录的项目方案"><option value="">最近输入 / 项目方案…</option></select><button id="delete-history" class="icon" type="button" title="删除所选本机记录" aria-label="删除所选最近记录" disabled>×</button><button id="clear-history" type="button" title="清空用户最近输入和所有项目的本机方案" aria-label="清空全部本机改名历史" disabled>清空</button></span><span class="section-title-actions"><button id="toggle-rules" data-section-action title="取消勾选全部规则" aria-label="取消勾选全部规则">全不选</button><button id="derive" data-section-action title="根据项目名和前缀重新派生名称形态" aria-label="重新派生名称形态">派生</button></span></summary><div class="body">
    <div class="names scheme-grid"><label class="source-column">原项目名<input id="source-name" type="text" maxlength="256" /></label><label class="target-column">目标项目名<input id="target-name" type="text" maxlength="256" /></label></div>
    <div class="prefix-fields scheme-grid"><label class="source-column" title="CAA / C++ 项目常用的显式源前缀；不自动猜测">CAA / C++ 源前缀（可选）<input id="source-prefix" type="text" maxlength="256" placeholder="例如 KTC" /></label><span class="prefix-arrow">→</span><label class="target-column" title="与源前缀成对生成前缀和 CAA I/E 候选">CAA / C++ 目标前缀（可选）<input id="target-prefix" type="text" maxlength="256" placeholder="例如 KTM" /></label></div>
    <details id="profile-panel" class="profile-panel"><summary>项目档案<span id="profile-count" class="count">0 个共享档案</span><span class="profile-actions"><button id="add-rule" data-section-action title="添加一条自定义规则" aria-label="添加自定义规则">+ 规则</button><button id="common-rules" data-section-action title="选择常用关联规则" aria-label="选择常用规则">常用</button><button id="caa-rules" data-section-action title="选择 CAA / C++ 关联规则" aria-label="选择 CAA 规则">CAA</button></span></summary><div class="profile-fields"><label>项目规则档案<select id="profile"><option value="">项目规则档案…</option></select></label><label>项目档案名称<span class="profile-save"><input id="profile-name" type="text" maxlength="256" placeholder="例如：Phoenix 产品改名" title="明确保存后写入当前项目 .phoenix/search-replace.json" /><button id="save-profile" type="button" title="保存到当前项目 .phoenix/search-replace.json">保存</button></span></label></div><p id="profile-error" class="profile-error" hidden></p></details>
    <div id="rules" class="rules"></div>
    <div id="related-candidates-panel" class="related-candidates" hidden><div class="related-candidates-title"><strong>相关写法（仅提示）</strong><span>可能是稳定 URL、协议或领域前缀；不会自动加入规则。</span></div><div id="related-candidates" class="related-candidates-list"></div></div>
    <div id="progress" class="muted" style="margin-top:10px"></div>
  </div></details>
  <details id="summary-section" class="section" open hidden><summary class="section-title"><h2>总览</h2><span class="count">风险与范围</span></summary><div class="body"><div id="summary" class="summary"></div><div id="root-suggestion" class="root-suggestion" hidden><span id="root-suggestion-text"></span><button id="rename-root" type="button" hidden>重命名根目录…</button><span id="root-rename-reason" class="reason muted"></span></div><div id="completion" class="completion" hidden><strong>完成门禁</strong><span id="completion-target" class="gate">目标未验证</span><span id="completion-plan" class="gate">计划未执行</span><span id="completion-remaining" class="gate">剩余 0 项</span><span id="completion-message" class="message muted"></span></div></div></details>
  <details id="results-section" class="section" open hidden><summary class="section-title"><h2>命中与风险</h2><span id="result-count" class="count"></span></summary><div class="results"><table><thead><tr><th class="col-risk">风险</th><th class="col-kind">分类</th><th class="col-source">来源</th><th class="col-target">目标 / 位置预览</th><th class="col-count">命中</th><th class="col-action">操作</th></tr></thead><tbody id="results"></tbody></table></div><div class="footer"><button id="load-more" hidden>加载更多</button></div></details>
</main><ktc-associated-rule-picker id="rule-picker"></ktc-associated-rule-picker><script nonce="${nonce}" src="${rulePickerUri}"></script><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
