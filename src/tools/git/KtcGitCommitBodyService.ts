import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { KtcGitCommandRunner } from "./KtcGitStashService.js";

const KtcExecFile = promisify(execFile);

async function KtcRunGit(args: readonly string[], cwd: string): Promise<{ readonly stdout: string; readonly stderr?: string }> {
  try {
    const result = await KtcExecFile("git", [...args], { cwd, windowsHide: true, encoding: "utf8" });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const detail = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    throw new Error(detail.stderr?.trim() || detail.stdout?.trim() || detail.message);
  }
}

/** Reads only one commit body for an explicit row action; it never scans history. */
export async function KtcReadGitCommitBody(
  repositoryRoot: string,
  oid: string,
  run: KtcGitCommandRunner = KtcRunGit,
): Promise<string> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/iu.test(oid)) throw new Error("commit OID 无效。");
  const result = await run(["show", "--no-color", "--no-show-signature", "--no-patch", "--format=%b", oid], repositoryRoot);
  return result.stdout.replace(/(?:\r?\n)$/u, "");
}
