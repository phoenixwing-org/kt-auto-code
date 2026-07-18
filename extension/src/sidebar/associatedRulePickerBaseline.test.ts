import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { KtcReplacementRuleDraft } from "../../../src/associatedReplacementRules.js";
import {
  getPanelHtml,
  ktcAssociatedRulePickerAppendMessage,
} from "./panelHtml.js";

function panelHtml(): string {
  const extensionUri = {
    path: "/extension",
    with(change: { path: string }) { return { ...this, ...change }; },
  } as unknown as Parameters<typeof getPanelHtml>[1];
  return getPanelHtml({
    cspSource: "test-webview",
    asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
  } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);
}

describe("associated rule picker component adapter", () => {
  it("Host 继续生成候选和去重，Sidebar 只把一次性模型交给组件", () => {
    const sidebar = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    const provider = readFileSync(new URL("./sidebarViewProvider.ts", import.meta.url), "utf8");
    const tool = readFileSync(new URL("../tools/codeRename/index.ts", import.meta.url), "utf8");

    expect(tool).toContain("const picker = ktcCreateAssociatedRulePicker(request);");
    expect(tool).toContain("ktcAppendAssociatedReplacementRuleDrafts(");
    expect(provider).toContain("associatedRulePicker");
    expect(sidebar).toContain("if (associatedRulePicker) openRulePicker(associatedRulePicker);");
    expect(sidebar).toContain("els.rulePicker.openPicker(picker);");
    expect(sidebar).toContain('els.rulePicker.addEventListener("ktc-associated-rule-picker-action"');
    expect(sidebar).not.toContain("function updateRulePickerConfirm()");
    expect(sidebar).not.toContain('className = "rule-picker-row"');
    expect(sidebar).not.toContain("activeRulePicker");
  });

  it("适配器补齐 primarySearch 与 existingRules，但不改组件返回的 draft", () => {
    const rules: readonly KtcReplacementRuleDraft[] = [{
      id: "custom-1",
      search: "  ManualSource  ",
      replace: "ManualTarget",
      enabled: true,
      source: "user",
      relationKind: "custom",
    }];
    const existingRules: readonly KtcReplacementRuleDraft[] = [{
      id: "existing",
      search: "Existing",
      replace: "Kept",
      enabled: true,
    }];

    expect(ktcAssociatedRulePickerAppendMessage({
      primarySearch: "PrimarySource",
      rules,
      existingRules,
    })).toEqual({
      type: "appendAssociatedRules",
      toolId: "codeRename",
      primarySearch: "PrimarySource",
      rules,
      existingRules,
    });
  });

  it("Sidebar HTML、独立 bundle 与单一 action 事件接线完整", () => {
    const html = panelHtml();
    expect(html).toContain('<ktc-associated-rule-picker id="rule-picker"></ktc-associated-rule-picker>');
    expect(html).toContain("test-webview:/extension/dist/associated-rule-picker.js");
    expect(html).toContain('event.detail?.kind !== "confirm"');
    expect(html).toContain("primarySearch: state.replace.search");
    expect(html).toContain("existingRules: state.replace.extraRules");
    expect(html).not.toContain('id="rule-picker-list"');
    expect(html).not.toContain("showModal()");
  });

  it("Browser 点检夹具加载真实 bundle 并覆盖 common、CAA、custom", () => {
    const fixture = readFileSync(
      new URL("../../test-fixtures/associated-rule-picker.html", import.meta.url),
      "utf8",
    );
    expect(fixture).toContain('../dist/associated-rule-picker.js');
    expect(fixture).toContain('id="open-common"');
    expect(fixture).toContain('id="open-caa"');
    expect(fixture).toContain('id="open-custom"');
    expect(fixture).toContain('"ktc-associated-rule-picker-action"');
    expect(fixture).toContain('document.body.dataset.ready = "true"');
  });
});
