import * as vscode from "vscode";
import type { ToolUiState } from "../tools/types.js";
import { getWorkspaceRoot } from "../workspace.js";
import { ktcCreateWebviewSecurity } from "../webviewSupport.js";
import { ktcOpenWorkspaceResource } from "../workspaceResource.js";
import {
  ktcIsHeaderAsciiPanelMessage,
  type KtcHeaderAsciiPanelMessage,
} from "./panelMessageGuards.js";

export class HeaderAsciiPanel {
  private static current: HeaderAsciiPanel | undefined;

  static show(state: ToolUiState): void {
    if (!this.current) {
      const panel = vscode.window.createWebviewPanel(
        "ktAutoCode.headerAsciiResults",
        "KT Auto Code · 头文件 ASCII 修正",
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.current = new HeaderAsciiPanel(panel);
    } else {
      this.current.panel.reveal(vscode.ViewColumn.Active);
    }
    this.current.update(state);
  }

  private ready = false;
  private latest: ToolUiState = { status: "idle" };

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.html = getHtml(panel.webview);
    panel.onDidDispose(() => { HeaderAsciiPanel.current = undefined; });
    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (ktcIsHeaderAsciiPanelMessage(message)) void this.onMessage(message);
    });
  }

  private update(state: ToolUiState): void {
    this.latest = state;
    if (this.ready) void this.panel.webview.postMessage({ type: "state", state });
  }

  private async onMessage(message: KtcHeaderAsciiPanelMessage): Promise<void> {
    if (message.type === "ready") {
      this.ready = true;
      void this.panel.webview.postMessage({ type: "state", state: this.latest });
      return;
    }
    const root = getWorkspaceRoot();
    if (!root) return;
    await ktcOpenWorkspaceResource({
      root,
      target: message.file,
      kind: "text",
      line: message.line,
    });
  }
}

function getHtml(webview: vscode.Webview): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>头文件 ASCII 修正</title><style>
*{box-sizing:border-box}body{margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);font:13px var(--vscode-font-family)}.path:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
.page{max-width:1100px;margin:0 auto;padding:20px 24px 34px}h1{font-size:20px;font-weight:600;margin:0 0 5px}.muted{color:var(--vscode-descriptionForeground)}
.head{padding-bottom:14px;border-bottom:1px solid var(--vscode-panel-border)}.status{margin:14px 0 10px;padding:8px 10px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textBlockQuote-background)}.status.error{border-left-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}
.summary{display:flex;gap:6px;margin-bottom:14px}.stat{min-width:110px;padding:7px 9px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:3px}.stat strong{display:block;font-size:15px}.stat span{font-size:11px;color:var(--vscode-descriptionForeground)}
.table-wrap{overflow:auto;border-top:1px solid var(--vscode-panel-border)}table{width:100%;min-width:680px;table-layout:fixed;border-collapse:collapse;font-size:12px}th{position:sticky;top:0;text-align:left;color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background);padding:8px;border-bottom:1px solid var(--vscode-panel-border)}th:nth-child(1){width:38%}th:nth-child(2){width:70px}td{padding:8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top;overflow-wrap:anywhere}.path{font-family:var(--vscode-editor-font-family);cursor:pointer}.path:hover{text-decoration:underline;color:var(--vscode-textLink-foreground)}.detail{color:var(--vscode-descriptionForeground);line-height:1.55}.count{font-weight:600}.error{color:var(--vscode-errorForeground)}.empty{padding:42px 12px;text-align:center;color:var(--vscode-descriptionForeground)}
</style></head><body><main class="page"><header class="head"><h1>头文件 ASCII 修正</h1><div class="muted">非 ASCII 字节预检结果</div></header><div id="status" class="status">等待预检…</div><div id="summary" class="summary"></div>
<div class="table-wrap"><table><thead><tr><th>文件</th><th>问题</th><th>位置与修正</th></tr></thead><tbody id="rows"></tbody></table><div id="empty" class="empty">尚无预检结果</div></div></main>
<script nonce="${nonce}">const vscode=acquireVsCodeApi(),$=id=>document.getElementById(id);function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
window.addEventListener("message",e=>{const s=e.data.state;if(!s)return;$("status").className=s.status==="error"?"status error":"status";$("status").textContent=s.message||"";const items=s.results||[];$("summary").innerHTML=s.status==="running"?"":'<div class="stat"><strong>'+(s.scanned??0)+'</strong><span>已扫描文件</span></div><div class="stat"><strong>'+(s.issueFiles??0)+'</strong><span>问题文件</span></div>';$("rows").innerHTML="";$("empty").style.display=items.length?"none":"block";if(!items.length&&s.status==="done")$("empty").textContent=(s.issueFiles??0)===0?"未发现非 ASCII 问题":"没有可显示的结果";for(const item of items){const tr=document.createElement("tr");const issues=item.issues||[];let detail=issues.slice(0,3).map(x=>"L"+x.line+":C"+x.column+" "+x.fromLabel+"→"+x.toLabel).join(" · ");if(issues.length>3)detail+=" · ……等 "+issues.length+" 处";tr.innerHTML='<td class="path" role="button" tabindex="0">'+esc(item.relativePath||item.file)+'</td><td class="count">'+item.issueCount+'</td><td class="detail">'+esc(detail)+'</td>';const pathCell=tr.querySelector(".path"),open=()=>vscode.postMessage({type:"openIssue",file:item.fullPath,line:item.topLine});pathCell.onclick=open;pathCell.onkeydown=x=>{if(x.key==="Enter"||x.key===" "){x.preventDefault();open()}};$("rows").appendChild(tr)}});vscode.postMessage({type:"ready"});</script></body></html>`;
}
