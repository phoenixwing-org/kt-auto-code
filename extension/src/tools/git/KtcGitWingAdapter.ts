export interface KtcPnwGitIdentity {
  readonly name: string;
  readonly email: string;
  readonly date: string;
}

export interface KtcPnwGitCommitRecord {
  readonly oid: string;
  readonly parentOids: readonly string[];
  readonly treeOid: string;
  readonly author: KtcPnwGitIdentity;
  readonly committer: KtcPnwGitIdentity;
  readonly subject: string;
  readonly body: string;
  readonly hasSignature: boolean;
  readonly extraHeaders: readonly string[];
}

export interface KtcPnwGitCommitSummary {
  readonly oid: string;
  readonly author: KtcPnwGitIdentity;
  readonly committer: KtcPnwGitIdentity;
  readonly subject: string;
  readonly body: string;
}

export interface KtcPnwGitRepositorySummary {
  readonly root: string;
  readonly headOid: string;
  readonly currentRef?: string;
  readonly branch?: string;
  readonly upstream?: string;
  readonly remoteUrl?: string;
  readonly commits: readonly KtcPnwGitCommitSummary[];
}

export interface KtcPnwGitCommitPage {
  readonly headOid: string;
  readonly commits: readonly KtcPnwGitCommitSummary[];
  readonly nextBeforeOid?: string;
  readonly hasMore: boolean;
}

export interface KtcPnwGitRepositorySnapshot {
  readonly root: string;
  readonly name: string;
  readonly currentRef?: string;
  readonly branch?: string;
  readonly upstream?: string;
  readonly remoteUrl?: string;
  readonly headOid: string;
  readonly detached: boolean;
  readonly clean: boolean;
  readonly operationState: string;
  readonly history: readonly KtcPnwGitCommitRecord[];
  readonly remoteReachableOids: readonly string[];
  readonly refTargets: readonly { readonly name: string; readonly oid: string }[];
}

export interface KtcPnwGitSquashBlocker {
  readonly code: string;
  readonly oid?: string;
  readonly refName?: string;
  readonly operationState?: string;
}

export interface KtcPnwGitSquashWarning {
  readonly code: string;
  readonly oid?: string;
  readonly refName?: string;
}

export interface KtcPnwGitSquashPlan {
  readonly valid: boolean;
  readonly blockers: readonly KtcPnwGitSquashBlocker[];
  readonly warnings: readonly KtcPnwGitSquashWarning[];
  readonly currentRef?: string;
  readonly oldHeadOid?: string;
  readonly baseParentOid?: string;
  readonly selectedOids: readonly string[];
  readonly replayOids: readonly string[];
  readonly affectedOids: readonly string[];
  readonly selectedTipTreeOid?: string;
  readonly finalTreeOid?: string;
}

export interface KtcPnwGitSquashDraft {
  readonly message: string;
  readonly author: KtcPnwGitIdentity;
  readonly committer: KtcPnwGitIdentity;
}

export interface KtcPnwGitSquashAnalysis {
  readonly snapshot: KtcPnwGitRepositorySnapshot;
  readonly plan: KtcPnwGitSquashPlan;
  readonly draft?: KtcPnwGitSquashDraft;
}

export interface KtcPnwGitSquashExecutionResult {
  readonly oldHeadOid: string;
  readonly newHeadOid: string;
  readonly combinedOid: string;
  readonly backupRef: string;
  readonly rewritten: readonly { readonly oldOid: string; readonly newOid: string }[];
}

interface KtcPnwGitCoreModule {
  pnwFormatGitGroupSummary(input: {
    readonly repositoryName: string;
    readonly branch?: string;
    readonly upstream?: string;
    readonly commit: KtcPnwGitCommitSummary;
    readonly visibleOids?: readonly string[];
    readonly includeRepositoryContext?: boolean;
    readonly includeCommitTime?: boolean;
    readonly mentionReviewer?: boolean;
    readonly fallbackReviewer?: string;
  }): { readonly text: string; readonly reviewer?: string };
  pnwFormatGitGroupSummaries(input: {
    readonly repositoryName: string;
    readonly branch?: string;
    readonly upstream?: string;
    readonly commits: readonly KtcPnwGitCommitSummary[];
    readonly visibleOids?: readonly string[];
    readonly remoteUrl?: string;
    readonly includeRemoteUrl?: boolean;
    readonly includeCommitTime?: boolean;
    readonly mentionReviewer?: boolean;
    readonly fallbackReviewer?: string;
  }): {
    readonly text: string;
    readonly summaries: readonly {
      readonly text: string;
      readonly shortOid: string;
      readonly referenceLabel: string;
      readonly reviewer?: string;
    }[];
  };
}

interface KtcPnwGitNodeModule {
  pnwFindGitRepositoryRoot(startPath: string, gitExecutable?: string, signal?: AbortSignal): Promise<string>;
  pnwReadGitRepositorySummary(
    startPath: string,
    options?: {
      readonly maxCommits?: number;
      readonly includeRemoteUrl?: boolean;
      readonly gitExecutable?: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<KtcPnwGitRepositorySummary>;
  pnwReadGitCommitPage(
    startPath: string,
    options: {
      readonly expectedHeadOid: string;
      readonly beforeOid?: string;
      readonly limit?: number;
      readonly gitExecutable?: string;
      readonly signal?: AbortSignal;
    },
  ): Promise<KtcPnwGitCommitPage>;
  pnwReadGitRepository(
    startPath: string,
    options?: { readonly maxCommits?: number; readonly gitExecutable?: string; readonly signal?: AbortSignal },
  ): Promise<KtcPnwGitRepositorySnapshot>;
  pnwAnalyzeGitSquash(
    startPath: string,
    selectedOids: readonly string[],
    options?: { readonly maxCommits?: number; readonly gitExecutable?: string },
  ): Promise<KtcPnwGitSquashAnalysis>;
  pnwExecuteGitSquash(input: {
    readonly repositoryRoot: string;
    readonly selectedOids: readonly string[];
    readonly expectedHeadOid: string;
    readonly draft: KtcPnwGitSquashDraft;
    readonly acknowledgedWarnings?: readonly ("remote-history" | "occupied-ref")[];
    readonly gitExecutable?: string;
  }): Promise<KtcPnwGitSquashExecutionResult>;
  pnwUndoGitSquash(
    repositoryRoot: string,
    currentRef: string,
    expectedNewHeadOid: string,
    backupRef: string,
    gitExecutable?: string,
  ): Promise<string>;
}

// 静态 import 同时支持 Registry 包的 ESM exports 与受控本地 Wing resolver；
// esbuild 会把实现收进单文件 CommonJS 扩展 bundle，不在运行时保留外部依赖。
const KtcGitCore = KtcGitCoreImport as KtcPnwGitCoreModule;
const KtcGitNode = KtcGitNodeImport as KtcPnwGitNodeModule;

export class KtcGitWingAdapter {
  findRepositoryRoot(startPath: string, signal?: AbortSignal): Promise<string> {
    return KtcGitNode.pnwFindGitRepositoryRoot(startPath, undefined, signal);
  }

  readRepositorySummary(
    startPath: string,
    maxCommits = 1,
    includeRemoteUrl = true,
    signal?: AbortSignal,
  ): Promise<KtcPnwGitRepositorySummary> {
    return KtcGitNode.pnwReadGitRepositorySummary(startPath, {
      maxCommits,
      includeRemoteUrl,
      ...(signal ? { signal } : {}),
    });
  }

  readCommitPage(
    startPath: string,
    expectedHeadOid: string,
    beforeOid: string | undefined,
    limit: number,
    signal?: AbortSignal,
  ): Promise<KtcPnwGitCommitPage> {
    return KtcGitNode.pnwReadGitCommitPage(startPath, {
      expectedHeadOid,
      ...(beforeOid ? { beforeOid } : {}),
      limit,
      ...(signal ? { signal } : {}),
    });
  }

  readRepository(startPath: string, maxCommits = 200): Promise<KtcPnwGitRepositorySnapshot> {
    return KtcGitNode.pnwReadGitRepository(startPath, { maxCommits });
  }

  formatGroupSummary(input: Parameters<KtcPnwGitCoreModule["pnwFormatGitGroupSummary"]>[0]): ReturnType<KtcPnwGitCoreModule["pnwFormatGitGroupSummary"]> {
    return KtcIncludeCommitBody(KtcGitCore.pnwFormatGitGroupSummary(input), input.commit.body);
  }

  formatGroupSummaries(input: Parameters<KtcPnwGitCoreModule["pnwFormatGitGroupSummaries"]>[0]): ReturnType<KtcPnwGitCoreModule["pnwFormatGitGroupSummaries"]> {
    const result = KtcGitCore.pnwFormatGitGroupSummaries(input);
    const summaries = result.summaries.map((summary, index) => (
      KtcIncludeCommitBody(summary, input.commits[index]?.body ?? "")
    ));
    if (summaries.every((summary, index) => summary === result.summaries[index])) return result;
    const originalSummaryText = result.summaries.map((summary) => summary.text).join("\n");
    const prefix = result.text.endsWith(originalSummaryText)
      ? result.text.slice(0, -originalSummaryText.length)
      : "";
    return {
      ...result,
      text: `${prefix}${summaries.map((summary) => summary.text).join("\n")}`,
      summaries,
    };
  }

  analyzeSquash(startPath: string, selectedOids: readonly string[]): Promise<KtcPnwGitSquashAnalysis> {
    return KtcGitNode.pnwAnalyzeGitSquash(startPath, selectedOids, { maxCommits: 10_000 });
  }

  executeSquash(input: Parameters<KtcPnwGitNodeModule["pnwExecuteGitSquash"]>[0]): Promise<KtcPnwGitSquashExecutionResult> {
    return KtcGitNode.pnwExecuteGitSquash(input);
  }

  undoSquash(
    repositoryRoot: string,
    currentRef: string,
    expectedNewHeadOid: string,
    backupRef: string,
  ): Promise<string> {
    return KtcGitNode.pnwUndoGitSquash(repositoryRoot, currentRef, expectedNewHeadOid, backupRef);
  }
}

// TODO: Wing 0.6.3 发布并完成 Registry 消费验证后删除；见 doc/git/README.md。
function KtcIncludeCommitBody<T extends { readonly text: string }>(summary: T, rawBody: string): T {
  const body = rawBody.replace(/\r\n?/gu, "\n").trim();
  if (!body || summary.text.endsWith(`\n\n${body}`)) return summary;
  return { ...summary, text: `${summary.text}\n\n${body}` };
}
import * as KtcGitCoreImport from "@phoenix-wing/git-core";
import * as KtcGitNodeImport from "@phoenix-wing/git-node";
