import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import type { FileResultSummary } from "../tools/types.js";
import { ktcActivateResultAccordion, ktcRegisterResultAccordion } from "./resultAccordion.js";

type Node = Group | File;
type Group = { type: "group"; files: readonly FileResultSummary[] };
type File = { type: "file"; row: FileResultSummary };
const VIEW_ID = "ktAutoCode.headerAsciiResults";

/** Compact native result list; fixing remains an explicit safe batch action. */
export class KtcHeaderAsciiResultView implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  private readonly tree: vscode.TreeView<Node>;
  private rows: readonly FileResultSummary[] = [];
  private expanded = true;
  private available = false;
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.tree = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: this, showCollapseAll: true });
    context.subscriptions.push(
      this.tree, ktcRegisterResultAccordion(VIEW_ID, this),
      vscode.commands.registerCommand("ktAutoCode.headerAsciiResult.open", (node: Node) => {
        if (node?.type === "file") void vscode.commands.executeCommand("ktAutoCode.headerAscii.openIssue", node.row.fullPath, node.row.topLine);
      }),
      vscode.commands.registerCommand("ktAutoCode.headerAsciiResult.fix", () => { void vscode.commands.executeCommand("ktAutoCode.headerAscii.fix"); }),
      vscode.commands.registerCommand("ktAutoCode.headerAsciiResult.close", () => { void this.close(); }),
      vscode.commands.registerCommand("ktAutoCode.headerAsciiResult.show", () => { void this.showCached(); }),
      this.tree.onDidExpandElement(({ element }) => { if (element.type === "group") { this.expanded = true; ktcActivateResultAccordion(VIEW_ID); } }),
      this.tree.onDidCollapseElement(({ element }) => { if (element.type === "group") this.expanded = false; }),
    );
  }

  show(rows: readonly FileResultSummary[]): void { this.rows = rows; this.available = true; this.expanded = true; this.emitter.fire(undefined); void this.activate(); }
  getTreeItem(node: Node): vscode.TreeItem {
    if (node.type === "group") {
      const item = new vscode.TreeItem(`问题文件 · ${node.files.length} 个`, this.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon("warning"); item.contextValue = "ktAutoCode.headerAscii.group"; return item;
    }
    const item = new vscode.TreeItem(basename(node.row.relativePath ?? node.row.file), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = vscode.Uri.file(node.row.fullPath); item.description = [dirname(node.row.relativePath ?? node.row.file).replace(/^\.$/, ""), `L${node.row.topLine}`, `${node.row.issueCount} 处`].filter(Boolean).join(" · ");
    item.tooltip = this.tooltip(node.row); item.contextValue = "ktAutoCode.headerAscii.file";
    item.command = { command: "ktAutoCode.headerAsciiResult.open", title: "打开文件", arguments: [node] }; return item;
  }
  getChildren(node?: Node): Node[] { if (node?.type === "group") return node.files.map((row) => ({ type: "file", row })); return node ? [] : this.rows.length ? [{ type: "group", files: this.rows }] : []; }
  getParent(node: Node): Node | undefined { return node.type === "file" ? { type: "group", files: this.rows } : undefined; }
  collapseForAccordion(): void { if (this.expanded) { this.expanded = false; this.emitter.fire(undefined); } }
  dispose(): void { this.emitter.dispose(); }
  private async close(): Promise<void> { await vscode.commands.executeCommand("setContext", "ktAutoCode.headerAsciiHasResults", false); }
  private async showCached(): Promise<void> { if (this.available) { this.expanded = true; await this.activate(); } }
  private async activate(): Promise<void> { ktcActivateResultAccordion(VIEW_ID); await vscode.commands.executeCommand("setContext", "ktAutoCode.headerAsciiHasResults", true); await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code"); const group = this.getChildren()[0]; if (group?.type === "group") await this.tree.reveal(group, { select: false, focus: true, expand: true }); }
  private tooltip(row: FileResultSummary): vscode.MarkdownString { const md = new vscode.MarkdownString(undefined, true); md.appendMarkdown(`**${row.relativePath ?? row.file}**  \n问题：${row.issueCount} 处`); for (const issue of row.issues.slice(0, 4)) md.appendMarkdown(`\n\nL${issue.line}:C${issue.column}  \`${issue.fromLabel}\` → \`${issue.toLabel}\``); return md; }
}
