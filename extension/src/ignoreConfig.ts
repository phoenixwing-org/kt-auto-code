import * as vscode from "vscode";
import { existsSync, readFileSync } from "node:fs";
import {
  ensurePhoenixIgnore,
  gitIgnoreFile,
  invalidateDotIgnoreCache,
  parseDotIgnoreText,
  phoenixIgnoreFile,
  resolveIgnorePatterns,
  type IgnoreConfigInfo,
} from "../../src/dotIgnore.js";
import {
  ktcAppendIgnoreGroup,
  ktcAppendIgnorePreset,
  ktcMergeGitIgnore,
  ktcRemoveIgnorePreset,
  type KtcIgnorePresetId,
  type KtcIgnoreManagedGroup,
} from "../../src/ignorePresets.js";
import type { IgnoreConfigSummary } from "./tools/types.js";

/** 工具自身的会话、规则和工作集绝不应成为待处理源文件。 */
const BUILT_IN_IGNORE_PATTERNS = [".phoenix/"];

export function toIgnoreSummary(root: string, info: IgnoreConfigInfo): IgnoreConfigSummary {
  return {
    relativePath: `${".phoenix"}/.ignore`,
    fullPath: info.ignorePath,
    patternCount: info.patternCount,
    gitIgnoreExists: info.gitIgnoreExists,
    statusText: info.statusText,
  };
}

export function refreshIgnoreConfig(root: string | undefined): IgnoreConfigSummary | undefined {
  if (!root) return undefined;
  const openDocument = findOpenIgnoreDocument(root);
  if (openDocument) return summaryFromDocument(root, openDocument);
  return toIgnoreSummary(root, ensurePhoenixIgnore(root));
}

export function resolveWorkspaceIgnorePatterns(root: string): string[] {
  const openDocument = findOpenIgnoreDocument(root);
  const configured = openDocument ? parseDotIgnoreText(openDocument.getText()) : resolveIgnorePatterns(root);
  return [...new Set([...BUILT_IN_IGNORE_PATTERNS, ...configured])];
}

export function invalidateWorkspaceIgnorePatterns(root: string): void {
  invalidateDotIgnoreCache(root);
}

export async function openIgnoreConfigFile(root: string): Promise<vscode.TextDocument> {
  ensurePhoenixIgnore(root);
  const uri = vscode.Uri.file(phoenixIgnoreFile(root));
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
  return doc;
}

function summaryFromDocument(root: string, doc: vscode.TextDocument): IgnoreConfigSummary {
  const patternCount = parseDotIgnoreText(doc.getText()).length;
  return {
    relativePath: ".phoenix/.ignore",
    fullPath: doc.uri.fsPath,
    patternCount,
    gitIgnoreExists: existsSync(gitIgnoreFile(root)),
    statusText: doc.isDirty ? `${patternCount} 条跳过规则（未保存）` : `${patternCount} 条跳过规则`,
  };
}

function findOpenIgnoreDocument(root: string): vscode.TextDocument | undefined {
  const expected = normalizeFsPath(phoenixIgnoreFile(root));
  return vscode.workspace.textDocuments.find((document) =>
    document.uri.scheme === "file" && normalizeFsPath(document.uri.fsPath) === expected);
}

function normalizeFsPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin"
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;
}

async function editIgnoreDocument(
  root: string,
  transform: (text: string) => string,
): Promise<IgnoreConfigSummary> {
  const doc = await openIgnoreConfigFile(root);
  const before = doc.getText();
  const after = transform(before);
  if (after !== before) {
    const lastLine = doc.lineAt(doc.lineCount - 1);
    const fullRange = new vscode.Range(new vscode.Position(0, 0), lastLine.rangeIncludingLineBreak.end);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, fullRange, after);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) throw new Error("无法更新 Ignore 文档缓冲区");
  }
  return summaryFromDocument(root, doc);
}

export function appendIgnorePresetToDocument(
  root: string,
  presetId: KtcIgnorePresetId,
): Promise<IgnoreConfigSummary> {
  return editIgnoreDocument(root, (text) => ktcAppendIgnorePreset(text, presetId));
}

export function removeIgnorePresetFromDocument(
  root: string,
  presetId: KtcIgnorePresetId,
): Promise<IgnoreConfigSummary> {
  return editIgnoreDocument(root, (text) => ktcRemoveIgnorePreset(text, presetId));
}

export function mergeGitIgnoreIntoDocument(root: string): Promise<IgnoreConfigSummary> {
  const gitPath = gitIgnoreFile(root);
  if (!existsSync(gitPath)) throw new Error("工作区无 .gitignore，无法合并");
  const gitText = readFileSync(gitPath, "utf8");
  return editIgnoreDocument(root, (text) => ktcMergeGitIgnore(text, gitText));
}

export function appendIgnoreGroupsToDocument(
  root: string,
  groups: readonly KtcIgnoreManagedGroup[],
): Promise<IgnoreConfigSummary> {
  return editIgnoreDocument(root, (text) => groups.reduce(
    (current, group) => ktcAppendIgnoreGroup(current, group),
    text,
  ));
}
