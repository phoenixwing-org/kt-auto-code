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
  onscroll?: () => void;
  scrollTop = 0;
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
      "打开", "导入", "全部应用", "取消刷新", "扫源码", "复制诊断",
      "Demo.json", "PNXDemo · 3 行 · 当前编辑 View · 未保存", "控制符目录", "JSON 配置",
      "控制符候选（工作区级）", "一份 JSON 对应当前编辑区一个表格 View；Primary 与 JSON View 的控制符目录由 Host session 同步。",
    ]));
    const controlPanel = findNodes(element.shadow, (node) => node.tagName === "ktc-codegen-control-panel")[0]!;
    expect(controlPanel.attributes.get("mode")).toBe("compact");
    expect((controlPanel as FakeNode & { model?: unknown }).model).toBe(model.controls);
    const blockTitles = element.shadow.children
      .filter((node) => node.tagName === "details")
      .map((block) => findNodes(block, (node) => node.className.split(/\s+/u).includes("mini-title"))[0]?.textContent);
    expect(blockTitles).toEqual(["Demo.json", "JSON 配置", "控制符目录", "控制符候选（工作区级）"]);
    const currentConfig = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "当前配置区")[0]!;
    expect(currentConfig.open).toBe(true);
    expect(findNodes(currentConfig, (node) => node.className.includes("current-file"))[0]!.title).toBe("");
    expect(findNodes(currentConfig, (node) => node.tagName === "summary")[0]!.title).toBe("Demo.json");
    const refresh = findNodes(element.shadow, (node) => node.textContent === "取消刷新")[0]!;
    const candidateScan = findNodes(element.shadow, (node) => node.textContent === "扫源码")[0]!;
    expect(refresh.disabled).toBe(false);
    expect(candidateScan.disabled).toBe(true);
    expect(findNodes(element.shadow, (node) => node.textContent === "打开")[0]!.title).toBe("打开一份 Codegen JSON");
    expect(candidateScan.title).toBe("扫描工作区中含 Codegen 控制符的源码候选");
  });

  it("Host 快照重绘时复用控制面板，并保留四个 Block 的折叠与列表滚动", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./primaryPanel.js");
    const element = new browser.KtcCodegenPrimaryPanel() as unknown as FakeElement & {
      model: KtcCodegenPrimaryViewModel;
    };
    element.model = model;
    const firstPanel = findNodes(element.shadow, (node) => node.tagName === "ktc-codegen-control-panel")[0]!;
    const firstCurrentConfig = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "当前配置区")[0]!;
    const firstDocuments = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "JSON 配置区")[0]!;
    const firstSection = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "控制符目录区")[0]!;
    const firstCandidates = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "控制符候选区")[0]!;
    const firstDocumentList = findNodes(element.shadow, (node) => node.className.includes("document-list"))[0]!;
    const firstCandidateList = findNodes(element.shadow, (node) => node.className.includes("candidate-list"))[0]!;
    firstCurrentConfig.open = false;
    firstCurrentConfig.ontoggle?.();
    firstDocuments.open = false;
    firstDocuments.ontoggle?.();
    firstSection.open = false;
    firstSection.ontoggle?.();
    firstCandidates.open = false;
    firstCandidates.ontoggle?.();
    firstDocumentList.scrollTop = 73;
    firstDocumentList.onscroll?.();
    firstCandidateList.scrollTop = 41;
    firstCandidateList.onscroll?.();

    element.model = { ...model, operation: undefined, running: false };
    const secondPanel = findNodes(element.shadow, (node) => node.tagName === "ktc-codegen-control-panel")[0]!;
    const secondCurrentConfig = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "当前配置区")[0]!;
    const secondDocuments = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "JSON 配置区")[0]!;
    const secondSection = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "控制符目录区")[0]!;
    const secondCandidates = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "控制符候选区")[0]!;
    expect(secondPanel).toBe(firstPanel);
    expect(secondCurrentConfig.open).toBe(false);
    expect(secondDocuments.open).toBe(false);
    expect(secondSection.open).toBe(false);
    expect(secondCandidates.open).toBe(false);
    expect(findNodes(element.shadow, (node) => node.className.includes("document-list"))[0]!.scrollTop).toBe(73);
    expect(findNodes(element.shadow, (node) => node.className.includes("candidate-list"))[0]!.scrollTop).toBe(41);
    expect(findNodes(element.shadow, (node) => node.className.includes("active"))[0]?.scrolled).toBe(false);
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

    findNodes(element.shadow, (node) => node.textContent === "全部应用")[0]!.onclick?.();
    findNodes(element.shadow, (node) => node.textContent === "取消刷新")[0]!.onclick?.();
    findNodes(element.shadow, (node) => node.title.includes("config/Demo.json"))[0]!.onclick?.();
    findNodes(element.shadow, (node) => node.title === "打开 src/Demo.cpp")[0]!.onclick?.();
    const prefix = findNodes(element.shadow, (node) => node.attributes.get("aria-label") === "Codegen Prefix")[0]!;
    prefix.value = "KTC";
    prefix.onchange?.();

    expect(element.events.map((event) => ({ type: event.type, detail: event.detail }))).toEqual([
      { type: "ktc-codegen-primary-action", detail: { action: "applyAll" } },
      { type: "ktc-codegen-primary-action", detail: { action: "cancelOperation" } },
      { type: "ktc-codegen-primary-action", detail: { action: "openDocument", uri: "file:///workspace/Demo.json" } },
      { type: "ktc-codegen-primary-action", detail: { action: "openCandidate", uri: "file:///workspace/Demo.cpp" } },
      {
        type: "ktc-codegen-primary-action",
        detail: { action: "updateMeta", uri: "file:///workspace/Demo.json", field: "namePrefix", value: "KTC" },
      },
    ]);
  });

  it("全部应用运行时用进度遮罩锁定 Primary", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./primaryPanel.js");
    const element = new browser.KtcCodegenPrimaryPanel() as unknown as FakeElement & {
      model: KtcCodegenPrimaryViewModel;
    };
    element.model = {
      ...model,
      operation: "batch-apply",
      batch: { current: 2, total: 5, fileName: "B.json" },
      running: true,
    };

    const overlay = findNodes(element.shadow, (node) => node.className === "batch-overlay")[0]!;
    expect(overlay.hidden).toBe(false);
    expect(overlay.attributes.get("aria-label")).toContain("操作暂时锁定");
    expect(findNodes(overlay, (node) => node.textContent === "正在全部应用 2 / 5")).toHaveLength(1);
    expect(findNodes(overlay, (node) => node.textContent === "B.json")).toHaveLength(1);
  });

  it("没有真实进度时不显示残留的全部应用遮罩", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./primaryPanel.js");
    const element = new browser.KtcCodegenPrimaryPanel() as unknown as FakeElement & {
      model: KtcCodegenPrimaryViewModel;
    };
    element.model = { ...model, operation: "batch-apply", batch: undefined, running: false };

    const overlay = findNodes(element.shadow, (node) => node.className === "batch-overlay")[0]!;
    expect(overlay.hidden).toBe(true);
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!;
    expect(style.textContent).toContain(".batch-overlay[hidden] { display: none; }");
  });
});
