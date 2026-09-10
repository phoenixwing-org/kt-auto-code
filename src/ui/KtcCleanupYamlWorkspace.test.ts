// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ktcDefineCleanupYamlWorkspace, type KtcCleanupYamlWorkspace } from "./KtcCleanupYamlWorkspace.js";
ktcDefineCleanupYamlWorkspace();
afterEach(() => document.body.replaceChildren());
function create() {
  const element = document.createElement("ktc-cleanup-yaml-workspace") as KtcCleanupYamlWorkspace;
  element.model = { sources: [{ id: "a", revision: 3, path: "/sample/a/cleanup.yaml", root: "/sample/a" }, { id: "b", revision: 1, path: "/sample/b/cleanup.yaml", root: "/sample/b", disabledReason: "规则无效" }], busy: false };
  document.body.append(element);
  const callback = vi.fn(); element.addEventListener("ktc-cleanup-yaml-action", callback);
  return { element, root: element.shadowRoot!, callback };
}
describe("YAML workspace view", () => {
  it("只有可折叠来源列表与每行按钮，不重复Header操作，清理只发ID与revision", () => {
    const { root, callback } = create();
    expect(root.children[1]?.tagName).toBe("DETAILS");
    expect(root.querySelector("summary")?.textContent).toBe("配置 YAML 列表 · 2");
    expect(root.querySelector('[role="toolbar"]')).toBeNull();
    expect(root.querySelector('[data-focus="edit-rules"], [data-focus="discover"]')).toBeNull();
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(root.querySelector("input,textarea,form")).toBeNull();
    expect(Array.from(root.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["打开", "清理", "打开", "清理"]);
    (root.querySelector('[data-focus="source-clean:a"]') as HTMLButtonElement).click();
    expect(callback.mock.calls[0]?.[0].detail).toEqual({ kind: "clean-source", sourceId: "a", revision: 3 });
    expect((root.querySelector('[data-focus="source-clean:b"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it("来源打开只发ID，语义事件冒泡到dialog；busy守卫也拒绝程序click，文本不解析HTML", () => {
    const { element, root, callback } = create();
    const parent = document.createElement("section"); document.body.append(parent); parent.append(element);
    const received = vi.fn(); parent.addEventListener("ktc-cleanup-yaml-action", received);
    (root.querySelector('[data-focus="source-open:a"]') as HTMLButtonElement).click();
    expect(callback.mock.calls[0]?.[0].detail).toEqual({ kind: "open-source", sourceId: "a" });
    expect(received).toHaveBeenCalledOnce();
    expect(received.mock.calls[0]?.[0]).toMatchObject({ bubbles: true, composed: true });
    element.model = { ...element.model, busy: true, notice: '<img src="x" onerror="alert(1)">' };
    for (const button of Array.from(root.querySelectorAll("button"))) {
      expect(button.disabled).toBe(true);
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    expect(callback).toHaveBeenCalledTimes(1); expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".notice")?.textContent).toBe('<img src="x" onerror="alert(1)">');
  });
  it("summary文字区域可折叠，model更新、busy及重新挂载保持展开状态", () => {
    const { element, root, callback } = create();
    const block = () => root.querySelector("details")!;
    const summary = root.querySelector("summary")!;
    const text = document.createElement("span"); text.textContent = summary.textContent;
    summary.replaceChildren(text); text.click();
    expect(block().open).toBe(false);
    element.model = { ...element.model, busy: true, notice: "探测完成" };
    expect(block().open).toBe(false);
    element.remove(); document.body.append(element);
    expect(block().open).toBe(false);
    root.querySelector("summary")!.click();
    expect(block().open).toBe(true);
    element.model = { sources: [], busy: false };
    expect(block().open).toBe(true);
    expect(root.querySelector("summary")!.textContent).toContain("0");
    expect(root.querySelectorAll("button")).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
  });
  it("同一来源刷新时保持行操作焦点，路径和状态仅作文本呈现", () => {
    const { element, root } = create();
    root.querySelector<HTMLButtonElement>('[data-focus="source-open:a"]')!.focus();
    element.model = { ...element.model, sources: element.model.sources.map((source) => ({ ...source,
      path: '<svg onload="alert(1)">', status: '<img src="x">' })) };
    expect((root.activeElement as HTMLElement)?.dataset.focus).toBe("source-open:a");
    expect(root.querySelector("svg,img")).toBeNull();
    expect(root.querySelector(".path")?.textContent).toBe('<svg onload="alert(1)">');
  });
});
