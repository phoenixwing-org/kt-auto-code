import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcToolNavigatorModel } from "./KtcToolNavigator.js";

class FakeClassList {
  constructor(private readonly node: FakeNode) {}
  add(...names: string[]): void {
    const values = new Set(this.node.className.split(/\s+/u).filter(Boolean));
    names.forEach((name) => values.add(name));
    this.node.className = [...values].join(" ");
  }
  contains(name: string): boolean { return this.node.className.split(/\s+/u).includes(name); }
}

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList(this);
  className = "";
  textContent = "";
  title = "";
  type = "";
  onclick?: () => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

class FakeElement extends FakeNode {
  readonly events: Array<{ type: string; detail: unknown; bubbles?: boolean; composed?: boolean }> = [];
  readonly shadow = new FakeNode("shadow-root");
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown; bubbles?: boolean; composed?: boolean }): boolean {
    this.events.push(event);
    return true;
  }
}

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
    createElementNS: (_namespace: string, tagName: string) => new FakeNode(tagName),
  });
  vi.stubGlobal("CustomEvent", class<T> {
    readonly bubbles: boolean;
    readonly composed: boolean;
    constructor(public readonly type: string, init: { detail: T; bubbles?: boolean; composed?: boolean }) {
      this.detail = init.detail;
      this.bubbles = Boolean(init.bubbles);
      this.composed = Boolean(init.composed);
    }
    readonly detail: T;
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
  root.children.forEach((child) => found.push(...findNodes(child, predicate)));
  return found;
}

function byAria(root: FakeNode, label: string): FakeNode {
  return findNodes(root, (node) => node.attributes.get("aria-label") === label)[0]!;
}

const MODEL: KtcToolNavigatorModel = {
  title: "功能目录",
  mode: "outline",
  expanded: true,
  expandedGroupIds: ["cpp"],
  activeToolId: "headerAscii",
  nodes: [{
    kind: "group",
    id: "cpp",
    label: "C++ 整理",
    children: [
      { kind: "tool", id: "header", toolId: "headerAscii", label: "头文件 ASCII", description: "预检并修正", icon: "file" },
      { kind: "tool", id: "sort", toolId: "reorderMembers", label: "成员排序", description: "预览后写回", icon: "sort" },
    ],
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcToolNavigator", () => {
  it("幂等注册，并使用同一模型渲染大纲、分组、选中工具和文本切换", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcToolNavigator.js");
    expect(browser.ktcDefineToolNavigator()).toBe(browser.ktcDefineToolNavigator());
    expect(registry.get("ktc-tool-navigator")).toBe(browser.KtcToolNavigator);
    const element = new browser.KtcToolNavigator() as unknown as FakeElement & { model: KtcToolNavigatorModel };
    element.model = MODEL;
    expect(byAria(element.shadow, "功能目录")).toBeTruthy();
    expect(byAria(element.shadow, "切换为大纲模式").attributes.get("aria-pressed")).toBe("true");
    expect(byAria(element.shadow, "切换为网格模式").textContent).toBe("网格");
    expect(byAria(element.shadow, "打开头文件 ASCII").attributes.get("aria-current")).toBe("page");
    expect(findNodes(element.shadow, (node) => node.className.includes("group"))[0]).toBeTruthy();
  });

  it("只发出布局、折叠和工具激活语义，不直接依赖 Host", async () => {
    installFakeDom();
    const browser = await import("./KtcToolNavigator.js");
    const element = new browser.KtcToolNavigator() as unknown as FakeElement & { model: KtcToolNavigatorModel };
    element.model = MODEL;
    byAria(element.shadow, "切换为网格模式").onclick?.();
    byAria(element.shadow, "收起C++ 整理").onclick?.();
    byAria(element.shadow, "打开成员排序").onclick?.();
    byAria(element.shadow, "收起功能目录").onclick?.();
    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "setMode", mode: "grid" },
      { kind: "setGroupExpanded", groupId: "cpp", expanded: false },
      { kind: "activate", toolId: "reorderMembers" },
      { kind: "setExpanded", expanded: false },
    ]);
    expect(element.events.every((event) => event.bubbles && event.composed)).toBe(true);
    expect(browser.KtcToolNavigator.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage/u,
    );
  });

  it("网格由容器宽度响应列数，大纲仍保持单列", async () => {
    installFakeDom();
    const browser = await import("./KtcToolNavigator.js");
    const element = new browser.KtcToolNavigator() as unknown as FakeElement & { model: KtcToolNavigatorModel };
    element.model = { ...MODEL, mode: "grid" };
    const shell = findNodes(element.shadow, (node) => node.className.includes("navigator mode-grid"))[0]!;
    expect(shell).toBeTruthy();
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("container-type:inline-size");
    expect(style).toContain("repeat(auto-fit,minmax(min(142px,100%),1fr))");
    expect(style).toContain("@container (max-width:300px)");
    expect(style).toContain(".mode-outline .tool");
  });
});
