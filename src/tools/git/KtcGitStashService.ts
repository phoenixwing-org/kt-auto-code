import { execFile } from "node:child_process";
import { promisify } from "node:util";

const KtcExecFile = promisify(execFile);

export interface KtcGitWorktreeChanges {
  readonly staged: number;
  readonly modified: number;
  readonly untracked: number;
  readonly total: number;
}

export interface KtcGitStashReceipt {
  readonly changes: KtcGitWorktreeChanges;
  readonly stashOid: string;
  readonly message: string;
}

export type KtcGitCommandRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<{ readonly stdout: string; readonly stderr?: string }>;

const KtcEmptyChanges: KtcGitWorktreeChanges = {
  staged: 0,
  modified: 0,
  untracked: 0,
  total: 0,
};

async function KtcRunGit(args: readonly string[], cwd: string): Promise<{ readonly stdout: string; readonly stderr?: string }> {
  try {
    const result = await KtcExecFile("git", [...args], { cwd, windowsHide: true, encoding: "utf8" });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const detail = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    throw new Error(detail.stderr?.trim() || detail.stdout?.trim() || detail.message);
  }
}

/** Parses Git porcelain v1 zero-delimited status without relying on localized text. */
export function KtcParseGitWorktreeChanges(output: string): KtcGitWorktreeChanges {
  let staged = 0;
  let modified = 0;
  let untracked = 0;
  for (const record of output.split("\0")) {
    if (record.length < 3 || record[2] !== " ") continue;
    const index = record[0]!;
    const worktree = record[1]!;
    if (index === "?" && worktree === "?") {
      untracked += 1;
      continue;
    }
    if (index !== " ") staged += 1;
    if (worktree !== " ") modified += 1;
  }
  return { staged, modified, untracked, total: staged + modified + untracked };
}

export async function KtcReadGitWorktreeChanges(
  repositoryRoot: string,
  run: KtcGitCommandRunner = KtcRunGit,
): Promise<KtcGitWorktreeChanges> {
  const result = await run(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], repositoryRoot);
  return result.stdout ? KtcParseGitWorktreeChanges(result.stdout) : KtcEmptyChanges;
}

/**
 * Creates one explicitly user-approved stash. Ignored files remain untouched;
 * the original stash entry is intentionally retained after a later restore.
 */
export async function KtcStashGitWorktree(
  repositoryRoot: string,
  message: string,
  run: KtcGitCommandRunner = KtcRunGit,
): Promise<KtcGitStashReceipt | undefined> {
  const changes = await KtcReadGitWorktreeChanges(repositoryRoot, run);
  if (changes.total === 0) return undefined;
  await run(["stash", "push", "--include-untracked", "--message", message], repositoryRoot);
  const remaining = await KtcReadGitWorktreeChanges(repositoryRoot, run);
  if (remaining.total !== 0) throw new Error("暂存后工作区仍有未归档改动；请在源代码管理中处理后重新预检。");
  const stash = await run(["rev-parse", "--verify", "refs/stash"], repositoryRoot);
  const stashOid = stash.stdout.trim();
  if (!/^[0-9a-f]{40,64}$/iu.test(stashOid)) throw new Error("Git 未返回新暂存的标识，已停止继续合并。");
  return { changes, stashOid, message };
}

/** Applies exactly the stash created by this flow, and deliberately does not drop it. */
export async function KtcRestoreGitStash(
  repositoryRoot: string,
  stashOid: string,
  run: KtcGitCommandRunner = KtcRunGit,
): Promise<void> {
  await run(["stash", "apply", "--index", stashOid], repositoryRoot);
}
