import * as vscode from "vscode";
import type {
  KtcCodegenEditorModel,
  KtcCodegenEditorOutboundMessage,
  WebviewInboundMessage,
} from "../types.js";
import { getCodegenEditorHtml } from "./editorHtml.js";

export interface KtcCodegenEditorViewCallbacks {
  readonly onMessage: (uri: string, message: WebviewInboundMessage) => void;
  readonly onActive: (uri: string) => void;
  readonly onDispose: (uri: string) => void;
}

/** VS Code WebviewPanel 适配器；不持有 Codegen 领域状态。 */
export class KtcCodegenEditorViewController implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private disposing = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly callbacks: KtcCodegenEditorViewCallbacks,
  ) {}

  show(model: KtcCodegenEditorModel): void {
    const current = this.panels.get(model.uri);
    if (current) {
      current.reveal(current.viewColumn, false);
      this.callbacks.onActive(model.uri);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.codegenEditor",
      this.title(model.fileName, model.dirty),
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    );
    this.panels.set(model.uri, panel);
    panel.webview.html = getCodegenEditorHtml(panel.webview, this.extensionUri, model);
    panel.webview.onDidReceiveMessage((message: WebviewInboundMessage) => {
      this.callbacks.onMessage(model.uri, message);
    });
    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (webviewPanel.active) this.callbacks.onActive(model.uri);
    });
    panel.onDidDispose(() => {
      this.panels.delete(model.uri);
      if (!this.disposing) this.callbacks.onDispose(model.uri);
    });
    this.callbacks.onActive(model.uri);
  }

  post(uri: string, message: KtcCodegenEditorOutboundMessage): void {
    void this.panels.get(uri)?.webview.postMessage(message);
  }

  setDocumentState(uri: string, fileName: string, dirty: boolean, conflict: boolean): void {
    const panel = this.panels.get(uri);
    if (panel) panel.title = this.title(fileName, dirty, conflict);
  }

  isOpen(uri: string): boolean {
    return this.panels.has(uri);
  }

  dispose(): void {
    this.disposing = true;
    for (const panel of this.panels.values()) panel.dispose();
    this.panels.clear();
  }

  private title(fileName: string, dirty: boolean, conflict = false): string {
    return `${conflict ? "⚠ " : dirty ? "● " : ""}${fileName} · Codegen`;
  }
}
