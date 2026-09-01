import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import * as vscode from "vscode";
import iconv from "iconv-lite";
import {
  pnwApplyUuidReplacementPlan,
  pnwFindUuidOccurrences,
  pnwPlanUuidReplacements,
  type PnwUuidReplacementPlan,
  type PnwUuidReplacementPlanHit,
  type PnwUuidReplacementStrategy,
} from "@phoenix-wing/code-core";
import {
  pnwCodeProjectUuidFiles,
  pnwCodeSelectUuidFileUris,
  type PnwCodeUuidResultHit,
} from "@phoenix-wing/code-core/ui/model";
import { isIgnoredPath } from "../../core/dotIgnore.js";
import type { KtTool, ToolPanelModel, ToolRunContext, ToolUiState, UuidFileResultSummary, WebviewInboundMessage } from "../types.js";
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import { ktcFileInWorkspaceScope, ktcResolveWorkspaceFileScope } from "../../worksets.js";

const INCLUDE = "**/*.{h,hpp,hh,c,cc,cpp,cxx,CATDlg,CATNls,xml,json,txt,md}";
const EXCLUDE = "**/{.git,.phoenix,node_modules,dist,build,out,target}/**";
const BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);
type KtcUuidEncoding = "utf8" | "gbk";

type KtcUuidFileSnapshot = {
  readonly uri: vscode.Uri;
  readonly relativePath: string;
  readonly raw: Uint8Array;
  readonly encoding: KtcUuidEncoding;
  readonly bom: boolean;
  readonly text: string;
  readonly uuidValues: readonly string[];
};

type KtcUuidSession = {
  readonly root: string;
  readonly files: readonly KtcUuidFileSnapshot[];
  readonly plan: PnwUuidReplacementPlan;
  readonly states: Map<string, KtcUuidHitState>;
  readonly warnings: Map<string, string>;
  readonly selectedUris: Set<string>;
  readonly revision: number;
};

type KtcUuidHitState = "pending" | "cancelled" | "applied" | "blocked";
type KtcUuidApplyUpdate = { readonly hitId: string; readonly state: "applied" | "blocked"; readonly warning?: string };

let session: KtcUuidSession | undefined;
let lastStrategy: PnwUuidReplacementStrategy = "map_per_value";
let runContextFactory: (() => ToolRunContext | undefined) | undefined;
let revision = 0;

export const uuidReplaceTool: KtTool = {
  id: "uuidReplace",
  title: "UUID 替换",
  description: "扫描文本 UUID，按同值生成稳定映射；勾选映射后确认写盘。",
  icon: "media/tools/uuid-replace.svg",
  ribbonVisible: false,
  runActions: ["scan", "fix"],
  getPanelModel(): ToolPanelModel { return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon, ribbonVisible: this.ribbonVisible } }; },
  registerCommands(context): void {
    const run = (action: "scan" | "apply") => async () => {
      await vscode.commands.executeCommand("ktAutoCode.tool.show", this.id);
      const ctx = runContextFactory?.();
      if (ctx) await runUuidAction(action, ctx);
    };
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.scan", run("scan")),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.apply", run("apply")),
    );
  },
  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) {
      await runUuidAction(
        message.action === "fix" ? "apply" : "scan",
        ctx,
        normalizeStrategy(message.uuidStrategy),
      );
    }
    if (message.type === "openIssue" && message.toolId === this.id) await openLocation(message.file, message.line);
    if (message.type === "uuidSelection" && message.toolId === this.id) updateUuidSelection(message.uris, ctx);
    if (message.type === "uuidAction" && message.toolId === this.id) await runUuidFileAction(message.action, message.uris, ctx);
  },
  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    await runUuidAction(action === "fix" ? "apply" : "scan", ctx);
  },
  clearSession(ctx: ToolRunContext): void {
    session = undefined;
    ctx.postState({ status: "idle", message: "", uuidResults: [], uuidSelectedUris: [] });
  },
};

export function setUuidReplaceRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

async function runUuidAction(
  action: "scan" | "apply",
  ctx: ToolRunContext,
  strategy?: PnwUuidReplacementStrategy,
): Promise<void> {
  if (action === "scan") await scanUuids(ctx, strategy ?? lastStrategy);
  else await applyUuidFiles([...(session?.selectedUris ?? [])], ctx);
}

async function scanUuids(ctx: ToolRunContext, strategy: PnwUuidReplacementStrategy): Promise<void> {
  if (!ctx.workspaceRoot) {
    const message = "请先打开工作区。";
    ctx.log(`[UUID][预览][ERROR] ${message}`);
    ctx.postState({ status: "error", message });
    return;
  }
  ctx.postState({ status: "running", message: "正在扫描 UUID…" });
  const root = vscode.Uri.file(ctx.workspaceRoot);
  let scope;
  try { scope = await ktcResolveWorkspaceFileScope(root, ctx.workspaceFileScopeId); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.log(`[UUID][预览][ERROR] ${message}`);
    ctx.postState({ status: "error", message });
    return;
  }
  lastStrategy = strategy;
  const ignorePatterns = resolveWorkspaceIgnorePatterns(ctx.workspaceRoot, ctx.pluginIgnoreEnabled);
  const uris = (await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE))
    .filter((uri) => ktcFileInWorkspaceScope(uri, scope))
    .filter((uri) => !isIgnoredPath(relative(ctx.workspaceRoot!, uri.fsPath).replace(/\\/g, "/"), ignorePatterns));
  const files: KtcUuidFileSnapshot[] = [];
  for (const uri of uris) {
    let raw: Uint8Array | undefined;
    try { raw = await vscode.workspace.fs.readFile(uri); } catch { continue; }
    if (!raw) continue;
    const decoded = decode(raw);
    if (!decoded) continue;
    const occurrences = pnwFindUuidOccurrences(decoded.text);
    if (!occurrences.length) continue;
    files.push({
      uri,
      relativePath: relative(ctx.workspaceRoot, uri.fsPath).replace(/\\/g, "/"),
      raw,
      encoding: decoded.encoding,
      bom: decoded.bom,
      text: decoded.text,
      uuidValues: [...new Set(occurrences.map((item) => item.normalized))],
    });
  }
  const plan = pnwPlanUuidReplacements(
    files.map((file) => ({ id: file.uri.toString(), text: file.text })),
    { strategy, createUuid: randomUUID },
  );
  if (!plan.valid) {
    const message = `无法创建 UUID 替换计划：${plan.diagnostics.join("；")}`;
    ctx.log(`[UUID][预览][ERROR] ${message}`);
    ctx.postState({ status: "error", message });
    return;
  }
  const states = new Map(plan.hits.map((hit) => [hit.id, "pending" as const]));
  const selectedUris = new Set(files.filter((file) => plan.hits.some((hit) => hit.fileId === file.uri.toString())).map((file) => file.uri.toString()));
  session = { root: ctx.workspaceRoot, files, plan, states, warnings: new Map(), selectedUris, revision: ++revision };
  const hits = plan.hits.length;
  const message = `范围“${scope.label}”已扫描 ${uris.length} 个文本文件，命中 ${hits} 处 UUID（${plan.groups.length} 组，${strategyLabel(strategy)}）；映射已在本次会话固定，请在当前 Block 中勾选并写盘。`;
  ctx.postState({ status: "done", message, scanned: uris.length, issueFiles: files.length, ...uuidUiState() });
  ctx.log(`[UUID][预览][OK] ${message}`);
}

function normalizeStrategy(value: unknown): PnwUuidReplacementStrategy | undefined {
  return value === "map_per_value" || value === "fresh_per_hit" ? value : undefined;
}

function strategyLabel(strategy: PnwUuidReplacementStrategy): string {
  return strategy === "fresh_per_hit" ? "每处独立新值" : "同值同替换";
}

async function applySelectedUuidHits(hitIds: readonly string[], ctx: ToolRunContext): Promise<readonly KtcUuidApplyUpdate[]> {
  if (!session || session.root !== ctx.workspaceRoot) throw new Error("UUID 扫描结果已失效，请重新扫描。");
  const activeSession = session;
  const selectedHitIds = new Set(hitIds);
  const files = activeSession.files.filter((file) => activeSession.plan.hits.some((hit) => hit.fileId === file.uri.toString() && selectedHitIds.has(hit.id)));
  if (!files.length) return [];
  if (await vscode.window.showWarningMessage(`将替换 ${selectedHitIds.size} 处 UUID，影响 ${files.length} 个文件。是否确认写盘？`, { modal: true }, "应用替换") !== "应用替换") return [];
  const updates: KtcUuidApplyUpdate[] = [];
  const rejected: string[] = [];
  let writtenFiles = 0;
  for (const file of files) {
    const fileHitIds = activeSession.plan.hits.filter((hit) => hit.fileId === file.uri.toString() && selectedHitIds.has(hit.id)).map((hit) => hit.id);
    try {
      if (!equal(await vscode.workspace.fs.readFile(file.uri), file.raw)) {
        updates.push(...fileHitIds.map((hitId) => ({ hitId, state: "blocked" as const, warning: "文件已被外部修改，未写入" })));
        rejected.push(`${file.relativePath}（文件已变化）`);
        continue;
      }
      const output = pnwApplyUuidReplacementPlan(file.text, file.uri.toString(), activeSession.plan, selectedHitIds);
      if (output.skippedHitIds.length) updates.push(...output.skippedHitIds.map((hitId) => ({ hitId, state: "blocked" as const, warning: "命中已变化，未写入" })));
      if (!output.appliedHitIds.length) { rejected.push(`${file.relativePath}（命中已变化）`); continue; }
      await vscode.workspace.fs.writeFile(file.uri, encode(file, output.text));
      writtenFiles += 1;
      updates.push(...output.appliedHitIds.map((hitId) => ({ hitId, state: "applied" as const })));
    } catch (error) {
      const warning = error instanceof Error ? error.message : "写入失败";
      updates.push(...fileHitIds.map((hitId) => ({ hitId, state: "blocked" as const, warning })));
      rejected.push(`${file.relativePath}（${warning}）`);
    }
  }
  await vscode.commands.executeCommand("git.refresh");
  const message = rejected.length ? `已写入 ${writtenFiles} 个文件；未写入 ${rejected.length} 个：${rejected.join("；")}` : `已写入 ${writtenFiles} 个文件；可在当前 Block 的结果行按需查看 Git 差异。`;
  ctx.postState({ status: rejected.length ? "error" : "done", message });
  ctx.log(`[UUID][写入][${rejected.length ? "WARN" : "OK"}] ${message}`);
  return updates;
}

function stateOf(hitId: string): KtcUuidHitState {
  return session?.states.get(hitId) ?? "blocked";
}

function hitsForUri(uri: string): readonly PnwUuidReplacementPlanHit[] {
  return session?.plan.hits.filter((hit) => hit.fileId === uri) ?? [];
}

function uuidResultHits(): readonly PnwCodeUuidResultHit[] {
  if (!session) return [];
  const paths = new Map(session.files.map((file) => [file.uri.toString(), file.relativePath]));
  return session.plan.hits.map((hit) => ({
    id: hit.id,
    fileId: hit.fileId,
    relativePath: paths.get(hit.fileId) ?? hit.fileId,
    line: hit.line,
    column: hit.column,
    from: hit.from,
    normalized: hit.normalized,
    kind: hit.kind,
    to: hit.formattedTo,
    state: stateOf(hit.id),
    warning: session?.warnings.get(hit.id),
  }));
}

function uuidResultRows(): UuidFileResultSummary[] {
  if (!session) return [];
  return [...pnwCodeProjectUuidFiles(
    session.files.map((file) => ({
      uri: file.uri.toString(),
      relativePath: file.relativePath,
      encoding: file.encoding === "gbk" ? "GBK" : file.bom ? "UTF-8 BOM" : "UTF-8",
    })),
    uuidResultHits(),
  )];
}

function uuidUiState(): Pick<ToolUiState, "uuidResults" | "uuidRevision" | "uuidStrategy" | "uuidSelectedUris"> {
  return {
    uuidResults: uuidResultRows(),
    uuidRevision: session?.revision,
    uuidStrategy: session?.plan.strategy,
    uuidSelectedUris: [...(session?.selectedUris ?? [])],
  };
}

function updateUuidSelection(uris: readonly string[], ctx: ToolRunContext): void {
  if (!session || session.root !== ctx.workspaceRoot) return;
  const selected = pnwCodeSelectUuidFileUris(uuidResultRows(), uris);
  session.selectedUris.clear();
  for (const uri of selected) session.selectedUris.add(uri);
  ctx.postState({ status: "idle", ...uuidUiState() });
}

function applyUuidUpdates(updates: readonly KtcUuidApplyUpdate[]): void {
  if (!session) return;
  for (const update of updates) {
    session.states.set(update.hitId, update.state);
    if (update.warning) session.warnings.set(update.hitId, update.warning);
  }
  const pendingUris = new Set(uuidResultRows().filter((row) => row.state === "pending").map((row) => row.uri));
  for (const uri of [...session.selectedUris]) if (!pendingUris.has(uri)) session.selectedUris.delete(uri);
}

async function applyUuidFiles(uris: readonly string[], ctx: ToolRunContext): Promise<void> {
  if (!session || session.root !== ctx.workspaceRoot || !session.plan.groups.length) {
    ctx.postState({ status: "error", message: "请先扫描 UUID；映射仅在当前工作区会话内有效。" });
    return;
  }
  const requested = new Set(uris);
  const hitIds = uuidResultRows()
    .filter((row) => row.state === "pending" && requested.has(row.uri))
    .flatMap((row) => hitsForUri(row.uri).filter((hit) => stateOf(hit.id) === "pending").map((hit) => hit.id));
  if (!hitIds.length) {
    ctx.postState({ status: "idle", message: "请先勾选待写盘的 UUID 文件。", ...uuidUiState() });
    return;
  }
  const updates = await applySelectedUuidHits(hitIds, ctx);
  if (updates.length === 0) {
    ctx.postState({ status: "idle", message: "已取消 UUID 写盘。", ...uuidUiState() });
    return;
  }
  applyUuidUpdates(updates);
  ctx.postState({ status: updates.some((update) => update.state === "blocked") ? "error" : "done", ...uuidUiState() });
}

async function runUuidFileAction(
  action: "open" | "apply" | "cancel" | "gitDiff",
  uris: readonly string[],
  ctx: ToolRunContext,
): Promise<void> {
  if (!session || session.root !== ctx.workspaceRoot) {
    ctx.postState({ status: "error", message: "UUID 扫描结果已失效，请重新扫描。" });
    return;
  }
  const known = new Set(uuidResultRows().map((row) => row.uri));
  const requested = uris.filter((uri) => known.has(uri));
  if (action === "apply") {
    await applyUuidFiles(requested, ctx);
    return;
  }
  if (action === "cancel") {
    for (const uri of requested) {
      for (const hit of hitsForUri(uri)) if (stateOf(hit.id) === "pending") session.states.set(hit.id, "cancelled");
      session.selectedUris.delete(uri);
    }
    ctx.postState({ status: "idle", message: "已从本次 UUID 候选中移除。", ...uuidUiState() });
    return;
  }
  const uri = requested[0];
  if (!uri) return;
  if (action === "open") {
    await openLocation(uri, hitsForUri(uri)[0]?.line ?? 1);
    return;
  }
  if (hitsForUri(uri).some((hit) => stateOf(hit.id) === "applied")) {
    await vscode.commands.executeCommand("git.refresh");
    await vscode.commands.executeCommand("git.openChange", vscode.Uri.parse(uri));
  }
}

function decode(raw: Uint8Array): { text: string; encoding: KtcUuidEncoding; bom: boolean } | undefined {
  const bom = raw.length >= 3 && BOM.every((value, index) => value === raw[index]);
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bom ? raw.subarray(3) : raw), encoding: "utf8", bom }; } catch { if (bom) return undefined; }
  const text = iconv.decode(Buffer.from(raw), "gbk");
  return equal(iconv.encode(text, "gbk"), raw) ? { text, encoding: "gbk", bom: false } : undefined;
}

function encode(file: KtcUuidFileSnapshot, text: string): Uint8Array {
  const output = file.encoding === "gbk" ? iconv.encode(text, "gbk") : Buffer.from(text, "utf8");
  if (file.encoding === "gbk" && iconv.decode(output, "gbk") !== text) throw new Error("替换结果无法写入 GBK");
  return file.bom ? Buffer.concat([Buffer.from(BOM), output]) : output;
}

function equal(left: Uint8Array, right: Uint8Array): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }

async function openLocation(file: string, line: number): Promise<void> {
  const uri = file.startsWith("file:") ? vscode.Uri.parse(file) : vscode.Uri.file(file);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  const position = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}
