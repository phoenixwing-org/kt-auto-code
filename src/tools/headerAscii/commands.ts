import * as vscode from "vscode";
import { relative } from "node:path";
import {
  formatWorkspaceReport,
  runWorkspaceEncodingScan,
  type WorkspaceReport,
} from "../../core/sourceEncodingWalk.js";
import type { FileResultSummary, ToolRunContext } from "../types.js";
import { dedupeIssuesByOffset, formatIssueTransform } from "./formatIssue.js";
import { getModeLabel, getPreserveGbk, getStripBom, isAsciiOnly } from "./options.js";
import { getFileScope, isScopeEmpty, scopeSummary } from "../../scopeOptions.js";
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import { ktcHighlightHeaderIssues } from "../../workbench/editorMatchHighlight.js";
import { ktcResolveWorkspaceFileScope, type KtcWorkspaceFileScope } from "../../worksets.js";

function walkOptions(root: string, fix: boolean, workspaceScope?: KtcWorkspaceFileScope, pluginIgnoreEnabled = true) {
  const scope = getFileScope();
  return {
    fix,
    asciiOnly: isAsciiOnly(),
    stripBom: getStripBom(),
    scope: { ...scope, includeMarkdown: false },
    ignorePatterns: resolveWorkspaceIgnorePatterns(root, pluginIgnoreEnabled),
    includePaths: workspaceScope?.relativeFiles,
  };
}

export async function scanHeaders(root: string, workspaceScope?: KtcWorkspaceFileScope, pluginIgnoreEnabled = true): Promise<WorkspaceReport> {
  return runWorkspaceEncodingScan({ root, ...walkOptions(root, false, workspaceScope, pluginIgnoreEnabled) });
}

export async function fixHeaders(root: string, workspaceScope?: KtcWorkspaceFileScope, pluginIgnoreEnabled = true): Promise<WorkspaceReport | undefined> {
  const preserveGbk = getPreserveGbk();
  const stripBom = getStripBom();
  let msg = preserveGbk
    ? "将把弯引号等问题字节替换为 ASCII 标点，GBK 中文将保留。"
    : "将把弯引号、GBK 中文等非 ASCII 内容替换为空格或 ASCII 标点。";
  if (stripBom) {
    msg += " 已勾选去除 BOM：UTF-8 BOM、UTF-16 等将转为 UTF-8。";
  } else {
    msg += " 含 UTF-16 等宽字节 BOM 的文件将跳过字节级修复。";
  }
  msg += " 是否继续？";
  const ok = await vscode.window.showWarningMessage(msg, { modal: true }, "修复");
  if (ok !== "修复") {
    return undefined;
  }
  return runWorkspaceEncodingScan({ root, ...walkOptions(root, true, workspaceScope, pluginIgnoreEnabled) });
}

export function reportToResults(report: WorkspaceReport): FileResultSummary[] {
  return report.results.map((r) => {
    const unique = dedupeIssuesByOffset(r.issues);
    return {
      file: r.filePath.replace(/\\/g, "/").split("/").pop() ?? r.filePath,
      relativePath: relative(report.root, r.filePath).replace(/\\/g, "/"),
      fullPath: r.filePath,
      issueCount: unique.length,
      topLine: unique[0]?.line ?? 1,
      issues: unique.map((issue) => {
        const t = formatIssueTransform(issue);
        return {
          line: issue.line,
          column: issue.column,
          byte: issue.byte,
          kind: t.kind,
          fromLabel: t.fromLabel,
          toLabel: t.toLabel,
          suggestedAscii: issue.suggestedAscii,
          context: issue.context,
        };
      }),
    };
  });
}

export function logReport(report: WorkspaceReport, fix: boolean, log: (text: string) => void): void {
  log(formatWorkspaceReport(report, fix, {
    fixInstruction: "请在 Primary 中点击「修复」进行处理。",
  }));
}

export async function openIssueFile(
  fullPath: string,
  line: number,
  issues: readonly FileResultSummary["issues"][number][] = [],
): Promise<void> {
  const uri = vscode.Uri.file(fullPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, { preview: true });
  const pos = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  ktcHighlightHeaderIssues(editor, issues, !getPreserveGbk());
}

export async function runHeaderAsciiAction(
  action: string,
  ctx: ToolRunContext,
): Promise<void> {
  if (!ctx.workspaceRoot) {
    const message = "请先打开包含 C/C++ 源码的工作区文件夹。";
    ctx.log(`[头文件 ASCII 修正][${action === "fix" ? "修复" : "预检"}][ERROR] ${message}`);
    ctx.postState({
      status: "error",
      message,
    });
    return;
  }

  const scope = getFileScope();
  if (isScopeEmpty(scope, false)) {
    const message = "请至少勾选「头文件」或「源文件」范围。";
    ctx.log(`[头文件 ASCII 修正][${action === "fix" ? "修复" : "预检"}][ERROR] ${message}`);
    ctx.postState({
      status: "error",
      message,
    });
    return;
  }

  ctx.postState({ status: "running", message: `${action === "fix" ? "正在修复" : "正在预检"}（${getModeLabel()}；${scopeSummary(scope)}）…` });

  try {
    const workspaceScope = await ktcResolveWorkspaceFileScope(vscode.Uri.file(ctx.workspaceRoot), ctx.workspaceFileScopeId);
    ctx.postState({ status: "running", message: `${action === "fix" ? "正在修复" : "正在预检"}（${workspaceScope.label}；${getModeLabel()}；${scopeSummary(scope)}）…` });
    if (action === "scan") {
      const report = await scanHeaders(ctx.workspaceRoot, workspaceScope, ctx.pluginIgnoreEnabled);
      logReport(report, false, ctx.log);
      ctx.postState({
        status: "done",
        message:
          report.issueFiles === 0
            ? `已预检 ${report.scanned} 个文件（${scopeSummary(scope)}），未发现问题。`
            : `已预检 ${report.scanned} 个文件（${scopeSummary(scope)}），${report.issueFiles} 个文件有问题。`,
        results: reportToResults(report),
        scanned: report.scanned,
        issueFiles: report.issueFiles,
      });
      return;
    }

    if (action === "fix") {
      const report = await fixHeaders(ctx.workspaceRoot, workspaceScope, ctx.pluginIgnoreEnabled);
      if (!report) {
        ctx.log("[头文件 ASCII 修正][修复][INFO] 用户已取消，未写入文件。");
        ctx.postState({ status: "idle", message: "已取消修复。" });
        return;
      }
      logReport(report, true, ctx.log);
      const rescan = await scanHeaders(ctx.workspaceRoot, workspaceScope, ctx.pluginIgnoreEnabled);
      ctx.postState({
        status: "done",
        message: `已修复 ${report.fixedFiles} 个文件。`,
        results: reportToResults(rescan),
        scanned: rescan.scanned,
        issueFiles: rescan.issueFiles,
        fixedFiles: report.fixedFiles,
      });
      return;
    }

    ctx.postState({ status: "error", message: `未知操作：${action}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.log(`[头文件 ASCII 修正][${action === "fix" ? "修复" : "预检"}][ERROR] ${msg}`);
    ctx.postState({ status: "error", message: msg });
  }
}
