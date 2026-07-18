import * as vscode from "vscode";
import { basename, extname, isAbsolute, relative } from "node:path";
import {
  KtCodegenController,
  type KtCodegenDiagnostic,
  type KtCodegenTableData,
} from "@phoenix-wing/kt-codegen";
import type {
  KtTool,
  KtcCodegenMetaField,
  KtcCodegenDocumentSummary,
  KtcCodegenSourceCandidateSummary,
  ToolPanelModel,
  ToolRunContext,
  WebviewInboundMessage,
} from "../types.js";
import type {
  KtcCodegenControlMessage,
  KtcCodegenEditorInboundMessage,
  KtcCodegenSidebarActionMessage,
} from "./editorContracts.js";
import { ktcRouteCodegenEditorMessage } from "./editorMessageRouter.js";
import { KtcCodegenEditorSessionPresenter } from "./editorSessionPresenter.js";
import {
  ktcRunCodegenPreflight,
  ktcScanCodegenCandidates,
} from "./preflight.js";
import { KtcCodegenDocumentModel } from "./documentModel.js";
import {
  KtcCodegenDocumentService,
  ktcCodegenClassifySaveDiskState,
  ktcCodegenFingerprint,
  ktcCodegenIsFileNotFoundError,
  ktcCodegenDiagnosticsText,
  type KtcDiscoveredCodegenDocument,
} from "./documentService.js";
import { KtcCodegenEditorViewController } from "./editorViewController.js";
import { KtcCodegenWorkspaceDiscoveryService } from "./workspaceDiscovery.js";
import { KtcCodegenWorkspaceWatchService } from "./workspaceWatchService.js";
import { ktcCodegenRuntimeDiagnosticsText } from "./diagnostics.js";
import { KtcCodegenFileEventQueue } from "./fileEventQueue.js";
import {
  KtcCodegenWorkspaceOperationCoordinator,
  type KtcCodegenWorkspaceOperationKind,
} from "./workspaceOperationCoordinator.js";
import { ktcFindCodegenControlLocation } from "./controlNavigation.js";
import { KtcCodegenControlSessionController } from "./controlSessionController.js";
import { ktcResolveCodegenWorkspaceRoot } from "./workspaceRootResolver.js";
import {
  ktcShouldRetainCodegenSessionInList,
  ktcSortCodegenDocumentList,
} from "./workspaceSessionPolicy.js";
import { KtcCodegenProblemReporter } from "./problemReporter.js";
import {
  ktcDecodeCodegenSource,
  ktcEncodeCodegenSource,
  type KtcDecodedCodegenSource,
} from "./sourceCodec.js";
import {
  ktcProjectCodegenApply,
  type KtcCodegenApplyRegionChange,
} from "./sourceApply.js";
import {
  KtcCodegenApplyConcurrentChangeError,
  ktcCommitCodegenApplyWrites,
} from "./sourceApplyTransaction.js";
import {
  ktcCodegenAppliedRegionLog,
  ktcCodegenApplyDiagnosticLog,
  ktcCodegenApplyPlanLogs,
} from "./applyLog.js";
import {
  ktcCodegenReceiptWorkspacePath,
  ktcCreateCodegenApplyReceipt,
} from "./applyReceipt.js";
import { ktcWriteCodegenApplyReceipt } from "./applyReceiptStore.js";

const TOOL_ID = "codegen";

const CODEGEN_META_FIELDS = new Set<KtcCodegenMetaField>([
  "namePrefix",
  "nameMiddle",
  "nameSpace",
  "appendFunction",
]);

let runContextFactory: (() => ToolRunContext) | undefined;

export function setCodegenRunContextFactory(factory: () => ToolRunContext): void {
  runContextFactory = factory;
}

function currentContext(): ToolRunContext | undefined {
  return runContextFactory?.();
}

class KtcCodegenWorkspaceController implements vscode.Disposable {
  private readonly controlSessions = new KtcCodegenControlSessionController();
  private readonly sessionPresenter = new KtcCodegenEditorSessionPresenter({
    showEditor: (model) => {
      if (!this.editorViews) throw new Error("Codegen View 尚未初始化");
      this.editorViews.show(model);
    },
    setDocumentState: (uri, fileName, dirty, externalConflict) => {
      this.editorViews?.setDocumentState(uri, fileName, dirty, externalConflict);
    },
    postEditor: (uri, message) => this.editorViews?.post(uri, message),
    publishProblems: (uri, fsPath, diagnostics) => {
      this.problemReporter?.publish(uri, fsPath, diagnostics);
    },
  }, this.controlSessions);
  private readonly sessions = new Map<string, KtcCodegenDocumentModel>();
  private readonly discovered = new Map<string, KtcDiscoveredCodegenDocument>();
  private readonly documents = new KtcCodegenDocumentService(vscode.workspace.fs);
  private readonly discovery = new KtcCodegenWorkspaceDiscoveryService(this.documents);
  private candidates: KtcCodegenSourceCandidateSummary[] = [];
  private activeUri: string | undefined;
  private initializedRoot: string | null = null;
  private activated = false;
  private candidateIndexReady = false;
  private readonly staleSourceRoots = new Set<string>();
  private csvConvertedInSession = 0;
  private csvDeduplicatedInSession = 0;
  private csvConflictCount = 0;
  private editorViews?: KtcCodegenEditorViewController;
  private problemReporter?: KtcCodegenProblemReporter;
  private workspaceWatch?: KtcCodegenWorkspaceWatchService;
  private extensionVersion = "unknown";
  private readonly internalWrites = new Set<string>();
  private readonly preflightTasks = new Map<string, vscode.CancellationTokenSource>();
  private readonly externalJsonEvents = new KtcCodegenFileEventQueue();
  private readonly workspaceOperations = new KtcCodegenWorkspaceOperationCoordinator<
    vscode.CancellationTokenSource
  >();

  initialize(context: vscode.ExtensionContext): void {
    const extensionUri = context.extensionUri;
    this.extensionVersion = String((context.extension.packageJSON as { version?: unknown }).version ?? "unknown");
    this.problemReporter = new KtcCodegenProblemReporter();
    this.editorViews = new KtcCodegenEditorViewController(extensionUri, {
      onMessage: (uri, message) => {
        const session = this.sessions.get(uri);
        const ctx = currentContext();
        if (session && ctx) void this.handleEditorMessage(session, message, ctx);
      },
      onActive: (uri) => {
        const session = this.sessions.get(uri);
        const ctx = currentContext();
        if (session && ctx) this.setActive(session, ctx);
      },
      onDispose: (uri) => {
        const session = this.sessions.get(uri);
        const ctx = currentContext();
        if (!session || !ctx) return;
        this.problemReporter?.clear(uri);
        const preflight = this.preflightTasks.get(uri);
        if (preflight) {
          this.preflightTasks.delete(uri);
          preflight.cancel();
        }
        if (this.activeUri === uri) this.activeUri = undefined;
        this.publish(ctx, session.dirty
          ? `${session.identity.fileName} 的 View 已关闭；未保存内容尚未写盘。`
          : `${session.identity.fileName} 的 View 已关闭。`);
      },
    });
    this.workspaceWatch = new KtcCodegenWorkspaceWatchService({
      onJson: (uri, event) => {
        if (this.internalWrites.has(uri.toString())) return;
        void this.externalJsonEvents.enqueue(
          uri.toString(),
          () => this.handleExternalJson(uri, event),
        );
      },
      onDiscoveryRefresh: () => {
        this.requestWorkspaceOperation("discovery");
      },
      onSource: (uri) => this.handleSourceFileChange(uri),
      onCandidateRefresh: () => {
        this.requestWorkspaceOperation("candidates");
      },
    });
    this.workspaceWatch.start();
  }

  dispose(): void {
    this.editorViews?.dispose();
    this.problemReporter?.dispose();
    this.problemReporter = undefined;
    this.workspaceWatch?.dispose();
    this.workspaceWatch = undefined;
    for (const task of this.preflightTasks.values()) {
      task.cancel();
      task.dispose();
    }
    this.preflightTasks.clear();
    this.workspaceOperations.reset(true);
    this.activated = false;
    this.sessions.clear();
    this.discovered.clear();
    this.staleSourceRoots.clear();
  }

  async activate(ctx: ToolRunContext): Promise<void> {
    this.activated = true;
    if (this.initializedRoot !== this.workspaceKey(ctx)) await this.refresh(ctx);
    else this.publish(ctx, "选择一份 JSON，在当前编辑区打开表格 View。");
  }

  workspaceScopeChanged(ctx: ToolRunContext): void {
    this.workspaceOperations.reset();
    for (const [uri, task] of this.preflightTasks) {
      this.preflightTasks.delete(uri);
      task.cancel();
      const session = this.sessions.get(uri);
      if (session) this.sessionPresenter.post(session, { type: "codegenPreflightState", running: false });
    }
    this.candidates = [];
    this.candidateIndexReady = false;
    let invalidated = 0;
    for (const session of this.sessions.values()) {
      if (session.preflight) invalidated += 1;
      session.setPreflight(undefined);
      this.sessionPresenter.publishControls(session);
      this.sessionPresenter.post(session, {
        type: "codegenStatus",
        status: "idle",
        message: "工作集范围已变化，请重新扫描候选并执行预检。",
      });
    }
    this.publish(
      ctx,
      `Codegen 工作集范围已更新；候选列表已清空${invalidated ? `，${invalidated} 份预检计划已失效` : ""}。`,
    );
  }

  workspaceFoldersChanged(): void {
    if (!this.activated) return;
    const ctx = currentContext();
    if (!ctx) return;
    this.initializedRoot = null;
    this.workspaceScopeChanged(ctx);
    void this.refresh(ctx);
  }

  async handleSidebarAction(
    message: KtcCodegenSidebarActionMessage,
    ctx: ToolRunContext,
  ): Promise<void> {
    if (message.action === "refresh") await this.refresh(ctx);
    else if (message.action === "openJson") await this.pickJson(ctx);
    else if (message.action === "importCsv") await this.importCsv(ctx);
    else if (message.action === "openDocument" && message.uri) await this.openKnownDocument(message.uri, ctx);
    else if (message.action === "scanCandidates") await this.scanCandidates(ctx);
    else if (message.action === "cancelOperation") this.workspaceOperations.cancelCurrent();
    else if (message.action === "copyDiagnostics") await this.copyDiagnostics(ctx);
    else if (message.action === "openCandidate" && message.uri) await this.openCandidate(message.uri, ctx);
    else if (message.action === "updateMeta" && message.uri && message.field
      && CODEGEN_META_FIELDS.has(message.field)) {
      this.updateMeta(message.uri, message.field, message.value ?? "", ctx);
    }
  }

  async handleSidebarControlAction(
    message: KtcCodegenControlMessage,
    ctx: ToolRunContext,
  ): Promise<void> {
    await this.handleControlMessage(message, ctx);
  }

  private async refresh(ctx: ToolRunContext): Promise<void> {
    if (this.initializedRoot !== this.workspaceKey(ctx)) {
      this.candidates = [];
      this.candidateIndexReady = false;
      this.csvConvertedInSession = 0;
      this.csvDeduplicatedInSession = 0;
      this.csvConflictCount = 0;
    }
    const cancellation = this.workspaceOperations.begin(
      "discovery",
      new vscode.CancellationTokenSource(),
    );
    let released = false;
    const release = (): boolean => {
      if (released) return true;
      released = this.workspaceOperations.finish(cancellation);
      return released;
    };
    ctx.postState({
      status: "running",
      message: "正在查找 Codegen JSON/CSV…",
      codegenOperation: "discovery",
    });
    try {
      const result = await this.discovery.discover(
        this.workspaceRoots(ctx),
        ctx.log,
        cancellation.token,
        (message) => this.postWorkspaceOperationProgress(cancellation, ctx, message),
      );
      if (!release()) return;
      this.initializedRoot = this.workspaceKey(ctx);
      this.discovered.clear();
      for (const document of result.documents) this.discovered.set(document.uri.toString(), document);
      const rootPaths = this.workspaceRoots(ctx).map((uri) => uri.fsPath);
      for (const session of this.sessions.values()) {
        if (ktcShouldRetainCodegenSessionInList({
          documentPath: session.identity.fsPath,
          open: Boolean(this.editorViews?.isOpen(session.identity.uri)),
          dirty: session.dirty,
          externalConflict: session.hasExternalConflict,
        }, rootPaths)) this.rememberSession(session);
      }
      this.csvConvertedInSession += result.convertedCount;
      this.csvDeduplicatedInSession += result.deduplicatedCount;
      this.csvConflictCount = result.conflictCount;
      const count = this.discovered.size;
      const conversionSummary = [
        this.csvConvertedInSession ? `本会话自动转换 ${this.csvConvertedInSession}` : "",
        this.csvDeduplicatedInSession ? `本会话清理重复 CSV ${this.csvDeduplicatedInSession}` : "",
        this.csvConflictCount ? `当前保留冲突/失败 CSV ${this.csvConflictCount}` : "",
      ].filter(Boolean).join("；");
      this.publish(ctx, count
        ? `发现 ${count} 份 Codegen JSON${conversionSummary ? `；${conversionSummary}` : ""}。`
        : `扫描 ${result.scannedJsonCount} 份 JSON，未识别到 Codegen v4 配置${conversionSummary ? `；${conversionSummary}` : ""}。`, "done");
    } catch (error) {
      if (!release()) return;
      if (error instanceof vscode.CancellationError) {
        this.publish(ctx, "Codegen 列表扫描已取消。");
        return;
      }
      this.initializedRoot = null;
      this.publish(ctx, `Codegen 列表扫描失败：${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      cancellation.dispose();
      if (released) this.startNextWorkspaceOperation();
    }
  }

  private requestWorkspaceOperation(kind: KtcCodegenWorkspaceOperationKind): void {
    if (kind === "discovery" && this.initializedRoot === null) return;
    if (!this.workspaceOperations.request(kind)) return;
    const ctx = currentContext();
    if (!ctx) return;
    if (kind === "discovery") void this.refresh(ctx);
    else void this.scanCandidates(ctx);
  }

  private startNextWorkspaceOperation(): void {
    const ctx = currentContext();
    if (!ctx) return;
    const next = this.workspaceOperations.takeNext();
    if (!next) return;
    if (next === "discovery") void this.refresh(ctx);
    else void this.scanCandidates(ctx);
  }

  private workspaceRoots(ctx: ToolRunContext): vscode.Uri[] {
    const folders = (vscode.workspace.workspaceFolders ?? [])
      .map((folder) => folder.uri)
      .filter((uri) => uri.scheme === "file");
    if (folders.length) return folders;
    return ctx.workspaceRoot ? [vscode.Uri.file(ctx.workspaceRoot)] : [];
  }

  private workspaceKey(ctx: ToolRunContext): string {
    return this.workspaceRoots(ctx).map((uri) => uri.toString()).join("|");
  }

  private async scanCandidates(ctx: ToolRunContext): Promise<void> {
    const roots = this.workspaceRoots(ctx);
    if (!roots.length) {
      this.publish(ctx, "请先打开工作区再扫描控制符候选。", "error");
      return;
    }
    const cancellation = this.workspaceOperations.begin(
      "candidates",
      new vscode.CancellationTokenSource(),
    );
    let released = false;
    const release = (): boolean => {
      if (released) return true;
      released = this.workspaceOperations.finish(cancellation);
      return released;
    };
    ctx.postState({
      status: "running",
      message: "正在扫描含控制符的候选源码…",
      codegenOperation: "candidates",
    });
    try {
      let indexedFileCount = 0;
      const candidates = new Map<string, KtcCodegenSourceCandidateSummary>();
      for (const root of roots) {
        const result = await ktcScanCodegenCandidates({
          workspaceRoot: root.fsPath,
          scopeId: ctx.workspaceFileScopeId,
          forceRefresh: this.staleSourceRoots.has(root.fsPath),
          cancellationToken: cancellation.token,
          reportProgress: (message) => this.postWorkspaceOperationProgress(
            cancellation,
            ctx,
            roots.length > 1 ? `${basename(root.fsPath)}：${message}` : message,
          ),
        });
        this.staleSourceRoots.delete(root.fsPath);
        indexedFileCount += result.indexedFileCount;
        for (const candidate of result.candidates) {
          candidates.set(candidate.uri, roots.length > 1
            ? { ...candidate, displayPath: `${basename(root.fsPath)}/${candidate.displayPath}` }
            : candidate);
        }
        ctx.log(`[Codegen][Candidates] root=${root.fsPath}；index=${result.indexPath}；revision=${result.revision}；files=${result.indexedFileCount}；candidates=${result.candidates.length}`);
      }
      if (!release()) return;
      this.candidates = [...candidates.values()]
        .sort((left, right) => left.displayPath.localeCompare(right.displayPath));
      this.candidateIndexReady = true;
      this.publish(ctx, `候选扫描完成：${roots.length} 个工作区根、${indexedFileCount} 个源码文件中，${this.candidates.length} 个含控制符。`);
    } catch (error) {
      if (!release()) return;
      if (error instanceof vscode.CancellationError) {
        this.publish(ctx, "候选源码扫描已取消。");
        return;
      }
      this.publish(ctx, `候选扫描失败：${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      cancellation.dispose();
      if (released) this.startNextWorkspaceOperation();
    }
  }

  private postWorkspaceOperationProgress(
    cancellation: vscode.CancellationTokenSource,
    ctx: ToolRunContext,
    message: string,
  ): void {
    if (!this.workspaceOperations.isCurrent(cancellation) || cancellation.token.isCancellationRequested) return;
    ctx.postState({ status: "running", message, codegenOperation: this.workspaceOperations.kind });
  }

  private async openCandidate(uriString: string, ctx: ToolRunContext): Promise<void> {
    if (!this.candidates.some((candidate) => candidate.uri === uriString)) {
      this.publish(ctx, "候选列表已变化，请重新扫描。", "error");
      return;
    }
    await vscode.window.showTextDocument(vscode.Uri.parse(uriString), { preview: true });
  }

  private async copyDiagnostics(ctx: ToolRunContext): Promise<void> {
    const sessions = [...this.sessions.values()].map((session) => {
      const preflight = session.preflight;
      return {
        fileName: session.identity.fileName,
        revision: session.revision,
        dirty: session.dirty,
        externalState: session.externalState,
        selectedBlockCount: session.selectedBlockKeys.length,
        singleSelectionMode: session.singleSelectionMode,
        ...(preflight ? {
          preflight: {
            markerIndexRevision: preflight.markerIndexRevision,
            candidateFileCount: preflight.candidateFileCount,
            regionCount: preflight.plan.markerRegions.length,
            diagnosticCount: preflight.plan.diagnostics.length,
            canApply: preflight.plan.canApply,
            reused: preflight.reused,
          },
        } : {}),
      };
    });
    const text = ktcCodegenRuntimeDiagnosticsText({
      createdAt: new Date().toISOString(),
      vscodeVersion: vscode.version,
      extensionVersion: this.extensionVersion,
      workspaceRoots: this.workspaceRoots(ctx).map((uri) => uri.fsPath),
      workspaceScopeId: ctx.workspaceFileScopeId,
      activeUri: this.activeUri,
      operation: this.workspaceOperations.kind,
      pendingOperations: this.workspaceOperations.pendingKinds,
      candidateIndexReady: this.candidateIndexReady,
      pendingExternalJsonResources: this.externalJsonEvents.pendingResourceCount,
      csv: {
        convertedInSession: this.csvConvertedInSession,
        deduplicatedInSession: this.csvDeduplicatedInSession,
        conflictCount: this.csvConflictCount,
      },
      documents: this.summaries(ctx.workspaceRoot),
      candidates: this.candidates,
      sessions,
    });
    ctx.log(`[Codegen][Diagnostics]\n${text.trimEnd()}`);
    try {
      await vscode.env.clipboard.writeText(text);
    } catch (error) {
      this.publish(ctx, `复制 Codegen 诊断失败，内容已写入 Output：${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }
    this.publish(ctx, `已复制 Codegen 运行诊断：${this.discovered.size} 份 JSON、${this.candidates.length} 个候选、${sessions.length} 个会话。`);
  }

  private handleSourceFileChange(uri: vscode.Uri): boolean {
    const ctx = currentContext();
    const containingRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    if (containingRoot) this.staleSourceRoots.add(containingRoot);
    else if (ctx) {
      for (const root of this.workspaceRoots(ctx)) this.staleSourceRoots.add(root.fsPath);
    }
    const candidateScanRunning = this.workspaceOperations.kind === "candidates";
    const shouldRefreshCandidates = this.candidateIndexReady || candidateScanRunning;
    if (shouldRefreshCandidates) {
      this.candidateIndexReady = false;
      this.candidates = [];
    }
    if (candidateScanRunning) this.workspaceOperations.cancelCurrent();
    let cancelledPreflightCount = 0;
    for (const [uri, task] of this.preflightTasks) {
      this.preflightTasks.delete(uri);
      task.cancel();
      cancelledPreflightCount += 1;
      const session = this.sessions.get(uri);
      if (session) {
        this.sessionPresenter.post(session, { type: "codegenPreflightState", running: false });
        this.sessionPresenter.post(session, {
          type: "codegenStatus",
          status: "idle",
          message: "源码在预检期间发生变化，本次预检已取消。",
        });
      }
    }
    const sessionWithPreflight = [...this.sessions.values()].filter((session) => !!session.preflight);
    for (const session of sessionWithPreflight) {
      session.setPreflight(undefined);
      this.sessionPresenter.publishControls(session);
      this.sessionPresenter.post(session, {
        type: "codegenStatus",
        status: "idle",
        message: "源码已变化，原预检计划已失效。",
      });
    }
    if (sessionWithPreflight.length || cancelledPreflightCount || shouldRefreshCandidates) {
      if (ctx) {
        const details = [
          sessionWithPreflight.length ? `${sessionWithPreflight.length} 份计划失效` : "",
          cancelledPreflightCount ? `${cancelledPreflightCount} 个运行中预检取消` : "",
          shouldRefreshCandidates ? "候选列表已清空并等待重扫" : "",
        ].filter(Boolean).join("，");
        this.publish(ctx, `检测到源码变化：${details}。`);
      }
    }
    return shouldRefreshCandidates;
  }

  private async handleExternalJson(
    uri: vscode.Uri,
    kind: "created" | "changed" | "deleted",
  ): Promise<void> {
    const session = this.sessions.get(uri.toString());
    const ctx = currentContext();
    if (!session || !ctx) return;
    if (kind === "deleted") {
      session.markExternalDeleted();
      this.sessionPresenter.publishControls(session);
      this.sessionPresenter.publishDocumentState(session);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message: "磁盘 JSON 已被删除；保存时可选择重新创建。" });
      this.publish(ctx, `${session.identity.fileName} 已从磁盘删除，当前内存草稿仍保留。`, "error");
      return;
    }
    try {
      const snapshot = await this.documents.readSnapshot(uri);
      if (snapshot.fingerprint === session.diskFingerprint) {
        const hadConflict = session.hasExternalConflict;
        session.observeExternalFingerprint(snapshot.fingerprint);
        if (hadConflict) this.sessionPresenter.publishDocumentState(session);
        return;
      }
      if (session.dirty) {
        session.observeExternalFingerprint(snapshot.fingerprint);
        this.sessionPresenter.publishControls(session);
        this.sessionPresenter.publishDocumentState(session);
        this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message: "检测到外部 JSON 变更；保存前必须选择重新加载或覆盖。" });
        this.publish(ctx, `${session.identity.fileName} 存在外部修改，已阻止静默覆盖。`, "error");
        return;
      }
      session.observeExternalFingerprint(snapshot.fingerprint);
      await this.reloadSnapshot(session, snapshot, ctx, "已自动加载外部修改");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!session.hasExternalConflict) session.markExternalChanged();
      this.sessionPresenter.publishControls(session);
      this.sessionPresenter.publishDocumentState(session);
      this.sessionPresenter.post(session, {
        type: "codegenStatus",
        status: "error",
        message: `外部 JSON 无法加载，当前内存内容已保留：${message}`,
      });
      this.publish(ctx, `无法读取外部变更 ${session.identity.fileName}：${message}`, "error");
    }
  }

  private async pickJson(ctx: ToolRunContext): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      defaultUri: ctx.workspaceRoot ? vscode.Uri.file(ctx.workspaceRoot) : undefined,
      filters: { "Codegen JSON": ["json"] },
      openLabel: "打开表格 View",
      title: "打开 Codegen JSON",
    });
    if (!selected?.length) return;
    for (const uri of selected) await this.openDocument(uri, ctx);
  }

  private async importCsv(ctx: ToolRunContext): Promise<void> {
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri: ctx.workspaceRoot ? vscode.Uri.file(ctx.workspaceRoot) : undefined,
      filters: { "旧 Codegen CSV": ["csv"] },
      openLabel: "导入 CSV",
      title: "导入旧17列 Codegen CSV",
    });
    const csvUri = selected?.[0];
    if (!csvUri) return;
    try {
      const suggested = vscode.Uri.file(`${csvUri.fsPath.slice(0, -extname(csvUri.fsPath).length)}.json`);
      const jsonUri = await vscode.window.showSaveDialog({
        defaultUri: suggested,
        filters: { "Codegen JSON": ["json"] },
        saveLabel: "保存并打开",
        title: "将旧 CSV 转为 Codegen JSON",
      });
      if (!jsonUri) return;
      let converted = await this.documents.convertCsv(csvUri, jsonUri, false);
      if (converted.kind === "ignored") throw new Error("CSV 不是可识别的旧17列 Codegen 格式");
      if (converted.kind === "conflict") {
        const answer = await vscode.window.showWarningMessage(
          `${basename(jsonUri.fsPath)} 已存在且内容不同。覆盖 JSON 并在验证成功后删除 CSV？`,
          { modal: true },
          "覆盖转换",
        );
        if (answer !== "覆盖转换") {
          this.publish(ctx, "已保留 CSV 和现有 JSON，未执行覆盖。", "error");
          return;
        }
        converted = await this.documents.convertCsv(csvUri, jsonUri, true);
      }
      if (!converted.controller) throw new Error("转换后无法建立 Codegen 文档");
      if (converted.kind === "converted") this.csvConvertedInSession += 1;
      else if (converted.kind === "deduplicated") this.csvDeduplicatedInSession += 1;
      ctx.log(`[Codegen] 已安全转换 ${csvUri.fsPath} → ${jsonUri.fsPath}；目标已复读验证，源 CSV 已删除。`);
      await this.openDocument(
        jsonUri,
        ctx,
        converted.controller,
        converted.diagnosticCount,
      );
    } catch (error) {
      ctx.postState({
        status: "error",
        message: `CSV 导入失败，源文件已保留：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async openKnownDocument(uriString: string, ctx: ToolRunContext): Promise<void> {
    const session = this.sessions.get(uriString);
    if (session) {
      await this.showSession(session, ctx);
      return;
    }
    const known = this.discovered.get(uriString);
    if (!known || known.uri.scheme !== "file") {
      ctx.postState({ status: "error", message: "该 JSON 已不在当前 Codegen 列表中，请刷新后重试。" });
      return;
    }
    await this.openDocument(known.uri, ctx);
  }

  private async openDocument(
    uri: vscode.Uri,
    ctx: ToolRunContext,
    preparedController?: KtCodegenController,
    diagnosticCount = 0,
  ): Promise<void> {
    const key = uri.toString();
    const current = this.sessions.get(key);
    if (current) {
      await this.showSession(current, ctx);
      return;
    }
    try {
      const controller = preparedController ?? new KtCodegenController();
      const snapshot = await this.documents.readSnapshot(uri);
      if (!preparedController) {
        const result = controller.readJson(snapshot.text);
        if (!result.ok || !result.value) throw new Error(ktcCodegenDiagnosticsText(result.diagnostics) || "不是可用的 Codegen v4 JSON");
        diagnosticCount = result.diagnostics.length;
      }
      const session = new KtcCodegenDocumentModel({
        uri: key,
        fsPath: uri.fsPath,
        fileName: basename(uri.fsPath),
      }, controller, diagnosticCount, snapshot.fingerprint);
      this.sessions.set(key, session);
      this.rememberSession(session);
      await this.showSession(session, ctx);
    } catch (error) {
      ctx.postState({ status: "error", message: `无法打开 ${basename(uri.fsPath)}：${error instanceof Error ? error.message : String(error)}` });
    }
  }

  private async showSession(session: KtcCodegenDocumentModel, ctx: ToolRunContext): Promise<void> {
    this.sessionPresenter.show(session);
    this.setActive(session, ctx);
  }

  private async handleEditorMessage(
    session: KtcCodegenDocumentModel,
    message: KtcCodegenEditorInboundMessage,
    ctx: ToolRunContext,
  ): Promise<void> {
    const command = ktcRouteCodegenEditorMessage(session.identity.uri, message);
    if (command.kind === "ignore") return;
    if (command.kind === "control") {
      await this.handleControlMessage(command.message, ctx);
      return;
    }
    if (command.kind === "dirty") {
      session.markTableDirty(command.itemCount);
      this.didMutate(session, ctx, `正在编辑 ${session.identity.fileName}；尚未写盘。`);
      return;
    }
    if (command.kind === "exchange") {
      const acceptance = session.acceptTable(command.model.table);
      if (acceptance === "stale") {
        this.sessionPresenter.post(session, {
          type: "codegenStatus",
          status: "error",
          message: "文档已在其他界面更新，请先还原或重新打开后再保存。",
        });
        return;
      }
      if (acceptance === "accepted") this.didMutate(session, ctx);
      if (command.action === "save") await this.save(session, ctx);
      else this.publish(ctx, `已接收 ${session.identity.fileName} 的整表草稿。`);
      return;
    }
    if (command.kind === "ready") {
      this.sessionPresenter.publishModel(session);
      return;
    }
    if (command.kind === "revert") {
      await this.revert(session, ctx);
      return;
    }
    if (command.kind === "cancelPreflight") {
      this.preflightTasks.get(session.identity.uri)?.cancel();
      return;
    }
    if (command.kind === "preflight") {
      if (command.table && !this.acceptActionTable(session, command.table, ctx)) return;
      await this.runPreflight(session, ctx);
      return;
    }
    if (command.kind === "apply") {
      if (command.table && !this.acceptActionTable(session, command.table, ctx)) return;
      if (!session.preflight) await this.runPreflight(session, ctx);
      if (!session.preflight) return;
      await this.apply(session, ctx);
    }
  }

  private acceptActionTable(
    session: KtcCodegenDocumentModel,
    table: KtCodegenTableData,
    ctx: ToolRunContext,
  ): boolean {
    const acceptance = session.acceptTable(table);
    if (acceptance === "stale") {
      this.sessionPresenter.post(session, {
        type: "codegenStatus",
        status: "error",
        message: "表格 revision 已过期，请先还原或重新打开。",
      });
      return false;
    }
    if (acceptance === "accepted") {
      this.didMutate(session, ctx, `已接收 ${session.identity.fileName} 的最新整表草稿。`);
    }
    return true;
  }

  private async runPreflight(
    session: KtcCodegenDocumentModel,
    ctx: ToolRunContext,
  ): Promise<void> {
    const workspaceRoot = ktcResolveCodegenWorkspaceRoot(
      session.identity.fsPath,
      this.workspaceRoots(ctx).map((uri) => uri.fsPath),
      ctx.workspaceRoot,
    );
    if (!workspaceRoot) {
      ctx.log(`[Codegen][Preflight][error] preflight.workspace-missing：请先打开工作区；json=${session.identity.fsPath}`);
      this.publish(ctx, "请先打开工作区再执行 Codegen 预检。", "error");
      return;
    }
    this.preflightTasks.get(session.identity.uri)?.cancel();
    const cancellation = new vscode.CancellationTokenSource();
    this.preflightTasks.set(session.identity.uri, cancellation);
    this.publish(ctx, `正在预检 ${session.identity.fileName}…`);
    this.sessionPresenter.post(session, { type: "codegenStatus", status: "idle", message: "正在扫描控制标记…" });
    this.sessionPresenter.post(session, { type: "codegenPreflightState", running: true });
    try {
      const result = await ktcRunCodegenPreflight({
        workspaceRoot,
        scopeId: ctx.workspaceFileScopeId,
        documentUri: vscode.Uri.file(session.identity.fsPath),
        controller: session.controller,
        blockKeys: session.selectedBlockKeys,
        forceRefresh: this.staleSourceRoots.has(workspaceRoot),
        cancellationToken: cancellation.token,
        reportProgress: (message) => {
          if (this.preflightTasks.get(session.identity.uri) !== cancellation) return;
          this.sessionPresenter.post(session, { type: "codegenStatus", status: "idle", message });
        },
      });
      if (this.preflightTasks.get(session.identity.uri) !== cancellation) return;
      this.staleSourceRoots.delete(workspaceRoot);
      session.setPreflight(result);
      const plan = result.plan;
      const message = `${result.reused ? "复用缓存" : "生成新计划"}：${result.candidateFileCount} 个候选文件，${plan.markerRegions.length} 个区域，${plan.artifacts.length} 个产物，${plan.diagnostics.length} 条诊断。`;
      ctx.log(`[Codegen][Preflight] ${session.identity.fileName}；${message}`);
      for (const line of ktcCodegenApplyPlanLogs(plan, "Preflight")) ctx.log(line);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "idle", message });
      this.sessionPresenter.publishControls(session);
      this.publish(ctx, message, plan.diagnostics.some((item) => item.severity === "error") ? "error" : "done");
    } catch (error) {
      if (error instanceof vscode.CancellationError) {
        if (this.preflightTasks.get(session.identity.uri) !== cancellation) return;
        this.sessionPresenter.post(session, { type: "codegenStatus", status: "idle", message: "预检已取消。" });
        ctx.log(`[Codegen][Preflight][info] preflight.cancelled：${session.identity.fsPath}`);
        this.publish(ctx, `${session.identity.fileName} 的预检已取消。`);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      session.setPreflight(undefined);
      this.sessionPresenter.publishControls(session);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message: `预检失败：${message}` });
      ctx.log(`[Codegen][Preflight][error] preflight.failed：${message}；json=${session.identity.fsPath}`);
      this.publish(ctx, `预检失败：${message}`, "error");
    } finally {
      if (this.preflightTasks.get(session.identity.uri) === cancellation) {
        this.preflightTasks.delete(session.identity.uri);
        this.sessionPresenter.post(session, { type: "codegenPreflightState", running: false });
      }
      cancellation.dispose();
    }
  }

  private async handleControlMessage(
    message: KtcCodegenControlMessage,
    ctx: ToolRunContext,
  ): Promise<void> {
    if (message.type === "codegenControlOpen") {
      const session = this.sessions.get(message.uri);
      const location = ktcFindCodegenControlLocation(
        session?.preflight?.plan,
        message.path,
        message.line,
      );
      if (!location) {
        this.publish(ctx, "控制符命中已变化，请重新预检后再打开源码。", "error");
        return;
      }
      await this.problemReporter?.open(location.path, location.line, location.column);
      return;
    }
    if (message.type !== "codegenControlSelection"
      && message.type !== "codegenControlDisplay"
      && message.type !== "codegenControlOutput") return;
    const session = this.sessions.get(message.uri);
    if (!session) return;
    const result = this.controlSessions.handle(session, message);
    if (result.modelChanged) this.sessionPresenter.publishControls(session);
    for (const line of result.logLines ?? []) ctx.log(line);
    if (result.editorStatusMessage) {
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "idle", message: result.editorStatusMessage });
    }
    if (result.statusMessage) this.publish(ctx, result.statusMessage);
  }

  private async apply(session: KtcCodegenDocumentModel, ctx: ToolRunContext): Promise<void> {
    const preflight = session.preflight;
    if (!preflight) {
      const message = "自动预检没有产生可用计划，未修改源码。";
      ctx.log(`[Codegen][Apply][error] apply.preflight-missing：${message}；json=${session.identity.fsPath}`);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message });
      this.publish(ctx, message, "error");
      return;
    }
    const plan = preflight.plan;
    ctx.log(`[Codegen][Apply] ${session.identity.fsPath}`);
    ctx.log(`[Codegen][Apply] cache=${preflight.cachePath}；created=${preflight.createdAt}；reused=${preflight.reused}`);
    for (const line of ktcCodegenApplyPlanLogs(plan)) ctx.log(line);
    if (!plan.canApply) {
      const message = "当前计划包含错误或没有可应用产物；未修改源码。";
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message });
      this.problemReporter?.publish(session.identity.uri, session.identity.fsPath, plan.diagnostics);
      this.publish(ctx, message, "error");
      return;
    }

    const workspaceRoot = ktcResolveCodegenWorkspaceRoot(
      session.identity.fsPath,
      this.workspaceRoots(ctx).map((uri) => uri.fsPath),
      ctx.workspaceRoot,
    );
    const applyDiagnostics: KtCodegenDiagnostic[] = [];
    if (!workspaceRoot) {
      applyDiagnostics.push(this.applyDiagnostic("apply.workspace-missing", "无法确定当前 JSON 所属工作区。"));
    }
    const regionsById = new Map(plan.markerRegions.map((region) => [region.id, region]));
    const paths = [...new Set(plan.artifacts.map((artifact) => regionsById.get(artifact.regionId)?.path).filter(
      (path): path is string => Boolean(path),
    ))];
    const sources: Array<{
      path: string;
      raw: Uint8Array;
      decoded: KtcDecodedCodegenSource;
    }> = [];
    for (const path of paths) {
      const workspacePath = workspaceRoot ? relative(workspaceRoot, path) : "..";
      if (
        !workspaceRoot ||
        workspacePath === ".." ||
        workspacePath.startsWith("../") ||
        workspacePath.startsWith("..\\") ||
        isAbsolute(workspacePath)
      ) {
        applyDiagnostics.push(this.applyDiagnostic(
          "apply.outside-workspace",
          "预检计划包含工作区外路径，已阻止写入。",
        ));
        continue;
      }
      const dirtyDocument = vscode.workspace.textDocuments.find((document) => (
        document.uri.scheme === "file" && document.uri.fsPath === path && document.isDirty
      ));
      if (dirtyDocument) {
        applyDiagnostics.push(this.applyDiagnostic(
          "apply.unsaved-source",
          "源码编辑器中存在未保存修改，请先保存后重新预检。",
          path,
        ));
        continue;
      }
      try {
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
        const decoded = ktcDecodeCodegenSource(raw);
        if (!decoded) {
          applyDiagnostics.push(this.applyDiagnostic(
            "apply.unsupported-encoding",
            "源码不是可无损处理的 UTF-8、UTF-8 BOM 或 GBK。",
            path,
          ));
          continue;
        }
        sources.push({ path, raw, decoded });
        ctx.log(`[Codegen][Apply][Source] 已复读 ${path}；encoding=${decoded.encoding}；eol=${decoded.eol}；bytes=${raw.byteLength}`);
      } catch (error) {
        applyDiagnostics.push(this.applyDiagnostic(
          "apply.source-read-failed",
          `读取源码失败：${error instanceof Error ? error.message : String(error)}`,
          path,
        ));
      }
    }

    const projection = applyDiagnostics.length
      ? { changes: [], diagnostics: applyDiagnostics }
      : ktcProjectCodegenApply(plan, sources.map((source) => ({
          path: source.path,
          text: source.decoded.text,
          fingerprint: source.decoded.fingerprint,
        })));
    const diagnostics = [...plan.diagnostics, ...projection.diagnostics];
    if (projection.diagnostics.length) {
      for (const diagnostic of projection.diagnostics) {
        ctx.log(ktcCodegenApplyDiagnosticLog(diagnostic));
      }
      this.problemReporter?.publish(session.identity.uri, session.identity.fsPath, diagnostics);
      const message = `Apply 已阻止：${projection.diagnostics.length} 个问题；未修改源码。`;
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message });
      this.publish(ctx, message, "error");
      return;
    }

    const sourceByPath = new Map(sources.map((source) => [source.path, source]));
    const writes: Array<{
      path: string;
      before: Uint8Array;
      after: Uint8Array;
      encoding: KtcDecodedCodegenSource["encoding"];
      eol: KtcDecodedCodegenSource["eol"];
      regionCount: number;
      regions: readonly KtcCodegenApplyRegionChange[];
    }> = [];
    try {
      for (const change of projection.changes) {
        const source = sourceByPath.get(change.path);
        if (!source) throw new Error(`缺少 Apply 源码快照：${change.path}`);
        writes.push({
          path: change.path,
          before: source.raw,
          after: ktcEncodeCodegenSource(change.after, source.decoded.encoding),
          encoding: source.decoded.encoding,
          eol: source.decoded.eol,
          regionCount: change.regionCount,
          regions: change.regions,
        });
        ctx.log(`[Codegen][Apply][Write] 已准备 ${change.path}；regions=${change.regionCount}；before=${source.raw.byteLength} bytes`);
      }
    } catch (error) {
      const diagnostic = this.applyDiagnostic(
        "apply.encode-failed",
        error instanceof Error ? error.message : String(error),
      );
      this.problemReporter?.publish(session.identity.uri, session.identity.fsPath, [...diagnostics, diagnostic]);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message: diagnostic.message });
      ctx.log(ktcCodegenApplyDiagnosticLog(diagnostic));
      this.publish(ctx, `Apply 编码失败：${diagnostic.message}`, "error");
      return;
    }

    const commit = await ktcCommitCodegenApplyWrites(
      {
        readFile: (path: string) => vscode.workspace.fs.readFile(vscode.Uri.file(path)),
        writeFile: (path: string, content: Uint8Array) =>
          vscode.workspace.fs.writeFile(vscode.Uri.file(path), content),
      },
      writes.map((write) => ({
        target: write.path,
        before: write.before,
        after: write.after,
      })),
    );
    if (!commit.ok) {
      const detail = commit.error instanceof Error ? commit.error.message : String(commit.error);
      const concurrent = commit.error instanceof KtcCodegenApplyConcurrentChangeError;
      const message = concurrent
        ? commit.rollbackFailures.length
          ? `Apply 检测到源码在最终写入前再次变化，且 ${commit.rollbackFailures.length} 个此前文件回滚失败，请立即用 Git 检查：${detail}`
          : `Apply 已阻止：源码在最终写入前再次变化；此前文件已回滚，请重新预检。`
        : commit.rollbackFailures.length
          ? `Apply 写入失败且 ${commit.rollbackFailures.length} 个文件回滚失败，请立即用 Git 检查：${detail}`
          : `Apply 写入失败，已回滚本次已写文件：${detail}`;
      const diagnostic = this.applyDiagnostic(
        concurrent ? "apply.source-changed-during-write" : "apply.write-failed",
        message,
        concurrent ? String(commit.error.target) : commit.rollbackFailures[0],
      );
      this.problemReporter?.publish(session.identity.uri, session.identity.fsPath, [...diagnostics, diagnostic]);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message });
      ctx.log(ktcCodegenApplyDiagnosticLog(diagnostic));
      for (const path of commit.rollbackFailures) {
        ctx.log(`[Codegen][Apply][error] apply.rollback-failed：回滚失败，请用 Git 检查；file=${path}`);
      }
      this.publish(ctx, message, "error");
      return;
    }

    for (const write of writes) {
      ctx.log(`[Codegen][Apply] 已修改 ${write.path}；${write.regionCount} 个区域；${write.after.length} bytes`);
      for (const region of write.regions) ctx.log(ktcCodegenAppliedRegionLog(write.path, region));
    }
    const receiptDiagnostics: KtCodegenDiagnostic[] = [];
    let receiptPath: string | undefined;
    if (writes.length && workspaceRoot) {
      try {
        const documentPath = ktcCodegenReceiptWorkspacePath(workspaceRoot, session.identity.fsPath);
        const cachePath = ktcCodegenReceiptWorkspacePath(workspaceRoot, preflight.cachePath);
        const receiptFiles = writes.map((write) => {
          const path = ktcCodegenReceiptWorkspacePath(workspaceRoot, write.path);
          if (!path) throw new Error(`源码路径不能写入工作区回执：${write.path}`);
          return {
            path,
            beforeFingerprint: ktcCodegenFingerprint(write.before),
            afterFingerprint: ktcCodegenFingerprint(write.after),
            encoding: write.encoding,
            eol: write.eol,
            beforeBytes: write.before.byteLength,
            afterBytes: write.after.byteLength,
            regionCount: write.regionCount,
            regions: write.regions,
          };
        });
        if (!documentPath || !cachePath) throw new Error("JSON 或 Preflight Cache 不在当前工作区内");
        const receipt = ktcCreateCodegenApplyReceipt({
          documentPath,
          preflightCachePath: cachePath,
          preflightCreatedAt: preflight.createdAt,
          files: receiptFiles,
        });
        receiptPath = await ktcWriteCodegenApplyReceipt({
          createDirectory: (path) => vscode.workspace.fs.createDirectory(vscode.Uri.file(path)),
          writeFile: (path, content) => vscode.workspace.fs.writeFile(vscode.Uri.file(path), content),
          rename: (source, target) => vscode.workspace.fs.rename(
            vscode.Uri.file(source),
            vscode.Uri.file(target),
            { overwrite: true },
          ),
          deleteFile: (path) => vscode.workspace.fs.delete(vscode.Uri.file(path)),
        }, workspaceRoot, preflight.cachePath, receipt);
        ctx.log(`[Codegen][Apply][Receipt] 已验证并写入 ${receiptPath}；files=${receipt.fileCount}；regions=${receipt.regionCount}`);
      } catch (error) {
        const warning = this.applyDiagnostic(
          "apply.receipt-write-failed",
          `源码已成功写入，但 Apply 回执缓存失败：${error instanceof Error ? error.message : String(error)}`,
          session.identity.fsPath,
          "warning",
        );
        receiptDiagnostics.push(warning);
        ctx.log(ktcCodegenApplyDiagnosticLog(warning));
      }
    }
    session.setPreflight(undefined);
    this.sessionPresenter.publishControls(session);
    this.problemReporter?.publish(session.identity.uri, session.identity.fsPath, [...plan.diagnostics, ...receiptDiagnostics]);
    const regionCount = writes.reduce((total, write) => total + write.regionCount, 0);
    const message = receiptDiagnostics.length
      ? `Apply 完成：已修改 ${writes.length} 个文件、${regionCount} 个区域；回执缓存失败，请查看 Problems。`
      : writes.length
        ? `Apply 完成：已修改 ${writes.length} 个文件、${regionCount} 个区域；回执 ${receiptPath ?? "未生成"}。`
      : "Apply 完成：生成结果与源码一致，没有需要写入的变化。";
    this.sessionPresenter.post(session, { type: "codegenStatus", status: "idle", message });
    this.publish(ctx, message);
  }

  private applyDiagnostic(
    code: string,
    message: string,
    file?: string,
    severity: "error" | "warning" = "error",
  ): KtCodegenDiagnostic {
    return {
      code,
      severity,
      message,
      ...(file ? { path: { source: "source", file, row: 0, column: 0 } } : {}),
    };
  }

  private async save(session: KtcCodegenDocumentModel, ctx: ToolRunContext): Promise<void> {
    this.sessionPresenter.post(session, { type: "codegenStatus", status: "saving", message: "正在校验并保存…" });
    const result = session.controller.writeJson();
    if (!result.ok || result.value === null) {
      const message = ktcCodegenDiagnosticsText(result.diagnostics) || "当前表格包含无法写出的数据";
      session.recordDiagnostics(result.diagnostics.length);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message });
      this.publish(ctx, `保存失败：${message}`, "error");
      return;
    }
    try {
      const uri = vscode.Uri.file(session.identity.fsPath);
      let diskSnapshot: Awaited<ReturnType<KtcCodegenDocumentService["readSnapshot"]>> | undefined;
      try {
        diskSnapshot = await this.documents.readSnapshot(uri);
      } catch (error) {
        if (!ktcCodegenIsFileNotFoundError(error)) throw error;
        session.markExternalDeleted();
      }
      const diskState = ktcCodegenClassifySaveDiskState(
        session.diskFingerprint,
        diskSnapshot?.fingerprint,
        session.hasExternalConflict,
      );
      let writeGuard: { expectedFingerprint?: string; requireMissing?: boolean } = {
        expectedFingerprint: session.diskFingerprint,
      };
      if (diskState !== "current") {
        const actions = diskState === "changed"
          ? ["从磁盘重新加载", "覆盖保存"] as const
          : ["重新创建文件"] as const;
        const answer = await vscode.window.showWarningMessage(
          diskState === "changed"
            ? `${session.identity.fileName} 已在磁盘上被外部修改。重新加载会放弃当前草稿，覆盖保存会替换外部内容。`
            : `${session.identity.fileName} 已从磁盘删除。是否用当前草稿重新创建？`,
          { modal: true },
          ...actions,
        );
        if (answer === "从磁盘重新加载" && diskSnapshot) {
          await this.reloadSnapshot(session, diskSnapshot, ctx, "已重新加载外部修改");
          return;
        }
        if (answer !== "覆盖保存" && answer !== "重新创建文件") {
          this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message: "保存已取消，外部变更和当前草稿均保留。" });
          this.publish(ctx, "保存已取消：检测到外部文件变更。", "error");
          return;
        }
        writeGuard = answer === "重新创建文件" ? { requireMissing: true } : {};
      }
      this.internalWrites.add(session.identity.uri);
      const saved = await this.documents.writeValidatedJson(uri, result.value, writeGuard);
      session.markSaved(result.diagnostics.length, saved.fingerprint);
      this.sessionPresenter.publishDocumentState(session);
      this.rememberSession(session);
      this.sessionPresenter.post(session, {
        type: "codegenStatus",
        status: "saved",
        message: result.diagnostics.length ? `已保存，${result.diagnostics.length} 条兼容提示` : "已保存",
        documentRevision: session.revision,
      });
      this.publish(ctx, `已保存 ${session.identity.fileName}。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message: `写盘失败：${message}` });
      this.publish(ctx, `写盘失败：${message}`, "error");
    } finally {
      this.internalWrites.delete(session.identity.uri);
    }
  }

  private async revert(session: KtcCodegenDocumentModel, ctx: ToolRunContext): Promise<void> {
    if (!session.dirty && !session.hasExternalConflict) return;
    const label = session.dirty ? "还原" : "重新加载";
    const answer = await vscode.window.showWarningMessage(
      session.dirty
        ? `放弃 ${session.identity.fileName} 尚未保存的表格修改，并从磁盘重新加载？`
        : `从磁盘重新加载 ${session.identity.fileName} 的外部修改？`,
      { modal: true },
      label,
    );
    if (answer !== label) return;
    try {
      const snapshot = await this.documents.readSnapshot(vscode.Uri.file(session.identity.fsPath));
      await this.reloadSnapshot(session, snapshot, ctx, "已从磁盘还原");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.sessionPresenter.post(session, { type: "codegenStatus", status: "error", message });
      this.publish(ctx, `还原失败：${message}`, "error");
    }
  }

  private didMutate(
    session: KtcCodegenDocumentModel,
    ctx: ToolRunContext,
    message = `已更新 ${session.identity.fileName} 的文档草稿。`,
  ): void {
    this.sessionPresenter.publishDocumentState(session);
    this.sessionPresenter.publishControls(session);
    this.rememberSession(session);
    this.publish(ctx, message);
  }

  private async reloadSnapshot(
    session: KtcCodegenDocumentModel,
    snapshot: Awaited<ReturnType<KtcCodegenDocumentService["readSnapshot"]>>,
    ctx: ToolRunContext,
    message: string,
  ): Promise<void> {
    const result = session.reloadFromJson(snapshot.text, snapshot.fingerprint);
    if (!result.ok || !result.value) {
      throw new Error(ktcCodegenDiagnosticsText(result.diagnostics) || "磁盘 JSON 无法读取");
    }
    this.sessionPresenter.publishDocumentState(session);
    this.rememberSession(session);
    this.sessionPresenter.publishModel(session);
    this.sessionPresenter.post(session, {
      type: "codegenStatus",
      status: "saved",
      message,
      documentRevision: session.revision,
    });
    this.publish(ctx, `${message} ${session.identity.fileName}。`);
  }

  private updateMeta(
    uriString: string,
    field: KtcCodegenMetaField,
    value: string,
    ctx: ToolRunContext,
  ): void {
    const session = this.sessions.get(uriString);
    if (!session || this.activeUri !== uriString) {
      this.publish(ctx, "当前 JSON View 已切换，请重新编辑属性。", "error");
      return;
    }
    if (!session.updateMeta(field, value)) return;
    this.didMutate(session, ctx, `已更新 ${session.identity.fileName} 的文档属性。`);
  }

  private setActive(session: KtcCodegenDocumentModel, ctx: ToolRunContext): void {
    this.activeUri = session.identity.uri;
    this.rememberSession(session);
    this.problemReporter?.activate(session.identity.uri);
    this.sessionPresenter.publishControls(session);
    this.publish(ctx, `当前编辑区 Codegen 标签：${session.identity.fileName}。`);
  }

  private rememberSession(session: KtcCodegenDocumentModel): void {
    const param = session.controller.param;
    this.discovered.set(session.identity.uri, {
      uri: vscode.Uri.file(session.identity.fsPath),
      itemCount: param.items.length,
      className: `${param.namePrefix}${param.nameMiddle}`,
      namePrefix: param.namePrefix,
      nameMiddle: param.nameMiddle,
      nameSpace: param.nameSpace,
      appendFunction: param.appendFunction,
      diagnosticCount: session.diagnosticCount,
    });
  }

  private publish(
    ctx: ToolRunContext,
    message: string,
    status: "done" | "error" = "done",
  ): void {
    const activeSession = this.activeUri ? this.sessions.get(this.activeUri) : undefined;
    ctx.postState({
      status: status === "done" && this.workspaceOperations.kind ? "running" : status,
      message,
      codegenActiveUri: this.activeUri,
      codegenDocuments: this.summaries(ctx.workspaceRoot),
      codegenControls: activeSession ? this.controlSessions.catalogModel(activeSession) : undefined,
      codegenCandidates: this.candidates,
      codegenOperation: this.workspaceOperations.kind,
    });
  }

  private summaries(workspaceRoot: string | undefined): KtcCodegenDocumentSummary[] {
    return ktcSortCodegenDocumentList([...this.discovered.values()]
      .map((document) => {
        const uri = document.uri.toString();
        const session = this.sessions.get(uri);
        return {
          uri,
          fileName: basename(document.uri.fsPath),
          displayPath: this.displayPath(document.uri, workspaceRoot),
          itemCount: session?.draftItemCount ?? session?.controller.param.items.length ?? document.itemCount,
          className: session
            ? `${session.controller.param.namePrefix}${session.controller.param.nameMiddle}`
            : document.className,
          namePrefix: session?.controller.param.namePrefix ?? document.namePrefix,
          nameMiddle: session?.controller.param.nameMiddle ?? document.nameMiddle,
          nameSpace: session?.controller.param.nameSpace ?? document.nameSpace,
          appendFunction: session?.controller.param.appendFunction ?? document.appendFunction,
          open: !!session && !!this.editorViews?.isOpen(uri),
          active: this.activeUri === uri,
          dirty: !!session?.dirty,
          externalConflict: !!session?.hasExternalConflict,
          externalState: session?.externalState ?? "current",
          diagnosticCount: session?.diagnosticCount ?? document.diagnosticCount,
        };
      }));
  }

  private displayPath(uri: vscode.Uri, workspaceRoot: string | undefined): string {
    const root = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? workspaceRoot;
    if (!root) return uri.fsPath;
    const path = relative(root, uri.fsPath);
    return !path.startsWith("..") && !isAbsolute(path) ? path.replaceAll("\\", "/") : uri.fsPath;
  }
}

const codegenController = new KtcCodegenWorkspaceController();

export function registerCodegenSupport(context: vscode.ExtensionContext): void {
  codegenController.initialize(context);
  context.subscriptions.push(codegenController);
}

export function notifyCodegenWorkspaceFoldersChanged(): void {
  codegenController.workspaceFoldersChanged();
}

export const codegenTool: KtTool = {
  id: TOOL_ID,
  title: "自动代码",
  description: "左侧管理 Codegen JSON，当前编辑区用一 JSON 一表格标签编辑17列参数。",
  icon: "media/tools/codegen.svg",
  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },
  registerCommands(context): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.codegen.open", async () => {
        await vscode.commands.executeCommand("ktAutoCode.tool.show", TOOL_ID);
        const ctx = currentContext();
        if (ctx) await codegenController.handleSidebarAction({ type: "codegenAction", toolId: TOOL_ID, action: "openJson" }, ctx);
      }),
      vscode.commands.registerCommand("ktAutoCode.codegen.importCsv", async () => {
        await vscode.commands.executeCommand("ktAutoCode.tool.show", TOOL_ID);
        const ctx = currentContext();
        if (ctx) await codegenController.handleSidebarAction({ type: "codegenAction", toolId: TOOL_ID, action: "importCsv" }, ctx);
      }),
    );
  },
  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "codegenAction" && message.toolId === TOOL_ID) {
      await codegenController.handleSidebarAction(message, ctx);
    } else if ((message.type === "codegenControlSelection"
      || message.type === "codegenControlDisplay"
      || message.type === "codegenControlOutput") && message.toolId === TOOL_ID) {
      await codegenController.handleSidebarControlAction(message, ctx);
    }
  },
  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (action === "activate") await codegenController.activate(ctx);
    else if (action === "workspaceScopeChanged") codegenController.workspaceScopeChanged(ctx);
    else if (action === "refresh") await codegenController.handleSidebarAction(
      { type: "codegenAction", toolId: TOOL_ID, action: "refresh" }, ctx,
    );
  },
};
