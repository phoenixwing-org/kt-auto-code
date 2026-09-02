import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPanelHtml } from "./panelHtml.js";

function webview() {
  return {
    cspSource: "test-webview",
    asWebviewUri(uri: { path?: string; toString?(): string }) {
      return `test-webview:${uri.path ?? uri.toString?.() ?? ""}`;
    },
  };
}

function extensionUri() {
  return {
    path: "/extension",
    with(change: { path: string }) { return { ...this, ...change }; },
  };
}

describe("associated rule picker component adapter", () => {
  it("Host 继续生成候选，项目改名 View 接管一次性模型", () => {
    const sidebar = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    const host = readFileSync(new URL("../projectRenameHost.ts", import.meta.url), "utf8");
    const controller = readFileSync(new URL("../tools/projectRename/viewController.ts", import.meta.url), "utf8");
    const entry = readFileSync(new URL("../tools/projectRename/viewEntry.ts", import.meta.url), "utf8");

    expect(host).toContain("return ktcCreateAssociatedRulePicker(options);");
    expect(controller).toContain('message.type === "requestRulePicker"');
    expect(controller).toContain("this.host.createRulePicker({");
    expect(controller).toContain('{ type: "rulePicker", picker }');
    expect(entry).toContain('rulePicker.addEventListener("ktc-associated-rule-picker-action"');
    expect(entry).toContain("rulePicker.openPicker(message.picker)");
    expect(sidebar).not.toContain("if (associatedRulePicker) openRulePicker(associatedRulePicker);");
    expect(sidebar).not.toContain("els.rulePicker.openPicker(picker);");
    expect(sidebar).not.toContain('els.rulePicker.addEventListener("ktc-associated-rule-picker-action"');
  });

  it("Primary 不再承载高级规则，项目改名 View 加载共享组件 bundle", () => {
    const sidebarHtml = getPanelHtml(
      webview() as unknown as Parameters<typeof getPanelHtml>[0],
      extensionUri() as unknown as Parameters<typeof getPanelHtml>[1],
    );
    const viewHtml = readFileSync(new URL("../tools/projectRename/viewHtml.ts", import.meta.url), "utf8");

    expect(sidebarHtml).not.toContain('<ktc-associated-rule-picker id="rule-picker"></ktc-associated-rule-picker>');
    expect(sidebarHtml).not.toContain("associated-rule-picker.js");
    expect(sidebarHtml).not.toContain('id="replace-profile-name"');
    expect(viewHtml).toContain('<ktc-associated-rule-picker id="rule-picker"></ktc-associated-rule-picker>');
    expect(viewHtml).toContain('vscode.Uri.joinPath(extensionUri, "dist", "associated-rule-picker.js")');
    expect(viewHtml).not.toContain('id="rule-picker-list"');
    expect(viewHtml).not.toContain("showModal()");
  });

  it("Browser 点检夹具加载真实 bundle 并覆盖 common、CAA、custom", () => {
    const fixture = readFileSync(
      new URL("../../tests/webview/associated-rule-picker.html", import.meta.url),
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
