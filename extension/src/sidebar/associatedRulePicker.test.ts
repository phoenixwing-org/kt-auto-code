import { afterEach, describe, expect, it, vi } from "vitest";
import { ktcCreateAssociatedRulePicker } from "../tools/codeRename/associatedRulePicker.js";
import type { KtcAssociatedRulePickerState } from "../tools/types.js";

interface FakeEvent {
  readonly key?: string;
  preventDefault(): void;
  stopPropagation(): void;
}

type FakeListener = (event: FakeEvent) => void;

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, FakeListener[]>();
  className = "";
  id = "";
  textContent = "";
  title = "";
  type = "";
  value = "";
  placeholder = "";
  checked = false;
  disabled = false;
  open = false;
  focused = false;
  showModalCalls = 0;
  closeCalls = 0;
  onclick?: () => void;
  onchange?: () => void;
  oninput?: () => void;
  onkeydown?: (event: FakeEvent) => void;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  focus(): void { this.focused = true; }
  showModal(): void { this.open = true; this.showModalCalls += 1; }
  close(): void { this.open = false; this.closeCalls += 1; }
  addEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, event: FakeEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeElement extends FakeNode {
  readonly events: Array<{
    type: string;
    detail: unknown;
    bubbles: boolean;
    composed: boolean;
  }> = [];
  readonly shadow = new FakeNode("shadow-root");
  readonly isConnected = true;
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: {
    type: string;
    detail: unknown;
    bubbles?: boolean;
    composed?: boolean;
  }): boolean {
    this.events.push({
      type: event.type,
      detail: event.detail,
      bubbles: Boolean(event.bubbles),
      composed: Boolean(event.composed),
    });
    return true;
  }
}

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
  });
  vi.stubGlobal("CustomEvent", class<T> {
    readonly detail: T;
    readonly bubbles: boolean;
    readonly composed: boolean;
    constructor(
      public readonly type: string,
      init: { detail: T; bubbles?: boolean; composed?: boolean },
    ) {
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
  for (const child of root.children) found.push(...findNodes(child, predicate));
  return found;
}

function picker(mode: "custom" | "common" | "caa"): KtcAssociatedRulePickerState {
  return ktcCreateAssociatedRulePicker({
    mode,
    search: "AutoCode",
    replace: "TomBuild",
    sourcePrefix: "KTC",
    targetPrefix: "KTM",
    existingRules: [],
  });
}

function fakeEvent(key?: string): FakeEvent & {
  readonly prevented: ReturnType<typeof vi.fn>;
  readonly stopped: ReturnType<typeof vi.fn>;
} {
  const prevented = vi.fn();
  const stopped = vi.fn();
  return { key, preventDefault: prevented, stopPropagation: stopped, prevented, stopped };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("associated rule picker web component", () => {
  it("幂等注册且组件不拥有 Host 消息与去重上下文", async () => {
    const registry = installFakeDom();
    const browser = await import("./associatedRulePicker.js");
    const first = browser.ktcDefineAssociatedRulePicker();
    const second = browser.ktcDefineAssociatedRulePicker();
    expect(registry.get("ktc-associated-rule-picker")).toBe(first);
    expect(second).toBe(first);
    expect(browser.KtcAssociatedRulePicker.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|primarySearch|existingRules|workspace\.fs|clipboard/,
    );
  });

  it.each([
    ["common", [true, true]],
    ["caa", [true, true, false, false]],
    ["custom", [false, false, false, false, false, false]],
  ] as const)("把 %s 候选默认勾选投影到 Shadow DOM", async (mode, expected) => {
    installFakeDom();
    const browser = await import("./associatedRulePicker.js");
    const element = new browser.KtcAssociatedRulePicker() as unknown as FakeElement & {
      openPicker(model: KtcAssociatedRulePickerState): void;
    };
    element.openPicker(picker(mode));
    const checks = findNodes(
      element.shadow,
      (node) => node.dataset.ruleIndex !== undefined,
    ).map((node) => node.checked);
    const confirm = findNodes(element.shadow, (node) => node.textContent === "添加")[0]!;
    expect(checks).toEqual(expected);
    expect(confirm.disabled).toBe(!expected.some(Boolean));
  });

  it("自定义 Source 自动勾选、保留原始值并只发 confirm", async () => {
    installFakeDom();
    const browser = await import("./associatedRulePicker.js");
    const element = new browser.KtcAssociatedRulePicker() as unknown as FakeElement & {
      openPicker(model: KtcAssociatedRulePickerState): void;
    };
    element.openPicker({ title: "添加自定义规则", candidates: [] });
    const enabled = findNodes(element.shadow, (node) => node.dataset.customEnabled !== undefined)[0]!;
    const search = findNodes(element.shadow, (node) => node.dataset.customSearch !== undefined)[0]!;
    const replace = findNodes(element.shadow, (node) => node.dataset.customReplace !== undefined)[0]!;
    const confirm = findNodes(element.shadow, (node) => node.textContent === "添加")[0]!;
    expect(search.focused).toBe(true);
    expect(confirm.disabled).toBe(true);

    search.value = "   ";
    search.oninput?.();
    expect(enabled.checked).toBe(false);
    expect(confirm.disabled).toBe(true);

    search.value = "  ManualSource  ";
    replace.value = "ManualTarget";
    search.oninput?.();
    expect(enabled.checked).toBe(true);
    expect(confirm.disabled).toBe(false);
    confirm.onclick?.();

    expect(element.events).toEqual([{
      type: "ktc-associated-rule-picker-action",
      bubbles: true,
      composed: true,
      detail: {
        kind: "confirm",
        rules: [{
          id: expect.stringMatching(/^custom-\d+$/),
          search: "  ManualSource  ",
          replace: "ManualTarget",
          enabled: true,
          source: "user",
          relationKind: "custom",
        }],
      },
    }]);
    const dialog = findNodes(element.shadow, (node) => node.tagName === "dialog")[0]!;
    expect(dialog.open).toBe(false);
    expect(dialog.closeCalls).toBe(1);
  });

  it("重复打开不重复 showModal 且刷新时不泄漏自定义草稿", async () => {
    installFakeDom();
    const browser = await import("./associatedRulePicker.js");
    const element = new browser.KtcAssociatedRulePicker() as unknown as FakeElement & {
      openPicker(model: KtcAssociatedRulePickerState): void;
    };
    const empty = { title: "添加自定义规则", candidates: [] } satisfies KtcAssociatedRulePickerState;
    element.openPicker(empty);
    let search = findNodes(element.shadow, (node) => node.dataset.customSearch !== undefined)[0]!;
    search.value = "OldDraft";
    search.oninput?.();
    element.openPicker(empty);

    const dialog = findNodes(element.shadow, (node) => node.tagName === "dialog")[0]!;
    search = findNodes(element.shadow, (node) => node.dataset.customSearch !== undefined)[0]!;
    const confirm = findNodes(element.shadow, (node) => node.textContent === "添加")[0]!;
    expect(dialog.showModalCalls).toBe(1);
    expect(search.value).toBe("");
    expect(confirm.disabled).toBe(true);
  });

  it("右上关闭、取消与 Escape 各发一次 cancel，输入 Enter 只拦截", async () => {
    installFakeDom();
    const browser = await import("./associatedRulePicker.js");
    const element = new browser.KtcAssociatedRulePicker() as unknown as FakeElement & {
      openPicker(model: KtcAssociatedRulePickerState): void;
    };
    const model = { title: "添加关联规则", candidates: [] } satisfies KtcAssociatedRulePickerState;
    const dialog = () => findNodes(element.shadow, (node) => node.tagName === "dialog")[0]!;

    element.openPicker(model);
    findNodes(element.shadow, (node) => node.textContent === "×")[0]!.onclick?.();
    element.openPicker(model);
    findNodes(element.shadow, (node) => node.textContent === "取消")[0]!.onclick?.();
    element.openPicker(model);
    const escape = fakeEvent("Escape");
    dialog().emit("cancel", escape);

    expect(escape.prevented).toHaveBeenCalledOnce();
    expect(element.events).toEqual([
      { type: "ktc-associated-rule-picker-action", bubbles: true, composed: true, detail: { kind: "cancel" } },
      { type: "ktc-associated-rule-picker-action", bubbles: true, composed: true, detail: { kind: "cancel" } },
      { type: "ktc-associated-rule-picker-action", bubbles: true, composed: true, detail: { kind: "cancel" } },
    ]);
    expect(dialog().closeCalls).toBe(3);

    element.openPicker(model);
    const search = findNodes(element.shadow, (node) => node.dataset.customSearch !== undefined)[0]!;
    const enter = fakeEvent("Enter");
    search.onkeydown?.(enter);
    expect(enter.prevented).toHaveBeenCalledOnce();
    expect(enter.stopped).toHaveBeenCalledOnce();
    const target = findNodes(element.shadow, (node) => node.dataset.customReplace !== undefined)[0]!;
    const targetEnter = fakeEvent("Enter");
    target.onkeydown?.(targetEnter);
    expect(targetEnter.prevented).toHaveBeenCalledOnce();
    expect(targetEnter.stopped).toHaveBeenCalledOnce();
    expect(element.events).toHaveLength(3);
  });
});
