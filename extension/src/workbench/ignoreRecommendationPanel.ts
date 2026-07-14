import * as vscode from "vscode";
import type { KtcIgnoreGroupRecommendation } from "../../../src/ignoreRecommendation.js";
import { ktcCreateWebviewSecurity } from "../webviewSupport.js";
import {
  ktcIsIgnoreRecommendationPanelMessage,
  type KtcIgnoreRecommendationPanelMessage,
} from "./panelMessageGuards.js";

export interface KtcIgnoreRecommendationReport {
  workspace: string;
  truncated: boolean;
  catalogError?: string;
  recommendations: readonly KtcIgnoreGroupRecommendation[];
}

export class KtcIgnoreRecommendationPanel {
  private static current: KtcIgnoreRecommendationPanel | undefined;

  static show(
    report: KtcIgnoreRecommendationReport,
    applyGroups: (groupIds: readonly string[]) => Promise<string>,
  ): void {
    if (this.current) {
      this.current.report = report;
      this.current.applyGroups = applyGroups;
      this.current.panel.reveal(vscode.ViewColumn.Active);
      this.current.postReport();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.ignoreRecommendations",
      "KT Auto Code · Ignore 推荐",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.current = new KtcIgnoreRecommendationPanel(panel, report, applyGroups);
  }

  private ready = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private report: KtcIgnoreRecommendationReport,
    private applyGroups: (groupIds: readonly string[]) => Promise<string>,
  ) {
    panel.webview.html = getHtml(panel.webview);
    panel.onDidDispose(() => {
      KtcIgnoreRecommendationPanel.current = undefined;
    });
    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (ktcIsIgnoreRecommendationPanelMessage(message)) void this.onMessage(message);
    });
  }

  private postReport(): void {
    if (this.ready) void this.panel.webview.postMessage({ type: "report", report: this.report });
  }

  private async onMessage(message: KtcIgnoreRecommendationPanelMessage): Promise<void> {
    if (message.type === "ready") {
      this.ready = true;
      this.postReport();
      return;
    }
    if (message.type !== "applyGroups") return;
    try {
      const result = await this.applyGroups(message.groupIds);
      void this.panel.webview.postMessage({ type: "applied", message: result, groupIds: message.groupIds });
    } catch (error) {
      void this.panel.webview.postMessage({
        type: "applyError",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function getHtml(webview: vscode.Webview): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Ignore 推荐</title><style>
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px var(--vscode-font-family)}button:focus-visible,input:focus-visible,summary:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
.page{width:100%;max-width:none;margin:0;padding:12px 16px 24px}.head{display:flex;justify-content:space-between;gap:16px;align-items:baseline;border-bottom:1px solid var(--vscode-panel-border);padding:0 0 9px}
h1{font-size:18px;font-weight:600;line-height:1.25;margin:0;white-space:nowrap}.title-line{display:flex;align-items:baseline;gap:10px;min-width:0}.muted{color:var(--vscode-descriptionForeground)}.title-line #workspace{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.head> .muted{white-space:nowrap}.status{margin:10px 0 8px;padding:6px 9px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textBlockQuote-background)}.status.error{border-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0}.groups{border-top:1px solid var(--vscode-panel-border)}.group{padding:10px 4px;border-bottom:1px solid var(--vscode-panel-border)}
.group-head{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:start}.group-title{font-weight:600}.badges{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.badge{padding:1px 6px;border-radius:8px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-size:11px}.badge.warn{color:var(--vscode-editorWarning-foreground);background:transparent;border:1px solid currentColor}
.summary{margin-top:4px;font-size:12px;color:var(--vscode-descriptionForeground)}details{margin:7px 0 0 30px}summary{cursor:pointer;color:var(--vscode-textLink-foreground)}ul{margin:6px 0;padding-left:20px}.blocked{color:var(--vscode-errorForeground)}button{min-height:28px;padding:4px 12px;border:1px solid transparent;border-radius:2px;color:var(--vscode-button-foreground);background:var(--vscode-button-background);cursor:pointer}button:disabled{opacity:.5;cursor:default}
@media(max-width:620px){.page{padding:10px}.head{align-items:flex-start;flex-direction:column;gap:5px}.group-head{grid-template-columns:22px minmax(0,1fr)}.badges{grid-column:2;justify-content:flex-start}}
</style></head><body><main class="page"><header class="head"><div class="title-line"><h1>Ignore 分析推荐</h1><span class="muted" id="workspace"></span></div><div class="muted">逐组确认，不自动保存</div></header>
<p class="status" id="status">正在分析…</p><div class="toolbar"><span class="muted" id="selection">尚未选择</span><button id="apply" disabled>追加所选</button></div><div class="groups" id="groups"></div>
</main><script nonce="${nonce}">
const vscode=acquireVsCodeApi(),$=id=>document.getElementById(id);let report=null;
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function selected(){return [...document.querySelectorAll('input[data-group]:checked')].map(x=>x.dataset.group)}
function updateSelection(){const ids=selected();$("selection").textContent=ids.length?"已选择 "+ids.length+" 组":"尚未选择";$("apply").disabled=!ids.length||!!report?.catalogError}
function render(r){report=r;$("workspace").textContent=r.workspace;$("groups").innerHTML="";const notes=[];if(r.truncated)notes.push("扫描达到上限，推荐可能不完整");if(r.catalogError)notes.push("工作区规则目录错误："+r.catalogError);$("status").className="status"+(r.catalogError?" error":"");$("status").textContent=notes.length?notes.join("；"):"分析完成。推荐组默认未选，请查看证据后确认。";
if(!r.recommendations.length){$("groups").innerHTML='<p class="muted">未发现可推荐的规则组。</p>';updateSelection();return}
for(const g of r.recommendations){const row=document.createElement("section");row.className="group";const blocked=g.blockedRules||[];const evidence=(g.evidence||[]).slice(0,5);const rules=g.suggestedRules||[];row.innerHTML='<div class="group-head"><input type="checkbox" data-group="'+esc(g.groupId)+'" '+(rules.length&&!r.catalogError?'':'disabled')+' /><div><div class="group-title">'+esc(g.title)+'</div><div class="summary">'+esc(g.description)+' · 新增 '+rules.length+' · 已有 '+(g.existingRules||[]).length+(blocked.length?' · 阻止 '+blocked.length:'')+'</div></div><div class="badges"><span class="badge">'+esc(g.confidence)+'</span>'+(g.reviewRequired?'<span class="badge warn">需确认</span>':'')+'</div></div><details><summary>证据与规则</summary><ul>'+evidence.map(e=>'<li>'+esc(e.label)+(e.path?'：'+esc(e.path):'')+'</li>').join("")+'</ul><div class="muted">'+rules.map(x=>esc(x.value)).join(" · ")+'</div>'+(blocked.length?'<ul class="blocked">'+blocked.map(x=>'<li>'+esc(x.rule.value)+' 命中已跟踪文件：'+esc(x.trackedPaths.join(", "))+'</li>').join("")+'</ul>':'')+'</details>';row.querySelector("input").onchange=updateSelection;$("groups").appendChild(row)}updateSelection()}
$("apply").onclick=()=>{const ids=selected();if(!ids.length)return;$("apply").disabled=true;$("status").className="status";$("status").textContent="正在追加所选规则组…";vscode.postMessage({type:"applyGroups",groupIds:ids})};
window.addEventListener("message",e=>{const m=e.data;if(m.type==="report")render(m.report);else if(m.type==="applied"){$("status").className="status";$("status").textContent=m.message;const applied=new Set(m.groupIds||[]);document.querySelectorAll('input[data-group]').forEach(x=>{x.checked=false;if(applied.has(x.dataset.group))x.disabled=true});updateSelection()}else if(m.type==="applyError"){$("status").className="status error";$("status").textContent=m.message;updateSelection()}});vscode.postMessage({type:"ready"});
</script></body></html>`;
}
