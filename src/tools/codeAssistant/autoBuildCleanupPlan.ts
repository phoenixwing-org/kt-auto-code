import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";
import { win32 } from "node:path";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import { ktcAutoBuildRootEnabled, ktcAutoBuildThirdPartyEnabled, ktcSelectAutoBuildProjects } from "./autoBuildContracts.js";

export interface KtcAutoBuildCleanupTarget {
  readonly path: string;
  readonly action: "delete" | "empty-and-preserve";
  readonly identity: KtcAutoBuildDirectoryCleanupIdentity;
}

export interface KtcAutoBuildStableDirectoryIdentity {
  readonly path: string;
  readonly creationTimeUtcMs: string;
}

export interface KtcAutoBuildDirectoryStateIdentity extends KtcAutoBuildStableDirectoryIdentity {
  readonly exists: boolean;
  readonly lastWriteTimeUtcMs: string;
}

export interface KtcAutoBuildDirectoryCleanupIdentity {
  readonly target: KtcAutoBuildDirectoryStateIdentity;
  readonly parent: KtcAutoBuildDirectoryStateIdentity;
}

export interface KtcAutoBuildRepositoryCleanupIdentity {
  readonly path: string;
  readonly head: string;
  readonly gitDir: string;
  readonly origin: string;
  readonly worktree: KtcAutoBuildStableDirectoryIdentity;
  readonly gitDirectory: KtcAutoBuildStableDirectoryIdentity;
}

export interface KtcAutoBuildCleanupPlan {
  readonly repositories: readonly string[];
  readonly repositoryIdentities: readonly KtcAutoBuildRepositoryCleanupIdentity[];
  readonly cmakeBuildTargets: readonly KtcAutoBuildCleanupTarget[];
}

export type KtcResolveGitTopLevel = (
  path: string,
  description: string,
) => Promise<string>;

export interface KtcAutoBuildCleanupIdentityReader {
  readRepository(path: string): Promise<KtcAutoBuildRepositoryCleanupIdentity>;
  readDirectory(path: string): Promise<KtcAutoBuildDirectoryStateIdentity>;
}

const execFileAsync = promisify(execFile);

function utcMilliseconds(value: number): string {
  return Math.trunc(value).toString();
}

async function readDirectoryIdentity(path: string): Promise<KtcAutoBuildDirectoryStateIdentity> {
  try {
    const value = await stat(path);
    if (!value.isDirectory()) throw new Error(`清理身份目标不是目录：${path}`);
    return Object.freeze({
      path,
      exists: true,
      creationTimeUtcMs: utcMilliseconds(value.birthtimeMs),
      lastWriteTimeUtcMs: utcMilliseconds(value.mtimeMs),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return Object.freeze({ path, exists: false, creationTimeUtcMs: "", lastWriteTimeUtcMs: "" });
  }
}

const defaultIdentityReader: KtcAutoBuildCleanupIdentityReader = {
  async readRepository(path) {
    const command = async (...args: string[]) => (await execFileAsync("git", ["-C", path, ...args], { encoding: "utf8" })).stdout.trim();
    const actualTopLevel = await command("rev-parse", "--show-toplevel");
    if (windowsPathKey(actualTopLevel) !== windowsPathKey(path)) {
      throw new Error(`Git 顶层在身份固化期间发生变化：${path} -> ${actualTopLevel}`);
    }
    const head = await command("rev-parse", "HEAD");
    const gitDir = await command("rev-parse", "--absolute-git-dir");
    let origin = "";
    try { origin = await command("remote", "get-url", "origin"); } catch { /* repositories without origin bind to the empty value */ }
    const worktree = await readDirectoryIdentity(actualTopLevel);
    const gitDirectory = await readDirectoryIdentity(gitDir);
    if (!worktree.exists || !gitDirectory.exists || !head || !gitDir) {
      throw new Error(`无法固化 Git 清理目标身份：${path}`);
    }
    return Object.freeze({
      path: actualTopLevel,
      head,
      gitDir,
      origin,
      worktree: Object.freeze({ path: worktree.path, creationTimeUtcMs: worktree.creationTimeUtcMs }),
      gitDirectory: Object.freeze({ path: gitDirectory.path, creationTimeUtcMs: gitDirectory.creationTimeUtcMs }),
    });
  },
  readDirectory: readDirectoryIdentity,
};

function windowsPathKey(value: string): string {
  return value.replaceAll("/", "\\").replace(/[\\]+$/u, "").toLocaleLowerCase();
}

/**
 * Materialize the exact destructive targets before asking for confirmation.
 * Git candidates are deliberately resolved to their top-level worktree so a
 * configured subdirectory can never make the confirmation narrower than the
 * repository that `git clean` will actually mutate.
 */
export async function ktcCreateAutoBuildCleanupPlan(
  configuration: KtcAutoBuildConfiguration,
  resolveGitTopLevel: KtcResolveGitTopLevel,
  identityReader: KtcAutoBuildCleanupIdentityReader = defaultIdentityReader,
): Promise<KtcAutoBuildCleanupPlan> {
  const selected = ktcSelectAutoBuildProjects(configuration);
  const repositoryCandidates = [
    ...(ktcAutoBuildRootEnabled(configuration) ? [{ path: configuration.rootDirectory, description: "ROOT_DIR" }] : []),
    ...(ktcAutoBuildThirdPartyEnabled(configuration) ? [{ path: configuration.thirdPartyDirectory, description: "ROOT_DIR_3rdParty" }] : []),
    ...selected.cmakeProjectPaths.map((path) => ({ path, description: "CMake 项目" })),
  ];
  const repositories: string[] = [];
  const repositoryIdentities: KtcAutoBuildRepositoryCleanupIdentity[] = [];
  const seenRepositories = new Set<string>();
  for (const candidate of repositoryCandidates) {
    const topLevel = (await resolveGitTopLevel(candidate.path, candidate.description)).trim();
    const key = windowsPathKey(topLevel);
    if (!key || seenRepositories.has(key)) continue;
    seenRepositories.add(key);
    repositories.push(topLevel);
    const identity = await identityReader.readRepository(topLevel);
    if (windowsPathKey(identity.path) !== key) {
      throw new Error(`Git 身份路径与清理目标不一致：${topLevel}`);
    }
    if (!identity.head || !identity.gitDir || !identity.worktree.creationTimeUtcMs
      || !identity.gitDirectory.creationTimeUtcMs
      || windowsPathKey(identity.worktree.path) !== key
      || windowsPathKey(identity.gitDirectory.path) !== windowsPathKey(identity.gitDir)) {
      throw new Error(`Git 清理目标身份不完整：${topLevel}`);
    }
    repositoryIdentities.push(identity);
  }

  const cmakeBuildTargets: KtcAutoBuildCleanupTarget[] = [];
  const seenBuildTargets = new Set<string>();
  for (const projectPath of selected.cmakeProjectPaths) {
    const normalizedProject = win32.normalize(projectPath);
    const targets: Array<Omit<KtcAutoBuildCleanupTarget, "identity">> = [
      { path: win32.join(normalizedProject, "build"), action: "delete" },
      { path: win32.join(win32.dirname(normalizedProject), "build"), action: "empty-and-preserve" },
    ];
    for (const target of targets) {
      const key = `${windowsPathKey(target.path)}\0${target.action}`;
      if (seenBuildTargets.has(key)) continue;
      seenBuildTargets.add(key);
      const targetIdentity = await identityReader.readDirectory(target.path);
      const parentPath = win32.dirname(target.path);
      const parentIdentity = await identityReader.readDirectory(parentPath);
      if (windowsPathKey(targetIdentity.path) !== windowsPathKey(target.path)
        || windowsPathKey(parentIdentity.path) !== windowsPathKey(parentPath)
        || !parentIdentity.exists
        || !parentIdentity.creationTimeUtcMs
        || !parentIdentity.lastWriteTimeUtcMs) {
        throw new Error(`CMake 清理目标或父目录身份不完整：${target.path}`);
      }
      if (targetIdentity.exists && (!targetIdentity.creationTimeUtcMs || !targetIdentity.lastWriteTimeUtcMs)) {
        throw new Error(`CMake 清理目标身份不完整：${target.path}`);
      }
      cmakeBuildTargets.push({
        ...target,
        identity: Object.freeze({ target: targetIdentity, parent: parentIdentity }),
      });
    }
  }
  cmakeBuildTargets.sort((left, right) => left.path.localeCompare(right.path)
    || left.action.localeCompare(right.action));

  return { repositories, repositoryIdentities, cmakeBuildTargets };
}

export function ktcFormatAutoBuildCleanupPlan(plan: KtcAutoBuildCleanupPlan): string {
  const lines = [
    "Git 仓库（reset --hard + clean -ffdx）：",
    ...plan.repositories.map((path) => `- ${path}`),
  ];
  if (plan.cmakeBuildTargets.length) {
    lines.push(
      "",
      "CMake 构建目录：",
      ...plan.cmakeBuildTargets.map((target) => target.action === "delete"
        ? `- [删除整个目录] ${target.path}`
        : `- [清空内容并保留目录] ${target.path}`),
    );
  }
  return lines.join("\n");
}
