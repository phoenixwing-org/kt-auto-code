import * as vscode from "vscode";
import { realpath } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import {
  KtcCreateGitModel,
  type KtcGitIdentity,
  type KtcGitRepositoryInput,
  type KtcGitSquashDraft,
  type KtcGitSummaryDraft,
  type KtcGitViewModel,
} from "../../../../src/git/KtcGitModel.js";
import { KtcFormatGitDate, KtcNormalizeGitDateInput } from "../../../../src/git/KtcGitDate.js";
import type { ToolRunContext, ToolUiState } from "../types.js";
import {
  KtcGitWingAdapter,
  type KtcPnwGitCommitSummary,
  type KtcPnwGitIdentity,
  type KtcPnwGitRepositorySummary,
  type KtcPnwGitSquashBlocker,
  type KtcPnwGitSquashExecutionResult,
} from "./KtcGitWingAdapter.js";
import { KtcSearchWorkspaceGitRepositories } from "./KtcGitWorkspaceSearch.js";
import {
  KtcChooseGitRepositoryId,
  KtcCollectGitRepositoryCandidates,
  KtcDescribeGitRepository,
  type KtcGitApiRepositorySeed,
  type KtcGitRepositoryDisplay,
  type KtcGitWorkspaceFolderSeed,
} from "./KtcGitRepositoryDiscovery.js";
import type { KtcGitRuntimeDiagnostics } from "../../runtimeDiagnostics.js";

export type KtcGitActionMessage =
  | {
      readonly action:
        | "refresh"
        | "openScm"
        | "openOutput"
        | "addRepository"
        | "initializeRepository"
        | "searchRepositories"
        | "stopRepositorySearch";
    }
  | { readonly action: "selectRepository"; readonly repositoryId: string }
  | { readonly action: "removeRepository"; readonly repositoryId: string }
  | {
      readonly action: "loadOlderCommits";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly count: 1 | 5;
    }
  | { readonly action: "openAction"; readonly actionId: string; readonly repositoryId: string }
  | {
      readonly action: "selectCommits";
      readonly selectedOids: readonly string[];
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly copyAfterGenerate: boolean;
    }
  | { readonly action: "saveSummaryTextHeight"; readonly height: number }
  | {
      readonly action: "copySummary";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly selectedOids: readonly string[];
      readonly text: string;
    }
  | {
      readonly action: "updateSummaryOptions";
      readonly repositoryId: string;
      readonly selectedOids: readonly string[];
      readonly includeRemoteUrl: boolean;
      readonly includeCommitTime: boolean;
      readonly mentionReviewer: boolean;
      readonly reviewer: string;
    }
  | { readonly action: "closeSummary" | "cancelSquash" }
  | {
      readonly action: "executeSquash";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly selectedOids: readonly string[];
      readonly message: string;
      readonly author: KtcPnwGitIdentity;
      readonly committer: KtcPnwGitIdentity;
    }
  | { readonly action: "undoSquash"; readonly repositoryId: string };

interface KtcGitSession {
  readonly snapshot: KtcGitReadSnapshot;
  readonly nextBeforeOid?: string;
  readonly hasMoreCommits: boolean;
}

interface KtcGitReadSnapshot {
  readonly root: string;
  readonly name: string;
  readonly currentRef?: string;
  readonly branch?: string;
  readonly upstream?: string;
  readonly remoteUrl?: string;
  readonly headOid: string;
  readonly detached: boolean;
  /** Oldest to newest, matching the existing Auto view-model boundary. */
  readonly history: readonly KtcPnwGitCommitSummary[];
}

interface KtcGitRepositorySearchState {
  readonly status: "idle" | "searching" | "complete" | "stopped";
  readonly scannedDirectories: number;
  readonly foundRepositories: number;
}

interface KtcGitDirectory {
  readonly root: string;
  readonly name: string;
  readonly relativePath: string;
  readonly sourceGroup: "workspace" | "external";
}

interface KtcGitWorkspaceRepositoryState {
  readonly workspaceFolderUri: string;
  readonly relativePath: string;
}

interface KtcGitUndoState {
  readonly repositoryId: string;
  readonly currentRef: string;
  readonly result: KtcPnwGitSquashExecutionResult;
}

export class KtcGitController {
  private readonly KtcAdapter = new KtcGitWingAdapter();
  private readonly KtcSessions = new Map<string, KtcGitSession>();
  private readonly KtcRunningRepositories = new Set<string>();
  private KtcDirectories: KtcGitDirectory[] = [];
  private KtcDirectoriesInitialized = false;
  private KtcReadGeneration = 0;
  private KtcReadCancellation: AbortController | undefined;
  private KtcRepositorySearchCancellation: AbortController | undefined;
  private KtcRepositorySearchState: KtcGitRepositorySearchState = {
    status: "idle",
    scannedDirectories: 0,
    foundRepositories: 0,
  };
  private KtcRepositoryInputs: KtcGitRepositoryInput[] = [];
  private KtcSelectedRepositoryId: string | undefined;
  private KtcSummaryDraft: KtcGitSummaryDraft | undefined;
  private KtcSquashDraft: KtcGitSquashDraft | undefined;
  private KtcUndoState: KtcGitUndoState | undefined;
  private KtcLegacyReviewers: readonly string[] = [];
  private KtcReviewerMigration: Promise<void> = Promise.resolve();
  private KtcExtensionContext: vscode.ExtensionContext | undefined;
  private KtcLastRunContext: ToolRunContext | undefined;

  register(context: vscode.ExtensionContext): void {
    this.KtcExtensionContext = context;
    this.KtcLegacyReviewers = context.globalState.get<readonly string[]>(KtcGitReviewerStateKey) ?? [];
    this.KtcReviewerMigration = this.KtcMigrateReviewerSettings(context);
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.KtcStopRepositorySearch();
      this.KtcAbortRead();
      this.KtcDirectoriesInitialized = false;
      this.KtcReadGeneration += 1;
      const ctx = this.KtcLastRunContext;
      if (!ctx) return;
      void this.KtcLoad(ctx, true).catch((error) => {
        ctx.log(`[Git] workspace folders changed: ${KtcErrorMessage(error)}`);
        this.KtcPostState(ctx, "error", `重新读取 Git 仓库失败：${KtcErrorMessage(error)}`);
      });
    }));
  }

  async show(ctx: ToolRunContext): Promise<void> {
    this.KtcLastRunContext = ctx;
    await this.KtcLoad(ctx, false);
  }

  getRuntimeDiagnosticsSnapshot(): KtcGitRuntimeDiagnostics {
    const selected = this.KtcSelectedRepositoryId ? this.KtcSessions.get(this.KtcSelectedRepositoryId) : undefined;
    return {
      catalogEntries: this.KtcDirectories.length,
      workspaceRepositories: this.KtcDirectories.filter((item) => item.sourceGroup === "workspace").length,
      userRepositories: this.KtcDirectories.filter((item) => item.sourceGroup === "external").length,
      loadedRepositories: this.KtcSessions.size,
      selectedCommitCount: selected?.snapshot.history.length ?? 0,
      runningWriteOperations: this.KtcRunningRepositories.size,
      summaryOpen: this.KtcSummaryDraft !== undefined,
      squashDraftOpen: this.KtcSquashDraft !== undefined,
    };
  }

  async refresh(ctx: ToolRunContext): Promise<void> {
    this.KtcLastRunContext = ctx;
    await this.KtcLoad(ctx, true);
  }

  private async KtcLoad(ctx: ToolRunContext, rediscover: boolean): Promise<void> {
    if (rediscover) {
      this.KtcStopRepositorySearch();
      this.KtcRepositorySearchState = { status: "idle", scannedDirectories: 0, foundRepositories: 0 };
    }
    this.KtcAbortRead();
    const generation = ++this.KtcReadGeneration;
    this.KtcPostState(
      ctx,
      "running",
      rediscover ? "正在重新搜索 Git 仓库…" : "正在读取当前 Git 仓库…",
    );
    const folders: KtcGitWorkspaceFolderSeed[] = (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      name: folder.name,
      fsPath: folder.uri.fsPath,
    }));
    const activeFilePath = vscode.window.activeTextEditor?.document.uri.scheme === "file"
      ? vscode.window.activeTextEditor.document.uri.fsPath
      : undefined;
    if (rediscover || !this.KtcDirectoriesInitialized) {
      this.KtcDirectories = await this.KtcDiscoverDirectories(folders, activeFilePath, ctx);
      this.KtcDirectoriesInitialized = true;
    }
    if (generation !== this.KtcReadGeneration) return;
    const validIds = new Set(this.KtcDirectories.map((item) => item.root));
    if (this.KtcSummaryDraft && !validIds.has(this.KtcSummaryDraft.repositoryId)) this.KtcSummaryDraft = undefined;
    if (this.KtcSquashDraft && !validIds.has(this.KtcSquashDraft.repositoryId)) this.KtcSquashDraft = undefined;
    if (this.KtcUndoState && !validIds.has(this.KtcUndoState.repositoryId)) this.KtcUndoState = undefined;
    const workspaceRoots = this.KtcDirectories
      .filter((item) => item.sourceGroup === "workspace")
      .map((item) => item.root);
    const storedId = this.KtcExtensionContext?.workspaceState.get<string>(KtcGitSelectedRepositoryStateKey);
    const preferredStoredId = workspaceRoots.length > 0 && storedId && !workspaceRoots.includes(storedId)
      ? undefined
      : storedId;
    this.KtcSelectedRepositoryId = KtcChooseGitRepositoryId({
      repositoryRoots: this.KtcDirectories.map((item) => item.root),
      currentId: this.KtcSelectedRepositoryId,
      storedId: preferredStoredId,
      ...(activeFilePath ? { activeFilePath } : {}),
    });
    await this.KtcPersistSelectedRepository();
    this.KtcRepositoryInputs = this.KtcDirectories.map((item) => this.KtcDirectoryInput(item));
    const selected = this.KtcSelectedRepositoryId;
    if (!selected) {
      this.KtcSessions.clear();
      ctx.log(`[Git] directories=${this.KtcDirectories.length}; posting empty repository state`);
      this.KtcPostState(ctx);
      return;
    }
    await this.KtcReadSelectedRepository(selected, generation, ctx);
    if (generation !== this.KtcReadGeneration) return;
    ctx.log(`[Git] directories=${this.KtcDirectories.length} selected=${selected} commits=1`);
  }

  async handle(action: KtcGitActionMessage, ctx: ToolRunContext): Promise<void> {
    if (action.action === "refresh") {
      await this.refresh(ctx);
      return;
    }
    if (action.action === "openScm") {
      await vscode.commands.executeCommand("workbench.view.scm");
      return;
    }
    if (action.action === "openOutput") {
      ctx.log("[Git] 已从 Git Primary 打开 KT Auto Code 输出。");
      return;
    }
    if (action.action === "addRepository") {
      await this.KtcAddExternalRepository(ctx);
      return;
    }
    if (action.action === "initializeRepository") {
      await this.KtcInitializeWorkspaceRepository(ctx);
      return;
    }
    if (action.action === "searchRepositories") {
      await this.KtcSearchWorkspaceRepositories(ctx);
      return;
    }
    if (action.action === "stopRepositorySearch") {
      this.KtcStopRepositorySearch();
      this.KtcPostState(ctx, "done", "已停止搜索 Git 仓库。已发现的仓库仍然保留。");
      return;
    }
    if (action.action === "selectRepository") {
      await this.KtcSelectRepository(action.repositoryId, ctx);
      return;
    }
    if (action.action === "removeRepository") {
      await this.KtcRemoveExternalRepository(action.repositoryId, ctx);
      return;
    }
    if ("repositoryId" in action && action.repositoryId !== this.KtcSelectedRepositoryId) {
      throw new Error("Git 操作仓库与当前选择不一致，请刷新后重试。");
    }
    if (action.action === "loadOlderCommits") {
      await this.KtcLoadOlderCommits(action, ctx);
      return;
    }
    if (action.action === "closeSummary") {
      this.KtcSummaryDraft = undefined;
      this.KtcPostState(ctx);
      return;
    }
    if (action.action === "saveSummaryTextHeight") {
      await vscode.workspace.getConfiguration("ktAutoCode").update(
        "git.summaryTextHeight",
        KtcNormalizeSummaryTextHeight(action.height),
        vscode.ConfigurationTarget.Global,
      );
      return;
    }
    if (action.action === "cancelSquash") {
      this.KtcSquashDraft = undefined;
      this.KtcPostState(ctx);
      return;
    }
    if (action.action === "selectCommits") {
      await this.KtcOpenSummary(
        action.repositoryId,
        action.expectedHeadOid,
        action.selectedOids,
        action.copyAfterGenerate,
        ctx,
      );
      return;
    }
    if (action.action === "copySummary") {
      await this.KtcCopySummary(action.repositoryId, action.expectedHeadOid, action.selectedOids, action.text, ctx);
      return;
    }
    if (action.action === "updateSummaryOptions") {
      await this.KtcUpdateSummaryOptions(action, ctx);
      return;
    }
    if (action.action === "openAction") {
      if (action.actionId === "squashLocalCommits") {
        await this.KtcSelectAndAnalyzeSquash(action.repositoryId, ctx);
      }
      return;
    }
    if (action.action === "executeSquash") {
      await this.KtcExecuteSquash(action, ctx);
      return;
    }
    if (action.action === "undoSquash") await this.KtcUndoSquash(action.repositoryId, ctx);
  }

  private async KtcSelectRepository(repositoryId: string, ctx: ToolRunContext): Promise<void> {
    if (!this.KtcDirectories.some((item) => item.root === repositoryId)) {
      throw new Error("所选仓库已不存在，请重新搜索 Git 仓库。");
    }
    if (repositoryId === this.KtcSelectedRepositoryId && this.KtcSessions.has(repositoryId)) {
      this.KtcPostState(ctx);
      return;
    }
    if (this.KtcRunningRepositories.size > 0) throw new Error("Git 操作执行期间不能切换仓库。");
    if (this.KtcSummaryDraft || this.KtcSquashDraft) {
      const answer = await vscode.window.showWarningMessage(
        "切换仓库将关闭当前 Git 简报或合并预览，是否继续？",
        { modal: true },
        "切换并关闭草稿",
      );
      if (answer !== "切换并关闭草稿") {
        this.KtcPostState(ctx);
        return;
      }
    }
    this.KtcSummaryDraft = undefined;
    this.KtcSquashDraft = undefined;
    this.KtcSelectedRepositoryId = repositoryId;
    await this.KtcPersistSelectedRepository();
    const generation = ++this.KtcReadGeneration;
    ctx.postState({ status: "running", message: "正在读取所选仓库的最新 commit…" });
    await this.KtcReadSelectedRepository(repositoryId, generation, ctx);
  }

  private async KtcDiscoverDirectories(
    folders: readonly KtcGitWorkspaceFolderSeed[],
    activeFilePath: string | undefined,
    ctx: ToolRunContext,
  ): Promise<KtcGitDirectory[]> {
    const gitRepositories = await KtcReadVsCodeGitRepositories(ctx);
    const candidates = KtcCollectGitRepositoryCandidates({
      workspaceFolders: folders,
      gitRepositories,
      ...(activeFilePath ? { activeFilePath } : {}),
    });
    const workspace = new Map<string, KtcGitDirectory>();
    const resolvedCandidates = await Promise.all(candidates.map(async (candidate): Promise<{
      readonly root: string;
      readonly candidate: (typeof candidates)[number];
    } | undefined> => {
      try {
        const root = await KtcCanonicalGitRoot(await this.KtcAdapter.findRepositoryRoot(candidate.startPath));
        return { root, candidate };
      } catch (error) {
        ctx.log(`[Git] directory ${candidate.source} ${candidate.startPath}: ${KtcErrorMessage(error)}`);
        return undefined;
      }
    }));
    for (const resolvedCandidate of resolvedCandidates) {
      if (!resolvedCandidate) continue;
      const key = KtcGitPathKey(resolvedCandidate.root);
      if (workspace.has(key)) continue;
      const display = KtcDescribeGitRepository(resolvedCandidate.root, basename(resolvedCandidate.root), folders);
      workspace.set(key, {
        root: resolvedCandidate.root,
        name: display.name,
        relativePath: display.relativePath,
        sourceGroup: "workspace",
      });
    }
    for (const storedPath of this.KtcWorkspaceRepositoryRoots()) {
      if (!folders.some((folder) => KtcGitPathContains(folder.fsPath, storedPath))) continue;
      try {
        const root = await KtcCanonicalGitRoot(await this.KtcAdapter.findRepositoryRoot(storedPath));
        const key = KtcGitPathKey(root);
        if (workspace.has(key)) continue;
        const display = KtcDescribeGitRepository(root, basename(root), folders);
        workspace.set(key, {
          root,
          name: display.name,
          relativePath: display.relativePath,
          sourceGroup: "workspace",
        });
      } catch (error) {
        ctx.log(`[Git] cached workspace repository unavailable ${storedPath}: ${KtcErrorMessage(error)}`);
      }
    }
    const external: KtcGitDirectory[] = [];
    for (const storedPath of this.KtcExternalRepositoryRoots()) {
      try {
        const root = await KtcCanonicalGitRoot(await this.KtcAdapter.findRepositoryRoot(storedPath));
        const key = KtcGitPathKey(root);
        if (workspace.has(key) || external.some((item) => KtcGitPathKey(item.root) === key)) continue;
        external.push({
          root,
          name: basename(root),
          relativePath: root,
          sourceGroup: "external",
        });
      } catch (error) {
        ctx.log(`[Git] external repository unavailable ${storedPath}: ${KtcErrorMessage(error)}`);
      }
    }
    return [...workspace.values(), ...external];
  }

  private async KtcReadSelectedRepository(
    repositoryId: string,
    generation: number,
    ctx: ToolRunContext,
  ): Promise<void> {
    const directory = this.KtcDirectories.find((item) => item.root === repositoryId);
    if (!directory) return;
    const cancellation = this.KtcBeginRead();
    try {
      const summary = await this.KtcAdapter.readRepositorySummary(directory.root, 1, true, cancellation.signal);
      if (generation !== this.KtcReadGeneration || this.KtcSelectedRepositoryId !== repositoryId) return;
      if (KtcGitPathKey(summary.root) !== KtcGitPathKey(directory.root)) {
        throw new Error("Git 仓库根目录在读取期间发生变化。");
      }
      const snapshot = KtcGitReadSnapshotFromSummary(summary, directory.name);
      const session = {
        snapshot,
        ...(summary.commits.at(-1)?.oid ? { nextBeforeOid: summary.commits.at(-1)!.oid } : {}),
        hasMoreCommits: summary.commits.length > 0,
      } satisfies KtcGitSession;
      this.KtcSessions.clear();
      this.KtcSessions.set(repositoryId, session);
      this.KtcRepositoryInputs = this.KtcDirectories.map((item) => item.root === repositoryId
        ? this.KtcRepositoryInput(snapshot, item, session.hasMoreCommits)
        : this.KtcDirectoryInput(item));
      this.KtcPostState(ctx);
    } catch (error) {
      if (generation !== this.KtcReadGeneration || KtcIsAbortError(error)) return;
      this.KtcSessions.clear();
      this.KtcRepositoryInputs = this.KtcDirectories.map((item) => item.root === repositoryId
        ? { ...this.KtcDirectoryInput(item), error: KtcErrorMessage(error) }
        : this.KtcDirectoryInput(item));
      this.KtcPostState(ctx, "error", `读取 Git 仓库失败：${KtcErrorMessage(error)}`);
    } finally {
      if (this.KtcReadCancellation === cancellation) this.KtcReadCancellation = undefined;
    }
  }

  private async KtcLoadOlderCommits(
    action: Extract<KtcGitActionMessage, { readonly action: "loadOlderCommits" }>,
    ctx: ToolRunContext,
  ): Promise<void> {
    const session = this.KtcRequireSession(action.repositoryId);
    if (session.snapshot.headOid !== action.expectedHeadOid) throw new Error("HEAD 已变化，请重新加载最新 commit。");
    if (!session.hasMoreCommits) return;
    const generation = ++this.KtcReadGeneration;
    const remaining = Math.max(0, 100 - session.snapshot.history.length);
    const limit = Math.min(action.count, remaining);
    if (limit === 0) return;
    const cancellation = this.KtcBeginRead();
    ctx.postState({ status: "running", message: `正在加载更早的 ${action.count} 条 commit…` });
    try {
      const page = await this.KtcAdapter.readCommitPage(
        session.snapshot.root,
        action.expectedHeadOid,
        session.nextBeforeOid,
        limit,
        cancellation.signal,
      );
      if (generation !== this.KtcReadGeneration || this.KtcSelectedRepositoryId !== action.repositoryId) return;
      const history = [...page.commits].reverse().concat(session.snapshot.history);
      const updated = {
        snapshot: { ...session.snapshot, history },
        ...(page.nextBeforeOid ? { nextBeforeOid: page.nextBeforeOid } : {}),
        hasMoreCommits: page.hasMore && history.length < 100,
      } satisfies KtcGitSession;
      this.KtcSessions.set(action.repositoryId, updated);
      this.KtcRepositoryInputs = this.KtcDirectories.map((item) => item.root === action.repositoryId
        ? this.KtcRepositoryInput(updated.snapshot, item, updated.hasMoreCommits)
        : this.KtcDirectoryInput(item));
      this.KtcPostState(ctx);
    } catch (error) {
      if (generation !== this.KtcReadGeneration || KtcIsAbortError(error)) return;
      const refreshGeneration = ++this.KtcReadGeneration;
      await this.KtcReadSelectedRepository(action.repositoryId, refreshGeneration, ctx);
      throw new Error(`加载更早 commit 失败，已刷新 HEAD：${KtcErrorMessage(error)}`);
    } finally {
      if (this.KtcReadCancellation === cancellation) this.KtcReadCancellation = undefined;
    }
  }

  private async KtcRevalidateHead(
    repositoryId: string,
    expectedHeadOid: string,
    ctx: ToolRunContext,
  ): Promise<KtcGitReadSnapshot> {
    const session = this.KtcRequireSession(repositoryId);
    if (session.snapshot.headOid !== expectedHeadOid) throw new Error("HEAD 已变化，请重新生成简报。");
    const latest = await this.KtcAdapter.readRepositorySummary(session.snapshot.root, 1, false);
    if (KtcGitPathKey(latest.root) !== KtcGitPathKey(session.snapshot.root)) {
      throw new Error("Git 仓库根目录已变化，请重新选择仓库。");
    }
    if (latest.headOid !== expectedHeadOid) {
      const generation = ++this.KtcReadGeneration;
      await this.KtcReadSelectedRepository(repositoryId, generation, ctx);
      throw new Error("HEAD 已变化，已刷新最新 commit，请重新生成简报。");
    }
    return session.snapshot;
  }

  private async KtcInitializeWorkspaceRepository(ctx: ToolRunContext): Promise<void> {
    if (this.KtcRunningRepositories.size > 0) throw new Error("Git 操作执行期间不能新建仓库。");
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) throw new Error("请先打开一个工作区目录，再新建 Git 仓库。");
    let folder = folders[0];
    if (folders.length > 1) {
      const selected = await vscode.window.showQuickPick(
        folders.map((candidate) => ({ label: candidate.name, description: candidate.uri.fsPath, folder: candidate })),
        { title: "选择要新建 Git 仓库的工作区目录", placeHolder: "将在所选目录创建 .git" },
      );
      if (!selected) return;
      folder = selected.folder;
    }
    const api = await KtcGetVsCodeGitApi(ctx);
    if (!api?.init) {
      await vscode.commands.executeCommand("git.init");
    } else {
      await api.init(folder.uri);
    }
    this.KtcDirectoriesInitialized = false;
    await this.KtcLoad(ctx, true);
  }

  private async KtcSearchWorkspaceRepositories(ctx: ToolRunContext): Promise<void> {
    if (this.KtcRepositorySearchCancellation) return;
    if (this.KtcRunningRepositories.size > 0) throw new Error("Git 操作执行期间不能搜索仓库。");
    const folders: KtcGitWorkspaceFolderSeed[] = (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      name: folder.name,
      fsPath: folder.uri.fsPath,
    }));
    if (folders.length === 0) throw new Error("请先打开一个工作区目录，再搜索 Git 仓库。");
    const cancellation = new AbortController();
    this.KtcRepositorySearchCancellation = cancellation;
    this.KtcRepositorySearchState = {
      status: "searching",
      scannedDirectories: 0,
      foundRepositories: 0,
    };
    this.KtcPostState(ctx, "running", "正在搜索工作区子目录中的 Git 仓库…");
    try {
      await KtcSearchWorkspaceGitRepositories(folders.map((folder) => folder.fsPath), {
        signal: cancellation.signal,
        onError: (directory, error) => ctx.log(`[Git] search skipped ${directory}: ${KtcErrorMessage(error)}`),
        onProgress: async ({ scannedDirectories, repositoryRoot }) => {
          if (cancellation.signal.aborted) return;
          let added = false;
          if (repositoryRoot) {
            try {
              added = await this.KtcAddDiscoveredWorkspaceRepository(repositoryRoot, folders, cancellation.signal, ctx);
            } catch (error) {
              if (KtcIsAbortError(error)) throw error;
              ctx.log(`[Git] discovered repository unavailable ${repositoryRoot}: ${KtcErrorMessage(error)}`);
            }
          }
          this.KtcRepositorySearchState = {
            status: "searching",
            scannedDirectories,
            foundRepositories: this.KtcRepositorySearchState.foundRepositories + (added ? 1 : 0),
          };
          this.KtcPostState(ctx, "running");
        },
      });
      if (this.KtcRepositorySearchCancellation !== cancellation) return;
      this.KtcRepositorySearchState = { ...this.KtcRepositorySearchState, status: "complete" };
      this.KtcPostState(ctx, "done", `Git 仓库搜索完成：找到 ${this.KtcRepositorySearchState.foundRepositories} 个。`);
    } catch (error) {
      if (!KtcIsAbortError(error)) throw error;
    } finally {
      if (this.KtcRepositorySearchCancellation === cancellation) this.KtcRepositorySearchCancellation = undefined;
    }
  }

  private async KtcAddDiscoveredWorkspaceRepository(
    candidateRoot: string,
    folders: readonly KtcGitWorkspaceFolderSeed[],
    signal: AbortSignal,
    ctx: ToolRunContext,
  ): Promise<boolean> {
    const root = await KtcCanonicalGitRoot(await this.KtcAdapter.findRepositoryRoot(candidateRoot, signal));
    if (this.KtcDirectories.some((item) => KtcGitPathKey(item.root) === KtcGitPathKey(root))) return false;
    const display = KtcDescribeGitRepository(root, basename(root), folders);
    const directory: KtcGitDirectory = {
      root,
      name: display.name,
      relativePath: display.relativePath,
      sourceGroup: "workspace",
    };
    const externalIndex = this.KtcDirectories.findIndex((item) => item.sourceGroup === "external");
    if (externalIndex < 0) this.KtcDirectories.push(directory);
    else this.KtcDirectories.splice(externalIndex, 0, directory);
    this.KtcDirectoriesInitialized = true;
    await this.KtcRememberWorkspaceRepository(root);
    this.KtcSyncRepositoryInputs();
    if (!this.KtcSelectedRepositoryId) {
      this.KtcSelectedRepositoryId = root;
      await this.KtcPersistSelectedRepository();
      const generation = ++this.KtcReadGeneration;
      await this.KtcReadSelectedRepository(root, generation, ctx);
    }
    return true;
  }

  private KtcStopRepositorySearch(): void {
    const cancellation = this.KtcRepositorySearchCancellation;
    if (!cancellation) return;
    this.KtcRepositorySearchCancellation = undefined;
    cancellation.abort();
    this.KtcRepositorySearchState = { ...this.KtcRepositorySearchState, status: "stopped" };
  }

  private KtcBeginRead(): AbortController {
    this.KtcAbortRead();
    const cancellation = new AbortController();
    this.KtcReadCancellation = cancellation;
    return cancellation;
  }

  private KtcAbortRead(): void {
    this.KtcReadCancellation?.abort();
    this.KtcReadCancellation = undefined;
  }

  private KtcSyncRepositoryInputs(): void {
    this.KtcRepositoryInputs = this.KtcDirectories.map((item) => {
      const session = this.KtcSessions.get(item.root);
      return session
        ? this.KtcRepositoryInput(session.snapshot, item, session.hasMoreCommits)
        : this.KtcDirectoryInput(item);
    });
  }

  private async KtcAddExternalRepository(ctx: ToolRunContext): Promise<void> {
    if (this.KtcRunningRepositories.size > 0) throw new Error("Git 操作执行期间不能添加仓库。");
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "添加 Git 仓库",
      title: "选择 Git 仓库或仓库内目录",
    });
    const selectedPath = selected?.[0]?.fsPath;
    if (!selectedPath) return;
    const canonical = await KtcCanonicalGitRoot(await this.KtcAdapter.findRepositoryRoot(selectedPath));
    const inWorkspace = (vscode.workspace.workspaceFolders ?? []).some((folder) => KtcGitPathContains(folder.uri.fsPath, canonical));
    if (inWorkspace) {
      await this.KtcRememberWorkspaceRepository(canonical);
    } else {
      const roots = [canonical, ...this.KtcExternalRepositoryRoots()]
        .filter((value, index, values) => values.findIndex((other) => KtcGitPathKey(other) === KtcGitPathKey(value)) === index)
        .slice(0, 12);
      await vscode.workspace.getConfiguration("ktAutoCode").update(
        "git.repositories",
        roots,
        vscode.ConfigurationTarget.Global,
      );
    }
    this.KtcSelectedRepositoryId = canonical;
    this.KtcDirectoriesInitialized = false;
    await this.KtcLoad(ctx, true);
  }

  private async KtcRemoveExternalRepository(repositoryId: string, ctx: ToolRunContext): Promise<void> {
    const directory = this.KtcDirectories.find((item) => item.root === repositoryId);
    if (!directory || directory.sourceGroup !== "external") throw new Error("只能移除“我的仓库”中的目录。");
    if (this.KtcRunningRepositories.size > 0) throw new Error("Git 操作执行期间不能移除仓库。");
    const answer = await vscode.window.showWarningMessage(
      `从“我的仓库”移除 ${directory.name}？不会删除磁盘上的仓库。`,
      { modal: true, detail: directory.root },
      "移除",
    );
    if (answer !== "移除") return;
    const remaining = this.KtcExternalRepositoryRoots()
      .filter((root) => KtcGitPathKey(root) !== KtcGitPathKey(repositoryId));
    await vscode.workspace.getConfiguration("ktAutoCode").update(
      "git.repositories",
      remaining,
      vscode.ConfigurationTarget.Global,
    );
    if (this.KtcSelectedRepositoryId === repositoryId) this.KtcSelectedRepositoryId = undefined;
    this.KtcDirectoriesInitialized = false;
    await this.KtcLoad(ctx, true);
  }

  private KtcExternalRepositoryRoots(): readonly string[] {
    return vscode.workspace.getConfiguration("ktAutoCode").get<readonly string[]>("git.repositories", []);
  }

  private KtcWorkspaceRepositoryRoots(): readonly string[] {
    const entries = this.KtcExtensionContext?.workspaceState.get<readonly KtcGitWorkspaceRepositoryState[]>(
      KtcGitWorkspaceRepositoriesStateKey,
    ) ?? [];
    const folders = new Map((vscode.workspace.workspaceFolders ?? []).map((folder) => [folder.uri.toString(), folder]));
    return entries.flatMap((entry) => {
      const folder = folders.get(entry.workspaceFolderUri);
      if (!folder) return [];
      const root = resolve(folder.uri.fsPath, entry.relativePath);
      return KtcGitPathContains(folder.uri.fsPath, root) ? [root] : [];
    });
  }

  private async KtcRememberWorkspaceRepository(repositoryRoot: string): Promise<void> {
    const folder = (vscode.workspace.workspaceFolders ?? [])
      .filter((candidate) => KtcGitPathContains(candidate.uri.fsPath, repositoryRoot))
      .sort((left, right) => right.uri.fsPath.length - left.uri.fsPath.length)[0];
    if (!folder) return;
    const entry: KtcGitWorkspaceRepositoryState = {
      workspaceFolderUri: folder.uri.toString(),
      relativePath: relative(folder.uri.fsPath, repositoryRoot).replaceAll("\\", "/") || ".",
    };
    const current = this.KtcExtensionContext?.workspaceState.get<readonly KtcGitWorkspaceRepositoryState[]>(
      KtcGitWorkspaceRepositoriesStateKey,
    ) ?? [];
    const entries = [entry, ...current]
      .filter((value, index, values) => values.findIndex((other) => (
        other.workspaceFolderUri === value.workspaceFolderUri && other.relativePath === value.relativePath
      )) === index)
      .slice(0, 12);
    await this.KtcExtensionContext?.workspaceState.update(KtcGitWorkspaceRepositoriesStateKey, entries);
  }

  private async KtcPersistSelectedRepository(): Promise<void> {
    await this.KtcExtensionContext?.workspaceState.update(
      KtcGitSelectedRepositoryStateKey,
      this.KtcSelectedRepositoryId,
    );
  }

  private async KtcOpenSummary(
    repositoryId: string,
    expectedHeadOid: string,
    selectedOids: readonly string[],
    copyAfterGenerate: boolean,
    ctx: ToolRunContext,
  ): Promise<void> {
    const snapshot = await this.KtcRevalidateHead(repositoryId, expectedHeadOid, ctx);
    const commits = this.KtcSelectedSummaryCommits(snapshot, selectedOids);
    const reviewerChoices = this.KtcReviewerChoices();
    const includeRemoteUrl = this.KtcSummaryDraft?.includeRemoteUrl ?? false;
    const includeCommitTime = this.KtcSummaryDraft?.includeCommitTime ?? true;
    const mentionReviewer = this.KtcSummaryDraft?.mentionReviewer ?? true;
    const fallbackReviewer = this.KtcSummaryDraft?.reviewer || reviewerChoices[0] || "";
    const result = this.KtcFormatSummaries(snapshot, commits, includeRemoteUrl, includeCommitTime, mentionReviewer, fallbackReviewer);
    this.KtcSummaryDraft = {
      repositoryId,
      selectedOids: commits.map((commit) => commit.oid),
      text: result.text,
      textHeight: this.KtcConfiguredSummaryTextHeight(),
      includeRemoteUrl,
      ...(snapshot.remoteUrl ? { remoteUrl: snapshot.remoteUrl } : {}),
      includeCommitTime,
      mentionReviewer,
      reviewer: fallbackReviewer,
      reviewerChoices: KtcUniqueReviewers([...result.reviewers, fallbackReviewer, ...reviewerChoices]),
    };
    this.KtcPostState(ctx);
    if (copyAfterGenerate) {
      await vscode.env.clipboard.writeText(result.text);
      await this.KtcRememberReviewer(fallbackReviewer);
      void vscode.window.showInformationMessage("Git commit 简报已生成并复制。");
    }
  }

  private async KtcCopySummary(
    repositoryId: string,
    expectedHeadOid: string,
    selectedOids: readonly string[],
    text: string,
    ctx: ToolRunContext,
  ): Promise<void> {
    const snapshot = await this.KtcRevalidateHead(repositoryId, expectedHeadOid, ctx);
    this.KtcSelectedSummaryCommits(snapshot, selectedOids);
    const normalized = text.trim();
    if (!normalized || normalized.length > 10_000) throw new Error("简报内容必须为 1–10000 个字符。");
    await vscode.env.clipboard.writeText(normalized);
    if (this.KtcSummaryDraft?.repositoryId === repositoryId) {
      await this.KtcRememberReviewer(this.KtcSummaryDraft.reviewer);
    }
    void vscode.window.showInformationMessage("Git commit 群消息简报已复制。");
  }

  private async KtcUpdateSummaryOptions(
    action: Extract<KtcGitActionMessage, { readonly action: "updateSummaryOptions" }>,
    ctx: ToolRunContext,
  ): Promise<void> {
    const snapshot = this.KtcRequireSession(action.repositoryId).snapshot;
    const commits = this.KtcSelectedSummaryCommits(snapshot, action.selectedOids);
    const reviewer = KtcNormalizeReviewer(action.reviewer);
    await this.KtcRememberReviewer(reviewer);
    const result = this.KtcFormatSummaries(
      snapshot,
      commits,
      action.includeRemoteUrl,
      action.includeCommitTime,
      action.mentionReviewer,
      reviewer,
    );
    this.KtcSummaryDraft = {
      repositoryId: action.repositoryId,
      selectedOids: commits.map((commit) => commit.oid),
      text: result.text,
      textHeight: this.KtcConfiguredSummaryTextHeight(),
      includeRemoteUrl: action.includeRemoteUrl,
      ...(snapshot.remoteUrl ? { remoteUrl: snapshot.remoteUrl } : {}),
      includeCommitTime: action.includeCommitTime,
      mentionReviewer: action.mentionReviewer,
      reviewer,
      reviewerChoices: KtcUniqueReviewers([...result.reviewers, reviewer, ...this.KtcReviewerChoices()]),
    };
    this.KtcPostState(ctx);
  }

  private KtcSelectedSummaryCommits(
    snapshot: KtcGitReadSnapshot,
    selectedOids: readonly string[],
  ): KtcGitReadSnapshot["history"] {
    const selected = new Set(selectedOids);
    if (selected.size === 0) throw new Error("请至少勾选 1 个 commit。");
    const commits = [...snapshot.history].reverse().filter((commit) => selected.has(commit.oid));
    if (commits.length !== selected.size) throw new Error("所选 commit 已变化，请刷新后重试。");
    return commits;
  }

  private KtcFormatSummaries(
    snapshot: KtcGitReadSnapshot,
    commits: KtcGitReadSnapshot["history"],
    includeRemoteUrl: boolean,
    includeCommitTime: boolean,
    mentionReviewer: boolean,
    fallbackReviewer: string,
  ): { readonly text: string; readonly reviewers: readonly (string | undefined)[] } {
    const result = this.KtcAdapter.formatGroupSummaries({
      repositoryName: snapshot.name,
      branch: snapshot.branch,
      upstream: snapshot.upstream,
      commits,
      visibleOids: snapshot.history.map((item) => item.oid),
      remoteUrl: snapshot.remoteUrl,
      includeRemoteUrl,
      includeCommitTime,
      mentionReviewer,
      fallbackReviewer,
    });
    return {
      text: result.text,
      reviewers: result.summaries.map((summary) => summary.reviewer),
    };
  }

  private KtcReviewerChoices(): string[] {
    const configured = vscode.workspace.getConfiguration("ktAutoCode").get<readonly string[]>("git.reviewers", []);
    return KtcUniqueReviewers([...configured, ...this.KtcLegacyReviewers]);
  }

  private KtcConfiguredSummaryTextHeight(): number {
    return KtcNormalizeSummaryTextHeight(
      vscode.workspace.getConfiguration("ktAutoCode").get<number>("git.summaryTextHeight", 78),
    );
  }

  private async KtcRememberReviewer(value: string): Promise<void> {
    const reviewer = KtcNormalizeReviewer(value);
    if (!reviewer) return;
    await this.KtcReviewerMigration;
    await vscode.workspace.getConfiguration("ktAutoCode").update(
      "git.reviewers",
      KtcUniqueReviewers([reviewer, ...this.KtcReviewerChoices()]).slice(0, 12),
      vscode.ConfigurationTarget.Global,
    );
  }

  private async KtcMigrateReviewerSettings(context: vscode.ExtensionContext): Promise<void> {
    if (this.KtcLegacyReviewers.length === 0) return;
    const configuration = vscode.workspace.getConfiguration("ktAutoCode");
    const configured = configuration.get<readonly string[]>("git.reviewers", []);
    await configuration.update(
      "git.reviewers",
      KtcUniqueReviewers([...configured, ...this.KtcLegacyReviewers]).slice(0, 12),
      vscode.ConfigurationTarget.Global,
    );
    await context.globalState.update(KtcGitReviewerStateKey, undefined);
    this.KtcLegacyReviewers = [];
  }

  private async KtcSelectAndAnalyzeSquash(repositoryId: string, ctx: ToolRunContext): Promise<void> {
    const session = this.KtcRequireSession(repositoryId);
    const operationGeneration = ++this.KtcReadGeneration;
    const expectedHeadOid = session.snapshot.headOid;
    ctx.postState({ status: "running", message: "正在按需加载合并候选…" });
    const candidates = await this.KtcAdapter.readRepository(session.snapshot.root, 200);
    if (operationGeneration !== this.KtcReadGeneration || this.KtcSelectedRepositoryId !== repositoryId) return;
    if (KtcGitPathKey(candidates.root) !== KtcGitPathKey(session.snapshot.root)
      || candidates.headOid !== expectedHeadOid) {
      const generation = ++this.KtcReadGeneration;
      await this.KtcReadSelectedRepository(repositoryId, generation, ctx);
      throw new Error("HEAD 已变化，已刷新最新 commit，请重新选择合并区间。");
    }
    const picks = [...candidates.history].reverse().map((commit) => ({
      label: `${commit.oid.slice(0, 7)}  ${commit.subject || "(无标题)"}`,
      description: `${commit.author.name} · ${KtcFormatGitDate(commit.author.date)}`,
      detail: commit.parentOids.length === 1 ? undefined : `父节点 ${commit.parentOids.length} 个；预检会阻断非直线历史`,
      oid: commit.oid,
    }));
    const selected = await vscode.window.showQuickPick(picks, {
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
      placeHolder: "选择同一直线中的连续 commit（至少 2 个；最新端不必是 HEAD）",
      title: `${candidates.name}：合并本地未发布 commit`,
    });
    if (!selected) {
      this.KtcPostState(ctx);
      return;
    }
    if (selected.length < 2) {
      void vscode.window.showWarningMessage("至少选择 2 个 commit。可选择直线历史中间的连续区间。");
      this.KtcPostState(ctx);
      return;
    }
    if (operationGeneration !== this.KtcReadGeneration || this.KtcSelectedRepositoryId !== repositoryId) return;
    const selectedOids = selected.map((item) => item.oid);
    ctx.postState({ status: "running", message: "正在执行 Git 安全预检…" });
    const analysis = await this.KtcAdapter.analyzeSquash(candidates.root, selectedOids);
    if (operationGeneration !== this.KtcReadGeneration || this.KtcSelectedRepositoryId !== repositoryId) return;
    if (analysis.snapshot.headOid !== expectedHeadOid
      || KtcGitPathKey(analysis.snapshot.root) !== KtcGitPathKey(session.snapshot.root)) {
      const generation = ++this.KtcReadGeneration;
      await this.KtcReadSelectedRepository(repositoryId, generation, ctx);
      throw new Error("HEAD 或仓库根目录在预检期间变化，请重新选择合并区间。");
    }
    if (!analysis.plan.valid || !analysis.draft || !analysis.plan.currentRef || !analysis.plan.oldHeadOid
      || !analysis.plan.baseParentOid || !analysis.plan.selectedTipTreeOid || !analysis.plan.finalTreeOid) {
      const message = KtcBlockerMessage(analysis.plan.blockers);
      this.KtcPostState(ctx, "error", message);
      void vscode.window.showErrorMessage(message);
      return;
    }
    const commitByOid = new Map(analysis.snapshot.history.map((commit) => [commit.oid, commit]));
    this.KtcSquashDraft = {
      repositoryId,
      expectedHeadOid: analysis.plan.oldHeadOid,
      currentRef: analysis.plan.currentRef,
      selectedOids: analysis.plan.selectedOids,
      selectedLabels: analysis.plan.selectedOids.map((oid) => {
        const commit = commitByOid.get(oid);
        return `${oid.slice(0, 7)} ${commit?.subject || "(无标题)"}`;
      }),
      baseParentOid: analysis.plan.baseParentOid,
      selectedTipTreeOid: analysis.plan.selectedTipTreeOid,
      finalTreeOid: analysis.plan.finalTreeOid,
      replayCount: analysis.plan.replayOids.length,
      replayLabels: analysis.plan.replayOids.map((oid) => {
        const commit = commitByOid.get(oid);
        return `${oid.slice(0, 12)} ${commit?.subject || "(无标题)"}`;
      }),
      warnings: KtcSquashWarnings(analysis.plan.warnings),
      message: analysis.draft.message,
      author: KtcIdentity(analysis.draft.author),
      committer: KtcIdentity(analysis.draft.committer),
    };
    this.KtcSummaryDraft = undefined;
    this.KtcPostState(ctx);
  }

  private async KtcExecuteSquash(
    action: Extract<KtcGitActionMessage, { readonly action: "executeSquash" }>,
    ctx: ToolRunContext,
  ): Promise<void> {
    const session = this.KtcRequireSession(action.repositoryId);
    const directory = this.KtcDirectories.find((item) => item.root === action.repositoryId);
    if (!directory) throw new Error("Git 仓库目录已失效，请重新选择。");
    const canonicalRoot = await KtcCanonicalGitRoot(await this.KtcAdapter.findRepositoryRoot(directory.root));
    if (KtcGitPathKey(canonicalRoot) !== KtcGitPathKey(directory.root)) {
      throw new Error("Git 仓库根目录已变化，不能执行合并。");
    }
    const current = await this.KtcAdapter.readRepository(canonicalRoot, 1);
    if (current.headOid !== action.expectedHeadOid || current.currentRef !== session.snapshot.currentRef) {
      throw new Error("HEAD 或当前分支已变化，不能执行合并；请重新预检。");
    }
    if (!current.clean || current.operationState !== "idle") {
      throw new Error("工作区状态或 Git 操作已变化，不能执行合并；请处理后重新预检。");
    }
    if (this.KtcRunningRepositories.has(action.repositoryId)) throw new Error("这个仓库已有 Git 操作正在执行。");
    const trusted = this.KtcSquashDraft;
    if (!trusted
      || trusted.repositoryId !== action.repositoryId
      || trusted.expectedHeadOid !== action.expectedHeadOid
      || trusted.selectedOids.length !== action.selectedOids.length
      || trusted.selectedOids.some((oid, index) => oid !== action.selectedOids[index])) {
      throw new Error("合并预览已变化，请重新选择并预检。");
    }
    const draft = KtcValidatedDraft(action.message, action.author, action.committer);
    const hasWarnings = trusted.warnings.length > 0;
    const confirmLabel = hasWarnings ? "确认仅改写本地" : "确认合并";
    const repositoryDetail = directory.sourceGroup === "external"
      ? [`工作区外仓库：${directory.root}`, `分支：${current.branch ?? "detached"}`, `HEAD：${current.headOid.slice(0, 12)}`, ""]
      : [];
    const warningDetail = hasWarnings
      ? [
          ...repositoryDetail,
          ...trusted.warnings.map((warning) => `• ${warning.label}`),
          "",
          "确认后仅更新当前本地分支；不会 push，不会删除或移动 remote、其他分支和标签。它们会继续指向旧历史。",
        ].join("\n")
      : [...repositoryDetail, `当前 HEAD ${action.expectedHeadOid.slice(0, 12)}；失败时原分支保持不变。`].join("\n");
    const answer = await vscode.window.showWarningMessage(
      hasWarnings
        ? `${directory.sourceGroup === "external" ? "工作区外仓库；" : ""}受影响历史已被共享引用。仍要合并 ${action.selectedOids.length} 个 commit 吗？`
        : `${directory.sourceGroup === "external" ? "工作区外仓库；" : ""}将 ${action.selectedOids.length} 个 commit 合并，并逐个重放其后的提交。操作只更新本地分支，不会 push。`,
      { modal: true, detail: warningDetail },
      confirmLabel,
    );
    if (answer !== confirmLabel) return;
    this.KtcRunningRepositories.add(action.repositoryId);
    ctx.postState({ status: "running", message: "正在隔离 worktree 中合并并重放 commit…" });
    try {
      const result = await this.KtcAdapter.executeSquash({
        repositoryRoot: session.snapshot.root,
        selectedOids: action.selectedOids,
        expectedHeadOid: action.expectedHeadOid,
        draft,
        acknowledgedWarnings: [...new Set(trusted.warnings.map((warning) => warning.code))]
          .filter((code): code is "remote-history" | "occupied-ref" => code === "remote-history" || code === "occupied-ref"),
      });
      const currentRef = session.snapshot.currentRef;
      if (!currentRef) throw new Error("合并已完成，但原分支引用缺失；请检查备份引用。");
      this.KtcUndoState = { repositoryId: action.repositoryId, currentRef, result };
      this.KtcSummaryDraft = undefined;
      this.KtcSquashDraft = undefined;
      const refreshed = await this.KtcAdapter.readRepositorySummary(session.snapshot.root, 1, true);
      const refreshedSnapshot = KtcGitReadSnapshotFromSummary(refreshed, session.snapshot.name);
      const refreshedSession = {
        snapshot: refreshedSnapshot,
        ...(refreshed.commits.at(-1)?.oid ? { nextBeforeOid: refreshed.commits.at(-1)!.oid } : {}),
        hasMoreCommits: refreshed.commits.length > 0,
      } satisfies KtcGitSession;
      this.KtcSessions.set(action.repositoryId, refreshedSession);
      this.KtcRepositoryInputs = this.KtcRepositoryInputs.map((item) => item.id === action.repositoryId
        ? this.KtcRepositoryInput(refreshedSnapshot, item, refreshedSession.hasMoreCommits)
        : item);
      this.KtcPostState(ctx);
      ctx.log(`[Git] squash ${result.oldHeadOid.slice(0, 12)} -> ${result.newHeadOid.slice(0, 12)}; backup=${result.backupRef}`);
      void vscode.window.showInformationMessage("本地 commit 合并完成；未执行 push。可在 Git Block 中撤销一次。");
    } catch (error) {
      ctx.log(`[Git] squash failed: ${KtcErrorMessage(error)}`);
      this.KtcPostState(ctx, "error", `合并失败：${KtcErrorMessage(error)}`);
      throw error;
    } finally {
      this.KtcRunningRepositories.delete(action.repositoryId);
    }
  }

  private async KtcUndoSquash(repositoryId: string, ctx: ToolRunContext): Promise<void> {
    const undo = this.KtcUndoState;
    if (!undo || undo.repositoryId !== repositoryId) throw new Error("没有可撤销的 Git 合并记录。");
    const session = this.KtcRequireSession(repositoryId);
    const latest = await this.KtcAdapter.readRepository(session.snapshot.root, 200);
    if (!latest.clean || latest.operationState !== "idle" || latest.currentRef !== undo.currentRef
      || latest.headOid !== undo.result.newHeadOid) {
      throw new Error("HEAD、分支或工作区状态已变化，不能自动撤销；备份引用仍保留供人工恢复。");
    }
    const answer = await vscode.window.showWarningMessage(
      `撤销刚才的本地历史改写，恢复 HEAD ${undo.result.oldHeadOid.slice(0, 12)}？`,
      { modal: true },
      "确认撤销",
    );
    if (answer !== "确认撤销") return;
    await this.KtcAdapter.undoSquash(
      latest.root,
      undo.currentRef,
      undo.result.newHeadOid,
      undo.result.backupRef,
    );
    this.KtcUndoState = undefined;
    await this.refresh(ctx);
    void vscode.window.showInformationMessage("已恢复合并前的本地 commit 历史。");
  }

  private KtcRequireSession(repositoryId: string): KtcGitSession {
    const session = this.KtcSessions.get(repositoryId);
    if (!session) throw new Error("仓库状态已过期，请刷新 Git Block。");
    return session;
  }

  private KtcRepositoryInput(
    snapshot: KtcGitReadSnapshot,
    display: Pick<KtcGitRepositoryDisplay, "name"> & {
      readonly relativePath?: string;
      readonly sourceGroup?: "workspace" | "external";
    },
    hasMoreCommits: boolean,
  ): KtcGitRepositoryInput {
    return {
      id: snapshot.root,
      name: snapshot.name || display.name,
      relativePath: display.relativePath || display.name,
      branch: snapshot.branch,
      upstream: snapshot.upstream,
      remoteUrl: snapshot.remoteUrl,
      head: snapshot.headOid,
      detached: snapshot.detached,
      loaded: true,
      sourceGroup: display.sourceGroup ?? "workspace",
      hasMoreCommits,
      commits: snapshot.history.map((commit) => ({
        oid: commit.oid,
        subject: commit.subject,
        body: commit.body,
        author: KtcIdentity(commit.author),
        committer: KtcIdentity(commit.committer),
        isHead: commit.oid === snapshot.headOid,
      })),
      recentCommitLimit: snapshot.history.length,
    };
  }

  private KtcDirectoryInput(directory: KtcGitDirectory): KtcGitRepositoryInput {
    return {
      id: directory.root,
      name: directory.name,
      relativePath: directory.relativePath,
      sourceGroup: directory.sourceGroup,
      loaded: false,
      recentCommitLimit: 1,
      hasMoreCommits: false,
    };
  }

  private KtcPostState(
    ctx: ToolRunContext,
    status: ToolUiState["status"] = "done",
    message?: string,
  ): void {
    const git: KtcGitViewModel = KtcCreateGitModel({
      repositories: this.KtcRepositoryInputs,
      selectedRepositoryId: this.KtcSelectedRepositoryId,
      workspaceFolderCount: vscode.workspace.workspaceFolders?.length ?? 0,
      discovery: this.KtcRepositorySearchState,
      summaryDraft: this.KtcSummaryDraft,
      squashDraft: this.KtcSquashDraft,
      ...(this.KtcUndoState ? {
        lastOperation: {
          repositoryId: this.KtcUndoState.repositoryId,
          oldHeadLabel: this.KtcUndoState.result.oldHeadOid.slice(0, 7),
          newHeadLabel: this.KtcUndoState.result.newHeadOid.slice(0, 7),
          rewrittenCount: this.KtcUndoState.result.rewritten.length,
        },
      } : {}),
    });
    ctx.postState({ status, message: message ?? git.statusText, git });
  }

}

const KtcGitReviewerStateKey = "ktAutoCode.git.reviewers.v1";
const KtcGitSelectedRepositoryStateKey = "ktAutoCode.git.selectedRepository.v1";
const KtcGitWorkspaceRepositoriesStateKey = "ktAutoCode.git.workspaceRepositories.v1";

interface KtcVsCodeGitRepository {
  readonly rootUri: vscode.Uri;
  readonly state?: {
    readonly submodules?: readonly { readonly path: string }[];
  };
}

interface KtcVsCodeGitApi {
  readonly repositories: readonly KtcVsCodeGitRepository[];
  init?(root: vscode.Uri): Promise<KtcVsCodeGitRepository | null>;
}

interface KtcVsCodeGitExports {
  getAPI(version: 1): KtcVsCodeGitApi;
}

async function KtcReadVsCodeGitRepositories(ctx: ToolRunContext): Promise<KtcGitApiRepositorySeed[]> {
  try {
    const api = await KtcGetVsCodeGitApi(ctx);
    return (api?.repositories ?? [])
      .filter((repository) => repository.rootUri.scheme === "file")
      .map((repository) => ({
        rootPath: repository.rootUri.fsPath,
        submodulePaths: repository.state?.submodules?.map((submodule) => submodule.path) ?? [],
      }));
  } catch (error) {
    ctx.log(`[Git] VS Code Git API discovery unavailable: ${KtcErrorMessage(error)}`);
    return [];
  }
}

async function KtcGetVsCodeGitApi(ctx: ToolRunContext): Promise<KtcVsCodeGitApi | undefined> {
  try {
    const extension = vscode.extensions.getExtension<KtcVsCodeGitExports>("vscode.git");
    if (!extension) return undefined;
    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports?.getAPI(1);
  } catch (error) {
    ctx.log(`[Git] VS Code Git API unavailable: ${KtcErrorMessage(error)}`);
    return undefined;
  }
}

function KtcNormalizeSummaryTextHeight(value: number): number {
  return Math.min(1200, Math.max(78, Math.round(value)));
}

function KtcNormalizeReviewer(value: string | undefined): string {
  const normalized = value?.trim().replace(/^@+/u, "") ?? "";
  if (normalized.length > 80 || /[\r\n<>]/u.test(normalized)) throw new Error("默认审查人格式无效。");
  return normalized;
}

function KtcUniqueReviewers(values: readonly (string | undefined)[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const reviewer = KtcNormalizeReviewer(value);
    if (!reviewer || seen.has(reviewer.toLocaleLowerCase())) continue;
    seen.add(reviewer.toLocaleLowerCase());
    result.push(reviewer);
  }
  return result;
}

function KtcIdentity(identity: KtcPnwGitIdentity): KtcGitIdentity {
  return { ...identity, dateLabel: KtcFormatGitDate(identity.date) };
}

function KtcValidatedDraft(
  message: string,
  author: KtcPnwGitIdentity,
  committer: KtcPnwGitIdentity,
): { message: string; author: KtcPnwGitIdentity; committer: KtcPnwGitIdentity } {
  const normalizedMessage = message.trim();
  if (!normalizedMessage || normalizedMessage.length > 100_000) throw new Error("commit 信息必须为 1–100000 个字符。");
  for (const [label, identity] of [["Author", author], ["Committer", committer]] as const) {
    if (!identity.name.trim() || identity.name.length > 256 || /[\r\n<>]/u.test(identity.name)) throw new Error(`${label} 姓名无效。`);
    if (!identity.email.trim() || identity.email.length > 512 || /[\r\n<>]/u.test(identity.email)) throw new Error(`${label} 邮箱无效。`);
    if (!identity.date.trim() || identity.date.length > 128 || /[\r\n]/u.test(identity.date)) throw new Error(`${label} 时间无效。`);
  }
  return {
    message: normalizedMessage,
    author: { name: author.name.trim(), email: author.email.trim(), date: KtcNormalizeGitDateInput(author.date) },
    committer: { name: committer.name.trim(), email: committer.email.trim(), date: KtcNormalizeGitDateInput(committer.date) },
  };
}

function KtcBlockerMessage(blockers: readonly KtcPnwGitSquashBlocker[]): string {
  if (blockers.length === 0) return "Git 预检失败，请刷新后重试。";
  const labels: Record<string, string> = {
    "detached-head": "当前为 detached HEAD",
    "dirty-worktree": "工作区存在本地变更",
    "operation-in-progress": "存在进行中的 Git 操作",
    "selection-too-small": "至少选择 2 个 commit",
    "selection-not-found": "选择包含已变化的 commit",
    "selection-not-contiguous": "所选 commit 不是连续区间",
    "history-not-linear": "所选到 HEAD 之间不是单父直线历史",
    "root-commit": "不能合并根 commit",
    "signed-commit": "受影响历史包含签名 commit",
    "unsupported-headers": "受影响历史包含不支持的 commit header",
  };
  return `不能执行合并：${[...new Set(blockers.map((blocker) => labels[blocker.code] ?? blocker.code))].join("；")}。`;
}

function KtcSquashWarnings(
  warnings: readonly { readonly code: string; readonly oid?: string; readonly refName?: string }[],
): { readonly code: string; readonly label: string }[] {
  const seen = new Set<string>();
  const result: { code: string; label: string }[] = [];
  for (const warning of warnings) {
    const key = warning.code === "occupied-ref" ? `${warning.code}\0${warning.refName ?? ""}` : warning.code;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ code: warning.code, label: KtcWarningLabel(warning) });
  }
  return result;
}

function KtcWarningLabel(warning: { readonly code: string; readonly refName?: string }): string {
  if (warning.code === "remote-history") {
    return "remote 已引用受影响历史";
  }
  if (warning.code === "occupied-ref") {
    return `${warning.refName ?? "其他分支或标签"} 仍将指向旧历史`;
  }
  return warning.code;
}

function KtcErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function KtcIsAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function KtcGitReadSnapshotFromSummary(
  summary: KtcPnwGitRepositorySummary,
  fallbackName: string,
): KtcGitReadSnapshot {
  return {
    root: summary.root,
    name: basename(summary.root) || fallbackName,
    ...(summary.currentRef ? { currentRef: summary.currentRef } : {}),
    ...(summary.branch ? { branch: summary.branch } : {}),
    ...(summary.upstream ? { upstream: summary.upstream } : {}),
    ...(summary.remoteUrl ? { remoteUrl: summary.remoteUrl } : {}),
    headOid: summary.headOid,
    detached: !summary.currentRef,
    history: [...summary.commits].reverse(),
  };
}

function KtcGitPathKey(value: string): string {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}

async function KtcCanonicalGitRoot(value: string): Promise<string> {
  return resolve(await realpath(resolve(value)));
}

function KtcGitPathContains(parentPath: string, candidatePath: string): boolean {
  const parent = KtcGitPathKey(parentPath);
  const candidate = KtcGitPathKey(candidatePath);
  if (parent === candidate) return true;
  const separator = process.platform === "win32" ? "\\" : "/";
  return candidate.startsWith(parent.endsWith(separator) ? parent : `${parent}${separator}`);
}
