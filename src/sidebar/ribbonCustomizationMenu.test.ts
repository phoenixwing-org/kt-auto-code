import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcRibbonCustomizationMenuModel } from "./ribbonCustomizationMenu.js";

class FakeClassList {
  constructor(private readonly node: FakeNode) {}
  add(...names: string[]): void {
    const values = new Set(this.node.className.split(/\s+/u).filter(Boolean));
    names.forEach((name) => values.add(name));
    this.node.className = [...values].join(" ");
  }
  remove(...names: string[]): void {
    const removed = new Set(names);
    this.node.className = this.node.className.split(/\s+/u).filter((name) => name && !removed.has(name)).join(" ");
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
  id = "";
  title = "";
  type = "";
  disabled = false;
  hidden = false;
  draggable = false;
  onclick?: () => void;
  ondragstart?: (event: FakeDragEvent) => void;
  ondragover?: (event: FakeDragEvent) => void;
  ondragleave?: () => void;
  ondrop?: (event: FakeDragEvent) => void;
  ondragend?: () => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getBoundingClientRect(): DOMRect {
    return { top: 0, height: 20, bottom: 20, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) };
  }
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

class FakeDataTransfer {
  effectAllowed = "none";
  dropEffect = "none";
  private readonly values = new Map<string, string>();
  setData(type: string, value: string): void { this.values.set(type, value); }
  getData(type: string): string { return this.values.get(type) ?? ""; }
}

interface FakeDragEvent {
  readonly clientY: number;
  readonly dataTransfer: FakeDataTransfer;
  readonly preventDefault: ReturnType<typeof vi.fn>;
}

function dragEvent(clientY: number, dataTransfer = new FakeDataTransfer()): FakeDragEvent {
  return { clientY, dataTransfer, preventDefault: vi.fn() };
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
  for (const child of root.children) found.push(...findNodes(child, predicate));
  return found;
}

function byAria(root: FakeNode, label: string): FakeNode {
  return findNodes(root, (node) => node.attributes.get("aria-label") === label)[0]!;
}

const MODEL: KtcRibbonCustomizationMenuModel = {
  tools: [
    { id: "headerAscii", title: "头文件 ASCII", shortTitle: "头文件", moduleId: "code", moduleTitle: "Code" },
    { id: "ignoreSettings", title: "Ignore 设置", shortTitle: "Ignore", moduleId: "code", moduleTitle: "Code" },
    { id: "codeRename", title: "搜索替换", shortTitle: "替换", moduleId: "code", moduleTitle: "Code" },
    { id: "cadOpen", title: "打开图纸", moduleId: "cad", moduleTitle: "CAD" },
  ],
  pinnedToolIds: ["headerAscii", "codeRename", "cadOpen"],
  visibleModuleIds: ["code", "cad"],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Ribbon customization menu", () => {
  it("幂等注册且不依赖 VS Code Host 或存储 API", async () => {
    const registry = installFakeDom();
    const browser = await import("./ribbonCustomizationMenu.js");
    const first = browser.ktcDefineRibbonCustomizationMenu();
    const second = browser.ktcDefineRibbonCustomizationMenu();
    expect(registry.get("ktc-ribbon-customization-menu")).toBe(first);
    expect(second).toBe(first);
    expect(browser.KtcRibbonCustomizationMenu.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|localStorage|sessionStorage|workspaceState|globalState/u,
    );
  });

  it("按 Code/CAD 渲染可折叠分组并保留折叠状态", async () => {
    installFakeDom();
    const browser = await import("./ribbonCustomizationMenu.js");
    const element = new browser.KtcRibbonCustomizationMenu() as unknown as FakeElement & {
      model: KtcRibbonCustomizationMenuModel;
    };
    element.model = MODEL;
    expect(findNodes(element.shadow, (node) => node.className === "group-title").map((node) => node.textContent))
      .toEqual(["Code", "CAD"]);
    expect(findNodes(element.shadow, (node) => node.className === "count").map((node) => node.textContent))
      .toEqual(["2/3", "1/1"]);

    byAria(element.shadow, "切换 Code 工具分组").onclick?.();
    expect(byAria(element.shadow, "切换 Code 工具分组").attributes.get("aria-expanded")).toBe("false");
    const codeGroup = findNodes(element.shadow, (node) => node.dataset.moduleId === "code" && node.className === "group")[0]!;
    expect(findNodes(codeGroup, (node) => node.className === "list")[0]!.hidden).toBe(true);

    element.model = { ...MODEL };
    expect(byAria(element.shadow, "切换 Code 工具分组").attributes.get("aria-expanded")).toBe("false");
  });

  it("已固定 pin SVG 常显，未固定 pin 只在 hover/focus 时显现", async () => {
    installFakeDom();
    const browser = await import("./ribbonCustomizationMenu.js");
    const element = new browser.KtcRibbonCustomizationMenu() as unknown as FakeElement & {
      model: KtcRibbonCustomizationMenuModel;
    };
    element.model = MODEL;
    const pinned = byAria(element.shadow, "取消固定 头文件 ASCII");
    const unpinned = byAria(element.shadow, "固定 Ignore 设置");
    expect(pinned.classList.contains("pinned")).toBe(true);
    expect(unpinned.classList.contains("pinned")).toBe(false);
    expect(findNodes(pinned, (node) => node.tagName === "svg")).toHaveLength(1);
    expect(findNodes(unpinned, (node) => node.tagName === "svg")).toHaveLength(1);
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain(".pin:not(.pinned) { opacity:0; }");
    expect(style).toContain(".row:hover .pin:not(.pinned), .row:focus-within .pin:not(.pinned)");
  });

  it("发送模块、打开、固定、重置与键盘上移下移语义事件", async () => {
    installFakeDom();
    const browser = await import("./ribbonCustomizationMenu.js");
    const element = new browser.KtcRibbonCustomizationMenu() as unknown as FakeElement & {
      model: KtcRibbonCustomizationMenuModel;
    };
    element.model = MODEL;
    byAria(element.shadow, "隐藏 CAD 工具").onclick?.();
    byAria(element.shadow, "打开 Ignore 设置").onclick?.();
    byAria(element.shadow, "固定 Ignore 设置").onclick?.();
    byAria(element.shadow, "重置 Code 默认顺序和固定项").onclick?.();
    byAria(element.shadow, "上移 搜索替换").onclick?.();
    byAria(element.shadow, "下移 头文件 ASCII").onclick?.();
    expect(element.events.map((event) => event.detail)).toEqual([
      { kind: "toggleModule", moduleId: "cad" },
      { kind: "open", toolId: "ignoreSettings" },
      { kind: "togglePin", toolId: "ignoreSettings" },
      { kind: "resetCodeLayout" },
      { kind: "move", sourceId: "codeRename", targetId: "ignoreSettings", placement: "before" },
      { kind: "move", sourceId: "headerAscii", targetId: "ignoreSettings", placement: "after" },
    ]);
    expect(element.events.every((event) => event.bubbles && event.composed)).toBe(true);
  });

  it("整行拖放发送同组 before/after 排序，并拒绝跨组 drop", async () => {
    installFakeDom();
    const browser = await import("./ribbonCustomizationMenu.js");
    const element = new browser.KtcRibbonCustomizationMenu() as unknown as FakeElement & {
      model: KtcRibbonCustomizationMenuModel;
    };
    element.model = MODEL;
    const header = findNodes(element.shadow, (node) => node.dataset.toolId === "headerAscii")[0]!;
    const rename = findNodes(element.shadow, (node) => node.dataset.toolId === "codeRename")[0]!;
    const cad = findNodes(element.shadow, (node) => node.dataset.toolId === "cadOpen")[0]!;
    const ignore = findNodes(element.shadow, (node) => node.dataset.toolId === "ignoreSettings")[0]!;
    expect(header.draggable).toBe(true);
    expect(ignore.draggable).toBe(true);

    const transfer = new FakeDataTransfer();
    header.ondragstart?.(dragEvent(2, transfer));
    rename.ondragover?.(dragEvent(18, transfer));
    rename.ondrop?.(dragEvent(18, transfer));
    expect(element.events.at(-1)?.detail).toEqual({
      kind: "move", sourceId: "headerAscii", targetId: "codeRename", placement: "after",
    });

    const count = element.events.length;
    cad.ondrop?.(dragEvent(2, transfer));
    expect(element.events).toHaveLength(count);
  });
});
