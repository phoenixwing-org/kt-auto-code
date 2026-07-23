export type KtcGitActionId = "squashLocalCommits";

export interface KtcGitIdentity {
  readonly name: string;
  readonly email: string;
  readonly date: string;
  readonly dateLabel: string;
}

export interface KtcGitCommitInput {
  readonly oid: string;
  readonly parentOids: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly author: KtcGitIdentity;
  readonly committer: KtcGitIdentity;
  readonly isHead?: boolean;
}

export interface KtcGitRepositoryInput {
  readonly id: string;
  readonly name: string;
  readonly relativePath?: string;
  readonly branch?: string;
  readonly upstream?: string;
  readonly remoteUrl?: string;
  readonly head?: string;
  readonly clean?: boolean;
  readonly detached?: boolean;
  readonly operationState?: string;
  readonly commits?: readonly KtcGitCommitInput[];
  readonly recentCommitLimit?: number;
  readonly error?: string;
}

export interface KtcGitRepository {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly branchLabel: string;
  readonly upstreamLabel: string;
  readonly headLabel: string;
  readonly stateLabel: string;
  readonly detached: boolean;
  readonly clean: boolean;
  readonly error?: string;
}

export interface KtcGitCommit extends KtcGitCommitInput {
  readonly shortOid: string;
  readonly isHead: boolean;
}

export interface KtcGitAction {
  readonly id: KtcGitActionId;
  readonly title: string;
  readonly description: string;
  readonly buttonLabel: string;
  readonly tone: "normal" | "caution";
  readonly badge: string;
  readonly enabled: boolean;
}

export interface KtcGitProject {
  readonly repository: KtcGitRepository;
  readonly actions: readonly KtcGitAction[];
  readonly commits: readonly KtcGitCommit[];
  readonly visibleCommitLimit: number;
  readonly totalCommitCount: number;
  readonly hasMoreCommits: boolean;
}

export interface KtcGitSummaryDraft {
  readonly repositoryId: string;
  readonly selectedOids: readonly string[];
  readonly text: string;
  readonly textHeight?: number;
  readonly includeRemoteUrl: boolean;
  readonly remoteUrl?: string;
  readonly includeCommitTime: boolean;
  readonly mentionReviewer: boolean;
  readonly reviewer: string;
  readonly reviewerChoices: readonly string[];
}

export interface KtcGitSquashDraft {
  readonly repositoryId: string;
  readonly expectedHeadOid: string;
  readonly currentRef: string;
  readonly selectedOids: readonly string[];
  readonly selectedLabels: readonly string[];
  readonly baseParentOid: string;
  readonly selectedTipTreeOid: string;
  readonly finalTreeOid: string;
  readonly replayCount: number;
  readonly replayLabels: readonly string[];
  readonly warnings: readonly { readonly code: string; readonly label: string }[];
  readonly message: string;
  readonly author: KtcGitIdentity;
  readonly committer: KtcGitIdentity;
}

export interface KtcGitLastOperation {
  readonly repositoryId: string;
  readonly oldHeadLabel: string;
  readonly newHeadLabel: string;
  readonly rewrittenCount: number;
}

export interface KtcGitViewModel {
  readonly projects: readonly KtcGitProject[];
  readonly selectedRepositoryId?: string;
  readonly statusText: string;
  readonly recentCommitLimit: number;
  readonly summaryDraft?: KtcGitSummaryDraft;
  readonly squashDraft?: KtcGitSquashDraft;
  readonly lastOperation?: KtcGitLastOperation;
}

export function KtcCreateGitModel(input: {
  readonly repositories: readonly KtcGitRepositoryInput[];
  readonly selectedRepositoryId?: string;
  readonly recentCommitLimit?: number;
  readonly summaryDraft?: KtcGitSummaryDraft;
  readonly squashDraft?: KtcGitSquashDraft;
  readonly lastOperation?: KtcGitLastOperation;
}): KtcGitViewModel {
  const recentCommitLimit = KtcNormalizeRecentCommitLimit(input.recentCommitLimit);
  const projects = input.repositories.map((repository) => KtcCreateGitProject(repository, recentCommitLimit));
  const loaded = projects.filter((project) => !project.repository.error).length;
  const selectedRepositoryId = projects.some((project) => project.repository.id === input.selectedRepositoryId)
    ? input.selectedRepositoryId
    : projects[0]?.repository.id;
  return {
    projects,
    ...(selectedRepositoryId ? { selectedRepositoryId } : {}),
    recentCommitLimit,
    statusText: projects.length === 0
      ? "当前工作区未发现 Git 仓库。"
      : loaded === projects.length
        ? `已读取 ${loaded} 个 Git 仓库。`
        : `已读取 ${loaded}/${projects.length} 个 Git 仓库；其余工作区不是仓库或读取失败。`,
    ...(input.summaryDraft ? { summaryDraft: input.summaryDraft } : {}),
    ...(input.squashDraft ? { squashDraft: input.squashDraft } : {}),
    ...(input.lastOperation ? { lastOperation: input.lastOperation } : {}),
  };
}

function KtcCreateGitProject(
  source: KtcGitRepositoryInput,
  recentCommitLimit: number,
): KtcGitProject {
  const detached = source.detached === true;
  const branchLabel = detached
    ? `detached/${KtcShortOid(source.head)}`
    : source.branch || "无本地分支";
  const upstreamLabel = source.upstream
    || (source.branch ? `local/${source.branch}` : "无 upstream");
  const readable = !source.error;
  const operationIdle = !source.operationState || source.operationState === "idle";
  const visibleCommitLimit = KtcNormalizeRecentCommitLimit(source.recentCommitLimit ?? recentCommitLimit);
  const allCommits = [...(source.commits ?? [])];
  const visibleCommits = allCommits
    .reverse()
    .slice(0, visibleCommitLimit)
    .map((commit) => ({ ...commit, shortOid: KtcShortOid(commit.oid), isHead: commit.isHead === true }));
  const squashEnabled = readable && !detached && source.clean === true && operationIdle && visibleCommits.length >= 2;
  return {
    repository: {
      id: source.id,
      name: source.name,
      relativePath: source.relativePath || ".",
      branchLabel,
      upstreamLabel,
      headLabel: KtcShortOid(source.head),
      stateLabel: source.error
        ? source.error
        : source.clean === true
          ? operationIdle ? "工作区干净" : `正在 ${source.operationState}`
          : source.clean === false ? "存在本地变更" : "状态待读取",
      detached,
      clean: source.clean === true,
      ...(source.error ? { error: source.error } : {}),
    },
    actions: [
      {
        id: "squashLocalCommits",
        title: "合并本地未发布 commit",
        description: source.error
          ? "仓库读取成功后才可预检。"
          : detached
            ? "detached HEAD 不能合并。"
            : source.clean !== true
              ? "请先处理工作区变更。"
              : !operationIdle
                ? `Git 正在 ${source.operationState}，不能改写。`
                : "选择直线历史中的连续区间；允许区间后面仍有提交。",
        buttonLabel: "选择并预检",
        tone: "caution",
        badge: "不自动 push",
        enabled: squashEnabled,
      },
    ],
    commits: visibleCommits,
    visibleCommitLimit,
    totalCommitCount: allCommits.length,
    hasMoreCommits: allCommits.length > visibleCommits.length,
  };
}

function KtcNormalizeRecentCommitLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(200, Math.max(1, Math.trunc(value ?? 20)));
}

function KtcShortOid(oid: string | undefined): string {
  return oid ? oid.slice(0, 7) : "-------";
}
