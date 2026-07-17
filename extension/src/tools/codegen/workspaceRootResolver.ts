import { isAbsolute, relative, resolve } from "node:path";

/** 为文档选择最深的包含它的 Workspace Folder；外部文档可回退到当前主根。 */
export function ktcResolveCodegenWorkspaceRoot(
  documentPath: string,
  workspaceRoots: readonly string[],
  fallback?: string,
): string | undefined {
  const document = resolve(documentPath);
  const matches = workspaceRoots
    .map((root) => resolve(root))
    .filter((root) => {
      const path = relative(root, document);
      return path === "" || (!path.startsWith("..") && !isAbsolute(path));
    })
    .sort((left, right) => right.length - left.length);
  return matches[0] ?? fallback;
}
