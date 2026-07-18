import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  ktcFilterCodegenControlBlocks,
  ktcNextCodegenControlSelection,
  ktcToggleCodegenControlSingleMode,
} from "./controlCatalogState.js";

class FakeNode {
  readonly children: Array<FakeNode | string> = [];
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  title = "";
  type = "";
  checked = false;
  tabIndex = -1;
  onclick?: () => void;
  onchange?: () => void;

  append(...nodes: Array<FakeNode | string>): void { this.children.push(...nodes); }
  replaceChildren(...nodes: Array<FakeNode | string>): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

class FakeElement extends FakeNode {
  readonly events: Array<{ type: string; detail: unknown }> = [];
  readonly shadow = new FakeNode();
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
  vi.stubGlobal("document", {
    createElement: () => new FakeNode(),
    createDocumentFragment: () => new FakeNode(),
  });
  vi.stubGlobal("CustomEvent", class<T> {
    constructor(public readonly type: string, public readonly init: { detail: T }) {}
    get detail(): T { return this.init.detail; }
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
  for (const child of root.children) {
    if (typeof child !== "string") found.push(...findNodes(child, predicate));
  }
  return found;
}

describe("Codegen control catalog", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("冻结多选、单选与取消选择的纯状态转换", () => {
    expect(ktcNextCodegenControlSelection(
      { blockKeys: ["PARAM DECLARATION"], singleMode: false },
      "PARAM CONSTRUCTOR",
      true,
    )).toEqual({ blockKeys: ["PARAM DECLARATION", "PARAM CONSTRUCTOR"], singleMode: false });
    expect(ktcNextCodegenControlSelection(
      { blockKeys: ["PARAM DECLARATION"], singleMode: true },
      "PARAM CONSTRUCTOR",
      true,
    )).toEqual({ blockKeys: ["PARAM CONSTRUCTOR"], singleMode: true });
    expect(ktcToggleCodegenControlSingleMode({
      blockKeys: ["PARAM DECLARATION", "PARAM CONSTRUCTOR"], singleMode: false,
    })).toEqual({ blockKeys: ["PARAM DECLARATION"], singleMode: true });
  });

  it("显示筛选不修改勾选，并组合状态与 C++/Field Code 范围", () => {
    const blocks = [
      { key: "PARAM DECLARATION", status: "hit" },
      { key: "QT UPDATE DIALOG", status: "missing" },
      { key: "CMD ACTION PDA", status: "unselected" },
    ] as unknown as Parameters<typeof ktcFilterCodegenControlBlocks>[0];
    const selected = ["PARAM DECLARATION", "QT UPDATE DIALOG"] as const;
    const scopes = {
      cppOnly: ["PARAM DECLARATION"] as const,
      fieldCode: ["QT UPDATE DIALOG", "CMD ACTION PDA"] as const,
    };
    expect(ktcFilterCodegenControlBlocks(
      blocks, selected, { status: "hit", scope: "all" }, scopes,
    ).map((block) => block.key)).toEqual(["PARAM DECLARATION"]);
    expect(ktcFilterCodegenControlBlocks(
      blocks, selected, { status: "selected", scope: "field-code" }, scopes,
    ).map((block) => block.key)).toEqual(["QT UPDATE DIALOG"]);
    expect(selected).toEqual(["PARAM DECLARATION", "QT UPDATE DIALOG"]);
  });

  it("显式注册一次 Web Component，模块加载不触碰 VS Code API", async () => {
    vi.resetModules();
    const registry = installFakeDom();
    const browser = await import("./controlCatalog.js");
    expect(registry.size).toBe(0);
    const first = browser.ktcDefineCodegenControlCatalog();
    const second = browser.ktcDefineCodegenControlCatalog();
    expect(registry.get("ktc-codegen-control-catalog")).toBe(first);
    expect(second).toBe(first);
  });

  it("compact/full 实际挂载同一工具栏、行操作和 CustomEvent payload", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlCatalog.js");
    const model = {
      kind: "kt.codegen.control-view-model" as const,
      schemaVersion: 1 as const,
      uri: "file:///Demo.json",
      fileName: "Demo.json",
      blocks: [{
        key: "PARAM DECLARATION" as const,
        legacyId: 12,
        platform: "caa" as const,
        legacyState: "active" as const,
        legacyCall: "",
        title: "参数声明",
        controlWords: "PARAM DECLARATION",
        notes: "test",
        status: "pending" as const,
        hitCount: 0,
        artifactCount: 0,
      }],
      selectedBlockKeys: ["PARAM DECLARATION" as const],
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: false,
      missingTemplates: [],
      presets: {
        all: ["PARAM DECLARATION" as const], none: [],
        cppOnly: ["PARAM DECLARATION" as const], fieldCode: [],
      },
    };

    for (const mode of ["compact", "full"] as const) {
      const element = new browser.KtcCodegenControlCatalog() as unknown as FakeElement & {
        model: typeof model;
      };
      element.setAttribute("mode", mode);
      element.model = model;
      const buttons = findNodes(element.shadow, (node) => Boolean(node.textContent));
      expect(buttons.map((node) => node.textContent)).toEqual(expect.arrayContaining([
        "命中 0", "未命中 0", "已选 1", "全部 1", "全部类型", "C++ only", "Field Code",
        "输出筛选并复制 (1)", "选中当前筛选", "取消当前筛选", "全选", "全不选", "开启单选", "⧉",
      ]));
      expect(buttons.find((node) => node.textContent === "已选 1")?.attributes.get("aria-pressed")).toBe("true");
      const outputVisible = buttons.find((node) => node.textContent === "输出筛选并复制 (1)")!;
      outputVisible.onclick?.();
      expect(element.events.at(-1)).toMatchObject({
        type: "ktc-codegen-control-output",
        detail: { scope: "visible", blockKeys: ["PARAM DECLARATION"] },
      });
      const outputOne = buttons.find((node) => node.textContent === "⧉")!;
      outputOne.onclick?.();
      expect(element.events.at(-1)).toMatchObject({
        type: "ktc-codegen-control-output",
        detail: { scope: "block", blockKey: "PARAM DECLARATION" },
      });
      const missing = findNodes(
        element.shadow,
        (node) => node.attributes.get("aria-label") === "显示已选但未命中的控制符模板",
      )[0]!;
      missing.checked = true;
      missing.onchange?.();
      expect(element.events.at(-1)).toMatchObject({
        type: "ktc-codegen-control-display-change",
        detail: { showMissingTemplates: true },
      });
    }
  });

  it("预检完成后默认只显示命中，切换显示筛选不改变 Apply 勾选", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlCatalog.js");
    const element = new browser.KtcCodegenControlCatalog() as unknown as FakeElement & { model: unknown };
    element.setAttribute("mode", "full");
    element.model = {
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: "file:///Demo.json",
      fileName: "Demo.json",
      blocks: [
        {
          key: "PARAM DECLARATION", legacyId: 11, platform: "cpp", legacyState: "active", legacyCall: "",
          title: "命中项", controlWords: "PARAM DECLARATION", notes: "", status: "hit", hitCount: 1, artifactCount: 1,
        },
        {
          key: "QT UPDATE DIALOG", legacyId: 17, platform: "qt", legacyState: "active", legacyCall: "",
          title: "未命中项", controlWords: "QT UPDATE DIALOG", notes: "", status: "missing", hitCount: 0, artifactCount: 0,
        },
      ],
      selectedBlockKeys: ["PARAM DECLARATION", "QT UPDATE DIALOG"],
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: true,
      missingTemplates: [],
      presets: {
        all: ["PARAM DECLARATION", "QT UPDATE DIALOG"], none: [],
        cppOnly: ["PARAM DECLARATION"], fieldCode: [],
      },
    };

    let nodes = findNodes(element.shadow, (node) => Boolean(node.textContent));
    expect(nodes.find((node) => node.textContent === "命中 1")?.attributes.get("aria-pressed")).toBe("true");
    expect(nodes.some((node) => node.textContent === "命中项")).toBe(true);
    expect(nodes.some((node) => node.textContent === "未命中项")).toBe(false);

    nodes.find((node) => node.textContent === "未命中 1")!.onclick?.();
    nodes = findNodes(element.shadow, (node) => Boolean(node.textContent));
    expect(nodes.some((node) => node.textContent === "命中项")).toBe(false);
    expect(nodes.some((node) => node.textContent === "未命中项")).toBe(true);
    expect(element.events).toHaveLength(0);

    nodes.find((node) => node.textContent === "输出筛选并复制 (1)")!.onclick?.();
    expect(element.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-output",
      detail: { scope: "visible", blockKeys: ["QT UPDATE DIALOG"] },
    });
    nodes.find((node) => node.textContent === "取消当前筛选")!.onclick?.();
    expect(element.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-selection-change",
      detail: { blockKeys: ["PARAM DECLARATION"], singleMode: false },
    });
  });

  it("compact/full 共用选择、显示与日志事件，并保持无障碍标签", () => {
    const source = readFileSync(new URL("./controlCatalog.ts", import.meta.url), "utf8");
    expect(source).toContain(':host([mode="compact"])');
    expect(source).toContain('"ktc-codegen-control-selection-change"');
    expect(source).toContain('"ktc-codegen-control-display-change"');
    expect(source).toContain('"ktc-codegen-control-output"');
    expect(source).toContain("显示已选但未命中的控制符模板");
    expect(source).toContain("输出筛选并复制");
    expect(source).toContain("显示筛选不会修改 Apply 勾选");
    expect(source).toContain("输出${block.title}控制块到日志并复制可粘贴源码");
    expect(source).toContain("overflow-y: scroll");
    expect(source).toContain("::-webkit-scrollbar-thumb");
    expect(source).not.toContain("acquireVsCodeApi");
  });
});
