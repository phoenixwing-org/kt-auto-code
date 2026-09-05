import { access, readdir, realpath, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export type KtcQuickCleanupKind = "build" | "objects" | "obj";

export interface KtcCleanupResult {
  readonly root: string;
  readonly deleted: readonly string[];
}
export interface KtcGitCleanupRepositoryResult { readonly repository: string; readonly deleted: readonly string[]; readonly error?: string; }
export interface KtcGitCleanupResult { readonly root: string; readonly repositories: readonly KtcGitCleanupRepositoryResult[]; }
export async function KtcCleanWorkspace(root: string, kind: KtcQuickCleanupKind): Promise<KtcCleanupResult> {
  const resolvedRoot = await KtcResolveSafeCleanupRoot(root), deleted: string[] = [];
  await KtcWalkCleanup(resolvedRoot, async (entryPath, name, directory) => {
    const lower = name.toLocaleLowerCase();
    if (directory && ((kind === "build" && lower === "build") || (kind === "objects" && lower === "objects"))) return true;
    if (!directory && kind === "obj" && lower.endsWith(".obj")) return true;
    return false;
  }, deleted);
  return { root: resolvedRoot, deleted };
}

export async function KtcCleanRootArtifacts(root: string, prefix: string): Promise<KtcCleanupResult> {
  const resolvedRoot = await KtcResolveSafeCleanupRoot(root), normalizedPrefix = prefix.trim().toLocaleLowerCase(), deleted: string[] = [];
  if (!normalizedPrefix) throw new Error("请输入要清理的文件名前缀。");
  const extensions = new Set([".h", ".hh", ".hpp", ".hxx", ".dll", ".lib"]);
  await KtcWalkCleanup(resolvedRoot, async (_entryPath, name, directory) => !directory
    && name.toLocaleLowerCase().startsWith(normalizedPrefix)
    && extensions.has(path.extname(name).toLocaleLowerCase()), deleted);
  return { root: resolvedRoot, deleted };
}

export async function KtcCleanGitUntrackedRepositories(root: string): Promise<KtcGitCleanupResult> {
  const resolvedRoot = await KtcResolveSafeCleanupRoot(root), repositories: string[] = [];
  await KtcFindGitRepositories(resolvedRoot, repositories);
  const results: KtcGitCleanupRepositoryResult[] = [];
  for (const repository of repositories) {
    try {
      const preview = await execFileAsync("git", ["-C", repository, "clean", "-ndfx"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      const deleted = preview.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      await execFileAsync("git", ["-C", repository, "clean", "-dfx"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      results.push({ repository, deleted });
    } catch (error) { results.push({ repository, deleted: [], error: error instanceof Error ? error.message : String(error) }); }
  }
  return { root: resolvedRoot, repositories: results };
}

async function KtcFindGitRepositories(directory: string, repositories: string[]): Promise<void> {
  try { await access(path.join(directory, ".git")); repositories.push(directory); return; } catch { /* descend */ }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.toLocaleLowerCase() === ".git") continue;
    await KtcFindGitRepositories(path.join(directory, entry.name), repositories);
  }
}

async function KtcResolveSafeCleanupRoot(root: string): Promise<string> {
  const resolved = await realpath(path.resolve(root));
  if (KtcIsCleanupFilesystemRoot(resolved)) throw new Error("不允许在文件系统根目录执行清理。");
  return resolved;
}

export function KtcIsCleanupFilesystemRoot(value: string): boolean {
  const pathApi = /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\/u.test(value) ? path.win32 : path.posix;
  const normalized = pathApi.resolve(value);
  if (/^\\\\\?\\UNC\\[^\\]+\\[^\\]+\\?$/iu.test(normalized)) return true;
  return normalized.toLocaleLowerCase() === pathApi.parse(normalized).root.toLocaleLowerCase();
}

async function KtcWalkCleanup(
  directory: string,
  shouldDelete: (entryPath: string, name: string, directory: boolean) => Promise<boolean>,
  deleted: string[],
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.toLocaleLowerCase() === ".git" || entry.isSymbolicLink()) continue;
    const entryPath = path.join(directory, entry.name), directoryEntry = entry.isDirectory();
    if (await shouldDelete(entryPath, entry.name, directoryEntry)) { await rm(entryPath, { recursive: directoryEntry, force: true }); deleted.push(entryPath); continue; }
    if (directoryEntry) await KtcWalkCleanup(entryPath, shouldDelete, deleted);
  }
}
