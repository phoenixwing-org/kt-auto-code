import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createWebviewPanel,
  openTextDocument,
  showTextDocument,
  showErrorMessage,
  openCodegenJson,
  uriParse,
  uriFile,
  uriJoinPath,
} = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
  openTextDocument: vi.fn(),
  showTextDocument: vi.fn(),
  showErrorMessage: vi.fn(),
  openCodegenJson: vi.fn(),
  uriParse: vi.fn((value: string) => ({ kind: "parse", value })),
  uriFile: vi.fn((value: string) => ({ kind: "file", value })),
  uriJoinPath: vi.fn((_base: unknown, ...parts: string[]) => ({ toString: () => `file:///extension/${parts.join("/")}` })),
}));
vi.mock("vscode", () => ({
  ViewColumn: { Active: 1 },
  Range: class Range { constructor(public line: number) {} },
  Uri: { parse: uriParse, file: uriFile, joinPath: uriJoinPath },
  workspace: { openTextDocument },
  window: {
    createWebviewPanel,
    showTextDocument,
    showErrorMessage,
  },
}));

import type * as vscode from "vscode";
import type { KtcCodegenBatchApplyReport } from "./batchApplyReport.js";
import {
  KtcCodegenBatchApplyReportViewController,
  ktcResolveCodegenBatchApplyReportAction,
} from "./batchApplyReportViewController.js";

interface FakePanel {
  readonly webview: vscode.Webview;
  readonly reveal: ReturnType<typeof vi.fn>;
  readonly dispose: ReturnType<typeof vi.fn>;
  fireMessage(message: unknown): Promise<void>;
}

function fakePanel(): FakePanel {
  let disposeListener: (() => void) | undefined;
  let messageListener: ((message: unknown) => unknown) | undefined;
  const panel = {
    webview: {
      html: "",
      asWebviewUri: vi.fn((uri: { toString(): string }) => ({ toString: () => `webview:${uri.toString()}` })),
      onDidReceiveMessage: vi.fn((listener: (message: unknown) => unknown) => {
        messageListener = listener;
        return { dispose: vi.fn() };
      }),
    },
    reveal: vi.fn(),
    dispose: vi.fn(() => disposeListener?.()),
    onDidDispose: vi.fn((listener: () => void) => {
      disposeListener = listener;
      return { dispose: vi.fn() };
    }),
    async fireMessage(message: unknown) {
      await messageListener?.(message);
    },
  };
  return panel as unknown as FakePanel;
}

function report(fileName = "A.json"): KtcCodegenBatchApplyReport {
  const uri = `file:///workspace/${fileName}`;
  return {
    kind: "kt.codegen.apply-report",
    schemaVersion: 1,
    reportId: "12345678-1234-4234-8234-123456789abc",
    applyKind: "batch",
    startedAt: "2026-07-20T12:00:00.000Z",
    finishedAt: "2026-07-20T12:00:00.010Z",
    elapsedMilliseconds: 10,
    totals: { total: 1, success: 0, warning: 0, error: 1, updated: 0, unchanged: 0, partial: 1, notApplied: 0 },
    errorCount: 1,
    warningCount: 0,
    items: [{
      documentId: uri,
      fileName,
      displayPath: uri,
      health: "error",
      change: "partial",
      reasonCode: "partial-with-errors",
      errorCount: 1,
      preflightRegionCount: 2,
      preflightArtifactCount: 1,
      preflightDiagnosticCount: 1,
      preflightErrorCount: 1,
      modifiedFileCount: 1,
      writtenRegionCount: 1,
      elapsedMilliseconds: 8,
      issues: [{
        severity: "error",
        code: "marker.missing-end",
        message: "缺少 End",
        path: "/workspace/Part.cpp",
        line: 7,
      }],
    }],
  };
}

describe("KtcCodegenBatchApplyReportViewController", () => {
  beforeEach(() => {
    createWebviewPanel.mockReset();
    openTextDocument.mockReset();
    showTextDocument.mockReset();
    showErrorMessage.mockReset();
    openCodegenJson.mockReset();
    uriParse.mockClear();
    uriFile.mockClear();
  });

  it("复用一个脚本化报告 View，并用新报告 JSON 更新内容", () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const views = new KtcCodegenBatchApplyReportViewController({ openCodegenJson });
    views.initialize({} as vscode.Uri);
    views.show(report("A.json"));
    views.show(report("B.json"));

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.codegenBatchApplyReport",
      "Codegen 应用报告",
      { viewColumn: 1, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [{}] },
    );
    expect(panel.reveal).toHaveBeenCalledTimes(2);
    expect(panel.webview.html).toContain("B.json");
    expect(panel.webview.html).not.toContain("A.json");
    views.dispose();
    expect(panel.dispose).toHaveBeenCalledTimes(1);
  });

  it("只解析当前报告中存在的 JSON 和问题位置", () => {
    const current = report();
    expect(ktcResolveCodegenBatchApplyReportAction(current, {
      action: "openDocument",
      documentId: "file:///workspace/A.json",
    })).toEqual({ kind: "json", documentId: "file:///workspace/A.json" });
    expect(ktcResolveCodegenBatchApplyReportAction(current, {
      action: "openIssue",
      path: "/workspace/Part.cpp",
      line: 7,
    })).toEqual({ kind: "issue", path: "/workspace/Part.cpp", line: 7 });
    expect(ktcResolveCodegenBatchApplyReportAction(current, {
      action: "openDocument",
      documentId: "file:///workspace/Other.json",
    })).toBeUndefined();
    expect(ktcResolveCodegenBatchApplyReportAction(current, {
      action: "openIssue",
      path: "/workspace/Part.cpp",
      line: 8,
    })).toBeUndefined();
  });

  it("链接由 Host 打开当前报告文件，伪造路径不执行", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    openTextDocument.mockResolvedValue({ lineCount: 20 });
    const views = new KtcCodegenBatchApplyReportViewController({ openCodegenJson });
    views.initialize({} as vscode.Uri);
    views.show(report());

    await panel.fireMessage({ action: "openDocument", documentId: "file:///workspace/A.json" });
    await panel.fireMessage({ action: "openIssue", path: "/workspace/Part.cpp", line: 7 });
    await panel.fireMessage({ action: "openDocument", documentId: "file:///workspace/Forged.json" });

    expect(openCodegenJson).toHaveBeenCalledWith("file:///workspace/A.json");
    expect(uriFile).toHaveBeenCalledWith("/workspace/Part.cpp");
    expect(openTextDocument).toHaveBeenCalledTimes(1);
    expect(showTextDocument).toHaveBeenCalledTimes(1);
    expect(showTextDocument.mock.calls[0]?.[1]).toMatchObject({ preview: true });
    expect(showErrorMessage).not.toHaveBeenCalled();
  });
});
