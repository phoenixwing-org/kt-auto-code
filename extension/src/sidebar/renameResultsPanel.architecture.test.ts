import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("rename result panel architecture", () => {
  it("Auto 只注册 Wing 组件并把打开信号交还 Host", () => {
    const component = source("./renameResultsPanel.ts");
    const sidebar = source("./panelHtml.ts");
    expect(component).toContain('KTC_RENAME_RESULTS_PANEL_TAG = "ktc-rename-results-panel"');
    expect(component).toContain("pnwCodeDefineRenameResultsPanel(tagName)");
    expect(component).not.toMatch(/document\.createElement|attachShadow|acquireVsCodeApi|postMessage|workspace\.fs/);
    expect(sidebar).toContain('<ktc-rename-results-panel id="rename-results-panel" hidden>');
    expect(sidebar).toContain("els.renameResultsPanel.model = {");
    expect(sidebar).toContain('addEventListener("pnw-code-rename-results-action"');
    expect(sidebar).not.toContain("function renderCodeRenameResults");
  });

  it("浏览器 bundle 进入构建与 VSIX 制品检查", () => {
    const build = source("../../esbuild.mjs");
    const verify = source("../../../scripts/verify-extension-artifacts.mjs");
    expect(build).toContain('outfile: "dist/rename-results-panel.js"');
    expect(build).toContain("esbuild.build(renameResultsPanelOptions)");
    expect(verify).toContain('readText(zip, "extension/dist/rename-results-panel.js")');
    expect(verify).toContain("Host-neutral rename result panel custom element");
  });
});
