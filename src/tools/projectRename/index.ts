import * as vscode from "vscode";
import { KtcProjectRenameHost } from "../../projectRenameHost.js";
import { KtcProjectRenameViewController } from "./viewController.js";
import { KtcRenameHistoryStore } from "../../core/renameHistory.js";
import {
  KTC_PROJECT_RENAME_DIFF_SCHEME,
  KtcProjectRenameDiffDocumentProvider,
} from "./diffDocumentProvider.js";

export const KTC_PROJECT_RENAME_OPEN_COMMAND = "ktAutoCode.projectRenameAnalysis.open";

export function ktcRegisterProjectRenameAnalysis(context: vscode.ExtensionContext): void {
  const diffDocuments = new KtcProjectRenameDiffDocumentProvider();
  const controller = new KtcProjectRenameViewController(
    context.extensionUri,
    new KtcProjectRenameHost(new KtcRenameHistoryStore(context.globalState), diffDocuments),
  );
  context.subscriptions.push(
    diffDocuments,
    vscode.workspace.registerTextDocumentContentProvider(KTC_PROJECT_RENAME_DIFF_SCHEME, diffDocuments),
    controller,
    vscode.commands.registerCommand(KTC_PROJECT_RENAME_OPEN_COMMAND, (requestedRoot?: unknown) => (
      controller.show(requestedRoot)
    )),
  );
}
