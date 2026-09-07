import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcOpenItemsBarModel } from "./KtcOpenItemsBar.js";

class FakeClassList {
  constructor(private readonly node: FakeNode) {}
  add(...names: string[]): void {
    const values = new Set(this.node.className.split(/\s+/u).filter(Boolean));
    names.forEach((name) => values.add(name));
    this.node.className = [...values].join(" ");
  }
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
  hidden = false;
  disabled = false;
  tabIndex = 0;
  onclick?: (event: FakeEvent) => void;
  onkeydown?: (event: FakeEvent) => void;
  oncontextmenu?: (event: FakeEvent) => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  prepend(...nodes: FakeNode[]): void { this.children.unshift(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  focus(): void { fakeActiveElement = this; }
  scrollIntoView(): void {}
}

class FakeElement extends FakeNode {
  readonly events: Array<{ type: string; detail: unknown; bubbles?: boolean; composed?: boolean }> = [];
  readonly shadow = new FakeShadowRoot();
  attachShadow(): FakeShadowRoot { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown; bubbles?: boolean; composed?: boolean }): boolean {
    this.events.push(event);
    return true;
  }
}

class FakeShadowRoot extends FakeNode {
  constructor() { super("shadow-root"); }
  get activeElement(): FakeNode | undefined { return fakeActiveElement; }
}

class FakeEvent {
  defaultPrevented = false;
  propagationStopped = false;
  shiftKey = false;
  constructor(readonly key = "") {}
  preventDefault(): void { this.defaultPrevented = true; }
  stopPropagation(): void { this.propagationStopped = true; }
}

let fakeActiveElement: FakeNode | undefined;

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  fakeActiveElement = undefined;
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
    createElementNS: (_namespace: string, tagName: string) => new FakeNode(tagName),
  });
  vi.stubGlobal("CustomEvent", class<T> {
    readonly bubbles: boolean;
    readonly composed: boolean;
    readonly detail: T;
    constructor(public readonly type: string, init: { detail: T; bubbles?: boolean; composed?: boolean }) {
      this.detail = init.detail;
      this.bubbles = Boolean(init.bubbles);
      this.composed = Boolean(init.composed);
    }
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

const MODEL: KtcOpenItemsBarModel = {
  activeId: "sort",
  overflowLabel: "全部打开项",
  items: [
    { id: "rename", title: "项目改名", icon: "search" },
    { id: "include", title: "头文件引用修正", shortTitle: "头文件修正", icon: "file" },
    { id: "sort", title: "C++ 成员排序", shortTitle: "成员排序", icon: "sort" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcOpenItemsBar", () => {
  it("幂等注册并以完整标题、紧凑标签和唯一溢出入口渲染固定单行", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcOpenItemsBar.js");
    expect(browser.ktcDefineOpenItemsBar()).toBe(browser.ktcDefineOpenItemsBar());
    expect(registry.get("ktc-open-items-bar")).toBe(browser.KtcOpenItemsBar);
    const element = new browser.KtcOpenItemsBar() as unknown as FakeElement & { model: KtcOpenItemsBarModel };
    element.model = MODEL;
    expect(byAria(element.shadow, "打开头文件引用修正").title).toBe("头文件引用修正");
    expect(findNodes(byAria(element.shadow, "打开头文件引用修正"), (node) => node.className === "label")[0]?.textContent).toBe("头文件修正");
    expect(byAria(element.shadow, "打开C++ 成员排序").attributes.get("aria-current")).toBe("page");
    expect(findNodes(element.shadow, (node) => node.className === "more")).toHaveLength(1);
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("height:31px");
    expect(style).toContain("overflow-x:auto");
    expect(style).toContain("max-width:clamp(82px,42cqi,220px)");
    expect(style).toContain("var(--vscode-list-activeSelectionForeground");
  });

  it("仅发出 activate、close、closeOthers 语义，不拥有 MRU 或 Host 状态", async () => {
    installFakeDom();
    const browser = await import("./KtcOpenItemsBar.js");
    const element = new browser.KtcOpenItemsBar() as unknown as FakeElement & { model: KtcOpenItemsBarModel };
    element.model = MODEL;
    byAria(element.shadow, "打开项目改名").onclick?.(new FakeEvent());
    byAria(element.shadow, "关闭头文件引用修正").onclick?.(new FakeEvent());
    const sort = findNodes(element.shadow, (node) => node.dataset.itemId === "sort")[0]!;
    sort.oncontextmenu?.(new FakeEvent());
    expect(byAria(element.shadow, "全部打开项（3）").attributes.get("aria-expanded")).toBe("false");
    expect(byAria(element.shadow, "C++ 成员排序菜单")).toBeTruthy();
    byAria(element.shadow, "关闭C++ 成员排序以外的其他项").onclick?.(new FakeEvent());
    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "activate", itemId: "rename" },
      { kind: "close", itemId: "include" },
      { kind: "closeOthers", itemId: "sort" },
    ]);
    expect(element.events.every((event) => event.bubbles && event.composed)).toBe(true);
    expect(browser.KtcOpenItemsBar.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|mru/iu,
    );
  });

  it("溢出菜单覆盖全部项，并支持方向键、Home、End、Escape 和焦点恢复", async () => {
    installFakeDom();
    const browser = await import("./KtcOpenItemsBar.js");
    const element = new browser.KtcOpenItemsBar() as unknown as FakeElement & { model: KtcOpenItemsBarModel };
    element.model = MODEL;
    const more = byAria(element.shadow, "全部打开项（3）");
    more.onclick?.(new FakeEvent());
    expect(more.attributes.get("aria-expanded")).toBe("true");
    expect(findNodes(element.shadow, (node) => node.attributes.get("role") === "menuitem")).toHaveLength(3);
    expect(fakeActiveElement?.attributes.get("aria-label")).toBe("打开项目改名");
    const menu = findNodes(element.shadow, (node) => node.attributes.get("role") === "menu")[0]!;
    menu.onkeydown?.(new FakeEvent("End"));
    expect(fakeActiveElement?.attributes.get("aria-label")).toBe("打开C++ 成员排序");
    menu.onkeydown?.(new FakeEvent("Home"));
    menu.onkeydown?.(new FakeEvent("ArrowDown"));
    expect(fakeActiveElement?.attributes.get("aria-label")).toBe("打开头文件引用修正");
    menu.onkeydown?.(new FakeEvent("ArrowUp"));
    expect(fakeActiveElement?.attributes.get("aria-label")).toBe("打开项目改名");
    const escape = new FakeEvent("Escape");
    menu.onkeydown?.(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(fakeActiveElement).toBe(more);
  });

  it("标签键盘支持完整漫游、删除和两种右键菜单按键", async () => {
    installFakeDom();
    const browser = await import("./KtcOpenItemsBar.js");
    const element = new browser.KtcOpenItemsBar() as unknown as FakeElement & { model: KtcOpenItemsBarModel };
    element.model = MODEL;
    const rename = byAria(element.shadow, "打开项目改名");
    rename.onkeydown?.(new FakeEvent("ArrowRight"));
    expect(fakeActiveElement?.attributes.get("aria-label")).toBe("打开头文件引用修正");
    rename.onkeydown?.(new FakeEvent("ArrowLeft"));
    expect(fakeActiveElement?.attributes.get("aria-label")).toBe("打开C++ 成员排序");
    byAria(element.shadow, "打开C++ 成员排序").onkeydown?.(new FakeEvent("Home"));
    expect(fakeActiveElement).toBe(rename);
    rename.onkeydown?.(new FakeEvent("End"));
    expect(fakeActiveElement?.attributes.get("aria-label")).toBe("打开C++ 成员排序");
    rename.onkeydown?.(new FakeEvent("Delete"));
    const contextMenu = new FakeEvent("ContextMenu");
    rename.onkeydown?.(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(byAria(element.shadow, "项目改名菜单")).toBeTruthy();
    byAria(element.shadow, "项目改名菜单").onkeydown?.(new FakeEvent("Escape"));
    const context = new FakeEvent("F10");
    context.shiftKey = true;
    rename.onkeydown?.(context);
    expect(context.defaultPrevented).toBe(true);
    expect(byAria(element.shadow, "关闭项目改名")).toBeTruthy();
    expect(element.events.map((event) => event.detail)).toEqual([{ kind: "close", itemId: "rename" }]);
  });

  it("公开恢复活动项焦点，并为目录语义图标保留不同图形", async () => {
    installFakeDom();
    const browser = await import("./KtcOpenItemsBar.js");
    const element = new browser.KtcOpenItemsBar() as unknown as FakeElement & {
      model: KtcOpenItemsBarModel;
      focusActiveItem(): boolean;
    };
    element.model = {
      activeId: "sort",
      items: [
        { id: "build", title: "编译工具", icon: "build" },
        { id: "sort", title: "成员排序", icon: "sort" },
        { id: "uuid", title: "UUID 替换", icon: "uuid" },
      ],
    };

    expect(element.focusActiveItem()).toBe(true);
    expect(fakeActiveElement).toBe(byAria(element.shadow, "打开成员排序"));
    const iconPaths = ["编译工具", "成员排序", "UUID 替换"].map((title) => (
      findNodes(byAria(element.shadow, `打开${title}`), (node) => node.tagName === "path")[0]
        ?.attributes.get("d")
    ));
    expect(new Set(iconPaths).size).toBe(3);
    expect(iconPaths.every(Boolean)).toBe(true);

    element.model = { activeId: "", items: [] };
    fakeActiveElement = undefined;
    expect(element.focusActiveItem()).toBe(false);
    expect(fakeActiveElement).toBeUndefined();
  });

  it("规范化可序列化模型但不重排项目或自行选择 active 项", async () => {
    installFakeDom();
    const browser = await import("./KtcOpenItemsBar.js");
    const element = new browser.KtcOpenItemsBar() as unknown as FakeElement & { model: KtcOpenItemsBarModel };
    element.model = {
      activeId: "missing",
      items: [
        { id: " a ", title: " A " },
        { id: "a", title: "重复" },
        { id: "b", title: "B" },
      ],
    };
    expect(element.model).toEqual({
      activeId: "missing",
      overflowLabel: "全部打开项",
      items: [{ id: "a", title: "A" }, { id: "b", title: "B" }],
    });
    expect(findNodes(element.shadow, (node) => node.attributes.get("aria-current") === "page")).toHaveLength(0);
  });
});
