import * as vscode from "vscode";
import iconv from "iconv-lite";
import { relative } from "node:path";
import { pnwReorderCppText, pnwReorderHeaderText } from "phoenix-wing/code-core";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { ReorderMembersPanel, type KtcReorderPreviewRow, type KtcReorderApplyResult, type KtcReorderMembersPanelActions, type KtcReorderRevertResult } from "../../workbench/reorderMembersPanel.js";

const INCLUDE = "**/*.{h,hpp,hh,cc,cpp,cxx}";
const EXCLUDE = "**/{.git,node_modules,dist,build,out,target}/**";
const BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);
type Encoding = "utf8" | "gbk";
type Snapshot = KtcReorderPreviewRow & { raw: Uint8Array; after: string; encodingKind: Encoding; bom: boolean };

export const reorderMembersTool: KtTool = {
  id: "reorderMembers", title: "C++ 成员排序", description: "扫描、预览、确认写回 C++ 成员排序。", icon: "media/tools/member-sort.svg",
  getPanelModel(): ToolPanelModel { return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } }; },
  registerCommands(context): void { context.subscriptions.push(vscode.commands.registerCommand("ktAutoCode.reorderMembers.preview", () => { const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; if (root) void runPreview({ workspaceRoot: root, workspaceLabel: root, postState: () => undefined, log: () => undefined }); })); },
  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> { if (message.type === "run" && message.toolId === this.id) await runPreview(ctx); },
  async runAction(action: string, ctx: ToolRunContext): Promise<void> { if (action === "preview" || action === "scan") await runPreview(ctx); },
};

async function runPreview(ctx: ToolRunContext): Promise<void> {
  if (!ctx.workspaceRoot) { ctx.postState({ status: "error", message: "请先打开工作区。" }); return; }
  ctx.postState({ status: "running", message: "正在生成 C++ 成员排序预览…" });
  const root = vscode.Uri.file(ctx.workspaceRoot);
  const candidates = (await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE)).map(uri => ({ file: uri.fsPath, relativePath: relative(ctx.workspaceRoot!, uri.fsPath).replace(/\\/g, "/"), kind: /\.(?:h|hpp|hh)$/i.test(uri.fsPath) ? "header" as const : "source" as const })).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const snapshots = await Promise.all(candidates.map(previewFile));
  const byUri = new Map(snapshots.map(row => [row.uri.toString(), row]));
  const actions: KtcReorderMembersPanelActions = {
    openFile: async uri => { const row = byUri.get(uri); if (row) await vscode.window.showTextDocument(row.uri, { preview: true }); },
    openGitDiff: async uri => {
      const row = byUri.get(uri);
      if (!row || !await openGitChanges([row], ctx)) void vscode.window.showWarningMessage("无法打开 VS Code Git 变更，请在源代码管理中查看。");
    },
    revert: async uri => revertSnapshot(uri, byUri, ctx),
    apply: async uris => applySnapshots(uris, byUri, ctx),
  };
  ReorderMembersPanel.show(snapshots, candidates.length, actions);
  const changed = snapshots.filter(row => row.changed).length;
  ctx.postState({ status: "done", message: `已扫描 ${candidates.length} 个 C++ 文件，其中 ${changed} 个可排序；请在编辑区 View 中预览、勾选并确认写回。`, scanned: candidates.length });
  ctx.log(`[成员排序] 扫描 ${candidates.length} 个文件；${changed} 个有变更。`);
}

async function previewFile(candidate: { file: string; relativePath: string; kind: "header" | "source" }): Promise<Snapshot> {
  const uri = vscode.Uri.file(candidate.file);
  let raw: Uint8Array;
  try { raw = await vscode.workspace.fs.readFile(uri); } catch (error) { return failed(uri, candidate, `无法读取：${error instanceof Error ? error.message : "未知错误"}`); }
  const decoded = decode(raw);
  if (!decoded) return failed(uri, candidate, "无法识别文件编码，仅支持 UTF-8 / UTF-8 BOM / GBK");
  const result = candidate.kind === "header" ? pnwReorderHeaderText(decoded.text) : pnwReorderCppText(decoded.text, candidate.relativePath.replace(/^.*\//, "").replace(/\.[^.]+$/, ""));
  return { uri, relativePath: candidate.relativePath, kind: candidate.kind, encoding: decoded.encoding === "gbk" ? "GBK" : decoded.bom ? "UTF-8 BOM" : "UTF-8", changed: result.changed, state: result.changed ? "pending" : "unchanged", warnings: candidate.kind === "header" ? result.warnings : [], raw, after: result.text, encodingKind: decoded.encoding, bom: decoded.bom };
}

function failed(uri: vscode.Uri, candidate: { relativePath: string; kind: "header" | "source" }, warning: string): Snapshot { return { uri, relativePath: candidate.relativePath, kind: candidate.kind, encoding: "未知", changed: false, state: "blocked", warnings: [warning], raw: new Uint8Array(), after: "", encodingKind: "utf8", bom: false }; }

function decode(raw: Uint8Array): { text: string; encoding: Encoding; bom: boolean } | undefined {
  const bom = raw.length >= 3 && BOM.every((value, index) => value === raw[index]);
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bom ? raw.subarray(3) : raw), encoding: "utf8", bom }; } catch { if (bom) return undefined; }
  const text = iconv.decode(Buffer.from(raw), "gbk");
  return equal(iconv.encode(text, "gbk"), raw) ? { text, encoding: "gbk", bom: false } : undefined;
}

function encode(row: Snapshot): Uint8Array {
  if (row.encodingKind === "gbk") { const out = iconv.encode(row.after, "gbk"); if (iconv.decode(out, "gbk") !== row.after) throw new Error("排序结果无法写入 GBK"); return out; }
  const out = Buffer.from(row.after, "utf8"); return row.bom ? Buffer.concat([Buffer.from(BOM), out]) : out;
}
function equal(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((v, i) => v === b[i]); }

async function revertSnapshot(uri: string, rows: ReadonlyMap<string, Snapshot>, ctx: ToolRunContext): Promise<KtcReorderRevertResult> {
  const row = rows.get(uri);
  if (!row || row.state !== "applied") return { uri, state: "blocked", warning: "当前文件不在可还原状态" };
  const action = await vscode.window.showWarningMessage(
    `将恢复 ${row.relativePath} 到本次成员排序前的内容；会保留扫描前已有的改动。是否继续？`,
    { modal: true },
    "还原",
  );
  if (action !== "还原") return { uri, state: "cancelled" };
  try {
    if (!equal(await vscode.workspace.fs.readFile(row.uri), encode(row))) {
      const warning = "写盘后文件已被修改，未执行还原";
      row.state = "blocked";
      return { uri, state: "blocked", warning };
    }
    await vscode.workspace.fs.writeFile(row.uri, row.raw);
    row.state = "reverted";
    await vscode.commands.executeCommand("git.refresh");
    const message = `已还原 ${row.relativePath} 到成员排序前的内容。`;
    ctx.log(`[成员排序还原] ${message}`);
    ctx.postState({ status: "done", message });
    return { uri, state: "reverted" };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "还原失败";
    row.state = "blocked";
    ctx.log(`[成员排序还原] ${row.relativePath}：${warning}`);
    return { uri, state: "blocked", warning };
  }
}

async function applySnapshots(uris: readonly string[], rows: ReadonlyMap<string, Snapshot>, ctx: ToolRunContext): Promise<KtcReorderApplyResult> {
  const selected = uris.map(uri => rows.get(uri)).filter((row): row is Snapshot => Boolean(row?.changed));
  if (!selected.length) return { updates: [] };
  if (await vscode.window.showWarningMessage(`将写入 ${selected.length} 个成员排序变更。`, { modal: true }, "应用排序") !== "应用排序") return { updates: [] };
  const applied: Snapshot[] = []; const rejected: string[] = [];
  const updates: KtcReorderApplyResult["updates"] = [];
  for (const row of selected) try { if (!equal(await vscode.workspace.fs.readFile(row.uri), row.raw)) { const warning = "文件已被外部修改，未写入"; row.state = "blocked"; rejected.push(`${row.relativePath}（文件已变化）`); updates.push({ uri: row.uri.toString(), state: "blocked", warning }); continue; } await vscode.workspace.fs.writeFile(row.uri, encode(row)); row.state = "applied"; applied.push(row); updates.push({ uri: row.uri.toString(), state: "applied" }); } catch (error) { const warning = error instanceof Error ? error.message : "写入失败"; row.state = "blocked"; rejected.push(`${row.relativePath}（${warning}）`); updates.push({ uri: row.uri.toString(), state: "blocked", warning }); }
  const message = rejected.length ? `已写入 ${applied.length} 个文件；未写入 ${rejected.length} 个：${rejected.join("；")}` : `已写入 ${applied.length} 个文件；可在表格的操作列按需预览 Git 差异。`;
  ctx.log(`[成员排序应用] ${message}`); ctx.postState({ status: rejected.length ? "error" : "done", message }); void vscode.window.showInformationMessage(message);
  return { updates };
}

async function openGitChanges(rows: readonly Snapshot[], ctx: ToolRunContext): Promise<boolean> {
  if (!rows.length) return true;
  try {
    await vscode.commands.executeCommand("git.refresh");
    for (const row of rows) await vscode.commands.executeCommand("git.openChange", row.uri);
    return true;
  } catch (error) {
    ctx.log(`[成员排序应用] 无法打开 VS Code Git 变更：${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
