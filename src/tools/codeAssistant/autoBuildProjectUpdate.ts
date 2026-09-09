import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ktcCanAccessAutoBuildPathOnHost, ktcIsAutoBuildFilesystemRoot, ktcResolveAutoBuildPath, type KtcAutoBuildProjectRow } from "./autoBuildProjectTable.js";

const execFileAsync = promisify(execFile);
export type KtcAutoBuildGitUpdateResult = "updated" | "skipped";
export interface KtcAutoBuildGitUpdateOptions {
  readonly signal?: AbortSignal;
  readonly log: (message: string) => void;
  readonly runGit?: (args: string[], signal?: AbortSignal) => Promise<string>;
}

/** Existing one-project TS update path; deliberately does not clone, clean or build.
 * TODO(Wing): replace with the shared repository provider when migration stage A passes its gates.
 */
export async function ktcUpdateAutoBuildProjectRepository(
  project: KtcAutoBuildProjectRow,
  workingDirectory: string,
  options: KtcAutoBuildGitUpdateOptions,
): Promise<KtcAutoBuildGitUpdateResult> {
  const root = ktcResolveAutoBuildPath(project.path, workingDirectory);
  if (!ktcCanAccessAutoBuildPathOnHost(root, process.platform)) throw new Error("当前项目不是本机原生绝对路径，未执行 Git 更新。");
  if (ktcIsAutoBuildFilesystemRoot(root)) throw new Error("不能将文件系统根作为 Git 更新目标。");
  const branch = project.branch.trim();
  if (!branch || branch.startsWith("-")) throw new Error("请填写有效的目标分支。");
  const runGit = options.runGit ?? (async (args: string[], signal?: AbortSignal) => {
    const result = await execFileAsync("git", args, {
      encoding: "utf8", signal, timeout: 120_000, maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    for (const line of `${result.stdout}\n${result.stderr}`.split(/\r?\n/u).filter(Boolean)) options.log(line);
    return result.stdout;
  });
  const run = async (...args: string[]): Promise<string> => {
    options.signal?.throwIfAborted();
    options.log(`git -C ${root} ${args.join(" ")}`);
    const result = await runGit(["-C", root, ...args], options.signal);
    options.signal?.throwIfAborted();
    return result.trim();
  };
  await run("check-ref-format", "--branch", branch);
  const repository = await run("rev-parse", "--show-toplevel");
  options.log(`更新目标：${repository} → ${branch}（TypeScript / Git；不编译）`);
  if (await run("status", "--porcelain=v1")) {
    options.log(`项目有修改，保留并跳过更新：${root}`);
    return "skipped";
  }
  await run("fetch", "--prune", "origin");
  if (await run("status", "--porcelain=v1")) {
    options.log(`获取远端期间项目发生修改，保留并跳过检出：${root}`);
    return "skipped";
  }
  await run("checkout", branch, "--");
  await run("pull", "--ff-only", "origin", branch);
  await run("submodule", "sync", "--recursive");
  await run("submodule", "update", "--init", "--recursive");
  let hasLfs = true;
  try { await run("lfs", "version"); }
  catch {
    options.signal?.throwIfAborted();
    hasLfs = false;
    options.log(`WARN 未检测到 Git LFS，已跳过 LFS pull：${root}`);
  }
  if (hasLfs) {
    await run("lfs", "install", "--local");
    await run("lfs", "pull");
  }
  return "updated";
}
