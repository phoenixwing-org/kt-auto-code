import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import type { KtcGitIdentity, KtcGitSquashDraft } from "../../core/git/KtcGitModel.js";
import type {
  KtcPnwGitCommitGraphCommit,
  KtcPnwGitCommitGraphRefsScope,
  KtcPnwGitCommitGraphRow,
} from "./KtcGitWingAdapter.js";

export interface KtcGitSquashGraphState {
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly branchLabel: string;
  readonly expectedHeadOid: string;
  readonly refsScope: KtcPnwGitCommitGraphRefsScope;
  readonly commits: readonly KtcPnwGitCommitGraphCommit[];
  readonly graphRows: readonly KtcPnwGitCommitGraphRow[];
  readonly selectedOids: readonly string[];
  readonly hasMore: boolean;
  readonly status: "idle" | "loading" | "ready" | "preflight" | "error";
  readonly message: string;
  readonly draft?: KtcGitSquashDraft;
}

export type KtcGitSquashViewMessage =
  | { readonly type: "ready" }
  | { readonly type: "setRefsScope"; readonly refsScope: "local-branches" | "local-branches-and-tags" }
  | { readonly type: "select"; readonly selectedOids: readonly string[] }
  | { readonly type: "load"; readonly count: 1 | 5 }
  | { readonly type: "preflight"; readonly selectedOids: readonly string[] }
  | {
      readonly type: "execute";
      readonly selectedOids: readonly string[];
      readonly message: string;
      readonly author: KtcGitIdentity;
      readonly committer: KtcGitIdentity;
    };

export interface KtcGitSquashViewCallbacks {
  readonly onMessage: (message: KtcGitSquashViewMessage) => Promise<void>;
  readonly onDispose: () => void;
}

/** 单例编辑器区 View；只显示已由 Controller 验证过的拓扑 DTO。 */
export class KtcGitSquashViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly callbacks: KtcGitSquashViewCallbacks) {}

  show(state: KtcGitSquashGraphState): void {
    if (!this.panel) this.panel = this.createPanel();
    this.panel.title = `Git：合并本地 commit · ${state.repositoryName}`;
    this.panel.webview.html = KtcGitSquashViewHtml(this.panel.webview, state);
    this.panel.reveal(vscode.ViewColumn.Beside, false);
  }

  dispose(): void {
    this.close();
  }

  close(): void {
    const panel = this.panel;
    this.panel = undefined;
    panel?.dispose();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.gitSquash",
      "Git：合并本地 commit",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    panel.webview.onDidReceiveMessage((message: unknown) => {
      const parsed = KtcParseGitSquashViewMessage(message);
      if (parsed) void this.callbacks.onMessage(parsed);
    });
    panel.onDidDispose(() => {
      if (this.panel !== panel) return;
      this.panel = undefined;
      this.callbacks.onDispose();
    });
    return panel;
  }
}

function KtcParseGitSquashViewMessage(value: unknown): KtcGitSquashViewMessage | undefined {
  if (!KtcIsRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "ready") return { type: "ready" };
  if (value.type === "setRefsScope" && (value.refsScope === "local-branches" || value.refsScope === "local-branches-and-tags")) {
    return { type: "setRefsScope", refsScope: value.refsScope };
  }
  if (value.type === "select" && KtcOidArray(value.selectedOids)) return { type: "select", selectedOids: value.selectedOids };
  if (value.type === "load" && (value.count === 1 || value.count === 5)) return { type: "load", count: value.count };
  if (value.type === "preflight" && KtcOidArray(value.selectedOids)) return { type: "preflight", selectedOids: value.selectedOids };
  if (value.type === "execute"
    && KtcOidArray(value.selectedOids)
    && typeof value.message === "string"
    && KtcIsIdentity(value.author)
    && KtcIsIdentity(value.committer)) {
    return { type: "execute", selectedOids: value.selectedOids, message: value.message, author: value.author, committer: value.committer };
  }
  return undefined;
}

function KtcIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function KtcOidArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= 100
    && value.every((oid) => typeof oid === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid));
}

function KtcIsIdentity(value: unknown): value is KtcGitIdentity {
  return KtcIsRecord(value)
    && typeof value.name === "string"
    && typeof value.email === "string"
    && typeof value.date === "string"
    && typeof value.dateLabel === "string";
}

function KtcGitSquashViewHtml(webview: Pick<vscode.Webview, "cspSource">, state: KtcGitSquashGraphState): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview);
  const rows = state.commits.map((commit, index) => KtcGraphCommitRow(commit, state.graphRows[index], state.selectedOids.includes(commit.oid))).join("");
  const selectionLabel = state.selectedOids.length === 0
    ? "在同一直线历史中勾选至少 2 个 commit。"
    : `已选择 ${state.selectedOids.length} 个 commit；预检会拒绝非连续、merge 或不安全历史。`;
  const draft = state.draft ? KtcSquashDraftEditor(state.draft) : "";
  const graphControls = state.hasMore
    ? '<button type="button" data-load="1">下一条</button><button type="button" data-load="5">下 5 条</button>'
    : '<span class="muted">已到达本地分支图的当前末端。</span>';
  const selected = JSON.stringify(state.selectedOids).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Git 合并本地 commit</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.45 var(--vscode-font-family); }
  * { box-sizing: border-box; } button,input,textarea { font: inherit; }
  main { max-width: 1120px; margin: 0 auto; padding: 14px 18px 28px; }
  h1 { margin: 0; font-size: 18px; } h2 { margin: 0; font-size: 14px; }
  .meta,.notice,.selection { margin-top: 6px; color: var(--vscode-descriptionForeground); }
  .notice { padding: 7px 9px; border-left: 3px solid var(--vscode-editorInfo-foreground); background: var(--vscode-textBlockQuote-background); }
  .notice.error { border-left-color: var(--vscode-editorError-foreground); }
  .section { margin-top: 14px; border: 1px solid var(--vscode-panel-border); }
  .section-header { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBarSectionHeader-background); }
  .section-header .count { margin-left: auto; color: var(--vscode-descriptionForeground); }
  .scope { display: inline-flex; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; } .scope select { min-height: 23px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); }
  .graph-row { display: grid; grid-template-columns: 24px max-content minmax(0,1fr); min-width: 0; min-height: 43px; padding: 2px 8px 2px 2px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 65%, transparent); cursor: pointer; }
  .graph-row:hover { background: var(--vscode-list-hoverBackground); } .graph-row:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .graph { position: relative; min-height: 38px; overflow: visible; } .graph svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .graph line { stroke: var(--vscode-charts-blue, #3794ff); stroke-width: 1.6; } .graph line.merge { stroke: var(--vscode-charts-purple, #b180d7); }
  .graph .node { position: absolute; top: calc(50% - 5px); width: 10px; height: 10px; border: 2px solid var(--vscode-editor-background); border-radius: 50%; background: var(--vscode-charts-blue, #3794ff); }
  .graph .node.merge { background: var(--vscode-charts-purple, #b180d7); }
  .commit { display: flex; min-width: 0; flex-direction: column; justify-content: center; gap: 2px; padding: 2px 7px; }
  .commit-title { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; } .commit-meta { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .decorations { display: inline-flex; gap: 3px; margin-left: 5px; vertical-align: middle; } .decoration { padding: 0 4px; border: 1px solid var(--vscode-badge-background); border-radius: 8px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); font-size: 10px; font-weight: 500; } .decoration.tag { border-color: var(--vscode-charts-purple, #b180d7); background: transparent; color: var(--vscode-charts-purple, #b180d7); }
  .select { display: grid; width: 24px; place-items: center; } .select input { width: 16px; height: 16px; }
  .actions { display: flex; flex-wrap: wrap; gap: 7px; padding: 9px; border-top: 1px solid var(--vscode-panel-border); }
  button { min-height: 27px; padding: 3px 10px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 2px; cursor: pointer; } button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); } button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); } button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); } button:disabled { opacity: .55; cursor: not-allowed; }
  .muted { align-self: center; color: var(--vscode-descriptionForeground); } .draft { display: grid; gap: 8px; padding: 9px; } textarea,input { width: 100%; padding: 5px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); } textarea { min-height: 100px; resize: vertical; } .fields { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; } label { display: grid; gap: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; } pre { max-height: 170px; overflow: auto; margin: 0; padding: 7px; color: var(--vscode-descriptionForeground); background: var(--vscode-textCodeBlock-background); white-space: pre-wrap; }
  @media (max-width: 560px) { main { padding: 10px; } .fields { grid-template-columns: 1fr; } }
</style></head><body><main>
  <h1>合并本地 commit</h1>
  <div class="meta">${KtcEscape(state.repositoryName)} · ${KtcEscape(state.branchLabel)} · HEAD ${KtcEscape(state.expectedHeadOid.slice(0, 12))}</div>
  <div class="notice${state.status === "error" ? " error" : ""}">${KtcEscape(state.message)}</div>
  <section class="section"><div class="section-header"><h2>提交图</h2><label class="scope">范围<select id="refs-scope"><option value="local-branches" ${state.refsScope === "local-branches" ? "selected" : ""}>本地分支</option><option value="local-branches-and-tags" ${state.refsScope === "local-branches-and-tags" ? "selected" : ""}>本地分支和标签</option></select></label><span class="count">已加载 ${state.commits.length}</span></div>
    <div id="graph">${rows || '<div class="notice">当前分支没有可显示的 commit。</div>'}</div>
    <div class="actions">${graphControls}</div>
  </section>
  <section class="section"><div class="section-header"><h2>合并选择</h2><span class="count">${KtcEscape(selectionLabel)}</span></div>
    <div class="actions"><button class="primary" id="preflight" ${state.selectedOids.length < 2 || state.status === "loading" ? "disabled" : ""}>选择并预检</button></div>
  </section>
  ${draft}
</main><script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const selected = new Set(${selected});
  const post = (value) => vscode.postMessage(value);
  document.querySelectorAll('[data-oid]').forEach((row) => row.addEventListener('change', () => {
    const oid = row.dataset.oid; const input = row.querySelector('input[type=checkbox]');
    if (!oid || !input) return; if (input.checked) selected.add(oid); else selected.delete(oid);
    post({ type: 'select', selectedOids: [...selected] });
  }));
  document.querySelectorAll('[data-load]').forEach((button) => button.addEventListener('click', () => post({ type: 'load', count: Number(button.dataset.load) })));
  document.getElementById('refs-scope')?.addEventListener('change', (event) => post({ type: 'setRefsScope', refsScope: event.target.value }));
  document.getElementById('preflight')?.addEventListener('click', () => post({ type: 'preflight', selectedOids: [...selected] }));
  document.getElementById('execute')?.addEventListener('click', () => post({ type: 'execute', selectedOids: [...selected], message: document.getElementById('message').value, author: { name: document.getElementById('author-name').value, email: document.getElementById('author-email').value, date: document.getElementById('author-date').value, dateLabel: document.getElementById('author-date').value }, committer: { name: document.getElementById('committer-name').value, email: document.getElementById('committer-email').value, date: document.getElementById('committer-date').value, dateLabel: document.getElementById('committer-date').value } }));
  post({ type: 'ready' });
</script></body></html>`;
}

function KtcGraphCommitRow(commit: KtcPnwGitCommitGraphCommit, row: KtcPnwGitCommitGraphRow | undefined, checked: boolean): string {
  const lane = row?.lane ?? 0;
  const laneCount = Math.max(1, row?.laneCount ?? 1);
  const width = Math.max(20, laneCount * 12);
  const svg = (row?.parentEdges ?? []).map((edge) => `<line class="${edge.kind === "merge-parent" ? "merge" : ""}" x1="${lane * 12 + 6}" y1="0" x2="${edge.toLane * 12 + 6}" y2="44" />`).join("")
    || `<line x1="${lane * 12 + 6}" y1="0" x2="${lane * 12 + 6}" y2="44" />`;
  const decorations = commit.decorations.map((item) => `<span class="decoration ${item.kind === "tag" ? "tag" : ""}">${KtcEscape(item.displayName)}</span>`).join("");
  return `<label class="graph-row" data-oid="${commit.oid}"><span class="select"><input type="checkbox" aria-label="选择 ${KtcEscape(commit.oid.slice(0, 12))} 合并" ${checked ? "checked" : ""} /></span><span class="graph" style="width:${width}px"><svg viewBox="0 0 ${width} 44" preserveAspectRatio="none">${svg}</svg><span class="node ${commit.parentOids.length > 1 ? "merge" : ""}" style="left:${lane * 12 + 1}px"></span></span><span class="commit"><span class="commit-title">${KtcEscape(commit.subject || "(无标题)")}<span class="decorations">${decorations}</span></span><span class="commit-meta">${KtcEscape(commit.oid.slice(0, 12))} · ${KtcEscape(commit.author.name)} · ${KtcEscape(KtcGitDateLabel(commit.author.date))}</span></span></label>`;
}

function KtcSquashDraftEditor(draft: KtcGitSquashDraft): string {
  const details = [
    ...(draft.warnings.length ? ["共享历史警告：", ...draft.warnings.map((warning) => `- ${warning.label}`), ""] : []),
    "所选区间：", ...draft.selectedLabels, "", `Base parent: ${draft.baseParentOid}`,
    `后续重放：${draft.replayCount} 个`, ...draft.replayLabels,
  ].join("\n");
  return `<section class="section"><div class="section-header"><h2>安全预检通过</h2><span class="count">执行只改本地分支，不自动 push</span></div><div class="draft"><pre>${KtcEscape(details)}</pre><label>合并后的 commit 信息<textarea id="message">${KtcEscape(draft.message)}</textarea></label><div class="fields"><label>Author 姓名<input id="author-name" value="${KtcAttr(draft.author.name)}" /></label><label>Author 邮箱<input id="author-email" value="${KtcAttr(draft.author.email)}" /></label><label>Author 时间<input id="author-date" value="${KtcAttr(draft.author.dateLabel)}" /></label></div><div class="fields"><label>Committer 姓名<input id="committer-name" value="${KtcAttr(draft.committer.name)}" /></label><label>Committer 邮箱<input id="committer-email" value="${KtcAttr(draft.committer.email)}" /></label><label>Committer 时间<input id="committer-date" value="${KtcAttr(draft.committer.dateLabel)}" /></label></div><div class="actions"><button class="primary" id="execute">确认并执行</button></div></div></section>`;
}

function KtcGitDateLabel(value: string): string {
  return value.replace(/\s[+-]\d{4}$/u, "");
}

function KtcEscape(value: string): string {
  return value.replace(/[&<>]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!);
}

function KtcAttr(value: string): string {
  return KtcEscape(value).replaceAll('"', "&quot;");
}
