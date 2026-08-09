import * as vscode from "vscode";
import {
  countConvertibleRows,
  formatFileEncodingReport,
  runFileEncodingWalk,
  type FileEncodingWalkReport,
} from "../../core/fileEncodingWalk.js";
import {
  detectedEncodingLabel,
  encodingTargetPolicySummary,
  expectedEncodingLabel,
  type EncodingTargetPolicy,
} from "../../core/fileEncoding.js";
import type { EncodingFileResultSummary, ToolRunContext } from "../types.js";
import { getFileScope, isScopeEmpty, scopeSummary } from "../../scopeOptions.js";
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import { ktcResolveWorkspaceFileScope, type KtcWorkspaceFileScope } from "../../worksets.js";
import { ktcClearEditorMatchHighlights } from "../../workbench/editorMatchHighlight.js";
import { getEncodingTargetPolicy } from "./options.js";

export function reportToEncodingResults(
  report: FileEncodingWalkReport,
): EncodingFileResultSummary[] {
  return report.results.map(({ row, converted }) => ({
    file: row.relativePath.split("/").pop() ?? row.relativePath,
    relativePath: row.relativePath,
    fullPath: row.filePath,
    detected: detectedEncodingLabel(row.detected),
    expected: expectedEncodingLabel(row.expected),
    status: row.status,
    suggestedAction: row.suggestedAction,
    detail: row.bomHex ? `BOM ${row.bomHex} · ${row.confidence}` : row.confidence,
    converted,
  }));
}

export function logEncodingReport(
  report: FileEncodingWalkReport,
  convert: boolean,
  log: (text: string) => void,
): void {
  log(formatFileEncodingReport(report, convert));
}

export async function scanEncodings(
  root: string,
  workspaceScope?: KtcWorkspaceFileScope,
  targetPolicy: EncodingTargetPolicy = getEncodingTargetPolicy(),
  pluginIgnoreEnabled = true,
): Promise<FileEncodingWalkReport> {
  return runFileEncodingWalk({
    root,
    scope: getFileScope(),
    ignorePatterns: resolveWorkspaceIgnorePatterns(root, pluginIgnoreEnabled),
    includePaths: workspaceScope?.relativeFiles,
    targetPolicy,
    convert: false,
  });
}

export async function convertEncodings(
  root: string,
  workspaceScope?: KtcWorkspaceFileScope,
  pluginIgnoreEnabled = true,
): Promise<FileEncodingWalkReport | undefined> {
  const targetPolicy = getEncodingTargetPolicy();
  const preview = await scanEncodings(root, workspaceScope, targetPolicy, pluginIgnoreEnabled);
  const counts = countConvertibleRows(preview.results);

  if (counts.total === 0) {
    return preview;
  }

  const parts = Object.entries(counts.actions)
    .map(([action, count]) => `${action} ${count}`);
  let msg = `将按当前项目策略转换 ${counts.total} 个文件：${parts.join("、")}。`;
  msg += ` 策略：${encodingTargetPolicySummary(targetPolicy)}。`;
  if (counts.utf16 > 0) {
    msg += " 含 UTF-16 整文件重编码，请确认已备份或已提交 Git。";
  }
  msg += " 是否继续？";

  const ok = await vscode.window.showWarningMessage(msg, { modal: true }, "转换");
  if (ok !== "转换") {
    return undefined;
  }

  return runFileEncodingWalk({
    root,
    scope: getFileScope(),
    ignorePatterns: resolveWorkspaceIgnorePatterns(root, pluginIgnoreEnabled),
    includePaths: workspaceScope?.relativeFiles,
    targetPolicy,
    convert: true,
  });
}

export async function openEncodingFile(fullPath: string): Promise<void> {
  const uri = vscode.Uri.file(fullPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: true });
  ktcClearEditorMatchHighlights(editor);
}

export async function runEncodingFixAction(
  action: string,
  ctx: ToolRunContext,
): Promise<void> {
  if (!ctx.workspaceRoot) {
    ctx.postState({
      status: "error",
      message: "请先打开工作区文件夹。",
    });
    return;
  }

  const scope = getFileScope();
  if (isScopeEmpty(scope, true)) {
    ctx.postState({
      status: "error",
      message: "请至少勾选一种扫描范围（头文件 / 源文件 / .md）。",
    });
    return;
  }

  ctx.postState({
    status: "running",
    message: action === "convert" ? `正在转换（${scopeSummary(scope)}）…` : `正在预检编码（${scopeSummary(scope)}）…`,
  });

  try {
    const workspaceScope = await ktcResolveWorkspaceFileScope(vscode.Uri.file(ctx.workspaceRoot), ctx.workspaceFileScopeId);
    ctx.postState({
      status: "running",
      message: action === "convert"
        ? `正在转换（${workspaceScope.label}；${scopeSummary(scope)}）…`
        : `正在预检编码（${workspaceScope.label}；${scopeSummary(scope)}）…`,
    });
    if (action === "scan") {
      const report = await scanEncodings(ctx.workspaceRoot, workspaceScope, undefined, ctx.pluginIgnoreEnabled);
      logEncodingReport(report, false, ctx.log);
      ctx.postState({
        status: "done",
        message:
          report.issueFiles === 0
            ? `已扫描 ${report.scanned} 个文件，编码均符合项目目标（${encodingTargetPolicySummary(report.targetPolicy)}）。`
            : `已扫描 ${report.scanned} 个文件，${report.issueFiles} 个不符合期望。`,
        encodingResults: reportToEncodingResults(report),
        scanned: report.scanned,
        issueFiles: report.issueFiles,
      });
      return;
    }

    if (action === "convert") {
      const report = await convertEncodings(ctx.workspaceRoot, workspaceScope, ctx.pluginIgnoreEnabled);
      if (!report) {
        ctx.postState({ status: "idle", message: "已取消转换。" });
        return;
      }
      if (report.convertedFiles === 0) {
        ctx.postState({
          status: "done",
          message: "没有可无损自动转换的文件；其余不符合项仅报告。",
          encodingResults: reportToEncodingResults(report),
          scanned: report.scanned,
          issueFiles: report.issueFiles,
        });
        return;
      }
      logEncodingReport(report, true, ctx.log);
      const rescan = await scanEncodings(ctx.workspaceRoot, workspaceScope, report.targetPolicy, ctx.pluginIgnoreEnabled);
      ctx.postState({
        status: "done",
        message: `已按项目编码目标转换 ${report.convertedFiles} 个文件。`,
        encodingResults: reportToEncodingResults(rescan),
        scanned: rescan.scanned,
        issueFiles: rescan.issueFiles,
        fixedFiles: report.convertedFiles,
      });
      return;
    }

    ctx.postState({ status: "error", message: `未知操作：${action}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.log(`错误: ${msg}`);
    ctx.postState({ status: "error", message: msg });
  }
}
