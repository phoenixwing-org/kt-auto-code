import { beforeEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createWebviewPanel, uriJoinPath } = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
  uriJoinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
    fsPath: `/extension/${parts.join("/")}`,
    toString: () => `file:///extension/${parts.join("/")}`,
  })),
}));

vi.mock("vscode", () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }),
    joinPath: uriJoinPath,
  },
  ViewColumn: { Active: 1 },
  window: { createWebviewPanel },
}));

import * as vscode from "vscode";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import { KtcPackageIncludeViewController } from "./packageIncludeViewController.js";

interface TestWebviewPanel extends vscode.WebviewPanel {
  receive(message: unknown): void;
}

function fakePanel(): TestWebviewPanel {
  let disposeListener: (() => void) | undefined;
  let messageListener: ((message: unknown) => void) | undefined;
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
    onDidChangeViewState: vi.fn(() => ({ dispose: vi.fn() })),
    webview: {
      cspSource: "test-webview",
      html: "",
      asWebviewUri: vi.fn((uri: vscode.Uri) => uri),
      postMessage: vi.fn(() => Promise.resolve(true)),
      onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => {
        messageListener = listener;
        return { dispose: vi.fn() };
      }),
    },
    receive(message: unknown) { messageListener?.(message); },
  } as unknown as TestWebviewPanel;
}

describe("Package include View", () => {
  beforeEach(() => createWebviewPanel.mockReset());

  it("同一功能重复打开时复用共享 Right Shell，标题、actions 和 main 遵守正式契约", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const extensionUri = vscode.Uri.file("/extension");
    const view = new KtcPackageIncludeViewController(
      extensionUri,
      { get: () => undefined, update: vi.fn() },
    );

    await view.show("/workspace");
    await view.show("/workspace");

    expect(createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(createWebviewPanel).toHaveBeenCalledWith(
      "ktAutoCode.packageIncludes",
      ktcRequireToolRegistration("packageIncludes").title,
      { viewColumn: 1, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionUri] },
    );
    expect(panel.webview.html).toContain('<ktc-right-view-shell id="packageIncludesRightShell">');
    expect(panel.webview.html).toContain('id="packageIncludesHeaderActions" class="header-actions" slot="actions"');
    expect(panel.webview.html).toContain('<main id="packageIncludesMain" class="package-includes-main">');
    expect(panel.webview.html).toContain(
      `rightShell.model={title:${JSON.stringify(ktcRequireToolRegistration("packageIncludes").title)},contextPath:"/workspace",scrollMode:'vertical'}`,
    );
    expect(panel.webview.html).toContain("contextPath:state.targetDirectory||''");
    expect(panel.webview.html).toContain("ktc-right-view-shell.js");
    expect(panel.webview.html.indexOf("ktc-right-view-shell.js"))
      .toBeLessThan(panel.webview.html.indexOf("rightShell.model="));
    expect(panel.webview.html).not.toContain("command-header");
    expect(panel.webview.html).not.toContain("view-heading");
    expect(panel.webview.html).toContain('id="preview" class="primary" type="button">预览</button>');
    expect(panel.webview.html).not.toContain('id="open-env"');
    expect(panel.webview.html).not.toContain('id="derive-package"');
    expect(panel.webview.html).not.toContain('id="package-directory"');
    expect(panel.webview.html).not.toContain('id="target-directory"');
    expect(panel.webview.html).toContain("packageDirectory:state.packageDirectory");
    expect(panel.webview.html).toContain("请在 Primary 中设置目录");
    expect(panel.reveal).toHaveBeenCalledWith(1, false);
  });

  it.each([
    { scenario: "扫描完成有命中", status: "done", rows: 1, writeState: "pending" },
    { scenario: "扫描完成零命中", status: "done", rows: 0 },
    { scenario: "尚未预览", status: "idle", rows: undefined },
    { scenario: "完成但没有预览", status: "done", rows: undefined },
    { scenario: "正在扫描", status: "running", rows: undefined },
    { scenario: "正在写入", status: "running", rows: 1 },
    { scenario: "发生错误", status: "error", rows: 1, writeState: "unverified" },
    { scenario: "写入完成回执", status: "done", rows: 1, writeState: "written" },
  ])("正式 Right $scenario 保留完整提示行；不重复统计和预览小标题，诊断及结果保留", async ({ scenario, status, rows, writeState }) => {
    const panel = fakePanel(); createWebviewPanel.mockReturnValue(panel);
    const view = new KtcPackageIncludeViewController(vscode.Uri.file("/extension"), { get: () => undefined, update: vi.fn() });
    await view.show("/workspace");
    const browser = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    const document = browser.document;
    document.body.innerHTML = panel.webview.html;
    const script = Array.from(panel.webview.html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gu), (match) => match[1])
      .find((source) => source?.includes("function render()"));
    expect(script).toBeDefined();
    let receive!: (event: { data: unknown }) => void;
    const posted = vi.fn();
    new Function("document", "window", "acquireVsCodeApi", script!)(
      document,
      { addEventListener: (_name: string, handler: typeof receive) => { receive = handler; } },
      () => ({ postMessage: posted }),
    );
    const message = `保留完整状态：${scenario}；附加说明不会被按中文内容过滤。`;
    const preview = rows === undefined ? undefined : {
      headerCount: 5, scannedFileCount: 49, ignoredDirectoryCount: 1, unsupportedFileCount: 2,
      collisions: ["Duplicate.h"], skippedHeaderCount: 1,
      rows: rows ? [{ filePath: "/workspace/a.cpp", relativePath: "a.cpp", fileName: "a.cpp", directory: "", line: 3, oldValue: '#include "A.h"', newValue: "#include <Pkg/A.h>" }] : [],
    };
    receive({ data: { type: "state", status, writeState, message, packageDirectory: "/include", packageDirectoryExists: true, targetDirectory: "/workspace", canApply: false, preview } });
    const notice = document.getElementById("status")!;
    expect(notice.textContent).toBe(message); expect(notice.hasAttribute("hidden")).toBe(false);
    expect(notice.classList.contains("error")).toBe(status === "error");
    expect(document.querySelector("#summary,.summary,.badge")).toBeNull();
    expect(document.querySelector("#packageIncludesMain h2")).toBeNull();
    expect(document.getElementById("preview")?.textContent).toBe("预览");
    expect(document.getElementById("apply")?.textContent).toBe("写入修正");
    if (preview) {
      expect(document.getElementById("warnings")?.textContent).toContain("跳过 2 个未知编码文件。");
      expect(document.getElementById("warnings")?.textContent).toContain("同名冲突 1 个");
      expect(document.getElementById("warnings")?.textContent).toContain("有 1 个头文件不在 source 目录结构中");
      if (rows) {
        expect(document.querySelectorAll("#rows tbody tr")).toHaveLength(rows);
        expect(document.querySelector("th:last-child")?.textContent).toBe("状态 / 操作");
        expect(document.querySelector("th:last-child")?.className).toBe("operations");
        expect(document.querySelector("td:last-child")?.className).toBe("operations");
        expect(document.querySelector(".write-state")?.textContent).toBe(writeState === "written" ? "已写入" : writeState === "unverified" ? "待核对" : "待写入");
        expect(panel.webview.html).toContain(".operations{position:sticky;right:0;z-index:1;background:var(--vscode-editor-background)");
        const open = document.querySelector("td.operations button")!;
        expect(open.textContent).toBe("打开"); expect(open.getAttribute("aria-label")).toBe("打开 /workspace/a.cpp 第 3 行");
        expect(open.getAttribute("title")).toBe(open.getAttribute("aria-label"));
        posted.mockClear(); open.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }));
        expect(posted.mock.calls).toEqual([[{ type: "openFile", filePath: "/workspace/a.cpp", line: 3 }]]);
        document.querySelector("tbody tr")!.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }));
        expect(posted).toHaveBeenCalledTimes(2);
      }
      else expect(document.getElementById("rows")?.textContent).toBe("未发现可修正的 include。");
    } else {
      expect(document.getElementById("warnings")?.textContent).toBe("");
      expect(document.getElementById("rows")?.textContent).toContain("请在 Primary 中设置目录");
    }
    view.dispose();
    await browser.happyDOM.close();
  });

  it("发布 packageIncludes companion，并对过期动作保持关闭", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const onDidChange = vi.fn();
    const view = new KtcPackageIncludeViewController(
      vscode.Uri.file("/extension"),
      { get: () => undefined, update: vi.fn() },
      vi.fn(),
      { onDidChange },
    );

    await view.show("/workspace");
    const snapshot = onDidChange.mock.calls.at(-1)?.[0];

    expect(snapshot).toMatchObject({
      toolId: "packageIncludes",
      lifecycle: "active",
      ready: false,
      actions: [
        { id: "preview", enabled: false },
        { id: "reveal", enabled: false },
        { id: "openEnvironment", enabled: false },
        { id: "pickEnvironmentPackageDirectory", enabled: false },
        { id: "pickPackageDirectory", enabled: false },
        { id: "updateDraft", enabled: false },
      ],
    });
    await expect(view.runPrimaryCompanionAction({
      panelId: snapshot.panelId,
      toolId: "packageIncludes",
      sessionId: snapshot.sessionId,
      revision: snapshot.revision + 1,
      actionId: "reveal",
    })).resolves.toBe(false);
    expect(panel.reveal).not.toHaveBeenCalled();
  });

  it("Right 目录草稿同步后允许 Primary 复用同一 Controller 执行预览", async () => {
    const root = mkdtempSync(join(tmpdir(), "ktc-package-primary-"));
    try {
      mkdirSync(join(root, "KtCore"));
      writeFileSync(join(root, "KtCore", "Sample.h"), "#pragma once\n", "utf8");
      writeFileSync(join(root, "sample.cpp"), '#include "Sample.h"\n', "utf8");
      const panel = fakePanel();
      createWebviewPanel.mockReturnValue(panel);
      const onDidChange = vi.fn();
      const view = new KtcPackageIncludeViewController(
        vscode.Uri.file("/extension"),
        { get: () => undefined, update: vi.fn() },
        vi.fn(),
        { onDidChange },
      );

      await view.show(root);
      panel.receive({ type: "ready" });
      panel.receive({ type: "updateDraft", packageDirectory: root, targetDirectory: root });
      await vi.waitFor(() => {
        const state = onDidChange.mock.calls.at(-1)?.[0];
        expect(state?.ready).toBe(true);
        expect(state?.summary).toEqual(expect.arrayContaining([
          { label: "工程", value: root },
          { label: "Package", value: root },
        ]));
        expect(state?.actions).toEqual([
          { id: "preview", enabled: true },
          { id: "reveal", enabled: true },
          { id: "openEnvironment", enabled: true },
          { id: "pickEnvironmentPackageDirectory", enabled: true },
          { id: "pickPackageDirectory", enabled: true },
          { id: "updateDraft", enabled: true },
        ].map((action) => expect.objectContaining(action)));
      });
      const snapshot = onDidChange.mock.calls.at(-1)?.[0];

      await expect(view.runPrimaryCompanionAction({
        panelId: snapshot.panelId,
        toolId: "packageIncludes",
        sessionId: snapshot.sessionId,
        revision: snapshot.revision,
        actionId: "preview",
      })).resolves.toBe(true);
      expect(onDidChange.mock.calls.some(([state]) => state.status === "running")).toBe(true);
      expect(onDidChange.mock.calls.at(-1)?.[0]).toMatchObject({ status: "done" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("显式 dispose 通过 panel 回调发布一次 disposed tombstone", async () => {
    const panel = fakePanel();
    createWebviewPanel.mockReturnValue(panel);
    const onDidChange = vi.fn();
    const view = new KtcPackageIncludeViewController(
      vscode.Uri.file("/extension"),
      { get: () => undefined, update: vi.fn() },
      vi.fn(),
      { onDidChange },
    );

    await view.show("/workspace");
    const live = onDidChange.mock.calls.at(-1)?.[0];
    view.dispose();
    view.dispose();

    expect(panel.dispose).toHaveBeenCalledTimes(1);
    expect(onDidChange.mock.calls.map(([snapshot]) => snapshot).filter(
      (snapshot) => snapshot.lifecycle === "disposed",
    )).toHaveLength(1);
    expect(onDidChange.mock.calls.at(-1)?.[0]).toMatchObject({
      panelId: live.panelId,
      sessionId: live.sessionId,
      revision: live.revision + 1,
      lifecycle: "disposed",
      ready: false,
      actions: [
        { id: "preview", enabled: false },
        { id: "reveal", enabled: false },
        { id: "openEnvironment", enabled: false },
        { id: "pickEnvironmentPackageDirectory", enabled: false },
        { id: "pickPackageDirectory", enabled: false },
        { id: "updateDraft", enabled: false },
      ],
    });
  });
});
