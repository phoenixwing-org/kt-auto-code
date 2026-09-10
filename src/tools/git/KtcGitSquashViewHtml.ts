import { KtcHoverTooltipStyle, ktcInstallHoverTooltip } from "../../ui/KtcHoverTooltip.js";
import { KtcFormatGitDate } from "../../core/git/KtcGitDate.js";
import type { KtcGitSquashDraft } from "../../core/git/KtcGitModel.js";
import type { KtcPnwGitCommitGraphCommit, KtcPnwGitCommitGraphRow } from "./KtcGitWingAdapter.js";
import type { KtcGitWorktreeChanges } from "./KtcGitStashService.js";
import type { KtcGitSquashGraphState } from "./KtcGitSquashViewModel.js";

/** Trusted adapter inputs, never values received from a user/commit or Webview message. */
export interface KtcGitSquashDocumentHost {
  readonly nonce: string;
  readonly csp: string;
  /** Defines the local `post(value)` bridge; the shared UI never owns a Host API. */
  readonly messageBridgeScript: string;
  readonly themeCss?: string;
}

/** One presentation for the formal Webview and sandboxed Preview. No Git operations. */
export function KtcGitSquashViewHtml(state: KtcGitSquashGraphState, host: KtcGitSquashDocumentHost): string {
  const { nonce, csp, messageBridgeScript, themeCss = "" } = host;
  const busy = state.status === "loading" || state.status === "preflight";
  const graphLaneCount = Math.max(1, ...state.graphRows.map((row) => row.laneCount));
  const rows = state.commits.map((commit, index) => KtcGraphCommitRow(
    commit,
    state.graphRows[index],
    index > 0 ? state.graphRows[index - 1] : undefined,
    state.selectedOids.includes(commit.oid),
    !busy && !state.selectionDisabledReason && state.selectableOids.includes(commit.oid),
    state.selectionEndpointOid === commit.oid,
    graphLaneCount,
    state.selectionDisabledReason ?? (busy ? "正在处理提交图，请稍候" : undefined),
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
  const branches = [...(state.branchOptions ?? [])].sort((left, right) => Number(right.current) - Number(left.current));
  const currentBranch = JSON.stringify(branches.find(branch => branch.current)?.name ?? "").replaceAll("<", "\\u003c");
  const branchTooltip = ["选择后由 Host 确认并切换当前仓库分支，不强制覆盖本地修改。",
    ...branches.filter(branch => !branch.enabled).map(branch => `${branch.name}：${branch.disabledReason || "当前不可切换"}`),
  ].join("\n");
  const branchSelector = branches.length ? `<label class="branch-select" data-hover-text="${KtcAttr(branchTooltip)}" title="">当前分支<select id="branch-select" aria-label="当前仓库分支" ${busy || state.selectionDisabledReason ? "disabled" : ""}>${branches.some(branch => branch.current) ? "" : '<option value="" selected disabled>选择分支…</option>'}${branches.map(branch => `<option value="${KtcAttr(branch.name)}" data-branch-enabled="${branch.enabled}" ${branch.current ? "selected" : ""} ${branch.enabled ? "" : "disabled"} title="${KtcAttr(branch.disabledReason ?? branch.name)}">${KtcEscape(branch.name)}${!branch.enabled ? `（${KtcEscape(branch.disabledReason || "当前不可切换")}）` : ""}</option>`).join("")}</select></label>` : "";
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<title>Git 合并 commit 区间</title>
<style>
  ${KtcHoverTooltipStyle}
  :root { color-scheme: light dark; ${themeCss} }
  body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px/1.45 var(--vscode-font-family); }
  * { box-sizing: border-box; } button,input,textarea { font: inherit; }
  main { max-width: 1120px; margin: 0 auto; padding: 8px 12px 22px; }
  h1 { margin: 0; font-size: 18px; } h2 { margin: 0; font-size: 14px; }
  .view-header { display: flex; min-width: 0; align-items: center; gap: 10px; min-height: 32px; padding: 2px 0 7px; border-bottom: 1px solid var(--vscode-panel-border); }
  .meta { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); text-overflow: ellipsis; white-space: nowrap; }
  .branch-select { display: inline-flex; min-width: 0; align-items: center; gap: 5px; white-space: nowrap; }
  .branch-select select { min-width: 100px; max-width: 280px; padding: 3px 5px; font: inherit; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); }
  .branch-select select:focus-visible { outline: 1px solid var(--vscode-focusBorder); } .branch-select select:disabled { opacity: .55; }
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
  .same-identity { display: inline-flex; grid-auto-flow: column; align-items: center; gap: 4px; color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; } .same-identity input { width: 14px; height: 14px; }
  .committer-fields[hidden] { display: none; }
  .graph-row { display: grid; grid-template-columns: 24px 16px max-content minmax(0,1fr); min-width: 0; min-height: 30px; padding: 1px 8px 1px 2px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 65%, transparent); cursor: pointer; }
  .graph-row:hover { background: var(--vscode-list-hoverBackground); } .graph-row:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .graph-row.unavailable { color: var(--vscode-disabledForeground); cursor: not-allowed; opacity: .58; }
  .unavailable-reason { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .graph-row.range-preview { background: var(--vscode-list-inactiveSelectionBackground); }
  .graph { position: relative; min-height: 28px; overflow: visible; } .graph svg { display: block; width: 100%; height: 30px; overflow: visible; }
  .graph-edge { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
  .graph-edge.merge { stroke-width: 2.2; }
  .graph-node { stroke: var(--vscode-editor-background); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .graph-node.tip { fill: var(--vscode-editor-background); stroke-width: 2.5; }
  .commit { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 1px 7px; overflow: visible; }
  .commit-title { flex: 1 1 0; min-width: 0; overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .commit-meta { display: inline-flex; flex: 0 0 auto; min-width: 0; max-width: 55%; align-items: center; gap: 4px; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
  .meta-hash,.meta-time { flex: 0 0 auto; } .meta-author { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .decorations { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: 28%; gap: 3px; overflow: hidden; } .decorations:empty { display: none; }
  .decoration { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 5px; border: 1px solid var(--vscode-badge-background); border-radius: 9px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); font-size: 10px; font-weight: 600; } .decoration.tag { border-color: var(--vscode-charts-purple, #b180d7); background: transparent; color: var(--vscode-charts-purple, #b180d7); }
  .decoration[data-hover-pin] { min-height: 0; line-height: inherit; cursor: help; }
  .decoration[data-hover-pin]:hover { background: var(--vscode-toolbar-hoverBackground); }
  .decoration.remote { flex: 0 0 auto; border-color: var(--vscode-focusBorder); background: transparent; color: var(--vscode-foreground); }
  .select { display: grid; width: 24px; place-items: center; } .select input { width: 16px; height: 16px; }
  .row-menu { position: relative; flex: 0 0 auto; } .row-menu > summary { display: grid; width: 28px; height: 28px; cursor: pointer; list-style: none; opacity: 0; place-items: center; border: 1px solid transparent; border-radius: 3px; font-size: 20px; font-weight: 700; line-height: 1; } .row-menu > summary::-webkit-details-marker { display: none; } .graph-row:hover .row-menu > summary,.row-menu[open] > summary,.row-menu > summary:focus { opacity: 1; } .row-menu > summary:hover,.row-menu[open] > summary { background: var(--vscode-toolbar-hoverBackground); border-color: var(--vscode-panel-border); } .row-menu > summary:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; } .graph-row.unavailable .row-menu { color: var(--vscode-foreground); opacity: 1; } .row-menu-popup { position: absolute; z-index: 10; top: 28px; right: 0; min-width: 132px; padding: 3px; background: var(--vscode-menu-background, var(--vscode-editorWidget-background)); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); box-shadow: 0 2px 8px var(--vscode-widget-shadow); } .row-menu-popup button { width: 100%; text-align: left; color: var(--vscode-menu-foreground, var(--vscode-foreground)); background: transparent; } .row-menu-popup button:hover { color: var(--vscode-menu-selectionForeground, var(--vscode-list-activeSelectionForeground)); background: var(--vscode-menu-selectionBackground, var(--vscode-list-activeSelectionBackground)); }
  .range-handle { display: grid; width: 16px; min-height: 28px; place-items: center; color: var(--vscode-descriptionForeground); cursor: ns-resize; opacity: 0; user-select: none; touch-action: none; border-radius: 3px; font-size: 18px; line-height: 1; }
  .graph-row:hover .range-handle, .range-handle.endpoint, .range-handle:focus { opacity: 1; }
  .range-handle:hover,.range-handle:focus { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
  .actions { display: flex; flex-wrap: wrap; gap: 7px; padding: 9px; border-top: 1px solid var(--vscode-panel-border); }
  .branch-switch { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-textBlockQuote-background); border-top: 1px solid var(--vscode-panel-border); }
  button { min-height: 27px; padding: 3px 10px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid transparent; border-radius: 2px; cursor: pointer; } button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); } button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); } button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); } button:disabled { opacity: .55; cursor: not-allowed; }
  .muted { align-self: center; color: var(--vscode-descriptionForeground); } .draft { display: grid; gap: 8px; padding: 9px; } textarea,input { width: 100%; padding: 5px 7px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); } textarea { min-height: 150px; resize: vertical; } .fields { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; } label { display: grid; gap: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; } pre { max-height: 170px; overflow: auto; margin: 0; padding: 7px; color: var(--vscode-descriptionForeground); background: var(--vscode-textCodeBlock-background); white-space: pre-wrap; }
  @media (max-width: 700px) { .view-header { flex-wrap: wrap; } .notice { flex-basis: 100%; } .section-header { flex-wrap: wrap; } .section-header-actions { flex-basis: 100%; margin-left: 20px; } }
  @media (max-width: 560px) { main { padding: 7px; } .fields { grid-template-columns: 1fr; } .meta-hash,.meta-time { flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; } }
</style></head><body><main>
  <header class="view-header"><h1>合并 commit 区间</h1>${branchSelector}<div class="meta" data-hover-text="${KtcAttr(`${state.repositoryName} · ${state.branchLabel} · ${state.expectedHeadOid}`)}" tabindex="0">${KtcEscape(state.repositoryName)}${branchSelector ? "" : ` · ${KtcEscape(state.branchLabel)}`} · ${KtcEscape(state.expectedHeadOid.slice(0, 12))}</div><div class="notice${state.status === "error" ? " error" : ""}" data-hover-text="${KtcAttr(state.message)}" title="" tabindex="0">${KtcEscape(state.message)}</div></header>
  <details class="section" open><summary class="section-header"><h2>提交图与选择</h2><span class="count">已加载 ${state.commits.length} · 已选 ${state.selectedOids.length}</span><span class="section-header-actions">${graphControls}</span></summary>
    <div id="graph">${rows || '<div class="notice">当前分支没有可显示的 commit。</div>'}</div>
    ${branchSwitch}
  </details>
  ${draft}
  ${recovery}
</main><script nonce="${nonce}">
  ${messageBridgeScript}
  (${ktcInstallHoverTooltip.toString()})(document);
  const selected = new Set(${selected});
  const initialAnchor = ${anchorOid};
  const firstParents = ${firstParents};
  const currentBranch = ${currentBranch};
  const branchSelect = document.getElementById('branch-select');
  branchSelect?.addEventListener('change', () => {
    const branchName = branchSelect.value;
    const selectedOption = Array.from(branchSelect.options).find(option => option.value === branchName);
    if (branchSelect.disabled || !selectedOption || selectedOption.disabled || selectedOption.dataset.branchEnabled !== 'true' || !branchName || branchName === currentBranch) { branchSelect.value = currentBranch; return; }
    branchSelect.value = currentBranch;
    branchSelect.disabled = true;
    post({ type: 'selectBranch', branchName });
  });
  document.querySelectorAll('[data-section-action]').forEach((control) => {
    control.addEventListener('click', (event) => event.stopPropagation());
    control.addEventListener('dblclick', (event) => event.stopPropagation());
  });
  document.querySelectorAll('[data-oid]').forEach((row) => row.addEventListener('change', () => {
    const oid = row.dataset.oid; const input = row.querySelector('input[type=checkbox]');
    if (!oid || !input || input.disabled || row.dataset.selectable !== 'true') return;
    post({ type: 'select', oid, checked: input.checked });
  }));
  const walk = (from, to) => { const result = []; const seen = new Set(); let oid = from; while (oid && !seen.has(oid)) { result.push(oid); if (oid === to) return result; seen.add(oid); oid = firstParents[oid]; } return undefined; };
  const range = (anchor, endpoint) => walk(anchor, endpoint) || (() => { const reverse = walk(endpoint, anchor); return reverse ? reverse.reverse() : undefined; })();
  const preview = (oids) => { const values = new Set(oids || []); document.querySelectorAll('[data-oid]').forEach((row) => { const eligible = row.dataset.selectable === 'true'; row.classList.toggle('range-preview', eligible && values.has(row.dataset.oid)); const input = row.querySelector('input[type=checkbox]'); if (input) input.checked = eligible && values.has(row.dataset.oid); }); };
  let dragAnchor = ''; let dragTarget = ''; let dragging = false;
  document.querySelectorAll('.range-handle').forEach((handle) => handle.addEventListener('pointerdown', (event) => {
    const row = handle.closest('[data-oid]'); if (!row || row.dataset.selectable !== 'true') return;
    event.preventDefault(); event.stopPropagation(); dragging = true; dragAnchor = initialAnchor || row.dataset.oid; dragTarget = row.dataset.oid; handle.setPointerCapture?.(event.pointerId); preview(range(dragAnchor, dragTarget));
  }));
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return; const row = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-oid]'); if (!row || row.dataset.selectable !== 'true') return;
    const candidate = range(dragAnchor, row.dataset.oid); if (!candidate) return; dragTarget = row.dataset.oid; preview(candidate);
  });
  window.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; const target = dragTarget; preview(selected); if (target) post({ type: 'select', oid: target, checked: true, anchorOid: dragAnchor }); dragAnchor = ''; dragTarget = ''; });
  document.querySelectorAll('[data-load]').forEach((button) => button.addEventListener('click', () => post({ type: 'load', count: Number(button.dataset.load) })));
  document.querySelectorAll('.row-menu').forEach((menu) => { menu.addEventListener('click', (event) => event.stopPropagation()); menu.addEventListener('toggle', () => { if (!menu.open) return; document.querySelectorAll('.row-menu[open]').forEach((other) => { if (other !== menu) other.open = false; }); }); });
  document.querySelectorAll('[data-copy-summary]').forEach((button) => button.addEventListener('click', () => { const oid = button.dataset.copySummary; if (oid) post({ type: 'copySummary', oid }); button.closest('.row-menu')?.removeAttribute('open'); }));
  document.querySelectorAll('[data-reset-time]').forEach((button) => button.addEventListener('click', () => { const oid = button.dataset.resetTime; if (oid) post({ type: 'resetCommitTime', oid }); button.closest('.row-menu')?.removeAttribute('open'); }));
  document.getElementById('preflight')?.addEventListener('click', () => post({ type: 'preflight', selectedOids: [...selected] }));
  document.getElementById('open-scm')?.addEventListener('click', () => post({ type: 'openScm' }));
  document.getElementById('stash-and-preflight')?.addEventListener('click', () => post({ type: 'stashAndPreflight', selectedOids: [...selected] }));
  document.getElementById('switch-branch')?.addEventListener('click', () => post({ type: 'switchBranch' }));
  const sameIdentity = document.getElementById('same-identity'); const committerFields = document.getElementById('committer-fields');
  const authorInputs = ['name', 'email', 'date'].map((key) => document.getElementById('author-' + key)); const committerInputs = ['name', 'email', 'date'].map((key) => document.getElementById('committer-' + key));
  const syncIdentity = () => { if (!sameIdentity) return; if (sameIdentity.checked) authorInputs.forEach((input, index) => { if (input && committerInputs[index]) committerInputs[index].value = input.value; }); if (committerFields) committerFields.hidden = sameIdentity.checked; committerInputs.forEach((input) => { if (input) input.disabled = ${JSON.stringify(state.status === "loading")} || sameIdentity.checked; }); };
  sameIdentity?.addEventListener('change', syncIdentity); authorInputs.forEach((input) => input?.addEventListener('input', syncIdentity)); syncIdentity();
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
  selectionDisabledReason?: string,
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
  const isHead = commit.decorations.some((item) => item.kind === "head");
  const svg = `${continuation}${incoming}${parents}<circle class="graph-node${isHead ? " tip" : ""}" cx="${nodeX}" cy="15" r="4.5" style="fill:${isHead ? "var(--vscode-editor-background)" : nodeColor};stroke:${nodeColor}" />`;
  const decorations = commit.decorations.map((item) => `<span class="decoration ${item.kind === "tag" ? "tag" : ""}" aria-label="${KtcAttr(item.name)}">${KtcEscape(item.displayName)}</span>`).join("");
  const remoteRefs = (commit.remoteTrackingRefs ?? []).filter(ref => ref.name.startsWith("refs/remotes/") && ref.oid === commit.oid);
  const remoteTitle = remoteRefs.length ? `本地远端跟踪引用（非实时远端状态）：\n${remoteRefs.map(ref => `${ref.name}${ref.symbolicTarget ? ` → ${ref.symbolicTarget}` : ""}`).join("\n")}` : "";
  const remoteDecoration = remoteRefs.length ? `<button type="button" class="decoration remote" data-hover-text="${KtcAttr(remoteTitle)}" data-hover-pin aria-expanded="false" title="" aria-label="${KtcAttr(remoteTitle)}">remote${remoteRefs.length > 1 ? ` ×${remoteRefs.length}` : ""}</button>` : "";
  const subject = commit.subject || "(无标题)";
  const dateLabel = KtcGitDateLabel(commit.author.date);
  const metadata = `${commit.oid.slice(0, 12)} · ${commit.author.name} · ${dateLabel}`;
  const unavailableReason = selectionDisabledReason ?? "非当前分支，不能合并";
  const unavailableTitle = selectable ? "" : ` data-hover-text="${KtcAttr(unavailableReason)}" title=""`;
  const reasonId = `unavailable-${commit.oid}`;
  return `<div class="graph-row${selectable ? "" : " unavailable"}" data-oid="${commit.oid}" data-selectable="${selectable}"${unavailableTitle}><span class="select"${unavailableTitle}><input type="checkbox" aria-label="选择 ${KtcEscape(commit.oid.slice(0, 12))} 合并" ${checked && selectable ? "checked" : ""} ${selectable ? "" : `disabled aria-describedby="${reasonId}"`} />${selectable ? "" : `<span class="unavailable-reason" id="${reasonId}">${KtcEscape(unavailableReason)}</span>`}</span><span class="range-handle${endpoint ? " endpoint" : ""}" aria-hidden="true" title="${selectable ? "拖动调整连续区间" : KtcAttr(unavailableReason)}">⠿</span><span class="graph" style="width:${width}px"><svg viewBox="0 0 ${width} 30" aria-hidden="true">${svg}</svg></span><span class="commit">${remoteDecoration}<span class="decorations">${decorations}</span><span class="commit-title" data-hover-text="${KtcAttr(subject)}" title="" tabindex="0">${KtcEscape(subject)}</span><span class="commit-meta" data-hover-text="${KtcAttr(metadata)}" title="" tabindex="0"><span class="meta-hash" data-hover-text="${KtcAttr(commit.oid)}" title="">${KtcEscape(commit.oid.slice(0, 12))}</span><span class="meta-author" data-hover-text="${KtcAttr(commit.author.name)}" title=""> · ${KtcEscape(commit.author.name)}</span><span class="meta-time" data-hover-text="${KtcAttr(dateLabel)}" title=""> · ${KtcEscape(dateLabel)}</span></span><details class="row-menu"><summary aria-label="提交操作" title="提交操作">⋯</summary><div class="row-menu-popup"><button type="button" data-copy-summary="${commit.oid}">复制简报</button><button type="button" data-reset-time="${commit.oid}">重置提交时间…</button></div></details></span></div>`;
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
  const middleY = fromY + ((toY - fromY) / 2);
  const path = fromX === toX
    ? `M ${fromX} ${fromY} L ${toX} ${toY}`
    : `M ${fromX} ${fromY} C ${fromX} ${middleY}, ${toX} ${middleY}, ${toX} ${toY}`;
  const color = KtcGraphLaneColor(kind === "incoming" ? fromLane : toLane);
  return `<path class="graph-edge${kind === "merge" ? " merge" : ""}" d="${path}" style="stroke:${color}" />`;
}

function KtcSquashDraftEditor(draft: KtcGitSquashDraft, executing: boolean): string {
  const details = [
    ...(draft.warnings.length ? ["共享历史警告：", ...draft.warnings.map((warning) => `- ${warning.label}`), ""] : []),
    "所选区间：", ...draft.selectedLabels, "", `Base parent: ${draft.baseParentOid}`,
    `后续重放：${draft.replayCount} 个`, ...draft.replayLabels,
  ].join("\n");
  const sameIdentity = draft.author.name === draft.committer.name
    && draft.author.email === draft.committer.email
    && draft.author.date === draft.committer.date;
  return `<details class="section" open><summary class="section-header"><h2>确认信息</h2><span class="count">只改本地分支，不自动 push</span><span class="section-header-actions"><label class="same-identity" data-section-action><input id="same-identity" type="checkbox" ${sameIdentity ? "checked" : ""} ${executing ? "disabled" : ""} />Author / Committer 相同</label><button class="primary" type="button" data-section-action id="execute" ${executing ? "disabled" : ""}>${executing ? "正在执行…" : "确认并执行"}</button></span></summary><div class="draft"><label>合并后的 commit 信息<textarea id="message" ${executing ? "disabled" : ""}>${KtcEscape(draft.message)}</textarea></label><div class="fields"><label>Author 姓名<input id="author-name" value="${KtcAttr(draft.author.name)}" ${executing ? "disabled" : ""} /></label><label>Author 邮箱<input id="author-email" value="${KtcAttr(draft.author.email)}" ${executing ? "disabled" : ""} /></label><label>Author 时间<input id="author-date" value="${KtcAttr(draft.author.dateLabel)}" ${executing ? "disabled" : ""} /></label></div><div class="fields committer-fields" id="committer-fields" ${sameIdentity ? "hidden" : ""}><label>Committer 姓名<input id="committer-name" value="${KtcAttr(draft.committer.name)}" ${executing || sameIdentity ? "disabled" : ""} /></label><label>Committer 邮箱<input id="committer-email" value="${KtcAttr(draft.committer.email)}" ${executing || sameIdentity ? "disabled" : ""} /></label><label>Committer 时间<input id="committer-date" value="${KtcAttr(draft.committer.dateLabel)}" ${executing || sameIdentity ? "disabled" : ""} /></label></div></div></details><details class="section"><summary class="section-header"><h2>预检详情</h2><span class="count">所选区间与重放信息</span></summary><pre>${KtcEscape(details)}</pre></details>`;
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
