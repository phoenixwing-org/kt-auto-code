import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../webviewSupport.js";

export type KtcReorderPreviewRow = {
  readonly uri: vscode.Uri;
  readonly relativePath: string;
  readonly kind: "header" | "source";
  readonly encoding: "UTF-8" | "UTF-8 BOM" | "GBK" | "未知";
  readonly changed: boolean;
  state: "unchanged" | "pending" | "applied" | "blocked" | "reverted";
  readonly warnings: readonly string[];
};

export interface KtcReorderApplyResult {
  readonly updates: readonly { uri: string; state: "applied" | "blocked"; warning?: string }[];
}

export interface KtcReorderRevertResult {
  readonly uri: string;
  readonly state: "reverted" | "blocked" | "cancelled";
  readonly warning?: string;
}

export interface KtcReorderMembersPanelActions {
  openFile(uri: string): Promise<void>;
  openGitDiff(uri: string): Promise<void>;
  revert(uri: string): Promise<KtcReorderRevertResult>;
  apply(uriStrings: readonly string[]): Promise<KtcReorderApplyResult>;
}

export class ReorderMembersPanel {
  private static current: ReorderMembersPanel | undefined;

  static show(
    rows: readonly KtcReorderPreviewRow[],
    scanned: number,
    actions: KtcReorderMembersPanelActions,
  ): void {
    if (this.current) {
      this.current.panel.reveal(vscode.ViewColumn.Active);
      this.current.render(rows, scanned, actions);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.reorderMembers",
      "C++ 成员排序预览",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.current = new ReorderMembersPanel(panel);
    this.current.render(rows, scanned, actions);
  }

  private actions?: KtcReorderMembersPanelActions;

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.onDidDispose(() => { ReorderMembersPanel.current = undefined; });
    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!isMessage(message) || !this.actions) return;
      if (message.type === "open") void this.actions.openFile(message.uri);
      if (message.type === "gitDiff") void this.actions.openGitDiff(message.uri);
      if (message.type === "revert") {
        void this.actions.revert(message.uri)
          .then((result) => this.panel.webview.postMessage({ type: "revertResult", result }))
          .catch((error) => this.panel.webview.postMessage({ type: "revertError", uri: message.uri, message: error instanceof Error ? error.message : String(error) }));
      }
      if (message.type === "apply") {
        void this.actions.apply(message.uris)
          .then((result) => this.panel.webview.postMessage({ type: "applyResult", result }))
          .catch((error) => this.panel.webview.postMessage({ type: "applyError", message: error instanceof Error ? error.message : String(error) }));
      }
    });
  }

  private render(
    rows: readonly KtcReorderPreviewRow[],
    scanned: number,
    actions: KtcReorderMembersPanelActions,
  ): void {
    this.actions = actions;
    const changed = rows.filter((row) => row.changed).length;
    const warnings = rows.reduce((count, row) => count + row.warnings.length, 0);
    const { nonce, csp } = ktcCreateWebviewSecurity(this.panel.webview);
    const serialized = JSON.stringify(rows.map((row) => ({ ...row, uri: row.uri.toString() }))).replace(/</g, "\\u003c");
    this.panel.webview.html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:13px}.page{width:100%;padding:12px 16px 24px}.head{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--vscode-panel-border);padding:0 0 9px}.title-line{display:flex;align-items:baseline;gap:10px;min-width:0}h1{font-size:18px;line-height:1.25;margin:0;white-space:nowrap}.muted,.note{color:var(--vscode-descriptionForeground)}.summary{display:flex;flex-wrap:wrap;gap:5px}.stat{padding:5px 8px;border:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background);border-radius:3px}.stat b{font-size:15px}.stat span{margin-left:5px;color:var(--vscode-descriptionForeground);font-size:11px}.toolbar{display:flex;align-items:center;gap:10px;margin:10px 0}.toolbar label{display:flex;align-items:center;gap:5px}.toolbar button{margin-left:auto}.changed-section{border-top:1px solid var(--vscode-panel-border)}.section-head{display:flex;align-items:center;gap:12px;padding:12px 0 8px}.section-label{padding-right:10px;border-right:3px solid var(--vscode-focusBorder);font-size:15px;font-weight:600;color:var(--vscode-descriptionForeground)}.run-kind{color:var(--vscode-descriptionForeground);font-size:14px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border-bottom:1px solid var(--vscode-panel-border);padding:9px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{color:var(--vscode-descriptionForeground);font-weight:600}tbody tr:nth-child(even){background:var(--vscode-list-inactiveSelectionBackground)}th:nth-child(1){width:32px}th:nth-child(2){width:44px;text-align:center}th:nth-child(3){width:auto}th:nth-child(4){width:88px;text-align:center}th:nth-child(5){width:82px;text-align:center}th:nth-child(6){width:96px;text-align:center}button{min-height:26px;padding:3px 8px;border:1px solid var(--vscode-button-border,transparent);border-radius:2px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button:disabled{opacity:.5;cursor:default}.path{padding:0;border:0;background:transparent;color:var(--vscode-textLink-foreground);font-family:var(--vscode-editor-font-family);text-align:left}.path:hover{text-decoration:underline}.tag{display:inline-block;min-width:58px;padding:2px 6px;border:1px solid;border-radius:5px;font-size:12px;line-height:18px}.tag.written{color:var(--vscode-testing-iconPassed);border-color:var(--vscode-testing-iconPassed)}.tag.pending{color:var(--vscode-editorWarning-foreground);border-color:var(--vscode-editorWarning-foreground)}.tag.blocked{color:var(--vscode-errorForeground);border-color:var(--vscode-errorForeground)}.tag.plain{color:var(--vscode-descriptionForeground);border-color:var(--vscode-panel-border)}.kind{display:inline-block;padding:2px 6px;border:1px solid var(--vscode-textLink-foreground);border-radius:5px;color:var(--vscode-textLink-foreground);font-family:var(--vscode-editor-font-family);font-size:12px;line-height:18px}.row-actions{display:flex;justify-content:center;gap:5px}.icon-button{min-width:26px;padding:2px 5px;color:var(--vscode-textLink-foreground);background:transparent;border-color:transparent;font-size:17px;line-height:18px}.icon-button:hover{background:var(--vscode-toolbar-hoverBackground)}.warning{color:var(--vscode-editorWarning-foreground)}.note{margin:10px 0 0}.empty{padding:28px 8px;text-align:center;color:var(--vscode-descriptionForeground)}@media(max-width:650px){.page{padding:10px}.head{align-items:flex-start;flex-direction:column;gap:6px}.toolbar{flex-wrap:wrap}.toolbar button{margin-left:0}th:nth-child(2),td:nth-child(2){display:none}th:nth-child(4){width:76px}th:nth-child(5){width:66px}th:nth-child(6){width:76px}}
</style></head><body><main class="page"><header class="head"><div class="title-line"><h1>C++ 成员排序</h1><span class="muted">共享 core · 预览后确认写回</span></div><div class="summary"><span class="stat"><b>${scanned}</b><span>扫描文件</span></span><span class="stat"><b>${changed}</b><span>可排序</span></span><span class="stat"><b>${warnings}</b><span>诊断</span></span></div></header><div class="toolbar"><label><input id="changed-only" type="checkbox" checked>仅显示有改动</label><span id="selection" class="muted"></span><button id="apply" disabled>应用所选</button></div><section class="changed-section"><header class="section-head"><span class="section-label">变更文件</span><span id="run-kind" class="run-kind"></span></header><table><thead><tr><th><input id="select-all" type="checkbox" title="全选当前预检结果"></th><th>#</th><th>文件</th><th>状态</th><th>类型</th><th>操作</th></tr></thead><tbody id="rows"></tbody></table><div id="empty" class="empty" hidden>没有符合筛选条件的文件</div></section><p class="note">预检阶段只打开原文件；写盘后可用 VS Code Git 预览差异，↶ 会恢复到本次排序前的内容。</p></main><script nonce="${nonce}">
const vscode=acquireVsCodeApi(),rows=${serialized},selected=new Set(rows.filter(r=>r.changed&&r.state==="pending").map(r=>r.uri)),reverting=new Set(),esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),$=id=>document.getElementById(id);function visible(){return rows.filter(r=>(!$("changed-only").checked||r.changed)&&r.state!=="reverted")}function pendingRows(list){return list.filter(r=>r.state==="pending")}function updateHeader(){const written=rows.filter(r=>r.state==="applied").length,pending=rows.filter(r=>r.state==="pending").length;$("run-kind").textContent=written?"已写盘 · 共 "+written+" 个":pending?"预检 · 共 "+pending+" 个":"本次无变更"}function update(){const list=visible(),pending=pendingRows(list),count=[...selected].filter(uri=>pending.some(r=>r.uri===uri)).length;$("selection").textContent=count?"已选 "+count+" 个文件":"未选择文件";$("apply").disabled=!selected.size;$("select-all").checked=!!pending.length&&pending.every(r=>selected.has(r.uri));$("select-all").indeterminate=!!count&&count<pending.length;$("empty").hidden=!!list.length;updateHeader()}function label(r){return r.state==="applied"?"已写盘":r.state==="pending"?"预检":r.state==="blocked"?"未写入":"无变更"}function tag(r){return r.state==="applied"?"written":r.state==="pending"?"pending":r.state==="blocked"?"blocked":"plain"}function fileType(path){const m=path.match(/(\.[^./]+)$/);return m?m[1]:"文件"}function actionHtml(r){if(r.state!=="applied")return '<span class="muted">—</span>';const busy=reverting.has(r.uri);return '<div class="row-actions"><button class="icon-button" data-git-diff="'+esc(r.uri)+'" title="在 VS Code Git 中预览差异" aria-label="预览差异">▣</button><button class="icon-button" data-revert="'+esc(r.uri)+'" '+(busy?"disabled":"")+' title="恢复到本次排序前的内容" aria-label="还原">↶</button></div>'}function render(){const list=visible();$("rows").innerHTML=list.map((r,index)=>'<tr><td><input type="checkbox" data-select="'+esc(r.uri)+'" '+(selected.has(r.uri)?"checked":"")+' '+(r.state!=="pending"?"disabled":"")+'></td><td>'+(index+1)+'</td><td><button class="path" data-open="'+esc(r.uri)+'">'+esc(r.relativePath)+'</button>'+(r.warnings.length?'<div class="warning">'+esc(r.warnings.join("；"))+'</div>':'')+'</td><td><span class="tag '+tag(r)+'">'+label(r)+'</span></td><td><span class="kind">'+esc(fileType(r.relativePath))+'</span></td><td>'+actionHtml(r)+'</td></tr>').join("");document.querySelectorAll("input[data-select]").forEach(x=>x.onchange=()=>{x.checked?selected.add(x.dataset.select):selected.delete(x.dataset.select);update()});document.querySelectorAll("button[data-open]").forEach(x=>x.onclick=()=>vscode.postMessage({type:"open",uri:x.dataset.open}));document.querySelectorAll("button[data-git-diff]").forEach(x=>x.onclick=()=>vscode.postMessage({type:"gitDiff",uri:x.dataset.gitDiff}));document.querySelectorAll("button[data-revert]").forEach(x=>x.onclick=()=>{const uri=x.dataset.revert;reverting.add(uri);render();vscode.postMessage({type:"revert",uri})});update()}$("changed-only").onchange=render;$("select-all").onchange=e=>{for(const r of pendingRows(visible()))e.target.checked?selected.add(r.uri):selected.delete(r.uri);render()};$("apply").onclick=()=>{const uris=[...selected];if(!uris.length)return;$("apply").disabled=true;vscode.postMessage({type:"apply",uris})};window.addEventListener("message",e=>{const m=e.data;if(m.type==="applyResult"){for(const u of m.result.updates||[]){const r=rows.find(r=>r.uri===u.uri);if(!r)continue;r.state=u.state;if(u.warning)r.warnings=[...r.warnings,u.warning];selected.delete(u.uri)}render()}else if(m.type==="revertResult"){const i=rows.findIndex(r=>r.uri===m.result.uri);reverting.delete(m.result.uri);if(i>=0){const r=rows[i];if(m.result.state==="reverted")rows.splice(i,1);else if(m.result.state==="blocked"){r.state="blocked";if(m.result.warning)r.warnings=[...r.warnings,m.result.warning]}}render()}else if(m.type==="revertError"){reverting.delete(m.uri);$("selection").textContent=m.message;render()}else if(m.type==="applyError"){$("selection").textContent=m.message;$("apply").disabled=false}});render();</script></body></html>`;
  }
}

function isMessage(value: unknown): value is { type: "open" | "gitDiff" | "revert"; uri: string } | { type: "apply"; uris: string[] } {
  if (!value || typeof value !== "object") return false;
  const message = value as { type?: unknown; uri?: unknown; uris?: unknown };
  return ((message.type === "open" || message.type === "gitDiff" || message.type === "revert") && typeof message.uri === "string")
    || (message.type === "apply" && Array.isArray(message.uris) && message.uris.every((uri) => typeof uri === "string"));
}
