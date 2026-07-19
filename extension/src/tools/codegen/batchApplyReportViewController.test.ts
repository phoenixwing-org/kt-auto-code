import { beforeEach, describe, expect, it, vi } from "vitest";

const { createWebviewPanel } = vi.hoisted(() => ({ createWebviewPanel: vi.fn() }));
vi.mock("vscode", () => ({ ViewColumn: { Active: 1 }, window: { createWebviewPanel } }));

import type * as vscode from "vscode";
import { KtcCodegenBatchApplyReportViewController } from "./batchApplyReportViewController.js";

function fakePanel(): vscode.WebviewPanel {
  let disposeListener: (() => void) | undefined;
  const panel = {
    webview: { html: "" },
    dispose: vi.fn(() => disposeListener?.()),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
  };
  return panel as unknown as vscode.WebviewPanel;
}

const report = {
  elapsedMilliseconds: 10,
  totals: { total: 0, applied: 0, partial: 0, notWritten: 0 },
  errorCount: 0,
  warningCount: 0,
  items: [],
};

describe("KtcCodegenBatchApplyReportViewController", () => {
  beforeEach(() => createWebviewPanel.mockReset());

  it("每次完成都新建非持久、无脚本的报告标签", () => {
    const first = fakePanel();
    const second = fakePanel();
    createWebviewPanel.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const views = new KtcCodegenBatchApplyReportViewController();
    views.show(report);
    views.show(report);
    expect(createWebviewPanel).toHaveBeenCalledTimes(2);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.codegenBatchApplyReport",
      "Codegen 全部应用报告",
      { viewColumn: 1, preserveFocus: false },
      { enableScripts: false, retainContextWhenHidden: true },
    );
    expect(first.webview.html).toContain("本批次没有错误或警告");
    expect(second.webview.html).toContain("Codegen 全部应用报告");
    views.dispose();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });
});
