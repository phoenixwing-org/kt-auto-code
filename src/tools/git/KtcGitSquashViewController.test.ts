import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Window, type HTMLElement, type HTMLButtonElement, type HTMLSelectElement } from "happy-dom";

const { createWebviewPanel } = vi.hoisted(() => ({ createWebviewPanel: vi.fn() }));

vi.mock("vscode", () => ({
  ViewColumn: { Active: 1 },
  window: { createWebviewPanel },
}));

import type * as vscode from "vscode";
import { KtcGitSquashViewController, type KtcGitSquashGraphState } from "./KtcGitSquashViewController.js";

const oid = "a".repeat(40);

function fakePanel(): vscode.WebviewPanel {
  let disposeListener: (() => void) | undefined;
  return {
    active: true,
    visible: true,
    viewColumn: 2,
    title: "",
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
    webview: {
      cspSource: "test-webview",
      html: "",
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
    },
  } as unknown as vscode.WebviewPanel;
}

describe("Git squash graph View", () => {
  beforeEach(() => createWebviewPanel.mockReset());
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("在当前编辑器组复用同一个提交图 View，状态刷新不强制移动分栏", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const view = new KtcGitSquashViewController({ onMessage: vi.fn(), onDispose: vi.fn() });
    const state = {
      repositoryId: "/repo",
      repositoryName: "repo",
      branchLabel: "develop",
      expectedHeadOid: oid,
      refsScope: "local-branches" as const,
      commits: [{
        oid,
        parentOids: ["b".repeat(40)],
        subject: "修复提交图",
        author: { name: "Phoenix", email: "dev@example.com", date: "1780000000 +0800" },
        committer: { name: "Phoenix", email: "dev@example.com", date: "1780000000 +0800" },
        decorations: [{ name: "HEAD", displayName: "HEAD", kind: "head" as const }],
      }],
      graphRows: [{
        commitOid: oid,
        lane: 0,
        laneCount: 1,
        lanesBefore: [oid],
        lanesAfter: ["b".repeat(40)],
        parentEdges: [{ parentOid: "b".repeat(40), fromLane: 0, toLane: 0, kind: "first-parent" as const }],
      }],
      selectedOids: [],
      selectableOids: [oid],
      hasMore: true,
      status: "ready" as const,
      message: "已读取最近 5 条本地分支提交图；按需继续加载。",
    };

    view.show(state);
    view.show(state);

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.gitSquash",
      "Git：合并 commit 区间",
      { viewColumn: 1, preserveFocus: false },
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
    );
    expect(panel.webview.html).toContain("提交图");
    expect(panel.webview.html).toContain("下一条");
    expect(panel.webview.html).toContain("下 5 条");
    expect(panel.webview.html).toContain("提交图与选择");
    expect(panel.webview.html).toContain('class="section-header-actions"');
    expect(panel.webview.html).toContain('data-section-action id="preflight"');
    expect(panel.webview.html).toContain("min-height: 30px");
    expect(panel.webview.html).toContain("HEAD");
    expect(panel.webview.html).toContain("复制简报");
    expect(panel.webview.html).toContain("重置提交时间…");
    expect(panel.webview.html).toContain('data-reset-time="' + oid + '"');
    expect(panel.webview.html).toContain("width: 28px; height: 28px");
    expect(panel.webview.html).not.toContain("1780000000");
    expect(panel.webview.html).toContain('grid-template-columns: 24px 16px max-content minmax(0,1fr)');
    expect(panel.webview.html).toContain('class="range-handle"');
    expect(panel.webview.html).toContain("anchorOid: dragAnchor");
    expect(panel.webview.html).toContain("document.elementFromPoint(event.clientX, event.clientY)");
    expect(panel.webview.html).toContain("拖动调整连续区间");
    expect(panel.webview.html.indexOf('<span class="select"><input type="checkbox"')).toBeLessThan(panel.webview.html.indexOf('<span class="graph"'));
    expect(panel.reveal).not.toHaveBeenCalled();
  });

  it("shows the explicit branch-switch action for a validated non-current range", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const view = new KtcGitSquashViewController({ onMessage: vi.fn(), onDispose: vi.fn() });
    view.show({
      repositoryId: "/repo", repositoryName: "repo", branchLabel: "develop", expectedHeadOid: oid,
      refsScope: "local-branches", commits: [], graphRows: [], selectedOids: [oid, "b".repeat(40)],
      selectableOids: [], hasMore: false, status: "ready", message: "请切换后重新预检。",
      branchSwitch: { currentBranchName: "develop", targetBranchName: "topic/fix" },
    });
    expect(panel.webview.html).toContain("topic/fix");
    expect(panel.webview.html).toContain("切换并重新预检");
    expect(panel.webview.html).toContain("switchBranch");
  });

  it("后台状态刷新不主动显示 View，只有显式 reveal 才恢复焦点", () => {
    const panel = fakePanel();
    Object.assign(panel, { visible: false });
    createWebviewPanel.mockReturnValue(panel);
    const view = new KtcGitSquashViewController({ onMessage: vi.fn(), onDispose: vi.fn() });
    const state = {
      repositoryId: "/repo",
      repositoryName: "repo",
      branchLabel: "develop",
      expectedHeadOid: oid,
      refsScope: "local-branches" as const,
      commits: [],
      graphRows: [],
      selectedOids: [],
      selectableOids: [],
      hasMore: false,
      status: "error" as const,
      message: "HEAD 已变化；请关闭后重新打开。",
    };

    view.show(state);
    view.show(state);
    expect(view.isOpen).toBe(true);
    expect(panel.reveal).not.toHaveBeenCalled();
    view.reveal();
    expect(panel.reveal).toHaveBeenCalledWith(2, false);
  });

  it("工作区未归档改动时提供打开源代码管理与暂存后重检入口", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const view = new KtcGitSquashViewController({ onMessage: vi.fn(), onDispose: vi.fn() });
    view.show({
      repositoryId: "/repo",
      repositoryName: "repo",
      branchLabel: "develop",
      expectedHeadOid: oid,
      refsScope: "local-branches",
      commits: [],
      graphRows: [],
      selectedOids: [oid, "b".repeat(40)],
      selectableOids: [],
      hasMore: false,
      status: "error",
      message: "工作区有未归档改动。",
      dirtyWorktree: { staged: 1, modified: 2, untracked: 3, total: 6 },
    });
    expect(panel.webview.html).toContain("工作区有 6 项未归档改动");
    expect(panel.webview.html).toContain("打开源代码管理");
    expect(panel.webview.html).toContain("暂存并重新预检");
    expect(panel.webview.html).toContain("stashAndPreflight");
  });

  it("使用固定图形列、持续车道和彩色贝塞尔曲线绘制分支与合并", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const view = new KtcGitSquashViewController({ onMessage: vi.fn(), onDispose: vi.fn() });
    const parent = "b".repeat(40);
    const side = "c".repeat(40);
    view.show({
      repositoryId: "/repo",
      repositoryName: "repo",
      branchLabel: "develop",
      expectedHeadOid: oid,
      refsScope: "local-branches",
      commits: [{
        oid,
        parentOids: [parent, side],
        subject: "合并分支",
        author: { name: "Phoenix", email: "dev@example.com", date: "1780000000 +0800" },
        committer: { name: "Phoenix", email: "dev@example.com", date: "1780000000 +0800" },
        decorations: [{ name: "refs/heads/develop", displayName: "develop", kind: "local-branch" }],
      }],
      graphRows: [{
        commitOid: oid,
        lane: 0,
        laneCount: 2,
        lanesBefore: [oid, side],
        lanesAfter: [side, parent],
        parentEdges: [
          { parentOid: parent, fromLane: 0, toLane: 1, kind: "first-parent" },
          { parentOid: side, fromLane: 0, toLane: 0, kind: "merge-parent" },
        ],
      }],
      selectedOids: [],
      selectableOids: [oid],
      hasMore: false,
      status: "ready",
      message: "已读取提交图。",
    });

    expect(panel.webview.html).toContain('class="graph-edge');
    expect(panel.webview.html).toContain('class="graph-edge merge"');
    expect(panel.webview.html).toContain(" C ");
    expect(panel.webview.html).toContain("C 8 22.5, 24 22.5, 24 30");
    expect(panel.webview.html).not.toContain('class="graph-node tip"');
    expect(panel.webview.html).toContain("--vscode-charts-magenta");
    expect(panel.webview.html.indexOf(">develop</span>")).toBeLessThan(panel.webview.html.indexOf(">合并分支</span>"));
  });

  it("预检通过后将确认与低优先级详情拆为可折叠的连续 Section", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const view = new KtcGitSquashViewController({ onMessage: vi.fn(), onDispose: vi.fn() });
    view.show({
      repositoryId: "/repo",
      repositoryName: "repo",
      branchLabel: "develop",
      expectedHeadOid: oid,
      refsScope: "local-branches",
      commits: [],
      graphRows: [],
      selectedOids: [oid, "b".repeat(40)],
      selectableOids: [],
      hasMore: false,
      status: "ready",
      message: "安全预检通过。",
      draft: {
        repositoryId: "/repo",
        expectedHeadOid: oid,
        currentRef: "refs/heads/develop",
        selectedOids: [oid, "b".repeat(40)],
        selectedLabels: ["aaaaaaa 新提交", "bbbbbbb 旧提交"],
        baseParentOid: "c".repeat(40),
        selectedTipTreeOid: "d".repeat(40),
        finalTreeOid: "e".repeat(40),
        replayCount: 0,
        replayLabels: [],
        warnings: [],
        message: "合并提交",
        author: { name: "Phoenix", email: "dev@example.com", date: "0", dateLabel: "2026-08-23 08:00" },
        committer: { name: "Phoenix", email: "dev@example.com", date: "0", dateLabel: "2026-08-23 08:00" },
      },
    });
    expect(panel.webview.html).toContain("确认并执行");
    expect(panel.webview.html).toContain('id="same-identity" type="checkbox" checked');
    expect(panel.webview.html).toContain("Author / Committer 相同");
    expect(panel.webview.html).toContain('id="committer-fields" hidden');
    expect(panel.webview.html).toContain("textarea { min-height: 150px");
    expect(panel.webview.html).toContain('data-section-action id="execute"');
    expect(panel.webview.html).not.toContain('<div class="actions"><button class="primary" id="execute"');
    expect(panel.webview.html).toContain("预检详情");
    expect(panel.webview.html.indexOf("确认并执行")).toBeLessThan(panel.webview.html.indexOf("预检详情"));
    expect(panel.webview.html).toContain('details.section > summary');
  });

  function renderEligibilityGraph(overrides: Partial<KtcGitSquashGraphState> = {}) {
    const browser = new Window();
    const document = browser.document;
    const middle = "b".repeat(40), side = "c".repeat(40), base = "d".repeat(40);
    const state: KtcGitSquashGraphState = {
      repositoryId: "/repo", repositoryName: "repo", branchLabel: "develop", expectedHeadOid: oid,
      refsScope: "head", selectedOids: [side], selectableOids: [oid, middle, base], hasMore: false,
      status: "ready", message: "当前 HEAD 可达图；只允许当前分支区间。",
      commits: [
        { oid, parentOids: [middle, side] }, { oid: side, parentOids: [base] },
        { oid: middle, parentOids: [base] }, { oid: base, parentOids: [] },
      ].map(commit => ({ ...commit, subject: "相同提交标题", decorations: [],
        author: { name: "Phoenix", email: "dev@example.com", date: "1780000000 +0800" },
        committer: { name: "Phoenix", email: "dev@example.com", date: "1780000000 +0800" },
      })),
      // Deliberately put the ineligible side commit in lane 0 and an eligible middle commit in lane 2.
      graphRows: [oid, side, middle, base].map(commitOid => ({
        commitOid, lane: commitOid === middle ? 2 : 0, laneCount: 3,
        lanesBefore: [oid, side, middle], lanesAfter: [base], parentEdges: [],
      })),
    };
    const panel = fakePanel(); createWebviewPanel.mockReturnValue(panel);
    const view = new KtcGitSquashViewController({ onMessage: vi.fn(), onDispose: vi.fn() });
    const projected = { ...state, ...overrides };
    view.show(projected); document.body.innerHTML = panel.webview.html;
    const row = (value: string) => document.querySelector(`[data-oid="${value}"]`) as HTMLElement;
    return { html: panel.webview.html, middle, side, row, document, browser, view, panel, state: projected };
  }

  function connectGraph(ctx: ReturnType<typeof renderEligibilityGraph>) {
    const messages: unknown[] = [];
    new Function("document", "window", "acquireVsCodeApi", ctx.document.querySelector("script")!.textContent!)(
      ctx.document, ctx.browser, () => ({ postMessage: (message: unknown) => messages.push(message) }),
    );
    return messages;
  }

  function renderTooltipGraph() {
    const ctx = renderEligibilityGraph();
    const subject = `长标题 <template> \"引号\" & ${"提交详情".repeat(40)}`;
    const refs = [
      { name: "refs/remotes/gitee/develop", displayName: "gitee/develop", oid: ctx.side },
      { name: "refs/remotes/github/HEAD", displayName: "github/HEAD", oid: ctx.side, symbolicTarget: "refs/remotes/github/develop" },
    ];
    ctx.view.show({ ...ctx.state, commits: ctx.state.commits.map(commit => ({ ...commit,
      subject: commit.oid === ctx.middle ? subject : commit.subject,
      decorations: [
        { name: "HEAD", displayName: "HEAD", kind: "head" as const },
        { name: "refs/heads/develop", displayName: "develop", kind: "local-branch" as const },
        { name: "refs/tags/v0.9.1", displayName: "v0.9.1", kind: "tag" as const },
      ],
      ...(commit.oid === ctx.side ? { remoteTrackingRefs: refs } : {}),
    })) });
    ctx.document.body.innerHTML = ctx.panel.webview.html;
    // Happy DOM has its own timer implementation. Route only this window's timers through
    // Vitest so the real inline script's 500ms open and 120ms handoff are deterministic.
    vi.useFakeTimers();
    vi.spyOn(ctx.browser, "setTimeout").mockImplementation((callback, delay, ...args) => setTimeout(() => callback(...args), delay));
    vi.spyOn(ctx.browser, "clearTimeout").mockImplementation(timer => clearTimeout(timer));
    const messages = connectGraph(ctx);
    const remote = ctx.row(ctx.side).querySelector(".decoration.remote") as HTMLButtonElement;
    const title = ctx.row(ctx.middle).querySelector(".commit-title") as HTMLElement;
    const tooltip = ctx.document.querySelector("#ktc-hover-tooltip") as HTMLElement;
    const hover = (element: HTMLElement) => element.dispatchEvent(new ctx.browser.PointerEvent("pointerover", { bubbles: true }));
    const leave = (element: HTMLElement, relatedTarget?: HTMLElement) => element.dispatchEvent(new ctx.browser.PointerEvent("pointerout", { bubbles: true, relatedTarget }));
    return { ...ctx, messages, remote, title, tooltip, hover, leave, subject };
  }

  it("首次渲染按可信 OID 资格灰显旁支；同标题或 lane 0 均不能放开勾选", () => {
    const { html, middle, side, row, document } = renderEligibilityGraph();
    const blocked = row(side), allowed = row(middle), checkbox = blocked.querySelector("input")!;
    expect(blocked.classList.contains("unavailable")).toBe(true);
    expect(blocked.dataset.selectable).toBe("false"); expect(checkbox.disabled).toBe(true); expect(checkbox.checked).toBe(false);
    expect(blocked.dataset.hoverText).toBe("非当前分支，不能合并");
    expect((blocked.querySelector(".select") as HTMLElement).dataset.hoverText).toBe("非当前分支，不能合并");
    expect(document.getElementById(checkbox.getAttribute("aria-describedby")!)?.textContent).toBe("非当前分支，不能合并");
    expect((blocked.querySelector(".range-handle") as HTMLElement).title).toBe("非当前分支，不能合并");
    expect(allowed.querySelector(".commit-title")!.textContent).toBe(blocked.querySelector(".commit-title")!.textContent);
    expect(allowed.classList.contains("unavailable")).toBe(false);
    expect(allowed.dataset.selectable).toBe("true"); expect(allowed.querySelector("input")!.disabled).toBe(false);
    expect(allowed.getAttribute("title")).toBeNull();
    expect((allowed.querySelector(".range-handle") as HTMLElement).title).toBe("拖动调整连续区间");
    expect(html).toContain(".graph-row.unavailable { color: var(--vscode-disabledForeground)");
  });

  it("远端 tip 显示清晰 remote 标记与完整本地跟踪引用，不改变旁支选择资格", () => {
    const ctx = renderEligibilityGraph();
    const commits = ctx.state.commits.map(commit => ({ ...commit,
      decorations: [{ name: "refs/heads/github/develop", displayName: "github/develop", kind: "local-branch" as const }, { name: "refs/tags/github/HEAD", displayName: "github/HEAD", kind: "tag" as const }],
      ...(commit.oid === ctx.side ? { remoteTrackingRefs: [
        { name: "refs/remotes/gitee/develop", displayName: "gitee/develop", oid: ctx.side },
        { name: "refs/remotes/github/HEAD", displayName: "github/HEAD", oid: ctx.side, symbolicTarget: "refs/remotes/github/develop" },
        { name: "refs/remotes/github/develop", displayName: "github/develop", oid: ctx.side },
      ] } : {}),
    }));
    ctx.view.show({ ...ctx.state, commits }); ctx.document.body.innerHTML = ctx.panel.webview.html;
    const marked = ctx.row(ctx.side), remote = marked.querySelector(".decoration.remote") as HTMLElement;
    expect(remote.textContent).toBe("remote ×3");
    expect(remote.dataset.hoverText).toBe("本地远端跟踪引用（非实时远端状态）：\nrefs/remotes/gitee/develop\nrefs/remotes/github/HEAD → refs/remotes/github/develop\nrefs/remotes/github/develop");
    expect(remote.getAttribute("aria-label")).toBe(remote.dataset.hoverText);
    expect(remote.tagName).toBe("BUTTON"); expect(remote.hasAttribute("data-hover-pin")).toBe(true);
    expect(remote.title).toBe(""); // Explicit tooltip, not Chromium's delayed native title.
    expect(remote.parentElement?.className).toBe("commit"); // Never clipped inside the local-ref badge rail.
    expect(marked.dataset.selectable).toBe("false"); expect(marked.querySelector("input")!.disabled).toBe(true);
    expect(ctx.row(oid).querySelector(".decoration.remote")).toBeNull();
    expect(ctx.row(oid).querySelectorAll(".decoration")).toHaveLength(2); // local/tag names are not remote evidence
    expect(ctx.panel.webview.html).toContain(".decoration.remote { flex: 0 0 auto;");
  });

  it("单远端标记转义完整ref，不接受非remote前缀或不同OID标记", () => {
    const ctx = renderEligibilityGraph();
    const name = "refs/remotes/origin/<topic>&\"quoted\"";
    ctx.view.show({ ...ctx.state, commits: ctx.state.commits.map((commit, index) => ({ ...commit,
      remoteTrackingRefs: index === 0 ? [{ name, displayName: "origin/<topic>", oid: commit.oid }]
        : [{ name: "refs/heads/origin/main", displayName: "origin/main", oid: commit.oid }, { name: "refs/remotes/origin/other", displayName: "origin/other", oid }],
    })) });
    ctx.document.body.innerHTML = ctx.panel.webview.html;
    expect(ctx.document.querySelectorAll(".decoration.remote")).toHaveLength(1);
    expect(ctx.row(oid).querySelector(".decoration.remote")!.textContent).toBe("remote");
    const remote = ctx.row(oid).querySelector(".decoration.remote") as HTMLElement;
    expect(remote.dataset.hoverText).toContain(name);
    const messages = connectGraph(ctx);
    remote.click();
    const tooltip = ctx.document.querySelector("#ktc-hover-tooltip") as HTMLElement;
    expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toContain(name);
    expect(tooltip.children).toHaveLength(0);
    expect(messages).toEqual([{ type: "ready" }]);
    expect(ctx.document.querySelector("topic")).toBeNull();
  });

  it("超长 subject 和 refs 自动省略但不吞右侧 hash/作者/时间，完整内容仍在 DOM 与 tooltip", () => {
    const ctx = renderEligibilityGraph();
    const subject = `修正 <template> \"引号\" & ${"特别长的提交说明".repeat(100)}`;
    const author = `Phoenix ${"长作者名".repeat(40)}`;
    const refName = `refs/heads/topic/${"long-branch-".repeat(30)}`;
    const commit = { ...ctx.state.commits[0]!, subject, author: { ...ctx.state.commits[0]!.author, name: author },
      decorations: [
        { name: refName, displayName: refName.slice("refs/heads/".length), kind: "local-branch" as const },
        { name: "refs/tags/v0.9.1", displayName: "v0.9.1", kind: "tag" as const },
      ],
    };
    const state = { ...ctx.state, commits: [commit, ...ctx.state.commits.slice(1)] };
    ctx.view.show(state); ctx.document.body.innerHTML = ctx.panel.webview.html;
    const row = ctx.row(oid);
    const title = row.querySelector(".commit-title") as HTMLElement;
    const meta = row.querySelector(".commit-meta") as HTMLElement;
    expect(title.textContent).toBe(subject); expect(title.dataset.hoverText).toBe(subject); expect(title.title).toBe("");
    expect(title.parentElement).toBe(meta.parentElement);
    expect(row.querySelector(".meta-hash")!.textContent).toBe(oid.slice(0, 12));
    expect((row.querySelector(".meta-hash") as HTMLElement).dataset.hoverText).toBe(oid);
    expect((row.querySelector(".meta-author") as HTMLElement).dataset.hoverText).toBe(author);
    expect(row.querySelector(".meta-author")!.textContent).toContain(author);
    const time = row.querySelector(".meta-time") as HTMLElement;
    expect(time.dataset.hoverText).toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(meta.dataset.hoverText).toBe(meta.textContent);
    expect((row.querySelector(".decoration") as HTMLElement).getAttribute("aria-label")).toBe(refName);
    expect((row.querySelector(".decoration") as HTMLElement).hasAttribute("data-hover-text")).toBe(false);
    expect((row.querySelector(".decoration") as HTMLElement).title).toBe("");
    expect(row.querySelectorAll(".decoration")).toHaveLength(2);
    expect(row.querySelector("template")).toBeNull();
    expect(row.querySelectorAll(".graph svg,input[type=checkbox],.range-handle,.row-menu")).toHaveLength(4);
    expect(row.dataset.selectable).toBe("true");
    expect(state.commits[0]!.subject).toBe(subject);

    const css = ctx.document.querySelector("style")!.textContent!;
    expect(css).toContain(".commit-title { flex: 1 1 0; min-width: 0; overflow: hidden;");
    expect(css).toContain(".commit-meta { display: inline-flex; flex: 0 0 auto; min-width: 0; max-width: 55%;");
    expect(css).toContain(".meta-hash,.meta-time { flex: 0 0 auto; }");
    expect(css).toContain(".meta-author { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;");
    expect(css).toContain(".decorations { display: inline-flex; flex: 0 1 auto; min-width: 0; max-width: 28%;");
    expect(css).toContain(".decoration { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;");
    // Narrow views may ellipsize each metadata field; keep the one-line row and fixed graph geometry.
    expect(css).toMatch(/@media \(max-width: 560px\).*\.meta-hash,\.meta-time \{ flex-shrink: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;/u);
    expect(css).not.toContain(".commit { flex-wrap: wrap");
    expect(css).toContain("grid-template-columns: 24px 16px max-content minmax(0,1fr)");
    expect(css).toMatch(/\.decoration(?:\.remote|\[data-hover-pin\])\s*\{[^}]*cursor:\s*help/u);
    expect(css).not.toMatch(/(?:\[data-hover-text\]|\.commit-title)\s*\{[^}]*cursor:\s*help/u);
  });

  it("远端只点击显示和固定，悬停/焦点不自动弹出，反复关闭恢复原 aria 描述", () => {
    const { remote, tooltip, hover, leave, document, messages, row, side } = renderTooltipGraph();
    remote.setAttribute("aria-describedby", "existing-description");
    expect(tooltip.hidden).toBe(true); expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip.getAttribute("role")).toBe("tooltip");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      hover(remote); vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(true);
      remote.focus(); vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(true);
      remote.click();
      expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toBe(remote.dataset.hoverText);
      expect(remote.getAttribute("aria-describedby")).toBe("existing-description ktc-hover-tooltip");
      expect(remote.getAttribute("aria-expanded")).toBe("true");
      leave(remote);
      vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(false);
      hover(tooltip); leave(tooltip); vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(false);
      remote.click(); expect(tooltip.hidden).toBe(true);
      expect(remote.getAttribute("aria-describedby")).toBe("existing-description");
      expect(remote.getAttribute("aria-expanded")).toBe("false");
    }
    expect(document.querySelectorAll("#ktc-hover-tooltip")).toHaveLength(1);
    expect(row(side).querySelector("input")!.disabled).toBe(true);
    expect(row(side).querySelector("input")!.checked).toBe(false);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("长标题停留和焦点延迟500ms后显示，正文安全且长文本点击/拖选不被接管", () => {
    const { browser, remote, title, tooltip, hover, document, subject, messages } = renderTooltipGraph();
    remote.focus(); expect(document.activeElement).toBe(remote);
    title.focus();
    vi.advanceTimersByTime(499); expect(tooltip.hidden).toBe(true);
    vi.advanceTimersByTime(1); expect(tooltip.hidden).toBe(false); expect(tooltip.textContent).toBe(subject);
    expect(tooltip.children).toHaveLength(0); expect(document.querySelector("template")).toBeNull();
    expect(remote.hasAttribute("aria-describedby")).toBe(false);
    expect(title.getAttribute("aria-describedby")).toBe("ktc-hover-tooltip");
    const clicked = vi.fn(); title.parentElement!.addEventListener("click", clicked);
    const click = new browser.MouseEvent("click", { bubbles: true, cancelable: true });
    title.dispatchEvent(click); expect(click.defaultPrevented).toBe(false); expect(clicked).toHaveBeenCalledOnce();
    expect(tooltip.hidden).toBe(true);
    const down = new browser.PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 3 });
    title.dispatchEvent(down); expect(down.defaultPrevented).toBe(false);
    hover(title); vi.advanceTimersByTime(499); expect(tooltip.hidden).toBe(true);
    vi.advanceTimersByTime(1); expect(tooltip.textContent).toBe(subject); expect(tooltip.hidden).toBe(false);
    document.body.focus();
    title.blur(); vi.advanceTimersByTime(120); expect(tooltip.hidden).toBe(true);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("remote固定不被长文本悬停取代；旁支禁选不阻止查看且不发送 Host 选择", () => {
    const { remote, title, tooltip, hover, leave, browser, row, side, messages } = renderTooltipGraph();
    const rowClick = vi.fn(); row(side).addEventListener("click", rowClick);
    const click = new browser.MouseEvent("click", { bubbles: true, cancelable: true });
    remote.dispatchEvent(click); expect(click.defaultPrevented).toBe(true);
    expect(tooltip.hidden).toBe(false);
    leave(remote); hover(title); vi.advanceTimersByTime(500);
    expect(tooltip.textContent).toBe(remote.dataset.hoverText); expect(tooltip.hidden).toBe(false);
    remote.click(); expect(tooltip.hidden).toBe(true); expect(remote.getAttribute("aria-expanded")).toBe("false");
    expect(rowClick).not.toHaveBeenCalled();
    expect(row(side).querySelector("input")!.disabled).toBe(true); expect(row(side).querySelector("input")!.checked).toBe(false);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("branch、HEAD和普通tag恢复静态badge，无hover提示或视觉hover，不阻断行点击", () => {
    const { row, middle, document, tooltip, hover, leave, browser, messages } = renderTooltipGraph();
    const badges = Array.from(row(middle).querySelectorAll(".decorations .decoration")) as HTMLElement[];
    expect(badges.map(badge => badge.textContent)).toEqual(["HEAD", "develop", "v0.9.1"]);
    const clicked = vi.fn(); row(middle).addEventListener("click", clicked);
    for (const badge of badges) {
      expect(badge.tagName).toBe("SPAN");
      expect(badge.hasAttribute("data-hover-text")).toBe(false);
      expect(badge.hasAttribute("data-hover-pin")).toBe(false);
      expect(badge.title).toBe(""); expect(badge.getAttribute("aria-label")).toBeTruthy();
      hover(badge); vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(true);
      const click = new browser.MouseEvent("click", { bubbles: true, cancelable: true });
      badge.dispatchEvent(click); expect(click.defaultPrevented).toBe(false);
      leave(badge);
    }
    expect(clicked).toHaveBeenCalledTimes(3);
    const css = document.querySelector("style")!.textContent!;
    expect(css).not.toMatch(/\.decoration:hover\s*\{/u);
    expect(css).not.toMatch(/\.decoration\s*\{[^}]*cursor:\s*help/u);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("长文本进入/离开可取消待弹出，切换目标重新等待500ms而不显示旧内容", () => {
    const { title, tooltip, hover, leave, row, middle, subject, messages } = renderTooltipGraph();
    hover(title); vi.advanceTimersByTime(300); leave(title);
    vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(true);
    const meta = row(middle).querySelector(".meta-hash") as HTMLElement;
    hover(title); vi.advanceTimersByTime(300); leave(title, meta); hover(meta);
    vi.advanceTimersByTime(499); expect(tooltip.hidden).toBe(true);
    vi.advanceTimersByTime(1); expect(tooltip.textContent).toBe(middle); expect(tooltip.hidden).toBe(false);
    leave(meta, title); hover(title);
    vi.advanceTimersByTime(499); expect(tooltip.textContent).not.toBe(subject);
    vi.advanceTimersByTime(1); expect(tooltip.textContent).toBe(subject); expect(tooltip.hidden).toBe(false);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("长文本延迟提示支持反复显示和移入正文，离开后清理可访问描述", () => {
    const { title, tooltip, hover, leave, messages } = renderTooltipGraph();
    title.setAttribute("aria-describedby", "existing-description");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      hover(title); vi.advanceTimersByTime(500); expect(tooltip.hidden).toBe(false);
      expect(title.getAttribute("aria-describedby")).toBe("existing-description ktc-hover-tooltip");
      leave(title); vi.advanceTimersByTime(119); hover(tooltip);
      vi.advanceTimersByTime(500); expect(tooltip.hidden).toBe(false);
      leave(tooltip); vi.advanceTimersByTime(120); expect(tooltip.hidden).toBe(true);
      expect(title.getAttribute("aria-describedby")).toBe("existing-description");
    }
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it.each(["Escape", "outside", "pointerdown", "scroll", "resize", "blur"] as const)("长文本等待期间 %s 取消，不能迟到弹出", dismissal => {
    const { title, tooltip, hover, browser, document, messages } = renderTooltipGraph();
    hover(title); vi.advanceTimersByTime(300);
    if (dismissal === "Escape") document.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else if (dismissal === "outside") document.body.click();
    else if (dismissal === "pointerdown") title.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true, buttons: 1 }));
    else if (dismissal === "scroll") document.dispatchEvent(new browser.Event("scroll"));
    else browser.dispatchEvent(new browser.Event(dismissal));
    vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(true);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it.each(["Escape", "outside", "scroll", "resize", "blur"] as const)("固定提示在 %s 后关闭，且仅能重新点击打开", dismissal => {
    const { remote, tooltip, hover, browser, document, messages } = renderTooltipGraph();
    remote.click(); expect(tooltip.hidden).toBe(false);
    if (dismissal === "Escape") document.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    else if (dismissal === "outside") document.body.click();
    else if (dismissal === "scroll") document.dispatchEvent(new browser.Event("scroll"));
    else browser.dispatchEvent(new browser.Event(dismissal));
    expect(tooltip.hidden).toBe(true); expect(remote.getAttribute("aria-expanded")).toBe("false");
    expect(remote.hasAttribute("aria-describedby")).toBe(false);
    hover(remote); vi.advanceTimersByTime(1000); expect(tooltip.hidden).toBe(true);
    remote.click(); expect(tooltip.hidden).toBe(false);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("提示正文内部滚动/点击保持可读，不误当外部点击或发送命令", () => {
    const { remote, tooltip, browser, messages } = renderTooltipGraph();
    remote.click();
    tooltip.dispatchEvent(new browser.Event("scroll", { bubbles: true }));
    tooltip.click();
    expect(tooltip.hidden).toBe(false);
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("浮层用真实测量在视口内收敛，靠底部向上避让且不被提交行裁剪", () => {
    const { remote, tooltip, browser, document, messages } = renderTooltipGraph();
    Object.defineProperty(browser, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(browser, "innerHeight", { configurable: true, value: 240 });
    vi.spyOn(remote, "getBoundingClientRect").mockReturnValue(new browser.DOMRect(295, 210, 20, 20));
    vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue(new browser.DOMRect(0, 0, 200, 100));
    remote.click();
    expect(tooltip.parentElement).toBe(document.body);
    expect(tooltip.style.left).toBe("112px"); expect(tooltip.style.top).toBe("105px");
    vi.mocked(remote.getBoundingClientRect).mockReturnValue(new browser.DOMRect(-10, -10, 20, 20));
    remote.click(); remote.click(); expect(tooltip.style.left).toBe("8px"); expect(tooltip.style.top).toBe("15px");
    vi.mocked(tooltip.getBoundingClientRect).mockReturnValue(new browser.DOMRect(0, 0, 200, 250));
    remote.click(); remote.click(); expect(tooltip.style.top).toBe("8px");
    const css = document.querySelector("style")!.textContent!;
    expect(css).toContain("#ktc-hover-tooltip { position:fixed;");
    expect(css).toContain("max-height:calc(100vh - 16px); overflow:auto;");
    expect(css).toContain("#ktc-hover-tooltip[hidden] { display:none !important; }");
    expect(messages).toEqual([{ type: "ready" }]);
  });

  it("中间节点可勾选；禁用行点击/拖拽不恢复资格，行内简报和重置时间仍可操作", () => {
    const { middle, side, row, document, browser } = renderEligibilityGraph();
    const messages: unknown[] = [];
    const script = document.querySelector("script")!.textContent!;
    new Function("document", "window", "acquireVsCodeApi", script)(document, browser, () => ({ postMessage: (message: unknown) => messages.push(message) }));
    expect(messages).toEqual([{ type: "ready" }]);
    const blocked = row(side), checkbox = blocked.querySelector("input")!;
    checkbox.click(); checkbox.dispatchEvent(new browser.Event("change", { bubbles: true }));
    blocked.querySelector(".range-handle")!.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
    browser.dispatchEvent(new browser.PointerEvent("pointerup", { pointerId: 1 }));
    expect(messages).toHaveLength(1); expect(checkbox.disabled).toBe(true);
    row(middle).querySelector("input")!.click();
    expect(messages.at(-1)).toEqual({ type: "select", oid: middle, checked: true });

    row(middle).querySelector(".range-handle")!.dispatchEvent(new browser.PointerEvent("pointerdown", { bubbles: true, pointerId: 2 }));
    vi.spyOn(document, "elementFromPoint").mockReturnValue(blocked);
    browser.dispatchEvent(new browser.PointerEvent("pointermove", { pointerId: 2 }));
    expect(checkbox.disabled).toBe(true); expect(checkbox.checked).toBe(false);
    expect(blocked.classList.contains("range-preview")).toBe(false);
    browser.dispatchEvent(new browser.PointerEvent("pointerup", { pointerId: 2 }));
    expect(messages.at(-1)).toEqual({ type: "select", oid: middle, checked: true, anchorOid: middle });
    expect(checkbox.disabled).toBe(true); expect(checkbox.checked).toBe(false);

    const copy = blocked.querySelector("[data-copy-summary]") as HTMLButtonElement;
    const reset = blocked.querySelector("[data-reset-time]") as HTMLButtonElement;
    expect(copy.disabled).toBe(false); expect(reset.disabled).toBe(false);
    expect((blocked.querySelector(".row-menu > summary") as HTMLElement).title).toBe("提交操作");
    copy.click(); expect(messages.at(-1)).toEqual({ type: "copySummary", oid: side });
    reset.click(); expect(messages.at(-1)).toEqual({ type: "resetCommitTime", oid: side });
  });

  it("上下文失效与忙碌禁选不误标为非当前分支", () => {
    const { middle, row } = renderEligibilityGraph({ selectionDisabledReason: "当前分支已变更，请重新打开合并视图" });
    expect(row(middle).dataset.hoverText).toBe("当前分支已变更，请重新打开合并视图");
    expect(row(middle).querySelector("input")!.disabled).toBe(true);
    const loading = renderEligibilityGraph({ status: "loading" });
    expect(loading.row(loading.middle).dataset.hoverText).toBe("正在处理提交图，请稍候");
    expect(loading.row(loading.middle).querySelector("input")!.disabled).toBe(true);
  });

  const branchOptions = [
    { name: "topic/available", current: false, enabled: true },
    { name: "topic/occupied", current: false, enabled: false, disabledReason: "已被其他工作树占用：/worktree/topic" },
    { name: "develop", current: true, enabled: true },
  ];

  it("当前分支优先；占用分支禁用且说明在选项文案和可悬停外层可见", () => {
    const { document } = renderEligibilityGraph({ branchOptions });
    const select = document.querySelector("#branch-select") as HTMLSelectElement;
    expect(select.value).toBe("develop"); expect(select.options[0]!.value).toBe("develop");
    expect(select.disabled).toBe(false);
    const occupied = Array.from(select.options).find(option => option.value === "topic/occupied")!;
    expect(occupied.disabled).toBe(true);
    expect(occupied.textContent).toContain("已被其他工作树占用：/worktree/topic");
    expect(occupied.title).toBe("已被其他工作树占用：/worktree/topic");
    expect((select.parentElement as HTMLElement).dataset.hoverText).toContain("topic/occupied：已被其他工作树占用");
  });

  it("选择分支仅发送受信可用目标意图，立即还原当前值并锁定防重复；Host重投影后恢复", () => {
    const { document, browser, view, panel, state } = renderEligibilityGraph({ branchOptions });
    const messages: unknown[] = [];
    const connect = () => new Function("document", "window", "acquireVsCodeApi", document.querySelector("script")!.textContent!)(document, browser, () => ({ postMessage: (message: unknown) => messages.push(message) }));
    connect();
    let select = document.querySelector("#branch-select") as HTMLSelectElement;
    select.dispatchEvent(new browser.Event("change"));
    select.value = "topic/occupied"; select.dispatchEvent(new browser.Event("change"));
    expect(messages).toEqual([{ type: "ready" }]); expect(select.value).toBe("develop");
    select.value = "topic/available"; select.dispatchEvent(new browser.Event("change"));
    expect(messages.at(-1)).toEqual({ type: "selectBranch", branchName: "topic/available" });
    expect(select.value).toBe("develop"); expect(select.disabled).toBe(true);
    select.value = "topic/available"; select.dispatchEvent(new browser.Event("change"));
    expect(messages).toHaveLength(2);
    view.show(state); document.body.innerHTML = panel.webview.html; connect();
    select = document.querySelector("#branch-select") as HTMLSelectElement;
    expect(select.value).toBe("develop"); expect(select.disabled).toBe(false);
  });

  it.each(["loading", "preflight"] as const)("%s期间不可发出分支切换意图", status => {
    const { document, browser } = renderEligibilityGraph({ branchOptions, status });
    const messages: unknown[] = [];
    new Function("document", "window", "acquireVsCodeApi", document.querySelector("script")!.textContent!)(document, browser, () => ({ postMessage: (message: unknown) => messages.push(message) }));
    const select = document.querySelector("#branch-select") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    select.value = "topic/available"; select.dispatchEvent(new browser.Event("change"));
    expect(messages).toEqual([{ type: "ready" }]); expect(select.value).toBe("develop");
  });

  it("只转发有效的分支选择消息；不把 checkout 或 force 交给 Webview", () => {
    const panel = fakePanel(); createWebviewPanel.mockReturnValue(panel);
    const onMessage = vi.fn(async () => {});
    const view = new KtcGitSquashViewController({ onMessage, onDispose: vi.fn() });
    view.show({ repositoryId: "/repo", repositoryName: "repo", branchLabel: "develop", expectedHeadOid: oid,
      refsScope: "head", commits: [], graphRows: [], selectedOids: [], selectableOids: [], hasMore: false, status: "ready", message: "", branchOptions });
    const receive = vi.mocked(panel.webview.onDidReceiveMessage).mock.calls[0]![0] as (value: unknown) => void;
    receive({ type: "selectBranch", branchName: "topic/available", force: true });
    expect(onMessage).toHaveBeenCalledWith({ type: "selectBranch", branchName: "topic/available" });
    for (const branchName of ["", "bad\nbranch", "bad\0branch", "x".repeat(513), 123]) receive({ type: "selectBranch", branchName });
    expect(onMessage).toHaveBeenCalledTimes(1);
  });
});
