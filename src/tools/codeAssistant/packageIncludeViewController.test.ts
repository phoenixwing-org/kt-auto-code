import { beforeEach, describe, expect, it, vi } from "vitest";
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
      `rightShell.model={title:${JSON.stringify(ktcRequireToolRegistration("packageIncludes").title)},scrollMode:'vertical'}`,
    );
    expect(panel.webview.html).toContain("ktc-right-view-shell.js");
    expect(panel.webview.html.indexOf("ktc-right-view-shell.js"))
      .toBeLessThan(panel.webview.html.indexOf("rightShell.model="));
    expect(panel.webview.html).not.toContain("command-header");
    expect(panel.webview.html).not.toContain("view-heading");
    expect(panel.webview.html).toContain('id="preview" class="primary" type="button">预览</button>');
    expect(panel.webview.html).toContain('id="open-env" type="button">工程环境</button>');
    expect(panel.webview.html).toContain('id="derive-package"');
    expect(panel.webview.html).toContain("推导…");
    expect(panel.webview.html).not.toContain('id="use-include-root"');
    expect(panel.webview.html).not.toContain('id="use-root-directory"');
    expect(panel.webview.html).toContain('<label for="target-directory">工程目录</label>');
    expect(panel.webview.html).toContain('id="target-directory" type="text" spellcheck="false"');
    expect(panel.webview.html).not.toContain('id="target-directory" type="text" readonly');
    expect(panel.webview.html).toContain("targetDirectory:els.targetDirectory.value");
    expect(panel.webview.html).toContain("type:'updateDraft'");
    expect(panel.webview.html).toContain("els.packageDirectory.onchange=syncDraft");
    expect(panel.reveal).toHaveBeenCalledWith(1, false);
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
      ],
    });
  });
});
