import * as vscode from "vscode";
import { dirname } from "node:path";
import type {
  KtcCodegenEditorInboundMessage,
  KtcCodegenEditorModel,
  KtcCodegenEditorOutboundMessage,
} from "./editorContracts.js";
import { getCodegenEditorHtml } from "./editorHtml.js";
import {
  KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
  KTC_CODEGEN_EDITOR_LAYOUT_STATE_KEY,
  ktcNormalizeCodegenEditorLayout,
} from "./editorLayoutState.js";
export interface KtcCodegenEditorViewCallbacks {
  readonly onMessage: (uri: string, message: KtcCodegenEditorInboundMessage) => void;
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
    private readonly workspaceState?: Pick<vscode.Memento, "get" | "update">,
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
      model.fileName,
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    );
    this.panels.set(model.uri, panel);
    const layout = ktcNormalizeCodegenEditorLayout(this.workspaceState?.get(
      KTC_CODEGEN_EDITOR_LAYOUT_STATE_KEY,
      KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
    ));
    const documentUri = vscode.Uri.parse(model.uri);
    const contextPath = documentUri.scheme === "file" ? dirname(documentUri.fsPath) : "";
    panel.webview.html = getCodegenEditorHtml(panel.webview, this.extensionUri, model, layout, contextPath);
    panel.webview.onDidReceiveMessage((message: KtcCodegenEditorInboundMessage) => {
      if (message.type === "codegenEditorLayout") {
        if (message.uri === model.uri) {
          void this.workspaceState?.update(
            KTC_CODEGEN_EDITOR_LAYOUT_STATE_KEY,
            ktcNormalizeCodegenEditorLayout(message.layout),
          );
        }
        return;
      }
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

  setDocumentState(uri: string, fileName: string, _dirty: boolean, _conflict: boolean): void {
    const panel = this.panels.get(uri);
    if (panel) panel.title = fileName;
  }

  isOpen(uri: string): boolean {
    return this.panels.has(uri);
  }

  get openPanelCount(): number {
    return this.panels.size;
  }

  dispose(): void {
    this.disposing = true;
    for (const panel of this.panels.values()) panel.dispose();
    this.panels.clear();
  }
}
