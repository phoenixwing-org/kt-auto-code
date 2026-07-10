import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Kt Auto Code");
  }
  return channel;
}

export function logOutput(text: string): void {
  const ch = getOutputChannel();
  ch.appendLine(text);
  ch.show(true);
}
