import { describeCadFilename, type KtcCadFilenameHint } from "./cadFilename.js";

export interface KtcCadWorkspaceEntry extends KtcCadFilenameHint {
  readonly relativePath: string;
}

export function describeCadWorkspaceFiles(relativePaths: readonly string[]): KtcCadWorkspaceEntry[] {
  return relativePaths
    .map((relativePath) => {
      const hint = describeCadFilename(relativePath);
      return hint ? { relativePath, ...hint } : undefined;
    })
    .filter((entry): entry is KtcCadWorkspaceEntry => Boolean(entry))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, {
      numeric: true,
      sensitivity: "base",
    }));
}
