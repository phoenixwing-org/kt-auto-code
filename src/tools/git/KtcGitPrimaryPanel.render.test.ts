import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcGitViewModel } from "../../core/git/KtcGitModel.js";

class FakeNode {
  readonly children: Array<FakeNode | string> = [];
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  title = "";
  type = "";
  value = "";
  disabled = false;
  checked = false;
  hidden = false;
  open = false;
  onclick?: () => void;
  onchange?: () => void;
  ontoggle?: () => void;
  addEventListener(_name: string, _listener: (event: Event) => void): void {}

  constructor(readonly tagName = "") {}

  append(...nodes: Array<FakeNode | string>): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: Array<FakeNode | string>): void {
    this.children.splice(0, this.children.length, ...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  querySelector(): null {
    return null;
  }
}

class FakeElement extends FakeNode {
  readonly shadow = new FakeNode("shadow-root");
  readonly isConnected = true;

  attachShadow(): FakeNode {
    return this.shadow;
  }

  dispatchEvent(_event: { detail?: unknown }): boolean {
    return true;
  }
}

function textContent(node: FakeNode | string): string {
  if (typeof node === "string") return node;
  return node.textContent + node.children.map(textContent).join("");
}

function findNode(node: FakeNode, predicate: (candidate: FakeNode) => boolean): FakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    if (typeof child === "string") continue;
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Git Primary panel rendering", () => {
  it("renders the empty-workspace actions instead of retaining the loading placeholder", async () => {
    const registry = new Map<string, CustomElementConstructor>();
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("document", {
      createElement: (tagName: string) => new FakeNode(tagName),
    });
    vi.stubGlobal("CustomEvent", class {});
    vi.stubGlobal("customElements", {
      get: (name: string) => registry.get(name),
      define: (name: string, value: CustomElementConstructor) => registry.set(name, value),
    });

    const { KtcGitPrimaryPanel } = await import("./KtcGitPrimaryPanel.js");
    const panel = new KtcGitPrimaryPanel() as unknown as FakeElement & {
      model: KtcGitViewModel;
    };
    panel.model = {
      projects: [],
      statusText: "当前工作区未发现 Git 仓库。",
      recentCommitLimit: 1,
      workspaceFolderCount: 1,
      workspaceRepositoryCount: 0,
      discovery: { status: "idle", scannedDirectories: 0, foundRepositories: 0 },
    };

    const rendered = textContent(panel.shadow);
    expect(rendered).toContain("当前工作区未发现 Git 仓库");
    expect(rendered).toContain("新建 Git 仓库");
    expect(rendered).toContain("搜索所有子目录");
    expect(rendered).not.toContain("Git Primary 正在读取仓库");
  });

  it("loads the next five commits when history is first expanded", async () => {
    const registry = new Map<string, CustomElementConstructor>();
    const events: Array<{ detail?: unknown }> = [];
    vi.stubGlobal("HTMLElement", class extends FakeElement {
      override dispatchEvent(event: { detail?: unknown }): boolean {
        events.push(event);
        return true;
      }
    });
    vi.stubGlobal("document", {
      createElement: (tagName: string) => new FakeNode(tagName),
    });
    vi.stubGlobal("CustomEvent", class {
      constructor(_name: string, readonly options: { detail?: unknown }) {}
      get detail(): unknown { return this.options.detail; }
    });
    vi.stubGlobal("customElements", {
      get: (name: string) => registry.get(name),
      define: (name: string, value: CustomElementConstructor) => registry.set(name, value),
    });

    const { KtcGitPrimaryPanel } = await import("./KtcGitPrimaryPanel.js");
    const panel = new KtcGitPrimaryPanel() as unknown as FakeElement & { model: KtcGitViewModel };
    panel.model = {
      projects: [{
        repository: {
          id: "/repo",
          name: "repo",
          relativePath: ".",
          branchLabel: "develop",
          upstreamLabel: "origin/develop",
          headLabel: "1234567",
          stateLabel: "状态待读取",
          detached: false,
          clean: false,
          loaded: true,
          external: false,
          groupLabel: "当前工作区",
          headOid: "1234567890abcdef",
        },
        actions: [],
        commits: [{
          oid: "1234567890abcdef",
          shortOid: "1234567",
          subject: "最新提交",
          body: "",
          author: { name: "Phoenix", email: "dev@example.com", date: "0", dateLabel: "2026-08-08 10:00" },
          committer: { name: "Phoenix", email: "dev@example.com", date: "0", dateLabel: "2026-08-08 10:00" },
          isHead: true,
        }],
        visibleCommitLimit: 20,
        totalCommitCount: 1,
        hasMoreCommits: true,
      }],
      selectedRepositoryId: "/repo",
      statusText: "已读取 1 个 Git 仓库。",
      recentCommitLimit: 20,
      workspaceFolderCount: 1,
      workspaceRepositoryCount: 1,
      discovery: { status: "idle", scannedDirectories: 0, foundRepositories: 1 },
    };

    const history = findNode(panel.shadow, (node) => node.tagName === "details" && textContent(node).includes("更多 commit"));
    expect(history).toBeDefined();
    expect(events).toHaveLength(0);
    history!.open = true;
    history!.ontoggle?.();
    expect(events.map((event) => event.detail)).toEqual([{
      action: "loadOlderCommits",
      repositoryId: "/repo",
      expectedHeadOid: "1234567890abcdef",
      count: 5,
    }]);
    history!.ontoggle?.();
    expect(events).toHaveLength(1);
    history!.open = false;
    history!.ontoggle?.();
    history!.open = true;
    history!.ontoggle?.();
    expect(events).toHaveLength(2);

    history!.open = false;
    history!.ontoggle?.();
    const next = findNode(panel.shadow, (node) => node.tagName === "button" && node.textContent === "下一条");
    expect(next).toBeDefined();
    next!.onclick?.();
    expect(events.at(-1)?.detail).toEqual({
      action: "loadOlderCommits",
      repositoryId: "/repo",
      expectedHeadOid: "1234567890abcdef",
      count: 1,
    });
    panel.model = panel.model;
    const reopenedHistory = findNode(panel.shadow, (node) => node.tagName === "details" && textContent(node).includes("更多 commit"));
    expect(reopenedHistory?.open).toBe(true);
  });

  it("未选或只选一条时仍打开合并 View", async () => {
    const registry = new Map<string, CustomElementConstructor>();
    const events: Array<{ detail?: unknown }> = [];
    vi.stubGlobal("HTMLElement", class extends FakeElement {
      override dispatchEvent(event: { detail?: unknown }): boolean { events.push(event); return true; }
    });
    vi.stubGlobal("document", { createElement: (tagName: string) => new FakeNode(tagName) });
    vi.stubGlobal("CustomEvent", class {
      constructor(_name: string, readonly options: { detail?: unknown }) {}
      get detail(): unknown { return this.options.detail; }
    });
    vi.stubGlobal("customElements", {
      get: (name: string) => registry.get(name),
      define: (name: string, value: CustomElementConstructor) => registry.set(name, value),
    });

    const { KtcGitPrimaryPanel } = await import("./KtcGitPrimaryPanel.js");
    const panel = new KtcGitPrimaryPanel() as unknown as FakeElement & { model: KtcGitViewModel };
    panel.model = {
      projects: [{
        repository: {
          id: "/repo", name: "repo", relativePath: ".", branchLabel: "develop",
          upstreamLabel: "origin/develop", headLabel: "1234567", stateLabel: "工作区干净",
          detached: false, clean: true, loaded: true, external: false, groupLabel: "当前工作区",
          headOid: "1234567890abcdef",
        },
        actions: [{
          id: "squashLocalCommits", title: "合并", description: "", buttonLabel: "打开",
          tone: "caution", badge: "本地", enabled: true,
        }],
        commits: [{
          oid: "1234567890abcdef", shortOid: "1234567", subject: "最新提交", body: "",
          author: { name: "Phoenix", email: "dev@example.com", date: "0", dateLabel: "2026-08-08 10:00" },
          committer: { name: "Phoenix", email: "dev@example.com", date: "0", dateLabel: "2026-08-08 10:00" },
          isHead: true,
        }],
        visibleCommitLimit: 20, totalCommitCount: 1, hasMoreCommits: false,
      }],
      selectedRepositoryId: "/repo", statusText: "", recentCommitLimit: 20,
      workspaceFolderCount: 1, workspaceRepositoryCount: 1,
      discovery: { status: "idle", scannedDirectories: 0, foundRepositories: 1 },
    };

    const merge = findNode(panel.shadow, (node) => node.tagName === "button" && node.textContent === "合并区间");
    expect(merge).toBeDefined();
    merge!.onclick?.();
    expect(events.at(-1)?.detail).toEqual({ action: "openAction", actionId: "squashLocalCommits", repositoryId: "/repo" });

    const checkbox = findNode(panel.shadow, (node) => node.tagName === "input" && node.className === "commit-select");
    expect(checkbox).toBeDefined();
    checkbox!.checked = false;
    checkbox!.onchange?.();
    merge!.onclick?.();
    expect(events.at(-1)?.detail).toEqual({ action: "openAction", actionId: "squashLocalCommits", repositoryId: "/repo" });
  });
});
