import { relative } from "node:path";
import * as vscode from "vscode";
import { pnwIsCaaDialogHandoff, type PnwCaaDialogHandoff } from "phoenix-wing/code-core";
import { isIgnoredPath } from "../../../../src/dotIgnore.js";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { ktcOpenCaaInExternalEditor, ktcOpenCaaSettings, ktcReadCaaSettingsStatus } from "../../caaSettings.js";
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import { KtcCaaDialogResultView } from "../../workbench/caaDialogResultView.js";

const VIEW_ID = "ktAutoCode.caaDialog.getHandoff";
const INCLUDE = "**/*.{CATDlg,catdlg}";
const EXCLUDE = "**/{.git,.phoenix,node_modules,dist,build,out,target}/**";

type KtcCaaDialogFile = { readonly uri: vscode.Uri; readonly relativePath: string };
type KtcCaaDialogSession = { readonly workspaceUri: string; readonly files: readonly KtcCaaDialogFile[]; selected: readonly KtcCaaDialogFile[] };

/**
 * Versioned, data-only handoff for a future local Desk Tools bridge. The VS Code
 * extension does not parse or write CATDlg files and never embeds the Desk UI.
 */
export type KtcCaaDialogHandoff = PnwCaaDialogHandoff;

let session: KtcCaaDialogSession | undefined;
let runContextFactory: (() => ToolRunContext | undefined) | undefined;
let caaDialogResultView: KtcCaaDialogResultView | undefined;

export function registerCaaDialogResultView(context: vscode.ExtensionContext): void {
  caaDialogResultView = new KtcCaaDialogResultView(context);
  context.subscriptions.push(caaDialogResultView);
}

export const caaDialogTool: KtTool = {
  id: "caaDialog",
  title: "CAA 对话框",
  description: "筛选 .CATDlg 文件并生成 Desk Tools 编辑器交接数据。",
  icon: "media/tools/code-rename.svg",
  getPanelModel(): ToolPanelModel { return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } }; },
  registerCommands(context): void {
    const invoke = (action: "scan" | "settings") => () => {
      const ctx = runContextFactory?.();
      if (ctx) void runCaaDialogAction(action, ctx);
    };
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.caaDialog.scan", invoke("scan")),
      vscode.commands.registerCommand("ktAutoCode.caaDialog.selectFiles", invoke("scan")),
      vscode.commands.registerCommand("ktAutoCode.caa.openSettings", invoke("settings")),
      vscode.commands.registerCommand(VIEW_ID, () => getHandoff()),
    );
  },
  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) await runCaaDialogAction(message.action === "fix" ? "settings" : "scan", ctx);
    if (message.type === "openIssue" && message.toolId === this.id) await openFile(message.file);
  },
  async runAction(action: string, ctx: ToolRunContext): Promise<void> { await runCaaDialogAction(action === "fix" ? "settings" : "scan", ctx); },
};

export function setCaaDialogRunContextFactory(factory: () => ToolRunContext | undefined): void {
  runContextFactory = factory;
}

export function getHandoff(): KtcCaaDialogHandoff | undefined {
  if (!session?.selected.length) return undefined;
  const handoff: KtcCaaDialogHandoff = {
    protocol: "phoenix-desk-tools.caa-dialog.v1",
    workspaceUri: session.workspaceUri,
    selectedFiles: session.selected.map((file) => ({ uri: file.uri.toString(), relativePath: file.relativePath })),
  };
  return pnwIsCaaDialogHandoff(handoff) ? handoff : undefined;
}

async function runCaaDialogAction(action: "scan" | "settings", ctx: ToolRunContext): Promise<void> {
  if (action === "scan") await scan(ctx);
  else await openSettings(ctx);
}

async function scan(ctx: ToolRunContext): Promise<void> {
  if (!ctx.workspaceRoot) { ctx.postState({ status: "error", message: "请先打开工作区。" }); return; }
  ctx.postState({ status: "running", message: "正在定位 .CATDlg 文件…" });
  const root = vscode.Uri.file(ctx.workspaceRoot);
  const ignorePatterns = resolveWorkspaceIgnorePatterns(ctx.workspaceRoot);
  const files = (await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE))
    .filter((uri) => !isIgnoredPath(relative(ctx.workspaceRoot!, uri.fsPath).replace(/\\/g, "/"), ignorePatterns))
    .map((uri) => ({ uri, relativePath: relative(ctx.workspaceRoot!, uri.fsPath).replace(/\\/g, "/") }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  session = { workspaceUri: root.toString(), files, selected: [] };
  caaDialogResultView?.show(files, {
    openFile,
    openExternalEditor: async (uri) => {
      const selected = session?.files.find((file) => file.uri.toString() === uri);
      await ktcOpenCaaInExternalEditor(vscode.Uri.parse(uri), ctx.workspaceRoot);
      if (session && selected) session.selected = [selected];
    },
  });
  const settings = ktcReadCaaSettingsStatus();
  const message = `已定位 ${files.length} 个 .CATDlg 文件；请在 Primary Sidebar 的“CAA 对话框”列表中按需打开外部编辑器。工程环境：${settings.text}${settings.complete ? "" : "（必填根目录未完整设定）"}`;
  ctx.postState({ status: "done", message, scanned: files.length, issueFiles: files.length });
  ctx.log(`[CAA 对话框] ${message}`);
}

async function openSettings(ctx: ToolRunContext): Promise<void> {
  await ktcOpenCaaSettings();
  const settings = ktcReadCaaSettingsStatus();
  ctx.postState({ status: "done", message: `已打开 CAA 设置。当前环境：${settings.text}` });
}

async function openFile(file: string): Promise<void> {
  await vscode.window.showTextDocument(vscode.Uri.parse(file), { preview: true });
}
