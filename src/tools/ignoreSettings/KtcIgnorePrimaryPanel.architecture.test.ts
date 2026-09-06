import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("Ignore Primary panel architecture", () => {
  it("keeps the component Host-neutral and communicates through one typed DOM event", () => {
    const component = source("./KtcIgnorePrimaryPanel.ts");
    expect(component).toContain('KtcIgnorePrimaryPanelTag = "ktc-ignore-primary-panel"');
    expect(component).toContain('KTC_IGNORE_PRIMARY_ACTION = "ktc-ignore-primary-action"');
    expect(component).toContain("export type KtcIgnorePrimaryActionDetail");
    expect(component).toContain("new CustomEvent<KtcIgnorePrimaryActionDetail>");
    expect(component).not.toMatch(
      /acquireVsCodeApi|postMessage|from ["']vscode["']|from ["']node:fs["']|from ["']node:path["']|workspaceState|globalState/u,
    );
  });

  it("keeps data decisions in the DOM-free model for future Wing migration", () => {
    const model = source("./KtcIgnorePrimaryPanelModel.ts");
    expect(model).toContain("ktcReduceIgnorePrimaryPanelState");
    expect(model).toContain("ktcBuildIgnorePrimaryPanelViewModel");
    expect(model).toContain("ktcSelectedIgnoreRules");
    expect(model).not.toMatch(
      /document\.|customElements|HTMLElement|CustomEvent|acquireVsCodeApi|postMessage|from ["']vscode["']|from ["']node:fs["']|from ["']node:path["']/u,
    );
  });

  it("renders source, built-in, effective, and recommendation sections in locked order", () => {
    const component = source("./KtcIgnorePrimaryPanel.ts");
    const entry = source("./KtcIgnorePrimaryPanelEntry.ts");
    const sourceSection = component.indexOf("this.sourceSection(view)");
    const builtInSection = component.indexOf("this.builtInSection(view)");
    const effectiveSection = component.indexOf("this.effectiveSection(view)");
    const recommendationSection = component.indexOf("this.recommendationSection(view)");
    expect(sourceSection).toBeGreaterThan(-1);
    expect(builtInSection).toBeGreaterThan(sourceSection);
    expect(effectiveSection).toBeGreaterThan(builtInSection);
    expect(recommendationSection).toBeGreaterThan(effectiveSection);
    expect(entry).toContain("KtcDefineIgnorePrimaryPanel();");
    expect(entry).not.toMatch(/acquireVsCodeApi|postMessage/u);
  });

  it("gets built-in rules from the Host summary without importing the Node scan module", () => {
    const model = source("./KtcIgnorePrimaryPanelModel.ts");
    expect(model).toContain("config?.builtInPatterns");
    expect(model).not.toContain("scanScope");
    expect(model).not.toContain("DEFAULT_SKIP_DIR_NAMES");
  });
});
