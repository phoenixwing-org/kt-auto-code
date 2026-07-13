import { describe, expect, it } from "vitest";
import { getPanelHtml } from "./panelHtml.js";

describe("sidebar panel HTML", () => {
  it("使用统一关联规则对话框而不是多套 Quick Pick 消息", () => {
    const html = getPanelHtml(
      { cspSource: "test-webview" } as unknown as Parameters<typeof getPanelHtml>[0],
      {} as unknown as Parameters<typeof getPanelHtml>[1],
    );

    expect(html).toContain('id="rule-picker"');
    expect(html).toContain('dataset.customSearch');
    expect(html).toContain('type: "requestAssociatedRuleCandidates"');
    expect(html).toContain('type: "appendAssociatedRules"');
    expect(html).toContain('id="btn-pick-working-directory"');
    expect(html).toContain('list="recent-working-directories"');
    expect(html).toContain('type: "pickSearchReplaceDirectory"');
    expect(html).toContain('type: "rememberSearchReplaceDirectory"');
    expect(html).toContain('"当前工作区 · " + directory');
    expect(html).toContain('"外部 · " + directory');
    expect(html).not.toContain('type: "chooseCaaRules"');
    expect(html).not.toContain('type: "chooseAssociatedRule"');
  });
});
