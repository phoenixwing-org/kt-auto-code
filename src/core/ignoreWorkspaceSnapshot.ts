import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { gitIgnoreFile, parseDotIgnoreText, phoenixIgnoreFile } from "./dotIgnore.js";
import type { KtcIgnoreWorkspaceSnapshot } from "./ignoreRecommendation.js";

export interface KtcIgnoreWorkspaceSnapshotOptions {
  maxDepth?: number;
  maxEntries?: number;
  phoenixIgnorePatterns?: readonly string[];
}

const KTC_ANALYSIS_NO_DESCEND_DIRS = new Set([
  ".git", ".hg", ".svn", "node_modules",
  "build", "build_debug", "build_release", "debug", "release", "Debug", "Release",
  "out", "bin", "obj", "dist", ".cache", "_build",
  "intel_a", "win_b64", "Objects", "ToolsData",
]);

function isAnalysisProcessDirectory(name: string): boolean {
  return KTC_ANALYSIS_NO_DESCEND_DIRS.has(name) || /^(?:build-|cmake-build-)/i.test(name);
}

function normalizeRelative(root: string, path: string, directory: boolean): string {
  const value = relative(root, path).replace(/\\/g, "/");
  return directory ? `${value}/` : value;
}

function readIgnorePatterns(path: string): string[] {
  if (!existsSync(path)) return [];
  try {
    return parseDotIgnoreText(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

export function ktcCollectGitTrackedPaths(root: string): readonly string[] {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) return [];
  return result.stdout.split("\0").map((path) => path.trim()).filter(Boolean);
}

export function ktcCollectIgnoreWorkspaceSnapshot(
  root: string,
  options: KtcIgnoreWorkspaceSnapshotOptions = {},
): KtcIgnoreWorkspaceSnapshot {
  const maxDepth = Math.max(1, options.maxDepth ?? 5);
  const maxEntries = Math.max(100, options.maxEntries ?? 20_000);
  const paths: string[] = [];
  let truncated = false;

  function walk(directory: string, depth: number): void {
    if (truncated || depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (paths.length >= maxEntries) {
        truncated = true;
        return;
      }
      const fullPath = join(directory, entry.name);
      try {
        if (entry.isSymbolicLink() || lstatSync(fullPath).isSymbolicLink()) continue;
      } catch {
        continue;
      }
      if (entry.isDirectory()) {
        paths.push(normalizeRelative(root, fullPath, true));
        if (!isAnalysisProcessDirectory(entry.name) && !entry.name.startsWith(".")) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        paths.push(normalizeRelative(root, fullPath, false));
      }
    }
  }

  walk(root, 1);
  const phoenixPatterns = options.phoenixIgnorePatterns
    ? [...options.phoenixIgnorePatterns]
    : readIgnorePatterns(phoenixIgnoreFile(root));
  const existingPatterns = [...new Set([
    ...readIgnorePatterns(gitIgnoreFile(root)),
    ...phoenixPatterns,
  ])];
  return {
    paths,
    trackedPaths: ktcCollectGitTrackedPaths(root),
    existingPatterns,
    truncated,
  };
}
