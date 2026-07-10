import * as vscode from "vscode";
import { resolveIgnorePatterns } from "../../../../src/dotIgnore.js";
import {
  countConvertibleRows,
  formatFileEncodingReport,
  runFileEncodingWalk,
  type FileEncodingWalkReport,
} from "../../../../src/fileEncodingWalk.js";
import {
  detectedEncodingLabel,
  expectedEncodingLabel,
} from "../../../../src/fileEncoding.js";
import type { EncodingFileResultSummary, ToolRunContext } from "../types.js";
import { getFileScope, isScopeEmpty, scopeSummary } from "../../scopeOptions.js";

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

export async function scanEncodings(root: string): Promise<FileEncodingWalkReport> {
  return runFileEncodingWalk({
    root,
    scope: getFileScope(),
    ignorePatterns: resolveIgnorePatterns(root),
    convert: false,
  });
}

export async function convertEncodings(
  root: string,
): Promise<FileEncodingWalkReport | undefined> {
  const preview = await scanEncodings(root);
  const counts = countConvertibleRows(preview.results);

  if (counts.total === 0) {
    const unsupported = preview.results.filter((r) => r.row.status === "unsupported").length;
    if (unsupported > 0) {
      const ok = await vscode.window.showWarningMessage(
        `发现 ${unsupported} 个无法自动转换的文件（如 UTF-32 / unknown），仅可报告。是否查看预检结果？`,
        { modal: true },
        "确定",
      );
      if (ok !== "确定") return undefined;
    }
    return preview;
  }

  let msg = `将把 ${counts.total} 个文件转为 UTF-8 无 BOM：`;
  const parts: string[] = [];
  if (counts.gbk) parts.push(`GBK ${counts.gbk}`);
  if (counts.bom) parts.push(`去 BOM ${counts.bom}`);
  if (counts.utf16) parts.push(`UTF-16 ${counts.utf16}`);
  msg += ` ${parts.join("、")}。`;
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
    ignorePatterns: resolveIgnorePatterns(root),
    convert: true,
  });
}

export async function openEncodingFile(fullPath: string): Promise<void> {
  const uri = vscode.Uri.file(fullPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: true });
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
    if (action === "scan") {
      const report = await scanEncodings(ctx.workspaceRoot);
      logEncodingReport(report, false, ctx.log);
      ctx.postState({
        status: "done",
        message:
          report.issueFiles === 0
            ? `已扫描 ${report.scanned} 个文件，编码均符合 UTF-8 无 BOM。`
            : `已扫描 ${report.scanned} 个文件，${report.issueFiles} 个不符合期望。`,
        encodingResults: reportToEncodingResults(report),
        scanned: report.scanned,
        issueFiles: report.issueFiles,
      });
      return;
    }

    if (action === "convert") {
      const report = await convertEncodings(ctx.workspaceRoot);
      if (!report) {
        ctx.postState({ status: "idle", message: "已取消转换。" });
        return;
      }
      if (report.convertedFiles === 0) {
        ctx.postState({
          status: "done",
          message: "没有可自动转换的文件。",
          encodingResults: reportToEncodingResults(report),
          scanned: report.scanned,
          issueFiles: report.issueFiles,
        });
        return;
      }
      logEncodingReport(report, true, ctx.log);
      const rescan = await scanEncodings(ctx.workspaceRoot);
      ctx.postState({
        status: "done",
        message: `已转换 ${report.convertedFiles} 个文件为 UTF-8 无 BOM。`,
        encodingResults: reportToEncodingResults(rescan),
        scanned: rescan.scanned,
        issueFiles: rescan.issueFiles,
        fixedFiles: report.convertedFiles,
      });
      if (report.convertedFiles > 0) {
        void vscode.window.showInformationMessage(
          `Kt Auto Code：已转换 ${report.convertedFiles} 个文件为 UTF-8 无 BOM。`,
        );
      }
      return;
    }

    ctx.postState({ status: "error", message: `未知操作：${action}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.log(`错误: ${msg}`);
    ctx.postState({ status: "error", message: msg });
  }
}
