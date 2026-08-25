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
} from "../../core/git/KtcGitModel.js";
import { KtcFormatGitDate, KtcNormalizeGitDateInput } from "../../core/git/KtcGitDate.js";
import type { ToolRunContext, ToolUiState } from "../types.js";
import {
  KtcGitWingAdapter,
  type KtcPnwGitCommitGraphCommit,
  type KtcPnwGitCommitGraphRefsScope,
  type KtcPnwGitCommitGraphRow,
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
import {
  KtcGitSquashViewController,
  type KtcGitSquashGraphState,
  type KtcGitSquashViewMessage,
} from "./KtcGitSquashViewController.js";
import {
  KtcReadGitWorktreeChanges,
  KtcRestoreGitStash,
  KtcStashGitWorktree,
  type KtcGitStashReceipt,
  type KtcGitWorktreeChanges,
} from "./KtcGitStashService.js";
import {
  KtcAssessGitBranchRange,
  KtcCreateGitRangeSelection,
  KtcSameGitOidSelection,
  KtcUpdateGitRangeSelection,
} from "./KtcGitSelection.js";
import { KtcReadLocalGitBranchLines, KtcSwitchToLocalGitBranch } from "./KtcGitBranchService.js";

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
  | { readonly action: "switchBranch"; readonly repositoryId: string }
  | {
      readonly action: "loadOlderCommits";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly count: 1 | 5;
    }
  | { readonly action: "openAction"; readonly actionId: string; readonly repositoryId: string }
  | {
      readonly action: "openSquashWithSelection";
      readonly repositoryId: string;
      readonly expectedHeadOid: string;
      readonly selectedOids: readonly string[];
    }
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

/** 当前单例合并 View 的轻量图会话；安全预检仍按需调用完整 Wing 链。 */
interface KtcGitGraphSession {
  readonly repositoryId: string;
  readonly root: string;
  readonly headOid: string;
  readonly refsScope: KtcPnwGitCommitGraphRefsScope;
  readonly commits: readonly KtcPnwGitCommitGraphCommit[];
  readonly graphRows: readonly KtcPnwGitCommitGraphRow[];
  readonly nextBeforeCursor?: string;
  readonly hasMore: boolean;
  readonly selectedOids: readonly string[];
  readonly selectableOids: readonly string[];
  readonly selectionAnchorOid?: string;
  readonly selectionEndpointOid?: string;
  readonly branchSwitch?: KtcGitPendingBranchSwitch;
}

interface KtcGitPendingBranchSwitch {
  readonly currentBranchName: string;
  readonly targetBranchName: string;
  readonly selectedOids: readonly string[];
}

interface KtcGitSquashViewBinding {
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly branchLabel: string;
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

interface KtcGitPendingStash extends KtcGitStashReceipt {
  readonly repositoryId: string;
  readonly repositoryRoot: string;
}

export class KtcGitController {
  private readonly KtcAdapter = new KtcGitWingAdapter();
  private readonly KtcSessions = new Map<string, KtcGitSession>();
  private readonly KtcRunningRepositories = new Set<string>();
  private KtcDirectories: KtcGitDirectory[] = [];
  private KtcDirectoriesInitialized = false;
  private KtcReadGeneration = 0;
  private KtcReadCancellation: AbortController | undefined;
  private KtcGraphReadGeneration = 0;
  private KtcGraphReadCancellation: AbortController | undefined;
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
  private readonly KtcGraphSessions = new Map<string, KtcGitGraphSession>();
  private KtcSquashView: KtcGitSquashViewController | undefined;
  private KtcSquashViewBinding: KtcGitSquashViewBinding | undefined;
  private KtcUndoState: KtcGitUndoState | undefined;
  private KtcDirtyWorktree: KtcGitWorktreeChanges | undefined;
  private KtcPendingStash: KtcGitPendingStash | undefined;
  private KtcLegacyReviewers: readonly string[] = [];
  private KtcReviewerMigration: Promise<void> = Promise.resolve();
  private KtcExtensionContext: vscode.ExtensionContext | undefined;
  private KtcLastRunContext: ToolRunContext | undefined;

  register(context: vscode.ExtensionContext): void {
    this.KtcExtensionContext = context;
    this.KtcLegacyReviewers = context.globalState.get<readonly string[]>(KtcGitReviewerStateKey) ?? [];
    this.KtcReviewerMigration = this.KtcMigrateReviewerSettings(context);
    this.KtcSquashView = new KtcGitSquashViewController({
      onMessage: async (message) => {
        const ctx = this.KtcLastRunContext;
        if (!ctx) return;
        try {
          await this.KtcHandleSquashViewMessage(message, ctx);
        } catch (error) {
          const stage = message.type === "execute" ? "合并执行" : "合并视图";
          ctx.log(`[Git][${stage}][ERROR] ${KtcErrorMessage(error)}`);
          const repositoryId = this.KtcSquashViewBinding?.repositoryId;
          if (repositoryId && this.KtcGraphSessions.has(repositoryId)) {
            // 执行失败不丢弃安全预检草稿。用户可处理工作区、HEAD 或
            // Git 锁等问题后，直接在原页再次确认执行。
            this.KtcShowSquashView(repositoryId, "error", "合并未执行：" + KtcErrorMessage(error), this.KtcSquashDraft);
          }
          this.KtcPostState(ctx, "error", KtcErrorMessage(error));
        }
      },
      onDispose: () => this.KtcClearSquashViewSession(this.KtcSquashViewBinding?.repositoryId),
    });
    context.subscriptions.push(this.KtcSquashView);
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
    // Primary 刷新不能关闭、换仓或抢占已经打开的合并 View。该 View
    // 自己校验绑定仓库和 HEAD；失效时只在原位置报告。
    await this.KtcLoad(ctx, true);
    const repositoryId = this.KtcSquashViewBinding?.repositoryId;
    const graph = repositoryId ? this.KtcGraphSessions.get(repositoryId) : undefined;
    const session = repositoryId ? this.KtcSessions.get(repositoryId) : undefined;
    if (repositoryId && graph && session && graph.headOid !== session.snapshot.headOid) {
      this.KtcInvalidateSquashView(repositoryId, "HEAD 已变化；合并 View 保持打开，请关闭后重新打开。");
    }
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
    if (this.KtcSquashDraft
      && !validIds.has(this.KtcSquashDraft.repositoryId)
      && this.KtcSquashViewBinding?.repositoryId !== this.KtcSquashDraft.repositoryId) {
      this.KtcSquashDraft = undefined;
    }
    for (const repositoryId of this.KtcGraphSessions.keys()) {
      if (!validIds.has(repositoryId) && this.KtcSquashViewBinding?.repositoryId !== repositoryId) {
        this.KtcGraphSessions.delete(repositoryId);
      }
    }
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
      for (const repositoryId of this.KtcSessions.keys()) {
        if (repositoryId !== this.KtcSquashViewBinding?.repositoryId) this.KtcSessions.delete(repositoryId);
      }
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
    if (action.action === "switchBranch") {
      await vscode.commands.executeCommand("git.checkout");
      await this.refresh(ctx);
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
      this.KtcSquashView?.reveal();
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
        await this.KtcOpenSquashView(action.repositoryId, ctx);
      }
      return;
    }
    if (action.action === "openSquashWithSelection") {
      await this.KtcOpenSquashView(action.repositoryId, ctx, "local-branches", action.selectedOids, action.expectedHeadOid);
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
    if (this.KtcSummaryDraft) {
      const answer = await vscode.window.showWarningMessage(
        "切换仓库将关闭当前 Git 简报草稿，是否继续？已打开的合并 View 不受影响。",
        { modal: true },
        "切换并关闭简报",
      );
      if (answer !== "切换并关闭简报") {
        this.KtcPostState(ctx);
        return;
      }
    }
    this.KtcSummaryDraft = undefined;
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
      for (const loadedRepositoryId of this.KtcSessions.keys()) {
        if (loadedRepositoryId !== repositoryId
          && loadedRepositoryId !== this.KtcSquashViewBinding?.repositoryId) {
          this.KtcSessions.delete(loadedRepositoryId);
        }
      }
      this.KtcSessions.set(repositoryId, session);
      this.KtcRepositoryInputs = this.KtcDirectories.map((item) => item.root === repositoryId
        ? this.KtcRepositoryInput(snapshot, item, session.hasMoreCommits)
        : this.KtcDirectoryInput(item));
      this.KtcPostState(ctx);
    } catch (error) {
      if (generation !== this.KtcReadGeneration || KtcIsAbortError(error)) return;
      if (this.KtcSquashViewBinding?.repositoryId !== repositoryId) {
        this.KtcSessions.delete(repositoryId);
      }
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

  private KtcBeginGraphRead(): AbortController {
    this.KtcAbortGraphRead();
    const cancellation = new AbortController();
    this.KtcGraphReadCancellation = cancellation;
    return cancellation;
  }

  private KtcAbortGraphRead(): void {
    this.KtcGraphReadCancellation?.abort();
    this.KtcGraphReadCancellation = undefined;
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
      this.KtcShowTransientSummaryStatus("Git commit 简报已生成并复制。");
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
    this.KtcShowTransientSummaryStatus("Git commit 群消息简报已复制。");
  }

  /**
   * VS Code notification toast 不提供受控的关闭 API。简报复制属于高频、
   * 无需打断用户的成功反馈，因此使用会自动覆盖并在 4 秒后消失的状态栏消息。
   */
  private KtcShowTransientSummaryStatus(message: string): void {
    vscode.window.setStatusBarMessage(message, 4_000);
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

  private async KtcOpenSquashView(
    repositoryId: string,
    ctx: ToolRunContext,
    refsScope: KtcPnwGitCommitGraphRefsScope = "local-branches",
    selectedOids: readonly string[] = [],
    expectedHeadOid?: string,
    readyMessage?: string,
    reloadExisting = false,
  ): Promise<void> {
    const existingBinding = this.KtcSquashViewBinding;
    if (existingBinding && existingBinding.repositoryId !== repositoryId) {
      this.KtcSquashView?.reveal();
      void vscode.window.showWarningMessage(
        `合并 View 当前绑定“${existingBinding.repositoryName}”。请先手动关闭该 View，再打开其他仓库。`,
      );
      return;
    }
    if (existingBinding && this.KtcSquashView?.isOpen && !reloadExisting) {
      this.KtcSquashView.reveal();
      return;
    }
    const session = this.KtcRequireSession(repositoryId);
    const directory = this.KtcDirectories.find((item) => item.root === repositoryId);
    if (!directory || !session.snapshot.currentRef || session.snapshot.detached) {
      throw new Error("当前仓库不在可改写的本地分支上，不能打开合并视图。");
    }
    if (expectedHeadOid && expectedHeadOid !== session.snapshot.headOid) {
      throw new Error("HEAD 已变化，不能使用旧的勾选结果；请重新读取后再合并。");
    }
    const initialSelection = KtcPrimarySelectedOids(session, selectedOids);
    this.KtcSummaryDraft = undefined;
    this.KtcSquashDraft = undefined;
    const generation = ++this.KtcGraphReadGeneration;
    ctx.postState({ status: "running", message: "正在读取合并视图的最近 5 条提交图…" });
    const cancellation = this.KtcBeginGraphRead();
    try {
      const page = await this.KtcAdapter.readCommitGraphPage(session.snapshot.root, {
        limit: 5,
        refsScope,
        signal: cancellation.signal,
      });
      if (generation !== this.KtcGraphReadGeneration) return;
      if (KtcGitPathKey(page.root) !== KtcGitPathKey(session.snapshot.root) || page.headOid !== session.snapshot.headOid) {
        throw new Error("HEAD 或仓库根目录在打开提交图期间变化，请刷新后重试。");
      }
      const commits = [...page.commits];
      const graphRows = [...page.graphRows];
      let nextBeforeCursor = page.nextBeforeCursor;
      let hasMore = page.hasMore;
      const missingSelectedOids = new Set(initialSelection);
      for (const commit of commits) missingSelectedOids.delete(commit.oid);
      // Primary 可能已勾选首屏 5 条之外的 commit。普通打开仍只读 5 条；仅当带入数量
      // 与图中实际命中数量不一致时，才沿 Wing 的不透明 cursor 每次补 5 条。
      while (missingSelectedOids.size > 0 && hasMore && nextBeforeCursor && commits.length < 1_000) {
        const continuation = await this.KtcAdapter.readCommitGraphPage(session.snapshot.root, {
          expectedHeadOid: session.snapshot.headOid,
          beforeCursor: nextBeforeCursor,
          limit: Math.min(5, 1_000 - commits.length),
          refsScope,
          signal: cancellation.signal,
        });
        if (generation !== this.KtcGraphReadGeneration) return;
        if (
          KtcGitPathKey(continuation.root) !== KtcGitPathKey(session.snapshot.root)
          || continuation.headOid !== session.snapshot.headOid
          || continuation.refsScope !== refsScope
        ) {
          throw new Error("HEAD、仓库根目录或提交图范围在补齐勾选期间变化，请刷新后重试。");
        }
        commits.push(...continuation.commits);
        graphRows.push(...continuation.graphRows);
        for (const commit of continuation.commits) missingSelectedOids.delete(commit.oid);
        nextBeforeCursor = continuation.nextBeforeCursor;
        hasMore = continuation.hasMore;
      }
      if (missingSelectedOids.size > 0) {
        throw new Error(`带入的 ${missingSelectedOids.size} 个 commit 不在当前可见本地分支图中；请刷新后重新选择。`);
      }
      const rangeSelection = KtcCreateGitRangeSelection(commits, initialSelection);
      this.KtcGraphSessions.set(repositoryId, {
        repositoryId,
        root: page.root,
        headOid: page.headOid,
        refsScope: page.refsScope,
        commits,
        graphRows,
        ...(nextBeforeCursor ? { nextBeforeCursor } : {}),
        hasMore,
        selectedOids: rangeSelection.selectedOids,
        selectableOids: rangeSelection.selectableOids,
        ...(rangeSelection.anchorOid ? { selectionAnchorOid: rangeSelection.anchorOid } : {}),
        ...(rangeSelection.endpointOid ? { selectionEndpointOid: rangeSelection.endpointOid } : {}),
      });
      this.KtcSquashViewBinding = {
        repositoryId,
        repositoryName: session.snapshot.name,
        branchLabel: session.snapshot.branch ?? session.snapshot.currentRef ?? "detached",
      };
      if (!reloadExisting) {
        const selectionLabel = initialSelection.length > 0
          ? `带入 ${initialSelection.length} 个勾选`
          : "未带入勾选";
        ctx.log(`[Git][合并视图][INFO] 打开：仓库 ${session.snapshot.name}；分支 ${session.snapshot.branch ?? session.snapshot.currentRef}；HEAD ${session.snapshot.headOid.slice(0, 12)}；${selectionLabel}；已加载 ${commits.length} 条。`);
      }
      if (rangeSelection.selectedOids.length >= 2) {
        this.KtcShowSquashView(repositoryId, "preflight", "已带入勾选的 commit，正在执行 Git 安全预检…", undefined);
        await this.KtcSelectAndAnalyzeSquash(repositoryId, rangeSelection.selectedOids, ctx);
      } else {
        this.KtcShowSquashView(
          repositoryId,
          "ready",
          readyMessage ?? "已读取最近 5 条本地分支提交图；按需继续加载。",
          undefined,
        );
      }
      this.KtcPostState(ctx);
    } catch (error) {
      if (generation !== this.KtcGraphReadGeneration || KtcIsAbortError(error)) return;
      this.KtcPostState(ctx, "error", `读取提交图失败：${KtcErrorMessage(error)}`);
      throw error;
    } finally {
      if (this.KtcGraphReadCancellation === cancellation) this.KtcGraphReadCancellation = undefined;
    }
  }

  private async KtcHandleSquashViewMessage(message: KtcGitSquashViewMessage, ctx: ToolRunContext): Promise<void> {
    const repositoryId = this.KtcSquashViewBinding?.repositoryId;
    if (!repositoryId) return;
    if (message.type === "ready") {
      return;
    }
    if (message.type === "openScm") {
      await vscode.commands.executeCommand("workbench.view.scm");
      return;
    }
    if (message.type === "select") {
      const graph = this.KtcRequireGraphSession(repositoryId);
      const rangeSelection = KtcUpdateGitRangeSelection(
        graph.commits,
        {
          selectedOids: graph.selectedOids,
          selectableOids: graph.selectableOids,
          ...(graph.selectionAnchorOid ? { anchorOid: graph.selectionAnchorOid } : {}),
          ...(graph.selectionEndpointOid ? { endpointOid: graph.selectionEndpointOid } : {}),
        },
        message.oid,
        message.checked,
        message.anchorOid,
      );
      const selectedOids = rangeSelection.selectedOids;
      // 用户选择优先于打开 View 时自动启动的预检；作废尚未返回的旧分析，避免其覆盖反选结果。
      this.KtcGraphReadGeneration += 1;
      this.KtcSquashDraft = undefined;
      this.KtcGraphSessions.set(repositoryId, {
        ...graph,
        selectedOids,
        selectableOids: rangeSelection.selectableOids,
        selectionAnchorOid: rangeSelection.anchorOid,
        selectionEndpointOid: rangeSelection.endpointOid,
        branchSwitch: undefined,
      });
      this.KtcShowSquashView(repositoryId, "ready", `已选择 ${selectedOids.length} 个 commit；预检会验证连续区间和安全条件。`, undefined);
      return;
    }
    if (message.type === "load") {
      await this.KtcLoadOlderGraphCommits(repositoryId, message.count, ctx);
      return;
    }
    if (message.type === "preflight") {
      const graph = this.KtcRequireGraphSession(repositoryId);
      const selectedOids = KtcGraphSelectedOids(graph, message.selectedOids);
      if (selectedOids.length < 2) {
        this.KtcShowSquashView(repositoryId, "error", "至少选择 2 个 commit。", undefined);
        return;
      }
      this.KtcSquashDraft = undefined;
      this.KtcGraphSessions.set(repositoryId, { ...graph, selectedOids, branchSwitch: undefined });
      await this.KtcSelectAndAnalyzeSquash(repositoryId, selectedOids, ctx);
      return;
    }
    if (message.type === "stashAndPreflight") {
      const graph = this.KtcRequireGraphSession(repositoryId);
      const selectedOids = KtcGraphSelectedOids(graph, message.selectedOids);
      if (selectedOids.length < 2) {
        this.KtcShowSquashView(repositoryId, "error", "至少选择 2 个 commit。", undefined);
        return;
      }
      await this.KtcStashAndAnalyzeSquash(repositoryId, selectedOids, ctx);
      return;
    }
    if (message.type === "switchBranch") {
      await this.KtcSwitchBranchAndAnalyzeSquash(repositoryId, ctx);
      return;
    }
    const graph = this.KtcRequireGraphSession(repositoryId);
    const selectedOids = KtcGraphSelectedOids(graph, message.selectedOids);
    // 保持预检编辑页可见，并禁止用户误以为按钮未生效而重复提交。
    this.KtcShowSquashView(repositoryId, "loading", "正在执行本地 commit 合并…", this.KtcSquashDraft);
    await this.KtcExecuteSquash({
      action: "executeSquash",
      repositoryId,
      expectedHeadOid: graph.headOid,
      selectedOids,
      message: message.message,
      author: { name: message.author.name, email: message.author.email, date: message.author.date },
      committer: { name: message.committer.name, email: message.committer.email, date: message.committer.date },
    }, ctx);
  }

  private async KtcLoadOlderGraphCommits(repositoryId: string, count: 1 | 5, ctx: ToolRunContext): Promise<void> {
    const graph = this.KtcRequireGraphSession(repositoryId);
    if (!graph.hasMore || !graph.nextBeforeCursor) return;
    const session = this.KtcRequireSession(repositoryId);
    const generation = ++this.KtcGraphReadGeneration;
    const cancellation = this.KtcBeginGraphRead();
    this.KtcShowSquashView(repositoryId, "loading", `正在加载下一批 ${count} 条提交图…`, this.KtcSquashDraft);
    try {
      const page = await this.KtcAdapter.readCommitGraphPage(graph.root, {
        expectedHeadOid: graph.headOid,
        beforeCursor: graph.nextBeforeCursor,
        limit: count,
        refsScope: graph.refsScope,
        signal: cancellation.signal,
      });
      if (generation !== this.KtcGraphReadGeneration) return;
      if (page.headOid !== graph.headOid || KtcGitPathKey(page.root) !== KtcGitPathKey(session.snapshot.root)) {
        throw new Error("提交图分页期间 HEAD 或仓库根目录已变化。");
      }
      const rangeSelection = graph.selectionAnchorOid
        ? KtcUpdateGitRangeSelection(
            [...graph.commits, ...page.commits],
            KtcCreateGitRangeSelection([...graph.commits, ...page.commits]),
            graph.selectionEndpointOid ?? graph.selectionAnchorOid,
            true,
            graph.selectionAnchorOid,
          )
        : KtcCreateGitRangeSelection([...graph.commits, ...page.commits]);
      this.KtcGraphSessions.set(repositoryId, {
        ...graph,
        commits: [...graph.commits, ...page.commits],
        graphRows: [...graph.graphRows, ...page.graphRows],
        ...(page.nextBeforeCursor ? { nextBeforeCursor: page.nextBeforeCursor } : {}),
        hasMore: page.hasMore,
        selectedOids: rangeSelection.selectedOids,
        selectableOids: rangeSelection.selectableOids,
        selectionAnchorOid: rangeSelection.anchorOid,
        selectionEndpointOid: rangeSelection.endpointOid,
      });
      this.KtcShowSquashView(repositoryId, "ready", `已加载 ${graph.commits.length + page.commits.length} 条提交图。`, this.KtcSquashDraft);
    } catch (error) {
      if (generation !== this.KtcGraphReadGeneration || KtcIsAbortError(error)) return;
      this.KtcInvalidateSquashView(
        repositoryId,
        `提交图已失效：${KtcErrorMessage(error)}。请关闭 View 后重新打开。`,
      );
    } finally {
      if (this.KtcGraphReadCancellation === cancellation) this.KtcGraphReadCancellation = undefined;
    }
  }

  /** User-approved stash recovery for the only recoverable squash blocker. */
  private async KtcStashAndAnalyzeSquash(
    repositoryId: string,
    selectedOids: readonly string[],
    ctx: ToolRunContext,
  ): Promise<void> {
    const graph = this.KtcRequireGraphSession(repositoryId);
    const changes = this.KtcDirtyWorktree ?? await KtcReadGitWorktreeChanges(graph.root);
    if (changes.total === 0) {
      this.KtcDirtyWorktree = undefined;
      await this.KtcSelectAndAnalyzeSquash(repositoryId, selectedOids, ctx);
      return;
    }
    const detail = [
      `将暂存 ${changes.total} 项工作区改动：暂存 ${changes.staged}、修改 ${changes.modified}、未跟踪 ${changes.untracked}。`,
      "",
      "会包含未跟踪文件，不会包含 ignored 文件。",
      "合并期间不会自动恢复；成功后可选择恢复该次暂存。",
    ].join("\n");
    const answer = await vscode.window.showWarningMessage(
      "暂存工作区改动后重新执行 Git 安全预检？",
      { modal: true, detail },
      "暂存并重新预检",
    );
    if (answer !== "暂存并重新预检") {
      this.KtcShowSquashView(repositoryId, "error", "已取消暂存；请处理工作区改动后再试。", undefined);
      return;
    }
    this.KtcShowSquashView(repositoryId, "loading", "正在暂存工作区改动并重新预检…", undefined);
    const receipt = await KtcStashGitWorktree(
      graph.root,
      "kt-auto-code: temporary stash before local commit merge",
    );
    if (!receipt) {
      this.KtcDirtyWorktree = undefined;
      await this.KtcSelectAndAnalyzeSquash(repositoryId, selectedOids, ctx);
      return;
    }
    this.KtcPendingStash = {
      ...receipt,
      repositoryId,
      repositoryRoot: graph.root,
    };
    this.KtcDirtyWorktree = undefined;
    await this.KtcSelectAndAnalyzeSquash(repositoryId, selectedOids, ctx);
  }

  private async KtcSelectAndAnalyzeSquash(
    repositoryId: string,
    selectedOids: readonly string[],
    ctx: ToolRunContext,
  ): Promise<void> {
    const session = this.KtcRequireSession(repositoryId);
    const graph = this.KtcRequireGraphSession(repositoryId);
    this.KtcDirtyWorktree = undefined;
    const currentBranchName = session.snapshot.branch ?? session.snapshot.currentRef?.replace(/^refs\/heads\//u, "");
    const branches = await KtcReadLocalGitBranchLines(graph.root);
    const branchAssessment = KtcAssessGitBranchRange(branches, currentBranchName, selectedOids);
    if (branchAssessment.kind === "other-branch") {
      const targetBranchName = branchAssessment.candidateBranchNames[0]!;
      const branchSwitch: KtcGitPendingBranchSwitch = {
        currentBranchName: currentBranchName ?? "detached",
        targetBranchName,
        selectedOids: branchAssessment.selectedOids,
      };
      this.KtcGraphSessions.set(repositoryId, { ...graph, branchSwitch });
      const message = `所选 ${selectedOids.length} 个 commit 在本地分支“${targetBranchName}”上相邻连续；当前为“${branchSwitch.currentBranchName}”。请切换后重新预检。`;
      this.KtcPostState(ctx, "done", message);
      this.KtcShowSquashView(repositoryId, "ready", message, undefined);
      ctx.log(`[Git][合并预检][INFO] ${message}`);
      return;
    }
    if (branchAssessment.kind === "ambiguous-branch") {
      const message = `所选 commit 同时出现在多个本地分支的连续历史中：${branchAssessment.candidateBranchNames.join("、")}。请在 Git Primary 切换到目标分支后重新预检。`;
      this.KtcPostState(ctx, "error", message);
      this.KtcShowSquashView(repositoryId, "error", message, undefined);
      ctx.log(`[Git][合并预检][ERROR] ${message}`);
      return;
    }
    if (branchAssessment.kind === "not-contiguous") {
      const message = "不能执行合并：所选 commit 必须在同一本地分支的 first-parent 历史上相邻连续；不能跨分支或跳过中间 commit。";
      this.KtcPostState(ctx, "error", message);
      this.KtcShowSquashView(repositoryId, "error", message, undefined);
      ctx.log(`[Git][合并预检][ERROR] ${message}`);
      return;
    }
    const operationGeneration = ++this.KtcGraphReadGeneration;
    const expectedHeadOid = session.snapshot.headOid;
    ctx.log(`[Git][合并预检][INFO] 开始：仓库 ${session.snapshot.name}；分支 ${session.snapshot.branch ?? session.snapshot.currentRef ?? "detached"}；选择 ${selectedOids.length} 个 commit。`);
    this.KtcShowSquashView(repositoryId, "preflight", "正在执行 Git 安全预检…", undefined);
    const analysis = await this.KtcAdapter.analyzeSquash(graph.root, selectedOids);
    if (operationGeneration !== this.KtcGraphReadGeneration) return;
    if (analysis.snapshot.headOid !== expectedHeadOid
      || KtcGitPathKey(analysis.snapshot.root) !== KtcGitPathKey(session.snapshot.root)) {
      this.KtcInvalidateSquashView(repositoryId, "HEAD 或仓库根目录已变化。请关闭 View 后重新打开。");
      return;
    }
    if (!analysis.plan.valid || !analysis.draft || !analysis.plan.currentRef || !analysis.plan.oldHeadOid
      || !analysis.plan.baseParentOid || !analysis.plan.selectedTipTreeOid || !analysis.plan.finalTreeOid) {
      const message = KtcBlockerMessage(analysis.plan.blockers);
      if (analysis.plan.blockers.some((blocker) => blocker.code === "dirty-worktree")) {
        this.KtcDirtyWorktree = await KtcReadGitWorktreeChanges(graph.root);
      }
      this.KtcPostState(ctx, "error", message);
      this.KtcShowSquashView(repositoryId, "error", message, undefined);
      ctx.log(`[Git][合并预检][ERROR] ${message}`);
      return;
    }
    const commitByOid = new Map(analysis.snapshot.history.map((commit) => [commit.oid, commit]));
    this.KtcGraphSessions.set(repositoryId, { ...graph, selectedOids: analysis.plan.selectedOids });
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
    this.KtcShowSquashView(repositoryId, "ready", "安全预检通过。确认后只改写当前本地分支，不自动 push。", this.KtcSquashDraft);
    ctx.log(`[Git][合并预检][OK] 通过：分支 ${analysis.plan.currentRef.replace(/^refs\/heads\//u, "")}，区间 ${analysis.plan.selectedOids.length} 个 commit；只改本地分支，不自动 push。`);
  }

  /** Switches only after an explicit user action; range ownership stays in the pure model above. */
  private async KtcSwitchBranchAndAnalyzeSquash(repositoryId: string, ctx: ToolRunContext): Promise<void> {
    const graph = this.KtcRequireGraphSession(repositoryId);
    const pending = graph.branchSwitch;
    if (!pending) {
      this.KtcShowSquashView(repositoryId, "error", "没有待切换的本地分支；请重新选择并预检。", undefined);
      return;
    }
    const changes = await KtcReadGitWorktreeChanges(graph.root);
    if (changes.total > 0) {
      const message = `工作区有 ${changes.total} 项未归档改动；请先处理或暂存后再切换分支。`;
      this.KtcDirtyWorktree = changes;
      this.KtcShowSquashView(repositoryId, "error", message, undefined);
      ctx.log(`[Git][分支切换][ERROR] ${message}`);
      return;
    }
    const answer = await vscode.window.showWarningMessage(
      `切换到本地分支“${pending.targetBranchName}”并重新预检所选区间？`,
      { modal: true, detail: `当前分支：${pending.currentBranchName}\n不会 push，也不会改写历史；切换后才会执行安全预检。` },
      "切换并重新预检",
    );
    if (answer !== "切换并重新预检") {
      this.KtcShowSquashView(repositoryId, "ready", "已取消分支切换；选择保持不变。", undefined);
      ctx.log(`[Git][分支切换][INFO] 已取消：${pending.currentBranchName} → ${pending.targetBranchName}。`);
      return;
    }
    this.KtcShowSquashView(repositoryId, "loading", `正在切换到“${pending.targetBranchName}”并读取提交图…`, undefined);
    await KtcSwitchToLocalGitBranch(graph.root, pending.targetBranchName);
    const session = this.KtcRequireSession(repositoryId);
    const summary = await this.KtcAdapter.readRepositorySummary(graph.root, 1, true);
    const snapshot = KtcGitReadSnapshotFromSummary(summary, session.snapshot.name);
    const refreshedSession: KtcGitSession = {
      snapshot,
      ...(summary.commits.at(-1)?.oid ? { nextBeforeOid: summary.commits.at(-1)!.oid } : {}),
      hasMoreCommits: summary.commits.length > 0,
    };
    this.KtcSessions.set(repositoryId, refreshedSession);
    this.KtcRepositoryInputs = this.KtcRepositoryInputs.map((item) => item.id === repositoryId
      ? this.KtcRepositoryInput(snapshot, item, refreshedSession.hasMoreCommits)
      : item);
    ctx.log(`[Git][分支切换][OK] ${pending.currentBranchName} → ${pending.targetBranchName}；重新读取并预检 ${pending.selectedOids.length} 个 commit。`);
    await this.KtcOpenSquashView(
      repositoryId,
      ctx,
      "local-branches",
      pending.selectedOids,
      snapshot.headOid,
      undefined,
      true,
    );
  }

  private KtcShowSquashView(
    repositoryId: string,
    status: KtcGitSquashGraphState["status"],
    message: string,
    draft: KtcGitSquashDraft | undefined,
  ): void {
    const graph = this.KtcGraphSessions.get(repositoryId);
    const session = this.KtcSessions.get(repositoryId);
    const binding = this.KtcSquashViewBinding;
    if (!graph || !binding || binding.repositoryId !== repositoryId) return;
    this.KtcSquashView?.show({
      repositoryId,
      repositoryName: session?.snapshot.name ?? binding.repositoryName,
      branchLabel: session?.snapshot.branch ?? session?.snapshot.currentRef ?? binding.branchLabel,
      expectedHeadOid: graph.headOid,
      refsScope: graph.refsScope,
      commits: graph.commits,
      graphRows: graph.graphRows,
      selectedOids: graph.selectedOids,
      selectableOids: graph.selectableOids,
      selectionAnchorOid: graph.selectionAnchorOid,
      selectionEndpointOid: graph.selectionEndpointOid,
      hasMore: graph.hasMore,
      status,
      message,
      ...(graph.branchSwitch ? { branchSwitch: graph.branchSwitch } : {}),
      ...(draft ? { draft } : {}),
      ...(this.KtcDirtyWorktree ? { dirtyWorktree: this.KtcDirtyWorktree } : {}),
    });
  }

  private KtcRequireGraphSession(repositoryId: string): KtcGitGraphSession {
    const graph = this.KtcGraphSessions.get(repositoryId);
    if (!graph) throw new Error("合并提交图已关闭或过期，请重新打开。");
    return graph;
  }

  private KtcClearSquashViewSession(repositoryId = this.KtcSquashViewBinding?.repositoryId): void {
    this.KtcAbortGraphRead();
    this.KtcGraphReadGeneration += 1;
    this.KtcSquashDraft = undefined;
    this.KtcDirtyWorktree = undefined;
    if (repositoryId) {
      this.KtcGraphSessions.delete(repositoryId);
      if (repositoryId !== this.KtcSelectedRepositoryId) this.KtcSessions.delete(repositoryId);
    }
    this.KtcSquashViewBinding = undefined;
  }

  /** 旧 cursor 或预检快照失效时保留 View，并要求用户明确关闭后重开。 */
  private KtcInvalidateSquashView(
    repositoryId: string,
    message: string,
  ): void {
    if (this.KtcSquashViewBinding?.repositoryId !== repositoryId) return;
    this.KtcSquashDraft = undefined;
    this.KtcDirtyWorktree = undefined;
    this.KtcShowSquashView(repositoryId, "error", message, undefined);
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
    const trusted = this.KtcSquashDraft;
    if (!trusted
      || trusted.repositoryId !== action.repositoryId
      || trusted.expectedHeadOid !== action.expectedHeadOid
      || !KtcSameGitOidSelection(trusted.selectedOids, action.selectedOids)) {
      throw new Error("合并预览已变化，请重新选择并预检。");
    }
    const current = await this.KtcAdapter.readRepository(canonicalRoot, 1);
    if (current.headOid !== action.expectedHeadOid) {
      throw new Error("HEAD 已变化，不能执行合并；请重新预检。");
    }
    // 轻量摘要与完整安全预检可能分别给出 develop / refs/heads/develop。
    // 两者是同一 Git 分支，不能因此阻止已经验证过的合并。
    if (KtcGitRefKey(current.currentRef) !== KtcGitRefKey(trusted.currentRef)) {
      throw new Error("当前分支已变化，不能执行合并；请重新预检。");
    }
    if (!current.clean || current.operationState !== "idle") {
      throw new Error("工作区状态或 Git 操作已变化，不能执行合并；请处理后重新预检。");
    }
    if (this.KtcRunningRepositories.has(action.repositoryId)) throw new Error("这个仓库已有 Git 操作正在执行。");
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
    if (answer !== confirmLabel) {
      ctx.log(`[Git][合并执行][INFO] 已取消：仓库 ${session.snapshot.name}；分支 ${current.branch ?? current.currentRef ?? "detached"}；区间 ${trusted.selectedOids.length} 个 commit。`);
      this.KtcShowSquashView(action.repositoryId, "ready", "已取消合并；安全预检结果与编辑内容已保留。", trusted);
      return;
    }
    ctx.log(`[Git][合并执行][INFO] 开始：仓库 ${session.snapshot.name}；分支 ${current.branch ?? current.currentRef ?? "detached"}；区间 ${trusted.selectedOids.length} 个 commit；不会 push。`);
    this.KtcRunningRepositories.add(action.repositoryId);
    ctx.postState({ status: "running", message: "正在隔离 worktree 中合并并重放 commit…" });
    try {
      const result = await this.KtcAdapter.executeSquash({
        repositoryRoot: session.snapshot.root,
        // The graph is newest-first, while Wing's validated plan is historical
        // order. Execute only with the trusted preflight order.
        selectedOids: trusted.selectedOids,
        expectedHeadOid: action.expectedHeadOid,
        draft,
        acknowledgedWarnings: [...new Set(trusted.warnings.map((warning) => warning.code))]
          .filter((code): code is "remote-history" | "occupied-ref" => code === "remote-history" || code === "occupied-ref"),
      });
      const temporaryStash = this.KtcPendingStash?.repositoryId === action.repositoryId
        ? this.KtcPendingStash
        : undefined;
      this.KtcPendingStash = undefined;
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
      this.KtcDirtyWorktree = undefined;
      const previousGraph = this.KtcGraphSessions.get(action.repositoryId);
      if (previousGraph) {
        this.KtcGraphSessions.set(action.repositoryId, {
          ...previousGraph,
          selectedOids: [],
          selectableOids: previousGraph.commits.map((commit) => commit.oid),
          selectionAnchorOid: undefined,
          selectionEndpointOid: undefined,
        });
      }
      const successMessage = `合并完成：${result.oldHeadOid.slice(0, 7)} → ${result.newHeadOid.slice(0, 7)}；已刷新并清空选择。`;
      if (this.KtcSquashView?.isOpen && this.KtcSquashViewBinding?.repositoryId === action.repositoryId) {
        try {
          await this.KtcOpenSquashView(
            action.repositoryId,
            ctx,
            "local-branches",
            [],
            refreshedSnapshot.headOid,
            successMessage,
            true,
          );
        } catch (refreshError) {
          // 历史改写已经成功，刷新失败不能再被报告为“合并失败”。保留
          // 单例 View 和清空后的选择，明确提示用户可重新打开/刷新。
          ctx.log(`[Git][合并执行][ERROR] 合并已成功，但提交图刷新失败：${KtcErrorMessage(refreshError)}`);
          this.KtcShowSquashView(
            action.repositoryId,
            "error",
            `合并已成功，但提交图刷新失败：${KtcErrorMessage(refreshError)}`,
            undefined,
          );
        }
      }
      ctx.log(`[Git][合并执行][OK] 成功：${result.oldHeadOid.slice(0, 12)} → ${result.newHeadOid.slice(0, 12)}；合并 ${trusted.selectedOids.length} 个 commit；备份 ${result.backupRef}；未 push。`);
      void this.KtcOfferRestoreStash(temporaryStash);
    } catch (error) {
      this.KtcPostState(ctx, "error", `合并失败：${KtcErrorMessage(error)}`);
      throw error;
    } finally {
      this.KtcRunningRepositories.delete(action.repositoryId);
    }
  }

  private async KtcOfferRestoreStash(stash: KtcGitPendingStash | undefined): Promise<void> {
    if (!stash) return;
    const answer = await vscode.window.showInformationMessage(
      "本地 commit 合并完成；未执行 push。合并前的工作区改动仍保存在 Git 暂存中。",
      "恢复暂存内容",
    );
    if (answer !== "恢复暂存内容") return;
    try {
      await KtcRestoreGitStash(stash.repositoryRoot, stash.stashOid);
      void vscode.window.showInformationMessage("已恢复合并前暂存的工作区改动；对应 stash 条目仍保留，可自行确认后删除。");
    } catch (error) {
      void vscode.window.showErrorMessage("恢复暂存失败，原 stash 仍保留：" + KtcErrorMessage(error));
    }
  }

  private async KtcUndoSquash(repositoryId: string, ctx: ToolRunContext): Promise<void> {
    const undo = this.KtcUndoState;
    if (!undo || undo.repositoryId !== repositoryId) throw new Error("没有可撤销的 Git 合并记录。");
    const session = this.KtcRequireSession(repositoryId);
    const latest = await this.KtcAdapter.readRepository(session.snapshot.root, 200);
    if (!latest.clean || latest.operationState !== "idle" || KtcGitRefKey(latest.currentRef) !== KtcGitRefKey(undo.currentRef)
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
      squashDraft: this.KtcSquashDraft?.repositoryId === this.KtcSelectedRepositoryId
        ? this.KtcSquashDraft
        : undefined,
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

/** Host never trusts selection order from the Webview: keep only loaded graph OIDs in topo order. */
function KtcGraphSelectedOids(
  graph: KtcGitGraphSession,
  requestedOids: readonly string[],
): readonly string[] {
  if (requestedOids.length > 100) throw new Error("一次最多选择 100 个 commit。 ");
  const requested = new Set(requestedOids);
  if (requested.size !== requestedOids.length) throw new Error("合并选择包含重复 commit。 ");
  const known = new Set(graph.commits.map((commit) => commit.oid));
  if ([...requested].some((oid) => !known.has(oid))) {
    throw new Error("合并选择包含未加载的 commit，请先在提交图中加载并选择。 ");
  }
  return graph.commits.filter((commit) => requested.has(commit.oid)).map((commit) => commit.oid);
}

/** Primary 的勾选只能来自当前已读取的轻量摘要；Wing 预检仍会重新验证真实历史。 */
function KtcPrimarySelectedOids(
  session: KtcGitSession,
  requestedOids: readonly string[],
): readonly string[] {
  if (requestedOids.length === 0) return [];
  if (requestedOids.length > 100) throw new Error("一次最多选择 100 个 commit。");
  const requested = new Set(requestedOids);
  if (requested.size !== requestedOids.length) throw new Error("合并选择包含重复 commit。");
  const known = new Set(session.snapshot.history.map((commit) => commit.oid));
  if ([...requested].some((oid) => !known.has(oid))) {
    throw new Error("勾选的 commit 已不在当前已读取历史中；请刷新后再试。");
  }
  return session.snapshot.history.filter((commit) => requested.has(commit.oid)).map((commit) => commit.oid);
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
    "selection-not-found": "所选 commit 不在当前分支的可改写连续区间中；如属于其他本地分支，请按提示切换后重新预检",
    "selection-not-contiguous": "所选 commit 必须是相邻的连续节点；不能跳过中间 commit",
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

/** Compares a short local branch name with its fully qualified Git ref. */
export function KtcGitRefKey(value: string | undefined): string | undefined {
  return value?.replace(/^refs\/heads\//u, "");
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
