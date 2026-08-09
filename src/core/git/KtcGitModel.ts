export type KtcGitActionId = "squashLocalCommits";

export interface KtcGitIdentity {
  readonly name: string;
  readonly email: string;
  readonly date: string;
  readonly dateLabel: string;
}

export interface KtcGitCommitInput {
  readonly oid: string;
  /** Present on full safety snapshots; lightweight history intentionally omits it. */
  readonly parentOids?: readonly string[];
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
  readonly hasMoreCommits?: boolean;
  readonly loaded?: boolean;
  readonly sourceGroup?: "workspace" | "external";
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
  readonly loaded: boolean;
  readonly external: boolean;
  readonly groupLabel: "当前工作区" | "我的仓库";
  readonly headOid?: string;
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
  readonly workspaceFolderCount: number;
  readonly workspaceRepositoryCount: number;
  readonly discovery: KtcGitDiscoveryState;
  readonly summaryDraft?: KtcGitSummaryDraft;
  readonly squashDraft?: KtcGitSquashDraft;
  readonly lastOperation?: KtcGitLastOperation;
}

export interface KtcGitDiscoveryState {
  readonly status: "idle" | "searching" | "complete" | "stopped";
  readonly scannedDirectories: number;
  readonly foundRepositories: number;
}

export function KtcCreateGitModel(input: {
  readonly repositories: readonly KtcGitRepositoryInput[];
  readonly selectedRepositoryId?: string;
  readonly recentCommitLimit?: number;
  readonly summaryDraft?: KtcGitSummaryDraft;
  readonly squashDraft?: KtcGitSquashDraft;
  readonly lastOperation?: KtcGitLastOperation;
  readonly workspaceFolderCount?: number;
  readonly discovery?: KtcGitDiscoveryState;
}): KtcGitViewModel {
  const recentCommitLimit = KtcNormalizeRecentCommitLimit(input.recentCommitLimit);
  const projects = input.repositories.map((repository) => KtcCreateGitProject(repository, recentCommitLimit));
  const loaded = projects.filter((project) => project.repository.loaded && !project.repository.error).length;
  const selectedRepositoryId = projects.some((project) => project.repository.id === input.selectedRepositoryId)
    ? input.selectedRepositoryId
    : projects[0]?.repository.id;
  const workspaceRepositoryCount = projects.filter((project) => !project.repository.external).length;
  const discovery = input.discovery ?? { status: "idle", scannedDirectories: 0, foundRepositories: 0 };
  return {
    projects,
    ...(selectedRepositoryId ? { selectedRepositoryId } : {}),
    recentCommitLimit,
    workspaceFolderCount: input.workspaceFolderCount ?? 0,
    workspaceRepositoryCount,
    discovery,
    statusText: discovery.status === "searching"
      ? `正在搜索 Git 仓库：已检查 ${discovery.scannedDirectories} 个目录，找到 ${discovery.foundRepositories} 个。`
      : projects.length === 0
      ? "当前工作区未发现 Git 仓库。"
      : loaded === projects.length
        ? `已读取 ${loaded} 个 Git 仓库。`
        : `已读取当前 ${loaded}/${projects.length} 个 Git 仓库；其余切换后按需读取。`,
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
  const loaded = source.loaded !== false;
  const operationIdle = !source.operationState || source.operationState === "idle";
  const visibleCommitLimit = KtcNormalizeRecentCommitLimit(source.recentCommitLimit ?? recentCommitLimit);
  const allCommits = [...(source.commits ?? [])];
  const visibleCommits = allCommits
    .reverse()
    .slice(0, visibleCommitLimit)
    .map((commit) => ({ ...commit, shortOid: KtcShortOid(commit.oid), isHead: commit.isHead === true }));
  const squashEnabled = readable && loaded && !detached;
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
        : !loaded
          ? "选择后读取"
        : source.clean === true
          ? operationIdle ? "工作区干净" : `正在 ${source.operationState}`
          : source.clean === false ? "存在本地变更" : "状态待读取",
      detached,
      clean: source.clean === true,
      loaded,
      external: source.sourceGroup === "external",
      groupLabel: source.sourceGroup === "external" ? "我的仓库" : "当前工作区",
      ...(source.head ? { headOid: source.head } : {}),
      ...(source.error ? { error: source.error } : {}),
    },
    actions: [
      {
        id: "squashLocalCommits",
        title: "合并本地未发布 commit",
        description: source.error
          ? "仓库读取成功后才可预检。"
          : !loaded
            ? "选择仓库后再准备合并。"
          : detached
            ? "detached HEAD 不能合并。"
            : "点击后读取完整状态并检查工作区、Git 操作和直线历史。",
        buttonLabel: "选择并预检",
        tone: "caution",
        badge: "不自动 push",
        enabled: squashEnabled,
      },
    ],
    commits: visibleCommits,
    visibleCommitLimit,
    totalCommitCount: allCommits.length,
    hasMoreCommits: source.hasMoreCommits === true || allCommits.length > visibleCommits.length,
  };
}

function KtcNormalizeRecentCommitLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 20;
  return Math.min(200, Math.max(1, Math.trunc(value ?? 20)));
}

function KtcShortOid(oid: string | undefined): string {
  return oid ? oid.slice(0, 7) : "-------";
}
