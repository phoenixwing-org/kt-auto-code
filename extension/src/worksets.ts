import * as vscode from "vscode";
import { pnwParseWorksetDocument, type PnwWorksetParseResult } from "phoenix-wing/code-core";

export type KtcWorksetReadResult = PnwWorksetParseResult & { readonly relativePath: ".phoenix/worksets.json"; readonly exists: boolean };

/** Reads and validates the documented workspace-local workset file without expanding globs. */
export async function ktcReadWorkspaceWorksets(root: vscode.Uri): Promise<KtcWorksetReadResult> {
  const uri = vscode.Uri.joinPath(root, ".phoenix", "worksets.json");
  try {
    const raw = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    return { ...pnwParseWorksetDocument(text), relativePath: ".phoenix/worksets.json", exists: true };
  } catch (error) {
    if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
      return { valid: true, document: { version: 1, worksets: [] }, diagnostics: [], relativePath: ".phoenix/worksets.json", exists: false };
    }
    return { valid: false, diagnostics: [error instanceof Error ? `无法读取工作集：${error.message}` : "无法读取工作集"], relativePath: ".phoenix/worksets.json", exists: true };
  }
}
