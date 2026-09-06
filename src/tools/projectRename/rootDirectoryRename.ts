import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { ktcRenamePathSegmentProblem } from "../../core/renamePathSegment.js";

export interface KtcProjectRenameRootRenamePlan {
  readonly allowed: boolean;
  readonly sourcePath: string;
  readonly destinationPath?: string;
  readonly reason: string;
}

/**
 * 根目录改名只允许在同一父目录内进行，并且不得移动当前工作区根目录，
 * 也不得移动包含当前工作区根目录的父目录。
 */
export function ktcPlanProjectRenameRootDirectory(
  root: string,
  suggestedName: string,
  workspaceRoots: readonly string[],
): KtcProjectRenameRootRenamePlan {
  const sourcePath = resolve(root);
  const normalizedName = suggestedName.trim();
  if (normalizedName !== suggestedName
    || ktcRenamePathSegmentProblem(normalizedName)
    || basename(normalizedName) !== normalizedName) {
    return { allowed: false, sourcePath, reason: "建议名称不是安全的单层目录名。" };
  }
  if (basename(sourcePath) === normalizedName) {
    return { allowed: false, sourcePath, reason: "仓库根目录已经使用建议名称。" };
  }
  for (const workspaceRoot of workspaceRoots) {
    if (ktcPathContains(sourcePath, resolve(workspaceRoot))) {
      return {
        allowed: false,
        sourcePath,
        reason: "当前 VS Code 工作区根目录或其父目录不能在此改名；请关闭工作区后再处理。",
      };
    }
  }
  return {
    allowed: true,
    sourcePath,
    destinationPath: resolve(dirname(sourcePath), normalizedName),
    reason: "将只重命名仓库根目录；不会修改目录内部内容。",
  };
}

function ktcPathContains(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}
