import type ts from "typescript";

export function createLocalWingTypecheckHost(
  options: ts.CompilerOptions,
  packages: Map<string, { manifest: Record<string, unknown>; packageRoot: string }>,
): ts.CompilerHost;
export function runTypecheck(repoRoot?: string): number;
