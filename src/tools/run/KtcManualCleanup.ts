import { readdir, rm } from "node:fs/promises";
import path from "node:path";

export type KtcQuickCleanupKind = "build" | "objects" | "obj";

export interface KtcCleanupResult {
  readonly root: string;
  readonly deleted: readonly string[];
}
export async function KtcCleanWorkspace(root: string, kind: KtcQuickCleanupKind): Promise<KtcCleanupResult> {
  const resolvedRoot = path.resolve(root), deleted: string[] = [];
  await KtcWalkCleanup(resolvedRoot, async (entryPath, name, directory) => {
    const lower = name.toLocaleLowerCase();
    if (directory && ((kind === "build" && lower === "build") || (kind === "objects" && lower === "objects"))) return true;
    if (!directory && kind === "obj" && lower.endsWith(".obj")) return true;
    return false;
  }, deleted);
  return { root: resolvedRoot, deleted };
}

export async function KtcCleanRootArtifacts(root: string, prefix: string): Promise<KtcCleanupResult> {
  const resolvedRoot = path.resolve(root), normalizedPrefix = prefix.trim().toLocaleLowerCase(), deleted: string[] = [];
  if (!normalizedPrefix) throw new Error("请输入要清理的文件名前缀。");
  const extensions = new Set([".h", ".hh", ".hpp", ".hxx", ".dll", ".lib"]);
  await KtcWalkCleanup(resolvedRoot, async (_entryPath, name, directory) => !directory
    && name.toLocaleLowerCase().startsWith(normalizedPrefix)
    && extensions.has(path.extname(name).toLocaleLowerCase()), deleted);
  return { root: resolvedRoot, deleted };
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
