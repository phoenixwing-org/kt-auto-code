import * as vscode from "vscode";
import { isAbsolute, relative, sep } from "node:path";
import type { RenameLevel } from "../../../src/workspaceRename.js";
import { getWorkspaceRoot } from "../workspace.js";
import type { KtcRenameResultViewModel } from "../../../src/renameResultViewModel.js";
import { resolveWorkspaceIgnorePatterns } from "../ignoreConfig.js";

type RenamePanelMessage =
  | { type: "ready" }
  | { type: "openPath"; path: string; level: RenameLevel; line?: number };

export class CodeRenamePanel {
  private static current: CodeRenamePanel | undefined;

  static async show(extensionUri: vscode.Uri): Promise<CodeRenamePanel | undefined> {
    const panel = this.open(extensionUri);
    return await panel.waitUntilReady() ? panel : undefined;
  }

  static open(extensionUri: vscode.Uri): CodeRenamePanel {
    if (this.current) {
      this.current.panel.reveal(vscode.ViewColumn.Active);
      return this.current;
    }
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.codeRename",
      "KT Auto Code · 搜索替换",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] },
    );
    this.current = new CodeRenamePanel(panel);
    return this.current;
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    panel.webview.html = getCodeRenameHtml(panel.webview);
    panel.onDidDispose(() => {
      this.setReady(false);
      CodeRenamePanel.current = undefined;
    });
    panel.webview.onDidReceiveMessage((message: RenamePanelMessage) => {
      void this.onMessage(message);
    });
  }

  private ready = false;
  private readonly readyPromise: Promise<boolean>;
  private resolveReady!: (ready: boolean) => void;
  private readySettled = false;

  private post(message: unknown): void {
    void this.panel.webview.postMessage(message);
  }

  private waitUntilReady(): Promise<boolean> {
    return this.ready ? Promise.resolve(true) : this.readyPromise;
  }

  private setReady(ready: boolean): void {
    this.ready = ready;
    if (!this.readySettled) {
      this.readySettled = true;
      this.resolveReady(ready);
    }
  }

  showRunning(apply: boolean): void {
    this.post({ type: "running", apply });
  }

  showReport(report: KtcRenameResultViewModel): void {
    this.post({ type: "report", report });
  }

  showError(message: string): void {
    this.post({ type: "error", message });
  }

  private async onMessage(message: RenamePanelMessage): Promise<void> {
    if (message.type === "ready") {
      this.setReady(true);
      const root = getWorkspaceRoot();
      this.post({
        type: "init",
        workspace: root ?? "",
        ignoreCount: root ? resolveWorkspaceIgnorePatterns(root).length : 0,
      });
      return;
    }
    if (message.type === "openPath") {
      const root = getWorkspaceRoot();
      if (!root || !isInsideRoot(root, message.path)) return;
      const uri = vscode.Uri.file(message.path);
      if (message.level === "dir") {
        await vscode.commands.executeCommand("revealInExplorer", uri);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Active });
      if (message.line) {
        const pos = new vscode.Position(Math.max(0, message.line - 1), 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      }
      return;
    }

  }

}

function getCodeRenameHtml(webview: vscode.Webview): string {
  const nonce = getNonce();
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>搜索替换</title>
<style>
*{box-sizing:border-box}[hidden]{display:none!important} body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font-family:var(--vscode-font-family);font-size:13px}button:focus-visible,.path:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}
.page{max-width:1200px;margin:0 auto;padding:20px 24px 34px}.head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:1px solid var(--vscode-panel-border);padding-bottom:14px}
h1{font-size:20px;font-weight:600;margin:0 0 5px}.muted{color:var(--vscode-descriptionForeground)}.meta{text-align:right;font-size:12px;line-height:1.6}
.status{margin:14px 0 10px;padding:8px 10px;border-left:3px solid var(--vscode-focusBorder);background:var(--vscode-textBlockQuote-background)}.status.error{border-left-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}
.summary{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}.stat{min-width:92px;padding:7px 9px;background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border);border-radius:3px}.stat strong{display:block;font-size:15px;font-weight:600}.stat span{font-size:11px;color:var(--vscode-descriptionForeground)}
.table-wrap{overflow:auto;border-top:1px solid var(--vscode-panel-border)}table{width:100%;min-width:860px;table-layout:fixed;border-collapse:collapse;font-size:12px}th{position:sticky;top:0;z-index:1;text-align:left;color:var(--vscode-descriptionForeground);background:var(--vscode-editor-background);font-weight:600;border-bottom:1px solid var(--vscode-panel-border);padding:8px}th:nth-child(1){width:21%}th:nth-child(2){width:76px}th:nth-child(3){width:54px}th:nth-child(4){width:21%}th:nth-child(5){width:145px}th:nth-child(6){width:25%}td{padding:8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top;overflow-wrap:anywhere}.path{font-family:var(--vscode-editor-font-family);cursor:pointer}.path:hover .path-name{text-decoration:underline;color:var(--vscode-textLink-foreground)}.path-name{font-weight:600}.error{color:var(--vscode-errorForeground)}.detail{color:var(--vscode-descriptionForeground)}.address{font-family:var(--vscode-editor-font-family);color:var(--vscode-descriptionForeground)}.badge{display:inline-block;padding:1px 6px;border-radius:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-size:11px}.empty{padding:42px 12px;text-align:center;color:var(--vscode-descriptionForeground)}.load-more{display:block;margin:12px auto;padding:5px 14px;border:0;border-radius:2px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}
@media(max-width:650px){.page{padding:14px}.head{flex-direction:column;gap:8px}.meta{text-align:left}.summary{gap:4px}.stat{min-width:80px}}
</style></head><body><main class="page">
<header class="head"><div><h1>搜索替换</h1><div class="muted">文本、文件名与文件夹名预览</div></div><div class="meta"><div id="workspace"></div><div id="ignore" class="muted"></div></div></header>
<p id="status" class="status">在 Side Bar 设置条件后开始预览。</p><div id="summary" class="summary"></div>
<div class="table-wrap"><table><thead><tr><th>Source</th><th>类型</th><th>命中</th><th>Target / 位置</th><th>编码与状态</th><th>地址</th></tr></thead><tbody id="rows"></tbody></table><div id="empty" class="empty">尚无预览结果</div><button id="load-more" class="load-more" hidden>继续加载</button></div>
</main><script nonce="${nonce}">
const vscode=acquireVsCodeApi();const $=id=>document.getElementById(id);const PAGE_SIZE=300;let hits=[];let visible=0;
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}
function attr(v){return esc(v).replace(/"/g,"&quot;")}
const levelLabel={dir:"文件夹",file:"文件名",text:"文本"};
function stat(label,value){return '<div class="stat"><strong>'+value+'</strong><span>'+label+'</span></div>'}
function appendRows(){const end=Math.min(visible+PAGE_SIZE,hits.length);for(let i=visible;i<end;i++){const h=hits[i],tr=document.createElement("tr");const compact=(h.encodingLabel?h.encodingLabel+" · ":"")+h.statusLabel+(h.detail?" · "+h.detail:"");tr.innerHTML='<td class="path" role="button" tabindex="0" title="'+attr(h.originalFullPath)+'"><span class="path-name">'+esc(h.sourceName)+'</span></td><td><span class="badge">'+esc(levelLabel[h.level]||h.level)+'</span></td><td>'+h.occurrences+'</td><td>'+esc(h.targetOrPositionLabel)+'</td><td class="status detail '+(h.statusLabel==="错误"?'error':'')+'">'+esc(compact)+'</td><td class="address" title="'+attr(h.originalFullPath)+'">'+esc(h.sourceAddress)+'</td>';const detailCell=tr.querySelector(".status");if(h.detail)detailCell.title=h.detail;const pathCell=tr.querySelector(".path"),open=()=>vscode.postMessage({type:"openPath",path:h.openPath,level:h.level,line:h.openLine});pathCell.onclick=open;pathCell.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open()}};$("rows").appendChild(tr)}visible=end;$("load-more").hidden=visible>=hits.length;if(!$("load-more").hidden)$("load-more").textContent="继续加载（"+visible+" / "+hits.length+"）"}
$("load-more").onclick=appendRows;
window.addEventListener("message",e=>{const m=e.data;if(m.type==="init"){$("workspace").textContent=m.workspace||"未打开工作区";$("ignore").textContent="Ignore · "+m.ignoreCount+" 条"}else if(m.type==="running"){$("status").className="status";$("status").textContent=m.apply?"正在执行替换…":"正在生成预览…"}else if(m.type==="error"){$("status").className="status error";$("status").textContent=m.message}else if(m.type==="report"){const r=m.report,s=r.summary,hasErrors=s.errors>0;$("status").className=hasErrors?"status error":"status";$("status").textContent=hasErrors?(r.applied?"写盘完成，但有 "+s.errors+" 个错误，请检查 Git diff。":"预检发现 "+s.errors+" 个冲突或错误，尚未写盘。"):(r.applied?"替换完成，请检查 Git diff。":"预览完成，尚未写盘。");$("summary").innerHTML=stat("命中规则",s.matchedRules+" / "+s.rules)+stat("替换",s.replacements)+stat("文本文件",s.textFiles)+stat("文件名",s.files)+stat("文件夹",s.directories)+stat("跳过",s.skipped)+stat("错误",s.errors);hits=r.rows;visible=0;$("rows").innerHTML="";$("empty").style.display=hits.length?"none":"block";if(!hits.length)$("empty").textContent="没有找到匹配项";appendRows()}});vscode.postMessage({type:"ready"});
</script></body></html>`;
}

function isInsideRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let i = 0; i < 32; i++) value += chars.charAt(Math.floor(Math.random() * chars.length));
  return value;
}
