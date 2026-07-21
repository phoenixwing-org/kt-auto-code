import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  KTC_CODEGEN_CONTROL_GROUPS,
  ktcCodegenControlVisibleSelectionState,
  ktcFilterCodegenControlBlocks,
  ktcGroupCodegenControlBlocks,
  ktcNextCodegenControlSelection,
  ktcNextCodegenControlVisibleSelection,
  ktcToggleCodegenControlSingleMode,
} from "./controlCatalogState.js";

class FakeNode {
  readonly children: Array<FakeNode | string> = [];
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  title = "";
  type = "";
  value = "";
  checked = false;
  disabled = false;
  indeterminate = false;
  open = false;
  tabIndex = -1;
  onclick?: (event?: { stopPropagation(): void }) => void;
  onchange?: () => void;
  onfocus?: () => void;
  onblur?: () => void;
  ontoggle?: () => void;
  onscroll?: () => void;
  scrollTop = 0;
  focused = false;
  focusOptions: FocusOptions | undefined;

  constructor(readonly tagName = "") {}

  append(...nodes: Array<FakeNode | string>): void { this.children.push(...nodes); }
  replaceChildren(...nodes: Array<FakeNode | string>): void {
    this.children.splice(0, this.children.length, ...nodes);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  focus(options?: FocusOptions): void { this.focused = true; this.focusOptions = options; }
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
    createElement: (tagName: string) => new FakeNode(tagName),
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
      { key: "PARAM CONSTRUCTOR", status: "unclosed" },
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
      blocks, selected, { status: "unclosed", scope: "all" }, scopes,
    ).map((block) => block.key)).toEqual(["PARAM CONSTRUCTOR"]);
    expect(ktcFilterCodegenControlBlocks(
      blocks, selected, { status: "selected", scope: "field-code" }, scopes,
    ).map((block) => block.key)).toEqual(["QT UPDATE DIALOG"]);
    expect(selected).toEqual(["PARAM DECLARATION", "QT UPDATE DIALOG"]);
  });

  it("missing-end 提供未闭合筛选，但 Primary 默认仍显示命中且行内不展开诊断或安全操作", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlCatalog.js");
    const element = new browser.KtcCodegenControlCatalog() as unknown as FakeElement & { model: unknown };
    element.setAttribute("mode", "compact");
    element.model = {
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: "file:///PNXBomAnalysisParam.json",
      fileName: "PNXBomAnalysisParam.json",
      blocks: [{
        key: "CMD AGENT CONSTRUCTOR", legacyId: 23, platform: "caa", legacyState: "active", legacyCall: "",
        title: "Cmd Agent Constructor", controlWords: "CMD AGENT CONSTRUCTOR", notes: "",
        status: "unclosed", hitCount: 0, artifactCount: 0,
        unclosed: [{
          code: "marker.missing-end", path: "/workspace/PNXBomAnalysisCmd.cpp", line: 91, column: 4,
          classId: "PNXBomAnalysis",
          expectedEnd: "// END KEVIN CAA WIZARD SECTION PNXBomAnalysis CMD AGENT CONSTRUCTOR",
          boundary: { kind: "start", line: 125 },
          message: "Start marker PNXBomAnalysis CMD AGENT CONSTRUCTOR has no matching End marker before Start marker at line 125.",
        }],
      }, {
        key: "QT UPDATE DIALOG", legacyId: 17, platform: "qt", legacyState: "active", legacyCall: "",
        title: "Qt Dialog", controlWords: "QT UPDATE DIALOG", notes: "",
        status: "missing", hitCount: 0, artifactCount: 0,
      }],
      selectedBlockKeys: ["CMD AGENT CONSTRUCTOR", "QT UPDATE DIALOG"],
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: true,
      missingTemplates: [],
      presets: { all: ["CMD AGENT CONSTRUCTOR", "QT UPDATE DIALOG"], none: [], cppOnly: [], fieldCode: [] },
    };

    const nodes = findNodes(element.shadow, () => true);
    const statusFilter = nodes.find((node) => node.attributes.get("aria-label") === "控制符状态")!;
    expect(statusFilter.value).toBe("hit");
    expect(nodes.some((node) => node.textContent === "未闭合")).toBe(false);
    statusFilter.value = "unclosed";
    statusFilter.onchange?.();
    const unclosedNodes = findNodes(element.shadow, () => true);
    expect(unclosedNodes.find((node) => node.attributes.get("aria-label") === "控制符状态")?.value).toBe("unclosed");
    expect(unclosedNodes.some((node) => node.textContent === "未闭合")).toBe(true);
    expect(unclosedNodes.some((node) => node.textContent === "未命中")).toBe(false);
    expect(unclosedNodes.some((node) => node.tagName === "details" && node.className === "block-item")).toBe(false);
    expect(unclosedNodes.some((node) => node.textContent === "起始位置：/workspace/PNXBomAnalysisCmd.cpp:92")).toBe(false);
    expect(unclosedNodes.some((node) => node.textContent === "// END KEVIN CAA WIZARD SECTION PNXBomAnalysis CMD AGENT CONSTRUCTOR")).toBe(false);
    expect(unclosedNodes.some((node) => node.textContent === "打开位置")).toBe(false);
    expect(unclosedNodes.some((node) => node.textContent === "复制 END")).toBe(false);
    expect(unclosedNodes.some((node) => node.textContent.startsWith("已选 "))).toBe(false);
    expect(unclosedNodes.some((node) => node.textContent === "全部 2")).toBe(true);
  });

  it("固定按 C++→Qt→CAA 分组，保留 deprecated，并只对当前筛选可见项计算三态与选择", () => {
    const blocks = [
      { key: "CATALOG PARAMS", legacyId: 0, platform: "caa", legacyState: "active" },
      { key: "PARAM CONSTRUCTOR", legacyId: 10, platform: "cpp", legacyState: "active" },
      { key: "PARAM DECLARATION", legacyId: 11, platform: "cpp", legacyState: "active" },
      { key: "QT UPDATE DIALOG", legacyId: 17, platform: "qt", legacyState: "active" },
      { key: "DLG SET ACTIVE FIELD", legacyId: 20, platform: "caa", legacyState: "legacy-deprecated" },
    ] as unknown as Parameters<typeof ktcGroupCodegenControlBlocks>[0];

    const groups = ktcGroupCodegenControlBlocks(blocks);
    expect(groups.map((group) => group.id)).toEqual(KTC_CODEGEN_CONTROL_GROUPS.map((group) => group.id));
    expect(groups.map((group) => group.blocks.map((block) => block.legacyId))).toEqual([
      [10, 11], [17], [0, 20],
    ]);
    expect(groups[2]!.blocks.find((block) => block.legacyId === 20)?.legacyState).toBe("legacy-deprecated");

    expect(ktcCodegenControlVisibleSelectionState(
      ["PARAM CONSTRUCTOR", "PARAM DECLARATION"],
      ["CATALOG PARAMS", "PARAM CONSTRUCTOR"],
    )).toEqual({ checked: false, indeterminate: true, disabled: false, selectedCount: 1, visibleCount: 2 });
    expect(ktcCodegenControlVisibleSelectionState([], ["CATALOG PARAMS"])).toEqual({
      checked: false, indeterminate: false, disabled: true, selectedCount: 0, visibleCount: 0,
    });

    const selected = ktcNextCodegenControlVisibleSelection(
      { blockKeys: ["CATALOG PARAMS", "PARAM CONSTRUCTOR"], singleMode: true },
      ["PARAM CONSTRUCTOR", "PARAM DECLARATION"],
      true,
      blocks.map((block) => block.key),
    );
    expect(selected).toEqual({
      blockKeys: ["CATALOG PARAMS", "PARAM CONSTRUCTOR", "PARAM DECLARATION"],
      singleMode: false,
    });
    expect(ktcNextCodegenControlVisibleSelection(
      selected,
      ["PARAM CONSTRUCTOR", "PARAM DECLARATION"],
      false,
      blocks.map((block) => block.key),
    )).toEqual({ blockKeys: ["CATALOG PARAMS"], singleMode: false });
    expect(ktcNextCodegenControlVisibleSelection(
      { blockKeys: ["CATALOG PARAMS"], singleMode: true },
      ["QT UPDATE DIALOG"],
      true,
      blocks.map((block) => block.key),
    )).toEqual({ blockKeys: ["CATALOG PARAMS", "QT UPDATE DIALOG"], singleMode: false });
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
    };

    for (const mode of ["compact", "full"] as const) {
      const element = new browser.KtcCodegenControlCatalog() as unknown as FakeElement & {
        model: typeof model;
      };
      element.setAttribute("mode", mode);
      element.model = model;
      const buttons = findNodes(element.shadow, () => true);
      expect(buttons.map((node) => node.textContent)).toEqual(expect.arrayContaining([
        "命中 1", "未闭合 0", "未命中 0", "全部 1", "全部类型", "C++ only", "Field Code",
        "⧉",
      ]));
      expect(buttons.find((node) => node.attributes.get("aria-label") === "控制符状态")?.value).toBe("hit");
      expect(buttons.some((node) => node.textContent.startsWith("已选 "))).toBe(false);
      expect(buttons.some((node) => node.textContent === "选择工具 · 1")).toBe(false);
      expect(buttons.some((node) => ["选中当前筛选", "取消当前筛选", "全选", "全不选", "开启单选"].includes(node.textContent))).toBe(false);
      const outputVisible = buttons.find((node) => node.attributes.get("aria-label")?.startsWith("输出当前筛选并复制"))!;
      outputVisible.onclick?.();
      expect(element.events.at(-1)).toMatchObject({
        type: "ktc-codegen-control-output",
        detail: { scope: "visible", blockKeys: ["PARAM DECLARATION"] },
      });
      const outputOne = buttons.find((node) => node.attributes.get("aria-label")?.includes("参数声明控制块"))!;
      outputOne.onclick?.();
      expect(element.events.at(-1)).toMatchObject({
        type: "ktc-codegen-control-output",
        detail: { scope: "block", blockKey: "PARAM DECLARATION" },
      });
      expect(buttons.some((node) => node.textContent === "展开缺失模板")).toBe(false);
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
          title: "命中项", controlWords: "PARAM DECLARATION", notes: "", status: "pending", hitCount: 0, artifactCount: 0,
        },
        {
          key: "QT UPDATE DIALOG", legacyId: 17, platform: "qt", legacyState: "active", legacyCall: "",
          title: "未命中项", controlWords: "QT UPDATE DIALOG", notes: "", status: "pending", hitCount: 0, artifactCount: 0,
        },
      ],
      selectedBlockKeys: ["PARAM DECLARATION", "QT UPDATE DIALOG"],
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: false,
      missingTemplates: [],
      presets: {
        all: ["PARAM DECLARATION", "QT UPDATE DIALOG"], none: [],
        cppOnly: ["PARAM DECLARATION"], fieldCode: [],
      },
    };
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

    let nodes = findNodes(element.shadow, () => true);
    let statusFilter = nodes.find((node) => node.attributes.get("aria-label") === "控制符状态")!;
    expect(statusFilter.value).toBe("hit");
    expect(nodes.some((node) => node.textContent === "命中项")).toBe(true);
    expect(nodes.some((node) => node.textContent === "未命中项")).toBe(false);

    statusFilter.value = "missing";
    statusFilter.onchange?.();
    nodes = findNodes(element.shadow, () => true);
    expect(nodes.some((node) => node.textContent === "命中项")).toBe(false);
    expect(nodes.some((node) => node.textContent === "未命中项")).toBe(true);
    expect(element.events).toHaveLength(0);

    element.model = {
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: "file:///Demo.json",
      fileName: "Demo.json",
      blocks: [
        {
          key: "PARAM DECLARATION", legacyId: 11, platform: "cpp", legacyState: "active", legacyCall: "",
          title: "命中项", controlWords: "PARAM DECLARATION", notes: "", status: "hit", hitCount: 2, artifactCount: 2,
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
    nodes = findNodes(element.shadow, () => true);
    statusFilter = nodes.find((node) => node.attributes.get("aria-label") === "控制符状态")!;
    expect(statusFilter.value).toBe("missing");
    expect(nodes.some((node) => node.textContent === "未命中项")).toBe(true);

    statusFilter.value = "all";
    statusFilter.onchange?.();
    nodes = findNodes(element.shadow, () => true);
    expect(nodes.some((node) => node.textContent === "命中项")).toBe(true);
    expect(nodes.some((node) => node.textContent === "未命中项")).toBe(true);
    expect(element.events).toHaveLength(0);

    nodes.find((node) => node.attributes.get("aria-label")?.startsWith("输出当前筛选并复制"))!.onclick?.();
    expect(element.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-output",
      detail: { scope: "visible", blockKeys: ["PARAM DECLARATION", "QT UPDATE DIALOG"] },
    });
  });

  it("行 checkbox 重绘后恢复焦点并保留命中筛选、Tree 展开与列表滚动位置", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlCatalog.js");
    const element = new browser.KtcCodegenControlCatalog() as unknown as FakeElement & { model: unknown };
    element.setAttribute("mode", "compact");
    element.model = {
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: "file:///Demo.json",
      fileName: "Demo.json",
      blocks: [{
        key: "PARAM DECLARATION", legacyId: 11, platform: "cpp", legacyState: "active", legacyCall: "",
        title: "命中项", controlWords: "PARAM DECLARATION", notes: "", status: "hit", hitCount: 1, artifactCount: 1,
      }],
      selectedBlockKeys: ["PARAM DECLARATION"],
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: true,
      missingTemplates: [],
      presets: { all: ["PARAM DECLARATION"], none: [], cppOnly: ["PARAM DECLARATION"], fieldCode: [] },
    };

    const before = findNodes(element.shadow, () => true);
    const list = before.find((node) => node.className === "list")!;
    list.scrollTop = 88;
    list.onscroll?.();
    const checkbox = before.find((node) => node.attributes.get("data-block-key") === "PARAM DECLARATION")!;
    checkbox.focus();
    checkbox.checked = false;
    checkbox.onchange?.();

    const after = findNodes(element.shadow, () => true);
    const nextCheckbox = after.find((node) => node.attributes.get("data-block-key") === "PARAM DECLARATION")!;
    expect(nextCheckbox).toBe(checkbox);
    expect(after.find((node) => node.className === "list")).toBe(list);
    expect(nextCheckbox.focused).toBe(true);
    expect(after.find((node) => node.className === "list")?.scrollTop).toBe(88);
    expect(after.find((node) => node.attributes.get("aria-label") === "控制符状态")?.value).toBe("hit");
    expect(after.find((node) => node.className === "group")?.open).toBe(true);
    expect(element.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-selection-change",
      detail: { blockKeys: [], singleMode: false },
    });

    element.model = {
      kind: "kt.codegen.control-view-model",
      schemaVersion: 1,
      uri: "file:///Demo.json",
      fileName: "Demo.json",
      blocks: [{
        key: "PARAM DECLARATION", legacyId: 11, platform: "cpp", legacyState: "active", legacyCall: "",
        title: "命中项", controlWords: "PARAM DECLARATION", notes: "", status: "hit", hitCount: 1, artifactCount: 1,
      }],
      selectedBlockKeys: [],
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: true,
      missingTemplates: [],
      presets: { all: ["PARAM DECLARATION"], none: [], cppOnly: ["PARAM DECLARATION"], fieldCode: [] },
    };
    const roundTrip = findNodes(element.shadow, () => true);
    const retainedCheckbox = roundTrip.find((node) => node.attributes.get("data-block-key") === "PARAM DECLARATION")!;
    expect(retainedCheckbox).toBe(checkbox);
    expect(retainedCheckbox.checked).toBe(false);
    expect(retainedCheckbox.focused).toBe(true);
    expect(retainedCheckbox.focusOptions).toBeUndefined();
    expect(roundTrip.find((node) => node.textContent === "命中项")).toBeTruthy();
    expect(roundTrip.find((node) => node.className === "list")?.scrollTop).toBe(88);
  });

  it("渲染 native 范围 combo 与固定一层 Tree，组复选框按可见项三态选择并保留本地筛选/折叠", async () => {
    vi.resetModules();
    installFakeDom();
    const browser = await import("./controlCatalog.js");
    const blocks = [
      {
        key: "CATALOG PARAMS", legacyId: 0, platform: "caa", legacyState: "active", legacyCall: "",
        title: "Catalog", controlWords: "CATALOG PARAMS", notes: "", status: "pending", hitCount: 0, artifactCount: 0,
      },
      {
        key: "PARAM CONSTRUCTOR", legacyId: 10, platform: "cpp", legacyState: "active", legacyCall: "",
        title: "Constructor", controlWords: "PARAM CONSTRUCTOR", notes: "", status: "pending", hitCount: 0, artifactCount: 0,
      },
      {
        key: "PARAM DECLARATION", legacyId: 11, platform: "cpp", legacyState: "active", legacyCall: "",
        title: "Declaration", controlWords: "PARAM DECLARATION", notes: "", status: "unselected", hitCount: 0, artifactCount: 0,
      },
      {
        key: "QT UPDATE DIALOG", legacyId: 17, platform: "qt", legacyState: "active", legacyCall: "",
        title: "Qt Dialog", controlWords: "QT UPDATE DIALOG", notes: "", status: "unselected", hitCount: 0, artifactCount: 0,
      },
      {
        key: "DLG SET ACTIVE FIELD", legacyId: 20, platform: "caa", legacyState: "legacy-deprecated", legacyCall: "",
        title: "Active Field", controlWords: "DLG SET ACTIVE FIELD", notes: "", status: "unselected", hitCount: 0, artifactCount: 0,
      },
    ] as const;
    const model = {
      kind: "kt.codegen.control-view-model" as const,
      schemaVersion: 1 as const,
      uri: "file:///Demo.json",
      fileName: "Demo.json",
      blocks,
      selectedBlockKeys: ["CATALOG PARAMS", "PARAM CONSTRUCTOR"] as const,
      singleSelectionMode: false,
      showMissingTemplates: false,
      preflightAvailable: false,
      missingTemplates: [],
      presets: {
        all: blocks.map((block) => block.key), none: [],
        cppOnly: ["PARAM CONSTRUCTOR", "PARAM DECLARATION"] as const,
        fieldCode: ["QT UPDATE DIALOG", "DLG SET ACTIVE FIELD"] as const,
      },
    };
    const element = new browser.KtcCodegenControlCatalog() as unknown as FakeElement & { model: typeof model };
    element.setAttribute("mode", "compact");
    element.model = model;

    let nodes = findNodes(element.shadow, () => true);
    const scope = nodes.find((node) => node.attributes.get("aria-label") === "控制符范围")!;
    expect(nodes.filter((node) => node.tagName === "select")).toHaveLength(1);
    expect(scope.tagName).toBe("select");
    expect(scope.value).toBe("all");
    expect(scope.children.map((option) => typeof option === "string" ? option : option.textContent)).toEqual([
      "全部类型", "C++ only", "Field Code",
    ]);

    const list = nodes.find((node) => node.attributes.get("role") === "tree")!;
    list.scrollTop = 87;
    list.onscroll?.();
    const groups = nodes.filter((node) => node.className === "group");
    expect(groups.map((group) => group.attributes.get("data-group-id"))).toEqual(["cpp", "qt", "caa"]);
    expect(nodes.filter((node) => node.className === "legacy-id").map((node) => node.textContent)).toEqual([
      "#10", "#11", "#17", "#0", "#20",
    ]);
    const style = nodes.find((node) => node.tagName === "style")!.textContent;
    expect(style).toContain(".legacy-id { justify-self: start; padding: 1px 4px;");
    expect(style).toContain("border-radius: 999px; font-size: 10px;");
    expect(style).toContain(':host([mode="compact"]) .row { grid-template-columns: 22px 34px');
    expect(style).toContain(':host([mode="compact"]) .filters { gap: 3px; padding: 3px 5px; }');
    expect(style).toContain('gap: 4px; min-height: 32px; padding: 2px 5px 2px 12px;');
    expect(style).toContain('border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border));');
    expect(style).toContain('button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border');
    expect(nodes.some((node) => node.textContent === "显示 2/2 · 可见已选 1/2")).toBe(true);
    expect(nodes.some((node) => node.className === "title" && node.textContent === "Active Field")).toBe(true);
    expect(nodes.filter((node) => node.className === "tag legacy inline-legacy").map((node) => node.textContent)).toEqual([
      "旧兼容",
    ]);
    expect(nodes.some((node) => node.className === "badges"
      && node.children.some((child) => typeof child !== "string" && child.textContent === "旧兼容"))).toBe(false);
    nodes.find((node) => node.attributes.get("aria-label")?.startsWith("输出当前筛选并复制"))!.onclick?.();
    expect(element.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-output",
      detail: {
        scope: "visible",
        blockKeys: [
          "CATALOG PARAMS", "PARAM CONSTRUCTOR", "PARAM DECLARATION",
          "QT UPDATE DIALOG", "DLG SET ACTIVE FIELD",
        ],
      },
    });
    const cppCheck = nodes.find((node) => node.attributes.get("aria-label") === "选择 C++ 当前可见控制符")!;
    expect(cppCheck.checked).toBe(false);
    expect(cppCheck.indeterminate).toBe(true);
    cppCheck.checked = true;
    cppCheck.onchange?.();
    expect(element.events.at(-1)).toMatchObject({
      type: "ktc-codegen-control-selection-change",
      detail: {
        blockKeys: ["CATALOG PARAMS", "PARAM CONSTRUCTOR", "PARAM DECLARATION"],
        singleMode: false,
      },
    });

    nodes = findNodes(element.shadow, () => true);
    const nextScope = nodes.find((node) => node.attributes.get("aria-label") === "控制符范围")!;
    nextScope.value = "cpp-only";
    nextScope.onchange?.();
    nodes = findNodes(element.shadow, () => true);
    const cpp = nodes.find((node) => node.attributes.get("data-group-id") === "cpp")!;
    cpp.open = false;
    cpp.ontoggle?.();
    element.model = {
      ...model,
      selectedBlockKeys: ["PARAM CONSTRUCTOR", "PARAM DECLARATION"],
    } as unknown as typeof model;
    nodes = findNodes(element.shadow, () => true);
    expect(nodes.find((node) => node.attributes.get("aria-label") === "控制符范围")?.value).toBe("cpp-only");
    expect(nodes.filter((node) => node.className === "group").map((node) => node.attributes.get("data-group-id"))).toEqual(["cpp"]);
    expect(nodes.find((node) => node.attributes.get("data-group-id") === "cpp")?.open).toBe(false);
    expect(nodes.find((node) => node.className === "selection-tools")).toBeUndefined();
    expect(nodes.find((node) => node.attributes.get("role") === "tree")?.scrollTop).toBe(87);
  });

  it("Primary 目录只保留选择与日志事件，full 外壳只承载预检结果", () => {
    const source = readFileSync(new URL("./controlCatalog.ts", import.meta.url), "utf8");
    const shellSource = readFileSync(new URL("./controlPanel.ts", import.meta.url), "utf8");
    expect(source).toContain(':host([mode="compact"])');
    expect(source).toContain('"ktc-codegen-control-selection-change"');
    expect(source).not.toContain('"ktc-codegen-control-display-change"');
    expect(source).toContain('"ktc-codegen-control-output"');
    expect(source).not.toContain("展开缺失模板");
    expect(source).toContain("输出当前筛选并复制");
    expect(source).toContain("输出${block.title}控制块到日志并复制可粘贴源码");
    expect(source).toContain(':host([mode="compact"]) .list { max-height: 236px; overflow-y: auto; }');
    expect(source).toContain(':host([mode="full"]) .list { flex: 0 0 auto; min-block-size: 0; max-height: none; overflow: visible; }');
    expect(shellSource).toContain(':host([mode="full"]) { block-size: auto; min-block-size: 0; overflow: visible; }');
    expect(shellSource).toContain('.result-detail { display: flex; position: sticky;');
    expect(shellSource).toContain('.result-list { min-width: 0; overflow-y: visible; }');
    expect(shellSource).toContain('role", "separator"');
    expect(shellSource).toContain('"显示路径"');
    expect(source).toContain("::-webkit-scrollbar-thumb");
    expect(source).toContain('document.createElement("select")');
    expect((source.match(/document\.createElement\("select"\)/gu) ?? [])).toHaveLength(2);
    expect(source).toContain('data-group-id');
    expect(source.indexOf("this.root.replaceChildren(style, filters, fragment);")).toBeLessThan(
      source.indexOf("list.scrollTop = this.listScrollTop;"),
    );
    expect(source).not.toContain("acquireVsCodeApi");
  });
});
