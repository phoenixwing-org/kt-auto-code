import * as vscode from "vscode";
import { ktcBuildRenameResultViewModel } from "../../src/renameResultViewModel.js";
import type {
  KtcSearchReplaceRequest,
  KtcSearchReplaceRunResult,
} from "../../src/searchReplaceContracts.js";
import {
  runWorkspaceRename,
  type WorkspaceRenameOptions,
  type WorkspaceRenameReport,
} from "../../src/workspaceRename.js";
import { logOutput } from "./output.js";
import { CodeRenamePanel } from "./workbench/codeRenamePanel.js";
import { getWorkspaceRoot } from "./workspace.js";
import { resolveWorkspaceIgnorePatterns } from "./ignoreConfig.js";

export class KtcSearchReplaceController {
  constructor(private readonly extensionUri: vscode.Uri) {}

  open(): void {
    CodeRenamePanel.open(this.extensionUri);
  }

  async run(request: KtcSearchReplaceRequest, apply: boolean): Promise<KtcSearchReplaceRunResult> {
    const panel = await CodeRenamePanel.show(this.extensionUri);
    if (!panel) return "error";
    const root = getWorkspaceRoot();
    if (!root) {
      panel.showError("请先打开一个工作区文件夹。");
      return "error";
    }
    try {
      const options: WorkspaceRenameOptions = {
        root,
        oldName: request.oldName,
        newName: request.newName,
        rules: request.rules,
        preserveCase: request.preserveCase,
        levels: request.levels,
        scope: request.scope?.trim(),
        includeIgnored: request.includeIgnored ?? false,
        ignorePatterns: resolveWorkspaceIgnorePatterns(root),
        apply: false,
      };
      if (apply) {
        panel.showRunning(false);
        const preflight = runWorkspaceRename(options);
        logOutput(formatRenameLog(preflight, options));
        panel.showReport(ktcBuildRenameResultViewModel(preflight));
        if (preflight.summary.errors > 0) {
          panel.showError("预检发现目标冲突，未执行任何写盘。");
          return "error";
        }
        if (!await this.confirmWrite(request)) return "cancelled";
      }

      panel.showRunning(apply);
      const report = runWorkspaceRename({ ...options, apply });
      logOutput(formatRenameLog(report, options));
      panel.showReport(ktcBuildRenameResultViewModel(report));
      if (apply && (!report.applied || report.summary.errors > 0)) return "error";
      return "completed";
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      logOutput(`[搜索替换] ${text}`);
      panel.showError(text);
      return "error";
    }
  }

  private async confirmWrite(request: KtcSearchReplaceRequest): Promise<boolean> {
    const answer = await vscode.window.showWarningMessage(
      request.rules && request.rules.length > 1
        ? `将写盘执行 ${request.rules.length} 条搜索替换规则。\n\n建议先预览并提交 Git。`
        : `将写盘执行搜索替换：\n${request.oldName} → ${request.newName}\n\n建议先预览并提交 Git。`,
      { modal: true },
      "执行替换",
    );
    return answer === "执行替换";
  }
}

function formatRenameLog(report: WorkspaceRenameReport, options: WorkspaceRenameOptions): string {
  const summary = report.summary;
  return [
    `[搜索替换] ${report.applied ? "已写盘" : "预览"}：${options.rules?.length ?? 1} 条规则`,
    `目录 ${summary.directories}，文件 ${summary.files}，文本文件 ${summary.textFiles}，替换 ${summary.replacements}，跳过 ${summary.skipped}，错误 ${summary.errors}`,
  ].join("\n");
}
