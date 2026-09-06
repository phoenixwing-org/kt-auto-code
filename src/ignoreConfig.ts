import * as vscode from "vscode";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  gitIgnoreFile,
  invalidateDotIgnoreCache,
  parseDotIgnoreText,
  phoenixIgnoreFile,
  type IgnoreConfigInfo,
} from "./core/dotIgnore.js";
import {
  ktcAppendIgnoreGroup,
  ktcAppendIgnorePreset,
  ktcGetIgnorePreset,
  ktcMergeGitIgnore,
  ktcPrimaryCustomIgnoreRules,
  ktcRemoveIgnorePreset,
  ktcSetPrimaryCustomIgnoreRules,
  type KtcIgnorePresetId,
  type KtcIgnoreManagedGroup,
} from "./core/ignorePresets.js";
import type { IgnoreConfigSummary, IgnoreTargetSummary } from "./tools/types.js";
import {
  DEFAULT_SKIP_DIR_NAMES,
  SCAN_SAFETY_SKIP_ENTRY_NAMES,
} from "./core/workspace/scanScope.js";
import {
  ktcApplyIgnoreRuleMutation,
  ktcDedupeIgnoreRules,
  ktcMergeIgnoreRuleSources,
  ktcRelocateGitIgnoreRules,
  type KtcIgnoreRuleAction,
  type KtcIgnoreRuleMutationResult,
  type KtcIgnoreWriteTarget,
} from "./core/ignoreManagerModel.js";

/** Safety boundaries remain active even when every user-selectable Ignore source is disabled. */
const SCAN_SAFETY_IGNORE_PATTERNS = Object.freeze(
  [...SCAN_SAFETY_SKIP_ENTRY_NAMES].map((name) => `${name}/`),
);
const BUILT_IN_IGNORE_RULES = Object.freeze(
  [...DEFAULT_SKIP_DIR_NAMES]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .map((name) => `${name}/`),
);
const BUILT_IN_IGNORE_COUNT = BUILT_IN_IGNORE_RULES.length;
const PHOENIX_IGNORE_INITIAL_TEXT = "# KT Auto Code custom scan ignore rules\n# Primary 自定义忽略；每行一条规则\n\n";

export interface KtcWorkspaceIgnoreSourceOptions {
  builtInIgnoreEnabled?: boolean;
  gitIgnoreEnabled?: boolean;
  customIgnoreEnabled?: boolean;
}

export function toIgnoreSummary(root: string, info: IgnoreConfigInfo): IgnoreConfigSummary {
  return buildIgnoreSummary(root, info.statusText);
}

export function refreshIgnoreConfig(root: string | undefined): IgnoreConfigSummary | undefined {
  if (!root) return undefined;
  return buildIgnoreSummary(root);
}

/**
 * 解析工作区 Ignore 规则。
 *
 * 根 `.gitignore` 按 Phoenix 扫描器支持的规则子集解析；插件规则启用时，
 * 再叠加 `.phoenix/.ignore`。这里只读现有文件，不负责创建插件配置。
 */
export function resolveWorkspaceIgnorePatterns(
  root: string,
  sources: boolean | KtcWorkspaceIgnoreSourceOptions = {},
): string[] {
  const options = typeof sources === "boolean"
    ? { builtInIgnoreEnabled: true, gitIgnoreEnabled: true, customIgnoreEnabled: sources }
    : sources;
  const gitPatterns = options.gitIgnoreEnabled === false
    ? []
    : resolveGitIgnorePatterns(root);
  let customPatterns: string[] = [];
  if (options.customIgnoreEnabled === true) {
    customPatterns = parseDotIgnoreText(readIgnoreTargetState(root, "phoenix").text);
  }
  return [...ktcDedupeIgnoreRules([...SCAN_SAFETY_IGNORE_PATTERNS, ...gitPatterns, ...customPatterns])];
}

function resolveGitIgnorePatterns(root: string): readonly string[] {
  const gitRoot = findNearestGitRoot(root);
  if (!gitRoot) return [];
  const repositoryRules = parseDotIgnoreText(readIgnoreTargetState(root, "git").text);
  const scanRootRelativePath = relative(gitRoot, resolve(root)).replace(/\\/g, "/");
  return ktcRelocateGitIgnoreRules(repositoryRules, scanRootRelativePath);
}

/** 返回所选目录所在最近 Git 仓库根部的 `.gitignore`；不递归聚合多个仓库。 */
export function findNearestGitIgnore(root: string): string | undefined {
  const gitRoot = findNearestGitRoot(root);
  if (!gitRoot) return undefined;
  const candidate = gitIgnoreFile(gitRoot);
  return existsSync(candidate) ? candidate : undefined;
}

/** 返回所选目录所在最近 Git 仓库根；支持普通仓库和 worktree 的 `.git` 文件。 */
export function findNearestGitRoot(root: string): string | undefined {
  let current = resolve(root);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function invalidateWorkspaceIgnorePatterns(root: string): void {
  invalidateDotIgnoreCache(root);
}

export async function openIgnoreConfigFile(root: string): Promise<vscode.TextDocument> {
  return openIgnoreTargetFile(root, "phoenix");
}

export async function openIgnoreTargetFile(
  root: string,
  target: KtcIgnoreWriteTarget,
): Promise<vscode.TextDocument> {
  const file = ignoreTargetFile(root, target);
  if (!file) throw new Error("当前目录不在 Git 仓库内，无法使用根 .gitignore。");
  if (!existsSync(file)) {
    const relativePath = target === "git" ? ".gitignore" : ".phoenix/.ignore";
    throw new Error(`${relativePath} 尚不存在；请先添加至少一条规则。`);
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  await vscode.window.showTextDocument(doc, { preview: false });
  return doc;
}

async function openIgnoreTargetDocument(
  root: string,
  target: KtcIgnoreWriteTarget,
): Promise<vscode.TextDocument> {
  const file = ignoreTargetFile(root, target);
  if (!file) throw new Error("当前目录不在 Git 仓库内，无法使用根 .gitignore。");
  const openDocument = findOpenIgnoreTargetDocument(root, target);
  if (openDocument) return openDocument;
  if (target === "phoenix") mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, target === "phoenix" ? PHOENIX_IGNORE_INITIAL_TEXT : "", {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }
  const uri = vscode.Uri.file(file);
  return vscode.workspace.openTextDocument(uri);
}

function isAlreadyExistsError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "EEXIST";
}

function ignoreTargetFile(root: string, target: KtcIgnoreWriteTarget): string | undefined {
  if (target === "phoenix") return phoenixIgnoreFile(root);
  const gitRoot = findNearestGitRoot(root);
  return gitRoot ? gitIgnoreFile(gitRoot) : undefined;
}

function findOpenIgnoreDocument(root: string): vscode.TextDocument | undefined {
  return findOpenIgnoreTargetDocument(root, "phoenix");
}

function findOpenIgnoreTargetDocument(
  root: string,
  target: KtcIgnoreWriteTarget,
): vscode.TextDocument | undefined {
  const file = ignoreTargetFile(root, target);
  if (!file) return undefined;
  const expected = normalizeFsPath(file);
  return vscode.workspace.textDocuments.find((document) =>
    document.uri.scheme === "file" && normalizeFsPath(document.uri.fsPath) === expected);
}

function normalizeFsPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  return process.platform === "win32" || process.platform === "darwin"
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;
}

function readExistingIgnoreText(file: string | undefined): string {
  if (!file || !existsSync(file)) return "";
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

interface IgnoreTargetState {
  readonly summary: IgnoreTargetSummary;
  readonly text: string;
}

function readIgnoreTargetState(root: string, target: KtcIgnoreWriteTarget): IgnoreTargetState {
  const file = ignoreTargetFile(root, target);
  const document = findOpenIgnoreTargetDocument(root, target);
  const text = document?.getText() ?? readExistingIgnoreText(file);
  const exists = !!file && existsSync(file);
  return {
    text,
    summary: {
      target,
      label: target === "git" ? "Git Ignore" : "Phoenix Ignore",
      relativePath: target === "git" ? ".gitignore" : ".phoenix/.ignore",
      ...(file ? { fullPath: file } : {}),
      exists,
      available: target === "phoenix" || !!file,
      dirty: document?.isDirty ?? false,
      patternCount: parseDotIgnoreText(text).length,
    },
  };
}

function buildIgnoreSummary(root: string, statusText?: string): IgnoreConfigSummary {
  const git = readIgnoreTargetState(root, "git");
  const phoenix = readIgnoreTargetState(root, "phoenix");
  const mergedRules = ktcMergeIgnoreRuleSources([
    { source: "git", text: git.text },
    { source: "phoenix", text: phoenix.text },
  ]);
  const dirty = [git.summary, phoenix.summary].find((target) => target.dirty);
  const resolvedStatus = statusText ?? (dirty
    ? `${mergedRules.length} 条有效规则（${dirty.relativePath} 未保存）`
    : mergedRules.length > 0 ? `${mergedRules.length} 条有效规则` : "未配置");
  return {
    relativePath: ".phoenix/.ignore",
    fullPath: phoenix.summary.fullPath ?? phoenixIgnoreFile(root),
    patternCount: phoenix.summary.patternCount,
    gitIgnoreExists: git.summary.exists,
    statusText: resolvedStatus,
    primaryCustomPatterns: ktcPrimaryCustomIgnoreRules(phoenix.text),
    builtInPatternCount: BUILT_IN_IGNORE_COUNT,
    builtInPatterns: BUILT_IN_IGNORE_RULES,
    targets: [git.summary, phoenix.summary],
    mergedRules,
  };
}

async function editIgnoreTargetDocument(
  root: string,
  target: KtcIgnoreWriteTarget,
  transform: (text: string) => string,
): Promise<IgnoreConfigSummary> {
  const current = readIgnoreTargetState(root, target);
  if (!current.summary.available) throw new Error("当前目录不在 Git 仓库内，无法使用根 .gitignore。");
  // A no-op must not create a missing target file.
  if (transform(current.text) === current.text) return buildIgnoreSummary(root);
  const doc = await openIgnoreTargetDocument(root, target);
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
  return buildIgnoreSummary(root);
}

async function editIgnoreDocument(
  root: string,
  transform: (text: string) => string,
): Promise<IgnoreConfigSummary> {
  return editIgnoreTargetDocument(root, "phoenix", transform);
}

export interface KtcIgnoreDocumentMutationResult {
  readonly summary: IgnoreConfigSummary;
  readonly mutation: KtcIgnoreRuleMutationResult;
}

export async function applyIgnoreRulesToDocument(
  root: string,
  target: KtcIgnoreWriteTarget,
  action: KtcIgnoreRuleAction,
  rules: readonly string[],
): Promise<KtcIgnoreDocumentMutationResult> {
  let mutation = ktcApplyIgnoreRuleMutation(readIgnoreTargetState(root, target).text, action, rules);
  const summary = await editIgnoreTargetDocument(root, target, (text) => {
    mutation = ktcApplyIgnoreRuleMutation(text, action, rules);
    return mutation.text;
  });
  return { summary, mutation };
}

export function applyIgnorePresetToDocument(
  root: string,
  target: KtcIgnoreWriteTarget,
  presetId: KtcIgnorePresetId,
  action: KtcIgnoreRuleAction,
): Promise<KtcIgnoreDocumentMutationResult> {
  return applyIgnoreRulesToDocument(root, target, action, ktcGetIgnorePreset(presetId).rules);
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
  const git = readIgnoreTargetState(root, "git");
  if (!git.summary.exists && !git.summary.dirty) {
    throw new Error("当前目录不在含 .gitignore 的 Git 仓库内，无法合并");
  }
  return editIgnoreDocument(root, (text) => ktcMergeGitIgnore(text, git.text));
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

/** 仅在存在非空规则时创建文件；Primary 的“保存”会真实写盘。 */
export async function savePrimaryCustomIgnorePatterns(
  root: string,
  rules: readonly string[],
): Promise<IgnoreConfigSummary> {
  const normalized = parseDotIgnoreText(rules.join("\n"));
  const file = phoenixIgnoreFile(root);
  if (normalized.length === 0 && !existsSync(file) && !findOpenIgnoreDocument(root)) {
    return refreshIgnoreConfig(root)!;
  }
  const summary = await editIgnoreDocument(root, (text) => ktcSetPrimaryCustomIgnoreRules(text, normalized));
  const doc = findOpenIgnoreDocument(root);
  if (doc?.isDirty && !await doc.save()) throw new Error("无法保存自定义 Ignore 规则");
  invalidateWorkspaceIgnorePatterns(root);
  return refreshIgnoreConfig(root) ?? summary;
}
