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
  presentation: "compact",
  title: "功能目录",
  showLabels: true,
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

const LEGACY_MODEL: KtcToolNavigatorModel = {
  title: "功能目录",
  nodes: MODEL.nodes,
  mode: "outline",
  expanded: true,
  expandedGroupIds: ["cpp"],
  activeToolId: "headerAscii",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcToolNavigator", () => {
  it("未声明 presentation 时保持正式 View 的旧标题、分组和事件契约", async () => {
    installFakeDom();
    const browser = await import("./KtcToolNavigator.js");
    const element = new browser.KtcToolNavigator() as unknown as FakeElement & { model: KtcToolNavigatorModel };
    element.model = LEGACY_MODEL;
    expect(findNodes(element.shadow, (node) => node.className.includes("legacy mode-outline"))).toHaveLength(1);
    byAria(element.shadow, "切换为网格模式").onclick?.();
    byAria(element.shadow, "收起C++ 整理").onclick?.();
    byAria(element.shadow, "打开成员排序").onclick?.();
    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "setMode", mode: "grid" },
      { kind: "setGroupExpanded", groupId: "cpp", expanded: false },
      { kind: "activate", toolId: "reorderMembers" },
    ]);
    expect(byAria(element.shadow, "打开成员排序").children.some((node) => node.className === "tool-description")).toBe(true);
  });

  it("幂等注册，并把分组数据扁平渲染为紧凑工具网格", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcToolNavigator.js");
    expect(browser.ktcDefineToolNavigator()).toBe(browser.ktcDefineToolNavigator());
    expect(registry.get("ktc-tool-navigator")).toBe(browser.KtcToolNavigator);
    const element = new browser.KtcToolNavigator() as unknown as FakeElement & { model: KtcToolNavigatorModel };
    element.model = MODEL;
    expect(byAria(element.shadow, "功能目录")).toBeTruthy();
    expect(byAria(element.shadow, "打开头文件 ASCII").attributes.get("aria-current")).toBe("page");
    expect(findNodes(element.shadow, (node) => node.className.includes("group"))).toHaveLength(0);
    expect(byAria(element.shadow, "隐藏工具名称").textContent).toBe("Aa");
  });

  it("只发出名称显示和工具激活语义，不直接依赖 Host", async () => {
    installFakeDom();
    const browser = await import("./KtcToolNavigator.js");
    const element = new browser.KtcToolNavigator() as unknown as FakeElement & { model: KtcToolNavigatorModel };
    element.model = MODEL;
    byAria(element.shadow, "隐藏工具名称").onclick?.();
    byAria(element.shadow, "打开成员排序").onclick?.();
    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "setShowLabels", showLabels: false },
      { kind: "activate", toolId: "reorderMembers" },
    ]);
    expect(element.events.every((event) => event.bubbles && event.composed)).toBe(true);
    expect(browser.KtcToolNavigator.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage/u,
    );
  });

  it("网格响应宽度，隐藏名称后保留可访问名称与 tooltip", async () => {
    installFakeDom();
    const browser = await import("./KtcToolNavigator.js");
    const element = new browser.KtcToolNavigator() as unknown as FakeElement & { model: KtcToolNavigatorModel };
    element.model = { ...MODEL, showLabels: false };
    const shell = findNodes(element.shadow, (node) => node.className.includes("compact labels-hidden"))[0]!;
    expect(shell).toBeTruthy();
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("container-type:inline-size");
    expect(style).toContain("repeat(auto-fit,minmax(min(96px,100%),1fr))");
    expect(style).toContain("repeat(auto-fit,minmax(min(32px,100%),1fr))");
    expect(style).toContain(".compact.labels-hidden .tool-icon { width:22px; height:22px; flex-basis:22px; }");
    expect(shell.className).not.toContain("mode-outline");
    expect(findNodes(element.shadow, (node) => node.className === "navigator-header")).toHaveLength(0);
    expect(findNodes(element.shadow, (node) => node.className === "mode-switch")).toHaveLength(0);
    expect(byAria(element.shadow, "打开头文件 ASCII").title).toContain("头文件 ASCII");
    expect(byAria(element.shadow, "显示工具名称").attributes.get("aria-pressed")).toBe("false");
    expect(findNodes(element.shadow, (node) => node.className === "tool-description")).toHaveLength(0);
  });
});
