import * as vscode from "vscode";
import { ktcCreateWebviewSecurity } from "../../webviewSupport.js";
import { KtcGitSquashViewHtml } from "./KtcGitSquashViewHtml.js";
import { KtcParseGitSquashViewMessage, type KtcGitSquashGraphState, type KtcGitSquashViewMessage } from "./KtcGitSquashViewModel.js";
export type { KtcGitSquashGraphState, KtcGitSquashViewMessage } from "./KtcGitSquashViewModel.js";

export interface KtcGitSquashViewCallbacks {
  readonly onMessage: (message: KtcGitSquashViewMessage) => Promise<void>;
  readonly onDispose: () => void;
}

/** 单例编辑器区 View；只显示已由 Controller 验证过的拓扑 DTO。 */
export class KtcGitSquashViewController implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly callbacks: KtcGitSquashViewCallbacks) {}

  show(state: KtcGitSquashGraphState): void {
    if (!this.panel) this.panel = this.createPanel();
    this.panel.title = `Git：合并 commit 区间 · ${state.repositoryName}`;
    this.panel.webview.html = KtcGitSquashViewHtml(state, {
      ...ktcCreateWebviewSecurity(this.panel.webview),
      messageBridgeScript: "const vscode = acquireVsCodeApi(); const post = (value) => vscode.postMessage(value);",
    });
    // 状态刷新只更新现有 View，不主动抢占焦点或移动用户安排的分栏。
  }

  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  reveal(): void {
    this.panel?.reveal(this.panel.viewColumn, false);
  }

  dispose(): void {
    this.close();
  }

  close(): void {
    const panel = this.panel;
    this.panel = undefined;
    panel?.dispose();
  }

  private createPanel(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      "ktAutoCode.gitSquash",
      "Git：合并 commit 区间",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    panel.webview.onDidReceiveMessage((message: unknown) => {
      const parsed = KtcParseGitSquashViewMessage(message);
      if (parsed) void this.callbacks.onMessage(parsed);
    });
    panel.onDidDispose(() => {
      if (this.panel !== panel) return;
      this.panel = undefined;
      this.callbacks.onDispose();
    });
    return panel;
  }
}
