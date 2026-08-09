import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("KT Auto Code");
  }
  return channel;
}

/** 只追加日志，不抢占用户当前面板。适合激活来源等一次性运行信息。 */
export function appendOutputLine(text: string): void {
  getOutputChannel().appendLine(text);
}

export function logOutput(text: string): void {
  const ch = getOutputChannel();
  ch.appendLine(text);
  ch.show(true);
}
