import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcReorderMembersPanelModel } from "./reorderMembersPanelState.js";

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  title = "";
  type = "";
  value = "";
  disabled = false;
  hidden = false;
  checked = false;
  indeterminate = false;
  onclick?: () => void;
  onchange?: () => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
}

class FakeElement extends FakeNode {
  readonly events: Array<{ type: string; detail: unknown }> = [];
  readonly shadow = new FakeNode("shadow-root");
  readonly isConnected = true;
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown }): boolean {
    this.events.push(event);
    return true;
  }
}

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { textContent: text }),
  });
  vi.stubGlobal("CustomEvent", class<T> {
    constructor(public readonly type: string, public readonly init: { detail: T }) {}
    get detail(): T { return this.init.detail; }
  });
  vi.stubGlobal("customElements", {
    get: (name: string) => registry.get(name),
    define: (name: string, value: CustomElementConstructor) => registry.set(name, value),
  });
  return registry;
}

function findNodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  const found: FakeNode[] = [];
  if (predicate(root)) found.push(root);
  for (const child of root.children) found.push(...findNodes(child, predicate));
  return found;
}

const firstModel: KtcReorderMembersPanelModel = {
  presentation: "ribbon",
  status: "done",
  message: "扫描 5 个文件，2 个待写盘。",
  scanned: 5,
  reorderRevision: 7,
  reorderResults: [
    {
      uri: "file:///workspace/src/VeryLongPendingName.cpp",
      relativePath: "deep/very/long/project/tree/src/VeryLongPendingName.cpp",
      kind: "source",
      encoding: "UTF-8",
      changed: true,
      state: "pending",
      warnings: [],
    },
    {
      uri: "file:///workspace/include/Blocked.hpp",
      relativePath: "include/Blocked.hpp",
      kind: "header",
      encoding: "GBK",
      changed: true,
      state: "blocked",
      warnings: ["外部文件已变化"],
    },
    {
      uri: "file:///workspace/include/AnotherPending.hpp",
      relativePath: "include/generated/AnotherPending.hpp",
      kind: "header",
      encoding: "UTF-8",
      changed: true,
      state: "pending",
      warnings: [],
    },
    {
      uri: "file:///workspace/src/Applied.cpp",
      relativePath: "src/Applied.cpp",
      kind: "source",
      encoding: "UTF-8",
      changed: true,
      state: "applied",
      warnings: [],
    },
    {
      uri: "file:///workspace/src/Unchanged.cpp",
      relativePath: "src/Unchanged.cpp",
      kind: "source",
      encoding: "UTF-8",
      changed: false,
      state: "unchanged",
      warnings: [],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("reorder members panel", () => {
  it("幂等注册且组件边界不拥有 VS Code Host API", async () => {
    const registry = installFakeDom();
    const browser = await import("./reorderMembersPanel.js");
    const first = browser.ktcDefineReorderMembersPanel();
    const second = browser.ktcDefineReorderMembersPanel();
    expect(registry.get("ktc-reorder-members-panel")).toBe(first);
    expect(second).toBe(first);
    expect(browser.KtcReorderMembersPanel.toString()).not.toMatch(/acquireVsCodeApi|postMessage|workspace\.fs|clipboard/);
  });

  it("挂载 Sidebar 页面壳并默认只显示变更组", async () => {
    installFakeDom();
    const browser = await import("./reorderMembersPanel.js");
    const element = new browser.KtcReorderMembersPanel() as unknown as FakeElement & {
      model: KtcReorderMembersPanelModel;
    };
    element.model = firstModel;
    const text = findNodes(element.shadow, (node) => Boolean(node.textContent)).map((node) => node.textContent);
    expect(text).toEqual(expect.arrayContaining([
      "C++ 成员排序", "扫描", "应用所选（2）", "加入工作集",
      "变更文件 · 4 个", "VeryLongPendingName.cpp", "Blocked.hpp", "AnotherPending.hpp", "Applied.cpp", "M", "!", "✓",
    ]));
    expect(text).not.toContain("Unchanged.cpp");
    expect(element.attributes.get("presentation")).toBe("ribbon");
    const all = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "选择全部待写盘文件")[0]!;
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain(".shell { min-width:0; max-width:100%; margin:10px 0 12px; padding:9px; overflow:hidden; border:1px solid var(--ktc-ui-border");
    expect(style).toContain(".icon:hover { background:var(--vscode-toolbar-hoverBackground");
    expect(style).toContain(':host([presentation="results"]) .groups { max-height:min(58vh,520px); overflow:auto;');
  });

  it("两条 pending 从半选切换到组全不选/全选，并发送完整 URI", async () => {
    installFakeDom();
    const browser = await import("./reorderMembersPanel.js");
    const element = new browser.KtcReorderMembersPanel() as unknown as FakeElement & {
      model: KtcReorderMembersPanelModel;
    };
    const pendingUris = firstModel.reorderResults!
      .filter((row) => row.state === "pending")
      .map((row) => row.uri);
    element.model = { ...firstModel, reorderSelectedUris: [pendingUris[0]!] };
    let all = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "选择全部待写盘文件")[0]!;
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(true);

    all.checked = false;
    all.onchange?.();
    expect(element.events.at(-1)?.detail).toEqual({ kind: "reorderSelection", uris: [] });

    all = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "选择全部待写盘文件")[0]!;
    all.checked = true;
    all.onchange?.();
    expect(element.events.at(-1)?.detail).toEqual({ kind: "reorderSelection", uris: pendingUris });
  });

  it("显示无变更只保存在组件 Realm，不向 Host 发消息", async () => {
    installFakeDom();
    const browser = await import("./reorderMembersPanel.js");
    const element = new browser.KtcReorderMembersPanel() as unknown as FakeElement & {
      model: KtcReorderMembersPanelModel;
    };
    element.model = firstModel;
    const filter = findNodes(element.shadow, (node) => node.tagName === "input" && !node.attributes.has("aria-label"))[0]!;
    filter.checked = true;
    filter.onchange?.();
    expect(findNodes(element.shadow, (node) => node.textContent === "Unchanged.cpp")).toHaveLength(1);
    expect(element.events).toEqual([]);

    element.model = { ...firstModel, presentation: "detailBlock" };
    expect(element.attributes.get("presentation")).toBe("detailBlock");
    expect(findNodes(element.shadow, (node) => node.textContent === "Unchanged.cpp")).toHaveLength(1);
  });

  it("用一个语义事件区分 run、行 preview、选择和批量 Apply", async () => {
    installFakeDom();
    const browser = await import("./reorderMembersPanel.js");
    const element = new browser.KtcReorderMembersPanel() as unknown as FakeElement & {
      model: KtcReorderMembersPanelModel;
    };
    element.model = firstModel;
    findNodes(element.shadow, (node) => node.textContent === "扫描")[0]!.onclick?.();
    findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "预览排序差异")[0]!.onclick?.();
    const pending = findNodes(
      element.shadow,
      (node) => node.attributes.get("aria-label")?.includes("VeryLongPendingName.cpp") === true,
    )[0]!;
    pending.checked = false;
    pending.onchange?.();
    element.model = { ...firstModel, reorderSelectedUris: [firstModel.reorderResults![0]!.uri] };
    findNodes(element.shadow, (node) => node.textContent === "应用所选（1）")[0]!.onclick?.();

    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "run", action: "preview" },
      { kind: "reorderAction", action: "preview", uris: [firstModel.reorderResults![0]!.uri] },
      { kind: "reorderSelection", uris: [firstModel.reorderResults![2]!.uri] },
      { kind: "reorderAction", action: "apply", uris: [firstModel.reorderResults![0]!.uri] },
    ]);
  });

  it("Host 显式空选择覆盖 optimistic，running 禁用交互，applied 只开放 Git 与还原", async () => {
    installFakeDom();
    const browser = await import("./reorderMembersPanel.js");
    const element = new browser.KtcReorderMembersPanel() as unknown as FakeElement & {
      model: KtcReorderMembersPanelModel;
    };
    element.model = { ...firstModel, status: "running", reorderSelectedUris: [] };
    expect(findNodes(element.shadow, (node) => node.textContent === "扫描")[0]!.disabled).toBe(true);
    expect(findNodes(element.shadow, (node) => node.textContent === "应用所选")[0]!.disabled).toBe(true);
    expect(findNodes(element.shadow, (node) => node.textContent === "加入工作集")[0]!.disabled).toBe(true);
    expect(findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "选择全部待写盘文件")[0]!.disabled).toBe(true);
    expect(findNodes(
      element.shadow,
      (node) => node.attributes.get("aria-label")?.startsWith("选择 ") === true,
    ).every((node) => node.disabled)).toBe(true);
    expect(findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "预览排序差异")).toHaveLength(0);

    element.model = { ...firstModel, reorderSelectedUris: [] };
    expect(findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "查看 Git 差异")).toHaveLength(1);
    expect(findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "还原本次成员排序")).toHaveLength(1);
    expect(findNodes(element.shadow, (node) => node.textContent === "应用所选")[0]!.disabled).toBe(true);
  });
});
