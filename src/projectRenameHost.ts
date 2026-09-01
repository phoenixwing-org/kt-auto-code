import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { runWorkspaceRename, type WorkspaceRenameReport } from "./core/workspaceRename.js";
import type { KtcProjectRenameAnalysisReport } from "./tools/projectRename/contracts.js";
import {
  ktcProjectRenameApplyOptions,
  ktcProjectRenamePreviewDrift,
} from "./tools/projectRename/execution.js";

const ktcExecFile = promisify(execFile);

export type KtcProjectRenameGitState = "clean" | "dirty" | "not-repository" | "unavailable";

export interface KtcProjectRenameHostPort {
  preview(report: KtcProjectRenameAnalysisReport): WorkspaceRenameReport;
  apply(report: KtcProjectRenameAnalysisReport): WorkspaceRenameReport;
  gitState(root: string): Promise<KtcProjectRenameGitState>;
  renameRoot(sourcePath: string, destinationPath: string): Promise<void>;
}

export class KtcProjectRenameHost implements KtcProjectRenameHostPort {
  preview(report: KtcProjectRenameAnalysisReport): WorkspaceRenameReport {
    return runWorkspaceRename(ktcProjectRenameApplyOptions(report));
  }

  apply(report: KtcProjectRenameAnalysisReport): WorkspaceRenameReport {
    const options = ktcProjectRenameApplyOptions(report);
    const latestPreview = runWorkspaceRename(options);
    if (latestPreview.summary.errors > 0) throw new Error("执行瞬间的预检发现路径冲突。");
    const drift = ktcProjectRenamePreviewDrift(report, latestPreview);
    if (drift) throw new Error(drift);
    return runWorkspaceRename({ ...options, apply: true });
  }

  async gitState(root: string): Promise<KtcProjectRenameGitState> {
    try {
      const result = await ktcExecFile("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=normal"], {
        timeout: 10_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      return result.stdout.trim() ? "dirty" : "clean";
    } catch (error) {
      const detail = ktcGitErrorText(error);
      return detail.includes("not a git repository") ? "not-repository" : "unavailable";
    }
  }

  async renameRoot(sourcePath: string, destinationPath: string): Promise<void> {
    const sourceUri = vscode.Uri.file(sourcePath);
    const destinationUri = vscode.Uri.file(destinationPath);
    const sourceStat = await vscode.workspace.fs.stat(sourceUri);
    if ((sourceStat.type & vscode.FileType.Directory) === 0) throw new Error("分析根目录已不再是文件夹。");
    if ((sourceStat.type & vscode.FileType.SymbolicLink) !== 0) throw new Error("符号链接根目录不能在此改名。");
    if (await ktcProjectRenameUriExists(destinationUri)) throw new Error(`目标目录已经存在：${destinationPath}`);
    await vscode.workspace.fs.rename(sourceUri, destinationUri, { overwrite: false });
  }
}

async function ktcProjectRenameUriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") return false;
    throw error;
  }
}

function ktcGitErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error).toLocaleLowerCase("en-US");
  const candidate = error as { readonly message?: unknown; readonly stderr?: unknown };
  return `${String(candidate.message ?? "")}\n${String(candidate.stderr ?? "")}`.toLocaleLowerCase("en-US");
}
