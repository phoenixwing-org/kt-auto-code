import { relative } from "node:path";
import * as vscode from "vscode";
import { pnwIsCaaDialogHandoff, type PnwCaaDialogHandoff } from "@phoenix-wing/code-core";
import { isIgnoredPath } from "../../core/dotIgnore.js";
import type { CaaDialogFileResultSummary, KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";
import { ktcProbeDeskTools } from "../../caaDeskBridge.js";
import {
  ktcOpenCaaInExternalEditor,
  ktcOpenCaaSettings,
  ktcReadCaaExternalEditor,
  ktcResolveCaaOpenEndpoint,
} from "../../caaSettings.js";
import { ktcReadProjectEnvironmentStatus } from "../../projectEnvironment.js";
import { resolveWorkspaceIgnorePatterns } from "../../ignoreConfig.js";
import { ktcFileInWorkspaceScope, ktcResolveWorkspaceFileScope } from "../../worksets.js";

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

export const caaDialogTool: KtTool = {
  id: "caaDialog",
  title: "CAA UI",
  description: "扫描 .CATDlg，并连接 Desk Tools 图形编辑器。",
  icon: "media/tools/code-rename.svg",
  ribbonVisible: false,
  getPanelModel(): ToolPanelModel { return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon, ribbonVisible: this.ribbonVisible } }; },
  registerCommands(context): void {
    const invoke = (action: "scan" | "settings") => async () => {
      await vscode.commands.executeCommand("ktAutoCode.tool.show", this.id);
      const ctx = runContextFactory?.();
      if (ctx) await runCaaDialogAction(action, ctx);
    };
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.caaDialog.scan", invoke("scan")),
      vscode.commands.registerCommand("ktAutoCode.caaDialog.selectFiles", invoke("scan")),
      vscode.commands.registerCommand("ktAutoCode.caa.openSettings", invoke("settings")),
      vscode.commands.registerCommand(VIEW_ID, () => getHandoff()),
    );
  },
  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) {
      if (message.action === "checkConnection") await checkDeskConnection(ctx);
      else await runCaaDialogAction(message.action === "fix" ? "settings" : "scan", ctx);
    }
    if (message.type === "openIssue" && message.toolId === this.id) await openFile(message.file);
    if (message.type === "caaDialogAction" && message.toolId === this.id) await runCaaFileAction(message.action, message.uri, ctx);
  },
  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (action === "checkConnection") await checkDeskConnection(ctx);
    else await runCaaDialogAction(action === "fix" ? "settings" : "scan", ctx);
  },
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
  let scope;
  try { scope = await ktcResolveWorkspaceFileScope(root, ctx.workspaceFileScopeId); }
  catch (error) { ctx.postState({ status: "error", message: error instanceof Error ? error.message : String(error) }); return; }
  const ignorePatterns = resolveWorkspaceIgnorePatterns(ctx.workspaceRoot, ctx.pluginIgnoreEnabled);
  const files = (await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE))
    .filter((uri) => ktcFileInWorkspaceScope(uri, scope))
    .filter((uri) => !isIgnoredPath(relative(ctx.workspaceRoot!, uri.fsPath).replace(/\\/g, "/"), ignorePatterns))
    .map((uri) => ({ uri, relativePath: relative(ctx.workspaceRoot!, uri.fsPath).replace(/\\/g, "/") }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  session = { workspaceUri: root.toString(), files, selected: [] };
  const settings = await ktcReadProjectEnvironmentStatus();
  const message = `范围“${scope.label}”已定位 ${files.length} 个 .CATDlg 文件；请在当前 Block 中按需打开文件或外部编辑器。工程环境：${settings.text}${settings.complete ? "" : "（必填根目录未完整设定）"}`;
  ctx.postState({ status: "done", message, scanned: files.length, issueFiles: files.length, caaDialogResults: caaResultRows(), caaSettingsText: settings.text });
  ctx.log(`[CAA UI] ${message}`);
  await checkDeskConnection(ctx);
}

async function checkDeskConnection(ctx: ToolRunContext): Promise<void> {
  if (vscode.env.remoteName) {
    ctx.postState({
      status: "idle",
      caaDeskConnection: { status: "incompatible", text: `远程 ${vscode.env.remoteName} 工作区不能连接本机 Desk Tools`, checkedAt: new Date().toISOString() },
    });
    return;
  }
  const editor = ktcReadCaaExternalEditor();
  const checkedAt = new Date().toISOString();
  if (editor.command) {
    ctx.postState({
      status: "idle",
      caaDeskConnection: { status: "custom-command", text: "使用自定义外部编辑器命令（不探测 Desk Tools）", checkedAt },
    });
    return;
  }
  const resolved = ktcResolveCaaOpenEndpoint(editor);
  if (!resolved) {
    ctx.postState({
      status: "idle",
      caaDeskConnection: { status: "incompatible", text: editor.discoveryMode === "disabled" ? "Desk Tools 交接已禁用" : "未发现 Desk Tools 服务", checkedAt },
    });
    return;
  }
  ctx.postState({ status: "idle", caaDeskConnection: { status: "checking", text: "正在连接 Desk Tools…", endpoint: resolved.endpoint, checkedAt } });
  const connection = await ktcProbeDeskTools(resolved.endpoint);
  ctx.postState({ status: "idle", caaDeskConnection: { ...connection, checkedAt: new Date().toISOString() } });
}

async function openSettings(ctx: ToolRunContext): Promise<void> {
  await ktcOpenCaaSettings();
  const settings = await ktcReadProjectEnvironmentStatus();
  ctx.postState({ status: "done", message: `已打开 Desk Tools 设置。当前环境：${settings.text}`, caaSettingsText: settings.text });
}

async function openFile(file: string): Promise<void> {
  await vscode.window.showTextDocument(vscode.Uri.parse(file), { preview: true });
}

function caaResultRows(): CaaDialogFileResultSummary[] {
  const selected = new Set(session?.selected.map((file) => file.uri.toString()) ?? []);
  return (session?.files ?? []).map((file) => ({
    uri: file.uri.toString(),
    relativePath: file.relativePath,
    selected: selected.has(file.uri.toString()),
  }));
}

async function runCaaFileAction(
  action: "open" | "openExternal",
  uri: string,
  ctx: ToolRunContext,
): Promise<void> {
  const selected = session?.files.find((file) => file.uri.toString() === uri);
  if (!ctx.workspaceRoot || !session || !selected || session.workspaceUri !== vscode.Uri.file(ctx.workspaceRoot).toString()) {
    ctx.postState({ status: "error", message: "CAA UI 结果已失效，请重新扫描。" });
    return;
  }
  try {
    if (action === "open") await openFile(uri);
    else {
      const transport = await ktcOpenCaaInExternalEditor(selected.uri, ctx.workspaceRoot);
      session.selected = [selected];
      const checkedAt = new Date().toISOString();
      ctx.postState({
        status: "done",
        message: transport === "desk-tools" ? `Desk Tools 已接受 ${selected.relativePath}` : `已交给外部编辑器：${selected.relativePath}`,
        caaDialogResults: caaResultRows(),
        caaDeskConnection: transport === "desk-tools"
          ? { status: "online", text: "Desk Tools 桌面服务已连接", endpoint: ktcResolveCaaOpenEndpoint()?.endpoint, checkedAt }
          : { status: "custom-command", text: "使用自定义外部编辑器命令", checkedAt },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.postState({
      status: "error",
      message,
      caaDialogResults: caaResultRows(),
      ...(message.startsWith("无法连接 Desk Tools") ? {
        caaDeskConnection: { status: "offline" as const, text: "Desk Tools 未启动或不可连接", endpoint: ktcReadCaaExternalEditor().endpoint, checkedAt: new Date().toISOString() },
      } : {}),
    });
  }
}
