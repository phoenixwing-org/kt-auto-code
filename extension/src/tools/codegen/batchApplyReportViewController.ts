import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { KtcCodegenBatchApplyReport } from "./batchApplyReport.js";
import { getCodegenBatchApplyReportHtml } from "./batchApplyReportHtml.js";

export type KtcCodegenBatchApplyReportAction =
  | { readonly kind: "json"; readonly uri: string }
  | { readonly kind: "issue"; readonly file: string; readonly line?: number };

export interface KtcCodegenBatchApplyReportViewCallbacks {
  readonly openCodegenJson: (uri: string) => Promise<void>;
}

/** Webview 消息不可信；只允许打开当前报告 DTO 中真实存在的 JSON 或问题位置。 */
export function ktcResolveCodegenBatchApplyReportAction(
  report: KtcCodegenBatchApplyReport,
  message: unknown,
): KtcCodegenBatchApplyReportAction | undefined {
  if (!isRecord(message) || typeof message.type !== "string") return undefined;
  if (message.type === "openJson" && typeof message.uri === "string") {
    const item = report.items.find((candidate) => candidate.uri === message.uri);
    return item ? { kind: "json", uri: item.uri } : undefined;
  }
  if (message.type !== "openIssue" || typeof message.file !== "string") return undefined;
  const line = typeof message.line === "number" && Number.isFinite(message.line)
    ? Math.max(1, Math.trunc(message.line))
    : undefined;
  const issue = report.items
    .flatMap((item) => item.issues)
    .find((candidate) => candidate.file === message.file && candidate.line === line);
  return issue?.file
    ? { kind: "issue", file: issue.file, ...(issue.line === undefined ? {} : { line: issue.line }) }
    : undefined;
}

export class KtcCodegenBatchApplyReportViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private report: KtcCodegenBatchApplyReport | undefined;

  constructor(private readonly callbacks: KtcCodegenBatchApplyReportViewCallbacks) {}

  show(report: KtcCodegenBatchApplyReport): void {
    this.report = report;
    if (!this.panel) this.panel = this.createPanel();
    this.panel.title = report.applyKind === "single" ? "Codegen 应用报告" : "Codegen 全部应用报告";
    this.panel.webview.html = getCodegenBatchApplyReportHtml(
      report,
      randomBytes(16).toString("base64url"),
    );
    this.panel.reveal(vscode.ViewColumn.Active, false);
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.report = undefined;
    panel?.dispose();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.codegenBatchApplyReport",
      "Codegen 应用报告",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        void vscode.window.showErrorMessage(
          `无法打开报告链接：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
    panel.onDidDispose(() => {
      if (this.panel === panel) {
        this.panel = undefined;
        this.report = undefined;
      }
    });
    return panel;
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!this.report) return;
    const action = ktcResolveCodegenBatchApplyReportAction(this.report, message);
    if (!action) return;
    if (action.kind === "json") {
      await this.callbacks.openCodegenJson(action.uri);
      return;
    }
    const uri = vscode.Uri.file(action.file);
    const document = await vscode.workspace.openTextDocument(uri);
    if (action.line === undefined) {
      await vscode.window.showTextDocument(document, { preview: true });
      return;
    }
    const line = Math.max(0, Math.min(action.line - 1, Math.max(0, document.lineCount - 1)));
    await vscode.window.showTextDocument(document, {
      preview: true,
      selection: new vscode.Range(line, 0, line, 0),
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
