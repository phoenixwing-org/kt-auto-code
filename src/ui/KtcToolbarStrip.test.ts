import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  KtcToolbarStripActionDetail,
  KtcToolbarStripModel,
} from "./KtcToolbarStrip.js";

let activeFakeNode: FakeNode | undefined;

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
  readonly listeners = new Map<string, Array<() => void>>();
  assigned: FakeNode[] = [];
  className = "";
  hidden = false;
  name = "";
  textContent = "";
  title = "";
  type = "";
  replaceCount = 0;
  onclick?: () => void;
  rect = Object.freeze({ x: 310, y: 42, top: 42, right: 340, bottom: 72, left: 310, width: 30, height: 30 });

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void {
    this.replaceCount += 1;
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  hasAttribute(name: string): boolean { return this.attributes.has(name); }
  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type: string): void { this.listeners.get(type)?.forEach((listener) => listener()); }
  assignedElements(): FakeNode[] { return [...this.assigned]; }
  getBoundingClientRect(): DOMRectReadOnly { return this.rect as DOMRectReadOnly; }
  focus(): void { activeFakeNode = this; }
}

interface RecordedEvent {
  readonly type: string;
  readonly detail: KtcToolbarStripActionDetail;
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
  activeFakeNode = undefined;
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
    createElementNS: (_namespace: string, tagName: string) => new FakeNode(tagName),
    get activeElement(): FakeNode | undefined { return activeFakeNode; },
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

function byClass(root: FakeNode, className: string): FakeNode {
  return findNodes(root, (node) => node.className.split(/\s+/u).includes(className))[0]!;
}

function byAria(root: FakeNode, label: string): FakeNode {
  return findNodes(root, (node) => node.attributes.get("aria-label") === label)[0]!;
}

function slotByName(root: FakeNode, name: string): FakeNode {
  return findNodes(root, (node) => node.tagName === "slot" && node.name === name)[0]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcToolbarStrip", () => {
  it("规范化并冻结仅含 mode、groupContentVisible、overflowOpen 的可序列化 model", async () => {
    installFakeDom();
    const browser = await import("./KtcToolbarStrip.js");
    const input = { mode: "compact" as const, groupContentVisible: true, overflowOpen: true };
    const normalized = browser.normalizeKtcToolbarStripModel(input);

    expect(normalized).toEqual(input);
    expect(Object.keys(normalized)).toEqual(["mode", "groupContentVisible", "overflowOpen"]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
    expect(browser.normalizeKtcToolbarStripModel(undefined)).toEqual({
      mode: "expanded",
      groupContentVisible: false,
      overflowOpen: false,
    });
    expect(browser.normalizeKtcToolbarStripModel({
      mode: "invalid" as "compact",
      groupContentVisible: false,
      overflowOpen: false,
    })).toEqual({ mode: "expanded", groupContentVisible: false, overflowOpen: false });
  });

  it("幂等注册并只创建两个 named slots、一个 16px chevron 与一个固定 overflow 按钮", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcToolbarStrip.js");
    expect(browser.ktcDefineToolbarStrip()).toBe(browser.ktcDefineToolbarStrip());
    expect(registry.get("ktc-toolbar-strip")).toBe(browser.KtcToolbarStrip);

    const element = new browser.KtcToolbarStrip() as unknown as FakeElement & {
      model: KtcToolbarStripModel;
    };
    element.model = { mode: "expanded", groupContentVisible: false, overflowOpen: false };

    const toolbar = byClass(element.shadow, "toolbar");
    const strip = byClass(element.shadow, "strip");
    const toggle = byAria(element.shadow, "切换为仅图标工具栏");
    const overflow = byAria(element.shadow, "全部工具与自定义");
    const slots = findNodes(element.shadow, (node) => node.tagName === "slot");
    const chevrons = findNodes(element.shadow, (node) => node.className === "chevron");
    const moreGlyphs = findNodes(element.shadow, (node) => node.textContent === "\u2026");
    expect(toolbar.attributes.get("aria-label")).toBe("工具栏");
    expect(strip.children).toEqual([toggle, byClass(element.shadow, "track"), overflow]);
    expect(slots.map((slot) => slot.name)).toEqual(["ribbon", "group-content"]);
    expect(findNodes(element.shadow, (node) => node.tagName === "button")).toEqual([toggle, overflow]);
    expect(chevrons).toHaveLength(1);
    expect(moreGlyphs).toHaveLength(1);
    expect(overflow.attributes.get("aria-haspopup")).toBe("menu");
    expect(overflow.attributes.get("aria-expanded")).toBe("false");

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("grid-template-columns:28px minmax(0,1fr) 30px");
    expect(style).toContain("width:28px; min-width:28px; height:40px; align-self:start");
    expect(style).toContain("height:30px; align-self:start");
    expect(style).toContain("width:16px; height:16px");
    expect(style).not.toMatch(/\.title\b/u);
    expect(style).not.toMatch(/density/iu);
  });

  it("mode 与 overflow 只发送 frozen、bubbles + composed intent，组件等待 consumer 回投影", async () => {
    installFakeDom();
    const browser = await import("./KtcToolbarStrip.js");
    const element = new browser.KtcToolbarStrip() as unknown as FakeElement & {
      model: KtcToolbarStripModel;
    };
    const initial = { mode: "expanded" as const, groupContentVisible: false, overflowOpen: false };
    element.model = initial;

    byAria(element.shadow, "切换为仅图标工具栏").onclick?.();
    byAria(element.shadow, "全部工具与自定义").onclick?.();

    expect(element.events.map(({ detail }) => detail)).toEqual([
      { kind: "setMode", mode: "compact" },
      { kind: "setOverflowOpen", open: true },
    ]);
    expect(element.events.every(({ type }) => type === browser.KTC_TOOLBAR_STRIP_ACTION)).toBe(true);
    expect(element.events.every(({ bubbles, composed }) => bubbles && composed)).toBe(true);
    expect(element.events.every(({ detail }) => Object.isFrozen(detail))).toBe(true);
    expect(element.model).toEqual(initial);

    element.model = { mode: "compact", groupContentVisible: false, overflowOpen: true };
    byAria(element.shadow, "切换为图标和文字工具栏").onclick?.();
    byAria(element.shadow, "全部工具与自定义").onclick?.();
    expect(element.events.slice(-2).map(({ detail }) => detail)).toEqual([
      { kind: "setMode", mode: "expanded" },
      { kind: "setOverflowOpen", open: false },
    ]);
  });

  it("model patch 保留同一 Ribbon slot、下级 slot、按钮、焦点与既有监听器", async () => {
    installFakeDom();
    const browser = await import("./KtcToolbarStrip.js");
    const element = new browser.KtcToolbarStrip() as unknown as FakeElement & {
      connectedCallback(): void;
      model: KtcToolbarStripModel;
    };
    element.model = { mode: "expanded", groupContentVisible: false, overflowOpen: false };
    element.connectedCallback();
    const ribbonSlot = slotByName(element.shadow, "ribbon");
    const groupSlot = slotByName(element.shadow, "group-content");
    const toggle = byAria(element.shadow, "切换为仅图标工具栏");
    const overflow = byAria(element.shadow, "全部工具与自定义");
    overflow.focus();

    element.model = { mode: "compact", groupContentVisible: true, overflowOpen: true };

    expect(slotByName(element.shadow, "ribbon")).toBe(ribbonSlot);
    expect(slotByName(element.shadow, "group-content")).toBe(groupSlot);
    expect(byAria(element.shadow, "切换为图标和文字工具栏")).toBe(toggle);
    expect(byAria(element.shadow, "全部工具与自定义")).toBe(overflow);
    expect(element.shadow.replaceCount).toBe(1);
    expect((document as unknown as { activeElement?: FakeNode }).activeElement).toBe(overflow);
    expect(byClass(element.shadow, "toolbar").className).toBe("toolbar mode-compact");
    expect(toggle.attributes.get("aria-pressed")).toBe("true");
    expect(overflow.attributes.get("aria-expanded")).toBe("true");
  });

  it("下级框只在 model 请求且 slot 有可见内容时出现，不 clone 或移动 slotted 节点", async () => {
    installFakeDom();
    const browser = await import("./KtcToolbarStrip.js");
    const element = new browser.KtcToolbarStrip() as unknown as FakeElement & {
      model: KtcToolbarStripModel;
    };
    element.model = { mode: "expanded", groupContentVisible: true, overflowOpen: false };
    const group = byClass(element.shadow, "group-content");
    const groupSlot = slotByName(element.shadow, "group-content");
    expect(group.hidden).toBe(true);

    const navigator = new FakeNode("ktc-tool-navigator");
    groupSlot.assigned = [navigator];
    groupSlot.dispatch("slotchange");
    expect(group.hidden).toBe(false);
    expect(group.children).toEqual([groupSlot]);
    expect(groupSlot.assigned).toEqual([navigator]);

    element.model = { mode: "compact", groupContentVisible: false, overflowOpen: false };
    expect(group.hidden).toBe(true);
    element.model = { mode: "compact", groupContentVisible: true, overflowOpen: false };
    expect(group.hidden).toBe(false);

    navigator.setAttribute("hidden", "");
    groupSlot.dispatch("slotchange");
    expect(group.hidden).toBe(true);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    const groupStyle = style.slice(style.indexOf(".group-content {"), style.indexOf(".group-content[hidden]"));
    expect(groupStyle).toContain("margin:0 4px 4px 20px; padding:4px");
    expect(groupStyle).toContain("border-right:");
    expect(groupStyle).toContain("border-bottom:");
    expect(groupStyle).toContain("border-left:");
    expect(groupStyle).not.toContain("border-top:");
  });

  it("外置 overflow 菜单可读取固定按钮锚点并在关闭后恢复焦点", async () => {
    installFakeDom();
    const browser = await import("./KtcToolbarStrip.js");
    const element = new browser.KtcToolbarStrip() as unknown as FakeElement & {
      model: KtcToolbarStripModel;
      getOverflowAnchorRect(): DOMRectReadOnly;
      focusOverflowTrigger(): boolean;
    };
    element.model = { mode: "expanded", groupContentVisible: false, overflowOpen: true };
    const overflow = byAria(element.shadow, "全部工具与自定义");

    expect(element.getOverflowAnchorRect()).toBe(overflow.rect);
    expect(element.focusOverflowTrigger()).toBe(true);
    expect((document as unknown as { activeElement?: FakeNode }).activeElement).toBe(overflow);
  });

  it("通过 CSS 变量锁定两态尺寸，expanded 自然换行、compact 仅中轨单行横滚", async () => {
    installFakeDom();
    const browser = await import("./KtcToolbarStrip.js");
    const element = new browser.KtcToolbarStrip() as unknown as FakeElement & {
      model: KtcToolbarStripModel;
    };
    element.model = { mode: "expanded", groupContentVisible: false, overflowOpen: false };
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;

    expect(style).toContain("--ktc-ribbon-item-width:68px");
    expect(style).toContain("--ktc-ribbon-item-height:58px");
    expect(style).toContain("--ktc-ribbon-item-flex-basis:68px");
    expect(style).toContain("--ktc-ribbon-icon-size:22px");
    expect(style).toContain("--ktc-ribbon-label-display:block");
    expect(style).toContain("--ktc-ribbon-wrap:wrap");
    expect(style).toContain("--ktc-ribbon-item-width:34px");
    expect(style).toContain("--ktc-ribbon-item-height:32px");
    expect(style).toContain("--ktc-ribbon-item-flex-basis:34px");
    expect(style).toContain("--ktc-ribbon-label-display:none");
    expect(style).toContain("--ktc-ribbon-wrap:nowrap");
    expect(style).toContain("overflow-x:auto; overflow-y:hidden");
    expect(style).toContain("width:max-content; min-width:100%");
    expect(style).toContain("@media (prefers-reduced-motion:reduce)");
    expect(style).toContain("@media (forced-colors:active)");
  });

  it("源码不拥有 Ribbon、工具、Group、Host、Store 或 overflow 测量状态", async () => {
    installFakeDom();
    await import("./KtcToolbarStrip.js");
    const source = readFileSync(new URL("./KtcToolbarStrip.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import\s/mu);
    expect(source).not.toMatch(
      /\b(?:acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|Controller|Service|Registry|MRU|ResizeObserver|MutationObserver)\b/u,
    );
    expect(source).not.toMatch(/cloneNode|toolIds|activeTool|pinnedTool|moduleState|navigatorExpanded/u);
    expect(source.match(/document\.createElement\("slot"\)/gu)).toHaveLength(2);
  });

  it("独立 Entry 只执行幂等注册", async () => {
    const registry = installFakeDom();
    await import("./KtcToolbarStripEntry.js");
    expect(registry.has("ktc-toolbar-strip")).toBe(true);
    const source = readFileSync(new URL("./KtcToolbarStripEntry.ts", import.meta.url), "utf8");
    expect(source).toContain("ktcDefineToolbarStrip();");
  });
});
