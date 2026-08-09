import { relative, resolve } from "node:path";
import { pnwNormalizeWorkspacePath } from "@phoenix-wing/code-core";

/** Node path adapter; relative path safety is owned by Wing code-core. */
export function ktcIsPathInsideWorkspace(root: string, target: string): boolean {
  const relation = relative(resolve(root), resolve(target)).replace(/\\/g, "/");
  return relation === "" || pnwNormalizeWorkspacePath(relation) !== null;
}
