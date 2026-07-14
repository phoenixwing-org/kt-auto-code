import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { ktcReadCaaEnvironment } from "./caaEnvironment.js";

const SETTINGS_QUERY = "@ext:kuntai.kt-auto-code";

export type KtcCaaExternalEditor = { readonly command: string; readonly args: readonly string[] };

/** Opens the built-in VS Code settings UI; the extension does not maintain a duplicate settings Webview. */
export async function ktcOpenCaaSettings(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.openSettings", SETTINGS_QUERY);
}

export function ktcReadCaaSettingsStatus(): { readonly text: string; readonly complete: boolean } {
  const config = vscode.workspace.getConfiguration("ktAutoCode");
  const environment = ktcReadCaaEnvironment({
    customRoot: config.get<string>("environment.rootDir", ""),
    thirdPartyRoot: config.get<string>("environment.rootDir3rdParty", ""),
    coreRoot: config.get<string>("environment.rootDirCore", ""),
    caaMkVersion: config.get<string>("environment.mkVersion", ""),
  });
  const labels = environment.values.map((value) => `${value.environmentVariable}：${value.value ? value.source === "workspace" ? "工作区覆盖" : "系统" : "未设定"}`);
  return { complete: environment.complete, text: labels.join("；") };
}

export function ktcReadCaaExternalEditor(): KtcCaaExternalEditor {
  const config = vscode.workspace.getConfiguration("ktAutoCode.caa.externalEditor");
  const command = config.get<string>("command", "").trim();
  const args = config.get<readonly string[]>("args", ["${file}"]).filter((arg): arg is string => typeof arg === "string");
  return { command, args };
}

/** Starts only a command explicitly configured by the user. No shell is used and no file is modified. */
export async function ktcOpenCaaInExternalEditor(file: vscode.Uri, workspaceRoot?: string): Promise<void> {
  if (file.scheme !== "file") throw new Error("外部编辑器仅支持本地文件 URI");
  const editor = ktcReadCaaExternalEditor();
  if (!editor.command) {
    await ktcOpenCaaSettings();
    throw new Error("请先在设置中填写 ktAutoCode.caa.externalEditor.command");
  }
  const args = editor.args.map((arg) => arg.replaceAll("${file}", file.fsPath).replaceAll("${workspace}", workspaceRoot ?? ""));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(editor.command, args, { shell: false, windowsHide: true, detached: false });
    child.once("error", (error) => reject(new Error(`无法启动外部编辑器：${error.message}`)));
    child.once("spawn", () => resolve());
  });
}
