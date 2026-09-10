import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("reorder members panel architecture", () => {
  it("纯状态不接触 DOM、VS Code Host、文件系统或 clipboard", () => {
    const state = source("./reorderMembersPanelState.ts");
    expect(state).toContain('from "@phoenix-wing/code-core/ui/model"');
    expect(state).toContain("ktcNextReorderSelection");
    expect(state).toContain("ktcProjectReorderMembersPanel");
    expect(state).not.toContain('from "@phoenix-wing/code-core/ui"');
    expect(state).not.toMatch(/from ["']vscode["']|document\.|window\.|HTMLElement|customElements|acquireVsCodeApi|postMessage|clipboard|workspace\.fs/);
  });

  it("Wing 拥有结果 DOM，共享 Selection Primary 组合真实组件，Sidebar 只投影与转发", () => {
    const component = source("./reorderMembersPanel.ts");
    const shared = source("../ui/KtcSelectionPrimary.ts");
    const adapter = source("./selectionPrimaryAdapter.ts");
    const sidebar = source("./panelHtml.ts");
    expect(component).toContain('KTC_REORDER_MEMBERS_PANEL_TAG = "ktc-reorder-members-panel"');
    expect(component).toContain("KTC_REORDER_MEMBERS_PANEL_ACTION = PNW_CODE_REORDER_MEMBERS_PANEL_ACTION");
    expect(component).toContain('from "@phoenix-wing/code-core/ui"');
    expect(component).toContain("pnwCodeDefineReorderMembersPanel(tagName)");
    expect(component).not.toMatch(/document\.createElement|attachShadow|ktcNextReorderSelection/);
    expect(component).not.toMatch(/from ["']vscode["']|acquireVsCodeApi|postMessage|clipboard|workspace\.fs/);
    expect(shared).toContain('from "../sidebar/reorderMembersPanel.js"');
    expect(shared).toContain('ktcDefineReorderMembersPanel(); return document.createElement("ktc-reorder-members-panel")');
    expect(shared).toContain('from "./KtcPrimaryActionBar.js"');
    expect(shared).toContain('this.reorder.addEventListener(KTC_REORDER_MEMBERS_PANEL_ACTION');
    expect(shared).toContain('presentation: "results"');
    expect(adapter).toContain("reorderResults: state.reorderResults");
    expect(adapter).toContain('type: "reorderAction"');
    expect(sidebar).toMatch(/<ktc-selection-primary[^>]*id="reorder-primary"/u);
    expect(sidebar).not.toContain('<ktc-reorder-members-panel');
    expect(sidebar).toContain(': "ktc-selection-primary-action"');
    expect(sidebar).toContain("surface.addEventListener(eventName");
    expect(sidebar).toContain("ktcProjectSelectionPrimary");
    expect(sidebar).not.toContain("function createReorderGroup");
    expect(sidebar).not.toContain("function renderReorderResults");
    expect(sidebar).not.toContain('className = "reorder-file-row"');
  });

  it("共享正式入口进入构建/制品门禁，旧独立 bundle 保留兼容", () => {
    const build = readFileSync(new URL("../../esbuild.mjs", import.meta.url), "utf8");
    const verify = readFileSync(new URL("../../scripts/verify-extension-artifacts.mjs", import.meta.url), "utf8");
    expect(build).toContain('outfile: "dist/reorder-members-panel.js"');
    expect(build).toMatch(/buildOptions = \[[\s\S]*reorderMembersPanelOptions,[\s\S]*\]/u);
    expect(build).toContain("buildOptions.map((options) => esbuild.build(options))");
    expect(verify).toContain('readText(zip, "extension/dist/reorder-members-panel.js")');
    expect(verify).toContain("Host-neutral member-sort panel custom element");
    expect(verify).toContain("pnw-code-reorder-members-action");
    expect(build).toContain('entryPoints: ["src/sidebar/codeAssistantPrimaryEntry.ts"]');
    expect(build).toContain('outfile: "dist/ktc-code-assistant-primary.js"');
    expect(build).toMatch(/buildOptions = \[[\s\S]*codeAssistantPrimaryOptions,[\s\S]*\]/u);
    expect(verify).toContain('readText(zip, "extension/dist/ktc-code-assistant-primary.js")');
    expect(source("./panelHtml.ts")).toContain("ktc-code-assistant-primary.js");
  });

  it("正式入口只登记共享组件并暴露六个纯适配器，不携带 Host/Preview/领域算法", async () => {
    const { verifyCodeAssistantPrimaryBundle } = await import(new URL("../../scripts/verify-extension-artifacts.mjs", import.meta.url).href) as {
      verifyCodeAssistantPrimaryBundle(source: string, label?: string): void;
    };
    const entry = source("./codeAssistantPrimaryEntry.ts");
    for (const name of ["ktcCreateTextRepairPrimaryModel", "ktcTextRepairPrimaryActionToMessage", "ktcCreateCaaPrimaryModel", "ktcCaaPrimaryMessageForAction", "ktcProjectSelectionPrimary", "ktcSelectionPrimaryMessage"]) expect(entry).toContain(name);
    const sources = [entry, source("../ui/KtcSelectionPrimary.ts"), source("./selectionPrimaryAdapter.ts"), source("./textRepairPrimaryAdapter.ts"), source("./caaPrimaryAdapter.ts")];
    for (const text of sources) {
      expect(text).not.toMatch(/(?:from|import\s*\(|require\s*\()\s*["'](?:vscode|node:|[^"']*ui-preview|[^"']*(?:sourceEncodingWalk|fileEncodingWalk|\/commands\.))/u);
      expect(text).not.toMatch(/\bacquireVsCodeApi\s*\(|\.postMessage\s*\(|\bworkspace\.fs\b/u);
    }
    // Build only in memory: inspect the actual retained modules, not marker strings copied into a test fixture.
    const result = await build({ absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)), entryPoints: ["src/sidebar/codeAssistantPrimaryEntry.ts"],
      bundle: true, write: false, platform: "browser", format: "iife", target: "es2022", metafile: true, logLevel: "silent" });
    const code = result.outputFiles[0]!.text;
    expect(() => verifyCodeAssistantPrimaryBundle(code)).not.toThrow();
    const retained = Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs).filter(([, data]) => data.bytesInOutput > 0).map(([name]) => name));
    expect(retained.some(name => /phoenix-wing.*code-core/u.test(name))).toBe(true);
    expect(code).toContain("PnwCodeReorderMembersPanel");
    expect(code).toContain("PnwCodeUuidResultsPanel");
    expect(retained).toContain("src/ui/KtcSelectionPrimary.ts");
    expect(retained).toContain("src/sidebar/reorderMembersPanel.ts");
    expect(retained).toContain("src/sidebar/uuidResultsPanel.ts");
    expect(retained.join("\n")).not.toMatch(/ui-preview|(?:sourceEncodingWalk|fileEncodingWalk|node:fs|child_process)/u);

    expect(() => verifyCodeAssistantPrimaryBundle(code.replaceAll("ktc-selection-primary-action", "removed-action"))).toThrow(/missing/u);
    expect(() => verifyCodeAssistantPrimaryBundle(`${code}\nconst status = 'preview / 预览 / acquireVsCodeApi() / workspace.fs'; const allowedAction = { action: 'preview' };`)).not.toThrow();
    for (const contamination of [
      "// ui-preview/src/previewSelectionToolsSurface.ts\nconst injected = true;",
      "function createPreviewReorderMembersSurface() { return {}; }",
      "const HEADER_FIXTURE = [];", "class KtcSystemOutputBlock {}",
      "const host = acquireVsCodeApi();", "window.postMessage({ action: 'preview' });",
      "require('node:fs');", "workspace.fs.readFile('x');",
      "// src/core/fileEncodingWalk.ts\nfunction copiedAlgorithm() {}",
    ]) expect(() => verifyCodeAssistantPrimaryBundle(`${code}\n${contamination}`)).toThrow(/Preview|Host|filesystem|file-processing|workspace\.fs/u);
  });
});
