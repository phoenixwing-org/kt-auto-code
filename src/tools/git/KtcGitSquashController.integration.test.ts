import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolRunContext } from "../types.js";
import type { KtcGitSquashGraphState, KtcGitSquashViewMessage } from "./KtcGitSquashViewController.js";

const mocks = vi.hoisted(() => ({
  readSummary: vi.fn(), readFull: vi.fn(), readGraph: vi.fn(), analyze: vi.fn(), execute: vi.fn(),
  readOptions: vi.fn(), switchBranch: vi.fn(), readChanges: vi.fn(), readLines: vi.fn(),
  warning: vi.fn(), command: vi.fn(),
  squashCallbacks: undefined as undefined | {
    onMessage(message: KtcGitSquashViewMessage): Promise<void>;
    onDispose(): void;
  },
}));
vi.mock("vscode", () => ({
  window: { showWarningMessage: mocks.warning },
  commands: { executeCommand: mocks.command },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback, update: vi.fn() }),
    onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
  },
  ConfigurationTarget: { Global: 1 },
}));
vi.mock("./KtcGitSquashViewController.js", () => ({
  KtcGitSquashViewController: class {
    isOpen = true;
    show = vi.fn();
    reveal = vi.fn();
    constructor(callbacks: NonNullable<typeof mocks.squashCallbacks>) { mocks.squashCallbacks = callbacks; }
    dispose(): void { this.isOpen = false; }
  },
}));
vi.mock("./KtcGitWingAdapter.js", () => ({
  KtcGitWingAdapter: class {
    readRepositorySummary = mocks.readSummary;
    readRepository = mocks.readFull;
    readCommitGraphPage = mocks.readGraph;
    analyzeSquash = mocks.analyze;
    executeSquash = mocks.execute;
  },
}));
vi.mock("./KtcGitBranchService.js", () => ({
  KtcReadLocalGitBranchOptions: mocks.readOptions,
  KtcReadLocalGitBranchLines: mocks.readLines,
  KtcSwitchToLocalGitBranch: mocks.switchBranch,
}));
vi.mock("./KtcGitStashService.js", () => ({
  KtcReadGitWorktreeChanges: mocks.readChanges,
  KtcStashGitWorktree: vi.fn(), KtcRestoreGitStash: vi.fn(),
}));

import { KtcGitController } from "./KtcGitController.js";

const root = "/test/current-worktree";
const head = "a".repeat(40);
const middle = "b".repeat(40);
const base = "c".repeat(40);
const side = "d".repeat(40);
const identity = { name: "Test", email: "test@example.invalid", date: "1710000000 +0000", dateLabel: "Test date" };
const commits = [
  { oid: head, parentOids: [middle, side] },
  { oid: side, parentOids: [base] },
  { oid: middle, parentOids: [base] },
  { oid: base, parentOids: [] },
].map((commit) => ({ ...commit, subject: "Same title", author: identity, committer: identity, decorations: [] }));
const summary = (branch = "temp") => ({
  root, name: "current-worktree", branch, currentRef: "refs/heads/" + branch,
  headOid: head, commits: [], history: [], clean: true, detached: false,
});
const branchOptions = (branch = "temp") => ({
  root, headOid: head, currentBranchName: branch,
  options: ["temp", "topic"].map((name) => ({
    name, ref: "refs/heads/" + name, oid: head, current: name === branch, disabled: false,
  })),
});

interface TestGraph {
  repositoryId: string; root: string; headOid: string; currentRef: string; refsScope: "head";
  commits: typeof commits; graphRows: []; hasMore: boolean;
  selectedOids: readonly string[]; selectableOids: readonly string[]; firstParentOids: readonly string[];
  branchOptions: { name: string; current: boolean; enabled: boolean; disabledReason?: string }[];
  selectionAnchorOid?: string; selectionEndpointOid?: string; invalidated?: boolean;
}
// Exercise the real Host message handlers without creating a VS Code window or running Git.
interface TestController {
  KtcSessions: Map<string, unknown>;
  KtcGraphSessions: Map<string, TestGraph>;
  KtcDirectories: unknown[];
  KtcRepositoryInputs: unknown[];
  KtcSelectedRepositoryId: string;
  KtcSquashViewBinding: unknown;
  KtcSquashView: { show: ReturnType<typeof vi.fn>; isOpen: boolean; reveal: ReturnType<typeof vi.fn> };
  KtcSquashDraft: unknown;
  KtcGraphReadGeneration: number;
  KtcLastRunContext: ToolRunContext | undefined;
  KtcPostState: ReturnType<typeof vi.fn>;
  KtcHandleSquashViewMessage(message: KtcGitSquashViewMessage, ctx: ToolRunContext): Promise<void>;
}

function registerMessages(harness: ReturnType<typeof createHarness>): NonNullable<typeof mocks.squashCallbacks> {
  harness.controller.KtcLastRunContext = harness.ctx;
  (harness.controller as unknown as KtcGitController).register({
    subscriptions: [],
    globalState: { get: () => [], update: vi.fn() },
  } as never);
  if (!mocks.squashCallbacks) throw new Error("Git squash callbacks were not registered");
  return mocks.squashCallbacks;
}

function createHarness() {
  const controller = new KtcGitController() as unknown as TestController;
  const graph: TestGraph = {
    repositoryId: root, root, headOid: head, currentRef: "refs/heads/temp", refsScope: "head",
    commits, graphRows: [], hasMore: false, selectedOids: [],
    firstParentOids: [head, middle, base], selectableOids: [head, middle, base],
    branchOptions: branchOptions().options.map((option) => ({ name: option.name, current: option.current, enabled: !option.disabled })),
  };
  controller.KtcSessions.set(root, { snapshot: summary(), hasMoreCommits: false });
  controller.KtcGraphSessions.set(root, graph);
  controller.KtcDirectories = [{ root, name: "current-worktree", relativePath: ".", sourceGroup: "workspace" }];
  controller.KtcRepositoryInputs = [{ id: root, root, name: "current-worktree" }];
  controller.KtcSelectedRepositoryId = root;
  controller.KtcSquashViewBinding = { repositoryId: root, repositoryName: "current-worktree", branchLabel: "temp" };
  const show = vi.fn<(state: KtcGitSquashGraphState) => void>();
  controller.KtcSquashView = { show, isOpen: true, reveal: vi.fn() };
  controller.KtcPostState = vi.fn();
  const ctx = { log: vi.fn(), postState: vi.fn() } as unknown as ToolRunContext;
  return { controller, graph, show, ctx,
    send: (message: KtcGitSquashViewMessage) => controller.KtcHandleSquashViewMessage(message, ctx) };
}

describe("Git squash Host current-branch boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.squashCallbacks = undefined;
    mocks.readSummary.mockResolvedValue(summary());
    mocks.readFull.mockResolvedValue(summary());
    mocks.readOptions.mockResolvedValue(branchOptions());
    mocks.readChanges.mockResolvedValue({ total: 0, staged: 0, modified: 0, untracked: 0, items: [] });
    mocks.readLines.mockResolvedValue([{ name: "temp", firstParentOids: [head, middle, base] }]);
    mocks.readGraph.mockResolvedValue({ root, headOid: head, refsScope: "head", commits, graphRows: [], hasMore: false });
    mocks.warning.mockResolvedValue(undefined);
    mocks.switchBranch.mockResolvedValue(undefined);
  });

  it("rejects a forged side-branch checkbox although its same-title row is visible", async () => {
    const h = createHarness();
    await expect(h.send({ type: "select", oid: side, checked: true })).rejects.toThrow(/当前分支/);
    expect(h.controller.KtcGraphSessions.get(root)?.selectedOids).toEqual([]);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["preflight", "stashAndPreflight", "execute"] as const)("rejects forged %s side-branch OIDs before any write/preflight", async (type) => {
    const h = createHarness();
    const message = type === "execute"
      ? { type, selectedOids: [side, base], message: "combine", author: identity, committer: identity }
      : { type, selectedOids: [side, base] };
    await expect(h.send(message)).rejects.toThrow(/当前分支/);
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("keeps a current first-parent middle interval selectable without selecting HEAD", async () => {
    const h = createHarness();
    await h.send({ type: "select", oid: middle, checked: true });
    await h.send({ type: "select", oid: base, checked: true });
    expect(h.controller.KtcGraphSessions.get(root)?.selectedOids).toEqual([middle, base]);
    expect(h.controller.KtcGraphSessions.get(root)?.selectableOids).not.toContain(side);
    expect(mocks.readFull).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("invalidates old selection after a branch change even when HEAD is unchanged", async () => {
    const h = createHarness();
    h.graph.selectedOids = [middle, base];
    h.controller.KtcSquashDraft = { selectedOids: [middle, base] };
    mocks.readSummary.mockResolvedValue(summary("topic"));
    mocks.readFull.mockResolvedValue(summary("topic"));
    mocks.readOptions.mockResolvedValue(branchOptions("topic"));
    await h.send({ type: "preflight", selectedOids: [middle, base] }).catch(() => undefined);
    expect(h.show).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "error", message: expect.stringContaining("当前分支已变更"),
      selectedOids: [], selectableOids: [],
    }));
    expect(h.controller.KtcSquashDraft).toBeUndefined();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not switch or lose the existing interval when the user cancels the branch confirmation", async () => {
    const h = createHarness();
    h.graph.selectedOids = [middle, base];
    await h.send({ type: "selectBranch", branchName: "topic" });
    expect(mocks.warning).toHaveBeenCalled();
    expect(mocks.switchBranch).not.toHaveBeenCalled();
    expect(h.controller.KtcGraphSessions.get(root)?.selectedOids).toEqual([middle, base]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("switches only the bound worktree after confirmation and reloads HEAD scope with no old selection", async () => {
    const h = createHarness();
    h.graph.selectedOids = [middle, base];
    h.controller.KtcSquashDraft = { selectedOids: [middle, base] };
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.switchBranch.mockImplementation(async () => {
      mocks.readSummary.mockResolvedValue(summary("topic"));
      mocks.readFull.mockResolvedValue(summary("topic"));
      mocks.readOptions.mockResolvedValue(branchOptions("topic"));
    });
    await h.send({ type: "selectBranch", branchName: "topic" });
    expect(mocks.switchBranch).toHaveBeenCalledTimes(1);
    expect(mocks.switchBranch.mock.calls[0]?.slice(0, 2)).toEqual([root, "topic"]);
    expect(mocks.readGraph).toHaveBeenCalledWith(root, expect.objectContaining({ refsScope: "head" }));
    expect(h.controller.KtcGraphSessions.get(root)).toEqual(expect.objectContaining({
      currentRef: "refs/heads/topic", selectedOids: [], refsScope: "head",
    }));
    expect(h.controller.KtcSquashDraft).toBeUndefined();
    expect(mocks.command).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("blocks a forged selection of a branch occupied by another worktree", async () => {
    const h = createHarness();
    h.graph.branchOptions[1] = { name: "topic", current: false, enabled: false, disabledReason: "已被其他工作树占用：/test/other" };
    const options = branchOptions();
    mocks.readOptions.mockResolvedValue({ ...options, options: options.options.map((option) => (
      option.name === "topic" ? { ...option, disabled: true, reason: "已被其他工作树占用：/test/other" } : option
    )) });
    await expect(h.send({ type: "selectBranch", branchName: "topic" })).rejects.toThrow(/其他工作树占用/);
    expect(mocks.switchBranch).not.toHaveBeenCalled();
    expect(mocks.readGraph).not.toHaveBeenCalled();
  });

  it("blocks checkout with uncommitted changes without automatic stash", async () => {
    const h = createHarness();
    mocks.readChanges.mockResolvedValue({ total: 1, staged: 0, modified: 1, untracked: 0, items: [] });
    await expect(h.send({ type: "selectBranch", branchName: "topic" })).rejects.toThrow(/未提交/);
    expect(mocks.switchBranch).not.toHaveBeenCalled();
    expect(mocks.readGraph).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("shows a modal warning when the branch combo is blocked by worktree changes", async () => {
    const h = createHarness();
    h.graph.selectedOids = [middle, base];
    const draft = { selectedOids: [middle, base], message: "keep this draft" };
    h.controller.KtcSquashDraft = draft;
    const callbacks = registerMessages(h);
    mocks.readChanges.mockResolvedValue({ total: 2, staged: 0, modified: 1, untracked: 1, items: [] });

    await callbacks.onMessage({ type: "selectBranch", branchName: "topic" });

    expect(mocks.warning).toHaveBeenCalledTimes(1);
    expect(mocks.warning).toHaveBeenCalledWith(
      "无法切换 Git 分支",
      expect.objectContaining({
        modal: true,
        detail: expect.stringMatching(/未提交或未跟踪改动[\s\S]*未执行 force、stash 或清理工作区/u),
      }),
      "知道了",
    );
    expect(h.controller.KtcGraphSessions.get(root)?.selectedOids).toEqual([middle, base]);
    expect(h.controller.KtcSquashDraft).toBe(draft);
    expect(mocks.switchBranch).not.toHaveBeenCalled();
  });

  it("shows the failure modal after a confirmed checkout fails, while a normal cancel only uses its confirmation", async () => {
    const failed = createHarness();
    const failedCallbacks = registerMessages(failed);
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.switchBranch.mockRejectedValue(new Error("目标分支刚被其他工作树占用"));
    await failedCallbacks.onMessage({ type: "selectBranch", branchName: "topic" });
    expect(mocks.warning).toHaveBeenCalledTimes(2);
    expect(mocks.warning.mock.calls[0]?.[0]).toContain("切换到本地分支");
    expect(mocks.warning.mock.calls[1]?.[0]).toBe("无法切换 Git 分支");

    vi.clearAllMocks();
    mocks.readSummary.mockResolvedValue(summary());
    mocks.readChanges.mockResolvedValue({ total: 0, staged: 0, modified: 0, untracked: 0, items: [] });
    mocks.readOptions.mockResolvedValue(branchOptions());
    mocks.warning.mockResolvedValue(undefined);
    const cancelled = createHarness();
    cancelled.graph.selectedOids = [middle, base];
    const draft = { selectedOids: [middle, base], message: "cancel keeps draft" };
    cancelled.controller.KtcSquashDraft = draft;
    const cancelledCallbacks = registerMessages(cancelled);
    await cancelledCallbacks.onMessage({ type: "selectBranch", branchName: "topic" });
    expect(mocks.warning).toHaveBeenCalledTimes(1);
    expect(mocks.warning.mock.calls[0]?.[0]).toContain("切换到本地分支");
    expect(mocks.warning.mock.calls.some(([message]) => message === "无法切换 Git 分支")).toBe(false);
    expect(cancelled.controller.KtcGraphSessions.get(root)?.selectedOids).toEqual([middle, base]);
    expect(cancelled.controller.KtcSquashDraft).toBe(draft);
  });

  it("does not show an old branch failure modal or error state after the Right session is replaced", async () => {
    const h = createHarness();
    const callbacks = registerMessages(h);
    let finishChanges: ((value: { total: number; staged: number; modified: number; untracked: number; items: never[] }) => void) | undefined;
    mocks.readChanges.mockImplementation(() => new Promise((resolve) => { finishChanges = resolve; }));
    const pending = callbacks.onMessage({ type: "selectBranch", branchName: "topic" });
    await vi.waitFor(() => expect(mocks.readChanges).toHaveBeenCalledTimes(1));

    const replacement = { ...h.graph, currentRef: "refs/heads/topic", selectedOids: [base] };
    const replacementDraft = { selectedOids: [base], message: "replacement draft" };
    h.controller.KtcGraphSessions.set(root, replacement);
    h.controller.KtcSquashViewBinding = { repositoryId: root, repositoryName: "current-worktree", branchLabel: "topic" };
    h.controller.KtcSquashDraft = replacementDraft;
    h.controller.KtcGraphReadGeneration += 1;
    finishChanges?.({ total: 1, staged: 0, modified: 1, untracked: 0, items: [] });
    await pending;

    expect(mocks.warning).not.toHaveBeenCalled();
    expect(h.controller.KtcPostState).not.toHaveBeenCalled();
    expect(h.controller.KtcGraphSessions.get(root)).toBe(replacement);
    expect(h.controller.KtcSquashDraft).toBe(replacementDraft);
  });

  it("preserves the draft and interval if checkout fails before changing the frozen identity", async () => {
    const h = createHarness();
    h.graph.selectedOids = [middle, base];
    const draft = { selectedOids: [middle, base], message: "edited draft" };
    h.controller.KtcSquashDraft = draft;
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.switchBranch.mockRejectedValue(new Error("目标分支刚被其他工作树占用"));
    await expect(h.send({ type: "selectBranch", branchName: "topic" })).rejects.toThrow(/其他工作树/);
    expect(h.controller.KtcGraphSessions.get(root)?.selectedOids).toEqual([middle, base]);
    expect(h.controller.KtcSquashDraft).toBe(draft);
    expect(mocks.readGraph).not.toHaveBeenCalled();
  });

  it("does not dispatch checkout after Right is closed during the confirmation dialog", async () => {
    const h = createHarness();
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => {
      h.controller.KtcGraphSessions.clear();
      h.controller.KtcSquashViewBinding = undefined;
      h.controller.KtcGraphReadGeneration += 1;
      return items[0];
    });
    await h.send({ type: "selectBranch", branchName: "topic" }).catch(() => undefined);
    expect(mocks.switchBranch).not.toHaveBeenCalled();
    expect(mocks.readGraph).not.toHaveBeenCalled();
  });

  it("does not resurrect Right if it closes while an already dispatched checkout completes", async () => {
    const h = createHarness();
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.switchBranch.mockImplementation(async () => {
      h.controller.KtcGraphSessions.clear();
      h.controller.KtcSquashViewBinding = undefined;
      h.controller.KtcGraphReadGeneration += 1;
      mocks.readSummary.mockResolvedValue(summary("topic"));
      mocks.readFull.mockResolvedValue(summary("topic"));
      mocks.readOptions.mockResolvedValue(branchOptions("topic"));
    });
    await h.send({ type: "selectBranch", branchName: "topic" }).catch(() => undefined);
    expect(mocks.switchBranch).toHaveBeenCalledTimes(1);
    expect(mocks.readGraph).not.toHaveBeenCalled();
    expect(h.controller.KtcSquashViewBinding).toBeUndefined();
    expect(h.controller.KtcGraphSessions.has(root)).toBe(false);
  });

  it("does not resurrect Right when it closes during the reload identity read", async () => {
    const h = createHarness();
    let summaryReads = 0;
    let finishReloadIdentity: ((value: ReturnType<typeof summary>) => void) | undefined;
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.readSummary.mockImplementation(() => {
      summaryReads += 1;
      if (summaryReads <= 3) return Promise.resolve(summary());
      if (summaryReads === 4) return Promise.resolve(summary("topic"));
      if (summaryReads === 5) {
        return new Promise((resolve) => { finishReloadIdentity = resolve; });
      }
      return Promise.resolve(summary("topic"));
    });
    const switching = h.send({ type: "selectBranch", branchName: "topic" });
    await vi.waitFor(() => expect(summaryReads).toBe(5));
    h.controller.KtcGraphSessions.clear();
    h.controller.KtcSquashViewBinding = undefined;
    h.controller.KtcSquashView.isOpen = false;
    h.controller.KtcGraphReadGeneration += 1;
    finishReloadIdentity?.(summary("topic"));
    await switching;
    expect(mocks.switchBranch).toHaveBeenCalledTimes(1);
    expect(mocks.readGraph).not.toHaveBeenCalled();
    expect(h.controller.KtcGraphSessions.has(root)).toBe(false);
    expect(h.controller.KtcSquashViewBinding).toBeUndefined();
  });

  it("does not let an old reload identity receipt overwrite a newly opened Right session", async () => {
    const h = createHarness();
    let summaryReads = 0;
    let finishReloadIdentity: ((value: ReturnType<typeof summary>) => void) | undefined;
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.readSummary.mockImplementation(() => {
      summaryReads += 1;
      if (summaryReads <= 3) return Promise.resolve(summary());
      if (summaryReads === 4) return Promise.resolve(summary("topic"));
      if (summaryReads === 5) {
        return new Promise((resolve) => { finishReloadIdentity = resolve; });
      }
      return Promise.resolve(summary("topic"));
    });
    const switching = h.send({ type: "selectBranch", branchName: "topic" });
    await vi.waitFor(() => expect(summaryReads).toBe(5));
    const reopenedGraph = { ...h.graph, currentRef: "refs/heads/topic", selectedOids: [base] };
    const reopenedDraft = { message: "new view draft during old reload" };
    h.controller.KtcGraphSessions.set(root, reopenedGraph);
    h.controller.KtcSquashViewBinding = { repositoryId: root, repositoryName: "current-worktree", branchLabel: "topic" };
    h.controller.KtcSquashDraft = reopenedDraft;
    h.controller.KtcGraphReadGeneration += 1;
    finishReloadIdentity?.(summary("topic"));
    await switching;
    expect(mocks.readGraph).not.toHaveBeenCalled();
    expect(h.controller.KtcGraphSessions.get(root)).toBe(reopenedGraph);
    expect(h.controller.KtcSquashDraft).toBe(reopenedDraft);
  });

  it("does not let an old reload identity failure report into a newly opened Right session", async () => {
    const h = createHarness();
    let summaryReads = 0;
    let failReloadIdentity: ((reason: Error) => void) | undefined;
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.readSummary.mockImplementation(() => {
      summaryReads += 1;
      if (summaryReads <= 3) return Promise.resolve(summary());
      if (summaryReads === 4) return Promise.resolve(summary("topic"));
      if (summaryReads === 5) {
        return new Promise<ReturnType<typeof summary>>((_resolve, reject) => { failReloadIdentity = reject; });
      }
      return Promise.resolve(summary("topic"));
    });
    const switching = h.send({ type: "selectBranch", branchName: "topic" });
    await vi.waitFor(() => expect(summaryReads).toBe(5));
    const reopenedGraph = { ...h.graph, currentRef: "refs/heads/topic", selectedOids: [base] };
    const reopenedDraft = { message: "new view draft during rejected old reload" };
    h.controller.KtcGraphSessions.set(root, reopenedGraph);
    h.controller.KtcSquashViewBinding = { repositoryId: root, repositoryName: "current-worktree", branchLabel: "topic" };
    h.controller.KtcSquashDraft = reopenedDraft;
    h.controller.KtcGraphReadGeneration += 1;
    failReloadIdentity?.(new Error("old reload identity failed"));
    await expect(switching).resolves.toBeUndefined();
    expect(mocks.readGraph).not.toHaveBeenCalled();
    expect(h.show).not.toHaveBeenCalledWith(expect.objectContaining({
      status: "error",
      message: expect.stringContaining("old reload identity failed"),
    }));
    expect(h.controller.KtcGraphSessions.get(root)).toBe(reopenedGraph);
    expect(h.controller.KtcSquashDraft).toBe(reopenedDraft);
  });

  it("does not clear a newly reopened session draft when the old checkout completes", async () => {
    const h = createHarness();
    const reopenedGraph = { ...h.graph, currentRef: "refs/heads/topic", selectedOids: [base] };
    const reopenedDraft = { message: "new view draft" };
    mocks.warning.mockImplementation(async (_message, _options, ...items: string[]) => items[0]);
    mocks.switchBranch.mockImplementation(async () => {
      h.controller.KtcGraphSessions.set(root, reopenedGraph);
      h.controller.KtcSquashViewBinding = { repositoryId: root, repositoryName: "current-worktree", branchLabel: "topic" };
      h.controller.KtcSquashDraft = reopenedDraft;
      h.controller.KtcGraphReadGeneration += 1;
      mocks.readSummary.mockResolvedValue(summary("topic"));
      mocks.readFull.mockResolvedValue(summary("topic"));
      mocks.readOptions.mockResolvedValue(branchOptions("topic"));
    });
    await h.send({ type: "selectBranch", branchName: "topic" }).catch(() => undefined);
    expect(h.controller.KtcGraphSessions.get(root)).toBe(reopenedGraph);
    expect(h.controller.KtcSquashDraft).toBe(reopenedDraft);
    expect(mocks.readGraph).not.toHaveBeenCalled();
  });

  it("does not open a second confirmation for repeated branch intents", async () => {
    const h = createHarness();
    let cancel: ((value: undefined) => void) | undefined;
    mocks.warning.mockImplementationOnce(() => new Promise<undefined>((resolve) => { cancel = resolve; }));
    const first = h.send({ type: "selectBranch", branchName: "topic" });
    try {
      await vi.waitFor(() => expect(mocks.warning).toHaveBeenCalledTimes(1));
      await h.send({ type: "selectBranch", branchName: "topic" }).catch(() => undefined);
      expect(mocks.warning).toHaveBeenCalledTimes(1);
      expect(mocks.switchBranch).not.toHaveBeenCalled();
    } finally {
      cancel?.(undefined);
      await first.catch(() => undefined);
    }
  });

  it.each(["success", "failure"] as const)("does not let an old identity read %s overwrite a reopened Right session", async (outcome) => {
    const h = createHarness();
    let finish: ((value: ReturnType<typeof summary>) => void) | undefined;
    let fail: ((reason: Error) => void) | undefined;
    mocks.readSummary.mockImplementationOnce(() => new Promise((resolve, reject) => {
      finish = resolve; fail = reject;
    }));
    const oldRequest = h.send({ type: "select", oid: middle, checked: true }).catch(() => undefined);
    await vi.waitFor(() => expect(mocks.readSummary).toHaveBeenCalled());
    const reopenedGraph = { ...h.graph, currentRef: "refs/heads/topic", selectedOids: [base] };
    const reopenedDraft = { message: "new session draft" };
    h.controller.KtcGraphSessions.set(root, reopenedGraph);
    h.controller.KtcSquashViewBinding = { repositoryId: root, repositoryName: "current-worktree", branchLabel: "topic" };
    h.controller.KtcSquashDraft = reopenedDraft;
    h.controller.KtcGraphReadGeneration += 1;
    if (outcome === "success") finish?.(summary());
    else fail?.(new Error("old worktree read failed"));
    await oldRequest;
    expect(h.controller.KtcGraphSessions.get(root)).toBe(reopenedGraph);
    expect(h.controller.KtcSquashDraft).toBe(reopenedDraft);
    expect(h.show).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
