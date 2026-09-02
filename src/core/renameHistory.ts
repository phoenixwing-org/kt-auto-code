import { randomUUID } from "node:crypto";
import type * as vscode from "vscode";
import type { KtcAssociatedRelationKind } from "./associatedReplacementRules.js";

const KTC_RENAME_HISTORY_STATE_KEY = "ktAutoCode.renameHistory.v1";
const KTC_RENAME_PAIR_HISTORY_LIMIT = 50;
const KTC_PROJECT_RENAME_HISTORY_PER_ROOT_LIMIT = 20;
const KTC_PROJECT_RENAME_HISTORY_TOTAL_LIMIT = 200;
const KTC_RENAME_HISTORY_VERSION = 1;

export interface KtcRenamePairHistoryEntry {
  readonly source: string;
  readonly target: string;
  readonly updatedAt: string;
}

export interface KtcProjectRenameHistoryRule {
  readonly id: string;
  readonly style: "display" | "kebab" | "snake" | "camel" | "pascal" | "upper-snake" | "custom";
  readonly search: string;
  readonly replace: string;
  readonly enabled: boolean;
  readonly parentId?: string;
  readonly relationKind?: KtcAssociatedRelationKind | "custom";
  readonly source?: "generated" | "user";
}

export interface KtcProjectRenameHistoryDraft {
  readonly sourceName: string;
  readonly targetName: string;
  readonly sourcePrefix: string;
  readonly targetPrefix: string;
  readonly rules: readonly KtcProjectRenameHistoryRule[];
}

export interface KtcProjectRenameHistoryEntry extends KtcProjectRenameHistoryDraft {
  readonly id: string;
  readonly root: string;
  readonly updatedAt: string;
}

export interface KtcRenameHistorySnapshot {
  readonly pairs: readonly KtcRenamePairHistoryEntry[];
  readonly projectPlans: readonly KtcProjectRenameHistoryEntry[];
}

interface KtcRenameHistoryDocument {
  readonly version: typeof KTC_RENAME_HISTORY_VERSION;
  readonly pairs: readonly KtcRenamePairHistoryEntry[];
  readonly projectPlans: readonly KtcProjectRenameHistoryEntry[];
}

/**
 * 最近输入属于本机 UI 历史，不写入项目仓库。项目方案按根目录分组，
 * 规则档案仍由显式“保存规则”写入项目内的 .phoenix 文件。
 */
export class KtcRenameHistoryStore {
  constructor(private readonly state: Pick<vscode.Memento, "get" | "update">) {}

  snapshot(root?: string): KtcRenameHistorySnapshot {
    const document = this.read();
    const normalizedRoot = root ? ktcNormalizeHistoryRoot(root) : undefined;
    return {
      pairs: document.pairs,
      projectPlans: normalizedRoot
        ? document.projectPlans.filter((entry) => ktcNormalizeHistoryRoot(entry.root) === normalizedRoot)
        : [],
    };
  }

  async rememberPair(source: string, target: string): Promise<KtcRenameHistorySnapshot> {
    const normalized = ktcNormalizePair(source, target);
    if (!normalized) return this.snapshot();
    const document = this.read();
    const entry = { ...normalized, updatedAt: new Date().toISOString() };
    const pairs = [
      entry,
      ...document.pairs.filter((candidate) => (
        candidate.source !== entry.source || candidate.target !== entry.target
      )),
    ].slice(0, KTC_RENAME_PAIR_HISTORY_LIMIT);
    await this.write({ ...document, pairs });
    return { pairs, projectPlans: [] };
  }

  async forgetPair(source: string, target: string): Promise<KtcRenameHistorySnapshot> {
    const normalized = ktcNormalizePair(source, target);
    if (!normalized) return this.snapshot();
    const document = this.read();
    const pairs = document.pairs.filter((candidate) => (
      candidate.source !== normalized.source || candidate.target !== normalized.target
    ));
    if (pairs.length !== document.pairs.length) await this.write({ ...document, pairs });
    return { pairs, projectPlans: [] };
  }

  async clearPairs(): Promise<KtcRenameHistorySnapshot> {
    const document = this.read();
    if (document.pairs.length > 0) await this.write({ ...document, pairs: [] });
    return { pairs: [], projectPlans: [] };
  }

  async rememberProjectPlan(
    root: string,
    draft: KtcProjectRenameHistoryDraft,
  ): Promise<KtcRenameHistorySnapshot> {
    const normalizedRoot = ktcNormalizeHistoryRoot(root);
    const normalizedDraft = ktcNormalizeProjectDraft(draft);
    if (!normalizedRoot || !normalizedDraft) return this.snapshot(root);
    const document = this.read();
    const updatedAt = new Date().toISOString();
    const pair = { source: normalizedDraft.sourceName, target: normalizedDraft.targetName, updatedAt };
    const pairs = [
      pair,
      ...document.pairs.filter((candidate) => (
        candidate.source !== pair.source || candidate.target !== pair.target
      )),
    ].slice(0, KTC_RENAME_PAIR_HISTORY_LIMIT);
    const entry: KtcProjectRenameHistoryEntry = {
      id: randomUUID(),
      root,
      ...normalizedDraft,
      updatedAt,
    };
    const identity = ktcProjectPlanIdentity(entry);
    const sameRoot = document.projectPlans
      .filter((candidate) => ktcNormalizeHistoryRoot(candidate.root) === normalizedRoot)
      .filter((candidate) => ktcProjectPlanIdentity(candidate) !== identity);
    const otherRoots = document.projectPlans
      .filter((candidate) => ktcNormalizeHistoryRoot(candidate.root) !== normalizedRoot);
    const projectPlans = [entry, ...sameRoot]
      .slice(0, KTC_PROJECT_RENAME_HISTORY_PER_ROOT_LIMIT)
      .concat(otherRoots)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, KTC_PROJECT_RENAME_HISTORY_TOTAL_LIMIT);
    await this.write({ ...document, pairs, projectPlans });
    return {
      pairs,
      projectPlans: projectPlans.filter((candidate) => ktcNormalizeHistoryRoot(candidate.root) === normalizedRoot),
    };
  }

  async forgetProjectPlan(root: string, id: string): Promise<KtcRenameHistorySnapshot> {
    const normalizedRoot = ktcNormalizeHistoryRoot(root);
    const document = this.read();
    const projectPlans = document.projectPlans.filter((candidate) => !(
      candidate.id === id && ktcNormalizeHistoryRoot(candidate.root) === normalizedRoot
    ));
    if (projectPlans.length !== document.projectPlans.length) await this.write({ ...document, projectPlans });
    return {
      pairs: document.pairs,
      projectPlans: projectPlans.filter((candidate) => ktcNormalizeHistoryRoot(candidate.root) === normalizedRoot),
    };
  }

  async clearAll(): Promise<KtcRenameHistorySnapshot> {
    await this.write(ktcEmptyHistoryDocument());
    return { pairs: [], projectPlans: [] };
  }

  private read(): KtcRenameHistoryDocument {
    return ktcNormalizeHistoryDocument(this.state.get<unknown>(KTC_RENAME_HISTORY_STATE_KEY));
  }

  private async write(document: KtcRenameHistoryDocument): Promise<void> {
    await this.state.update(KTC_RENAME_HISTORY_STATE_KEY, document);
  }
}

export function ktcNormalizeHistoryDocument(value: unknown): KtcRenameHistoryDocument {
  if (!ktcIsRecord(value) || value.version !== KTC_RENAME_HISTORY_VERSION) return ktcEmptyHistoryDocument();
  const pairs = Array.isArray(value.pairs)
    ? value.pairs.flatMap((entry) => {
        if (!ktcIsRecord(entry) || typeof entry.updatedAt !== "string") return [];
        const pair = ktcNormalizePair(entry.source, entry.target);
        return pair ? [{ ...pair, updatedAt: entry.updatedAt }] : [];
      }).slice(0, KTC_RENAME_PAIR_HISTORY_LIMIT)
    : [];
  const projectPlans = Array.isArray(value.projectPlans)
    ? value.projectPlans.flatMap((entry) => ktcNormalizeProjectEntry(entry)).slice(0, KTC_PROJECT_RENAME_HISTORY_TOTAL_LIMIT)
    : [];
  return { version: KTC_RENAME_HISTORY_VERSION, pairs, projectPlans };
}

function ktcNormalizeProjectEntry(value: unknown): KtcProjectRenameHistoryEntry[] {
  if (!ktcIsRecord(value)
    || !ktcBoundedString(value.id, 128, true)
    || !ktcBoundedString(value.root, 4_096, true)
    || typeof value.updatedAt !== "string") return [];
  const draft = ktcNormalizeProjectDraft(value);
  return draft ? [{ id: value.id, root: value.root, updatedAt: value.updatedAt, ...draft }] : [];
}

function ktcNormalizeProjectDraft(value: KtcProjectRenameHistoryDraft | Record<string, unknown>): KtcProjectRenameHistoryDraft | undefined {
  if (!ktcBoundedString(value.sourceName, 256, true)
    || !ktcBoundedString(value.targetName, 256, true)
    || !ktcBoundedString(value.sourcePrefix, 256)
    || !ktcBoundedString(value.targetPrefix, 256)
    || !Array.isArray(value.rules)
    || value.rules.length > 32) return undefined;
  const rules = value.rules.flatMap((rule) => ktcNormalizeHistoryRule(rule));
  if (rules.length !== value.rules.length) return undefined;
  return {
    sourceName: value.sourceName.trim(),
    targetName: value.targetName.trim(),
    sourcePrefix: value.sourcePrefix,
    targetPrefix: value.targetPrefix,
    rules,
  };
}

function ktcNormalizeHistoryRule(value: unknown): KtcProjectRenameHistoryRule[] {
  if (!ktcIsRecord(value)
    || !ktcBoundedString(value.id, 128, true)
    || !ktcProjectRuleStyle(value.style)
    || !ktcBoundedString(value.search, 256)
    || !ktcBoundedString(value.replace, 256)
    || typeof value.enabled !== "boolean"
    || (value.parentId !== undefined && !ktcBoundedString(value.parentId, 128, true))
    || (value.relationKind !== undefined && !ktcRelationKind(value.relationKind))
    || (value.source !== undefined && value.source !== "generated" && value.source !== "user")) return [];
  return [{
    id: value.id,
    style: value.style,
    search: value.search,
    replace: value.replace,
    enabled: value.enabled,
    ...(typeof value.parentId === "string" ? { parentId: value.parentId } : {}),
    ...(ktcRelationKind(value.relationKind) ? { relationKind: value.relationKind } : {}),
    ...(value.source === "generated" || value.source === "user" ? { source: value.source } : {}),
  }];
}

function ktcNormalizePair(source: unknown, target: unknown): { source: string; target: string } | undefined {
  if (!ktcBoundedString(source, 256, true) || !ktcBoundedString(target, 256, true)) return undefined;
  return { source: source.trim(), target: target.trim() };
}

function ktcProjectPlanIdentity(plan: KtcProjectRenameHistoryDraft): string {
  return JSON.stringify({
    sourceName: plan.sourceName,
    targetName: plan.targetName,
    sourcePrefix: plan.sourcePrefix,
    targetPrefix: plan.targetPrefix,
    rules: plan.rules,
  });
}

function ktcNormalizeHistoryRoot(root: string): string {
  const normalized = root.replace(/\\/gu, "/").replace(/\/+$/gu, "");
  return process.platform === "win32" || process.platform === "darwin"
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;
}

function ktcEmptyHistoryDocument(): KtcRenameHistoryDocument {
  return { version: KTC_RENAME_HISTORY_VERSION, pairs: [], projectPlans: [] };
}

function ktcBoundedString(value: unknown, max: number, required = false): value is string {
  return typeof value === "string" && value.length <= max && (!required || value.trim().length > 0);
}

function ktcProjectRuleStyle(value: unknown): value is KtcProjectRenameHistoryRule["style"] {
  return typeof value === "string" && new Set([
    "display", "kebab", "snake", "camel", "pascal", "upper-snake", "custom",
  ]).has(value);
}

function ktcRelationKind(value: unknown): value is KtcAssociatedRelationKind | "custom" {
  return typeof value === "string" && new Set([
    "spaced", "prefix", "caa-i", "caa-e", "caa-i-full", "caa-e-full", "custom",
  ]).has(value);
}

function ktcIsRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
