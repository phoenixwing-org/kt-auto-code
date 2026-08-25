import { beforeEach, describe, expect, it, vi } from "vitest";

const { createWebviewPanel } = vi.hoisted(() => ({ createWebviewPanel: vi.fn() }));

vi.mock("vscode", () => ({
  ViewColumn: { Active: 1 },
  window: { createWebviewPanel },
}));

import type * as vscode from "vscode";
import { KtcGitSquashViewController } from "./KtcGitSquashViewController.js";

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
    expect(panel.webview.html).not.toContain("1780000000");
    expect(panel.webview.html).toContain('grid-template-columns: 24px 12px max-content minmax(0,1fr)');
    expect(panel.webview.html).toContain('class="range-handle"');
    expect(panel.webview.html).toContain("anchorOid: dragAnchor");
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
    expect(panel.webview.html).toContain('class="graph-node tip"');
    expect(panel.webview.html).toContain("--vscode-charts-magenta");
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
    expect(panel.webview.html).toContain('data-section-action id="execute"');
    expect(panel.webview.html).not.toContain('<div class="actions"><button class="primary" id="execute"');
    expect(panel.webview.html).toContain("预检详情");
    expect(panel.webview.html.indexOf("确认并执行")).toBeLessThan(panel.webview.html.indexOf("预检详情"));
    expect(panel.webview.html).toContain('details.section > summary');
  });
});
