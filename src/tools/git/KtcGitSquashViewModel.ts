import type { KtcGitIdentity, KtcGitSquashDraft } from "../../core/git/KtcGitModel.js";
import type { KtcPnwGitCommitGraphCommit, KtcPnwGitCommitGraphRefsScope, KtcPnwGitCommitGraphRow } from "./KtcGitWingAdapter.js";
import type { KtcGitWorktreeChanges } from "./KtcGitStashService.js";

/** Serializable presentation/intent contract; no Host or Git runtime is imported. */
export interface KtcGitSquashGraphState {
  readonly repositoryId: string;
  readonly repositoryName: string;
  readonly branchLabel: string;
  readonly expectedHeadOid: string;
  readonly refsScope: KtcPnwGitCommitGraphRefsScope;
  readonly commits: readonly KtcPnwGitCommitGraphCommit[];
  readonly graphRows: readonly KtcPnwGitCommitGraphRow[];
  readonly selectedOids: readonly string[];
  readonly selectableOids: readonly string[];
  readonly selectionDisabledReason?: string;
  readonly selectionAnchorOid?: string;
  readonly selectionEndpointOid?: string;
  readonly hasMore: boolean;
  readonly status: "idle" | "loading" | "ready" | "preflight" | "error";
  readonly message: string;
  readonly branchOptions?: readonly {
    readonly name: string;
    readonly current: boolean;
    readonly enabled: boolean;
    readonly disabledReason?: string;
  }[];
  readonly branchSwitch?: {
    readonly currentBranchName: string;
    readonly targetBranchName: string;
  };
  readonly draft?: KtcGitSquashDraft;
  readonly dirtyWorktree?: KtcGitWorktreeChanges;
}

export type KtcGitSquashViewMessage =
  | { readonly type: "ready" }
  | { readonly type: "copySummary"; readonly oid: string }
  | { readonly type: "resetCommitTime"; readonly oid: string }
  | { readonly type: "select"; readonly oid: string; readonly checked: boolean; readonly anchorOid?: string }
  | { readonly type: "load"; readonly count: 1 | 5 }
  | { readonly type: "preflight"; readonly selectedOids: readonly string[] }
  | { readonly type: "openScm" }
  | { readonly type: "stashAndPreflight"; readonly selectedOids: readonly string[] }
  | { readonly type: "switchBranch" }
  | { readonly type: "selectBranch"; readonly branchName: string }
  | {
      readonly type: "execute";
      readonly selectedOids: readonly string[];
      readonly message: string;
      readonly author: KtcGitIdentity;
      readonly committer: KtcGitIdentity;
    };

export function KtcParseGitSquashViewMessage(value: unknown): KtcGitSquashViewMessage | undefined {
  if (!KtcIsRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "ready") return { type: "ready" };
  if (value.type === "copySummary" && KtcIsOid(value.oid)) return { type: "copySummary", oid: value.oid };
  if (value.type === "resetCommitTime" && KtcIsOid(value.oid)) return { type: "resetCommitTime", oid: value.oid };
  if (value.type === "select" && KtcIsOid(value.oid) && typeof value.checked === "boolean"
    && (value.anchorOid === undefined || KtcIsOid(value.anchorOid))) {
    return { type: "select", oid: value.oid, checked: value.checked, ...(value.anchorOid ? { anchorOid: value.anchorOid } : {}) };
  }
  if (value.type === "load" && (value.count === 1 || value.count === 5)) return { type: "load", count: value.count };
  if (value.type === "preflight" && KtcOidArray(value.selectedOids)) return { type: "preflight", selectedOids: value.selectedOids };
  if (value.type === "openScm") return { type: "openScm" };
  if (value.type === "stashAndPreflight" && KtcOidArray(value.selectedOids)) return { type: "stashAndPreflight", selectedOids: value.selectedOids };
  if (value.type === "switchBranch") return { type: "switchBranch" };
  if (value.type === "selectBranch" && typeof value.branchName === "string"
    && value.branchName.length > 0 && value.branchName.length <= 512 && !/[\u0000\r\n]/u.test(value.branchName)) {
    return { type: "selectBranch", branchName: value.branchName };
  }
  if (value.type === "execute"
    && KtcOidArray(value.selectedOids)
    && typeof value.message === "string"
    && KtcIsIdentity(value.author)
    && KtcIsIdentity(value.committer)) {
    return { type: "execute", selectedOids: value.selectedOids, message: value.message, author: value.author, committer: value.committer };
  }
  return undefined;
}

function KtcIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function KtcOidArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= 100
    && value.every((oid) => typeof oid === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid));
}

function KtcIsOid(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

function KtcIsIdentity(value: unknown): value is KtcGitIdentity {
  return KtcIsRecord(value)
    && typeof value.name === "string"
    && typeof value.email === "string"
    && typeof value.date === "string"
    && typeof value.dateLabel === "string";
}
