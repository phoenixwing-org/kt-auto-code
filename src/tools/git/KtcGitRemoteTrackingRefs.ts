import { pnwRunGitCommand } from "@phoenix-wing/git-node";

export interface KtcGitRemoteTrackingRef {
  /** Exact local ref identity, never a remote-server query. */
  readonly name: string;
  readonly displayName: string;
  readonly oid: string;
  readonly symbolicTarget?: string;
}

/** Reads only locally stored remote-tracking tips; no fetch or remote contact. */
export async function KtcReadGitRemoteTrackingRefs(root: string, signal?: AbortSignal): Promise<readonly KtcGitRemoteTrackingRef[]> {
  const result = await pnwRunGitCommand([
    "for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(symref)", "refs/remotes",
  ], { cwd: root, env: { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" }, ...(signal ? { signal } : {}) });
  return KtcParseGitRemoteTrackingRefs(result.stdout);
}

export function KtcParseGitRemoteTrackingRefs(stdout: string): readonly KtcGitRemoteTrackingRef[] {
  const refs: KtcGitRemoteTrackingRef[] = [];
  const names = new Set<string>();
  for (const record of stdout.split(/\r?\n/u)) {
    if (!record) continue;
    const fields = record.split("\0");
    const [name, oid, objectType, symbolicTarget] = fields;
    if (fields.length !== 4 || !name?.startsWith("refs/remotes/") || name === "refs/remotes/"
      || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(oid ?? "") || names.has(name)
      || (symbolicTarget && !symbolicTarget.startsWith("refs/remotes/"))) {
      throw new Error("本地远端跟踪引用格式异常，请刷新提交图；未连接远端。");
    }
    names.add(name);
    if (objectType !== "commit") continue;
    refs.push({ name, oid: oid!, displayName: name.slice("refs/remotes/".length), ...(symbolicTarget ? { symbolicTarget } : {}) });
  }
  return refs;
}

/** Decoration is orthogonal to revision scope, commit order and lane calculation. */
export function KtcAttachGitRemoteTrackingRefs<T extends { readonly oid: string }>(
  commits: readonly T[], refs: readonly KtcGitRemoteTrackingRef[],
): readonly (T & { readonly remoteTrackingRefs?: readonly KtcGitRemoteTrackingRef[] })[] {
  const byOid = new Map<string, KtcGitRemoteTrackingRef[]>();
  for (const ref of refs) {
    const matches = byOid.get(ref.oid) ?? [];
    matches.push(ref); byOid.set(ref.oid, matches);
  }
  return commits.map(commit => {
    const matches = byOid.get(commit.oid);
    return matches?.length ? { ...commit, remoteTrackingRefs: matches } : commit;
  });
}
