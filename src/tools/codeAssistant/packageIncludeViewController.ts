import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import { ktcReadProjectEnvironment } from "../../projectEnvironment.js";
import {
  ktcApplyPackageIncludes,
  ktcPreviewPackageIncludes,
  ktcResolveCoreIncludeDirectory,
  type KtcPackageIncludePreview,
  type KtcPackageIncludePreviewSession,
} from "./packageIncludeService.js";

const TARGET_DIRECTORY_STATE_KEY = "ktAutoCode.codeAssistant.packageIncludes.targetDirectory";

type KtcPackageIncludeViewStatus = "idle" | "running" | "done" | "error";

interface KtcPackageIncludeViewState {
  readonly type: "state";
  readonly status: KtcPackageIncludeViewStatus;
  readonly message?: string;
  readonly coreRoot?: string;
  readonly coreIncludeDirectory?: string;
  readonly coreIncludeExists: boolean;
  readonly targetDirectory: string;
  readonly canApply: boolean;
  readonly preview?: KtcPackageIncludePreview;
}

type KtcPackageIncludeViewMessage =
  | { readonly type: "ready" }
  | { readonly type: "pickTarget"; readonly targetDirectory?: string }
  | { readonly type: "preview"; readonly targetDirectory: string }
  | { readonly type: "apply" }
  | { readonly type: "openFile"; readonly filePath: string; readonly line: number }
  | { readonly type: "openEnvironment" };

function isMessage(value: unknown): value is KtcPackageIncludeViewMessage {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return false;
  return ["ready", "pickTarget", "preview", "apply", "openFile", "openEnvironment"].includes(value.type);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

/** A single right-side WebviewPanel whose function is currently Package include repair. */
export class KtcPackageIncludeViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private session: KtcPackageIncludePreviewSession | undefined;
  private targetDirectory = "";
  private defaultTargetDirectory = "";
  private state: KtcPackageIncludeViewState = {
    type: "state",
    status: "idle",
    coreIncludeExists: false,
    targetDirectory: "",
    canApply: false,
  };
  private busy = false;

  constructor(
    private readonly workspaceState: Pick<vscode.Memento, "get" | "update">,
  ) {}

  async show(defaultTargetDirectory?: string): Promise<void> {
    this.defaultTargetDirectory = defaultTargetDirectory ?? this.defaultTargetDirectory;
    if (!this.targetDirectory) {
      this.targetDirectory = this.workspaceState.get<string>(TARGET_DIRECTORY_STATE_KEY) || this.defaultTargetDirectory;
    }
    if (this.panel) {
      this.panel.reveal(this.panel.viewColumn, false);
      await this.refreshEnvironment();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.packageIncludes",
      "代码辅助 · Package 头文件修正",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    this.panel = panel;
    panel.webview.html = getPackageIncludeHtml(panel.webview, this.state);
    panel.webview.onDidReceiveMessage((message: unknown) => {
      if (isMessage(message)) void this.handleMessage(message);
    });
    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = undefined;
        this.session = undefined;
      }
    });
    await this.refreshEnvironment();
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.session = undefined;
    panel?.dispose();
  }

  private async handleMessage(message: KtcPackageIncludeViewMessage): Promise<void> {
    if (message.type === "ready") {
      await this.refreshEnvironment();
      return;
    }
    if (message.type === "openEnvironment") {
      await vscode.commands.executeCommand("ktAutoCode.environment.open");
      return;
    }
    if (message.type === "pickTarget") {
      const defaultUri = message.targetDirectory && existsSync(message.targetDirectory)
        ? vscode.Uri.file(message.targetDirectory)
        : this.targetDirectory && existsSync(this.targetDirectory)
          ? vscode.Uri.file(this.targetDirectory)
          : this.defaultTargetDirectory && existsSync(this.defaultTargetDirectory)
            ? vscode.Uri.file(this.defaultTargetDirectory)
            : undefined;
      const selected = await vscode.window.showOpenDialog({
        title: "选择需要修正 Package include 的目标目录",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri,
        openLabel: "使用此目录",
      });
      if (!selected?.[0]) return;
      this.targetDirectory = selected[0].fsPath;
      this.session = undefined;
      await this.workspaceState.update(TARGET_DIRECTORY_STATE_KEY, this.targetDirectory);
      this.setState({ status: "idle", message: "目标目录已更新，请先预览。", preview: undefined, canApply: false });
      return;
    }
    if (message.type === "preview") {
      await this.preview(message.targetDirectory);
      return;
    }
    if (message.type === "apply") {
      await this.apply();
      return;
    }
    if (message.type === "openFile") {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(message.filePath));
      const editor = await vscode.window.showTextDocument(document, { preview: true });
      const position = new vscode.Position(Math.max(0, message.line - 1), 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }
  }

  private async refreshEnvironment(): Promise<void> {
    try {
      const environment = await ktcReadProjectEnvironment();
      const coreRoot = environment.values.find((value) => value.key === "coreRoot")?.value;
      const coreIncludeDirectory = coreRoot ? ktcResolveCoreIncludeDirectory(coreRoot) : undefined;
      this.setState({
        status: this.state.status === "error" ? "idle" : this.state.status,
        message: coreRoot ? this.state.message : "未读取到 ROOT_DIR_CORE；请先在工程环境中设置。",
        coreRoot,
        coreIncludeDirectory,
        coreIncludeExists: !!coreIncludeDirectory && existsSync(coreIncludeDirectory),
        targetDirectory: this.targetDirectory,
        preview: this.session?.preview,
        canApply: !!this.session?.preview.rows.length,
      });
    } catch (error) {
      this.setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        coreIncludeExists: false,
        targetDirectory: this.targetDirectory,
        canApply: false,
      });
    }
  }

  private async preview(targetDirectory: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.targetDirectory = targetDirectory.trim() || this.targetDirectory;
    this.session = undefined;
    await this.workspaceState.update(TARGET_DIRECTORY_STATE_KEY, this.targetDirectory);
    await this.refreshEnvironment();
    if (!this.state.coreIncludeDirectory || !this.state.coreIncludeExists) {
      this.busy = false;
      this.setState({ status: "error", message: "ROOT_DIR_CORE 的 include 目录不可用。", preview: undefined, canApply: false });
      return;
    }
    this.setState({ status: "running", message: "正在建立 Package 头文件映射并扫描目标目录…", preview: undefined, canApply: false });
    try {
      const session = await ktcPreviewPackageIncludes({
        coreIncludeDirectory: this.state.coreIncludeDirectory,
        targetDirectory: this.targetDirectory,
      });
      this.session = session;
      const { preview } = session;
      this.setState({
        status: "done",
        message: preview.rows.length
          ? `已扫描 ${preview.scannedFileCount} 个文件，发现 ${preview.rows.length} 处可修正 include。`
          : `已扫描 ${preview.scannedFileCount} 个文件，未发现需要修正的 include。`,
        preview,
        canApply: preview.rows.length > 0,
      });
    } catch (error) {
      this.setState({ status: "error", message: error instanceof Error ? error.message : String(error), preview: undefined, canApply: false });
    } finally {
      this.busy = false;
    }
  }

  private async apply(): Promise<void> {
    if (this.busy || !this.session || this.session.preview.rows.length === 0) return;
    const preview = this.session.preview;
    const action = await vscode.window.showWarningMessage(
      `将写入 ${preview.rows.length} 处 include（${this.session.files.length} 个文件）。写入前会复核预览后的文件变化。是否继续？`,
      { modal: true },
      "写入修正",
    );
    if (action !== "写入修正") return;
    this.busy = true;
    this.setState({ status: "running", message: "正在复核文件快照并写入 Package include 修正…" });
    try {
      const result = await ktcApplyPackageIncludes(this.session);
      this.session = undefined;
      this.setState({
        status: "done",
        message: `已修正 ${result.changedFiles} 个文件中的 ${result.changedIncludes} 处 include；请通过 Git diff 审查。`,
        preview,
        canApply: false,
      });
    } catch (error) {
      this.setState({ status: "error", message: error instanceof Error ? error.message : String(error), canApply: false });
    } finally {
      this.busy = false;
    }
  }

  private setState(update: Omit<Partial<KtcPackageIncludeViewState>, "type" | "targetDirectory" | "coreIncludeExists" | "canApply"> & {
    readonly targetDirectory?: string;
    readonly coreIncludeExists?: boolean;
    readonly canApply?: boolean;
  }): void {
    this.state = {
      ...this.state,
      ...update,
      type: "state",
      targetDirectory: update.targetDirectory ?? this.targetDirectory,
      coreIncludeExists: update.coreIncludeExists ?? this.state.coreIncludeExists,
      canApply: update.canApply ?? this.state.canApply,
    };
    void this.panel?.webview.postMessage(this.state);
  }
}

function getPackageIncludeHtml(webview: Pick<vscode.Webview, "cspSource">, initialState: KtcPackageIncludeViewState): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style>
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:14px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px/1.4 var(--vscode-font-family)}button,input{font:inherit}button{min-height:28px;padding:3px 11px;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}button:hover:not(:disabled){background:var(--vscode-button-secondaryHoverBackground)}button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button.primary:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}.header{display:flex;align-items:center;gap:10px;margin-bottom:13px;padding-bottom:10px;border-bottom:1px solid var(--vscode-panel-border)}.header h1{margin:0;font-size:16px}.header span{color:var(--vscode-descriptionForeground);font-size:12px}.section{margin:0 0 14px;padding:10px;border:1px solid var(--vscode-panel-border);border-radius:4px}.section h2{margin:0 0 8px;font-size:13px}.row{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:7px;align-items:center;margin:7px 0}.row label{color:var(--vscode-descriptionForeground)}input{width:100%;min-width:0;height:29px;padding:3px 7px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:2px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);font-family:var(--vscode-editor-font-family)}input[readonly]{color:var(--vscode-descriptionForeground)}input.ready{border-left:3px solid var(--vscode-testing-iconPassed,var(--vscode-focusBorder))}input.missing{border-left:3px solid var(--vscode-errorForeground)}.actions{display:flex;gap:7px;margin-top:10px}.status{margin:10px 0 0;padding:6px 8px;border-left:2px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);background:var(--vscode-textBlockQuote-background)}.status.error{border-left-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}.summary{display:flex;flex-wrap:wrap;gap:8px;margin:9px 0;color:var(--vscode-descriptionForeground);font-size:12px}.badge{padding:1px 6px;border:1px solid var(--vscode-panel-border);border-radius:999px}.warning{margin:8px 0;padding:7px;border-left:2px solid var(--vscode-editorWarning-foreground);background:var(--vscode-textBlockQuote-background);color:var(--vscode-descriptionForeground);font-size:12px}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border);border-radius:3px;max-height:calc(100vh - 360px)}table{width:max-content;min-width:100%;border-collapse:collapse;font-family:var(--vscode-editor-font-family);font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}th{position:sticky;top:0;background:var(--vscode-editor-background);text-align:left;color:var(--vscode-descriptionForeground);font-family:var(--vscode-font-family)}td.file{min-width:280px;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}td.line{text-align:right;white-space:pre}td.old,td.new{text-align:left;white-space:pre;max-width:440px;overflow:hidden;text-overflow:ellipsis}tr{cursor:pointer}tr:hover{background:var(--vscode-list-hoverBackground)}.empty{padding:10px;color:var(--vscode-descriptionForeground)}@media(max-width:640px){body{padding:8px}.row{grid-template-columns:1fr}.row label{margin-bottom:-4px}.table-wrap{max-height:calc(100vh - 390px)}}
</style></head><body>
<header class="header"><h1>Package 头文件修正</h1><span>代码辅助 · 预览后写入</span></header>
<section><h2>目录与环境</h2><div class="row"><label for="core-include">Package 目录</label><input id="core-include" readonly title="由 ROOT_DIR_CORE 推导的 include 目录" /><button id="open-env" type="button">工程环境</button></div><div class="row"><label for="target-directory">目标目录</label><input id="target-directory" spellcheck="false" placeholder="例如 E:/YourProject" /><button id="pick-target" type="button" title="选择目标目录">选择…</button></div><div class="actions"><button id="preview" class="primary" type="button">预览修正</button><button id="apply" type="button" disabled>写入修正</button></div><div class="status" id="status" role="status" aria-live="polite"></div></section>
<section><h2>预览</h2><div id="summary" class="summary"></div><div id="warnings"></div><div id="rows" class="empty">填写目标目录后点击“预览修正”。</div></section>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();let state=${safeJson(initialState)};const byId=id=>document.getElementById(id);const els={core:byId('core-include'),target:byId('target-directory'),preview:byId('preview'),apply:byId('apply'),status:byId('status'),summary:byId('summary'),warnings:byId('warnings'),rows:byId('rows')};
const esc=value=>String(value??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function render(){const running=state.status==='running';els.core.value=state.coreIncludeDirectory||'未设置 ROOT_DIR_CORE';els.core.className=state.coreIncludeExists?'ready':'missing';els.target.value=state.targetDirectory||'';els.preview.disabled=running||!state.coreIncludeExists;els.apply.disabled=running||!state.canApply;els.status.textContent=state.message||'';els.status.className='status '+(state.status==='error'?'error':'');const p=state.preview;if(!p){els.summary.innerHTML='';els.warnings.innerHTML='';els.rows.className='empty';els.rows.textContent='填写目标目录后点击“预览修正”。';return}els.summary.innerHTML='<span class="badge">映射 '+p.headerCount+' 个头文件</span><span class="badge">扫描 '+p.scannedFileCount+' 个文件</span><span class="badge">命中 '+p.rows.length+' 处</span>'+(p.unsupportedFileCount?'<span class="badge">跳过 '+p.unsupportedFileCount+' 个未知编码文件</span>':'');const warnings=[];if(p.collisions.length)warnings.push('同名冲突 '+p.collisions.length+' 个，已全部排除，不会自动替换。');if(p.skippedHeaderCount)warnings.push('有 '+p.skippedHeaderCount+' 个头文件不在 source 目录结构中，未加入映射。');els.warnings.innerHTML=warnings.map(item=>'<div class="warning">'+esc(item)+'</div>').join('');if(!p.rows.length){els.rows.className='empty';els.rows.textContent='未发现可修正的 include。';return}els.rows.className='table-wrap';els.rows.innerHTML='<table><thead><tr><th>文件 @ 目录</th><th>行</th><th>旧值</th><th>新值</th></tr></thead><tbody>'+p.rows.map(row=>'<tr data-file="'+esc(row.filePath)+'" data-line="'+row.line+'" title="打开 '+esc(row.relativePath)+' 第 '+row.line+' 行"><td class="file">'+esc(row.fileName)+(row.directory?' @ '+esc(row.directory):'')+'</td><td class="line">'+row.line+'</td><td class="old">'+esc(row.oldValue)+'</td><td class="new">'+esc(row.newValue)+'</td></tr>').join('')+'</tbody></table>';for(const row of els.rows.querySelectorAll('tr[data-file]'))row.onclick=()=>vscode.postMessage({type:'openFile',filePath:row.dataset.file,line:Number(row.dataset.line)});}
byId('pick-target').onclick=()=>vscode.postMessage({type:'pickTarget',targetDirectory:els.target.value});byId('open-env').onclick=()=>vscode.postMessage({type:'openEnvironment'});els.preview.onclick=()=>vscode.postMessage({type:'preview',targetDirectory:els.target.value});els.apply.onclick=()=>vscode.postMessage({type:'apply'});els.target.oninput=()=>{els.apply.disabled=true;els.status.textContent='目标目录已编辑，请重新预览后再写入。';els.status.className='status'};els.target.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();els.preview.click()}};window.addEventListener('message',event=>{if(event.data?.type==='state'){state=event.data;render()}});render();vscode.postMessage({type:'ready'});
</script></body></html>`;
}
