import * as vscode from "vscode";

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getWorkspaceLabel(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return "（未打开工作区）";
  }
  return folder.name;
}
