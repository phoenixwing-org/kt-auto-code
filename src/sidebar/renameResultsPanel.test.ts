import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcRenameResultsPanelModel } from "./renameResultsPanel.js";

class FakeNode {
  readonly children: FakeNode[] = []; readonly attributes = new Map<string, string>();
  className = ""; textContent = ""; title = ""; type = ""; onclick?: () => void;
  constructor(readonly tagName = "") {}
  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}
class FakeElement extends FakeNode {
  readonly events: Array<{ type: string; detail: unknown }> = []; readonly shadow = new FakeNode("shadow-root"); readonly isConnected = true;
  attachShadow(): FakeNode { return this.shadow; }
  dispatchEvent(event: { type: string; detail: unknown }): boolean { this.events.push(event); return true; }
}
function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
    createTextNode: (text: string) => { const node = new FakeNode("#text"); node.textContent = text; return node; },
  });
  vi.stubGlobal("CustomEvent", class<T> { constructor(public readonly type: string, public readonly init: { detail: T }) {} get detail(): T { return this.init.detail; } });
  vi.stubGlobal("customElements", { get: (name: string) => registry.get(name), define: (name: string, value: CustomElementConstructor) => registry.set(name, value) });
  return registry;
}
function nodes(root: FakeNode, predicate: (node: FakeNode) => boolean): FakeNode[] {
  return [...(predicate(root) ? [root] : []), ...root.children.flatMap((child) => nodes(child, predicate))];
}

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("rename results panel", () => {
  it("注册 Wing 组件并把打开路径/行号作为语义事件发出", async () => {
    const registry = installFakeDom(); const component = await import("./renameResultsPanel.js");
    const ctor = component.ktcDefineRenameResultsPanel();
    expect(registry.get("ktc-rename-results-panel")).toBe(ctor);
    const element = new component.KtcRenameResultsPanel() as unknown as FakeElement & { model: KtcRenameResultsPanelModel };
    element.model = {
      rows: [{ id: "hit-1", level: "text", levelLabel: "文本", relativePath: "src/OldName.cpp", sourceName: "OldName.cpp", sourceAddress: "src", targetOrPositionLabel: "L12", originalPath: "/repo/src/OldName.cpp", plannedPath: "/repo/src/NewName.cpp", openPath: "/repo/src/OldName.cpp", openLine: 12, occurrences: 2, encodingLabel: "UTF-8", status: "preview", statusLabel: "预览", statusTone: "neutral", sourceHighlightTerms: ["OldName"], editorHighlightTerms: ["OldName"] }],
      capabilities: { open: true },
    };
    expect(nodes(element.shadow, (node) => node.tagName === "mark" && node.textContent === "OldName")).toHaveLength(1);
    nodes(element.shadow, (node) => node.attributes.get("aria-label") === "打开并定位")[0]!.onclick?.();
    expect(element.events[0]?.detail).toEqual({ kind: "open", id: "hit-1", path: "/repo/src/OldName.cpp", line: 12 });
  });
});
