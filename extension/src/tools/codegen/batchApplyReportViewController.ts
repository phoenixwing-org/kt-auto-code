import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { KtcCodegenBatchApplyReport } from "./batchApplyReport.js";
import { getCodegenBatchApplyReportHtml } from "./batchApplyReportHtml.js";

export class KtcCodegenBatchApplyReportViewController implements vscode.Disposable {
  private readonly panels = new Set<vscode.WebviewPanel>();

  show(report: KtcCodegenBatchApplyReport): void {
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.codegenBatchApplyReport",
      "Codegen 全部应用报告",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: false, retainContextWhenHidden: true },
    );
    this.panels.add(panel);
    panel.webview.html = getCodegenBatchApplyReportHtml(report, randomBytes(16).toString("base64url"));
    panel.onDidDispose(() => this.panels.delete(panel));
  }

  dispose(): void {
    for (const panel of this.panels) panel.dispose();
    this.panels.clear();
  }
}
