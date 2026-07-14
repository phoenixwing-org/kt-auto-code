import * as vscode from "vscode";
import { ktcBuildRenameResultViewModel } from "../../src/renameResultViewModel.js";
import { loadDotIgnore } from "../../src/dotIgnore.js";
import type {
  KtcSearchReplaceRequest,
  KtcSearchReplaceRunResult,
} from "../../src/searchReplaceContracts.js";
import {
  runWorkspaceRename,
  type WorkspaceRenameOptions,
  type WorkspaceRenameReport,
} from "../../src/workspaceRename.js";
import { ktcRunSearchReplaceWorkflow } from "../../src/searchReplaceWorkflow.js";
import { logOutput } from "./output.js";
import { CodeRenamePanel } from "./workbench/codeRenamePanel.js";
import { getWorkspaceRoot } from "./workspace.js";
import { resolveWorkspaceIgnorePatterns } from "./ignoreConfig.js";
import { ktcResolveSearchReplaceLocation } from "./searchReplaceLocation.js";

export class KtcSearchReplaceController {
  constructor(private readonly extensionUri: vscode.Uri) {}

  open(): void {
    CodeRenamePanel.open(this.extensionUri);
  }

  async run(request: KtcSearchReplaceRequest, apply: boolean): Promise<KtcSearchReplaceRunResult> {
    const panel = await CodeRenamePanel.show(this.extensionUri);
    if (!panel) return "error";
    try {
      const workspaceRoot = getWorkspaceRoot();
      const location = ktcResolveSearchReplaceLocation(workspaceRoot, request.scope);
      const options: WorkspaceRenameOptions = {
        root: location.root,
        oldName: request.oldName,
        newName: request.newName,
        rules: request.rules,
        defaultEncoding: request.defaultEncoding,
        preserveCase: request.preserveCase,
        levels: request.levels,
        scope: location.scope,
        includeIgnored: request.includeIgnored ?? false,
        ignorePatterns: location.usesCurrentWorkspace && workspaceRoot
          ? resolveWorkspaceIgnorePatterns(workspaceRoot)
          : loadDotIgnore(location.root),
        apply: false,
      };
      panel.showRunning(false);
      const result = await ktcRunSearchReplaceWorkflow(apply, {
        preview: () => runWorkspaceRename(options),
        confirm: () => this.confirmWrite(request),
        apply: () => {
          panel.showRunning(true);
          return runWorkspaceRename({ ...options, apply: true });
        },
        report: (report) => {
          this.showReport(panel, report, options);
        },
      });
      if (result === "blocked") {
        panel.showError("预检发现目标冲突，未执行任何写盘。");
      }
      return result;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      logOutput(`[搜索替换] ${text}`);
      panel.showError(text);
      return "error";
    }
  }

  private showReport(
    panel: CodeRenamePanel,
    report: WorkspaceRenameReport,
    options: WorkspaceRenameOptions,
  ): void {
    logOutput(formatRenameLog(report, options));
    panel.showReport(ktcBuildRenameResultViewModel(report), options.ignorePatterns?.length ?? 0);
  }

  private async confirmWrite(request: KtcSearchReplaceRequest): Promise<boolean> {
    const workingDirectory = request.scope?.trim() || "当前 VS Code 工作区";
    const answer = await vscode.window.showWarningMessage(
      request.rules && request.rules.length > 1
        ? `将写盘执行 ${request.rules.length} 条搜索替换规则。\n工作目录：${workingDirectory}\n\n建议先预览并提交 Git。`
        : `将写盘执行搜索替换：\n${request.oldName} → ${request.newName}\n工作目录：${workingDirectory}\n\n建议先预览并提交 Git。`,
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
