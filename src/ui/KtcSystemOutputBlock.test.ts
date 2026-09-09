import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  KtcSystemOutputBlockActionDetail,
  KtcSystemOutputBlockModel,
} from "./KtcSystemOutputBlock.js";

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
  className = "";
  id = "";
  textContent = "";
  title = "";
  type = "";
  tabIndex = 0;
  scrollTop = 0;
  scrollHeight = 240;
  onclick?: () => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  contains(node: FakeNode): boolean {
    return this === node || this.children.some((child) => child.contains(node));
  }
  focus(): void { activeFakeNode = this; }
  replaceChildren(...nodes: FakeNode[]): void {
    if (activeFakeNode && this.children.some((child) => child.contains(activeFakeNode!))) {
      activeFakeNode = undefined;
    }
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

interface RecordedEvent {
  readonly type: string;
  readonly detail: KtcSystemOutputBlockActionDetail;
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcSystemOutputBlock", () => {
  it("安全复制并深冻结纯可序列化 model，同时保留日志空白", async () => {
    installFakeDom();
    const browser = await import("./KtcSystemOutputBlock.js");
    const sourceLines = ["  build start  ", "", "done"];
    const input: KtcSystemOutputBlockModel = {
      title: "  构建输出  ",
      lines: sourceLines,
    };
    const normalized = browser.normalizeKtcSystemOutputBlockModel(input);
    sourceLines[0] = "changed";

    expect(normalized).toEqual({
      title: "构建输出",
      lines: ["  build start  ", "", "done"],
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.lines)).toBe(true);
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
    expect(browser.normalizeKtcSystemOutputBlockModel(undefined)).toEqual({
      title: "输出",
      lines: [],
    });
  });

  it("幂等注册并始终渲染可纵横滚动的等宽输出区域", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcSystemOutputBlock.js");
    expect(browser.ktcDefineSystemOutputBlock()).toBe(browser.ktcDefineSystemOutputBlock());
    expect(registry.get("ktc-system-output-block")).toBe(browser.KtcSystemOutputBlock);

    const element = new browser.KtcSystemOutputBlock() as unknown as FakeElement & {
      model: KtcSystemOutputBlockModel;
    };
    element.model = { lines: ["first", "second"] };

    expect(byClass(element.shadow, "block").attributes.get("aria-labelledby")).toBe("ktc-system-output-title");
    expect(byClass(element.shadow, "body").attributes.get("role")).toBe("region");
    expect(byClass(element.shadow, "body").tabIndex).toBe(0);
    expect(byClass(element.shadow, "output").textContent).toBe("first\nsecond");
    expect(byClass(element.shadow, "output").attributes.get("role")).toBe("log");
    expect(byClass(element.shadow, "body").scrollTop).toBe(240);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("overflow:auto");
    expect(style).toContain("white-space:pre");
    expect(style).toContain("var(--vscode-editor-font-family");
    expect(style).toContain("width:100%; min-width:0; max-width:100%");
    expect(style).toContain("margin:0; padding:0");
    expect(style).not.toContain("position:fixed");
  });

  it("相同输出模型保留 Shadow DOM、焦点和滚动，内容变化或新增行才重绘并滚到底部", async () => {
    installFakeDom();
    const browser = await import("./KtcSystemOutputBlock.js");
    const element = new browser.KtcSystemOutputBlock() as unknown as FakeElement & {
      model: KtcSystemOutputBlockModel;
    };
    element.model = { title: "系统输出", lines: ["first", "second"] };

    const originalBlock = byClass(element.shadow, "block");
    const originalBody = byClass(element.shadow, "body");
    originalBody.scrollTop = 73;
    originalBody.focus();

    element.model = { title: "  系统输出  ", lines: ["first", "second"] };

    expect(byClass(element.shadow, "block")).toBe(originalBlock);
    expect(byClass(element.shadow, "body")).toBe(originalBody);
    expect(originalBody.scrollTop).toBe(73);
    expect((document as unknown as { activeElement?: FakeNode }).activeElement).toBe(originalBody);

    element.model = { title: "系统输出", lines: ["first", "changed"] };

    const changedBody = byClass(element.shadow, "body");
    expect(byClass(element.shadow, "block")).not.toBe(originalBlock);
    expect(changedBody).not.toBe(originalBody);
    expect(byClass(element.shadow, "output").textContent).toBe("first\nchanged");
    expect(changedBody.scrollTop).toBe(changedBody.scrollHeight);

    const changedBlock = byClass(element.shadow, "block");
    element.model = { title: "系统输出", lines: ["first", "changed", "third"] };

    const appendedBody = byClass(element.shadow, "body");
    expect(byClass(element.shadow, "block")).not.toBe(changedBlock);
    expect(byClass(element.shadow, "output").textContent).toBe("first\nchanged\nthird");
    expect(appendedBody.scrollTop).toBe(appendedBody.scrollHeight);
  });

  it("固定 Header 右侧关闭按钮发出冻结的 close 语义事件，且没有箭头或折叠状态", async () => {
    installFakeDom();
    const browser = await import("./KtcSystemOutputBlock.js");
    const element = new browser.KtcSystemOutputBlock() as unknown as FakeElement & {
      model: KtcSystemOutputBlockModel;
    };
    element.model = { title: "系统日志", lines: ["visible"] };

    expect(byClass(element.shadow, "header")).toBeTruthy();
    expect(byClass(element.shadow, "body")).toBeTruthy();
    expect(findNodes(element.shadow, (node) => node.className === "chevron")).toHaveLength(0);
    expect(findNodes(element.shadow, (node) => node.attributes.has("aria-expanded"))).toHaveLength(0);
    expect(byAria(element.shadow, "关闭输出").title).toBe("关闭输出");
    byAria(element.shadow, "关闭输出").onclick?.();
    expect(element.events).toHaveLength(1);
    expect(element.events[0]).toMatchObject({
      type: browser.KTC_SYSTEM_OUTPUT_BLOCK_ACTION,
      detail: { kind: "close" },
      bubbles: true,
      composed: true,
    });
    expect(Object.isFrozen(element.events[0]!.detail)).toBe(true);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("grid-template-rows:30px minmax(0,1fr)");
    expect(style).toContain("height:30px; min-height:30px");
  });

  it("不依赖 VS Code API、消息桥、存储、Host 或业务服务", async () => {
    installFakeDom();
    const browser = await import("./KtcSystemOutputBlock.js");
    expect(browser.KtcSystemOutputBlock.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage/iu,
    );
    const source = readFileSync(new URL("./KtcSystemOutputBlock.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import\s/mu);
    expect(source).not.toMatch(
      /\b(?:acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|Controller|Service|Registry)\b/u,
    );
  });
});
