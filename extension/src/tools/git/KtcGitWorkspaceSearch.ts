import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface KtcGitWorkspaceSearchProgress {
  readonly scannedDirectories: number;
  readonly repositoryRoot?: string;
}

export interface KtcGitWorkspaceSearchOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: KtcGitWorkspaceSearchProgress) => void | Promise<void>;
  readonly onError?: (directory: string, error: unknown) => void;
}

const KtcGitSearchExcludedDirectories = new Set([".git", ".pnpm-store", "node_modules"]);

/**
 * Recursively searches workspace folders without entering dependency stores or
 * following symlinks. Each repository is reported as soon as its `.git`
 * marker is observed so the host can render partial results and cancel safely.
 */
export async function KtcSearchWorkspaceGitRepositories(
  workspaceRoots: readonly string[],
  options: KtcGitWorkspaceSearchOptions = {},
): Promise<number> {
  const queue = workspaceRoots.map((root) => resolve(root));
  let queueIndex = 0;
  let scannedDirectories = 0;
  while (queueIndex < queue.length) {
    KtcThrowIfAborted(options.signal);
    const directory = queue[queueIndex++]!;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      options.onError?.(directory, error);
      continue;
    }
    scannedDirectories += 1;
    KtcThrowIfAborted(options.signal);
    const repositoryRoot = entries.some((entry) => entry.name === ".git" && (entry.isDirectory() || entry.isFile()))
      ? directory
      : undefined;
    if (repositoryRoot || scannedDirectories % 50 === 0) {
      await options.onProgress?.({
        scannedDirectories,
        ...(repositoryRoot ? { repositoryRoot } : {}),
      });
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || KtcGitSearchExcludedDirectories.has(entry.name)) continue;
      queue.push(resolve(directory, entry.name));
    }
  }
  await options.onProgress?.({ scannedDirectories });
  return scannedDirectories;
}

function KtcThrowIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error("Git repository search was stopped");
  error.name = "AbortError";
  throw error;
}
