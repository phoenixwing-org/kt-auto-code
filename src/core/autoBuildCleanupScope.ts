import type { KtcCleanupDialogTarget } from "./cleanupContracts.js";

/** An explicit document directory wins; an empty field uses the incoming directory.
 * ROOT_DIR and third-party paths are never fallbacks for this scope. */
export function ktcAutoBuildCleanupDirectory(configured: string | undefined, incoming: string): string {
  return configured?.trim() || incoming.trim();
}

export function ktcAutoBuildCleanupTitle(directory: string): string {
  const path = directory.trim();
  if (!path) return "清理 · 未传入工作目录";
  const normalized = path.replace(/\\/gu, "/").replace(/\/+$/u, "");
  const split = normalized.lastIndexOf("/");
  const label = split >= 0 && split < normalized.length - 1
    ? `${normalized.slice(split + 1)} @ ${normalized.slice(0, split) || "/"}` : path;
  return `清理 · ${label}`;
}

/** Environment/project targets are opt-in, including after a mode switch. */
export function ktcSelectCurrentDirectoryCleanupTargets(
  targets: readonly KtcCleanupDialogTarget[], modeId: string,
): KtcCleanupDialogTarget[] {
  const currentId = modeId === "rules" ? "rules:working" : modeId === "git-force" ? "git:working" : "cmake:shared";
  return targets.map((target) => ({ ...target, selected: target.id === currentId && !target.disabled
    && target.supportedModeIds?.includes(modeId) === true }));
}
