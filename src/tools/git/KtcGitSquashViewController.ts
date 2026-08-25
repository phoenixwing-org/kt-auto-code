import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import type { KtcGitIdentity, KtcGitSquashDraft } from "../../core/git/KtcGitModel.js";
import { KtcFormatGitDate } from "../../core/git/KtcGitDate.js";
import type {
  KtcPnwGitCommitGraphCommit,
  KtcPnwGitCommitGraphRefsScope,
  KtcPnwGitCommitGraphRow,
} from "./KtcGitWingAdapter.js";
import type { KtcGitWorktreeChanges } from "./KtcGitStashService.js";

export interface KtcGitSquashGraphState {
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly branchLabel: string;
  readonly expectedHeadOid: string;
  readonly refsScope: KtcPnwGitCommitGraphRefsScope;
  readonly commits: readonly KtcPnwGitCommitGraphCommit[];
  readonly graphRows: readonly KtcPnwGitCommitGraphRow[];
  readonly selectedOids: readonly string[];
  readonly selectableOids: readonly string[];
  readonly selectionAnchorOid?: string;
  readonly selectionEndpointOid?: string;
  readonly hasMore: boolean;
  readonly status: "idle" | "loading" | "ready" | "preflight" | "error";
  readonly message: string;
  readonly branchSwitch?: {
    readonly currentBranchName: string;
    readonly targetBranchName: string;
  };
  readonly draft?: KtcGitSquashDraft;
  readonly dirtyWorktree?: KtcGitWorktreeChanges;
}

export type KtcGitSquashViewMessage =
  | { readonly type: "ready" }
  | { readonly type: "select"; readonly oid: string; readonly checked: boolean; readonly anchorOid?: string }
  | { readonly type: "load"; readonly count: 1 | 5 }
  | { readonly type: "preflight"; readonly selectedOids: readonly string[] }
  | { readonly type: "openScm" }
  | { readonly type: "stashAndPreflight"; readonly selectedOids: readonly string[] }
  | { readonly type: "switchBranch" }
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
    this.panel.title = `Git：合并 commit 区间 · ${state.repositoryName}`;
    this.panel.webview.html = KtcGitSquashViewHtml(this.panel.webview, state);
    // 状态刷新只更新现有 View，不主动抢占焦点或移动用户安排的分栏。
  }

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  reveal(): void {
    this.panel?.reveal(this.panel.viewColumn, false);
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
      "Git：合并 commit 区间",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
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
  if (value.type === "select" && KtcIsOid(value.oid) && typeof value.checked === "boolean"
    && (value.anchorOid === undefined || KtcIsOid(value.anchorOid))) {
    return { type: "select", oid: value.oid, checked: value.checked, ...(value.anchorOid ? { anchorOid: value.anchorOid } : {}) };
  }
  if (value.type === "load" && (value.count === 1 || value.count === 5)) return { type: "load", count: value.count };
  if (value.type === "preflight" && KtcOidArray(value.selectedOids)) return { type: "preflight", selectedOids: value.selectedOids };
  if (value.type === "openScm") return { type: "openScm" };
  if (value.type === "stashAndPreflight" && KtcOidArray(value.selectedOids)) return { type: "stashAndPreflight", selectedOids: value.selectedOids };
  if (value.type === "switchBranch") return { type: "switchBranch" };
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

function KtcIsOid(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
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
  const graphLaneCount = Math.max(1, ...state.graphRows.map((row) => row.laneCount));
  const rows = state.commits.map((commit, index) => KtcGraphCommitRow(
    commit,
    state.graphRows[index],
    index > 0 ? state.graphRows[index - 1] : undefined,
    state.selectedOids.includes(commit.oid),
    state.selectableOids.includes(commit.oid),
    state.selectionEndpointOid === commit.oid,
    graphLaneCount,
  )).join("");
  const draft = state.draft ? KtcSquashDraftEditor(state.draft, state.status === "loading") : "";
  const recovery = state.dirtyWorktree ? KtcDirtyWorktreeRecovery(state.dirtyWorktree) : "";
  const graphControls = `<button type="button" data-section-action data-load="1" ${state.hasMore ? "" : "disabled"}>下一条</button><button type="button" data-section-action data-load="5" ${state.hasMore ? "" : "disabled"}>下 5 条</button><button class="primary" type="button" data-section-action id="preflight" ${state.selectedOids.length < 2 || state.status === "loading" ? "disabled" : ""}>选择并预检</button>`;
  const branchSwitch = state.branchSwitch
    ? `<div class="branch-switch"><span>所选区间属于本地分支“${KtcEscape(state.branchSwitch.targetBranchName)}”，当前为“${KtcEscape(state.branchSwitch.currentBranchName)}”。</span><button class="primary" id="switch-branch">切换并重新预检</button></div>`
    : "";
  const selected = JSON.stringify(state.selectedOids).replaceAll("<", "\\u003c");
  const anchorOid = JSON.stringify(state.selectionAnchorOid ?? "").replaceAll("<", "\\u003c");
  const firstParents = JSON.stringify(Object.fromEntries(state.commits.map((commit) => [commit.oid, commit.parentOids[0] ?? ""]))).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Git 合并 commit 区间</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.45 var(--vscode-font-family); }
  * { box-sizing: border-box; } button,input,textarea { font: inherit; }
  main { max-width: 1120px; margin: 0 auto; padding: 8px 12px 22px; }
  h1 { margin: 0; font-size: 18px; } h2 { margin: 0; font-size: 14px; }
  .view-header { display: flex; min-width: 0; align-items: center; gap: 10px; min-height: 32px; padding: 2px 0 7px; border-bottom: 1px solid var(--vscode-panel-border); }
  .meta { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); text-overflow: ellipsis; white-space: nowrap; }
  .notice { flex: 1 1 240px; min-width: 120px; overflow: hidden; padding: 4px 7px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-editorInfo-foreground); text-overflow: ellipsis; white-space: nowrap; }
  .notice.error { border-left-color: var(--vscode-editorError-foreground); }
  .section { margin-top: 10px; border: 1px solid var(--vscode-panel-border); }
  .section-header { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 4px 8px; background: var(--vscode-sideBarSectionHeader-background); }
  details.section > summary { cursor: pointer; list-style: none; }
  details.section > summary::-webkit-details-marker { display: none; }
  details.section > summary::before { width: 12px; flex: 0 0 12px; color: var(--vscode-descriptionForeground); content: "›"; font-size: 18px; line-height: 1; transform: rotate(0deg); transition: transform .1s ease; }
  details.section[open] > summary { border-bottom: 1px solid var(--vscode-panel-border); }
  details.section[open] > summary::before { transform: rotate(90deg); }
  details.section > summary:hover { background: var(--vscode-list-hoverBackground); }
  .section-header .count { color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .section-header-actions { display: inline-flex; min-width: 0; align-items: center; gap: 5px; margin-left: auto; }
  .graph-row { display: grid; grid-template-columns: 24px 12px max-content minmax(0,1fr); min-width: 0; min-height: 30px; padding: 1px 8px 1px 2px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 65%, transparent); cursor: pointer; }
  .graph-row:hover { background: var(--vscode-list-hoverBackground); } .graph-row:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .graph-row.unavailable { color: var(--vscode-disabledForeground); cursor: not-allowed; opacity: .58; }
  .graph-row.range-preview { background: var(--vscode-list-inactiveSelectionBackground); }
  .graph { position: relative; min-height: 28px; overflow: visible; } .graph svg { display: block; width: 100%; height: 30px; overflow: visible; }
  .graph-edge { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .graph-edge.merge { stroke-width: 2.2; }
  .graph-node { stroke: var(--vscode-editor-background); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .graph-node.tip { fill: var(--vscode-editor-background); stroke-width: 2.5; }
  .commit { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 1px 7px; overflow: hidden; }
  .commit-title { flex: 1 1 auto; min-width: 72px; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; } .commit-meta { flex: 0 1 auto; min-width: 72px; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .decorations { display: inline-flex; gap: 3px; margin-left: 5px; vertical-align: middle; } .decoration { padding: 0 4px; border: 1px solid var(--vscode-badge-background); border-radius: 8px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); font-size: 10px; font-weight: 500; } .decoration.tag { border-color: var(--vscode-charts-purple, #b180d7); background: transparent; color: var(--vscode-charts-purple, #b180d7); }
  .select { display: grid; width: 24px; place-items: center; } .select input { width: 16px; height: 16px; }
  .range-handle { display: grid; width: 12px; min-height: 28px; place-items: center; color: var(--vscode-descriptionForeground); cursor: ns-resize; opacity: 0; user-select: none; touch-action: none; }
  .graph-row:hover .range-handle, .range-handle.endpoint, .range-handle:focus { opacity: 1; }
  .actions { display: flex; flex-wrap: wrap; gap: 7px; padding: 9px; border-top: 1px solid var(--vscode-panel-border); }
  .branch-switch { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); border-top: 1px solid var(--vscode-panel-border); }
  button { min-height: 27px; padding: 3px 10px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 2px; cursor: pointer; } button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); } button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); } button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); } button:disabled { opacity: .55; cursor: not-allowed; }
  .muted { align-self: center; color: var(--vscode-descriptionForeground); } .draft { display: grid; gap: 8px; padding: 9px; } textarea,input { width: 100%; padding: 5px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); } textarea { min-height: 100px; resize: vertical; } .fields { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; } label { display: grid; gap: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; } pre { max-height: 170px; overflow: auto; margin: 0; padding: 7px; color: var(--vscode-descriptionForeground); background: var(--vscode-textCodeBlock-background); white-space: pre-wrap; }
  @media (max-width: 700px) { .view-header { flex-wrap: wrap; } .notice { flex-basis: 100%; } .section-header { flex-wrap: wrap; } .section-header-actions { flex-basis: 100%; margin-left: 20px; } }
  @media (max-width: 560px) { main { padding: 7px; } .fields { grid-template-columns: 1fr; } }
</style></head><body><main>
  <header class="view-header"><h1>合并 commit 区间</h1><div class="meta">${KtcEscape(state.repositoryName)} · ${KtcEscape(state.branchLabel)} · ${KtcEscape(state.expectedHeadOid.slice(0, 12))}</div><div class="notice${state.status === "error" ? " error" : ""}" title="${KtcAttr(state.message)}">${KtcEscape(state.message)}</div></header>
  <details class="section" open><summary class="section-header"><h2>提交图与选择</h2><span class="count">已加载 ${state.commits.length} · 已选 ${state.selectedOids.length}</span><span class="section-header-actions">${graphControls}</span></summary>
    <div id="graph">${rows || '<div class="notice">当前分支没有可显示的 commit。</div>'}</div>
    ${branchSwitch}
  </details>
  ${draft}
  ${recovery}
</main><script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const selected = new Set(${selected});
  const initialAnchor = ${anchorOid};
  const firstParents = ${firstParents};
  const post = (value) => vscode.postMessage(value);
  document.querySelectorAll('[data-section-action]').forEach((control) => {
    control.addEventListener('click', (event) => event.stopPropagation());
    control.addEventListener('dblclick', (event) => event.stopPropagation());
  });
  document.querySelectorAll('[data-oid]').forEach((row) => row.addEventListener('change', () => {
    const oid = row.dataset.oid; const input = row.querySelector('input[type=checkbox]');
    if (!oid || !input) return;
    post({ type: 'select', oid, checked: input.checked });
  }));
  const walk = (from, to) => { const result = []; const seen = new Set(); let oid = from; while (oid && !seen.has(oid)) { result.push(oid); if (oid === to) return result; seen.add(oid); oid = firstParents[oid]; } return undefined; };
  const range = (anchor, endpoint) => walk(anchor, endpoint) || (() => { const reverse = walk(endpoint, anchor); return reverse ? reverse.reverse() : undefined; })();
  const preview = (oids) => { const values = new Set(oids || []); document.querySelectorAll('[data-oid]').forEach((row) => { row.classList.toggle('range-preview', values.has(row.dataset.oid)); const input = row.querySelector('input[type=checkbox]'); if (input) input.checked = values.has(row.dataset.oid); }); };
  let dragAnchor = ''; let dragTarget = ''; let dragging = false;
  document.querySelectorAll('.range-handle').forEach((handle) => handle.addEventListener('pointerdown', (event) => {
    const row = handle.closest('[data-oid]'); if (!row || row.dataset.selectable !== 'true') return;
    event.preventDefault(); event.stopPropagation(); dragging = true; dragAnchor = initialAnchor || row.dataset.oid; dragTarget = row.dataset.oid; handle.setPointerCapture?.(event.pointerId); preview(range(dragAnchor, dragTarget));
  }));
  document.getElementById('graph')?.addEventListener('pointerover', (event) => {
    if (!dragging) return; const row = event.target.closest?.('[data-oid]'); if (!row || row.dataset.selectable !== 'true') return;
    const candidate = range(dragAnchor, row.dataset.oid); if (!candidate) return; dragTarget = row.dataset.oid; preview(candidate);
  });
  window.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; const target = dragTarget; preview(selected); if (target) post({ type: 'select', oid: target, checked: true, anchorOid: dragAnchor }); dragAnchor = ''; dragTarget = ''; });
  document.querySelectorAll('[data-load]').forEach((button) => button.addEventListener('click', () => post({ type: 'load', count: Number(button.dataset.load) })));
  document.getElementById('preflight')?.addEventListener('click', () => post({ type: 'preflight', selectedOids: [...selected] }));
  document.getElementById('open-scm')?.addEventListener('click', () => post({ type: 'openScm' }));
  document.getElementById('stash-and-preflight')?.addEventListener('click', () => post({ type: 'stashAndPreflight', selectedOids: [...selected] }));
  document.getElementById('switch-branch')?.addEventListener('click', () => post({ type: 'switchBranch' }));
  document.getElementById('execute')?.addEventListener('click', () => post({ type: 'execute', selectedOids: [...selected], message: document.getElementById('message').value, author: { name: document.getElementById('author-name').value, email: document.getElementById('author-email').value, date: document.getElementById('author-date').value, dateLabel: document.getElementById('author-date').value }, committer: { name: document.getElementById('committer-name').value, email: document.getElementById('committer-email').value, date: document.getElementById('committer-date').value, dateLabel: document.getElementById('committer-date').value } }));
  post({ type: 'ready' });
</script></body></html>`;
}

function KtcGraphCommitRow(
  commit: KtcPnwGitCommitGraphCommit,
  row: KtcPnwGitCommitGraphRow | undefined,
  previousRow: KtcPnwGitCommitGraphRow | undefined,
  checked: boolean,
  selectable: boolean,
  endpoint: boolean,
  graphLaneCount: number,
): string {
  const lane = row?.lane ?? 0;
  const width = Math.max(24, graphLaneCount * KtcGitGraphLaneWidth + 4);
  const nodeX = KtcGraphLaneX(lane);
  const currentOid = row?.lanesBefore[lane] ?? commit.oid;
  const continuation = (row?.lanesBefore ?? []).flatMap((oid, fromLane) => {
    if (oid === currentOid) return [];
    const toLane = row?.lanesAfter.indexOf(oid) ?? -1;
    if (toLane < 0) return [];
    return [KtcGraphPath(fromLane, 0, toLane, 30, "continuation")];
  }).join("");
  const incoming = previousRow?.lanesAfter.includes(commit.oid)
    ? KtcGraphPath(lane, 0, lane, 15, "incoming")
    : "";
  const parents = (row?.parentEdges ?? []).map((edge) => KtcGraphPath(
    lane,
    15,
    edge.toLane,
    30,
    edge.kind === "merge-parent" ? "merge" : "parent",
  )).join("");
  const nodeColor = KtcGraphLaneColor(lane);
  const isTip = commit.decorations.some((item) => item.kind === "head" || item.kind === "local-branch");
  const svg = `${continuation}${incoming}${parents}<circle class="graph-node${isTip ? " tip" : ""}" cx="${nodeX}" cy="15" r="4.5" style="fill:${isTip ? "var(--vscode-editor-background)" : nodeColor};stroke:${nodeColor}" />`;
  const decorations = commit.decorations.map((item) => `<span class="decoration ${item.kind === "tag" ? "tag" : ""}">${KtcEscape(item.displayName)}</span>`).join("");
  return `<label class="graph-row${selectable ? "" : " unavailable"}" data-oid="${commit.oid}" data-selectable="${selectable}"><span class="select"><input type="checkbox" aria-label="选择 ${KtcEscape(commit.oid.slice(0, 12))} 合并" ${checked ? "checked" : ""} ${selectable ? "" : "disabled"} /></span><span class="range-handle${endpoint ? " endpoint" : ""}" aria-hidden="true" title="拖动调整连续区间">⋮</span><span class="graph" style="width:${width}px"><svg viewBox="0 0 ${width} 30" aria-hidden="true">${svg}</svg></span><span class="commit"><span class="commit-title">${KtcEscape(commit.subject || "(无标题)")}<span class="decorations">${decorations}</span></span><span class="commit-meta">${KtcEscape(commit.oid.slice(0, 12))} · ${KtcEscape(commit.author.name)} · ${KtcEscape(KtcGitDateLabel(commit.author.date))}</span></span></label>`;
}

const KtcGitGraphLaneWidth = 16;
const KtcGitGraphColors = [
  "var(--vscode-charts-blue, #3794ff)",
  "var(--vscode-charts-magenta, #e3008c)",
  "var(--vscode-charts-green, #89d185)",
  "var(--vscode-charts-orange, #d18616)",
  "var(--vscode-charts-purple, #b180d7)",
  "var(--vscode-charts-red, #f14c4c)",
] as const;

function KtcGraphLaneX(lane: number): number {
  return lane * KtcGitGraphLaneWidth + 8;
}

function KtcGraphLaneColor(lane: number): string {
  return KtcGitGraphColors[Math.abs(lane) % KtcGitGraphColors.length]!;
}

function KtcGraphPath(
  fromLane: number,
  fromY: number,
  toLane: number,
  toY: number,
  kind: "continuation" | "incoming" | "parent" | "merge",
): string {
  const fromX = KtcGraphLaneX(fromLane);
  const toX = KtcGraphLaneX(toLane);
  const path = fromX === toX
    ? `M ${fromX} ${fromY} L ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${fromX} 15, ${toX} 15, ${toX} ${toY}`;
  const color = KtcGraphLaneColor(kind === "incoming" ? fromLane : toLane);
  return `<path class="graph-edge${kind === "merge" ? " merge" : ""}" d="${path}" style="stroke:${color}" />`;
}

function KtcSquashDraftEditor(draft: KtcGitSquashDraft, executing: boolean): string {
  const details = [
    ...(draft.warnings.length ? ["共享历史警告：", ...draft.warnings.map((warning) => `- ${warning.label}`), ""] : []),
    "所选区间：", ...draft.selectedLabels, "", `Base parent: ${draft.baseParentOid}`,
    `后续重放：${draft.replayCount} 个`, ...draft.replayLabels,
  ].join("\n");
  return `<details class="section" open><summary class="section-header"><h2>确认信息</h2><span class="count">只改本地分支，不自动 push</span><span class="section-header-actions"><button class="primary" type="button" data-section-action id="execute" ${executing ? "disabled" : ""}>${executing ? "正在执行…" : "确认并执行"}</button></span></summary><div class="draft"><label>合并后的 commit 信息<textarea id="message" ${executing ? "disabled" : ""}>${KtcEscape(draft.message)}</textarea></label><div class="fields"><label>Author 姓名<input id="author-name" value="${KtcAttr(draft.author.name)}" ${executing ? "disabled" : ""} /></label><label>Author 邮箱<input id="author-email" value="${KtcAttr(draft.author.email)}" ${executing ? "disabled" : ""} /></label><label>Author 时间<input id="author-date" value="${KtcAttr(draft.author.dateLabel)}" ${executing ? "disabled" : ""} /></label></div><div class="fields"><label>Committer 姓名<input id="committer-name" value="${KtcAttr(draft.committer.name)}" ${executing ? "disabled" : ""} /></label><label>Committer 邮箱<input id="committer-email" value="${KtcAttr(draft.committer.email)}" ${executing ? "disabled" : ""} /></label><label>Committer 时间<input id="committer-date" value="${KtcAttr(draft.committer.dateLabel)}" ${executing ? "disabled" : ""} /></label></div></div></details><details class="section"><summary class="section-header"><h2>预检详情</h2><span class="count">所选区间与重放信息</span></summary><pre>${KtcEscape(details)}</pre></details>`;
}

function KtcDirtyWorktreeRecovery(changes: KtcGitWorktreeChanges): string {
  const description = `工作区有 ${changes.total} 项未归档改动：暂存 ${changes.staged} · 修改 ${changes.modified} · 未跟踪 ${changes.untracked}。`;
  return `<section class="section"><div class="section-header"><h2>工作区改动</h2><span class="count">需处理后才能合并</span></div><div class="draft"><div class="notice">${KtcEscape(description)}<br />“暂存并重新预检”会包含未跟踪文件，不包含 ignored 文件；合并期间不会自动恢复。</div><div class="actions"><button id="open-scm">打开源代码管理</button><button class="primary" id="stash-and-preflight">暂存并重新预检</button></div></div></section>`;
}

function KtcGitDateLabel(value: string): string {
  return KtcFormatGitDate(value).replace(/:([0-5]\d)$/u, "");
}

function KtcEscape(value: string): string {
  return value.replace(/[&<>]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!);
}

function KtcAttr(value: string): string {
  return KtcEscape(value).replaceAll('"', "&quot;");
}
