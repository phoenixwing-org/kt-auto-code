import * as vscode from "vscode";
import { relative, resolve } from "node:path";
import { ktcBuildRenameResultViewModel } from "./core/renameResultViewModel.js";
import type {
  KtcSearchReplaceRequest,
  KtcSearchReplaceRunResult,
} from "./core/searchReplaceContracts.js";
import {
  runWorkspaceRename,
  type WorkspaceRenameOptions,
  type WorkspaceRenameReport,
} from "./core/workspaceRename.js";
import { ktcRunSearchReplaceWorkflow } from "./core/searchReplaceWorkflow.js";
import { logOutput } from "./output.js";
import { ktcOpenWorkspaceResource } from "./workspaceResource.js";
import { getWorkspaceRoot } from "./workspace.js";
import { resolveWorkspaceIgnorePatterns } from "./ignoreConfig.js";
import { ktcResolveSearchReplaceLocation } from "./searchReplaceLocation.js";

export class KtcSearchReplaceController {
  private latestResultFiles: readonly string[] = [];
  private latestResultRoot: string | undefined;
  private latestViewModel: ReturnType<typeof ktcBuildRenameResultViewModel> | undefined;

  open(): void { void vscode.commands.executeCommand("ktAutoCode.codeRename.openAdvanced"); }

  resultModel(): ReturnType<typeof ktcBuildRenameResultViewModel> | undefined {
    return this.latestViewModel;
  }

  async openResult(rowId: string): Promise<void> {
    const model = this.latestViewModel;
    const row = model?.rows.find((item) => item.id === rowId);
    if (!model || !row) return;
    await ktcOpenWorkspaceResource({
      root: model.root,
      target: row.openPath,
      kind: row.level === "dir" ? "directory" : "text",
      line: row.openLine,
      highlightTerms: row.editorHighlightTerms,
    });
  }

  resultFiles(workspaceRoot: string): readonly string[] {
    return this.latestResultRoot && resolve(this.latestResultRoot) === resolve(workspaceRoot) ? this.latestResultFiles : [];
  }

  async run(request: KtcSearchReplaceRequest, apply: boolean): Promise<KtcSearchReplaceRunResult> {
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
        includePaths: request.includePaths,
        includeIgnored: request.includeIgnored ?? false,
        ignorePatterns: resolveWorkspaceIgnorePatterns(location.root, {
          builtInIgnoreEnabled: request.builtInIgnoreEnabled ?? true,
          gitIgnoreEnabled: request.gitIgnoreEnabled ?? true,
          customIgnoreEnabled: request.customIgnoreEnabled ?? request.pluginIgnoreEnabled ?? false,
        }),
        useBuiltInIgnore: request.builtInIgnoreEnabled ?? true,
        apply: false,
        searchOnly: !apply,
      };
      const result = await ktcRunSearchReplaceWorkflow(apply, {
        preview: () => runWorkspaceRename(options),
        confirm: () => this.confirmWrite(request),
        apply: () => runWorkspaceRename({ ...options, apply: true, searchOnly: false }),
        report: (report) => {
          this.showReport(report, options);
        },
      });
      return result;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      logOutput(`[搜索替换] ${text}`);
      return "error";
    }
  }

  private showReport(
    report: WorkspaceRenameReport,
    options: WorkspaceRenameOptions,
  ): void {
    logOutput(formatRenameLog(report, options));
    this.latestResultRoot = report.root;
    this.latestResultFiles = [...new Set(report.hits
      .filter((hit) => hit.level === "text" || hit.level === "file")
      .map((hit) => report.applied
        ? relative(report.root, hit.plannedFullPath).replace(/\\/g, "/")
        : hit.relativePath))].sort();
    this.latestViewModel = ktcBuildRenameResultViewModel(report);
  }

  private async confirmWrite(request: KtcSearchReplaceRequest): Promise<boolean> {
    const workingDirectory = request.scopeLabel || request.scope?.trim() || "当前 VS Code 工作区";
    const answer = await vscode.window.showWarningMessage(
      request.rules && request.rules.length > 1
        ? `将写盘执行 ${request.rules.length} 条搜索替换规则。\n工作目录：${workingDirectory}\n\n建议先搜索并提交 Git。`
        : `将写盘执行搜索替换：\n${request.oldName} → ${request.newName}\n工作目录：${workingDirectory}\n\n建议先搜索并提交 Git。`,
      { modal: true },
      "执行替换",
    );
    return answer === "执行替换";
  }
}

function formatRenameLog(report: WorkspaceRenameReport, options: WorkspaceRenameOptions): string {
  const summary = report.summary;
  return [
    `[搜索替换] ${report.applied ? "已写盘" : options.searchOnly ? "搜索" : "预检"}：${options.rules?.length ?? 1} 条规则`,
    `目录 ${summary.directories}，文件 ${summary.files}，文本文件 ${summary.textFiles}，匹配 ${summary.replacements}，跳过 ${summary.skipped}，错误 ${summary.errors}`,
  ].join("\n");
}
