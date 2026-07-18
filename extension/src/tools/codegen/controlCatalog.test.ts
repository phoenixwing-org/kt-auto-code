import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
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
        "全选", "全不选", "C++ only", "Field Code", "全部输出到日志", "单选", "↗",
      ]));
      const outputOne = buttons.find((node) => node.textContent === "↗")!;
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

  it("compact/full 共用选择、显示与日志事件，并保持无障碍标签", () => {
    const source = readFileSync(new URL("./controlCatalog.ts", import.meta.url), "utf8");
    expect(source).toContain(':host([mode="compact"])');
    expect(source).toContain('"ktc-codegen-control-selection-change"');
    expect(source).toContain('"ktc-codegen-control-display-change"');
    expect(source).toContain('"ktc-codegen-control-output"');
    expect(source).toContain("显示已选但未命中的控制符模板");
    expect(source).toContain("全部输出到日志");
    expect(source).toContain("输出${block.title}控制符模板到日志");
    expect(source).not.toContain("acquireVsCodeApi");
  });
});
