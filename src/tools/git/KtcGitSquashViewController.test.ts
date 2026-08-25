import { beforeEach, describe, expect, it, vi } from "vitest";

const { createWebviewPanel } = vi.hoisted(() => ({ createWebviewPanel: vi.fn() }));

vi.mock("vscode", () => ({
  ViewColumn: { Beside: 2 },
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

  it("在编辑器旁复用同一个提交图 View，并仅展示首批 DTO", () => {
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
      hasMore: true,
      status: "ready" as const,
      message: "已读取最近 5 条本地分支提交图；按需继续加载。",
    };

    view.show(state);
    view.show(state);

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.gitSquash",
      "Git：合并本地 commit",
      { viewColumn: 2, preserveFocus: false },
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
    );
    expect(panel.webview.html).toContain("提交图");
    expect(panel.webview.html).toContain("下一条");
    expect(panel.webview.html).toContain("下 5 条");
    expect(panel.webview.html).toContain("HEAD");
    expect(panel.webview.html).toContain('grid-template-columns: 24px max-content minmax(0,1fr)');
    expect(panel.webview.html.indexOf('<span class="select"><input type="checkbox"')).toBeLessThan(panel.webview.html.indexOf('<span class="graph"'));
    expect(panel.reveal).toHaveBeenLastCalledWith(2, false);
  });
});
