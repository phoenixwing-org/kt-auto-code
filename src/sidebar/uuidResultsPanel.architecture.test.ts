import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("UUID result panel architecture", () => {
  it("Auto 只注册 Wing 组件，不维护第二套结果 DOM", () => {
    const component = source("./uuidResultsPanel.ts");
    const shared = source("../ui/KtcSelectionPrimary.ts");
    const adapter = source("./selectionPrimaryAdapter.ts");
    const sidebar = source("./panelHtml.ts");
    expect(component).toContain('KTC_UUID_RESULTS_PANEL_TAG = "ktc-uuid-results-panel"');
    expect(component).toContain("pnwCodeDefineUuidResultsPanel(tagName)");
    expect(component).not.toMatch(/document\.createElement|attachShadow|acquireVsCodeApi|postMessage|workspace\.fs/);
    expect(shared).toContain('from "../sidebar/uuidResultsPanel.js"');
    expect(shared).toContain('ktcDefineUuidResultsPanel(); return document.createElement("ktc-uuid-results-panel")');
    expect(shared).toContain("this.uuid.addEventListener(KTC_UUID_RESULTS_ACTION");
    expect(shared).toContain('presentation: "files"');
    expect(adapter).toContain("files: state.uuidResults");
    expect(adapter).toContain('type: "uuidAction"');
    expect(sidebar).toMatch(/<ktc-selection-primary[^>]*id="uuid-primary"/u);
    expect(sidebar).not.toContain('<ktc-uuid-results-panel');
    expect(sidebar).toContain(': "ktc-selection-primary-action"');
    expect(sidebar).toContain("surface.addEventListener(eventName");
    expect(sidebar).toContain("ktcSelectionPrimaryMessage");
    expect(sidebar).not.toContain("function uuidStateLabel");
    expect(sidebar).not.toContain("function renderUuidResults");
  });

  it("UUID 浏览器 bundle 进入构建与 VSIX 制品检查", () => {
    const build = readFileSync(new URL("../../esbuild.mjs", import.meta.url), "utf8");
    const verify = readFileSync(new URL("../../scripts/verify-extension-artifacts.mjs", import.meta.url), "utf8");
    expect(build).toContain('outfile: "dist/uuid-results-panel.js"');
    expect(build).toMatch(/buildOptions = \[[\s\S]*uuidResultsPanelOptions,[\s\S]*\]/u);
    expect(build).toContain("buildOptions.map((options) => esbuild.build(options))");
    expect(verify).toContain('readText(zip, "extension/dist/uuid-results-panel.js")');
    expect(verify).toContain("Host-neutral UUID result panel custom element");
    expect(build).toContain('outfile: "dist/ktc-code-assistant-primary.js"');
    expect(build).toMatch(/buildOptions = \[[\s\S]*codeAssistantPrimaryOptions,[\s\S]*\]/u);
    expect(verify).toContain('readText(zip, "extension/dist/ktc-code-assistant-primary.js")');
    expect(verify).toContain("ktc-selection-primary-action");
  });
});
