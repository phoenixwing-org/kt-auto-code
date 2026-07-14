import * as vscode from "vscode";
import { relative } from "node:path";
import type { KtTool, ToolPanelModel, ToolRunContext, WebviewInboundMessage } from "../types.js";

const INCLUDE = "**/*.{h,hpp,hh,c,cc,cpp,cxx}";
const EXCLUDE = "**/{.git,node_modules,dist,build,out,target}/**";

export const reorderMembersTool: KtTool = {
  id: "reorderMembers",
  title: "C++ 成员排序",
  description: "扫描 C++ 头文件和源文件；排序引擎整合 POC。",
  icon: "media/tools/member-sort.svg",

  getPanelModel(): ToolPanelModel {
    return { summary: { id: this.id, title: this.title, description: this.description, icon: this.icon } };
  },

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand("ktAutoCode.reorderMembers.preview", () => {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;
        void runPreview({ workspaceRoot: root, workspaceLabel: root, postState: () => undefined, log: () => undefined });
      }),
    );
  },

  async handleMessage(message: WebviewInboundMessage, ctx: ToolRunContext): Promise<void> {
    if (message.type === "run" && message.toolId === this.id) await runPreview(ctx);
  },

  async runAction(action: string, ctx: ToolRunContext): Promise<void> {
    if (action === "preview" || action === "scan") await runPreview(ctx);
  },
};

async function runPreview(ctx: ToolRunContext): Promise<void> {
  if (!ctx.workspaceRoot) {
    ctx.postState({ status: "error", message: "请先打开工作区。" });
    return;
  }
  ctx.postState({ status: "running", message: "正在扫描 C++ 文件…" });
  const root = vscode.Uri.file(ctx.workspaceRoot);
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(root, INCLUDE), EXCLUDE);
  const candidates = files
    .map((uri) => {
      const file = uri.fsPath;
      const rel = relative(ctx.workspaceRoot!, file).replace(/\\/g, "/");
      return { file, relativePath: rel, kind: /\.(?:h|hpp|hh)$/i.test(file) ? "header" as const : "source" as const };
    })
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  ctx.postState({
    status: "done",
    message: `已扫描 ${candidates.length} 个 C++ 文件。当前 POC 只验证入口和文件范围，排序引擎尚未在插件内写回。`,
    scanned: candidates.length,
    reorderCandidates: candidates.slice(0, 100),
  });
  ctx.log(`[成员排序 POC] 扫描 ${candidates.length} 个 C++ 文件；待接入 phoenix-wing shared core。`);
}
