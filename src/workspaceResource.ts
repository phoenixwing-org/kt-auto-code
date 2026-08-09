import * as vscode from "vscode";
import { ktcIsPathInsideWorkspace } from "./core/workspace/workspacePath.js";
import { ktcHighlightLiteralMatches } from "./workbench/editorMatchHighlight.js";

export interface KtcOpenWorkspaceResourceRequest {
  root: string;
  target: string;
  kind: "directory" | "text";
  line?: number;
  highlightTerms?: readonly string[];
}

export async function ktcOpenWorkspaceResource(
  request: KtcOpenWorkspaceResourceRequest,
): Promise<boolean> {
  if (!ktcIsPathInsideWorkspace(request.root, request.target)) return false;
  const uri = vscode.Uri.file(request.target);
  if (request.kind === "directory") {
    await vscode.commands.executeCommand("revealInExplorer", uri);
    return true;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: vscode.ViewColumn.Active,
  });
  if (request.line !== undefined) {
    const position = new vscode.Position(Math.max(0, request.line - 1), 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }
  ktcHighlightLiteralMatches(editor, request.highlightTerms ?? []);
  return true;
}
