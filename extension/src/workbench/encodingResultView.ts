import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import type { EncodingFileResultSummary } from "../tools/types.js";
import { ktcActivateResultAccordion, ktcRegisterResultAccordion } from "./resultAccordion.js";

type Node = { type: "group"; rows: readonly EncodingFileResultSummary[] } | { type: "file"; row: EncodingFileResultSummary };
const VIEW_ID = "ktAutoCode.encodingResults";
export class KtcEncodingResultView implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>(); private readonly tree: vscode.TreeView<Node>;
  private rows: readonly EncodingFileResultSummary[] = []; private expanded = true; private available = false;
  readonly onDidChangeTreeData = this.emitter.event;
  constructor(context: vscode.ExtensionContext) { this.tree = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: this, showCollapseAll: true }); context.subscriptions.push(this.tree, ktcRegisterResultAccordion(VIEW_ID, this),
    vscode.commands.registerCommand("ktAutoCode.encodingResult.open", (n: Node) => { if (n?.type === "file") void vscode.commands.executeCommand("ktAutoCode.encodingFix.openFile", n.row.fullPath); }),
    vscode.commands.registerCommand("ktAutoCode.encodingResult.convert", () => { void vscode.commands.executeCommand("ktAutoCode.encodingFix.convert"); }), vscode.commands.registerCommand("ktAutoCode.encodingResult.close", () => { void this.close(); }), vscode.commands.registerCommand("ktAutoCode.encodingResult.show", () => { void this.showCached(); }),
    this.tree.onDidExpandElement(({ element }) => { if (element.type === "group") { this.expanded = true; ktcActivateResultAccordion(VIEW_ID); } }), this.tree.onDidCollapseElement(({ element }) => { if (element.type === "group") this.expanded = false; })); }
  show(rows: readonly EncodingFileResultSummary[]): void { this.rows = rows; this.available = true; this.expanded = true; this.emitter.fire(undefined); void this.activate(); }
  getTreeItem(n: Node): vscode.TreeItem { if (n.type === "group") { const i = new vscode.TreeItem(`编码文件 · ${n.rows.length} 个`, this.expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed); i.iconPath = new vscode.ThemeIcon("file-code"); i.contextValue = "ktAutoCode.encoding.group"; return i; } const i = new vscode.TreeItem(basename(n.row.relativePath), vscode.TreeItemCollapsibleState.None); i.resourceUri = vscode.Uri.file(n.row.fullPath); i.description = [dirname(n.row.relativePath).replace(/^\.$/, ""), `${n.row.detected} → ${n.row.expected}`, n.row.suggestedAction].filter(Boolean).join(" · "); i.tooltip = `${n.row.relativePath}\n${n.row.detected} → ${n.row.expected}\n${n.row.detail ?? n.row.suggestedAction}`; i.contextValue = "ktAutoCode.encoding.file"; i.command = { command: "ktAutoCode.encodingResult.open", title: "打开文件", arguments: [n] }; return i; }
  getChildren(n?: Node): Node[] { if (n?.type === "group") return n.rows.map((row) => ({ type: "file", row })); return n ? [] : this.rows.length ? [{ type: "group", rows: this.rows }] : []; }
  getParent(n: Node): Node | undefined { return n.type === "file" ? { type: "group", rows: this.rows } : undefined; }
  collapseForAccordion(): void { if (this.expanded) { this.expanded = false; this.emitter.fire(undefined); } } dispose(): void { this.emitter.dispose(); }
  private async close(): Promise<void> { await vscode.commands.executeCommand("setContext", "ktAutoCode.encodingHasResults", false); } private async showCached(): Promise<void> { if (this.available) { this.expanded = true; await this.activate(); } }
  private async activate(): Promise<void> { ktcActivateResultAccordion(VIEW_ID); await vscode.commands.executeCommand("setContext", "ktAutoCode.encodingHasResults", true); await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code"); const g = this.getChildren()[0]; if (g?.type === "group") await this.tree.reveal(g, { select: false, focus: true, expand: true }); }
}
