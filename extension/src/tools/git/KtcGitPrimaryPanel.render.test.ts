import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcGitViewModel } from "../../../../src/git/KtcGitModel.js";

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
  ontoggle?: () => void;

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

  it("loads exactly the next commit when history is first expanded", async () => {
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
      count: 1,
    }]);
    history!.ontoggle?.();
    expect(events).toHaveLength(1);
    history!.open = false;
    history!.ontoggle?.();
    history!.open = true;
    history!.ontoggle?.();
    expect(events).toHaveLength(2);
  });
});
