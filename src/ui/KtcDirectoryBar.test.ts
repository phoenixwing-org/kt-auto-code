import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  KtcDirectoryBarActionDetail,
  KtcDirectoryBarModel,
} from "./KtcDirectoryBar.js";

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
  textContent = "";
  title = "";
  type = "";
  replaceCount = 0;
  onclick?: () => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  focus(): void { activeFakeNode = this; }
  replaceChildren(...nodes: FakeNode[]): void {
    this.replaceCount += 1;
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

interface RecordedEvent {
  readonly type: string;
  readonly detail: KtcDirectoryBarActionDetail;
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

describe("KtcDirectoryBar", () => {
  it("规范化、复制并冻结只含 label/value 的可序列化 model", async () => {
    installFakeDom();
    const browser = await import("./KtcDirectoryBar.js");
    const input = { label: "  目录  ", value: "  PNXCaaStudy/PNXBomAnalysisWsp  " };
    const normalized = browser.normalizeKtcDirectoryBarModel(input);
    input.label = "范围";
    input.value = "changed";

    expect(normalized).toEqual({ label: "目录", value: "PNXCaaStudy/PNXBomAnalysisWsp" });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
    expect(browser.normalizeKtcDirectoryBarModel(undefined)).toEqual({
      label: "目录",
      value: "未选择目录",
    });
  });

  it("幂等注册并渲染 42px 全宽单行，值按钮占剩余宽且整体截断", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcDirectoryBar.js");
    expect(browser.ktcDefineDirectoryBar()).toBe(browser.ktcDefineDirectoryBar());
    expect(registry.get("ktc-directory-bar")).toBe(browser.KtcDirectoryBar);

    const element = new browser.KtcDirectoryBar() as unknown as FakeElement & {
      model: KtcDirectoryBarModel;
    };
    element.model = { label: "目录", value: "PNXCaaStudy/PNXBomAnalysisWsp" };

    const bar = byClass(element.shadow, "bar");
    const label = byClass(element.shadow, "label");
    const select = byAria(element.shadow, "切换目录，当前PNXCaaStudy/PNXBomAnalysisWsp");
    const value = byClass(select, "value");
    const choose = byAria(element.shadow, "选择目录");
    expect(bar.children).toEqual([label, select, choose]);
    expect(label.textContent).toBe("目录");
    expect(value.textContent).toBe("PNXCaaStudy/PNXBomAnalysisWsp");
    expect(value.title).toBe("PNXCaaStudy/PNXBomAnalysisWsp");
    expect(select.title).toBe("目录：PNXCaaStudy/PNXBomAnalysisWsp");
    expect(findNodes(element.shadow, (node) => node.tagName === "button")).toHaveLength(2);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("width:100%; height:42px");
    expect(style).toContain("grid-template-columns:auto minmax(0,1fr) 34px");
    expect(style).toContain(".value { min-width:0; flex:1 1 auto; overflow:hidden; text-overflow:ellipsis");
    expect(style).toContain("white-space:nowrap");
  });

  it("左侧无装饰文件夹，中间只有小 chevron，右侧只有一个 folder picker", async () => {
    installFakeDom();
    const browser = await import("./KtcDirectoryBar.js");
    const element = new browser.KtcDirectoryBar() as unknown as FakeElement & {
      model: KtcDirectoryBarModel;
    };
    element.model = { label: "工作目录", value: "/workspace/phoenix" };

    const label = byClass(element.shadow, "label");
    const select = byAria(element.shadow, "切换工作目录，当前/workspace/phoenix");
    const choose = byAria(element.shadow, "选择工作目录");
    expect(findNodes(label, (node) => node.tagName === "svg")).toHaveLength(0);
    expect(findNodes(select, (node) => node.className === "chevron")).toHaveLength(1);
    expect(findNodes(select, (node) => node.className === "folder")).toHaveLength(0);
    expect(findNodes(choose, (node) => node.className === "folder")).toHaveLength(1);
    expect(findNodes(element.shadow, (node) => node.className === "folder")).toHaveLength(1);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain(".chevron { width:12px; height:12px");
  });

  it("值选择与文件夹选择只发 frozen、bubbles + composed 的语义事件", async () => {
    installFakeDom();
    const browser = await import("./KtcDirectoryBar.js");
    const element = new browser.KtcDirectoryBar() as unknown as FakeElement & {
      model: KtcDirectoryBarModel;
    };
    element.model = { label: "目录", value: "phoenix" };

    byAria(element.shadow, "切换目录，当前phoenix").onclick?.();
    byAria(element.shadow, "选择目录").onclick?.();

    expect(element.events).toHaveLength(2);
    expect(element.events.map(({ detail }) => detail)).toEqual([
      { kind: "select" },
      { kind: "choose" },
    ]);
    expect(element.events.every(({ bubbles, composed }) => bubbles && composed)).toBe(true);
    expect(element.events.every(({ detail }) => Object.isFrozen(detail))).toBe(true);
    expect(element.events.every(({ type }) => type === browser.KTC_DIRECTORY_BAR_ACTION)).toBe(true);
  });

  it("Shadow DOM 只创建一次，同值及新值 patch 均保留节点和键盘焦点", async () => {
    installFakeDom();
    const browser = await import("./KtcDirectoryBar.js");
    const element = new browser.KtcDirectoryBar() as unknown as FakeElement & {
      connectedCallback(): void;
      model: KtcDirectoryBarModel;
    };
    const model = { label: "目录", value: "phoenix" };
    element.model = model;
    element.connectedCallback();
    const bar = byClass(element.shadow, "bar");
    const select = byAria(element.shadow, "切换目录，当前phoenix");
    const value = byClass(element.shadow, "value");
    select.focus();

    element.model = { ...model };
    expect(byClass(element.shadow, "bar")).toBe(bar);
    expect(byClass(element.shadow, "value")).toBe(value);
    expect(element.shadow.replaceCount).toBe(1);
    expect((document as unknown as { activeElement?: FakeNode }).activeElement).toBe(select);

    element.model = { label: "范围", value: "phoenix/projects" };
    expect(byClass(element.shadow, "bar")).toBe(bar);
    expect(byClass(element.shadow, "value")).toBe(value);
    expect(value.textContent).toBe("phoenix/projects");
    expect(value.title).toBe("phoenix/projects");
    expect(select.attributes.get("aria-label")).toBe("切换范围，当前phoenix/projects");
    expect(element.shadow.replaceCount).toBe(1);
    expect((document as unknown as { activeElement?: FakeNode }).activeElement).toBe(select);
  });

  it("使用 VS Code token、forced-colors 和清晰焦点，不持有路径、Store、Host 或业务状态", async () => {
    installFakeDom();
    const browser = await import("./KtcDirectoryBar.js");
    const element = new browser.KtcDirectoryBar() as unknown as FakeElement & {
      model: KtcDirectoryBarModel;
    };
    element.model = { label: "目录", value: "sample" };
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("var(--vscode-input-background");
    expect(style).toContain("var(--vscode-focusBorder)");
    expect(style).toContain("@media (forced-colors:active)");
    expect(style).toContain("button:focus-visible");

    const source = readFileSync(new URL("./KtcDirectoryBar.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import\s/mu);
    expect(source).not.toMatch(
      /\b(?:acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|Controller|Service|Registry|MRU)\b/u,
    );
    expect(source).not.toMatch(/(?:selectedPath|currentPath|workspaceFolder|fileSystem|recentDirectories)/u);
  });
});
