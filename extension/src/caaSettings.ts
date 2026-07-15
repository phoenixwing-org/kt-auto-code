import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { ktcSubmitCaaDialog } from "./caaDeskBridge.js";

const SETTINGS_QUERY = "@ext:kuntai.kt-auto-code";

export type KtcCaaExternalEditor = {
  readonly command: string;
  readonly args: readonly string[];
  readonly endpoint: string;
};

/** Opens plugin-owned settings only; operating-system environment values live in the Environment Block. */
export async function ktcOpenCaaSettings(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", SETTINGS_QUERY);
}

export function ktcReadCaaExternalEditor(): KtcCaaExternalEditor {
  const config = vscode.workspace.getConfiguration("ktAutoCode.caa.externalEditor");
  const command = config.get<string>("command", "").trim();
  const args = config.get<readonly string[]>("args", ["${file}"]).filter((arg): arg is string => typeof arg === "string");
  const endpoint = config.get<string>("endpoint", "http://127.0.0.1:5180/api/caa/dialog/open").trim();
  return { command, args, endpoint };
}

/** Submit to a running Desk Tools server, or start an explicitly configured executable. */
export async function ktcOpenCaaInExternalEditor(file: vscode.Uri, workspaceRoot?: string): Promise<"desk-tools" | "command"> {
  if (file.scheme !== "file") throw new Error("外部编辑器仅支持本地文件 URI");
  const editor = ktcReadCaaExternalEditor();
  if (!editor.command && editor.endpoint) {
    await ktcSubmitCaaDialog(editor.endpoint, { workspaceRoot, file: file.fsPath });
    return "desk-tools";
  }
  if (!editor.command) {
    await ktcOpenCaaSettings();
    throw new Error("请配置 Desk Tools 接口地址或外部编辑器命令");
  }
  const args = editor.args.map((arg) => arg.replaceAll("${file}", file.fsPath).replaceAll("${workspace}", workspaceRoot ?? ""));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor.command, args, { shell: false, windowsHide: true, detached: false });
    child.once("error", (error) => reject(new Error(`无法启动外部编辑器：${error.message}`)));
    child.once("spawn", () => resolve());
  });
  return "command";
}
