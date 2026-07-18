import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcCodegenPrimaryViewModel } from "./primaryViewModel.js";

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly classList = {
    toggle: (name: string, enabled: boolean) => {
      const names = new Set(this.className.split(/\s+/u).filter(Boolean));
      if (enabled) names.add(name); else names.delete(name);
      this.className = [...names].join(" ");
    },
  };
  className = "";
  textContent = "";
  title = "";
  type = "";
  value = "";
  disabled = false;
  hidden = false;
  open = false;
  spellcheck = true;
  tabIndex = -1;
  onclick?: () => void;
  onchange?: () => void;
  ontoggle?: () => void;
  scrolled = false;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  querySelector<T extends FakeNode = FakeNode>(selector: string): T | null {
    return findNodes(this, (node) => selector.split(".").slice(1).every(
      (name) => node.className.split(/\s+/u).includes(name),
    )).find((node) => node !== this) as T | undefined ?? null;
  }
  scrollIntoView(): void { this.scrolled = true; }
}

class FakeElement extends FakeNode {
  readonly events: Array<{ type: string; detail: unknown }> = [];
  readonly shadow = new FakeNode("shadow-root");
  readonly isConnected = true;
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown }): boolean {
    this.events.push(event);
    return true;
  }
}

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", { createElement: (tagName: string) => new FakeNode(tagName) });
  vi.stubGlobal("CustomEvent", class<T> {
    constructor(public readonly type: string, public readonly init: { detail: T }) {}
    get detail(): T { return this.init.detail; }
  });
  vi.stubGlobal("customElements", {
    get: (name: string) => registry.get(name),
    define: (name: string, value: CustomElementConstructor) => registry.set(name, value),
  });
  vi.stubGlobal("queueMicrotask", (callback: () => void) => callback());
  return registry;
}

function findNodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  const found: FakeNode[] = [];
  if (predicate(root)) found.push(root);
  for (const child of root.children) found.push(...findNodes(child, predicate));
  return found;
}

const model: KtcCodegenPrimaryViewModel = {
  activeUri: "file:///workspace/Demo.json",
  operation: "discovery",
  running: true,
  documents: [{
    uri: "file:///workspace/Demo.json",
    fileName: "Demo.json",
    displayPath: "config/Demo.json",
    itemCount: 3,
    className: "PNXDemo",
    namePrefix: "PNX",
    nameMiddle: "Demo",
    nameSpace: "Kt",
    appendFunction: "push_back",
    open: true,
    active: true,
    dirty: true,
    externalConflict: false,
    externalState: "current",
    diagnosticCount: 0,
  }],
  candidates: [{
    uri: "file:///workspace/Demo.cpp",
    displayPath: "src/Demo.cpp",
    markerCount: 2,
    encoding: "UTF-8",
    eol: "lf",
  }],
  controls: {
    kind: "kt.codegen.control-view-model",
    schemaVersion: 1,
    uri: "file:///workspace/Demo.json",
    fileName: "Demo.json",
    blocks: [],
    selectedBlockKeys: [],
    singleSelectionMode: false,
    showMissingTemplates: false,
    preflightAvailable: false,
    missingTemplates: [],
    presets: { all: [], none: [], cppOnly: [], fieldCode: [] },
  },
};

describe("Codegen Primary panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("只显式注册一次，并保持浏览器组件不直接绑定 VS Code API", async () => {
    vi.resetModules();
    const registry = installFakeDom();
    const browser = await import("./primaryPanel.js");
    const first = browser.ktcDefineCodegenPrimaryPanel();
    const second = browser.ktcDefineCodegenPrimaryPanel();
    expect(registry.get("ktc-codegen-primary-panel")).toBe(first);
    expect(second).toBe(first);
    expect(browser.KtcCodegenPrimaryPanel.toString()).not.toContain("acquireVsCodeApi");
  });

  it("实际挂载工具栏、会话摘要、列表与 compact 控制符目录", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./primaryPanel.js");
    const element = new browser.KtcCodegenPrimaryPanel() as unknown as FakeElement & {
      model: KtcCodegenPrimaryViewModel;
    };
    element.model = model;

    const text = findNodes(element.shadow, (node) => Boolean(node.textContent)).map((node) => node.textContent);
    expect(text).toEqual(expect.arrayContaining([
      "打开 JSON…", "导入 CSV…", "取消扫描", "扫描候选源码", "复制诊断",
      "Demo.json · 未保存", "PNXDemo · 3 行 · 当前编辑 View", "控制符目录", "JSON 配置",
      "控制符候选（工作区级）", "一份 JSON 对应当前编辑区一个表格 View；Primary 与 JSON View 的控制符目录由 Host session 同步。",
    ]));
    const controlPanel = findNodes(element.shadow, (node) => node.tagName === "ktc-codegen-control-panel")[0]!;
    expect(controlPanel.attributes.get("mode")).toBe("compact");
    expect((controlPanel as FakeNode & { model?: unknown }).model).toBe(model.controls);
    const refresh = findNodes(element.shadow, (node) => node.textContent === "取消扫描")[0]!;
    const candidateScan = findNodes(element.shadow, (node) => node.textContent === "扫描候选源码")[0]!;
    expect(refresh.disabled).toBe(false);
    expect(candidateScan.disabled).toBe(true);
  });

  it("Host 快照重绘时复用 Primary compact 控制面板实例并保留外层折叠", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./primaryPanel.js");
    const element = new browser.KtcCodegenPrimaryPanel() as unknown as FakeElement & {
      model: KtcCodegenPrimaryViewModel;
    };
    element.model = model;
    const firstPanel = findNodes(element.shadow, (node) => node.tagName === "ktc-codegen-control-panel")[0]!;
    const firstSection = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "控制符目录区")[0]!;
    firstSection.open = false;
    firstSection.ontoggle?.();

    element.model = { ...model, operation: undefined, running: false };
    const secondPanel = findNodes(element.shadow, (node) => node.tagName === "ktc-codegen-control-panel")[0]!;
    const secondSection = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "控制符目录区")[0]!;
    expect(secondPanel).toBe(firstPanel);
    expect(secondSection.open).toBe(false);
    expect((secondPanel as FakeNode & { model?: unknown }).model).toBe(model.controls);
  });

  it("通过单一语义事件上报取消、打开文档、打开候选和元数据修改", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./primaryPanel.js");
    const element = new browser.KtcCodegenPrimaryPanel() as unknown as FakeElement & {
      model: KtcCodegenPrimaryViewModel;
    };
    element.model = model;

    findNodes(element.shadow, (node) => node.textContent === "取消扫描")[0]!.onclick?.();
    findNodes(element.shadow, (node) => node.title.includes("config/Demo.json"))[0]!.onclick?.();
    findNodes(element.shadow, (node) => node.title === "打开 src/Demo.cpp")[0]!.onclick?.();
    const prefix = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "Codegen Prefix")[0]!;
    prefix.value = "KTC";
    prefix.onchange?.();

    expect(element.events.map((event) => ({ type: event.type, detail: event.detail }))).toEqual([
      { type: "ktc-codegen-primary-action", detail: { action: "cancelOperation" } },
      { type: "ktc-codegen-primary-action", detail: { action: "openDocument", uri: "file:///workspace/Demo.json" } },
      { type: "ktc-codegen-primary-action", detail: { action: "openCandidate", uri: "file:///workspace/Demo.cpp" } },
      {
        type: "ktc-codegen-primary-action",
        detail: { action: "updateMeta", uri: "file:///workspace/Demo.json", field: "namePrefix", value: "KTC" },
      },
    ]);
  });
});
