import * as vscode from "vscode";
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
  type KtcPnwGitIdentity,
  type KtcPnwGitRepositorySnapshot,
  type KtcPnwGitSquashBlocker,
  type KtcPnwGitSquashExecutionResult,
} from "./KtcGitWingAdapter.js";

export type KtcGitActionMessage =
  | { readonly action: "refresh" | "openScm" | "openOutput" }
  | { readonly action: "loadMore"; readonly repositoryId: string }
  | { readonly action: "openAction"; readonly actionId: string; readonly repositoryId: string }
  | {
      readonly action: "selectCommits";
      readonly selectedOids: readonly string[];
      readonly repositoryId: string;
      readonly copyAfterGenerate: boolean;
    }
  | { readonly action: "saveSummaryTextHeight"; readonly height: number }
  | { readonly action: "copySummary"; readonly repositoryId: string; readonly selectedOids: readonly string[]; readonly text: string }
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
  readonly snapshot: KtcPnwGitRepositorySnapshot;
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
  private readonly KtcRecentCommitLimits = new Map<string, number>();
  private KtcRepositoryInputs: KtcGitRepositoryInput[] = [];
  private KtcSummaryDraft: KtcGitSummaryDraft | undefined;
  private KtcSquashDraft: KtcGitSquashDraft | undefined;
  private KtcUndoState: KtcGitUndoState | undefined;
  private KtcLegacyReviewers: readonly string[] = [];
  private KtcReviewerMigration: Promise<void> = Promise.resolve();

  register(context: vscode.ExtensionContext): void {
    this.KtcLegacyReviewers = context.globalState.get<readonly string[]>(KtcGitReviewerStateKey) ?? [];
    this.KtcReviewerMigration = this.KtcMigrateReviewerSettings(context);
  }

  async refresh(ctx: ToolRunContext): Promise<void> {
    ctx.postState({ status: "running", message: "正在读取 Git 仓库…" });
    const folders = vscode.workspace.workspaceFolders ?? [];
    const results = await Promise.all(folders.map(async (folder): Promise<KtcGitRepositoryInput> => {
      try {
        const snapshot = await this.KtcAdapter.readRepository(folder.uri.fsPath, 200);
        this.KtcSessions.set(snapshot.root, { snapshot });
        return this.KtcRepositoryInput(snapshot, folder.name);
      } catch (error) {
        ctx.log(`[Git] ${folder.uri.fsPath}: ${KtcErrorMessage(error)}`);
        return {
          id: folder.uri.toString(),
          name: folder.name,
          error: "不是 Git 仓库或读取失败",
        };
      }
    }));
    const unique = new Map(results.map((item) => [item.id, item]));
    this.KtcRepositoryInputs = [...unique.values()];
    const validIds = new Set(this.KtcRepositoryInputs.map((item) => item.id));
    if (this.KtcSummaryDraft && !validIds.has(this.KtcSummaryDraft.repositoryId)) this.KtcSummaryDraft = undefined;
    if (this.KtcSquashDraft && !validIds.has(this.KtcSquashDraft.repositoryId)) this.KtcSquashDraft = undefined;
    if (this.KtcUndoState && !validIds.has(this.KtcUndoState.repositoryId)) this.KtcUndoState = undefined;
    this.KtcPostState(ctx);
    ctx.log(`[Git] repositories=${this.KtcSessions.size} workspaces=${folders.length}`);
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
    if (action.action === "loadMore") {
      const session = this.KtcRequireSession(action.repositoryId);
      const current = this.KtcRecentCommitLimits.get(action.repositoryId) ?? 20;
      this.KtcRecentCommitLimits.set(action.repositoryId, Math.min(200, current + 20));
      const existing = this.KtcRepositoryInputs.find((item) => item.id === action.repositoryId);
      this.KtcRepositoryInputs = this.KtcRepositoryInputs.map((item) => item.id === action.repositoryId
        ? this.KtcRepositoryInput(session.snapshot, existing?.name ?? session.snapshot.name)
        : item);
      this.KtcPostState(ctx);
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
      await this.KtcOpenSummary(action.repositoryId, action.selectedOids, action.copyAfterGenerate, ctx);
      return;
    }
    if (action.action === "copySummary") {
      await this.KtcCopySummary(action.repositoryId, action.selectedOids, action.text);
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

  private async KtcOpenSummary(
    repositoryId: string,
    selectedOids: readonly string[],
    copyAfterGenerate: boolean,
    ctx: ToolRunContext,
  ): Promise<void> {
    const snapshot = this.KtcRequireSession(repositoryId).snapshot;
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

  private async KtcCopySummary(repositoryId: string, selectedOids: readonly string[], text: string): Promise<void> {
    const snapshot = this.KtcRequireSession(repositoryId).snapshot;
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
    snapshot: KtcPnwGitRepositorySnapshot,
    selectedOids: readonly string[],
  ): KtcPnwGitRepositorySnapshot["history"] {
    const selected = new Set(selectedOids);
    if (selected.size === 0) throw new Error("请至少勾选 1 个 commit。");
    const commits = [...snapshot.history].reverse().filter((commit) => selected.has(commit.oid));
    if (commits.length !== selected.size) throw new Error("所选 commit 已变化，请刷新后重试。");
    return commits;
  }

  private KtcFormatSummaries(
    snapshot: KtcPnwGitRepositorySnapshot,
    commits: KtcPnwGitRepositorySnapshot["history"],
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
    const snapshot = session.snapshot;
    const picks = [...snapshot.history].reverse().map((commit) => ({
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
      title: `${snapshot.name}：合并本地未发布 commit`,
    });
    if (!selected) return;
    if (selected.length < 2) {
      void vscode.window.showWarningMessage("至少选择 2 个 commit。可选择直线历史中间的连续区间。");
      return;
    }
    const selectedOids = selected.map((item) => item.oid);
    ctx.postState({ status: "running", message: "正在执行 Git 安全预检…" });
    const analysis = await this.KtcAdapter.analyzeSquash(snapshot.root, selectedOids);
    this.KtcSessions.set(repositoryId, { snapshot: analysis.snapshot });
    this.KtcRepositoryInputs = this.KtcRepositoryInputs.map((item) => item.id === repositoryId
      ? this.KtcRepositoryInput(analysis.snapshot, item.name)
      : item);
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
    const warningDetail = hasWarnings
      ? [
          ...trusted.warnings.map((warning) => `• ${warning.label}`),
          "",
          "确认后仅更新当前本地分支；不会 push，不会删除或移动 remote、其他分支和标签。它们会继续指向旧历史。",
        ].join("\n")
      : `当前 HEAD ${action.expectedHeadOid.slice(0, 12)}；失败时原分支保持不变。`;
    const answer = await vscode.window.showWarningMessage(
      hasWarnings
        ? `受影响历史已被共享引用。仍要合并 ${action.selectedOids.length} 个 commit 吗？`
        : `将 ${action.selectedOids.length} 个 commit 合并，并逐个重放其后的提交。操作只更新本地分支，不会 push。`,
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
      const refreshed = await this.KtcAdapter.readRepository(session.snapshot.root, 200);
      this.KtcSessions.set(action.repositoryId, { snapshot: refreshed });
      this.KtcRepositoryInputs = this.KtcRepositoryInputs.map((item) => item.id === action.repositoryId
        ? this.KtcRepositoryInput(refreshed, item.name)
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

  private KtcRepositoryInput(snapshot: KtcPnwGitRepositorySnapshot, workspaceName: string): KtcGitRepositoryInput {
    return {
      id: snapshot.root,
      name: snapshot.name || workspaceName,
      relativePath: snapshot.root,
      branch: snapshot.branch,
      upstream: snapshot.upstream,
      remoteUrl: snapshot.remoteUrl,
      head: snapshot.headOid,
      clean: snapshot.clean,
      detached: snapshot.detached,
      operationState: snapshot.operationState,
      commits: snapshot.history.map((commit) => ({
        oid: commit.oid,
        parentOids: commit.parentOids,
        subject: commit.subject,
        body: commit.body,
        author: KtcIdentity(commit.author),
        committer: KtcIdentity(commit.committer),
        isHead: commit.oid === snapshot.headOid,
      })),
      recentCommitLimit: this.KtcRecentCommitLimits.get(snapshot.root) ?? 20,
    };
  }

  private KtcPostState(
    ctx: ToolRunContext,
    status: ToolUiState["status"] = "done",
    message?: string,
  ): void {
    const git: KtcGitViewModel = KtcCreateGitModel({
      repositories: this.KtcRepositoryInputs,
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
