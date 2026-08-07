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
  onclick?: () => void;

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

  dispatchEvent(): boolean {
    return true;
  }
}

function textContent(node: FakeNode | string): string {
  if (typeof node === "string") return node;
  return node.textContent + node.children.map(textContent).join("");
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
});
