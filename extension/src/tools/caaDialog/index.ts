import { relative } from "node:path";
import * as vscode from "vscode";
import type { FileResultSummary, KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";

const VIEW_ID = "ktAutoCode.caaDialog.getHandoff";
const INCLUDE = "**/*.{CATDlg,catdlg}";
const EXCLUDE = "**/{.git,node_modules,dist,build,out,target}/**";

type KtcCaaDialogFile = { readonly uri: vscode.Uri; readonly relativePath: string };
type KtcCaaDialogSession = { readonly workspaceUri: string; readonly files: readonly KtcCaaDialogFile[]; selected: readonly KtcCaaDialogFile[] };

/**
 * Versioned, data-only handoff for a future local Desk Tools bridge. The VS Code
 * extension does not parse or write CATDlg files and never embeds the Desk UI.
 */
export type KtcCaaDialogHandoff = {
  readonly protocol: "phoenix-desk-tools.caa-dialog.v1";
  readonly workspaceUri: string;
  readonly selectedFiles: readonly { readonly uri: string; readonly relativePath: string }[];
};

let session: KtcCaaDialogSession | undefined;
let runContextFactory: (() => ToolRunContext | undefined) | undefined;

export const caaDialogTool: KtTool = {
  id: "caaDialog",
  title: "CAA 对话框",
  description: "筛选 .CATDlg 文件并生成 Desk Tools 编辑器交接数据。",
  icon: "media/tools/code-rename.svg",
  getPanelModel(): ToolPanelModel { return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } }; },
  registerCommands(context): void {
    const invoke = (action: "scan" | "select") => () => {
      const ctx = runContextFactory?.();
      if (ctx) void runCaaDialogAction(action, ctx);
    };
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.caaDialog.scan", invoke("scan")),
      vscode.commands.registerCommand("ktAutoCode.caaDialog.selectFiles", invoke("select")),
      vscode.commands.registerCommand(VIEW_ID, () => getHandoff()),
    );
  },
  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) await runCaaDialogAction(message.action === "fix" ? "select" : "scan", ctx);
    if (message.type === "openIssue" && message.toolId === this.id) await openFile(message.file);
  },
  async runAction(action: string, ctx: ToolRunContext): Promise<void> { await runCaaDialogAction(action === "fix" ? "select" : "scan", ctx); },
};

export function setCaaDialogRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

export function getHandoff(): KtcCaaDialogHandoff | undefined {
  if (!session?.selected.length) return undefined;
  return {
    protocol: "phoenix-desk-tools.caa-dialog.v1",
    workspaceUri: session.workspaceUri,
    selectedFiles: session.selected.map((file) => ({ uri: file.uri.toString(), relativePath: file.relativePath })),
  };
}

async function runCaaDialogAction(action: "scan" | "select", ctx: ToolRunContext): Promise<void> {
  if (action === "scan") await scan(ctx);
  else await select(ctx);
}

async function scan(ctx: ToolRunContext): Promise<void> {
  if (!ctx.workspaceRoot) { ctx.postState({ status: "error", message: "请先打开工作区。" }); return; }
  ctx.postState({ status: "running", message: "正在定位 .CATDlg 文件…" });
  const root = vscode.Uri.file(ctx.workspaceRoot);
  const files = (await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE))
    .map((uri) => ({ uri, relativePath: relative(ctx.workspaceRoot!, uri.fsPath).replace(/\\/g, "/") }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  session = { workspaceUri: root.toString(), files, selected: [] };
  const message = `已定位 ${files.length} 个 .CATDlg 文件；请点击“选择文件”生成 Desk Tools 交接数据。`;
  ctx.postState({ status: "done", message, results: toResults(files), scanned: files.length, issueFiles: files.length });
  ctx.log(`[CAA 对话框] ${message}`);
}

async function select(ctx: ToolRunContext): Promise<void> {
  if (!session || session.workspaceUri !== vscode.Uri.file(ctx.workspaceRoot ?? "").toString()) {
    ctx.postState({ status: "error", message: "请先扫描 .CATDlg 文件。" });
    return;
  }
  const selectedUris = new Set(session.selected.map((file) => file.uri.toString()));
  const picks = await vscode.window.showQuickPick(
    session.files.map((file) => ({ label: file.relativePath, description: ".CATDlg", picked: selectedUris.has(file.uri.toString()), file })),
    { canPickMany: true, title: "选择要交给 Desk Tools 编辑的 CAA 对话框", placeHolder: "只传 URI 与相对路径；解析、修改和写盘仍由 Desk Tools 负责" },
  );
  if (!picks) return;
  session.selected = picks.map((item) => item.file);
  const handoff = getHandoff();
  const message = handoff
    ? `已选择 ${handoff.selectedFiles.length} 个 .CATDlg 文件；Desk Tools 桥接可读取命令 ${VIEW_ID} 的 v1 交接数据。`
    : "未选择文件；没有生成 Desk Tools 交接数据。";
  ctx.postState({ status: "done", message, results: toResults(session.files), scanned: session.files.length, issueFiles: session.selected.length });
  ctx.log(`[CAA 对话框] ${message}`);
  void vscode.window.showInformationMessage(message);
}

function toResults(files: readonly KtcCaaDialogFile[]): FileResultSummary[] {
  return files.map((file) => ({
    file: file.relativePath, relativePath: file.relativePath, fullPath: file.uri.fsPath,
    issueCount: 1, topLine: 1,
    issues: [{ line: 1, column: 1, byte: 0, kind: "CATDlg", fromLabel: ".CATDlg", toLabel: "可选择", context: "仅定位；不在 VS Code 中解析或写回" }],
  }));
}

async function openFile(file: string): Promise<void> {
  await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true });
}
