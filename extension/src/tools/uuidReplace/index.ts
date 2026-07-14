import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import * as vscode from "vscode";
import iconv from "iconv-lite";
import {
  pnwApplyUuidReplacementPlan,
  pnwFindUuidOccurrences,
  pnwPlanUuidReplacements,
  type PnwUuidReplacementPlan,
} from "phoenix-wing/code-core";
import { isIgnoredPath } from "../../../../src/dotIgnore.js";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import { KtcUuidReplacementResultView, type KtcUuidApplyUpdate } from "../../workbench/uuidReplacementResultView.js";

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
};

let session: KtcUuidSession | undefined;
let runContextFactory: (() => ToolRunContext | undefined) | undefined;
let uuidReplacementResultView: KtcUuidReplacementResultView | undefined;

export function registerUuidReplacementResultView(context: vscode.ExtensionContext): void {
  uuidReplacementResultView = new KtcUuidReplacementResultView(context);
  context.subscriptions.push(uuidReplacementResultView);
}

export const uuidReplaceTool: KtTool = {
  id: "uuidReplace",
  title: "UUID 替换",
  description: "扫描文本 UUID，按同值生成稳定映射；勾选映射后确认写盘。",
  icon: "media/tools/uuid-replace.svg",
  getPanelModel(): ToolPanelModel { return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } }; },
  registerCommands(context): void {
    const run = (action: "scan" | "apply") => () => {
      const ctx = runContextFactory?.();
      if (ctx) void runUuidAction(action, ctx);
    };
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.scan", run("scan")),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.apply", run("apply")),
    );
  },
  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) await runUuidAction(message.action === "fix" ? "apply" : "scan", ctx);
    if (message.type === "openIssue" && message.toolId === this.id) await openLocation(message.file, message.line);
  },
  async runAction(action: string, ctx: ToolRunContext): Promise<void> { await runUuidAction(action === "fix" ? "apply" : "scan", ctx); },
};

export function setUuidReplaceRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

async function runUuidAction(action: "scan" | "apply", ctx: ToolRunContext): Promise<void> {
  if (action === "scan") await scanUuids(ctx);
  else if (!await uuidReplacementResultView?.applyFromSidebar()) await applyUuids(ctx);
}

async function scanUuids(ctx: ToolRunContext): Promise<void> {
  if (!ctx.workspaceRoot) { ctx.postState({ status: "error", message: "请先打开工作区。" }); return; }
  ctx.postState({ status: "running", message: "正在扫描 UUID…" });
  const root = vscode.Uri.file(ctx.workspaceRoot);
  const ignorePatterns = resolveWorkspaceIgnorePatterns(ctx.workspaceRoot);
  const uris = (await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE))
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
    { strategy: "map_per_value", createUuid: randomUUID },
  );
  if (!plan.valid) {
    ctx.postState({ status: "error", message: `无法创建 UUID 替换计划：${plan.diagnostics.join("；")}` });
    return;
  }
  session = { root: ctx.workspaceRoot, files, plan };
  uuidReplacementResultView?.show(plan, files.map((file) => ({ id: file.uri.toString(), uri: file.uri, relativePath: file.relativePath })), {
    openFile: openLocation,
    openGitDiff: async (uri) => { await vscode.commands.executeCommand("git.refresh"); await vscode.commands.executeCommand("git.openChange", vscode.Uri.parse(uri)); },
    apply: (hitIds) => applySelectedUuidHits(hitIds, ctx),
  });
  const hits = plan.hits.length;
  const message = `已扫描 ${uris.length} 个文本文件，命中 ${hits} 处 UUID（${plan.groups.length} 组）；映射已在本次会话固定，请在底部“UUID 替换”结果视图中勾选并写盘。`;
  ctx.postState({ status: "done", message, scanned: uris.length, issueFiles: files.length });
  ctx.log(`[UUID] ${message}`);
}

async function applyUuids(ctx: ToolRunContext): Promise<void> {
  if (!session || session.root !== ctx.workspaceRoot || !session.plan.groups.length) {
    ctx.postState({ status: "error", message: "请先扫描 UUID；映射仅在当前工作区会话内有效。" });
    return;
  }
  const activeSession = session;
  const picks = await vscode.window.showQuickPick(
    activeSession.plan.groups.map((item) => ({ label: item.from, description: `→ ${item.to} · ${item.hitIds.length} 处`, picked: true, groupId: item.id })),
    { canPickMany: true, title: "选择要替换的 UUID 映射", placeHolder: "同一个旧 UUID 在所有命中文件中将替换为同一个新 UUID" },
  );
  if (!picks?.length) return;
  const selectedGroups = new Set(picks.map((item) => item.groupId));
  const selectedHitIds = new Set(activeSession.plan.groups.filter((group) => selectedGroups.has(group.id)).flatMap((group) => group.hitIds));
  const files = activeSession.files.filter((file) => activeSession.plan.hits.some((hit) => hit.fileId === file.uri.toString() && selectedHitIds.has(hit.id)));
  if (await vscode.window.showWarningMessage(`将替换 ${selectedGroups.size} 组 UUID，影响 ${files.length} 个文件。是否确认写盘？`, { modal: true }, "应用替换") !== "应用替换") return;
  const written: string[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    try {
      if (!equal(await vscode.workspace.fs.readFile(file.uri), file.raw)) { rejected.push(`${file.relativePath}（文件已变化）`); continue; }
      const output = pnwApplyUuidReplacementPlan(file.text, file.uri.toString(), activeSession.plan, selectedHitIds);
      if (!output.appliedHitIds.length) { rejected.push(`${file.relativePath}（命中已变化）`); continue; }
      await vscode.workspace.fs.writeFile(file.uri, encode(file, output.text));
      written.push(file.relativePath);
    } catch (error) { rejected.push(`${file.relativePath}（${error instanceof Error ? error.message : "写入失败"}）`); }
  }
  await vscode.commands.executeCommand("git.refresh");
  const message = rejected.length
    ? `已写入 ${written.length} 个文件；${rejected.length} 个未写入：${rejected.join("；")}`
    : `已写入 ${written.length} 个文件；可在源代码管理中按需查看 Git 差异。`;
  ctx.postState({ status: rejected.length ? "error" : "done", message });
  ctx.log(`[UUID] ${message}`);
  void vscode.window.showInformationMessage(message);
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
  const message = rejected.length ? `已写入 ${writtenFiles} 个文件；未写入 ${rejected.length} 个：${rejected.join("；")}` : `已写入 ${writtenFiles} 个文件；可在结果视图中按需查看 Git 差异。`;
  ctx.postState({ status: rejected.length ? "error" : "done", message });
  ctx.log(`[UUID] ${message}`);
  void vscode.window.showInformationMessage(message);
  return updates;
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
