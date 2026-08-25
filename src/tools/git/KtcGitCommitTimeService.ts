import { spawn } from "node:child_process";
import { KtcFormatGitDate } from "../../core/git/KtcGitDate.js";

const KtcZeroOid = "0000000000000000000000000000000000000000";

interface KtcGitRunOptions {
  readonly allowFailure?: boolean;
  readonly input?: string;
  readonly env?: Readonly<Record<string, string>>;
}

export type KtcGitMutationRunner = (
  args: readonly string[],
  cwd: string,
  options?: KtcGitRunOptions,
) => Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>;

interface KtcRawCommit {
  readonly oid: string;
  readonly treeOid: string;
  readonly parentOids: readonly string[];
  readonly author: KtcRawIdentity;
  readonly committer: KtcRawIdentity;
  readonly message: string;
  readonly extraHeaders: readonly string[];
}

interface KtcRawIdentity {
  readonly name: string;
  readonly email: string;
  readonly date: string;
}

export interface KtcGitCommitTimeResetAnalysis {
  readonly repositoryRoot: string;
  readonly currentRef: string;
  readonly branchName: string;
  readonly headOid: string;
  readonly targetOid: string;
  readonly targetSubject: string;
  readonly affectedOids: readonly string[];
}

export interface KtcGitCommitTimeResetResult {
  readonly oldHeadOid: string;
  readonly newHeadOid: string;
  readonly rewritten: readonly { readonly oldOid: string; readonly newOid: string }[];
  readonly backupRef: string;
}

/** Suggests a machine-local wall-clock value between the loaded newer/older neighbours. */
export function KtcSuggestGitCommitTime(
  commits: readonly { readonly oid: string; readonly committer: { readonly date: string } }[],
  oid: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): string {
  const index = commits.findIndex((commit) => commit.oid === oid);
  const current = index >= 0 ? KtcGitTimestamp(commits[index]!.committer.date) : undefined;
  const newer = index > 0 ? KtcGitTimestamp(commits[index - 1]!.committer.date) : undefined;
  const older = index >= 0 && index + 1 < commits.length
    ? KtcGitTimestamp(commits[index + 1]!.committer.date)
    : undefined;
  const timestamp = newer !== undefined && older !== undefined && newer - older > 1
    ? Math.floor((newer + older) / 2)
    : current ?? nowSeconds;
  return KtcFormatGitDate(`${timestamp} +0000`);
}

async function KtcRunGit(
  args: readonly string[],
  cwd: string,
  options: KtcGitRunOptions = {},
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn("git", [...args], {
      cwd,
      windowsHide: true,
      env: { ...process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value: string) => { stdout += value; });
    child.stderr.on("data", (value: string) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => {
      const exitCode = code ?? -1;
      if (exitCode !== 0 && options.allowFailure !== true) {
        reject(new Error(stderr.trim() || stdout.trim() || `git ${args[0] ?? ""} 失败（${exitCode}）`));
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
    child.stdin.end(options.input ?? "");
  });
}

/**
 * Reads and validates one current-branch rewrite plan without changing refs.
 * The target and every descendant to HEAD must form a single-parent line.
 */
export async function KtcAnalyzeGitCommitTimeReset(
  repositoryRoot: string,
  targetOid: string,
  expectedHeadOid?: string,
  run: KtcGitMutationRunner = KtcRunGit,
): Promise<KtcGitCommitTimeResetAnalysis> {
  KtcAssertOid(targetOid);
  const currentRef = (await run(["symbolic-ref", "-q", "HEAD"], repositoryRoot, { allowFailure: true })).stdout.trim();
  if (!currentRef.startsWith("refs/heads/")) throw new Error("当前不是本地分支，不能重置提交时间。");
  const headOid = (await run(["rev-parse", "--verify", "HEAD"], repositoryRoot)).stdout.trim();
  KtcAssertOid(headOid);
  if (expectedHeadOid && headOid !== expectedHeadOid) throw new Error("HEAD 已变化，请刷新提交图后重试。");
  const status = await run(["status", "--porcelain=v2", "-z", "--untracked-files=normal"], repositoryRoot);
  if (status.stdout.length > 0) throw new Error("工作区存在未归档改动，请处理后再重置提交时间。");

  const target = await KtcReadRawCommit(repositoryRoot, targetOid, run);
  if (target.parentOids.length === 0) throw new Error("暂不支持重置根 commit 的时间。");
  const affectedOutput = await run(
    ["rev-list", "--first-parent", "--reverse", `${target.parentOids[0]}..${headOid}`],
    repositoryRoot,
  );
  const affectedOids = KtcLines(affectedOutput.stdout);
  if (affectedOids[0] !== targetOid) {
    throw new Error("所选 commit 不在当前分支通往 HEAD 的 first-parent 直线上；请先切换到对应分支。");
  }
  let previousOid = target.parentOids[0]!;
  for (const oid of affectedOids) {
    const commit = oid === targetOid ? target : await KtcReadRawCommit(repositoryRoot, oid, run);
    if (commit.parentOids.length !== 1 || commit.parentOids[0] !== previousOid) {
      throw new Error("所选 commit 到 HEAD 之间包含合并或非直线历史，暂不自动重置时间。");
    }
    if (commit.extraHeaders.length > 0) {
      throw new Error(`受影响 commit ${oid.slice(0, 7)} 包含签名或额外 header，不能安全重建。`);
    }
    previousOid = oid;
  }

  const containingRefs = KtcLines((await run([
    "for-each-ref", `--contains=${targetOid}`, "--format=%(refname)", "refs/heads", "refs/remotes", "refs/tags",
  ], repositoryRoot)).stdout);
  const sharedRefs = containingRefs.filter((refName) => refName !== currentRef);
  if (sharedRefs.length > 0) {
    throw new Error(`所选 commit 已被其他分支、标签或远端引用：${sharedRefs.slice(0, 3).join("、")}。`);
  }
  const targetSubject = KtcCommitSubject(target.message);
  return {
    repositoryRoot,
    currentRef,
    branchName: currentRef.slice("refs/heads/".length),
    headOid,
    targetOid,
    targetSubject,
    affectedOids,
  };
}

/** Atomically rewrites one local, unpublished commit time and replays its linear descendants. */
export async function KtcExecuteGitCommitTimeReset(
  input: {
    readonly repositoryRoot: string;
    readonly targetOid: string;
    readonly expectedHeadOid: string;
    readonly date: string;
  },
  run: KtcGitMutationRunner = KtcRunGit,
): Promise<KtcGitCommitTimeResetResult> {
  if (!/^\d+ [+-]\d{4}$/u.test(input.date)) throw new Error("Git 提交时间格式无效。");
  const plan = await KtcAnalyzeGitCommitTimeReset(
    input.repositoryRoot,
    input.targetOid,
    input.expectedHeadOid,
    run,
  );
  const records = await Promise.all(plan.affectedOids.map((oid) => KtcReadRawCommit(input.repositoryRoot, oid, run)));
  const backupRef = await KtcCreateNumberedBackupRef(input.repositoryRoot, plan.branchName, plan.headOid, run);
  const rewritten: { oldOid: string; newOid: string }[] = [];
  let branchUpdated = false;
  try {
    const oidMap = new Map<string, string>();
    for (const record of records) {
      const parentOid = oidMap.get(record.parentOids[0]!) ?? record.parentOids[0]!;
      const isTarget = record.oid === plan.targetOid;
      const author = isTarget ? { ...record.author, date: input.date } : record.author;
      const committer = isTarget ? { ...record.committer, date: input.date } : record.committer;
      const created = await run(
        ["-c", "commit.gpgSign=false", "commit-tree", record.treeOid, "-p", parentOid],
        input.repositoryRoot,
        {
          input: record.message.endsWith("\n") ? record.message : `${record.message}\n`,
          env: {
            GIT_AUTHOR_NAME: author.name,
            GIT_AUTHOR_EMAIL: author.email,
            GIT_AUTHOR_DATE: author.date,
            GIT_COMMITTER_NAME: committer.name,
            GIT_COMMITTER_EMAIL: committer.email,
            GIT_COMMITTER_DATE: committer.date,
          },
        },
      );
      const newOid = created.stdout.trim();
      KtcAssertOid(newOid);
      oidMap.set(record.oid, newOid);
      rewritten.push({ oldOid: record.oid, newOid });
    }
    const newHeadOid = rewritten.at(-1)?.newOid;
    if (!newHeadOid) throw new Error("没有生成新的 commit。");
    const originalTree = (await run(["rev-parse", `${plan.headOid}^{tree}`], input.repositoryRoot)).stdout.trim();
    const newTree = (await run(["rev-parse", `${newHeadOid}^{tree}`], input.repositoryRoot)).stdout.trim();
    if (originalTree !== newTree) throw new Error("重建后的 HEAD tree 与原历史不一致。");
    await run([
      "update-ref", "--create-reflog", "-m", "kt-auto-code: reset commit time",
      plan.currentRef, newHeadOid, plan.headOid,
    ], input.repositoryRoot);
    branchUpdated = true;
    try {
      const verifiedHead = (await run(["rev-parse", "--verify", "HEAD"], input.repositoryRoot)).stdout.trim();
      const verifiedStatus = await run(["status", "--porcelain=v2", "-z", "--untracked-files=normal"], input.repositoryRoot);
      if (verifiedHead !== newHeadOid || verifiedStatus.stdout.length > 0) {
        throw new Error("更新后 HEAD 或工作区校验失败。");
      }
    } catch (error) {
      await run([
        "update-ref", "--create-reflog", "-m", "kt-auto-code: restore after failed time reset",
        plan.currentRef, plan.headOid, newHeadOid,
      ], input.repositoryRoot);
      branchUpdated = false;
      throw error;
    }
    return { oldHeadOid: plan.headOid, newHeadOid, rewritten, backupRef };
  } finally {
    if (!branchUpdated) {
      await run(["update-ref", "-d", backupRef, plan.headOid], input.repositoryRoot, { allowFailure: true });
    }
  }
}

function KtcParseRawIdentity(value: string, label: string): KtcRawIdentity {
  const match = /^(.*) <([^<>]*)> (\d+ [+-]\d{4})$/u.exec(value);
  if (!match) throw new Error(`${label} identity 无效。`);
  return { name: match[1]!, email: match[2]!, date: match[3]! };
}

async function KtcReadRawCommit(
  repositoryRoot: string,
  oid: string,
  run: KtcGitMutationRunner,
): Promise<KtcRawCommit> {
  const raw = (await run(["cat-file", "-p", oid], repositoryRoot)).stdout;
  const separator = raw.indexOf("\n\n");
  if (separator < 0) throw new Error(`commit ${oid.slice(0, 7)} 内容无效。`);
  const headers = new Map<string, string[]>();
  let currentKey: string | undefined;
  for (const line of raw.slice(0, separator).split("\n")) {
    if (line.startsWith(" ") && currentKey) {
      const values = headers.get(currentKey)!;
      values[values.length - 1] = `${values.at(-1)}\n${line}`;
      continue;
    }
    const space = line.indexOf(" ");
    if (space <= 0) continue;
    currentKey = line.slice(0, space);
    const values = headers.get(currentKey) ?? [];
    values.push(line.slice(space + 1));
    headers.set(currentKey, values);
  }
  const known = new Set(["tree", "parent", "author", "committer"]);
  return {
    oid,
    treeOid: KtcRequiredHeader(headers, "tree", oid),
    parentOids: headers.get("parent") ?? [],
    author: KtcParseRawIdentity(KtcRequiredHeader(headers, "author", oid), "Author"),
    committer: KtcParseRawIdentity(KtcRequiredHeader(headers, "committer", oid), "Committer"),
    message: raw.slice(separator + 2),
    extraHeaders: [...headers.keys()].filter((key) => !known.has(key)),
  };
}

function KtcRequiredHeader(headers: ReadonlyMap<string, readonly string[]>, key: string, oid: string): string {
  const value = headers.get(key)?.[0];
  if (!value) throw new Error(`commit ${oid.slice(0, 7)} 缺少 ${key} header。`);
  return value;
}

async function KtcCreateNumberedBackupRef(
  repositoryRoot: string,
  branchName: string,
  headOid: string,
  run: KtcGitMutationRunner,
): Promise<string> {
  const safeBranch = branchName.replace(/[^A-Za-z0-9._/-]+/gu, "-").replace(/^[-/.]+|[-/.]+$/gu, "") || "branch";
  const base = `refs/kt-auto-code/backup/${safeBranch}-time`;
  for (let number = 1; number <= 10_000; number += 1) {
    const candidate = number === 1 ? base : `${base}-${number}`;
    const result = await run(["update-ref", candidate, headOid, KtcZeroOid], repositoryRoot, { allowFailure: true });
    if (result.exitCode === 0) return candidate;
  }
  throw new Error("无法创建提交时间重置备份引用。");
}

function KtcLines(value: string): string[] {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function KtcCommitSubject(message: string): string {
  return message.replace(/\r\n?/gu, "\n").split("\n", 1)[0]?.trim() || "(无标题)";
}

function KtcAssertOid(value: string): void {
  if (!/^[0-9a-f]{40,64}$/iu.test(value)) throw new Error("commit OID 无效。");
}

function KtcGitTimestamp(value: string): number | undefined {
  const match = /^(\d+) [+-]\d{4}$/u.exec(value.trim());
  if (!match) return undefined;
  const timestamp = Number(match[1]);
  return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}
