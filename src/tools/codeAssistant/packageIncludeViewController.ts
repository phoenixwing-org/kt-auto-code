import { existsSync } from "node:fs";
import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import { ktcReadProjectEnvironment } from "../../projectEnvironment.js";
import {
  ktcApplyPackageIncludes,
  ktcPreviewPackageIncludes,
  ktcResolveDefaultPackageIncludeDirectory,
  ktcResolvePackageIncludeDirectoryFromPublicInclude,
  type KtcPackageIncludePreview,
  type KtcPackageIncludePreviewSession,
} from "./packageIncludeService.js";

const PACKAGE_DIRECTORY_STATE_KEY = "ktAutoCode.codeAssistant.packageIncludes.packageDirectory";

type KtcPackageIncludeViewStatus = "idle" | "running" | "done" | "error";

interface KtcPackageIncludeViewState {
  readonly type: "state";
  readonly status: KtcPackageIncludeViewStatus;
  readonly message?: string;
  readonly sdkPrefix?: string;
  readonly includeRoot?: string;
  readonly packageDirectory?: string;
  readonly packageDirectoryExists: boolean;
  readonly targetDirectory: string;
  readonly canApply: boolean;
  readonly preview?: KtcPackageIncludePreview;
}

type KtcPackageIncludeViewMessage =
  | { readonly type: "ready" }
  | { readonly type: "useEnvironmentPackageDirectory"; readonly source: "include" | "root" }
  | { readonly type: "pickPackageDirectory"; readonly packageDirectory?: string }
  | { readonly type: "preview"; readonly packageDirectory: string }
  | { readonly type: "apply" }
  | { readonly type: "openFile"; readonly filePath: string; readonly line: number }
  | { readonly type: "openEnvironment" };

function isMessage(value: unknown): value is KtcPackageIncludeViewMessage {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string") return false;
  return ["ready", "useEnvironmentPackageDirectory", "pickPackageDirectory", "preview", "apply", "openFile", "openEnvironment"].includes(value.type);
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

/** A single right-side WebviewPanel whose function is currently Package include repair. */
export class KtcPackageIncludeViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private session: KtcPackageIncludePreviewSession | undefined;
  private packageDirectory = "";
  private targetDirectory = "";
  private defaultTargetDirectory = "";
  private state: KtcPackageIncludeViewState = {
    type: "state",
    status: "idle",
    packageDirectoryExists: false,
    targetDirectory: "",
    canApply: false,
  };
  private busy = false;

  constructor(
    private readonly workspaceState: Pick<vscode.Memento, "get" | "update">,
  ) {}

  async show(defaultTargetDirectory?: string): Promise<void> {
    this.defaultTargetDirectory = defaultTargetDirectory ?? this.defaultTargetDirectory;
    if (defaultTargetDirectory) this.targetDirectory = defaultTargetDirectory;
    if (!this.packageDirectory) this.packageDirectory = this.workspaceState.get<string>(PACKAGE_DIRECTORY_STATE_KEY) || "";
    if (!this.targetDirectory) this.targetDirectory = this.defaultTargetDirectory;
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
    if (message.type === "useEnvironmentPackageDirectory") {
      const environment = await ktcReadProjectEnvironment();
      const rootDirectory = environment.values.find((value) => value.key === "customRoot")?.value;
      const includeRoot = environment.values.find((value) => value.key === "includeRoot")?.value;
      this.packageDirectory = message.source === "include"
        ? (includeRoot ? ktcResolvePackageIncludeDirectoryFromPublicInclude(includeRoot) : "")
        : (rootDirectory ? ktcResolveDefaultPackageIncludeDirectory(rootDirectory) : "");
      this.session = undefined;
      await this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, this.packageDirectory);
      await this.refreshEnvironment(
        this.packageDirectory
          ? (message.source === "include" ? "ROOT_DIR_INCLUDE" : "ROOT_DIR/kt/core/include") + " 推导的 Package 目录已填入，请先预览。"
          : "未读取到 " + (message.source === "include" ? "ROOT_DIR_INCLUDE" : "ROOT_DIR") + "。",
      );
      return;
    }
    if (message.type === "pickPackageDirectory") {
      const candidate = message.packageDirectory?.trim() || this.packageDirectory || this.state.packageDirectory;
      const selected = await vscode.window.showOpenDialog({
        title: "选择 Package include 目录",
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: candidate && existsSync(candidate) ? vscode.Uri.file(candidate) : undefined,
        openLabel: "使用此目录",
      });
      if (!selected?.[0]) return;
      this.packageDirectory = selected[0].fsPath;
      this.session = undefined;
      await this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, this.packageDirectory);
      await this.refreshEnvironment("Package 目录已更新，请先预览。");
      return;
    }
    if (message.type === "preview") {
      await this.preview(message.packageDirectory);
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

  private async refreshEnvironment(message = this.state.message): Promise<void> {
    try {
      const environment = await ktcReadProjectEnvironment();
      const sdkPrefix = environment.values.find((value) => value.key === "sdkPrefix")?.value;
      const rootDirectory = environment.values.find((value) => value.key === "customRoot")?.value;
      const includeRoot = environment.values.find((value) => value.key === "includeRoot")?.value;
      const packageDirectory = this.packageDirectory
        || (includeRoot ? ktcResolvePackageIncludeDirectoryFromPublicInclude(includeRoot) : "")
        || (rootDirectory ? ktcResolveDefaultPackageIncludeDirectory(rootDirectory) : "");
      this.setState({
        status: this.state.status === "error" ? "idle" : this.state.status,
        message: includeRoot || rootDirectory ? message : "未读取到 ROOT_DIR_INCLUDE 或 ROOT_DIR；请先在工程环境中设置，或直接填写 Package 目录。",
        sdkPrefix,
        includeRoot,
        packageDirectory,
        packageDirectoryExists: !!packageDirectory && existsSync(packageDirectory),
        targetDirectory: this.targetDirectory,
        preview: this.session?.preview,
        canApply: !!this.session?.preview.rows.length,
      });
    } catch (error) {
      this.setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        packageDirectoryExists: false,
        targetDirectory: this.targetDirectory,
        canApply: false,
      });
    }
  }

  private async preview(packageDirectory: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.packageDirectory = packageDirectory.trim() || this.packageDirectory;
    this.session = undefined;
    await this.workspaceState.update(PACKAGE_DIRECTORY_STATE_KEY, this.packageDirectory);
    await this.refreshEnvironment();
    if (!this.targetDirectory) {
      this.busy = false;
      this.setState({ status: "error", message: "未确定插件当前目录；请先在 Primary 目录行选择目录。", preview: undefined, canApply: false });
      return;
    }
    if (!this.state.packageDirectory || !this.state.packageDirectoryExists) {
      this.busy = false;
      this.setState({ status: "error", message: "Package include 目录不可用；请检查 ROOT_DIR_INCLUDE、ROOT_DIR 或直接修改目录。", preview: undefined, canApply: false });
      return;
    }
    this.setState({ status: "running", message: "正在建立 Package 头文件映射并扫描目标目录…", preview: undefined, canApply: false });
    try {
      const session = await ktcPreviewPackageIncludes({
        coreIncludeDirectory: this.state.packageDirectory,
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

  private setState(update: Omit<Partial<KtcPackageIncludeViewState>, "type" | "targetDirectory" | "packageDirectoryExists" | "canApply"> & {
    readonly targetDirectory?: string;
    readonly packageDirectoryExists?: boolean;
    readonly canApply?: boolean;
  }): void {
    this.state = {
      ...this.state,
      ...update,
      type: "state",
      targetDirectory: update.targetDirectory ?? this.targetDirectory,
      packageDirectoryExists: update.packageDirectoryExists ?? this.state.packageDirectoryExists,
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
:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:8px;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px/1.4 var(--vscode-font-family)}button,input{font:inherit}button{min-height:28px;padding:3px 11px;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;color:var(--vscode-button-secondaryForeground);background:var(--vscode-button-secondaryBackground);cursor:pointer}button:hover:not(:disabled){background:var(--vscode-button-secondaryHoverBackground)}button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}button.primary:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}.command-header{position:sticky;top:0;z-index:3;display:flex;justify-content:flex-end;gap:7px;margin:-8px -8px 8px;padding:7px 8px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.section{margin:0 0 8px;padding:7px;border:1px solid var(--vscode-panel-border);border-radius:4px}.section h2{margin:0 0 5px;font-size:13px}.row{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:7px;align-items:center;margin:5px 0}.row label{color:var(--vscode-descriptionForeground)}.directory-actions{display:flex;gap:5px}.directory-actions button{padding-inline:7px;white-space:nowrap}input{width:100%;min-width:0;height:29px;padding:3px 7px;border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:2px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);font-family:var(--vscode-editor-font-family)}input.ready{border-left:3px solid var(--vscode-testing-iconPassed,var(--vscode-focusBorder))}input.missing{border-left:3px solid var(--vscode-errorForeground)}.context{margin:5px 0 0;padding:4px 0;color:var(--vscode-descriptionForeground);font-size:12px}.context code{color:var(--vscode-foreground);font-family:var(--vscode-editor-font-family);word-break:break-all}.actions{display:flex;gap:7px;margin-top:7px}.status{margin:7px 0 0;padding:5px 7px;border-left:2px solid var(--vscode-panel-border);color:var(--vscode-descriptionForeground);background:var(--vscode-textBlockQuote-background)}.status.error{border-left-color:var(--vscode-errorForeground);color:var(--vscode-errorForeground)}.summary{display:flex;flex-wrap:wrap;gap:8px;margin:7px 0;color:var(--vscode-descriptionForeground);font-size:12px}.badge{padding:1px 6px;border:1px solid var(--vscode-panel-border);border-radius:999px}.warning{margin:7px 0;padding:7px;border-left:2px solid var(--vscode-editorWarning-foreground);background:var(--vscode-textBlockQuote-background);color:var(--vscode-descriptionForeground);font-size:12px}.table-wrap{overflow:auto;border:1px solid var(--vscode-panel-border);border-radius:3px;max-height:calc(100vh - 300px)}table{width:max-content;min-width:100%;border-collapse:collapse;font-family:var(--vscode-editor-font-family);font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid var(--vscode-panel-border);vertical-align:top}th{position:sticky;top:0;background:var(--vscode-editor-background);text-align:left;color:var(--vscode-descriptionForeground);font-family:var(--vscode-font-family)}td.file{min-width:280px;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}td.line{text-align:right;white-space:pre}td.old,td.new{text-align:left;white-space:pre;max-width:440px;overflow:hidden;text-overflow:ellipsis}tr{cursor:pointer}tr:hover{background:var(--vscode-list-hoverBackground)}.empty{padding:8px;color:var(--vscode-descriptionForeground)}@media(max-width:640px){body{padding:6px}.command-header{margin:-6px -6px 6px;padding:6px}.row{grid-template-columns:1fr}.row label{margin-bottom:-4px}.table-wrap{max-height:calc(100vh - 330px)}}
</style></head><body>
<header class="command-header"><button id="preview" class="primary" type="button">预览修正</button><button id="apply" type="button" disabled>写入修正</button></header>
<section><h2>目录与环境</h2><div class="row"><label for="package-directory">Package 目录</label><input id="package-directory" spellcheck="false" title="优先由 ROOT_DIR_INCLUDE 推导；未设置时使用 ROOT_DIR/kt/core/include" /><span class="directory-actions"><button id="use-include-root" type="button" title="按 ROOT_DIR_INCLUDE 推导 package 根">ROOT_DIR_INCLUDE</button><button id="use-root-directory" type="button" title="按 ROOT_DIR/kt/core/include 推导 package 根">ROOT_DIR</button><button id="pick-package" type="button" title="选择 Package include 目录">选择…</button></span></div><div class="context">目标目录（插件当前目录）：<code id="target-directory"></code></div><div class="actions"><button id="open-env" type="button">工程环境</button></div><div class="status" id="status" role="status" aria-live="polite"></div></section>
<section><h2>预览</h2><div id="summary" class="summary"></div><div id="warnings"></div><div id="rows" class="empty">填写 Package 目录后点击“预览修正”。</div></section>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();let state=${safeJson(initialState)};const byId=id=>document.getElementById(id);const els={packageDirectory:byId('package-directory'),targetDirectory:byId('target-directory'),preview:byId('preview'),apply:byId('apply'),status:byId('status'),summary:byId('summary'),warnings:byId('warnings'),rows:byId('rows')};
const esc=value=>String(value??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function render(){const running=state.status==='running';els.packageDirectory.value=state.packageDirectory||'';els.packageDirectory.className=state.packageDirectoryExists?'ready':'missing';els.targetDirectory.textContent=state.targetDirectory||'未选择';els.targetDirectory.title=state.targetDirectory||'未选择';els.preview.disabled=running||!els.packageDirectory.value.trim();els.apply.disabled=running||!state.canApply;els.status.textContent=state.message||'';els.status.className='status '+(state.status==='error'?'error':'');const p=state.preview;if(!p){els.summary.innerHTML='';els.warnings.innerHTML='';els.rows.className='empty';els.rows.textContent='填写 Package 目录后点击“预览修正”。';return}els.summary.innerHTML='<span class="badge">映射 '+p.headerCount+' 个头文件</span><span class="badge">扫描 '+p.scannedFileCount+' 个文件</span><span class="badge">命中 '+p.rows.length+' 处</span>'+(p.unsupportedFileCount?'<span class="badge">跳过 '+p.unsupportedFileCount+' 个未知编码文件</span>':'');const warnings=[];if(p.collisions.length)warnings.push('同名冲突 '+p.collisions.length+' 个，已全部排除，不会自动替换。');if(p.skippedHeaderCount)warnings.push('有 '+p.skippedHeaderCount+' 个头文件不在 source 目录结构中，未加入映射。');els.warnings.innerHTML=warnings.map(item=>'<div class="warning">'+esc(item)+'</div>').join('');if(!p.rows.length){els.rows.className='empty';els.rows.textContent='未发现可修正的 include。';return}els.rows.className='table-wrap';els.rows.innerHTML='<table><thead><tr><th>文件 @ 目录</th><th>行</th><th>旧值</th><th>新值</th></tr></thead><tbody>'+p.rows.map(row=>'<tr data-file="'+esc(row.filePath)+'" data-line="'+row.line+'" title="打开 '+esc(row.relativePath)+' 第 '+row.line+' 行"><td class="file">'+esc(row.fileName)+(row.directory?' @ '+esc(row.directory):'')+'</td><td class="line">'+row.line+'</td><td class="old">'+esc(row.oldValue)+'</td><td class="new">'+esc(row.newValue)+'</td></tr>').join('')+'</tbody></table>';for(const row of els.rows.querySelectorAll('tr[data-file]'))row.onclick=()=>vscode.postMessage({type:'openFile',filePath:row.dataset.file,line:Number(row.dataset.line)});}
function invalidate(message){els.apply.disabled=true;els.status.textContent=message;els.status.className='status'}byId('use-include-root').onclick=()=>vscode.postMessage({type:'useEnvironmentPackageDirectory',source:'include'});byId('use-root-directory').onclick=()=>vscode.postMessage({type:'useEnvironmentPackageDirectory',source:'root'});byId('pick-package').onclick=()=>vscode.postMessage({type:'pickPackageDirectory',packageDirectory:els.packageDirectory.value});byId('open-env').onclick=()=>vscode.postMessage({type:'openEnvironment'});els.preview.onclick=()=>vscode.postMessage({type:'preview',packageDirectory:els.packageDirectory.value});els.apply.onclick=()=>vscode.postMessage({type:'apply'});els.packageDirectory.oninput=()=>invalidate('Package 目录已编辑，请重新预览后再写入。');els.packageDirectory.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();els.preview.click()}};window.addEventListener('message',event=>{if(event.data?.type==='state'){state=event.data;render()}});render();vscode.postMessage({type:'ready'});
</script></body></html>`;
}
