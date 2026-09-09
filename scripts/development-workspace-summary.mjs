import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function formatDevelopmentWorkspaceStatus({ label, root, version, gitStatusOutput }) {
  const lines = String(gitStatusOutput ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const branch = lines[0]?.startsWith("## ") ? lines[0].slice(3) : "状态不可用";
  const changes = lines[0]?.startsWith("## ") ? lines.length - 1 : lines.length;
  const worktree = changes === 0 ? "工作树干净" : `未提交 ${changes} 项`;
  return `${label}: ${root} · v${version || "unknown"} · Git ${branch} · ${worktree}`;
}

export function readDevelopmentWorkspaceStatus(label, root) {
  const resolvedRoot = resolve(root);
  let version = "unknown";
  try {
    version = String(JSON.parse(readFileSync(resolve(resolvedRoot, "package.json"), "utf8")).version ?? "unknown");
  } catch {
    // Keep the summary useful even when a non-package workspace is inspected.
  }
  const git = spawnSync("git", ["-C", resolvedRoot, "status", "--short", "--branch"], {
    encoding: "utf8",
  });
  const gitStatusOutput = git.status === 0 && !git.error
    ? git.stdout
    : "";
  return formatDevelopmentWorkspaceStatus({ label, root: resolvedRoot, version, gitStatusOutput });
}
