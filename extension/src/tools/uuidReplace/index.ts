import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import * as vscode from "vscode";
import iconv from "iconv-lite";
import { pnwFindUuidOccurrences, pnwReplaceUuidOccurrences, type PnwUuidReplacement } from "phoenix-wing/code-core";
import type { FileResultSummary, KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";

const INCLUDE = "**/*.{h,hpp,hh,c,cc,cpp,cxx,CATDlg,CATNls,xml,json,txt,md}";
const EXCLUDE = "**/{.git,node_modules,dist,build,out,target}/**";
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
  readonly replacements: readonly PnwUuidReplacement[];
};

let session: KtcUuidSession | undefined;
let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export const uuidReplaceTool: KtTool = {
  id: "uuidReplace",
  title: "UUID 替换",
  description: "扫描文本 UUID，按同值生成稳定映射；勾选映射后确认写盘。",
  icon: "media/tools/search-replace.svg",
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
  else await applyUuids(ctx);
}

async function scanUuids(ctx: ToolRunContext): Promise<void> {
  if (!ctx.workspaceRoot) { ctx.postState({ status: "error", message: "请先打开工作区。" }); return; }
  ctx.postState({ status: "running", message: "正在扫描 UUID…" });
  const root = vscode.Uri.file(ctx.workspaceRoot);
  const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE);
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
      uuidValues: [...new Set(occurrences.map((item) => item.value.toLocaleLowerCase()))],
    });
  }
  const uniqueValues = [...new Set(files.flatMap((file) => file.uuidValues))].sort();
  const occupied = new Set(uniqueValues);
  const replacements = uniqueValues.map((from) => {
    let to = randomUUID();
    while (occupied.has(to)) to = randomUUID();
    occupied.add(to);
    return { from, to };
  });
  session = { root: ctx.workspaceRoot, files, replacements };
  const results = toResults(files, replacements);
  const hits = results.reduce((sum, file) => sum + file.issueCount, 0);
  const message = `已扫描 ${uris.length} 个文本文件，命中 ${hits} 处 UUID（${replacements.length} 组）；映射已在本次会话固定。`;
  ctx.postState({ status: "done", message, results, scanned: uris.length, issueFiles: files.length });
  ctx.log(`[UUID] ${message}`);
}

async function applyUuids(ctx: ToolRunContext): Promise<void> {
  if (!session || session.root !== ctx.workspaceRoot || !session.replacements.length) {
    ctx.postState({ status: "error", message: "请先扫描 UUID；映射仅在当前工作区会话内有效。" });
    return;
  }
  const picks = await vscode.window.showQuickPick(
    session.replacements.map((item) => ({ label: item.from, description: `→ ${item.to}`, picked: true })),
    { canPickMany: true, title: "选择要替换的 UUID 映射", placeHolder: "同一个旧 UUID 在所有命中文件中将替换为同一个新 UUID" },
  );
  if (!picks?.length) return;
  const selected = new Set(picks.map((item) => item.label.toLocaleLowerCase()));
  const replacements = session.replacements.filter((item) => selected.has(item.from.toLocaleLowerCase()));
  const files = session.files.filter((file) => file.uuidValues.some((value) => selected.has(value)));
  if (await vscode.window.showWarningMessage(`将替换 ${replacements.length} 组 UUID，影响 ${files.length} 个文件。是否确认写盘？`, { modal: true }, "应用替换") !== "应用替换") return;
  const written: string[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    try {
      if (!equal(await vscode.workspace.fs.readFile(file.uri), file.raw)) { rejected.push(`${file.relativePath}（文件已变化）`); continue; }
      const output = pnwReplaceUuidOccurrences(file.text, replacements);
      if (output === file.text) continue;
      await vscode.workspace.fs.writeFile(file.uri, encode(file, output));
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

function toResults(files: readonly KtcUuidFileSnapshot[], replacements: readonly PnwUuidReplacement[]): FileResultSummary[] {
  const replacementByValue = new Map(replacements.map((item) => [item.from.toLocaleLowerCase(), item.to]));
  return files.map((file) => {
    const occurrences = pnwFindUuidOccurrences(file.text);
    return {
      file: file.relativePath,
      relativePath: file.relativePath,
      fullPath: file.uri.fsPath,
      issueCount: occurrences.length,
      topLine: occurrences[0]?.line ?? 1,
      issues: occurrences.map((item) => ({
        line: item.line, column: item.column, byte: 0, kind: "UUID",
        fromLabel: item.value, toLabel: replacementByValue.get(item.value.toLocaleLowerCase()) ?? "—",
        suggestedAscii: undefined, context: "可选择 UUID 映射后写盘",
      })),
    };
  });
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
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  const position = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}
