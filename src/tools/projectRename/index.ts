import * as vscode from "vscode";
import { KtcProjectRenameHost } from "../../projectRenameHost.js";
import { KtcProjectRenameViewController } from "./viewController.js";

export const KTC_PROJECT_RENAME_OPEN_COMMAND = "ktAutoCode.projectRenameAnalysis.open";

export function ktcRegisterProjectRenameAnalysis(context: vscode.ExtensionContext): void {
  const controller = new KtcProjectRenameViewController(context.extensionUri, new KtcProjectRenameHost());
  context.subscriptions.push(
    controller,
    vscode.commands.registerCommand(KTC_PROJECT_RENAME_OPEN_COMMAND, (requestedRoot?: unknown) => (
      controller.show(requestedRoot)
    )),
  );
}
