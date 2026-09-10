// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KTC_PRIMARY_ACTION_BAR_ACTION,
  KtcPrimaryActionBar,
  ktcCreatePrimaryActionBar,
  ktcDefinePrimaryActionBar,
  type KtcPrimaryActionBarActionDetail,
  type KtcPrimaryActionBarModel,
} from "./KtcPrimaryActionBar.js";

afterEach(() => document.body.replaceChildren());

const model: KtcPrimaryActionBarModel = {
  label: "编译操作",
  actions: [
    { id: "open", label: "打开", enabled: true, title: "打开配置" },
    { id: "save", label: "保存", enabled: false, title: "当前配置没有变化" },
    { id: "run", label: "启动", enabled: true, primary: true },
  ],
};

describe("KtcPrimaryActionBar", () => {
  it("按模型顺序渲染紧凑文字按钮，并使用 group 语义和主题样式", () => {
    ktcDefinePrimaryActionBar();
    const bar = document.createElement("ktc-primary-action-bar");
    bar.model = model;
    document.body.append(bar);
    const root = bar.shadowRoot!;
    const group = root.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("编译操作");
    expect(Array.from(root.querySelectorAll("button"), (button) => button.textContent)).toEqual(["打开", "保存", "启动"]);
    expect(root.querySelectorAll("svg,img,[class*=icon]")).toHaveLength(0);
    expect(root.querySelectorAll("button")[2]?.classList.contains("is-primary")).toBe(true);
    const style = root.querySelector("style")!.textContent;
    expect(style).toContain("font: var(--vscode-font-size, 13px)/16px");
    expect(style).toContain("flex-wrap: wrap");
    expect(style).toContain("gap: 4px");
    expect(style).toContain("padding: 5px 8px");
    expect(style).toContain("min-height: 30px");
    expect(style).toContain("white-space: nowrap");
    expect(style).toContain("border-bottom: 1px solid var(--vscode-panel-border)");
    expect(style).toContain("var(--vscode-button-secondaryBackground");
    // High Contrast themes may use black for both button and page backgrounds.
    // Keep the shared theme border rather than hiding the primary outline.
    expect(style).toContain("border: 1px solid var(--vscode-button-border, var(--vscode-panel-border))");
    expect(style).not.toContain("border-color: var(--vscode-button-background)");
    expect(style).toContain("@media (forced-colors: active)");
    expect(style).not.toContain("border-radius");
  });

  it("启用动作只发一次语义事件，禁用按钮连合成 click 也保持关闭", () => {
    const onAction = vi.fn();
    const bar = ktcCreatePrimaryActionBar(model, onAction);
    const details: KtcPrimaryActionBarActionDetail[] = [];
    bar.addEventListener(KTC_PRIMARY_ACTION_BAR_ACTION, (event) => {
      details.push((event as CustomEvent<KtcPrimaryActionBarActionDetail>).detail);
    });
    document.body.append(bar);
    const [open, save] = Array.from(bar.shadowRoot!.querySelectorAll("button"));
    open!.click();
    save!.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith("open");
    expect(details).toEqual([{ actionId: "open" }]);
  });

  it("禁用说明由外层承接 tooltip，并以 aria-describedby 关联", () => {
    const bar = ktcCreatePrimaryActionBar(model, vi.fn());
    document.body.append(bar);
    const save = Array.from(bar.shadowRoot!.querySelectorAll("button"))
      .find((button) => button.textContent === "保存")!;
    const slot = save.parentElement!;
    const description = slot.querySelector<HTMLElement>(".sr-only")!;
    expect(save.disabled).toBe(true);
    expect(save.title).toBe("");
    expect(slot.title).toBe("当前配置没有变化");
    expect(description.textContent).toBe("当前配置没有变化");
    expect(save.getAttribute("aria-describedby")).toBe(description.id);
  });

  it("更新模型复用已有按钮并保留 Shadow DOM 内焦点", () => {
    const bar = ktcCreatePrimaryActionBar(model, vi.fn());
    document.body.append(bar);
    const before = Array.from(bar.shadowRoot!.querySelectorAll("button"));
    before[2]!.focus();
    expect(bar.shadowRoot!.activeElement).toBe(before[2]);
    bar.model = {
      label: "新的编译操作",
      actions: [
        { id: "open", label: "打开文件", enabled: true },
        { id: "save", label: "保存", enabled: true },
        { id: "run", label: "运行", enabled: true, primary: true, title: "立即运行" },
      ],
    };
    const after = Array.from(bar.shadowRoot!.querySelectorAll("button"));
    expect(after).toEqual(before);
    expect(bar.shadowRoot!.activeElement).toBe(before[2]);
    expect(before[2]!.textContent).toBe("运行");
    expect(bar.shadowRoot!.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("新的编译操作");
  });

  it("重排复用动作节点，移除动作后不残留旧按钮", () => {
    const bar = ktcCreatePrimaryActionBar(model, vi.fn());
    document.body.append(bar);
    const open = bar.shadowRoot!.querySelectorAll("button")[0]!;
    bar.model = { label: "操作", actions: [model.actions[2]!, model.actions[0]!] };
    const buttons = Array.from(bar.shadowRoot!.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["启动", "打开"]);
    expect(buttons[1]).toBe(open);
    expect(bar.shadowRoot!.textContent).not.toContain("保存");
  });

  it("升级前赋值的 model 在 connectedCallback 后恢复 accessor 并渲染", () => {
    ktcDefinePrimaryActionBar();
    const bar = new KtcPrimaryActionBar();
    Object.defineProperty(bar, "model", { configurable: true, enumerable: true, writable: true, value: model });
    bar.connectedCallback();
    expect(Object.prototype.hasOwnProperty.call(bar, "model")).toBe(false);
    expect(Array.from(bar.shadowRoot!.querySelectorAll("button"), (button) => button.textContent)).toEqual(["打开", "保存", "启动"]);
  });
});
