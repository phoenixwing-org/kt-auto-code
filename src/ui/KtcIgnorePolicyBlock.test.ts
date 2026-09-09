// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  KTC_IGNORE_POLICY_ACTION, KTC_IGNORE_POLICY_BLOCK_TAG, KtcIgnorePolicyBlock,
  ktcDefineIgnorePolicyBlock, normalizeKtcIgnorePolicyBlockModel,
  type KtcIgnorePolicyBlockActionDetail, type KtcIgnorePolicyBlockModel,
} from "./KtcIgnorePolicyBlock.js";

const MODEL: KtcIgnorePolicyBlockModel = {
  enabled: true, builtInEnabled: true, gitEnabled: true, customEnabled: false, customCount: 3,
};
beforeAll(() => { ktcDefineIgnorePolicyBlock(); });
afterEach(() => document.body.replaceChildren());

function mount(model: KtcIgnorePolicyBlockModel = MODEL): KtcIgnorePolicyBlock {
  const block = document.createElement(KTC_IGNORE_POLICY_BLOCK_TAG);
  block.model = model;
  document.body.append(block);
  return block;
}

function actions(block: KtcIgnorePolicyBlock): KtcIgnorePolicyBlockActionDetail[] {
  const result: KtcIgnorePolicyBlockActionDetail[] = [];
  block.addEventListener(KTC_IGNORE_POLICY_ACTION, (event) => {
    result.push((event as CustomEvent<KtcIgnorePolicyBlockActionDetail>).detail);
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(Object.isFrozen((event as CustomEvent).detail)).toBe(true);
  });
  return result;
}

describe("KtcIgnorePolicyBlock", () => {
  it("默认策略可序列化、规范化并冻结；注册和Entry幂等", async () => {
    const model = normalizeKtcIgnorePolicyBlockModel(undefined);
    expect(model).toMatchObject({ enabled: true, builtInEnabled: true, gitEnabled: true, customEnabled: false, busy: false });
    expect(Object.isFrozen(model)).toBe(true);
    expect(normalizeKtcIgnorePolicyBlockModel({ ...MODEL, customCount: Number.NaN }).customCount).toBeUndefined();
    expect(normalizeKtcIgnorePolicyBlockModel({ ...MODEL, customCount: 3.9 }).customCount).toBe(3);
    expect(JSON.parse(JSON.stringify(model))).toMatchObject({ enabled: true });
    expect(ktcDefineIgnorePolicyBlock()).toBe(KtcIgnorePolicyBlock);
    await import("./KtcIgnorePolicyBlockEntry.js");
    expect(customElements.get(KTC_IGNORE_POLICY_BLOCK_TAG)).toBe(KtcIgnorePolicyBlock);
  });

  it("默认展开，显示标题、三来源、规则数量和不可关闭的安全排除说明", () => {
    const block = mount(), root = block.shadowRoot!;
    expect(root.querySelector("details")?.open).toBe(true);
    expect(root.querySelector(".title")?.textContent).toBe("忽略");
    expect(root.querySelector(".state")?.textContent).toBe("已启用");
    expect(root.querySelectorAll('.sources input[type="checkbox"]')).toHaveLength(3);
    expect(root.querySelector(".count")?.textContent).toBe("(3)");
    expect(root.querySelector(".hint")?.textContent).toContain("不可关闭的安全排除");
    expect(root.querySelector("style")?.textContent).toContain("--vscode-sideBarSectionHeader-background");
  });

  it.each(["builtIn", "git", "custom"] as const)("%s 只发稳定source事件，等待Host回投影", (source) => {
    const block = mount(), seen = actions(block);
    const input = block.shadowRoot!.querySelector<HTMLInputElement>(`input[data-source="${source}"]`)!;
    const before = input.checked;
    input.click();
    expect(seen).toEqual([{ kind: "toggleSource", source, enabled: !before }]);
    expect(input.checked).toBe(before);
    expect(block.model).toMatchObject(MODEL);
  });

  it("停用仅禁用来源并保留选择，修改入口仍可达", () => {
    const block = mount(), seen = actions(block), root = block.shadowRoot!;
    root.querySelector<HTMLButtonElement>(".toggle-master")?.click();
    expect(seen).toEqual([{ kind: "toggleMaster", enabled: false }]);
    block.model = { ...MODEL, enabled: false };
    expect(root.querySelector(".state")?.textContent).toBe("已停用");
    expect(root.querySelector(".toggle-master")?.textContent).toBe("启用");
    for (const input of Array.from(root.querySelectorAll<HTMLInputElement>(".sources input"))) expect(input.disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input[data-source="builtIn"]')?.checked).toBe(true);
    const custom = root.querySelector<HTMLInputElement>('input[data-source="custom"]')!;
    custom.checked = true; custom.dispatchEvent(new Event("change"));
    expect(custom.checked).toBe(false);
    const manage = root.querySelector<HTMLButtonElement>(".manage")!;
    expect(manage.disabled).toBe(false);
    manage.click();
    expect(seen.at(-1)).toEqual({ kind: "manage" });
    root.querySelector<HTMLButtonElement>(".toggle-master")?.click();
    expect(seen.at(-1)).toEqual({ kind: "toggleMaster", enabled: true });
  });

  it("模型和连接更新保留同一details及用户折叠状态", () => {
    const block = mount(), details = block.shadowRoot!.querySelector("details")!;
    details.open = false;
    block.model = { ...MODEL, enabled: false, customCount: 8 };
    expect(block.shadowRoot!.querySelector("details")).toBe(details);
    expect(details.open).toBe(false);
    block.remove(); document.body.append(block);
    expect(details.open).toBe(false);
    details.open = true;
    block.model = MODEL;
    expect(details.open).toBe(true);
  });

  it("summary里的按钮阻止默认展开和点击传播，但仍发语义事件", () => {
    const block = mount(), details = block.shadowRoot!.querySelector("details")!, seen = actions(block);
    details.open = false;
    const summaryClick = vi.fn();
    block.shadowRoot!.querySelector("summary")!.addEventListener("click", summaryClick);
    for (const selector of [".toggle-master", ".manage"]) {
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      block.shadowRoot!.querySelector(selector)!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      expect(details.open).toBe(false);
    }
    expect(summaryClick).not.toHaveBeenCalled();
    expect(seen.map(({ kind }) => kind)).toEqual(["toggleMaster", "manage"]);
  });

  it("busy禁用动作且程序触发也不绕过；不持有任何Host或持久化能力", () => {
    const block = mount({ ...MODEL, busy: true }), seen = actions(block);
    for (const control of Array.from(block.shadowRoot!.querySelectorAll<HTMLInputElement | HTMLButtonElement>("button,input"))) {
      expect(control.disabled).toBe(true);
      control.dispatchEvent(new MouseEvent("click"));
    }
    expect(seen).toEqual([]);
    const source = readFileSync(resolve(process.cwd(), "src/ui/KtcIgnorePolicyBlock.ts"), "utf8");
    expect(source).not.toMatch(/^import\s/mu);
    expect(source).not.toMatch(/acquireVsCodeApi|postMessage|workspaceState|localStorage|sessionStorage|node:fs|setIgnoreEnabled|setIgnoreSourceEnabled/u);
  });
});
