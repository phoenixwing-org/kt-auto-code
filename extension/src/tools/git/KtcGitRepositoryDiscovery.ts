import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface KtcGitWorkspaceFolderSeed {
  readonly name: string;
  readonly fsPath: string;
}

export interface KtcGitApiRepositorySeed {
  readonly rootPath: string;
  readonly submodulePaths?: readonly string[];
}

export interface KtcGitRepositoryCandidate {
  readonly startPath: string;
  readonly workspaceName: string;
  readonly workspaceRoot: string;
  readonly source: "workspace" | "vscode-git" | "submodule" | "active-editor";
}

export interface KtcGitRepositoryDisplay {
  readonly name: string;
  readonly relativePath: string;
  readonly workspaceName: string;
  readonly workspaceRoot: string;
}

/**
 * Builds bounded Git discovery inputs. VS Code owns repository discovery; this
 * helper never walks an entire workspace looking for `.git` directories.
 */
export function KtcCollectGitRepositoryCandidates(input: {
  readonly workspaceFolders: readonly KtcGitWorkspaceFolderSeed[];
  readonly gitRepositories?: readonly KtcGitApiRepositorySeed[];
  readonly activeFilePath?: string;
}): KtcGitRepositoryCandidate[] {
  const candidates: KtcGitRepositoryCandidate[] = [];
  const seen = new Set<string>();
  const append = (
    startPath: string,
    source: KtcGitRepositoryCandidate["source"],
  ): void => {
    const folder = KtcContainingWorkspace(startPath, input.workspaceFolders);
    if (!folder) return;
    const normalized = resolve(startPath);
    const key = KtcPathKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      startPath: normalized,
      workspaceName: folder.name,
      workspaceRoot: resolve(folder.fsPath),
      source,
    });
  };

  for (const folder of input.workspaceFolders) append(folder.fsPath, "workspace");
  for (const repository of input.gitRepositories ?? []) {
    append(repository.rootPath, "vscode-git");
    for (const submodulePath of repository.submodulePaths ?? []) {
      append(resolve(repository.rootPath, submodulePath), "submodule");
    }
  }
  if (input.activeFilePath) append(dirname(input.activeFilePath), "active-editor");
  return candidates;
}

export function KtcDescribeGitRepository(
  repositoryRoot: string,
  repositoryName: string,
  workspaceFolders: readonly KtcGitWorkspaceFolderSeed[],
): KtcGitRepositoryDisplay {
  const folder = KtcContainingWorkspace(repositoryRoot, workspaceFolders);
  if (!folder) {
    return {
      name: repositoryName,
      relativePath: repositoryName,
      workspaceName: repositoryName,
      workspaceRoot: repositoryRoot,
    };
  }
  const nested = relative(resolve(folder.fsPath), resolve(repositoryRoot)).replaceAll("\\", "/");
  return {
    name: repositoryName || folder.name,
    relativePath: nested ? `${folder.name}/${nested}` : folder.name,
    workspaceName: folder.name,
    workspaceRoot: resolve(folder.fsPath),
  };
}

export function KtcChooseGitRepositoryId(input: {
  readonly repositoryRoots: readonly string[];
  readonly currentId?: string;
  readonly storedId?: string;
  readonly activeFilePath?: string;
}): string | undefined {
  const roots = [...new Set(input.repositoryRoots)];
  if (input.currentId && roots.includes(input.currentId)) return input.currentId;
  if (input.activeFilePath) {
    const active = roots
      .filter((root) => KtcPathContains(root, input.activeFilePath!))
      .sort((left, right) => right.length - left.length)[0];
    if (active) return active;
  }
  if (input.storedId && roots.includes(input.storedId)) return input.storedId;
  return roots[0];
}

function KtcContainingWorkspace(
  candidatePath: string,
  folders: readonly KtcGitWorkspaceFolderSeed[],
): KtcGitWorkspaceFolderSeed | undefined {
  return folders
    .filter((folder) => KtcPathContains(folder.fsPath, candidatePath))
    .sort((left, right) => resolve(right.fsPath).length - resolve(left.fsPath).length)[0];
}

function KtcPathContains(parentPath: string, candidatePath: string): boolean {
  const child = relative(resolve(parentPath), resolve(candidatePath));
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function KtcPathKey(value: string): string {
  const normalized = resolve(value);
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}
