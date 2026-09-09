import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KtcRightViewShellModel } from "./KtcRightViewShell.js";

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  className = "";
  id = "";
  name = "";
  textContent = "";
  title = "";
  hidden = false;

  constructor(readonly tagName = "") {}

  append(...nodes: FakeNode[]): void { this.children.push(...nodes); }
  replaceChildren(...nodes: FakeNode[]): void { this.children.splice(0, this.children.length, ...nodes); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

class FakeElement extends FakeNode {
  readonly shadow = new FakeNode("shadow-root");
  attachShadow(): FakeNode { return this.shadow; }
}

function installFakeDom(): Map<string, CustomElementConstructor> {
  const registry = new Map<string, CustomElementConstructor>();
  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeNode(tagName),
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
  root.children.forEach((child) => found.push(...findNodes(child, predicate)));
  return found;
}

function byClass(root: FakeNode, className: string): FakeNode {
  return findNodes(root, (node) => node.className.split(/\s+/u).includes(className))[0]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KtcRightViewShell", () => {
  it("幂等注册并渲染贴边固定 Header、标题、actions 与默认内容插槽", async () => {
    const registry = installFakeDom();
    const browser = await import("./KtcRightViewShell.js");
    expect(browser.ktcDefineRightViewShell()).toBe(browser.ktcDefineRightViewShell());
    expect(registry.get("ktc-right-view-shell")).toBe(browser.KtcRightViewShell);

    const element = new browser.KtcRightViewShell() as unknown as FakeElement & {
      model: KtcRightViewShellModel;
    };
    element.model = { title: "  编译工具  " };

    expect(byClass(element.shadow, "title").textContent).toBe("编译工具");
    expect(byClass(element.shadow, "context").textContent).toBe("未关联目录");
    expect(byClass(element.shadow, "context").title).toBe("未关联目录");
    expect(byClass(element.shadow, "shell").attributes.get("aria-labelledby")).toBe("ktc-right-view-title");
    expect(byClass(element.shadow, "main").attributes.get("aria-label")).toBe("编译工具内容");
    const slots = findNodes(element.shadow, (node) => node.tagName === "slot");
    expect(slots).toHaveLength(2);
    expect(slots.find((slot) => slot.name === "actions")).toBeTruthy();
    expect(slots.find((slot) => !slot.name)).toBeTruthy();
    expect(findNodes(element.shadow, (node) => node.className === "subtitle")).toHaveLength(0);

    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain("grid-template-rows:44px minmax(0,1fr)");
    expect(style).toContain("border-bottom:1px solid");
    expect(style).toContain(":host([hidden]) { display:none !important; }");
    expect(style).toContain(".shell {\n    display:grid; width:100%; height:100%");
    expect(style).toContain("margin:0; padding:0");
    expect(style).toContain(".main {\n    width:100%; height:100%");
    expect(style).toContain(".heading {\n    display:flex; min-width:0; flex:1 1 auto");
    expect(style).toContain("text-overflow:ellipsis; white-space:nowrap");
    expect(style).toContain("max-width:60%; flex:0 0 auto");
  });

  it.each([
    ["/workspace/Phoenix/projects/", "projects @ /workspace/Phoenix"],
    ["/workspace", "workspace @ /"],
    ["C:\\Phoenix\\projects\\", "projects @ C:\\Phoenix"],
    ["C:\\Phoenix", "Phoenix @ C:\\"],
    ["C:/Phoenix/projects", "projects @ C:/Phoenix"],
    ["C:/Phoenix", "Phoenix @ C:/"],
    ["C:\\", "C:\\ @ C:\\"],
    ["\\\\server\\share\\project", "project @ \\\\server\\share"],
    ["project", "project @ ."],
  ])("跨平台格式化 %s 为目录名与父路径", async (contextPath, expectedLabel) => {
    installFakeDom();
    const browser = await import("./KtcRightViewShell.js");
    expect(browser.ktcFormatRightViewContextPath(contextPath)).toEqual({
      label: expectedLabel,
      title: contextPath,
    });
  });

  it("目录上下文与工具标题独立，完整路径仅进入 title，并可由消费者明确隐藏", async () => {
    installFakeDom();
    const browser = await import("./KtcRightViewShell.js");
    const element = new browser.KtcRightViewShell() as unknown as FakeElement & {
      model: KtcRightViewShellModel;
    };
    element.model = { title: "项目改名", contextPath: "/workspace/Phoenix/projects" };
    expect(byClass(element.shadow, "title").textContent).toBe("项目改名");
    expect(byClass(element.shadow, "title").title).toBe("项目改名");
    expect(byClass(element.shadow, "context").textContent).toBe("projects @ /workspace/Phoenix");
    expect(byClass(element.shadow, "context").title).toBe("/workspace/Phoenix/projects");
    expect(byClass(element.shadow, "context").attributes.get("aria-label")).toBe(
      "关联目录：/workspace/Phoenix/projects",
    );

    element.model = { title: "项目改名", contextPath: "/workspace/Phoenix/projects", hideContext: true };
    expect(findNodes(element.shadow, (node) => node.className === "context")).toHaveLength(0);
  });

  it("相同规范化模型重复赋值时不重建 Shadow，避免无关业务状态打断 Header 操作", async () => {
    installFakeDom();
    const browser = await import("./KtcRightViewShell.js");
    const element = new browser.KtcRightViewShell() as unknown as FakeElement & {
      model: KtcRightViewShellModel;
    };
    element.model = { title: "  项目改名 ", contextPath: " /workspace/project " };
    const header = byClass(element.shadow, "header");
    element.model = { title: "项目改名", contextPath: "/workspace/project", hideContext: false };
    expect(byClass(element.shadow, "header")).toBe(header);
  });

  it.each([
    [undefined, "scroll-vertical", "overflow-x:hidden; overflow-y:auto", true],
    ["vertical", "scroll-vertical", "overflow-x:hidden; overflow-y:auto", true],
    ["both", "scroll-both", ".scroll-both { overflow:auto; }", true],
    ["none", "scroll-none", ".scroll-none { overflow:hidden; }", false],
  ] as const)("scrollMode=%s 使用对应滚动边界", async (scrollMode, className, css, keyboardScrollable) => {
    installFakeDom();
    const browser = await import("./KtcRightViewShell.js");
    const element = new browser.KtcRightViewShell() as unknown as FakeElement & {
      model: KtcRightViewShellModel;
    };
    element.model = { title: "结果", ...(scrollMode ? { scrollMode } : {}) };
    const main = byClass(element.shadow, "main");
    expect(main.className).toContain(className);
    expect(main.attributes.has("tabindex")).toBe(keyboardScrollable);
    const style = findNodes(element.shadow, (node) => node.tagName === "style")[0]!.textContent;
    expect(style).toContain(css);
  });

  it("安全复制、规范化并冻结输入，非法值回退为可访问默认值", async () => {
    installFakeDom();
    const browser = await import("./KtcRightViewShell.js");
    const element = new browser.KtcRightViewShell() as unknown as FakeElement & {
      model: KtcRightViewShellModel;
    };
    const input = {
      title: "  构建结果  ",
      contextPath: "  C:\\Phoenix\\projects  ",
      scrollMode: "both" as const,
    };
    element.model = input;
    input.title = "被外部修改";
    expect(element.model).toEqual({
      title: "构建结果",
      contextPath: "C:\\Phoenix\\projects",
      hideContext: false,
      scrollMode: "both",
    });
    expect(Object.isFrozen(element.model)).toBe(true);

    element.model = { title: "  ", scrollMode: "invalid" as "vertical" };
    expect(element.model).toEqual({
      title: "Right View",
      contextPath: "",
      hideContext: false,
      scrollMode: "vertical",
    });
    expect(byClass(element.shadow, "main").attributes.get("aria-label")).toBe("Right View内容");
  });

  it("组件不依赖 VS Code、Host 状态、存储或业务模块", async () => {
    installFakeDom();
    const browser = await import("./KtcRightViewShell.js");
    expect(browser.KtcRightViewShell.toString()).not.toMatch(
      /acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage/iu,
    );
    const source = readFileSync(new URL("./KtcRightViewShell.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^import\s/mu);
    expect(source).not.toMatch(
      /\b(?:acquireVsCodeApi|postMessage|workspaceState|globalState|localStorage|sessionStorage|Controller|Service|Registry)\b/u,
    );
  });
});
