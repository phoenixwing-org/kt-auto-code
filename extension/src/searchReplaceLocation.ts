import { isAbsolute, relative, resolve } from "node:path";
import { ktcIsPathInsideWorkspace } from "../../src/workspace/workspacePath.js";

export interface KtcSearchReplaceLocation {
  root: string;
  scope?: string;
  usesCurrentWorkspace: boolean;
}

export interface KtcWorkingDirectoryCacheEntry {
  directory: string;
  inputValue: string;
  storage?: "workspace" | "global";
  cacheValue?: string;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function ktcClassifyWorkingDirectory(
  workspaceRoot: string | undefined,
  workingDirectory: string,
): KtcWorkingDirectoryCacheEntry | undefined {
  const requested = workingDirectory.trim();
  if (!requested) return undefined;
  const normalizedWorkspace = workspaceRoot ? resolve(workspaceRoot) : undefined;
  const directory = isAbsolute(requested)
    ? resolve(requested)
    : normalizedWorkspace
      ? resolve(normalizedWorkspace, requested)
      : undefined;
  if (!directory) return undefined;
  if (normalizedWorkspace && ktcIsPathInsideWorkspace(normalizedWorkspace, directory)) {
    const workspaceRelative = normalizeRelativePath(relative(normalizedWorkspace, directory));
    return workspaceRelative
      ? {
          directory,
          inputValue: workspaceRelative,
          storage: "workspace",
          cacheValue: workspaceRelative,
        }
      : { directory, inputValue: "" };
  }
  if (!isAbsolute(requested)) return undefined;
  return {
    directory,
    inputValue: directory,
    storage: "global",
    cacheValue: directory,
  };
}

export function ktcResolveSearchReplaceLocation(
  workspaceRoot: string | undefined,
  workingDirectory?: string,
): KtcSearchReplaceLocation {
  const requested = workingDirectory?.trim();
  const normalizedWorkspace = workspaceRoot ? resolve(workspaceRoot) : undefined;
  if (!requested) {
    if (!normalizedWorkspace) {
      throw new Error("请先打开工作区，或使用文件夹按钮选择绝对工作目录。");
    }
    return { root: normalizedWorkspace, usesCurrentWorkspace: true };
  }
  if (normalizedWorkspace && (requested === "." || requested === "/")) {
    return { root: normalizedWorkspace, usesCurrentWorkspace: true };
  }
  if (!isAbsolute(requested)) {
    if (!normalizedWorkspace) {
      throw new Error("相对工作目录需要先打开一个 VS Code 工作区。");
    }
    return { root: normalizedWorkspace, scope: requested, usesCurrentWorkspace: true };
  }

  const absolute = resolve(requested);
  if (normalizedWorkspace && ktcIsPathInsideWorkspace(normalizedWorkspace, absolute)) {
    return {
      root: normalizedWorkspace,
      scope: absolute === normalizedWorkspace ? undefined : absolute,
      usesCurrentWorkspace: true,
    };
  }
  return { root: absolute, usesCurrentWorkspace: false };
}
