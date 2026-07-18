import { afterEach, describe, expect, it, vi } from "vitest";

class FakeNode {
  readonly children: Array<FakeNode | string> = [];
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  title = "";
  type = "";
  hidden = false;
  tabIndex = -1;
  onclick?: (event: { stopPropagation(): void }) => void;
  onkeydown?: (event: { key: string; preventDefault(): void }) => void;
  constructor(readonly tagName = "") {}
  append(...nodes: Array<FakeNode | string>): void { this.children.push(...nodes); }
  replaceChildren(...nodes: Array<FakeNode | string>): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
}

class FakeElement extends FakeNode {
  readonly shadow = new FakeNode("shadow-root");
  readonly events: Array<{ type: string; detail: unknown }> = [];
  readonly isConnected = true;
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown }): boolean {
    this.events.push(event);
    return true;
  }
}

function installFakeDom(): void {
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", { createElement: (name: string) => new FakeNode(name) });
  vi.stubGlobal("CustomEvent", class<T> {
    constructor(public readonly type: string, public readonly init: { detail: T }) {}
    get detail(): T { return this.init.detail; }
  });
  vi.stubGlobal("customElements", { get: () => undefined, define: () => undefined });
}

function findNodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  const found: FakeNode[] = predicate(root) ? [root] : [];
  for (const child of root.children) {
    if (typeof child !== "string") found.push(...findNodes(child, predicate));
  }
  return found;
}

function model() {
  return {
    kind: "kt.codegen.control-view-model" as const,
    schemaVersion: 1 as const,
    uri: "file:///Demo.json",
    fileName: "Demo.json",
    blocks: [{
      key: "PARAM DECLARATION" as const,
      legacyId: 11,
      platform: "caa" as const,
      legacyState: "active" as const,
      legacyCall: "",
      title: "PARAM define",
      controlWords: "PARAM DECLARATION",
      notes: "",
      status: "hit" as const,
      hitCount: 1,
      artifactCount: 1,
    }],
    selectedBlockKeys: ["PARAM DECLARATION" as const],
    singleSelectionMode: false,
    showMissingTemplates: false,
    preflightAvailable: true,
    missingTemplates: [],
    presets: {
      all: ["PARAM DECLARATION" as const], none: [],
      cppOnly: ["PARAM DECLARATION" as const], fieldCode: [],
    },
    preflight: {
      reused: true,
      createdAt: "2026-07-18T00:00:00.000Z",
      plan: {
        markerRegions: [{
          id: "region-1", blockKey: "PARAM DECLARATION", classId: "CATDemoBase",
          path: "/workspace/Demo.h", start: { line: 10 },
        }],
        artifacts: [{ regionId: "region-1", content: "int First;" }],
        diagnostics: [{
          severity: "warning", code: "demo.warning", message: "示例问题",
          path: { file: "/workspace/Demo.h", row: 12 },
        }],
      },
    },
  };
}

describe("Codegen control panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("full 预检默认只显示命中，可切换问题，并保留左右独立滚动", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlPanel.js");
    const panel = new browser.KtcCodegenControlPanel() as unknown as FakeElement & { model: ReturnType<typeof model> };
    panel.setAttribute("mode", "full");
    panel.model = model();

    const hits = findNodes(panel.shadow, (node) => node.textContent === "命中 1")[0]!;
    expect(hits.attributes.get("aria-pressed")).toBe("true");
    expect(findNodes(panel.shadow, (node) => node.textContent === "PARAM DECLARATION")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.textContent === "示例问题")).toHaveLength(0);
    expect(findNodes(panel.shadow, (node) => node.attributes.get("aria-label") === "预检结果滚动区域")).toHaveLength(1);
    const style = findNodes(panel.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("overflow-y: scroll");
    expect(style).toContain("::-webkit-scrollbar-thumb");
    expect(style).toContain("grid-template-rows: repeat(2, minmax(0, 1fr))");
    expect(style).toContain("rgba(121, 121, 121, .7)");

    const open = findNodes(panel.shadow, (node) => node.textContent === "打开")[0]!;
    open.onclick?.({ stopPropagation() {} });
    expect(panel.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-open",
      detail: { path: "/workspace/Demo.h", line: 10 },
    });
    const hitRow = findNodes(panel.shadow, (node) => node.attributes.get("role") === "button")[0]!;
    const preview = findNodes(panel.shadow, (node) => node.tagName === "pre")[0]!;
    expect(hitRow.tabIndex).toBe(0);
    expect(preview.hidden).toBe(true);
    hitRow.onkeydown?.({ key: "Enter", preventDefault() {} });
    expect(preview.hidden).toBe(false);
    expect(preview.textContent).toBe("int First;");

    const issues = findNodes(panel.shadow, (node) => node.textContent === "问题 1")[0]!;
    issues.onclick?.({ stopPropagation() {} });
    expect(findNodes(panel.shadow, (node) => node.textContent === "示例问题")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.textContent === "PARAM DECLARATION")).toHaveLength(0);
  });

  it("compact 只装配共享目录，不复制 View 专属预检结果", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlPanel.js");
    const panel = new browser.KtcCodegenControlPanel() as unknown as FakeElement & { model: ReturnType<typeof model> };
    panel.setAttribute("mode", "compact");
    panel.model = model();
    expect(findNodes(panel.shadow, (node) => node.tagName === "ktc-codegen-control-catalog")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.textContent === "预检结果")).toHaveLength(0);
  });

  it("切换右侧状态筛选时复用左侧目录实例，不重置其本地筛选", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlPanel.js");
    const panel = new browser.KtcCodegenControlPanel() as unknown as FakeElement & { model: ReturnType<typeof model> };
    panel.setAttribute("mode", "full");
    panel.model = model();
    const catalog = findNodes(panel.shadow, (node) => node.tagName === "ktc-codegen-control-catalog")[0]!;
    findNodes(panel.shadow, (node) => node.textContent === "问题 1")[0]!.onclick?.({ stopPropagation() {} });
    expect(findNodes(panel.shadow, (node) => node.tagName === "ktc-codegen-control-catalog")[0]).toBe(catalog);
  });
});
