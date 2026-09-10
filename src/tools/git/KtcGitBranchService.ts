import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { KtcGitBranchLine } from "./KtcGitSelection.js";
import type { KtcGitCommandRunner } from "./KtcGitStashService.js";

const KtcExecFile = promisify(execFile);
const KtcMaximumBranchHistory = 10_000;
const KtcFullOidPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export interface KtcLocalGitBranchOption {
  readonly name: string;
  readonly ref: string;
  readonly oid: string;
  readonly current: boolean;
  /** Only another worktree's occupancy disables an option; the current branch stays selectable. */
  readonly disabled: boolean;
  readonly reason?: string;
  readonly worktreePath?: string;
}

export interface KtcLocalGitBranchOptions {
  readonly root: string;
  readonly currentBranchName?: string;
  readonly headOid: string;
  readonly options: readonly KtcLocalGitBranchOption[];
}

/** The source worktree identity that the owning UI actually confirmed. */
export interface KtcGitBranchSwitchIdentity {
  readonly root: string;
  readonly headOid: string;
  readonly currentRef: string;
}

interface KtcGitWorktreeRecord {
  readonly directory: string;
  readonly ref?: string;
}

async function KtcRunGit(args: readonly string[], cwd: string): Promise<{ readonly stdout: string; readonly stderr?: string }> {
  try {
    const result = await KtcExecFile("git", [...args], { cwd, windowsHide: true, encoding: "utf8" });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const detail = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    throw new Error(detail.stderr?.trim() || detail.stdout?.trim() || detail.message);
  }
}

/** Reads local branch first-parent lines for pure range ownership validation. */
export async function KtcReadLocalGitBranchLines(
  repositoryRoot: string,
  run: KtcGitCommandRunner = KtcRunGit,
): Promise<readonly KtcGitBranchLine[]> {
  const refs = await run(["for-each-ref", "--format=%(refname:short)%00%(objectname)", "refs/heads"], repositoryRoot);
  const branches: KtcGitBranchLine[] = [];
  for (const { name, tipOid } of KtcParseLocalGitBranchRefs(refs.stdout)) {
    const history = await run([
      "rev-list",
      "--first-parent",
      `--max-count=${KtcMaximumBranchHistory}`,
      tipOid,
    ], repositoryRoot);
    const firstParentOids = history.stdout.split(/\r?\n/u).map((oid) => oid.trim()).filter((oid) => /^[0-9a-f]{40,64}$/iu.test(oid));
    branches.push({ name, firstParentOids });
  }
  return branches;
}

/** Parses Git's newline-delimited ref records whose two fields are NUL separated. */
export function KtcParseLocalGitBranchRefs(
  stdout: string,
): readonly { readonly name: string; readonly tipOid: string }[] {
  const result: { name: string; tipOid: string }[] = [];
  for (const record of stdout.split(/\r?\n/u)) {
    if (!record) continue;
    const fields = record.split("\0");
    if (fields.length !== 2) throw new Error("Git 返回了不完整的本地分支引用列表。");
    const name = fields[0]!.trim();
    const tipOid = fields[1]!.trim();
    if (!name || !/^[0-9a-f]{40,64}$/iu.test(tipOid)) {
      throw new Error("Git 返回了无效的本地分支引用记录。");
    }
    result.push({ name, tipOid });
  }
  return result;
}

/**
 * Reads exact local refs, not refname:short (which is ambiguous when a tag has the
 * same name). Porcelain -z keeps worktree paths intact, including spaces/newlines.
 */
export async function KtcReadLocalGitBranchOptions(
  repositoryRoot: string,
  run: KtcGitCommandRunner = KtcRunGit,
): Promise<KtcLocalGitBranchOptions> {
  const root = await KtcReadCanonicalBranchRoot(repositoryRoot, run);
  const before = await KtcReadBranchIdentity(root, run);
  const refs = await run(["for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)", "refs/heads"], root);
  const worktrees = await run(["worktree", "list", "--porcelain", "-z"], root);
  const records = await Promise.all(KtcParseGitWorktreeRecords(worktrees.stdout).map(async (record) => ({
    ...record,
    // Prunable records can reference a removed directory. Keep those occupied,
    // rather than making an unsafe assumption that Git has already pruned them.
    directory: await realpath(record.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return path.resolve(record.directory);
      throw error;
    }),
  })));
  const options = refs.stdout.split(/\r?\n/u).filter(Boolean).map((record): KtcLocalGitBranchOption => {
    const fields = record.split("\0");
    if (fields.length !== 2 || !fields[0]!.startsWith("refs/heads/") || !KtcFullOidPattern.test(fields[1]!)) {
      throw new Error("Git 返回了无效的完整本地分支引用；请刷新分支列表。");
    }
    const ref = fields[0]!;
    const name = ref.slice("refs/heads/".length);
    if (!name || /[\0\r\n]/u.test(name)) throw new Error("Git 返回了无效的本地分支名称。");
    const current = ref === before.ref;
    const occupied = records.find((item) => item.ref === ref && KtcBranchPathKey(item.directory) !== KtcBranchPathKey(root));
    return {
      name, ref, oid: fields[1]!, current, disabled: !current && !!occupied,
      ...(!current && occupied ? { reason: `已被其他工作树占用：${occupied.directory}`, worktreePath: occupied.directory } : {}),
    };
  });
  if (new Set(options.map(({ ref }) => ref)).size !== options.length) {
    throw new Error("Git 返回了重复的本地分支引用；请刷新分支列表。");
  }
  const afterRoot = await KtcReadCanonicalBranchRoot(root, run);
  const after = await KtcReadBranchIdentity(root, run);
  if (KtcBranchPathKey(afterRoot) !== KtcBranchPathKey(root) || before.oid !== after.oid || before.ref !== after.ref
    || (before.ref !== "HEAD" && !options.some((option) => option.ref === before.ref && option.oid === before.oid))) {
    throw new Error("读取本地分支期间仓库、HEAD 或当前分支已变化，请刷新分支列表。");
  }
  return { root, headOid: before.oid, ...(before.ref !== "HEAD" ? { currentBranchName: before.ref.slice("refs/heads/".length) } : {}), options };
}

function KtcParseGitWorktreeRecords(stdout: string): readonly KtcGitWorktreeRecord[] {
  if (!stdout || !stdout.endsWith("\0")) throw new Error("Git 返回了不完整的工作树列表。");
  const result: KtcGitWorktreeRecord[] = [];
  let directory: string | undefined;
  let ref: string | undefined;
  const finish = () => {
    if (directory !== undefined) result.push({ directory, ...(ref ? { ref } : {}) });
    directory = undefined;
    ref = undefined;
  };
  for (const field of stdout.split("\0")) {
    if (!field) { finish(); continue; }
    if (field.startsWith("worktree ")) {
      if (directory !== undefined) throw new Error("Git 工作树记录缺少分隔符。");
      directory = field.slice("worktree ".length);
      if (!path.isAbsolute(directory)) throw new Error("Git 返回了无效的工作树目录。");
    } else {
      if (directory === undefined) throw new Error("Git 工作树记录缺少目录。");
      if (field.startsWith("branch ")) {
        if (ref !== undefined) throw new Error("Git 工作树记录包含重复分支。");
        ref = field.slice("branch ".length);
        if (!ref.startsWith("refs/heads/") || ref === "refs/heads/" || /[\r\n]/u.test(ref)) throw new Error("Git 返回了无效的工作树分支引用。");
      } else if (field.startsWith("HEAD ")) {
        if (!KtcFullOidPattern.test(field.slice("HEAD ".length))) throw new Error("Git 返回了无效的工作树 HEAD。");
      } else if (field !== "bare" && field !== "detached" && field !== "locked" && field !== "prunable"
        && !field.startsWith("locked ") && !field.startsWith("prunable ")) {
        throw new Error("Git 返回了未知的工作树记录；请刷新后重试。");
      }
    }
  }
  if (!result.length) throw new Error("Git 工作树列表为空，不能确认分支占用情况。");
  return result;
}

async function KtcReadCanonicalBranchRoot(root: string, run: KtcGitCommandRunner): Promise<string> {
  const result = await run(["rev-parse", "--show-toplevel"], root);
  const directory = result.stdout.replace(/\r?\n$/u, "");
  if (!path.isAbsolute(directory)) throw new Error("Git 返回了无效的仓库根目录。");
  return realpath(directory);
}

async function KtcReadBranchIdentity(root: string, run: KtcGitCommandRunner): Promise<{ readonly oid: string; readonly ref: string }> {
  const oid = (await run(["rev-parse", "--verify", "HEAD"], root)).stdout.trim();
  const ref = (await run(["rev-parse", "--symbolic-full-name", "HEAD"], root)).stdout.trim();
  if (!KtcFullOidPattern.test(oid) || (ref !== "HEAD" && (!ref.startsWith("refs/heads/") || ref === "refs/heads/"))) {
    throw new Error("Git 返回了无效的 HEAD 或当前分支。");
  }
  return { oid, ref };
}

function KtcBranchPathKey(value: string): string {
  const normalized = path.resolve(value).replace(/\\/gu, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/** Revalidates exact local identity, worktree occupancy and clean state; never forces or stashes. */
export async function KtcSwitchToLocalGitBranch(
  repositoryRoot: string,
  branchName: string,
  run: KtcGitCommandRunner = KtcRunGit,
  shouldContinue?: () => boolean,
  expectedIdentity?: KtcGitBranchSwitchIdentity,
): Promise<void> {
  if (!branchName || branchName.startsWith("-") || /[\0\r\n]/u.test(branchName)) {
    throw new Error("目标本地分支名称无效。");
  }
  KtcAssertBranchSwitchContinues(shouldContinue);
  if (expectedIdentity && (!path.isAbsolute(expectedIdentity.root)
    || !KtcFullOidPattern.test(expectedIdentity.headOid)
    || !/^refs\/heads\/[^\0\r\n]+$/u.test(expectedIdentity.currentRef))) {
    throw new Error("确认的分支切换来源身份无效；未执行分支切换。");
  }
  const snapshot = await KtcReadLocalGitBranchOptions(repositoryRoot, run);
  const sourceIdentity: KtcGitBranchSwitchIdentity = {
    root: snapshot.root,
    headOid: snapshot.headOid,
    currentRef: snapshot.currentBranchName ? `refs/heads/${snapshot.currentBranchName}` : "HEAD",
  };
  if (expectedIdentity) KtcAssertBranchSwitchIdentity(sourceIdentity, expectedIdentity);
  const target = snapshot.options.find((option) => option.name === branchName);
  if (!target) throw new Error(`本地分支“${branchName}”不存在，请刷新分支列表；不会自动创建或检出远程分支。`);
  if (target.current) return;
  if (target.disabled) throw new Error(target.reason);
  const status = await run(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], snapshot.root);
  if (status.stdout) throw new Error("工作区有未提交或未跟踪改动，不能直接切换分支；请先在源代码管理中处理，不会自动暂存或丢弃改动。");
  // The status read is asynchronous too: an external checkout with the same
  // HEAD OID must not silently authorize a switch from a different branch.
  const currentRoot = await KtcReadCanonicalBranchRoot(snapshot.root, run);
  const current = await KtcReadBranchIdentity(snapshot.root, run);
  KtcAssertBranchSwitchIdentity({ root: currentRoot, headOid: current.oid, currentRef: current.ref }, expectedIdentity ?? sourceIdentity);
  // Keep this synchronous guard adjacent to dispatch: closing the owning View
  // while any read above was pending must not start a late checkout.
  KtcAssertBranchSwitchContinues(shouldContinue);
  await run(["switch", "--quiet", "--no-guess", branchName], snapshot.root);
  const after = await KtcReadBranchIdentity(snapshot.root, run);
  if (after.ref !== target.ref || after.oid !== target.oid) {
    throw new Error("切换后分支或 HEAD 与选择时不一致；请刷新确认当前状态，不会自动回滚或强制切换。");
  }
}

function KtcAssertBranchSwitchContinues(shouldContinue?: () => boolean): void {
  if (shouldContinue && !shouldContinue()) throw new Error("分支切换已取消，未修改工作树。");
}

function KtcAssertBranchSwitchIdentity(current: KtcGitBranchSwitchIdentity, expected: KtcGitBranchSwitchIdentity): void {
  if (KtcBranchPathKey(current.root) !== KtcBranchPathKey(expected.root)
    || current.headOid !== expected.headOid || current.currentRef !== expected.currentRef) {
    throw new Error("切换前仓库、HEAD 或当前分支已变化，请刷新分支列表；未执行分支切换。");
  }
}
