import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { ktcActivateResultAccordion, ktcRegisterResultAccordion } from "./resultAccordion.js";

export type KtcCaaDialogResultFile = { readonly uri: vscode.Uri; readonly relativePath: string };
export interface KtcCaaDialogResultActions {
  openFile(uri: string): Promise<void>;
  openExternalEditor(uri: string): Promise<void>;
}

type KtcCaaDialogTreeNode = KtcCaaDialogGroupNode | KtcCaaDialogFileNode;
type KtcCaaDialogGroupNode = { readonly type: "group"; readonly files: readonly KtcCaaDialogResultFile[] };
type KtcCaaDialogFileNode = { readonly type: "file"; readonly file: KtcCaaDialogResultFile };

const VIEW_ID = "ktAutoCode.caaDialogResults";

/** File-first CAA dialog list. Editing stays in the user-configured external editor. */
export class KtcCaaDialogResultView implements vscode.TreeDataProvider<KtcCaaDialogTreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<KtcCaaDialogTreeNode | undefined>();
  private readonly treeView: vscode.TreeView<KtcCaaDialogTreeNode>;
  private files: readonly KtcCaaDialogResultFile[] = [];
  private actions: KtcCaaDialogResultActions | undefined;
  private rootExpanded = true;
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: this, showCollapseAll: true });
    context.subscriptions.push(
      this.treeView,
      ktcRegisterResultAccordion(VIEW_ID, this),
      vscode.commands.registerCommand("ktAutoCode.caaDialog.openFile", (node: KtcCaaDialogTreeNode) => {
        if (node?.type === "file") void this.openFile(node);
      }),
      vscode.commands.registerCommand("ktAutoCode.caa.openExternalEditor", (node: KtcCaaDialogTreeNode) => {
        if (node?.type === "file") void this.openExternalEditor(node);
      }),
      vscode.commands.registerCommand("ktAutoCode.caaDialog.closeResults", () => { void this.closeResults(); }),
      vscode.commands.registerCommand("ktAutoCode.caaDialog.showResults", () => { void this.showResults(); }),
      this.treeView.onDidExpandElement(({ element }) => {
        if (element.type === "group") {
          this.rootExpanded = true;
          ktcActivateResultAccordion(VIEW_ID);
        }
      }),
      this.treeView.onDidCollapseElement(({ element }) => {
        if (element.type === "group") this.rootExpanded = false;
      }),
    );
  }

  show(files: readonly KtcCaaDialogResultFile[], actions: KtcCaaDialogResultActions): void {
    this.files = [...files].sort((left, right) => basename(left.relativePath).localeCompare(basename(right.relativePath), undefined, { sensitivity: "base" }) || left.relativePath.localeCompare(right.relativePath));
    this.actions = actions;
    this.rootExpanded = true;
    this.changeEmitter.fire(undefined);
    void this.activateResult();
  }

  getTreeItem(node: KtcCaaDialogTreeNode): vscode.TreeItem {
    if (node.type === "group") {
      const item = new vscode.TreeItem(
        `CAA 对话框 · ${node.files.length} 个文件`,
        this.rootExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = new vscode.ThemeIcon("files");
      item.tooltip = "已扫描的 .CATDlg 文件；在文件行右侧点击图标可在已配置的外部编辑器中打开。";
      item.contextValue = "ktAutoCode.caa.group";
      return item;
    }
    const item = new vscode.TreeItem(basename(node.file.relativePath), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = node.file.uri;
    // CATDlg is unknown to most file-icon themes; use a compact code-file icon
    // rather than inheriting the generic plain-text glyph.
    item.iconPath = new vscode.ThemeIcon("file-code");
    item.description = [dirname(node.file.relativePath).replace(/^\.$/, ""), ".CATDlg"].filter(Boolean).join(" · ");
    item.tooltip = `${node.file.relativePath}\n点击打开文件；右侧图标在已配置的外部编辑器中打开。`;
    item.contextValue = "ktAutoCode.caa.file";
    item.command = { command: "ktAutoCode.caaDialog.openFile", title: "打开文件", arguments: [node] };
    return item;
  }

  getChildren(node?: KtcCaaDialogTreeNode): KtcCaaDialogTreeNode[] {
    if (node?.type === "group") return node.files.map((file): KtcCaaDialogFileNode => ({ type: "file", file }));
    if (node?.type === "file") return [];
    return this.files.length ? [{ type: "group", files: this.files }] : [];
  }

  getParent(node: KtcCaaDialogTreeNode): KtcCaaDialogTreeNode | undefined {
    if (node.type === "group") return undefined;
    const group = this.getChildren()[0];
    return group?.type === "group" ? group : undefined;
  }

  collapseForAccordion(): void {
    if (!this.rootExpanded) return;
    this.rootExpanded = false;
    this.changeEmitter.fire(undefined);
  }

  dispose(): void { this.changeEmitter.dispose(); }

  private async openFile(node: KtcCaaDialogFileNode): Promise<void> {
    try { await this.actions?.openFile(node.file.uri.toString()); }
    catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
  }
  private async openExternalEditor(node: KtcCaaDialogFileNode): Promise<void> {
    try { await this.actions?.openExternalEditor(node.file.uri.toString()); }
    catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
  }

  private async focusResults(): Promise<void> {
    try { await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code"); }
    catch { void vscode.window.showWarningMessage("无法自动显示 CAA 对话框结果；请从主侧栏选择“KT Auto Code”。"); }
  }
  private async closeResults(): Promise<void> {
    await vscode.commands.executeCommand("setContext", "ktAutoCode.caaHasResults", false);
  }
  private async showResults(): Promise<void> {
    if (!this.actions) return;
    this.rootExpanded = true;
    await this.activateResult();
  }
  private async activateResult(): Promise<void> {
    ktcActivateResultAccordion(VIEW_ID);
    await vscode.commands.executeCommand("setContext", "ktAutoCode.caaHasResults", true);
    await this.focusResults();
    const group = this.getChildren()[0];
    if (group?.type === "group") await this.treeView.reveal(group, { select: false, focus: true, expand: true });
  }
}
