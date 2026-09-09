// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { KtcCreateRunModel } from "../../core/run/KtcRunModel.js";
import { KtcDefineRunPrimaryPanel, type KtcRunPrimaryActionDetail, type KtcRunPrimaryPanel } from "./KtcRunPrimaryPanel.js";

afterEach(() => document.body.replaceChildren());

describe("Run cleanup leaf actions", () => {
  it("keeps three direct deletion leaves and text cleanup/refresh buttons in the body toolbar", () => {
    KtcDefineRunPrimaryPanel();
    const panel = document.createElement("ktc-run-primary-panel") as KtcRunPrimaryPanel;
    panel.model = KtcCreateRunModel({ platform: "darwin", trusted: true, projects: [] });
    document.body.append(panel);
    const actions: KtcRunPrimaryActionDetail[] = [];
    panel.addEventListener("ktc-run-primary-action", (event) => actions.push((event as CustomEvent<KtcRunPrimaryActionDetail>).detail));
    const tree = panel.shadowRoot!.querySelector("pnw-navigation-tree")!;
    const cleanup = tree.model!.nodes.find(({ id }) => id === "run-cleanup")!;
    expect(cleanup.description).toBe("当前工作目录 · 跳过 .git · 点击即执行，不询问");
    expect(cleanup.children!.map(({ label }) => label)).toEqual([
      "删除 build 目录", "删除 objects 目录", "删除 *.obj",
    ]);
    expect(cleanup.children!.every(({ description }) => description === undefined)).toBe(true);
    for (const { id } of cleanup.children!) {
      tree.dispatchEvent(new CustomEvent("pnw-navigation-tree-action", { detail: { kind: "select", nodeId: id } }));
    }
    expect(actions).toEqual([
      { action: "cleanBuild" }, { action: "cleanObjects" }, { action: "cleanObj" },
    ]);
    const toolbar = panel.shadowRoot!.querySelector(".toolbar")!;
    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"));
    expect(buttons.map(({ textContent }) => textContent)).toEqual(["刷新", "清理"]);
    expect(toolbar.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    expect(toolbar.textContent).toContain("仅当前系统");
    buttons[0]!.click(); buttons[1]!.click();
    expect(actions.slice(-2)).toEqual([{ action: "refresh" }, { action: "openCleanup" }]);
    expect(buttons[1]!.title).toContain("默认 Git 未跟踪与忽略项");
    expect(buttons[1]!.getAttribute("aria-label")).toContain("不执行 reset");
  });
});
