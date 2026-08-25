import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { KtcGitBranchLine } from "./KtcGitSelection.js";
import type { KtcGitCommandRunner } from "./KtcGitStashService.js";

const KtcExecFile = promisify(execFile);
const KtcMaximumBranchHistory = 10_000;

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

/** Switches only to a controller-validated local branch name; no shell interpolation. */
export async function KtcSwitchToLocalGitBranch(
  repositoryRoot: string,
  branchName: string,
  run: KtcGitCommandRunner = KtcRunGit,
): Promise<void> {
  if (!branchName || branchName.startsWith("-") || /[\0\r\n]/u.test(branchName)) {
    throw new Error("目标本地分支名称无效。");
  }
  await run(["switch", "--quiet", branchName], repositoryRoot);
}
