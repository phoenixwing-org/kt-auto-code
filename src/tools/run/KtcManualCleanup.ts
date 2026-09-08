import type { BigIntStats } from "node:fs";
import { access, lstat, readdir, realpath, rm, rmdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  ktcParseRootCleanupConfigurationYaml,
  ktcRootCleanupFilenameMatches,
  type KtcRootCleanupConfiguration,
} from "../../core/rootCleanupPatterns.js";

const execFileAsync = promisify(execFile);

export type KtcQuickCleanupKind = "build" | "objects" | "obj";

export interface KtcCleanupResult {
  readonly root: string;
  /** Top-level entries removed from Root, rather than every child in a removed directory tree. */
  readonly deleted: readonly string[];
}

export type KtcCleanupTargetKind = "file" | "directory" | "directory-link";

export interface KtcRootArtifactCleanupTarget {
  readonly path: string;
  readonly kind: KtcCleanupTargetKind;
  /** Complete, non-link-following tree frozen at preview time. */
  readonly tree: readonly KtcCleanupTreeEntry[];
}

export interface KtcCleanupTreeEntry {
  readonly kind: KtcCleanupTargetKind;
  readonly identity: KtcCleanupPathIdentity;
}

export interface KtcRootArtifactCleanupPreview {
  readonly root: string;
  readonly rootIdentity: KtcCleanupPathIdentity;
  readonly rules: KtcRootCleanupConfiguration;
  /** Legacy projection retained for callers that displayed only file rules. */
  readonly patterns: readonly string[];
  readonly matched: readonly string[];
  readonly matchedIdentities: readonly KtcCleanupPathIdentity[];
  readonly targets: readonly KtcRootArtifactCleanupTarget[];
}

export interface KtcCleanupPathIdentity {
  readonly path: string;
  readonly dev: string;
  readonly ino: string;
  readonly size: string;
  readonly mtimeNs: string;
  readonly ctimeNs: string;
  readonly birthtimeNs: string;
}

export interface KtcCleanupExecutionOptions {
  /** Return false when the caller has cancelled the destructive operation. */
  readonly shouldContinue?: () => boolean;
}

export interface KtcGitCleanupRepositoryResult { readonly repository: string; readonly deleted: readonly string[]; readonly error?: string; }
export interface KtcGitCleanupResult { readonly root: string; readonly repositories: readonly KtcGitCleanupRepositoryResult[]; }

export async function KtcCleanWorkspace(root: string, kind: KtcQuickCleanupKind): Promise<KtcCleanupResult> {
  const resolvedRoot = await KtcResolveSafeCleanupRoot(root), deleted: string[] = [];
  await KtcWalkCleanup(resolvedRoot, async (_entryPath, name, directory) => {
    const lower = name.toLocaleLowerCase();
    if (directory && ((kind === "build" && lower === "build") || (kind === "objects" && lower === "objects"))) return true;
    if (!directory && kind === "obj" && lower.endsWith(".obj")) return true;
    return false;
  }, deleted);
  return { root: resolvedRoot, deleted };
}

export async function KtcCleanRootArtifacts(
  root: string,
  patternsYaml: string,
  options: KtcCleanupExecutionOptions = {},
): Promise<KtcCleanupResult> {
  const preview = await KtcPreviewRootArtifacts(root, patternsYaml);
  return KtcCleanPreviewedRootArtifacts(preview, options);
}

/** Delete only the exact files, links and complete directory trees accepted from a frozen preview. */
export async function KtcCleanPreviewedRootArtifacts(
  preview: KtcRootArtifactCleanupPreview,
  options: KtcCleanupExecutionOptions = {},
): Promise<KtcCleanupResult> {
  const resolvedRoot = await KtcResolveSafeCleanupRoot(preview.root);
  KtcAssertCleanupRootIdentity(preview.rootIdentity, await KtcReadCleanupPathIdentity(resolvedRoot));
  if (preview.targets.length !== preview.matched.length
    || preview.matchedIdentities.length !== preview.matched.length) {
    throw new Error("清理候选身份快照不完整，拒绝删除。");
  }

  // Validate every accepted tree before deleting the first item.
  for (const target of preview.targets) {
    KtcAssertDirectChild(resolvedRoot, target.path);
    const currentTree = await KtcSnapshotCleanupTree(target.path);
    KtcAssertCleanupTree(target.tree, currentTree, target.path);
  }
  KtcAssertCleanupCanContinue(options);

  const deleted: string[] = [];
  for (const target of preview.targets) {
    KtcAssertCleanupCanContinue(options);
    const nodes = [...target.tree].sort((left, right) => (
      cleanupDepth(right.identity.path) - cleanupDepth(left.identity.path)
      || right.identity.path.localeCompare(left.identity.path)
    ));
    for (const node of nodes) {
      KtcAssertCleanupCanContinue(options);
      const current = await KtcReadCleanupPathIdentity(node.identity.path);
      if (node.kind === "directory") {
        KtcAssertStableCleanupPathIdentity(node.identity, current, "清理目录");
        await rmdir(node.identity.path);
      } else {
        KtcAssertCleanupPathIdentity(node.identity, current, "清理候选");
        await rm(node.identity.path, { force: true });
      }
    }
    deleted.push(target.path);
  }
  return Object.freeze({ root: resolvedRoot, deleted: Object.freeze(deleted) });
}

function KtcAssertCleanupCanContinue(options: KtcCleanupExecutionOptions): void {
  if (options.shouldContinue?.() === false) {
    throw new Error("Root 清理已取消；未继续删除项目。");
  }
}

export async function KtcPreviewRootArtifacts(root: string, patternsYaml: string): Promise<KtcRootArtifactCleanupPreview> {
  const resolvedRoot = await KtcResolveSafeCleanupRoot(root);
  const rootIdentity = await KtcReadCleanupPathIdentity(resolvedRoot);
  const rules = ktcParseRootCleanupConfigurationYaml(patternsYaml);
  const directChildren = await readdir(resolvedRoot, { withFileTypes: true });
  const targets = new Map<string, KtcRootArtifactCleanupTarget>();

  for (const entry of directChildren) {
    if (entry.name.toLocaleLowerCase() === ".git") continue;
    const entryPath = path.join(resolvedRoot, entry.name);
    if (entry.isFile() && ktcRootCleanupFilenameMatches(entry.name, rules.files)) {
      await addCleanupTarget(targets, entryPath, "file");
      continue;
    }
    if (entry.isDirectory() && rules.directories.some((name) => cleanupNameEquals(name, entry.name))) {
      await addCleanupTarget(targets, entryPath, "directory");
      continue;
    }
    if (!entry.isSymbolicLink()) continue;
    let directoryLink = false;
    try { directoryLink = (await stat(entryPath)).isDirectory(); }
    catch { /* Broken links are not accepted as directory-link cleanup targets. */ }
    if (!directoryLink) continue;
    const exactDirectory = rules.directories.some((name) => cleanupNameEquals(name, entry.name));
    const unlinkMatch = ktcRootCleanupFilenameMatches(entry.name, rules.unlinkDirectories);
    if (exactDirectory || unlinkMatch) await addCleanupTarget(targets, entryPath, "directory-link");
  }

  const frozenTargets = Object.freeze([...targets.values()].sort((left, right) => left.path.localeCompare(right.path)));
  const matched = Object.freeze(frozenTargets.map(({ path: targetPath }) => targetPath));
  const matchedIdentities = Object.freeze(frozenTargets.map(({ tree }) => tree[0]!.identity));
  return Object.freeze({
    root: resolvedRoot,
    rootIdentity,
    rules,
    patterns: rules.files,
    matched,
    matchedIdentities,
    targets: frozenTargets,
  });
}

async function addCleanupTarget(
  targets: Map<string, KtcRootArtifactCleanupTarget>,
  targetPath: string,
  expectedKind: KtcCleanupTargetKind,
): Promise<void> {
  if (targets.has(targetPath)) return;
  const tree = await KtcSnapshotCleanupTree(targetPath);
  if (tree[0]?.kind !== expectedKind) throw new Error(`清理候选类型在预览期间发生变化：${targetPath}`);
  targets.set(targetPath, Object.freeze({ path: targetPath, kind: expectedKind, tree }));
}

async function KtcSnapshotCleanupTree(entryPath: string): Promise<readonly KtcCleanupTreeEntry[]> {
  const result: KtcCleanupTreeEntry[] = [];
  await snapshot(entryPath, result);
  return Object.freeze(result);
}

async function snapshot(entryPath: string, result: KtcCleanupTreeEntry[]): Promise<void> {
  const entry = await lstat(entryPath, { bigint: true });
  const kind: KtcCleanupTargetKind = entry.isSymbolicLink()
    ? "directory-link"
    : entry.isDirectory() ? "directory" : "file";
  result.push(Object.freeze({ kind, identity: KtcCleanupPathIdentityFromStat(entryPath, entry) }));
  if (kind !== "directory") return;
  const children = await readdir(entryPath, { withFileTypes: true });
  children.sort((left, right) => left.name.localeCompare(right.name));
  for (const child of children) await snapshot(path.join(entryPath, child.name), result);
}

function KtcAssertCleanupTree(
  accepted: readonly KtcCleanupTreeEntry[],
  current: readonly KtcCleanupTreeEntry[],
  targetPath: string,
): void {
  if (accepted.length !== current.length) throw new Error(`清理目录自确认预览后已变化，拒绝删除：${targetPath}`);
  for (let index = 0; index < accepted.length; index += 1) {
    const expected = accepted[index]!;
    const actual = current[index]!;
    if (expected.kind !== actual.kind) throw new Error(`清理候选类型自确认预览后已变化，拒绝删除：${expected.identity.path}`);
    KtcAssertCleanupPathIdentity(expected.identity, actual.identity, "清理候选");
  }
}

async function KtcReadCleanupPathIdentity(entryPath: string): Promise<KtcCleanupPathIdentity> {
  return KtcCleanupPathIdentityFromStat(entryPath, await lstat(entryPath, { bigint: true }));
}

function KtcCleanupPathIdentityFromStat(entryPath: string, entry: BigIntStats): KtcCleanupPathIdentity {
  return Object.freeze({
    path: entryPath,
    dev: entry.dev.toString(),
    ino: entry.ino.toString(),
    size: entry.size.toString(),
    mtimeNs: entry.mtimeNs.toString(),
    ctimeNs: entry.ctimeNs.toString(),
    birthtimeNs: entry.birthtimeNs.toString(),
  });
}

function KtcAssertCleanupRootIdentity(accepted: KtcCleanupPathIdentity, current: KtcCleanupPathIdentity): void {
  const nativeIdentityAvailable = accepted.dev !== "0" || accepted.ino !== "0";
  if (accepted.path !== current.path
    || (nativeIdentityAvailable
      ? accepted.dev !== current.dev || accepted.ino !== current.ino
      : accepted.birthtimeNs !== current.birthtimeNs)) {
    throw new Error(`ROOT_DIR 自确认预览后已变化，拒绝删除：${accepted.path}`);
  }
}

function KtcAssertStableCleanupPathIdentity(
  accepted: KtcCleanupPathIdentity,
  current: KtcCleanupPathIdentity,
  description: string,
): void {
  const nativeIdentityAvailable = accepted.dev !== "0" || accepted.ino !== "0";
  if (accepted.path !== current.path
    || (nativeIdentityAvailable
      ? accepted.dev !== current.dev || accepted.ino !== current.ino
      : accepted.birthtimeNs !== current.birthtimeNs)) {
    throw new Error(`${description}自确认预览后已被替换，拒绝删除：${accepted.path}`);
  }
}

function KtcAssertCleanupPathIdentity(
  accepted: KtcCleanupPathIdentity,
  current: KtcCleanupPathIdentity,
  description: string,
): void {
  if (accepted.path !== current.path
    || accepted.dev !== current.dev
    || accepted.ino !== current.ino
    || accepted.size !== current.size
    || accepted.mtimeNs !== current.mtimeNs
    || accepted.ctimeNs !== current.ctimeNs
    || accepted.birthtimeNs !== current.birthtimeNs) {
    throw new Error(`${description}自确认预览后已变化，拒绝删除：${accepted.path}`);
  }
}

function KtcAssertDirectChild(root: string, entryPath: string): void {
  if (path.dirname(entryPath) !== root || entryPath === root) {
    throw new Error(`清理候选不是 ROOT_DIR 的直接子项，拒绝删除：${entryPath}`);
  }
}

function cleanupDepth(value: string): number { return value.split(/[\\/]/u).length; }
function cleanupNameEquals(left: string, right: string): boolean { return left.toLocaleLowerCase() === right.toLocaleLowerCase(); }

export async function KtcCleanGitUntrackedRepositories(root: string): Promise<KtcGitCleanupResult> {
  const resolvedRoot = await KtcResolveSafeCleanupRoot(root), repositories: string[] = [];
  await KtcFindGitRepositories(resolvedRoot, repositories);
  const results: KtcGitCleanupRepositoryResult[] = [];
  for (const repository of repositories) {
    try {
      const preview = await execFileAsync("git", ["-C", repository, "clean", "-ndfx"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      const deleted = preview.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
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
    if (await shouldDelete(entryPath, entry.name, directoryEntry)) {
      await rm(entryPath, { recursive: directoryEntry, force: true });
      deleted.push(entryPath);
      continue;
    }
    if (directoryEntry) await KtcWalkCleanup(entryPath, shouldDelete, deleted);
  }
}
