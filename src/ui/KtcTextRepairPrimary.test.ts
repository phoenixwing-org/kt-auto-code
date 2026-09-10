// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  KTC_TEXT_REPAIR_PRIMARY_ACTION,
  KtcTextRepairPrimary,
  ktcDefineTextRepairPrimary,
  type KtcTextRepairPrimaryAction,
  type KtcTextRepairPrimaryModel,
} from "./KtcTextRepairPrimary.js";

afterEach(() => document.body.replaceChildren());

const model: KtcTextRepairPrimaryModel = {
  kind: "headerAscii", directory: "/workspace", busy: false, scanEnabled: true, writeEnabled: true,
  scope: { includeHeaders: true, includeSource: true, includeMarkdown: false },
  preserveGbk: false, stripBom: false, showDetails: false, targetEncoding: "utf8", targetSummary: "继承默认目标",
  status: "准备就绪", summary: "1 个样例", emptyMessage: "没有结果",
  rows: [{ id: "sample", relativePath: "include/Example.h", fullPath: "/workspace/include/Example.h", line: 9,
    badge: "L9 ×1", tone: "warning", detail: "BOM EF BB BF", issues: [{ line: 9, column: 3, from: "“", to: '"' }] }],
};

function setup(overrides: Partial<KtcTextRepairPrimaryModel> = {}) {
  ktcDefineTextRepairPrimary();
  const view = document.createElement("ktc-text-repair-primary");
  const actions: KtcTextRepairPrimaryAction[] = [];
  const projected = { ...model, ...overrides };
  view.model = projected;
  const outer = document.createElement("div");
  outer.addEventListener(KTC_TEXT_REPAIR_PRIMARY_ACTION, event => actions.push((event as CustomEvent<KtcTextRepairPrimaryAction>).detail));
  outer.append(view); document.body.append(outer);
  const root = view.shadowRoot!;
  const bar = root.querySelector("ktc-primary-action-bar")!;
  return { view, root, actions, bar, projected,
    button: (label: string) => Array.from(bar.shadowRoot!.querySelectorAll("button")).find(button => button.textContent === label)!,
    option: (label: string) => root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!,
  };
}

describe("KtcTextRepairPrimary", () => {
  it("ASCII 首行共用文字 ActionBar，保留范围、GBK、BOM、详情；不增加目录或外层 Header", () => {
    const { root, button, option, bar } = setup();
    expect(root.firstElementChild?.nextElementSibling).toBe(bar);
    expect(Array.from(bar.shadowRoot!.querySelectorAll("button"), button => button.textContent)).toEqual(["预检", "修复"]);
    expect(button("修复").disabled).toBe(false);
    expect(option("头文件").checked).toBe(true);
    expect(option(".md 文档").parentElement!.hidden).toBe(true);
    expect(option(".md 文档").disabled).toBe(true);
    expect(option("保留 GBK 中文注释").checked).toBe(false);
    expect(option("去除 BOM（含 UTF-8 BOM / UTF-16）→ UTF-8").checked).toBe(false);
    expect(root.textContent).toContain("纯 ASCII：替换非 ASCII 内容（包括中文）");
    expect(root.querySelectorAll("ktc-directory-bar,ktc-current-tool-region,header")).toHaveLength(0);
    expect(root.querySelector("style")!.textContent).toContain("var(--vscode-foreground)");
    expect(root.querySelector("style")!.textContent).toContain("padding:6px 8px");
  });

  it("编码保留默认目标、Markdown、更多设置和检测详情；只发序列化意图", () => {
    const { root, button, option, actions } = setup({ kind: "encodingFix", scope: { ...model.scope, includeMarkdown: true } });
    expect(option(".md 文档").parentElement!.hidden).toBe(false);
    expect(option("保留 GBK 中文注释").parentElement!.hidden).toBe(true);
    button("预检").click(); button("转换").click(); button("更多设置").click();
    const target = root.querySelector("select")!; target.value = "gbk"; target.dispatchEvent(new Event("change"));
    option(".md 文档").click(); option("显示详细（BOM 十六进制、检测说明）").click();
    expect(actions).toEqual([
      { action: "scan" }, { action: "convert" }, { action: "settings" }, { action: "setTarget", value: "gbk" },
      { action: "setScope", key: "includeMarkdown", value: false }, { action: "setOption", key: "showDetails", value: true },
    ]);
    expect(() => structuredClone(actions)).not.toThrow();
  });

  it("路径单一省略容器与右侧 badge；文件/问题行均保留定位动作，用户文本不作为 HTML", () => {
    const { root, actions } = setup({ showDetails: true, rows: [{ ...model.rows[0]!, relativePath: "include/<unsafe>.h", fullPath: "/workspace/<unsafe>.h", issues: [{ line: 11, column: 7, from: "<script>", to: "&" }] }] });
    expect(root.querySelectorAll(".ktc-compact-label")).toHaveLength(1);
    expect(root.querySelector(".ktc-compact-label")!.textContent).toBe("<unsafe>.h · include");
    const open = root.querySelector<HTMLButtonElement>(".open")!;
    expect(open.title).toBe("/workspace/<unsafe>.h");
    expect(open.getAttribute("aria-label")).toContain("/workspace/<unsafe>.h");
    expect(root.querySelectorAll("script,unsafe")).toHaveLength(0);
    open.click(); root.querySelector<HTMLButtonElement>(".issues button")!.click();
    expect(actions).toEqual([{ action: "open", rowId: "sample", line: 9 }, { action: "open", rowId: "sample", line: 11 }]);
    expect(root.querySelector(".issues button")!.textContent).toBe("L11:C7 <script> → &");
  });

  it("状态投影和详情切换不重建输入或结果，保留焦点", () => {
    const { view, root, projected, option } = setup();
    const input = option("保留 GBK 中文注释"), result = root.querySelector(".result");
    input.focus();
    view.model = { ...projected, status: "完成", showDetails: true, preserveGbk: true };
    expect(root.activeElement).toBe(input);
    expect(option("保留 GBK 中文注释")).toBe(input);
    expect(root.querySelector(".result")).toBe(result);
    expect(root.querySelector<HTMLElement>(".issues")!.hidden).toBe(false);
    expect(root.textContent).toContain("GBK 中文保留");
    view.model = { ...projected, showDetails: false };
    expect(root.querySelector<HTMLElement>(".issues")!.hidden).toBe(true);
  });

  it("busy 同时禁用动作/选项/定位，合成点击不转发；缺少范围说明挂可悬停外层", () => {
    const { view, root, actions, button, option, projected } = setup({ busy: true, showDetails: true });
    expect(view.getAttribute("aria-busy")).toBe("true");
    button("修复").dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    option("保留 GBK 中文注释").dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".open")!.dispatchEvent(new MouseEvent("click"));
    root.querySelector<HTMLButtonElement>(".issues button")!.dispatchEvent(new MouseEvent("click"));
    expect(actions).toEqual([]);
    expect(option("头文件").disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>(".open")!.disabled).toBe(true);
    view.model = { ...projected, busy: false, scanEnabled: false, writeEnabled: false, disabledReason: "请先选择目录。" };
    expect(button("修复").disabled).toBe(true);
    expect(button("修复").parentElement!.title).toBe("请先选择目录。");
    expect(button("修复").getAttribute("aria-describedby")).toBeTruthy();
  });

  it("升级前 model 可恢复，空结果有明确说明", () => {
    ktcDefineTextRepairPrimary();
    const view = new KtcTextRepairPrimary();
    Object.defineProperty(view, "model", { configurable: true, value: { ...model, rows: [], emptyMessage: "未发现非 ASCII 或问题字节。" } });
    document.body.append(view);
    expect(Object.prototype.hasOwnProperty.call(view, "model")).toBe(false);
    expect(view.shadowRoot!.querySelector(".empty")!.textContent).toBe("未发现非 ASCII 或问题字节。");
    expect(view.shadowRoot!.querySelector('[role="status"]')!.textContent).toBe("准备就绪");
  });

  it("正式错误和非 ASCII 文件名高亮通过模型投影，不把路径或消息作为 HTML", () => {
    const { root } = setup({ status: "读取失败 <permission>", statusTone: "error", rows: [
      { ...model.rows[0]!, relativePath: "中文目录/<客户名>.h", tone: "error", highlightNonAscii: true },
    ] });
    expect(root.querySelector(".status")!.classList.contains("error")).toBe(true);
    expect(root.querySelector(".badge")!.classList.contains("error")).toBe(true);
    expect(root.querySelector("mark.result-hit")!.textContent).toBe("客户名");
    expect(root.querySelector(".ktc-compact-label")!.textContent).toBe("<客户名>.h · 中文目录");
    expect(root.querySelectorAll("permission")).toHaveLength(0);
    expect(Array.from(root.querySelectorAll("*")).some(node => node.localName === "客户名")).toBe(false);
    expect(root.querySelector("style")!.textContent).toContain(".status.error,.badge.error { color:var(--vscode-errorForeground)");
    expect(root.querySelector("style")!.textContent).toContain("color:inherit; background:var(--vscode-editor-findMatchBackground");
    const empty = setup({ rows: [], emptyMessage: "", status: "正在预检…", busy: true });
    expect(empty.root.querySelector<HTMLElement>(".empty")!.hidden).toBe(true);
  });
});
