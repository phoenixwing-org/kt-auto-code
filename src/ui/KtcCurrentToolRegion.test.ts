import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  KtcCurrentToolRegionActionDetail,
  KtcCurrentToolRegionModel,
} from "./KtcCurrentToolRegion.js";

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
  readonly classList = new FakeClassList(this);
  className = "";
  id = "";
  textContent = "";
  title = "";
  type = "";
  tabIndex = 0;
  scrollTop = 0;
  onclick?: () => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  focus(): void { fakeActiveElement = this; }
}

interface RecordedEvent {
  readonly type: string;
  readonly detail: KtcCurrentToolRegionActionDetail;
  readonly bubbles: boolean;
  readonly composed: boolean;
}

class FakeElement extends FakeNode {
  readonly events: RecordedEvent[] = [];
  readonly shadow = new FakeNode("shadow-root");
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: RecordedEvent): boolean {
    this.events.push(event);
    return true;
  }
}

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

let fakeActiveElement: FakeNode | undefined;

function findNodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  const found: FakeNode[] = [];
  if (predicate(root)) found.push(root);
  root.children.forEach((child) => found.push(...findNodes(child, predicate)));
  return found;
}

function byClass(root: FakeNode, className: string): FakeNode {
  return findNodes(root, (node) => node.className.split(/\s+/u).includes(className))[0]!;
}

function byAria(root: FakeNode, label: string): FakeNode {
  return findNodes(root, (node) => node.attributes.get("aria-label") === label)[0]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcCurrentToolRegion", () => {
  it("规范化、复制并冻结仅含可序列化标题与语义图标的 model", async () => {
    installFakeDom();
    const browser = await import("./KtcCurrentToolRegion.js");
    const input = { itemId: "  tool:autoBuild  ", title: "  编译工具  ", icon: "  build  " };
    const normalized = browser.normalizeKtcCurrentToolRegionModel(input);
    input.title = "外部修改";
    input.icon = "search";

    expect(normalized).toEqual({ itemId: "tool:autoBuild", title: "编译工具", icon: "build" });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
    expect(browser.normalizeKtcCurrentToolRegionModel(undefined)).toEqual({
      itemId: "",
      title: "工具",
      icon: "tool",
    });
  });

  it("幂等注册并渲染 34px 固定 Header、左侧图标标题、右侧独立关闭按钮", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcCurrentToolRegion.js");
    expect(browser.ktcDefineCurrentToolRegion()).toBe(browser.ktcDefineCurrentToolRegion());
    expect(registry.get("ktc-current-tool-region")).toBe(browser.KtcCurrentToolRegion);

    const element = new browser.KtcCurrentToolRegion() as unknown as FakeElement & {
      model: KtcCurrentToolRegionModel;
    };
    element.model = { itemId: "tool:autoBuild", title: "编译工具完整标题", icon: "build" };

    const region = byClass(element.shadow, "region");
    const identity = byClass(element.shadow, "identity");
    const title = byClass(element.shadow, "title");
    const icon = byClass(identity, "icon");
    const close = byAria(element.shadow, "关闭当前逻辑工具");
    expect(region.attributes.get("aria-labelledby")).toBe("ktc-current-tool-region-title");
    expect(identity.tagName).toBe("div");
    expect(title.textContent).toBe("编译工具完整标题");
    expect(title.title).toBe("编译工具完整标题");
    expect(icon.attributes.get("data-icon")).toBe("build");
    expect(icon.attributes.get("aria-hidden")).toBe("true");
    expect(findNodes(icon, (node) => node.tagName === "path")[0]?.attributes.get("d"))
      .toBe("M2 4h12v8H2zM4 6h4M4 9h7");
    expect(close.title).toBe("关闭 编译工具完整标题");
    expect(findNodes(element.shadow, (node) => node.tagName === "button")).toEqual([close]);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("grid-template-rows:34px minmax(0,1fr)");
    expect(style).toContain("height:34px; min-height:34px");
  });

  it("默认插槽所在 Body 是唯一纵向滚动边界且具备完整可访问名称", async () => {
    installFakeDom();
    const browser = await import("./KtcCurrentToolRegion.js");
    const element = new browser.KtcCurrentToolRegion() as unknown as FakeElement & {
      model: KtcCurrentToolRegionModel;
    };
    element.model = { itemId: "tool:packageIncludes", title: "头文件引用修正", icon: "file-code" };

    const body = byClass(element.shadow, "body");
    expect(body.attributes.get("role")).toBe("region");
    expect(body.attributes.get("aria-label")).toBe("头文件引用修正内容");
    expect(body.tabIndex).toBe(0);
    const slots = findNodes(element.shadow, (node) => node.tagName === "slot");
    expect(slots).toHaveLength(1);
    expect(slots[0]?.attributes.has("name")).toBe(false);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style.match(/overflow-y:auto/gu)).toHaveLength(1);
    expect(style).toContain("overflow-x:hidden; overflow-y:auto");
    expect(style).not.toContain("overflow:auto");
    expect(style).toContain("margin:0; padding:0; overflow:hidden");
  });

  it("同一 item 更新不重建 slot 或丢失滚动，切换 item 后可由 Host 恢复滚动", async () => {
    installFakeDom();
    const browser = await import("./KtcCurrentToolRegion.js");
    const element = new browser.KtcCurrentToolRegion() as unknown as FakeElement & {
      model: KtcCurrentToolRegionModel;
      contentScrollTop: number;
      focusContent(): void;
    };
    element.model = { itemId: "tool:run", title: "Run", icon: "play" };
    const slot = findNodes(element.shadow, (node) => node.tagName === "slot")[0];
    const body = byClass(element.shadow, "body");
    element.contentScrollTop = 73.5;
    element.focusContent();

    element.model = { itemId: "tool:run", title: "Run · 运行中", icon: "play" };
    expect(findNodes(element.shadow, (node) => node.tagName === "slot")[0]).toBe(slot);
    expect(element.contentScrollTop).toBe(73.5);
    expect(fakeActiveElement).toBe(body);

    element.model = { itemId: "tool:git", title: "Git", icon: "git" };
    expect(element.contentScrollTop).toBe(0);
    element.contentScrollTop = 41;
    expect(element.contentScrollTop).toBe(41);
  });

  it("关闭只发出 bubbles + composed 的冻结 close 语义事件，不改变组件 model", async () => {
    installFakeDom();
    const browser = await import("./KtcCurrentToolRegion.js");
    const element = new browser.KtcCurrentToolRegion() as unknown as FakeElement & {
      model: KtcCurrentToolRegionModel;
    };
    element.model = { itemId: "tool:run", title: "Run", icon: "play" };
    const before = element.model;

    byAria(element.shadow, "关闭当前逻辑工具").onclick?.();

    expect(element.events).toHaveLength(1);
    expect(element.events[0]).toMatchObject({
      type: browser.KTC_CURRENT_TOOL_REGION_ACTION,
      detail: { kind: "close", itemId: "tool:run" },
      bubbles: true,
      composed: true,
    });
    expect(Object.isFrozen(element.events[0]!.detail)).toBe(true);
    expect(element.model).toBe(before);
    expect(findNodes(element.shadow, (node) => node.attributes.has("aria-expanded"))).toHaveLength(0);
  });

  it("不持有 Host、MRU、存储或业务状态，也不依赖消息桥", async () => {
    installFakeDom();
    const browser = await import("./KtcCurrentToolRegion.js");
    expect(browser.KtcCurrentToolRegion.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|mru/iu,
    );
    const source = readFileSync(new URL("./KtcCurrentToolRegion.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import\s/mu);
    expect(source).not.toMatch(
      /\b(?:acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|Controller|Service|Registry|MRU)\b/u,
    );
    expect(source).not.toMatch(/aria-expanded|chevron|toggle/iu);
  });
});
