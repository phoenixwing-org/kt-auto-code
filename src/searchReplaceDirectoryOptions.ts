import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
export interface KtcSearchReplaceDirectoryOption {
  value: string;
  label: string;
  kind: "current" | "workspace" | "git" | "directory";
}

export interface KtcWorkspaceDirectory {
  readonly name: string;
  readonly fsPath: string;
}

const SKIPPED_NAMES = new Set(["node_modules", "dist", "out", "build", "coverage"]);

export function ktcListSearchReplaceDirectoryOptions(
  folders: readonly KtcWorkspaceDirectory[],
): readonly KtcSearchReplaceDirectoryOption[] {
  const firstRoot = folders[0] ? resolve(folders[0].fsPath) : undefined;
  const options: KtcSearchReplaceDirectoryOption[] = [];
  for (const [folderIndex, folder] of folders.entries()) {
    const root = resolve(folder.fsPath);
    options.push({
      value: folderIndex === 0 ? "" : root,
      label: folderIndex === 0 ? `当前目录 · ${folder.name}` : `工作区 · ${folder.name}`,
      kind: folderIndex === 0 ? "current" : "workspace",
    });
    let children: Array<{ name: string; git: boolean }> = [];
    try {
      children = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIPPED_NAMES.has(entry.name))
        .map((entry) => ({ name: entry.name, git: existsSync(join(root, entry.name, ".git")) }))
        .sort((left, right) => Number(right.git) - Number(left.git) || left.name.localeCompare(right.name));
    } catch {
      children = [];
    }
    for (const child of children) {
      const absolute = join(root, child.name);
      const value = firstRoot && root === firstRoot ? relative(firstRoot, absolute).replace(/\\/g, "/") : absolute;
      options.push({
        value,
        label: `${child.git ? "Git" : "目录"} · ${folders.length > 1 ? `${folder.name} / ` : ""}${child.name}`,
        kind: child.git ? "git" : "directory",
      });
    }
  }
  return options;
}
