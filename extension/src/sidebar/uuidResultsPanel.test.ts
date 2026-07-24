import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcUuidResultsPanelModel } from "./uuidResultsPanel.js";

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  className = ""; textContent = ""; title = ""; type = "";
  disabled = false; hidden = false; checked = false; indeterminate = false;
  onclick?: () => void; onchange?: () => void;
  constructor(readonly tagName = "") {}
  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
}
class FakeElement extends FakeNode {
  readonly events: Array<{ type: string; detail: unknown }> = [];
  readonly shadow = new FakeNode("shadow-root"); readonly isConnected = true;
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown }): boolean { this.events.push(event); return true; }
}
function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", { createElement: (tagName: string) => new FakeNode(tagName) });
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
function nodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  return [
    ...(predicate(root) ? [root] : []),
    ...root.children.flatMap((child) => nodes(child, predicate)),
  ];
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("UUID results panel", () => {
  it("幂等注册且组件不拥有 VS Code Host API", async () => {
    const registry = installFakeDom();
    const component = await import("./uuidResultsPanel.js");
    const first = component.ktcDefineUuidResultsPanel();
    expect(component.ktcDefineUuidResultsPanel()).toBe(first);
    expect(registry.get("ktc-uuid-results-panel")).toBe(first);
    expect(component.KtcUuidResultsPanel.toString()).not.toMatch(/acquireVsCodeApi|postMessage|workspace\.fs|clipboard/);
  });

  it("hits presentation 共享分组、状态、选择与 Git diff 语义事件", async () => {
    installFakeDom(); const component = await import("./uuidResultsPanel.js");
    const element = new component.KtcUuidResultsPanel() as unknown as FakeElement & { model: KtcUuidResultsPanelModel };
    element.model = {
      presentation: "hits", selectedIds: [], capabilities: { selection: true, gitDiff: true },
      hits: [
        { id: "a:1", fileId: "a", relativePath: "src/A.cpp", line: 4, column: 2, from: "123456781234123412341234567890ab", normalized: "123456781234123412341234567890ab", kind: "guid32", state: "pending" },
        { id: "b:1", fileId: "b", relativePath: "src/B.cpp", line: 8, column: 1, from: "{12345678-1234-1234-1234-1234567890ab}", normalized: "123456781234123412341234567890ab", kind: "uuid", to: "new", state: "applied" },
      ],
    };
    expect(nodes(element.shadow, (node) => node.textContent === "同值组 1")).toHaveLength(1);
    expect(nodes(element.shadow, (node) => node.textContent === "待替换")).toHaveLength(1);
    expect(nodes(element.shadow, (node) => node.textContent === "已改写")).toHaveLength(1);
    const checkbox = nodes(element.shadow, (node) => node.attributes.get("aria-label")?.includes("src/A.cpp") === true)[0]!;
    checkbox.checked = true; checkbox.onchange?.();
    nodes(element.shadow, (node) => node.attributes.get("aria-label") === "查看 Git 差异")[0]!.onclick?.();
    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "selection", scope: "hit", ids: ["a:1"] },
      { kind: "action", scope: "hit", action: "gitDiff", ids: ["b:1"] },
    ]);
  });

  it("files presentation 只选择 pending，并发出打开/应用/移除动作", async () => {
    installFakeDom(); const component = await import("./uuidResultsPanel.js");
    const element = new component.KtcUuidResultsPanel() as unknown as FakeElement & { model: KtcUuidResultsPanelModel };
    element.model = {
      presentation: "files", selectedIds: ["pending", "applied"],
      capabilities: { selection: true, open: true, apply: true, cancel: true },
      files: [
        { uri: "pending", relativePath: "src/Pending.cpp", encoding: "UTF-8", hitCount: 2, firstLine: 3, state: "pending", hasApplied: false, warnings: [], mappings: [] },
        { uri: "applied", relativePath: "src/Applied.cpp", encoding: "GBK", hitCount: 1, firstLine: 9, state: "applied", hasApplied: true, warnings: [], mappings: [] },
      ],
    };
    const pendingMain = nodes(element.shadow, (node) => node.title === "src/Pending.cpp\nUTF-8")[0]!;
    pendingMain.onclick?.();
    nodes(element.shadow, (node) => node.attributes.get("aria-label") === "应用")[0]!.onclick?.();
    nodes(element.shadow, (node) => node.attributes.get("aria-label") === "从本次结果移除")[0]!.onclick?.();
    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "action", scope: "file", action: "open", ids: ["pending"] },
      { kind: "action", scope: "file", action: "apply", ids: ["pending"] },
      { kind: "action", scope: "file", action: "cancel", ids: ["pending"] },
    ]);
    const checkboxes = nodes(element.shadow, (node) => node.tagName === "input");
    expect(checkboxes.filter((item) => item.checked)).toHaveLength(2); // group + pending; applied is rejected
  });
});
