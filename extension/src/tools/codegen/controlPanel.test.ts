import { afterEach, describe, expect, it, vi } from "vitest";

class FakeNode {
  readonly children: Array<FakeNode | string> = [];
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  title = "";
  type = "";
  hidden = false;
  checked = false;
  tabIndex = -1;
  readonly styleValues = new Map<string, string>();
  readonly style = { setProperty: (name: string, value: string) => this.styleValues.set(name, value) };
  readonly classNames = new Set<string>();
  readonly classList = {
    add: (name: string) => this.classNames.add(name),
    remove: (name: string) => this.classNames.delete(name),
  };
  private capturedPointer: number | undefined;
  onclick?: (event: { stopPropagation(): void }) => void;
  onchange?: () => void;
  onkeydown?: (event: { key: string; preventDefault(): void }) => void;
  onpointerdown?: (event: { pointerId: number; clientX: number }) => void;
  onpointermove?: (event: { pointerId: number; clientX: number }) => void;
  onpointerup?: (event: { pointerId: number; clientX: number }) => void;
  constructor(readonly tagName = "") {}
  append(...nodes: Array<FakeNode | string>): void { this.children.push(...nodes); }
  replaceChildren(...nodes: Array<FakeNode | string>): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  getBoundingClientRect(): { left: number; width: number } { return { left: 0, width: 1008 }; }
  setPointerCapture(pointerId: number): void { this.capturedPointer = pointerId; }
  hasPointerCapture(pointerId: number): boolean { return this.capturedPointer === pointerId; }
  releasePointerCapture(pointerId: number): void {
    if (this.capturedPointer === pointerId) this.capturedPointer = undefined;
  }
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

function model(state: "ready" | "applied" | "stale" = "ready") {
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
    }, {
      key: "CMD AGENT CONSTRUCTOR" as const,
      legacyId: 23,
      platform: "caa" as const,
      legacyState: "active" as const,
      legacyCall: "",
      title: "Cmd Agent Constructor",
      controlWords: "CMD AGENT CONSTRUCTOR",
      notes: "",
      status: "unclosed" as const,
      hitCount: 0,
      artifactCount: 0,
      unclosed: [{
        code: "marker.missing-end" as const,
        path: "/workspace/PNXBomAnalysisCmd.cpp",
        line: 91,
        column: 4,
        classId: "PNXBomAnalysis",
        expectedEnd: "// END KEVIN CAA WIZARD SECTION PNXBomAnalysis CMD AGENT CONSTRUCTOR",
        boundary: { kind: "start" as const, line: 125 },
        message: "missing END before next START",
      }],
    }],
    selectedBlockKeys: ["PARAM DECLARATION" as const, "CMD AGENT CONSTRUCTOR" as const],
    singleSelectionMode: false,
    showMissingTemplates: false,
    preflightAvailable: true,
    missingTemplates: [],
    presets: {
      all: ["PARAM DECLARATION" as const, "CMD AGENT CONSTRUCTOR" as const], none: [],
      cppOnly: ["PARAM DECLARATION" as const], fieldCode: [],
    },
    preflight: {
      reused: true,
      createdAt: "2026-07-18T00:00:00.000Z",
      state,
      message: "缓存计划可应用",
      plan: {
        markerRegions: [{
          id: "region-1", blockKey: "PARAM DECLARATION", classId: "CATDemoBase",
          path: "/workspace/Demo.h", start: { line: 10 },
        }],
        artifacts: [{ regionId: "region-1", content: "int First;" }],
        diagnostics: [{
          severity: "warning", code: "demo.warning", message: "示例问题",
          path: { file: "/workspace/Demo.h", row: 12 },
        }, {
          severity: "error", code: "marker.missing-end", message: "missing END before next START",
          path: { file: "/workspace/PNXBomAnalysisCmd.cpp", row: 91, column: 4 },
        }],
      },
    },
  };
}

describe("Codegen control panel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("full 提供可记忆主从比例、紧凑路径开关和占满可见高度的 sticky 详情", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlPanel.js");
    const panel = new browser.KtcCodegenControlPanel() as unknown as FakeElement & {
      model: ReturnType<typeof model>;
      splitRatio: number;
    };
    panel.setAttribute("mode", "full");
    panel.splitRatio = 61;
    panel.model = model();

    const hits = findNodes(panel.shadow, (node) => node.textContent === "命中 1")[0]!;
    expect(hits.attributes.get("aria-pressed")).toBe("true");
    expect(findNodes(panel.shadow, (node) => node.textContent === "PARAM DECLARATION").length).toBeGreaterThanOrEqual(2);
    expect(findNodes(panel.shadow, (node) => node.className === "control-id" && node.textContent === "#11").length).toBeGreaterThanOrEqual(2);
    expect(findNodes(panel.shadow, (node) => node.textContent === "示例问题")).toHaveLength(0);
    expect(findNodes(panel.shadow, (node) => node.className === "result-layout")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.className === "result-master")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.className === "result-detail")).toHaveLength(1);
    const style = findNodes(panel.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain(".result-layout { display: grid; grid-template-columns:");
    expect(style).toContain(".result-master { min-width: 0; overflow-x: hidden; overflow-y: visible;");
    expect(style).toContain(".result-detail { display: flex; position: sticky; top: var(--ktc-codegen-detail-sticky-top, 58px);");
    expect(style).toContain("block-size: var(--ktc-codegen-detail-available-height");
    expect(style).toContain(".detail-preview { display: block; flex: 1 1 auto;");
    expect(style).toContain("overflow: auto; overscroll-behavior: contain;");
    expect(style).not.toContain(".result-list { overflow-y: auto");
    expect(findNodes(panel.shadow, (node) => node.tagName === "ktc-codegen-control-catalog")).toHaveLength(0);
    const layout = findNodes(panel.shadow, (node) => node.className === "result-layout")[0]!;
    expect(layout.styleValues.get("--ktc-codegen-result-master")).toBe("61%");
    const separator = findNodes(panel.shadow, (node) => node.attributes.get("role") === "separator")[0]!;
    separator.onpointerdown?.({ pointerId: 7, clientX: 0 });
    separator.onpointermove?.({ pointerId: 7, clientX: 504 });
    expect(layout.styleValues.get("--ktc-codegen-result-master")).toBe("50%");
    separator.onpointerup?.({ pointerId: 7, clientX: 605 });
    expect(panel.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-split-change",
      detail: { ratio: 60 },
    });

    const master = findNodes(panel.shadow, (node) => node.className === "result-master")[0]!;
    expect(findNodes(master, (node) => node.textContent === "CATDemoBase · 第 11 行")).toHaveLength(1);
    expect(findNodes(master, (node) => node.textContent === "/workspace/Demo.h:11 · CATDemoBase")).toHaveLength(0);
    const pathCheck = findNodes(panel.shadow, (node) => node.attributes.get("aria-label") === "显示左侧源码路径")[0]!;
    expect(pathCheck.checked).toBe(false);
    pathCheck.checked = true;
    pathCheck.onchange?.();
    const masterWithPaths = findNodes(panel.shadow, (node) => node.className === "result-master")[0]!;
    expect(findNodes(masterWithPaths, (node) => node.textContent === "/workspace/Demo.h:11 · CATDemoBase")).toHaveLength(1);

    const preview = findNodes(panel.shadow, (node) => node.attributes.get("aria-label") === "PARAM DECLARATION Artifact 预览")[0]!;
    expect(preview.textContent).toBe("int First;");
    const open = findNodes(panel.shadow, (node) => node.textContent === "打开位置")[0]!;
    open.onclick?.({ stopPropagation() {} });
    expect(panel.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-open",
      detail: { path: "/workspace/Demo.h", line: 10 },
    });

    const issues = findNodes(panel.shadow, (node) => node.textContent === "问题 2")[0]!;
    issues.onclick?.({ stopPropagation() {} });
    expect(findNodes(panel.shadow, (node) => node.textContent === "示例问题").length).toBeGreaterThanOrEqual(1);
    expect(findNodes(panel.shadow, (node) => node.textContent === "PARAM DECLARATION")).toHaveLength(0);
    const missingEndRow = findNodes(panel.shadow, (node) => (
      node.tagName === "button"
      && findNodes(node, (child) => child.textContent === "ERROR · marker.missing-end").length > 0
    ))[0]!;
    missingEndRow.onclick?.({ stopPropagation() {} });
    expect(findNodes(panel.shadow, (node) => node.textContent === "missing END before next START")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.className === "control-id" && node.textContent === "#23").length).toBeGreaterThanOrEqual(2);
    expect(findNodes(panel.shadow, (node) => node.textContent === "// END KEVIN CAA WIZARD SECTION PNXBomAnalysis CMD AGENT CONSTRUCTOR")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.textContent === "插入 #error")).toHaveLength(0);
    const copyEnd = findNodes(panel.shadow, (node) => node.textContent === "复制 END")[0]!;
    copyEnd.onclick?.({ stopPropagation() {} });
    expect(panel.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-copy-end",
      detail: {
        blockKey: "CMD AGENT CONSTRUCTOR", path: "/workspace/PNXBomAnalysisCmd.cpp", line: 91,
      },
    });
  });

  it("Apply 后保留命中与问题，并明确提示再次 Apply 需重新预检", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlPanel.js");
    const panel = new browser.KtcCodegenControlPanel() as unknown as FakeElement & { model: ReturnType<typeof model> };
    panel.setAttribute("mode", "full");
    panel.model = {
      ...model(),
      preflight: { ...model("applied").preflight, message: "已应用；再次 Apply 前需重新预检" },
    };

    expect(findNodes(panel.shadow, (node) => node.textContent === "已应用 · 需重新预检")).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.textContent.includes("已应用；再次 Apply 前需重新预检"))).toHaveLength(1);
    expect(findNodes(panel.shadow, (node) => node.textContent === "PARAM DECLARATION").length).toBeGreaterThanOrEqual(2);
    expect(findNodes(panel.shadow, (node) => node.textContent === "问题 2")).toHaveLength(1);
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

  it("full 切换预检状态筛选时不会重新引入控制符目录", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlPanel.js");
    const panel = new browser.KtcCodegenControlPanel() as unknown as FakeElement & { model: ReturnType<typeof model> };
    panel.setAttribute("mode", "full");
    panel.model = model();
    findNodes(panel.shadow, (node) => node.textContent === "问题 2")[0]!.onclick?.({ stopPropagation() {} });
    expect(findNodes(panel.shadow, (node) => node.tagName === "ktc-codegen-control-catalog")).toHaveLength(0);
    expect(findNodes(panel.shadow, (node) => node.textContent === "示例问题").length).toBeGreaterThanOrEqual(1);
  });
});
