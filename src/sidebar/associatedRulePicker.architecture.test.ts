import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("associated rule picker architecture", () => {
  it("Web Component 只拥有弹窗交互和单一 action 事件", () => {
    const component = source("./associatedRulePicker.ts");
    expect(component).toContain('KTC_ASSOCIATED_RULE_PICKER_TAG = "ktc-associated-rule-picker"');
    expect(component).toContain('KTC_ASSOCIATED_RULE_PICKER_ACTION = "ktc-associated-rule-picker-action"');
    expect(component).toContain('readonly kind: "confirm"');
    expect(component).toContain('readonly kind: "cancel"');
    expect(component).not.toMatch(/acquireVsCodeApi|postMessage|primarySearch|existingRules|workspace\.fs|clipboard/);
  });

  it("Panel、构建、架构门禁、Browser 夹具与 VSIX 制品门禁全部接线", () => {
    const panel = source("./panelHtml.ts");
    const entry = source("./associatedRulePickerEntry.ts");
    const build = source("../../esbuild.mjs");
    const architecture = JSON.parse(source("../../architecture-boundaries.json")) as {
      viewRoots: string[];
    };
    const verify = source("../../scripts/verify-extension-artifacts.mjs");
    const fixture = source("../../tests/webview/associated-rule-picker.html");
    const vscodeIgnore = source("../../.vscodeignore");

    expect(panel).toContain('<ktc-associated-rule-picker id="rule-picker"></ktc-associated-rule-picker>');
    expect(panel).toContain("dist/associated-rule-picker.js");
    expect(entry).toContain("ktcDefineAssociatedRulePicker();");
    expect(build).toContain('entryPoints: ["src/sidebar/associatedRulePickerEntry.ts"]');
    expect(build).toContain('outfile: "dist/associated-rule-picker.js"');
    expect(build).toMatch(/buildOptions = \[[\s\S]*associatedRulePickerOptions,[\s\S]*\]/u);
    expect(build).toContain("buildOptions.map((options) => esbuild.build(options))");
    expect(build).toContain("associatedRulePickerContext.watch()");
    expect(architecture.viewRoots).toEqual(expect.arrayContaining([
      "src/sidebar/associatedRulePicker.ts",
      "src/sidebar/associatedRulePickerEntry.ts",
    ]));
    expect(verify).toContain('readText(zip, "extension/dist/associated-rule-picker.js")');
    expect(verify).toContain('associatedRulePickerBundle.includes("ktc-associated-rule-picker-action")');
    expect(verify).toContain('associatedRulePickerBundle.includes("postMessage")');
    expect(verify).toContain('associatedRulePickerBundle.includes("clipboard")');
    expect(verify).toContain('associatedRulePickerBundle.includes("workspace.fs")');
    expect(fixture).toContain('../dist/associated-rule-picker.js');
    expect(vscodeIgnore).toContain("tests/**");
    expect(vscodeIgnore).toContain(".obsidian/**");
    expect(verify).toContain("\\.obsidian|node_modules|src|target");
  });
});
