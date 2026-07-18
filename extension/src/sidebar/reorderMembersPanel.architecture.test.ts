import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("reorder members panel architecture", () => {
  it("纯状态不接触 DOM、VS Code Host、文件系统或 clipboard", () => {
    const state = source("./reorderMembersPanelState.ts");
    expect(state).toContain("ktcNextReorderSelection");
    expect(state).toContain("ktcProjectReorderMembersPanel");
    expect(state).not.toMatch(/from ["']vscode["']|document\.|window\.|HTMLElement|customElements|acquireVsCodeApi|postMessage|clipboard|workspace\.fs/);
  });

  it("Web Component 拥有成员排序 DOM，Sidebar 只投影 model 与映射消息", () => {
    const component = source("./reorderMembersPanel.ts");
    const sidebar = source("./panelHtml.ts");
    expect(component).toContain('KTC_REORDER_MEMBERS_PANEL_TAG = "ktc-reorder-members-panel"');
    expect(component).toContain('KTC_REORDER_MEMBERS_PANEL_ACTION = "ktc-reorder-members-action"');
    expect(component).toContain('presentation="detailBlock"');
    expect(component).toContain("ktcNextReorderSelection");
    expect(component).not.toMatch(/from ["']vscode["']|acquireVsCodeApi|postMessage|clipboard|workspace\.fs/);
    expect(sidebar).toContain('<ktc-reorder-members-panel id="reorder-members-panel" hidden>');
    expect(sidebar).toContain("els.reorderMembersPanel.model = {");
    expect(sidebar).toContain('addEventListener("ktc-reorder-members-action"');
    expect(sidebar).not.toContain("function createReorderGroup");
    expect(sidebar).not.toContain("function renderReorderResults");
    expect(sidebar).not.toContain('className = "reorder-file-row"');
  });

  it("独立浏览器 bundle 同时进入 build 与 VSIX 制品检查", () => {
    const build = readFileSync(new URL("../../esbuild.mjs", import.meta.url), "utf8");
    const verify = readFileSync(new URL("../../../scripts/verify-extension-artifacts.mjs", import.meta.url), "utf8");
    expect(build).toContain('outfile: "dist/reorder-members-panel.js"');
    expect(build).toContain("esbuild.build(reorderMembersPanelOptions)");
    expect(verify).toContain('readText(zip, "extension/dist/reorder-members-panel.js")');
    expect(verify).toContain("Host-neutral member-sort panel custom element");
  });
});
