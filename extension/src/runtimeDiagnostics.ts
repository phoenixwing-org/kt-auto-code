import { randomUUID } from "node:crypto";
import * as vscode from "vscode";

const KTC_RUNTIME_DIAGNOSTICS_KIND = "kt-auto-code.runtime-diagnostics";
const KTC_PROCESS_EXPLORER_COMMAND = "workbench.action.openProcessExplorer";

export interface KtcSidebarRuntimeDiagnostics {
  readonly resolvedViews: number;
  readonly ribbonResolved: boolean;
  readonly modulePanelResolved: boolean;
  readonly ribbonVisible: boolean;
  readonly modulePanelVisible: boolean;
  readonly openToolCount: number;
  readonly openToolIds: readonly string[];
  readonly retainedToolStateCount: number;
  readonly moduleBlockProviderCount: number;
}

export interface KtcCodegenRuntimeDiagnostics {
  readonly editorPanels: number;
  readonly batchReportPanelOpen: boolean;
  readonly sessions: number;
  readonly activeSessions: number;
  readonly cleanSessions: number;
  readonly dirtySessions: number;
  readonly conflictSessions: number;
  readonly deletedSessions: number;
  readonly preflightTasks: number;
  readonly runningSessionOperations: number;
  readonly workspaceOperationActive: boolean;
  readonly batchApplyActive: boolean;
  readonly watchServiceActive: boolean;
  readonly fileSystemWatcherCount: number;
}

export interface KtcGitRuntimeDiagnostics {
  readonly catalogEntries: number;
  readonly workspaceRepositories: number;
  readonly userRepositories: number;
  readonly loadedRepositories: number;
  readonly selectedCommitCount: number;
  readonly runningWriteOperations: number;
  readonly summaryOpen: boolean;
  readonly squashDraftOpen: boolean;
}

export interface KtcRuntimeDiagnosticsReport {
  readonly kind: typeof KTC_RUNTIME_DIAGNOSTICS_KIND;
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly capturedAt: string;
  readonly extension: {
    readonly version: string;
    readonly vscodeVersion: string;
    readonly nodeVersion: string;
    readonly mode: "production" | "development" | "test";
  };
  readonly scope: {
    readonly memoryOwner: "extension-host-process";
    readonly includesOtherExtensions: true;
    readonly includesWebviewRenderer: false;
    readonly perExtensionMemoryAvailable: false;
    readonly note: string;
  };
  readonly extensionHost: {
    readonly pid: number;
    readonly uptimeSeconds: number;
    readonly memoryBytes: {
      readonly rss: number;
      readonly heapTotal: number;
      readonly heapUsed: number;
      readonly external: number;
      readonly arrayBuffers: number;
    };
  };
  readonly pluginResources: {
    readonly sidebar: KtcSidebarRuntimeDiagnostics;
    readonly codegen: KtcCodegenRuntimeDiagnostics;
    readonly git: KtcGitRuntimeDiagnostics;
    readonly workspaceFolderCount: number;
    readonly installedExtensionCount: number;
    readonly diagnosticsPanelOpen: boolean;
  };
}

export interface KtcRuntimeDiagnosticsCaptureInput {
  readonly extensionVersion: string;
  readonly extensionMode: vscode.ExtensionMode;
  readonly sidebar: KtcSidebarRuntimeDiagnostics;
  readonly codegen?: KtcCodegenRuntimeDiagnostics;
  readonly git?: KtcGitRuntimeDiagnostics;
  readonly diagnosticsPanelOpen: boolean;
}

export interface KtcRuntimeDiagnosticsSystemSource {
  readonly now: () => Date;
  readonly snapshotId: () => string;
  readonly memoryUsage: () => NodeJS.MemoryUsage;
  readonly pid: () => number;
  readonly uptime: () => number;
  readonly nodeVersion: () => string;
  readonly vscodeVersion: () => string;
  readonly workspaceFolderCount: () => number;
  readonly installedExtensionCount: () => number;
}

const KTC_RUNTIME_DIAGNOSTICS_SYSTEM: KtcRuntimeDiagnosticsSystemSource = {
  now: () => new Date(),
  snapshotId: () => randomUUID(),
  memoryUsage: () => process.memoryUsage(),
  pid: () => process.pid,
  uptime: () => process.uptime(),
  nodeVersion: () => process.version,
  vscodeVersion: () => vscode.version,
  workspaceFolderCount: () => vscode.workspace.workspaceFolders?.length ?? 0,
  installedExtensionCount: () => vscode.extensions.all.length,
};

const KTC_EMPTY_CODEGEN_DIAGNOSTICS: KtcCodegenRuntimeDiagnostics = {
  editorPanels: 0,
  batchReportPanelOpen: false,
  sessions: 0,
  activeSessions: 0,
  cleanSessions: 0,
  dirtySessions: 0,
  conflictSessions: 0,
  deletedSessions: 0,
  preflightTasks: 0,
  runningSessionOperations: 0,
  workspaceOperationActive: false,
  batchApplyActive: false,
  watchServiceActive: false,
  fileSystemWatcherCount: 0,
};

const KTC_EMPTY_GIT_DIAGNOSTICS: KtcGitRuntimeDiagnostics = {
  catalogEntries: 0,
  workspaceRepositories: 0,
  userRepositories: 0,
  loadedRepositories: 0,
  selectedCommitCount: 0,
  runningWriteOperations: 0,
  summaryOpen: false,
  squashDraftOpen: false,
};

export function ktcCaptureRuntimeDiagnostics(
  input: KtcRuntimeDiagnosticsCaptureInput,
  source: KtcRuntimeDiagnosticsSystemSource = KTC_RUNTIME_DIAGNOSTICS_SYSTEM,
): KtcRuntimeDiagnosticsReport {
  const memory = source.memoryUsage();
  return {
    kind: KTC_RUNTIME_DIAGNOSTICS_KIND,
    schemaVersion: 1,
    snapshotId: source.snapshotId(),
    capturedAt: source.now().toISOString(),
    extension: {
      version: input.extensionVersion,
      vscodeVersion: source.vscodeVersion(),
      nodeVersion: source.nodeVersion(),
      mode: ktcExtensionModeLabel(input.extensionMode),
    },
    scope: {
      memoryOwner: "extension-host-process",
      includesOtherExtensions: true,
      includesWebviewRenderer: false,
      perExtensionMemoryAvailable: false,
      note: "内存来自整个 Extension Host，包含同一 Host 内的其他扩展，不等于 KT Auto Code 独占内存。Webview Renderer 内存不包含在内。",
    },
    extensionHost: {
      pid: source.pid(),
      uptimeSeconds: Math.max(0, source.uptime()),
      memoryBytes: {
        rss: nonNegative(memory.rss),
        heapTotal: nonNegative(memory.heapTotal),
        heapUsed: nonNegative(memory.heapUsed),
        external: nonNegative(memory.external),
        arrayBuffers: nonNegative(memory.arrayBuffers),
      },
    },
    pluginResources: {
      sidebar: {
        ...input.sidebar,
        openToolIds: [...input.sidebar.openToolIds],
      },
      codegen: input.codegen ?? KTC_EMPTY_CODEGEN_DIAGNOSTICS,
      git: input.git ?? KTC_EMPTY_GIT_DIAGNOSTICS,
      workspaceFolderCount: Math.max(0, source.workspaceFolderCount()),
      installedExtensionCount: Math.max(0, source.installedExtensionCount()),
      diagnosticsPanelOpen: input.diagnosticsPanelOpen,
    },
  };
}

export interface KtcRuntimeDiagnosticsPanelOptions {
  readonly extensionVersion: string;
  readonly extensionMode: vscode.ExtensionMode;
  readonly getSidebarSnapshot: () => KtcSidebarRuntimeDiagnostics;
  readonly getCodegenSnapshot?: () => KtcCodegenRuntimeDiagnostics;
  readonly getGitSnapshot?: () => KtcGitRuntimeDiagnostics;
  readonly source?: KtcRuntimeDiagnosticsSystemSource;
}

type KtcRuntimeDiagnosticsMessage =
  | { readonly type: "refresh" }
  | { readonly type: "copyJson" }
  | { readonly type: "saveJson" }
  | { readonly type: "openProcessExplorer" };

/** 单实例、手动刷新的非模态诊断页面。采集过程不触发任何工具扫描。 */
export class KtcRuntimeDiagnosticsPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private snapshot: KtcRuntimeDiagnosticsReport | undefined;
  private json = "";

  constructor(private readonly options: KtcRuntimeDiagnosticsPanelOptions) {}

  open(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, false);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.runtimeDiagnostics",
      "KT Auto Code · 运行诊断",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [],
      },
    );
    this.panel = panel;
    panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message).catch(() => {
        void vscode.window.showErrorMessage("运行诊断操作失败，请重试。");
      });
    });
    panel.onDidDispose(() => {
      if (this.panel === panel) this.panel = undefined;
    });
    this.refresh();
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.snapshot = undefined;
    this.json = "";
    panel?.dispose();
  }

  private refresh(): void {
    this.snapshot = ktcCaptureRuntimeDiagnostics({
      extensionVersion: this.options.extensionVersion,
      extensionMode: this.options.extensionMode,
      sidebar: this.options.getSidebarSnapshot(),
      codegen: this.options.getCodegenSnapshot?.(),
      git: this.options.getGitSnapshot?.(),
      diagnosticsPanelOpen: this.panel !== undefined,
    }, this.options.source);
    this.json = `${JSON.stringify(this.snapshot, null, 2)}\n`;
    if (this.panel) this.panel.webview.html = runtimeDiagnosticsHtml(this.panel.webview, this.snapshot, this.json);
  }

  private async handleMessage(message: unknown): Promise<void> {
    const action = parseMessage(message);
    if (!action) return;
    if (action.type === "refresh") {
      this.refresh();
      return;
    }
    if (action.type === "copyJson") {
      await vscode.env.clipboard.writeText(this.json);
      void vscode.window.showInformationMessage("已复制当前运行诊断 JSON。");
      return;
    }
    if (action.type === "saveJson") {
      const target = await vscode.window.showSaveDialog({
        title: "保存 KT Auto Code 运行诊断",
        defaultUri: vscode.Uri.file(`kt-auto-code-diagnostics-${fileTimestamp(this.snapshot?.capturedAt)}.json`),
        filters: { JSON: ["json"] },
      });
      if (!target) return;
      await vscode.workspace.fs.writeFile(target, Buffer.from(this.json, "utf8"));
      void vscode.window.showInformationMessage("已保存当前运行诊断 JSON。");
      return;
    }
    const commands = await vscode.commands.getCommands(true);
    if (commands.includes(KTC_PROCESS_EXPLORER_COMMAND)) {
      try {
        await vscode.commands.executeCommand(KTC_PROCESS_EXPLORER_COMMAND);
        return;
      } catch {
        // Undocumented workbench command; fall back to the stable manual route.
      }
    }
    void vscode.window.showInformationMessage("请使用“帮助 → 打开进程资源管理器”查看 Window、Extension Host 与 Webview 进程内存。");
  }
}

export function ktcRegisterRuntimeDiagnostics(
  context: vscode.ExtensionContext,
  getSidebarSnapshot: () => KtcSidebarRuntimeDiagnostics,
  getCodegenSnapshot?: () => KtcCodegenRuntimeDiagnostics,
  getGitSnapshot?: () => KtcGitRuntimeDiagnostics,
): KtcRuntimeDiagnosticsPanel {
  const version = typeof context.extension.packageJSON.version === "string"
    ? context.extension.packageJSON.version
    : "unknown";
  const panel = new KtcRuntimeDiagnosticsPanel({
    extensionVersion: version,
    extensionMode: context.extensionMode,
    getSidebarSnapshot,
    ...(getCodegenSnapshot ? { getCodegenSnapshot } : {}),
    ...(getGitSnapshot ? { getGitSnapshot } : {}),
  });
  context.subscriptions.push(
    panel,
    vscode.commands.registerCommand("ktAutoCode.runtimeDiagnostics.open", () => panel.open()),
  );
  return panel;
}

function parseMessage(value: unknown): KtcRuntimeDiagnosticsMessage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const type = (value as { readonly type?: unknown }).type;
  return type === "refresh" || type === "copyJson" || type === "saveJson" || type === "openProcessExplorer"
    ? { type }
    : undefined;
}

function runtimeDiagnosticsHtml(
  webview: vscode.Webview,
  report: KtcRuntimeDiagnosticsReport,
  json: string,
): string {
  const nonce = randomUUID().replaceAll("-", "");
  const memory = report.extensionHost.memoryBytes;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    body { padding: 18px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px var(--vscode-font-family); }
    header, .actions, .metrics { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    header { justify-content: space-between; }
    h1 { margin: 0; font-size: 18px; }
    .note { margin: 12px 0; padding: 9px 10px; border-left: 3px solid var(--vscode-editorWarning-foreground); background: var(--vscode-textBlockQuote-background); line-height: 1.5; }
    button { padding: 5px 10px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .metrics { margin: 14px 0; align-items: stretch; }
    .metric { min-width: 130px; padding: 9px 10px; border: 1px solid var(--vscode-panel-border); }
    .metric span { display: block; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .metric strong { display: block; margin-top: 4px; font-size: 17px; }
    pre { overflow: auto; max-height: calc(100vh - 270px); padding: 12px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family); font-size: 12px; line-height: 1.45; white-space: pre; }
  </style>
</head>
<body>
  <header>
    <h1>运行诊断</h1>
    <div class="actions">
      <button type="button" data-action="refresh">刷新</button>
      <button type="button" data-action="copyJson">复制 JSON</button>
      <button type="button" data-action="saveJson">保存 JSON</button>
      <button type="button" data-action="openProcessExplorer">进程资源管理器</button>
    </div>
  </header>
  <p class="note">${escapeHtml(report.scope.note)}</p>
  <div class="metrics">
    ${metric("RSS", mib(memory.rss))}
    ${metric("Heap 已用", mib(memory.heapUsed))}
    ${metric("Heap 总量", mib(memory.heapTotal))}
    ${metric("已打开 Block", String(report.pluginResources.sidebar.openToolCount))}
    ${metric("Codegen View", String(report.pluginResources.codegen.editorPanels))}
    ${metric("Codegen Session", String(report.pluginResources.codegen.sessions))}
    ${metric("Git 已载 commit", String(report.pluginResources.git.selectedCommitCount))}
  </div>
  <pre aria-label="运行诊断 JSON">${escapeHtml(json)}</pre>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    for (const button of document.querySelectorAll("[data-action]")) {
      button.addEventListener("click", () => vscode.postMessage({ type: button.dataset.action }));
    }
  </script>
</body>
</html>`;
}

function ktcExtensionModeLabel(mode: vscode.ExtensionMode): "production" | "development" | "test" {
  if (mode === vscode.ExtensionMode.Development) return "development";
  if (mode === vscode.ExtensionMode.Test) return "test";
  return "production";
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function mib(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function fileTimestamp(value: string | undefined): string {
  return (value ?? new Date().toISOString()).replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
