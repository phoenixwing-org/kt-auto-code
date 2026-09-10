// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { getPanelHtml } from "./panelHtml.js";
import "./codeAssistantPrimaryEntry.js";

type PrimarySurface = HTMLElement & { model: Record<string, unknown> };

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

function dispatchHost(message: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data: message }));
}

function dispatchAction(target: Element, type: string, detail: unknown): void {
  target.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

describe("Code Assistant formal Primary bridge", () => {
  it("projects all five Host models, persists local choices, and routes only explicit active-surface actions", () => {
    const html = panelHtml();
    const bodyStart = html.indexOf("<body>");
    const scriptStart = html.indexOf('<script nonce="', bodyStart);
    const inlineScript = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/gu)].at(-1)?.[1];
    expect(bodyStart).toBeGreaterThan(-1);
    expect(scriptStart).toBeGreaterThan(bodyStart);
    expect(inlineScript).toBeTruthy();

    document.body.innerHTML = html.slice(bodyStart + "<body>".length, scriptStart);
    for (const id of ["auto-build-cleanup-dialog", "run-cleanup-dialog"]) {
      const dialog = document.getElementById(id) as HTMLElement & { close(): void; showModal(mode?: unknown): void };
      dialog.close = vi.fn();
      dialog.showModal = vi.fn();
    }
    const sent: unknown[] = [];
    const persisted: unknown[] = [];
    vi.stubGlobal("acquireVsCodeApi", () => ({
      getState: () => undefined,
      setState: (value: unknown) => { persisted.push(value); },
      postMessage: (message: unknown) => { sent.push(message); },
    }));
    new Function(inlineScript!)();

    expect(sent).toEqual([{ type: "ready" }]);
    const tools = [
      { id: "headerAscii", title: "头文件 ASCII 修正", shortTitle: "ASCII 修正", description: "header", moduleId: "code" },
      { id: "encodingFix", title: "编码修正", description: "encoding", moduleId: "code" },
      { id: "reorderMembers", title: "C++ 成员排序", shortTitle: "成员排序", description: "reorder", moduleId: "code" },
      { id: "uuidReplace", title: "UUID 替换", description: "uuid", moduleId: "code" },
      { id: "caaDialog", title: "CAA UI", description: "caa", moduleId: "code" },
    ];
    const openToolIds = tools.map(tool => tool.id);
    dispatchHost({
      type: "init",
      tools,
      activeToolId: "headerAscii",
      openToolIds,
      codeAssistantTreeUiState: {
        navigatorMode: "outline", showLabels: true, treeExpanded: true,
        cppOrganizeExpanded: true, fileToolsExpanded: true, caaExpanded: true,
        reorderActionsExpanded: true, reorderResultsExpanded: true,
      },
      workspaceLabel: "fixture",
      scope: { includeHeaders: true, includeSource: false, includeMarkdown: true },
      toolOptions: {
        headerAscii: { preserveGbk: true },
        encodingFix: { stripBom: true, encodingDefaultTarget: "gbk" },
      },
      sidebarStyle: "ribbon",
      directoryVisible: true,
      ribbonLayout: { pinnedToolIds: [], toolOrder: [] },
      workingContext: {
        selectedDirectory: "/workspace/project", resolvedDirectory: "/workspace/project",
        label: "project", pluginIgnoreEnabled: true, ignoreEnabled: true,
        builtInIgnoreEnabled: true, gitIgnoreEnabled: true, customIgnoreEnabled: false,
        gitIgnoreExists: true,
      },
      presentation: "ribbon",
      recentWorkingDirectories: { workspace: [], external: [], options: [] },
      workspaceFileScopes: [],
      selectedWorkspaceFileScopes: {},
      moduleState: { installed: ["code"], enabled: ["code"], visible: ["code"], known: ["code"], active: "code" },
      extensionInstallations: [],
    });
    dispatchHost({ type: "state", toolId: "headerAscii", state: {
      status: "done", message: "ASCII 扫描完成", scanned: 2, issueFiles: 1,
      results: [{
        file: "include/a.h", relativePath: "include/a.h", fullPath: "/workspace/project/include/a.h",
        issueCount: 1, topLine: 7,
        issues: [{ line: 7, column: 3, byte: 128, kind: "quote", fromLabel: "弯引号", toLabel: "引号", context: "x" }],
      }],
    } });

    const header = document.querySelector<PrimarySurface>("#header-ascii-primary")!;
    const encoding = document.querySelector<PrimarySurface>("#encoding-fix-primary")!;
    const reorder = document.querySelector<PrimarySurface>("#reorder-primary")!;
    const uuid = document.querySelector<PrimarySurface>("#uuid-primary")!;
    const caa = document.querySelector<PrimarySurface>("#caa-primary")!;
    expect(header.hidden).toBe(false);
    expect(header.model).toMatchObject({
      kind: "headerAscii", directory: "/workspace/project", preserveGbk: true,
      summary: "已预检 2 个文件 · 1 个问题文件", rows: [{ id: "/workspace/project/include/a.h" }],
    });
    expect([encoding.hidden, reorder.hidden, uuid.hidden, caa.hidden]).toEqual([true, true, true, true]);
    expect(sent).toEqual([{ type: "ready" }]);

    dispatchAction(header, "ktc-text-repair-primary-action", { action: "setOption", key: "showDetails", value: true });
    expect(header.model.showDetails).toBe(true);
    expect(persisted.at(-1)).toMatchObject({ showDetails: true, showEncDetails: false, uuidStrategy: "map_per_value" });
    expect(sent).toEqual([{ type: "ready" }]);
    dispatchHost({ type: "state", toolId: "headerAscii", state: { status: "running", message: "正在扫描" } });
    expect(header.model.busy).toBe(true);
    dispatchAction(header, "ktc-text-repair-primary-action", { action: "scan" });
    expect(sent).toEqual([{ type: "ready" }]);
    dispatchHost({ type: "state", toolId: "headerAscii", state: { status: "done", message: "扫描完成" } });
    dispatchAction(header, "ktc-text-repair-primary-action", { action: "scan" });

    dispatchHost({ type: "openTools", activeToolId: "encodingFix", openToolIds });
    dispatchHost({ type: "state", toolId: "encodingFix", state: {
      status: "done", message: "编码预检完成", scanned: 1, issueFiles: 1,
      encodingResults: [{
        file: "src/a.cpp", relativePath: "src/a.cpp", fullPath: "/workspace/project/src/a.cpp",
        detected: "UTF-8", expected: "GBK", suggestedAction: "转 GBK", status: "mismatch",
      }],
    } });
    expect(encoding.hidden).toBe(false);
    expect(encoding.model).toMatchObject({
      kind: "encodingFix", targetEncoding: "gbk", stripBom: true,
      status: "编码预检完成", rows: [{ id: "/workspace/project/src/a.cpp" }],
    });
    const afterHeaderScan = sent.length;
    dispatchAction(header, "ktc-text-repair-primary-action", { action: "fix" });
    expect(sent).toHaveLength(afterHeaderScan);
    dispatchAction(encoding, "ktc-text-repair-primary-action", { action: "setOption", key: "showDetails", value: true });
    expect(encoding.model.showDetails).toBe(true);
    expect(persisted.at(-1)).toMatchObject({ showDetails: true, showEncDetails: true });
    dispatchAction(encoding, "ktc-text-repair-primary-action", { action: "settings" });

    dispatchHost({ type: "openTools", activeToolId: "reorderMembers", openToolIds });
    dispatchHost({ type: "state", toolId: "reorderMembers", state: {
      status: "done", message: "排序扫描完成", scanned: 3,
      reorderResults: [{
        uri: "file:///workspace/project/include/b.h", relativePath: "include/b.h", kind: "header",
        encoding: "UTF-8", changed: true, state: "pending", warnings: [],
      }],
      reorderSelectedUris: ["file:///workspace/project/include/b.h"],
    } });
    expect(reorder.hidden).toBe(false);
    expect(reorder.model).toMatchObject({ toolId: "reorderMembers", directory: "/workspace/project", message: "排序扫描完成" });
    dispatchAction(reorder, "ktc-selection-primary-action", { toolId: "reorderMembers", kind: "scan" });

    dispatchHost({ type: "openTools", activeToolId: "uuidReplace", openToolIds });
    dispatchHost({ type: "state", toolId: "uuidReplace", state: { status: "idle", message: "UUID 待扫描" } });
    expect(uuid.hidden).toBe(false);
    expect(uuid.model).toMatchObject({ toolId: "uuidReplace", uuidStrategy: "map_per_value", message: "UUID 待扫描" });
    dispatchAction(uuid, "ktc-selection-primary-action", { toolId: "uuidReplace", kind: "setStrategy", strategy: "fresh_per_hit" });
    expect(uuid.model.uuidStrategy).toBe("fresh_per_hit");
    expect(persisted.at(-1)).toMatchObject({ uuidStrategy: "fresh_per_hit" });
    dispatchHost({ type: "state", toolId: "uuidReplace", state: {
      status: "done", message: "旧策略扫描完成", uuidStrategy: "map_per_value",
      uuidResults: [{
        uri: "file:///workspace/project/Uuid.cpp", relativePath: "Uuid.cpp", encoding: "UTF-8",
        hitCount: 1, firstLine: 4, state: "pending", hasApplied: false, warnings: [], mappings: [],
      }],
      uuidSelectedUris: ["file:///workspace/project/Uuid.cpp"],
    } });
    expect(uuid.model).toMatchObject({
      uuidStrategy: "fresh_per_hit",
      uuid: { selectedIds: [], capabilities: { selection: false, apply: false } },
    });
    expect(String(uuid.model.message)).toContain("生成策略已改变，请重新扫描");
    dispatchHost({ type: "openTools", activeToolId: "reorderMembers", openToolIds });
    dispatchHost({ type: "openTools", activeToolId: "uuidReplace", openToolIds });
    expect(uuid.model.uuidStrategy).toBe("fresh_per_hit");
    const beforeSpoof = sent.length;
    dispatchAction(uuid, "ktc-selection-primary-action", { toolId: "reorderMembers", kind: "scan" });
    dispatchAction(reorder, "ktc-selection-primary-action", { toolId: "reorderMembers", kind: "scan" });
    expect(sent).toHaveLength(beforeSpoof);
    dispatchAction(uuid, "ktc-selection-primary-action", { toolId: "uuidReplace", kind: "scan", uuidStrategy: "fresh_per_hit" });

    dispatchHost({ type: "openTools", activeToolId: "caaDialog", openToolIds });
    dispatchHost({ type: "state", toolId: "caaDialog", state: {
      status: "done", message: "已找到 1 个 CAA 文件", caaSettingsText: "R32 / VS2022",
      caaDeskConnection: { status: "online", text: "Desk Tools 已连接", checkedAt: "2026-09-10T12:00:00Z" },
      caaDialogResults: [{ uri: "file:///workspace/project/Caa.cpp", relativePath: "Caa.cpp", selected: true }],
    } });
    expect(caa.hidden).toBe(false);
    expect(caa.model).toMatchObject({
      running: false, canScan: true, resultActionsEnabled: true,
      message: "已找到 1 个 CAA 文件", environmentText: "工程环境：R32 / VS2022",
      connection: { status: "online", text: "Desk Tools 已连接" },
      rows: [{ uri: "file:///workspace/project/Caa.cpp", selected: true }],
    });
    dispatchAction(caa, "ktc-caa-primary-action", { actionId: "checkConnection" });
    dispatchAction(caa, "ktc-caa-primary-action", { actionId: "openExternal", uri: "file:///workspace/project/Caa.cpp" });

    expect(sent).toEqual([
      { type: "ready" },
      { type: "run", toolId: "headerAscii", action: "scan" },
      { type: "openEncodingSettings", toolId: "encodingFix" },
      { type: "run", toolId: "reorderMembers", action: "scan" },
      { type: "run", toolId: "uuidReplace", action: "scan", uuidStrategy: "fresh_per_hit" },
      { type: "run", toolId: "caaDialog", action: "checkConnection" },
      { type: "caaDialogAction", toolId: "caaDialog", action: "openExternal", uri: "file:///workspace/project/Caa.cpp" },
    ]);
  });
});
