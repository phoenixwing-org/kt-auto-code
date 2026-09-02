import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { KtcProjectRenameTextDiff } from "./textDiff.js";

export const KTC_PROJECT_RENAME_DIFF_SCHEME = "kt-auto-code-project-rename-preview";
const KTC_PROJECT_RENAME_DIFF_DOCUMENT_LIMIT = 20;

/** Read-only virtual documents used only as the two sides of VS Code's native Diff Editor. */
export class KtcProjectRenameDiffDocumentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly documents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.documents.get(uri.toString()) ?? "项目改名差异内容已过期，请重新打开预览。";
  }

  async show(diff: KtcProjectRenameTextDiff): Promise<void> {
    const token = randomUUID();
    const relativePath = diff.relativePath.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "") || "content.txt";
    const originalUri = vscode.Uri.from({
      scheme: KTC_PROJECT_RENAME_DIFF_SCHEME,
      path: `/${diff.reportId}/${token}/原始/${relativePath}`,
    });
    const targetUri = vscode.Uri.from({
      scheme: KTC_PROJECT_RENAME_DIFF_SCHEME,
      path: `/${diff.reportId}/${token}/计划/${relativePath}`,
    });
    this.remember(originalUri, diff.originalText);
    this.remember(targetUri, diff.targetText);
    await vscode.commands.executeCommand(
      "vscode.diff",
      originalUri,
      targetUri,
      `项目改名预览：${relativePath}`,
      { preview: true },
    );
  }

  dispose(): void {
    this.documents.clear();
  }

  private remember(uri: vscode.Uri, content: string): void {
    this.documents.set(uri.toString(), content);
    while (this.documents.size > KTC_PROJECT_RENAME_DIFF_DOCUMENT_LIMIT) {
      const oldest = this.documents.keys().next().value as string | undefined;
      if (!oldest) break;
      this.documents.delete(oldest);
    }
  }
}
