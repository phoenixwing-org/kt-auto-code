import type { KtcGitRepositoryInput, KtcGitSquashDraft } from "../../src/core/git/KtcGitModel.js";
import { KtcFormatGitDate } from "../../src/core/git/KtcGitDate.js";
import { KtcCreateGitRangeSelection, KtcUpdateGitRangeSelection, KtcSameGitOidSelection, type KtcGitRangeSelection } from "../../src/tools/git/KtcGitSelection.js";
import { pnwPlanGitSquash } from "@phoenix-wing/git-core";
import { KtcGitSquashViewHtml } from "../../src/tools/git/KtcGitSquashViewHtml.js";
import { KtcParseGitSquashViewMessage, type KtcGitSquashGraphState, type KtcGitSquashViewMessage } from "../../src/tools/git/KtcGitSquashViewModel.js";
import { createPreviewGitSquashFixture } from "./previewGitSquashFixture.js";

type Scenario = "clean" | "dirty" | "occupied" | "failure" | "delay";

/** In-memory Host adapter. The iframe renders the exact production document. */
export function createPreviewGitSquash(options: {
  readonly log: (line: string) => void;
  readonly visibilityChanged: (open: boolean) => void;
  readonly repositoryChanged?: (repository: KtcGitRepositoryInput) => void;
}) {
  const element = document.createElement("section");
  element.className = "preview-git-squash";
  element.style.cssText = "display:flex;flex-direction:column;min-height:0;height:100%;min-width:0";
  element.setAttribute("aria-label", "Git 合并区间内存原型");
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;gap:8px;padding:5px 8px;flex-wrap:wrap;border-bottom:1px solid var(--vscode-panel-border)";
  const scenarioLabel = document.createElement("label");
  scenarioLabel.textContent = "模拟场景 ";
  const scenarioSelect = document.createElement("select");
  scenarioSelect.setAttribute("aria-label", "Git 内存模拟场景");
  for (const [value, title] of [["clean", "干净工作树"], ["dirty", "未提交改动"], ["occupied", "其他 worktree 占用"], ["failure", "模拟切换失败"], ["delay", "延迟响应"]]) {
    const item = document.createElement("option"); item.value = value!; item.textContent = title!; scenarioSelect.append(item);
  }
  scenarioLabel.append(scenarioSelect);
  const note = document.createElement("span");
  note.textContent = "内存样例 · 不执行 Git，不写文件或历史";
  note.style.color = "var(--vscode-descriptionForeground)";
  const cancel = document.createElement("button");
  cancel.type = "button"; cancel.textContent = "取消等待"; cancel.disabled = true;
  toolbar.append(scenarioLabel, note, cancel);
  const frame = document.createElement("iframe");
  frame.title = "合并 commit 区间（内存模拟）";
  // No same-origin, top navigation, popups or native dialogs. Only the owned bridge is accepted.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.style.cssText = "display:block;flex:1;min-height:240px;min-width:0;width:100%;border:0";
  element.append(toolbar, frame);
  // The controlled server authorizes this same nonce in the parent CSP. Never
  // invent a child-only nonce or weaken script-src / the sandbox as a fallback.
  const inheritedNonce = document.querySelector<HTMLMetaElement>('meta[name="phoenix-preview-script-nonce"]')?.content;
  let repository: KtcGitRepositoryInput | undefined;
  // Keep the original synthetic history separate from refreshed Primary
  // snapshots, so closing/reopening topic/demo never appends c1/c2 twice.
  const fixtureSeeds = new Map<string, KtcGitRepositoryInput>();
  let fixture: ReturnType<typeof createPreviewGitSquashFixture> | undefined;
  let state: KtcGitSquashGraphState | undefined;
  let selection: KtcGitRangeSelection = { selectedOids: [], selectableOids: [] };
  let scenario: Scenario = "clean";
  let limit = 5;
  let epoch = 0;
  let renderEpoch = 0;
  let channel = "";
  let timer: number | undefined;
  let dialog: HTMLDialogElement | undefined;
  let pendingCancel: (() => void) | undefined;
  const log = (message: string) => options.log(`[Git][合并区间] ${message}（模拟）`);

  function dismissDialog() { dialog?.remove(); dialog = undefined; }
  function invalidate() {
    epoch++;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined; pendingCancel = undefined; cancel.disabled = true; dismissDialog();
  }
  function render() {
    if (!state) return;
    if (!inheritedNonce || !/^[A-Za-z0-9_-]{32}$/u.test(inheritedNonce)) {
      state = { ...state, status: "error", draft: undefined, message: "未取得受控 Preview 脚本凭据，请重启预览服务并刷新页面。" };
      note.textContent = state.message;
      frame.srcdoc = "";
      return;
    }
    channel = `preview-git-squash:${epoch}:${++renderEpoch}`;
    frame.dataset.channel = channel;
    const nonce = inheritedNonce;
    const computed = getComputedStyle(document.documentElement);
    const themeCss = Array.from(computed).filter((name) => name.startsWith("--vscode-")).map((name) => `${name}:${computed.getPropertyValue(name)};`).join("");
    frame.srcdoc = KtcGitSquashViewHtml(state, {
      nonce,
      csp: `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`,
      themeCss,
      messageBridgeScript: `const post = (value) => window.parent.postMessage({ channel: ${JSON.stringify(channel)}, value }, '*');`,
    });
    cancel.disabled = !pendingCancel;
  }
  function setState(patch: Partial<KtcGitSquashGraphState>) {
    if (!state) return;
    state = { ...state, ...patch }; render();
  }
  function project(message: string, draft?: KtcGitSquashDraft) {
    if (!state || !fixture) return;
    const commits = fixture.commits.slice(0, limit);
    state = {
      ...state, commits, graphRows: fixture.graphRows.slice(0, limit),
      selectedOids: selection.selectedOids,
      selectableOids: fixture.mainOids.filter((oid) => commits.some((commit) => commit.oid === oid)),
      selectionAnchorOid: selection.anchorOid, selectionEndpointOid: selection.endpointOid,
      hasMore: limit < fixture.commits.length, status: "ready", message, draft,
    };
    render();
  }
  function modal(message: string, accept?: () => void, reject?: () => void) {
    dismissDialog();
    dialog = document.createElement("dialog");
    dialog.setAttribute("aria-label", accept ? "确认模拟切换分支" : "Git 模拟操作提示");
    dialog.style.cssText = "max-width:480px;padding:18px;color:var(--vscode-foreground);background:var(--vscode-editorWidget-background);border:1px solid var(--vscode-panel-border)";
    const text = document.createElement("p"); text.textContent = message;
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    const button = (label: string, action: () => void) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.onclick = () => { dismissDialog(); action(); }; return b; };
    if (accept) actions.append(button("取消", reject ?? (() => {})), button("切换分支（模拟）", accept));
    else actions.append(button("知道了", () => {}));
    dialog.append(text, actions);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); dismissDialog(); reject?.(); });
    element.append(dialog); dialog.showModal();
  }
  function begin(message: string, finish: () => void, original: KtcGitSquashGraphState) {
    const operation = ++epoch;
    pendingCancel = () => { invalidate(); state = original; setState({ message: "已取消等待；旧选择与预检保留。（模拟）" }); log("已取消等待"); };
    setState({ status: "loading", message });
    timer = window.setTimeout(() => {
      if (operation !== epoch || !state) return;
      timer = undefined; pendingCancel = undefined; cancel.disabled = true;
      finish();
    }, scenario === "delay" ? 900 : 160);
  }
  function fail(message: string) {
    setState({ status: "error", message: `${message}（模拟）`, draft: undefined }); log(message); modal(message);
  }
  function preflight() {
    if (!state || !fixture) return;
    const old = state;
    const selected = [...selection.selectedOids];
    begin("正在预检内存区间…", () => {
      if (!state || !fixture) return;
      const history = fixture.commits.filter(({ oid }) => fixture!.mainOids.includes(oid)).reverse().map((commit) => ({
        ...commit, treeOid: commit.oid, body: "", hasSignature: false, extraHeaders: [],
      }));
      // The actual Wing pure planner validates synthetic records; no second squash algorithm.
      const plan = pnwPlanGitSquash({ history, selectedOids: selected, currentRef: `refs/heads/${state.branchLabel}`,
        detached: false, clean: scenario !== "dirty", operationState: "idle",
        remoteReachableOids: fixture.commits.slice(2).map(({ oid }) => oid),
      });
      if (!plan.valid) {
        const reason = plan.blockers.some(({ code }) => code === "dirty-worktree") ? "工作区有未提交或未跟踪改动，请先处理后重新预检。"
          : plan.blockers.some(({ code }) => code === "history-not-linear" || code === "root-commit") ? "所选或后续重放区间包含合并提交或根提交，不能线性合并。"
            : "请选择当前分支主线上至少两个连续提交；不要求从 HEAD 开始。";
        fail(reason); return;
      }
      const picked = fixture.commits.filter(({ oid }) => selected.includes(oid));
      const top = picked[0]!;
      const author = { ...top.author, dateLabel: "2026-09-10 09:00:00" };
      const replayCount = plan.replayOids.length;
      project(`预检通过：${picked.length} 个提交；后续重放 ${replayCount} 个。（仅内存模拟）`, {
        repositoryId: state.repositoryId, expectedHeadOid: state.expectedHeadOid, currentRef: `refs/heads/${state.branchLabel}`,
        selectedOids: selected, selectedLabels: picked.map(({ oid, subject }) => `${oid.slice(0, 12)} ${subject}`),
        baseParentOid: plan.baseParentOid!, selectedTipTreeOid: plan.selectedTipTreeOid!, finalTreeOid: plan.finalTreeOid!,
        replayCount, replayLabels: fixture.commits.filter(({ oid }) => fixture!.mainOids.slice(0, replayCount).includes(oid)).map(({ subject }) => subject),
        warnings: plan.warnings.map(({ code }) => ({ code, label: "示例涉及共享历史；真实执行需审查远端和其他分支。" })),
        message: picked.map(({ subject }) => subject).join("\n"), author, committer: author,
      });
      log("区间预检完成；未写入文件或历史");
    }, old);
  }
  function switchBranch(branchName: string) {
    if (!state || !repository) return;
    const original = state;
    const option = state.branchOptions?.find(({ name }) => name === branchName);
    if (!option?.enabled || option.current) { render(); return; }
    if (scenario === "dirty") { fail("工作区有未提交或未跟踪改动，不能直接切换分支；请先处理。"); return; }
    if (scenario === "occupied") { fail(`分支 ${branchName} 被其他 worktree 占用，不能切换。`); return; }
    const identity = epoch;
    modal(`切换到本地分支“${branchName}”？仅模拟，成功会清空旧勾选和预检；不执行 checkout、force、stash 或合并。`, () => {
      if (identity !== epoch || !state) return;
      begin("正在模拟切换分支…", () => {
        if (!state || !repository) return;
        if (scenario === "failure") { fail("模拟切换失败：当前分支与旧勾选保持不变。"); return; }
        fixture = createPreviewGitSquashFixture(repository, branchName);
        selection = KtcCreateGitRangeSelection(fixture.commits, [], fixture.mainOids);
        limit = 5;
        state = { ...state, branchLabel: branchName, expectedHeadOid: fixture.commits[0]!.oid, branchOptions: branchOptions(branchName) };
        project(`已切换到 ${branchName}；旧勾选与预检已清空。（模拟）`);
        const head = fixture.commits[0]!.oid;
        options.repositoryChanged?.({
          ...repository, branch: branchName, head, upstream: `origin/${branchName}`, clean: true,
          commits: fixture.commits.filter(({ oid }) => fixture!.mainOids.includes(oid)).map((commit) => ({
            oid: commit.oid, parentOids: commit.parentOids, subject: commit.subject, body: "", isHead: commit.oid === head,
            author: { ...commit.author, dateLabel: KtcFormatGitDate(commit.author.date) },
            committer: { ...commit.committer, dateLabel: KtcFormatGitDate(commit.committer.date) },
          })).reverse(),
        });
        log(`已切换到 ${branchName}，清空旧勾选与预检`);
      }, original);
    }, () => { if (identity !== epoch || !state) return; state = original; setState({ message: "已取消切换；分支、旧勾选与预检保持不变。（模拟）" }); log("取消切换分支"); });
  }
  function receive(value: unknown) {
    const message = KtcParseGitSquashViewMessage(value);
    if (!message || !state || !fixture || message.type === "ready") return;
    if (state.status === "loading" || state.status === "preflight") return;
    if (message.type === "select") {
      try {
        selection = KtcUpdateGitRangeSelection(state.commits, selection, message.oid, message.checked, message.anchorOid, fixture.mainOids);
        project(`已选择 ${selection.selectedOids.length} 个连续主线提交。（模拟）`);
      } catch (error) { fail(String((error as Error).message)); }
    } else if (message.type === "load") {
      const old = state;
      begin("正在加载内存提交…", () => { limit += message.count; project(`已加载 ${Math.min(limit, fixture!.commits.length)} 条；勾选保持。（模拟）`); }, old);
    } else if (message.type === "preflight") preflight();
    else if (message.type === "selectBranch") switchBranch(message.branchName);
    else if (message.type === "execute") {
      if (!state.draft) return;
      if ((scenario !== "clean" && scenario !== "delay") || state.status !== "ready"
        || state.draft.expectedHeadOid !== state.expectedHeadOid || state.draft.currentRef !== `refs/heads/${state.branchLabel}`
        || !KtcSameGitOidSelection(selection.selectedOids, state.draft.selectedOids)
        || !KtcSameGitOidSelection(message.selectedOids, state.draft.selectedOids)) {
        fail("预检已过期或工作树状态已变化，请重新预检。"); return;
      }
      setState({ message: "模拟执行完成；保留示例历史供继续点检，未改写任何 Git 提交。", draft: undefined });
      log("仅展示执行反馈，未运行真实合并");
    } else handleAuxiliary(message);
  }
  function handleAuxiliary(message: KtcGitSquashViewMessage) {
    // Preserve discoverability of the formal row actions without claiming real side effects.
    log(`${message.type}：仅演示反馈，不执行复制、时间改写、stash 或工作区操作`);
    setState({ message: `${message.type}：仅内存原型，未执行真实操作。` });
  }
  function branchOptions(current: string) {
    return [...new Set([repository?.branch ?? "develop", "topic/demo", "occupied/example"])].map((name) => ({
      name, current: name === current, enabled: name !== "occupied/example",
      ...(name === "occupied/example" ? { disabledReason: "已被其他 worktree 占用" } : {}),
    }));
  }
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || !event.data || event.data.channel !== channel) return;
    receive(event.data.value);
  };
  window.addEventListener("message", onMessage);
  scenarioSelect.onchange = () => {
    if (!["clean", "dirty", "occupied", "failure", "delay"].includes(scenarioSelect.value)) return;
    invalidate(); scenario = scenarioSelect.value as Scenario;
    setState({ status: "ready", draft: undefined, message: `场景：${scenarioSelect.selectedOptions[0]?.textContent}；旧预检失效，仅内存模拟。` });
  };
  cancel.onclick = () => pendingCancel?.();
  return {
    element,
    state: () => state,
    open(next: KtcGitRepositoryInput, selectedOids: readonly string[] = []) {
      if (state?.repositoryId === next.id) { options.visibilityChanged(true); return; }
      if (state) {
        const message = `合并 View 已绑定仓库 ${state.repositoryName}；请先关闭，再打开 ${next.name}。`;
        options.visibilityChanged(true); log(message); modal(message); return;
      }
      invalidate();
      if (!fixtureSeeds.has(next.id)) fixtureSeeds.set(next.id, { ...next, commits: [...(next.commits ?? [])] });
      repository = fixtureSeeds.get(next.id)!;
      fixture = createPreviewGitSquashFixture(repository, next.branch ?? "develop"); limit = 5;
      selection = KtcCreateGitRangeSelection(fixture.commits, selectedOids, fixture.mainOids);
      const selectedIndexes = selection.selectedOids.map((oid) => fixture!.commits.findIndex((commit) => commit.oid === oid));
      limit = Math.max(limit, ...selectedIndexes.map((index) => index + 1));
      state = { repositoryId: next.id, repositoryName: next.name, branchLabel: next.branch ?? "develop", expectedHeadOid: fixture.commits[0]?.oid ?? "0".repeat(40),
        refsScope: "head", commits: [], graphRows: [], selectedOids: [], selectableOids: [], hasMore: true, status: "ready", message: "", branchOptions: branchOptions(next.branch ?? "develop") };
      project("已打开当前分支提交图；只显示可达历史与合入分叉。（内存模拟）");
      log(`打开 ${next.name} · ${state.branchLabel}`); options.visibilityChanged(true);
      if (selectedOids.length >= 2) preflight();
    },
    close() { invalidate(); state = undefined; fixture = undefined; repository = undefined; frame.srcdoc = ""; channel = ""; options.visibilityChanged(false); log("已关闭；旧响应不会重新打开 Right"); },
    refreshTheme() { render(); },
    dispose() { invalidate(); state = undefined; fixtureSeeds.clear(); window.removeEventListener("message", onMessage); frame.srcdoc = ""; element.remove(); },
  };
}
