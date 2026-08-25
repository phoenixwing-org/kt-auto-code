import { beforeEach, describe, expect, it, vi } from "vitest";

const { createWebviewPanel } = vi.hoisted(() => ({ createWebviewPanel: vi.fn() }));

vi.mock("vscode", () => ({
  ViewColumn: { Active: 1 },
  window: { createWebviewPanel },
}));

import type * as vscode from "vscode";
import { KtcPackageIncludeViewController } from "./packageIncludeViewController.js";

function fakePanel(): vscode.WebviewPanel {
  let disposeListener: (() => void) | undefined;
  return {
    active: true,
    visible: true,
    viewColumn: 1,
    title: "",
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
    webview: {
      cspSource: "test-webview",
      html: "",
      postMessage: vi.fn(() => Promise.resolve(true)),
      onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
    },
  } as unknown as vscode.WebviewPanel;
}

describe("Package include View", () => {
  beforeEach(() => createWebviewPanel.mockReset());

  it("同一功能重复打开时复用一个右侧文档式 View", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const view = new KtcPackageIncludeViewController({ get: () => undefined, update: vi.fn() });

    await view.show("/workspace");
    await view.show("/workspace");

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.packageIncludes",
      "代码辅助 · 头文件引用修正",
      { viewColumn: 1, preserveFocus: false },
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
    );
    expect(panel.webview.html).toContain('class="command-header"');
    expect(panel.webview.html).toContain('<strong>头文件引用修正</strong>');
    expect(panel.webview.html).toContain('class="header-actions"');
    expect(panel.webview.html).toContain('id="preview" class="primary" type="button">预览</button>');
    expect(panel.webview.html).toContain('id="open-env" type="button">工程环境</button>');
    expect(panel.webview.html).toContain("</header><main>");
    expect(panel.webview.html).toContain('id="derive-package"');
    expect(panel.webview.html).toContain("推导…");
    expect(panel.webview.html).not.toContain('id="use-include-root"');
    expect(panel.webview.html).not.toContain('id="use-root-directory"');
    expect(panel.webview.html).toContain('<label for="target-directory">工程目录</label>');
    expect(panel.webview.html).toContain('id="target-directory" type="text" spellcheck="false"');
    expect(panel.webview.html).not.toContain('id="target-directory" type="text" readonly');
    expect(panel.webview.html).toContain("targetDirectory:els.targetDirectory.value");
    expect(panel.reveal).toHaveBeenCalledWith(1, false);
  });
});
