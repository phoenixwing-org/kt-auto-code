// copyright   Shanghai Kuntai Software Technology Co., Ltd. 2025
// license     MIT

"use strict";

const { readdirSync, statSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const KtcFormatExtensions = new Set([".c", ".cc", ".cpp", ".cxx", ".h", ".hh", ".hpp", ".hxx"]);
const KtcExcludedDirectories = new Set([
  ".git", ".idea", ".obsidian", ".pnpm-store", ".vs", ".vscode", "CATEnv", "CNext",
  "Debug", "ImportedInterfaces", "LocalGenerated", "Objects", "ProtectedGenerated", "Release",
  "ToolsData", "build", "intel_a", "node_modules", "various", "win_b64",
]);

function KtcReadProject(args) {
  const index = args.indexOf("--project");
  if (index < 0 || !args[index + 1]) throw new Error("Usage: pnw-clang-format-runner.cjs --project <absolute-path>");
  const project = path.resolve(args[index + 1]);
  if (!statSync(project).isDirectory()) throw new Error(`Project is not a directory: ${project}`);
  if (!statSync(path.join(project, ".clang-format")).isFile()) throw new Error(`Missing .clang-format: ${project}`);
  return project;
}

function KtcCollectFiles(project) {
  const files = [];
  const directories = [project];
  while (directories.length > 0) {
    const directory = directories.pop();
    const entries = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!KtcExcludedDirectories.has(entry.name)) directories.push(absolute);
      } else if (entry.isFile() && KtcFormatExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(absolute);
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function KtcRun() {
  const project = KtcReadProject(process.argv.slice(2));
  const files = KtcCollectFiles(project);
  const program = process.platform === "win32" ? "clang-format.exe" : "clang-format";
  console.log(`[Clang Format] project=${project} files=${files.length} program=${program}`);
  for (const file of files) {
    const relative = path.relative(project, file) || path.basename(file);
    console.log(`[Clang Format] formatting=${relative}`);
    const result = spawnSync(program, ["-style=file", "-i", file], {
      cwd: project,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`clang-format failed for ${relative}: exit ${result.status ?? "unknown"}`);
  }
  console.log(`[Clang Format] completed files=${files.length}`);
}

try {
  KtcRun();
} catch (error) {
  console.error(`[Clang Format][error] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
