import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  className = "";
  name = "";
  textContent = "";

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

class FakeElement extends FakeNode {
  readonly shadow = new FakeNode("shadow-root");
  attachShadow(): FakeNode { return this.shadow; }
}

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", { createElement: (tagName: string) => new FakeNode(tagName) });
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcPrimaryShell", () => {
  it("幂等注册并只按 Directory、Toolbar、Current Tool、Open Items 排列四个 slot", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcPrimaryShell.js");
    expect(browser.ktcDefinePrimaryShell()).toBe(browser.ktcDefinePrimaryShell());
    expect(registry.get("ktc-primary-shell")).toBe(browser.KtcPrimaryShell);

    const element = new browser.KtcPrimaryShell() as unknown as FakeElement & { connectedCallback(): void };
    element.connectedCallback();
    const slots = findNodes(element.shadow, (node) => node.tagName === "slot");
    expect(slots.map(({ name }) => name)).toEqual(["directory", "toolbar", "current", "open-items"]);
    expect(findNodes(element.shadow, (node) => node.tagName === "slot" && !node.name)).toHaveLength(0);

    const firstSlot = slots[0];
    element.connectedCallback();
    expect(findNodes(element.shadow, (node) => node.tagName === "slot")[0]).toBe(firstSlot);
  });

  it("只让 Current Tool 占用剩余高度，Shell 本身不创建第二滚动边界", async () => {
    installFakeDom();
    const browser = await import("./KtcPrimaryShell.js");
    const element = new browser.KtcPrimaryShell() as unknown as FakeElement & { connectedCallback(): void };
    element.connectedCallback();
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;

    expect(style).toContain("grid-template-rows:auto auto minmax(0,1fr) auto; gap:0");
    expect(style).toContain("::slotted(*) { box-sizing:border-box; width:100%");
    expect(style).toContain("slot[name=\"current\"] { height:100%; min-height:0; overflow:hidden; }");
    expect(style).toContain(".current { overflow:hidden; }");
    expect(style).not.toMatch(/overflow-[xy]:auto|overflow:auto/u);
  });

  it("不聚合 Host、Store、MRU、Tool 或子区域行为", async () => {
    installFakeDom();
    const browser = await import("./KtcPrimaryShell.js");
    expect(browser.KtcPrimaryShell.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|mru/iu,
    );
    const source = readFileSync(new URL("./KtcPrimaryShell.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import\s/mu);
    expect(source).not.toMatch(
      /\b(?:acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|Controller|Service|Registry|MRU|toolId|actionId)\b/u,
    );
    expect(source).not.toMatch(/addEventListener|dispatchEvent|CustomEvent/u);
  });
});
