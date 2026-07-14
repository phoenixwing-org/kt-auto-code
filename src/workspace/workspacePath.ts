import { isAbsolute, relative, resolve, sep } from "node:path";

/** Lexically checks that a path stays inside the selected workspace root. */
export function ktcIsPathInsideWorkspace(root: string, target: string): boolean {
  const relation = relative(resolve(root), resolve(target));
  return relation === ""
    || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}
