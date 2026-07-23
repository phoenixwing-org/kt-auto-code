import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("UUID result panel architecture", () => {
  it("Auto 只注册 Wing 组件，不维护第二套结果 DOM", () => {
    const component = source("./uuidResultsPanel.ts");
    const sidebar = source("./panelHtml.ts");
    expect(component).toContain('KTC_UUID_RESULTS_PANEL_TAG = "ktc-uuid-results-panel"');
    expect(component).toContain("pnwCodeDefineUuidResultsPanel(tagName)");
    expect(component).not.toMatch(/document\.createElement|attachShadow|acquireVsCodeApi|postMessage|workspace\.fs/);
    expect(sidebar).toContain('<ktc-uuid-results-panel id="uuid-results-panel" hidden>');
    expect(sidebar).toContain("els.uuidResultsPanel.model = {");
    expect(sidebar).toContain('addEventListener("pnw-code-uuid-results-action"');
    expect(sidebar).not.toContain("function uuidStateLabel");
    expect(sidebar).not.toContain("function renderUuidResults");
  });

  it("UUID 浏览器 bundle 进入构建与 VSIX 制品检查", () => {
    const build = readFileSync(new URL("../../esbuild.mjs", import.meta.url), "utf8");
    const verify = readFileSync(new URL("../../../scripts/verify-extension-artifacts.mjs", import.meta.url), "utf8");
    expect(build).toContain('outfile: "dist/uuid-results-panel.js"');
    expect(build).toContain("esbuild.build(uuidResultsPanelOptions)");
    expect(verify).toContain('readText(zip, "extension/dist/uuid-results-panel.js")');
    expect(verify).toContain("Host-neutral UUID result panel custom element");
  });
});
