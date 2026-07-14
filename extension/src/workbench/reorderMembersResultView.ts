import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { pnwGroupFileResults } from "phoenix-wing/code-core";

export type KtcReorderPreviewRow = {
  readonly uri: vscode.Uri;
  readonly relativePath: string;
  readonly kind: "header" | "source";
  readonly encoding: "UTF-8" | "UTF-8 BOM" | "GBK" | "未知";
  readonly changed: boolean;
  state: "unchanged" | "pending" | "applied" | "blocked" | "reverted";
  readonly warnings: readonly string[];
};

export interface KtcReorderApplyResult {
  readonly updates: readonly { uri: string; state: "applied" | "blocked"; warning?: string }[];
}

export interface KtcReorderRevertResult {
  readonly uri: string;
  readonly state: "reverted" | "blocked" | "cancelled";
  readonly warning?: string;
}

export interface KtcReorderMembersResultActions {
  openFile(uri: string): Promise<void>;
  openGitDiff(uri: string): Promise<void>;
  revert(uri: string): Promise<KtcReorderRevertResult>;
  apply(uriStrings: readonly string[]): Promise<KtcReorderApplyResult>;
}

type KtcReorderTreeNode = KtcReorderGroupNode | KtcReorderFileNode;

type KtcReorderGroupNode = {
  readonly type: "group";
  readonly id: "changed" | "unchanged";
  readonly rows: readonly KtcReorderPreviewRow[];
};

type KtcReorderFileNode = {
  readonly type: "file";
  readonly row: KtcReorderPreviewRow;
};

const VIEW_ID = "ktAutoCode.reorderResults";

/** Native bottom-panel result view for C++ member ordering. */
export class KtcReorderMembersResultView implements vscode.TreeDataProvider<KtcReorderTreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<KtcReorderTreeNode | undefined>();
  private readonly selected = new Set<string>();
  private readonly runtimeWarnings = new Map<string, string>();
  private rows: readonly KtcReorderPreviewRow[] = [];
  private actions: KtcReorderMembersResultActions | undefined;
  private scanned = 0;
  private showUnchanged = false;
  private readonly treeView: vscode.TreeView<KtcReorderTreeNode>;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.treeView = vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: true,
    });
    context.subscriptions.push(
      this.treeView,
      vscode.commands.registerCommand("ktAutoCode.reorderMembers.openFile", (node: KtcReorderTreeNode) => {
        if (node?.type === "file") void this.actions?.openFile(node.row.uri.toString());
      }),
      vscode.commands.registerCommand("ktAutoCode.reorderMembers.openGitDiff", (node: KtcReorderTreeNode) => {
        if (node?.type === "file" && node.row.state === "applied") void this.actions?.openGitDiff(node.row.uri.toString());
      }),
      vscode.commands.registerCommand("ktAutoCode.reorderMembers.revert", (node: KtcReorderTreeNode) => {
        if (node?.type === "file") void this.revert(node.row);
      }),
      vscode.commands.registerCommand("ktAutoCode.reorderMembers.applySelected", () => { void this.applySelected(); }),
      vscode.commands.registerCommand("ktAutoCode.reorderMembers.toggleUnchanged", () => {
        this.showUnchanged = !this.showUnchanged;
        this.refresh();
      }),
      this.treeView.onDidChangeCheckboxState(({ items }) => {
        for (const [node, state] of items) {
          if (node.type !== "file" || node.row.state !== "pending") continue;
          if (state === vscode.TreeItemCheckboxState.Checked) this.selected.add(node.row.uri.toString());
          else this.selected.delete(node.row.uri.toString());
        }
        this.updateContext();
      }),
    );
    this.updateContext();
  }

  show(rows: readonly KtcReorderPreviewRow[], scanned: number, actions: KtcReorderMembersResultActions): void {
    this.rows = rows;
    this.scanned = scanned;
    this.actions = actions;
    this.selected.clear();
    this.runtimeWarnings.clear();
    for (const row of rows) if (row.changed && row.state === "pending") this.selected.add(row.uri.toString());
    this.refresh();
    void vscode.commands.executeCommand("workbench.view.extension.ktAutoCode.results");
  }

  getTreeItem(node: KtcReorderTreeNode): vscode.TreeItem {
    if (node.type === "group") {
      const changed = node.id === "changed";
      const item = new vscode.TreeItem(
        `${changed ? "变更文件" : "无变更文件"} · ${node.rows.length} 个`,
        changed ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = new vscode.ThemeIcon(changed ? "files" : "folder");
      item.contextValue = `ktAutoCode.reorder.${node.id}`;
      item.description = changed ? `扫描 ${this.scanned} 个` : "按文件名排序";
      return item;
    }
    const { row } = node;
    const directory = dirname(row.relativePath).replace(/^\.$/, "");
    const item = new vscode.TreeItem(basename(row.relativePath), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = row.uri;
    item.description = [directory, ktcStatusLabel(row.state), row.encoding].filter(Boolean).join(" · ");
    item.tooltip = this.tooltip(row);
    item.contextValue = `ktAutoCode.reorder.${row.state}`;
    item.command = { command: "ktAutoCode.reorderMembers.openFile", title: "打开文件", arguments: [node] };
    if (row.state === "pending") item.checkboxState = this.selected.has(row.uri.toString())
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    return item;
  }

  getChildren(node?: KtcReorderTreeNode): KtcReorderTreeNode[] {
    if (node?.type === "group") return node.rows.map((row) => ({ type: "file", row }));
    if (node?.type === "file") return [];
    return pnwGroupFileResults(
      this.rows.map((row) => ({ row, relativePath: row.relativePath, changed: row.changed || row.state === "blocked" })),
      { sortMode: "filename" },
    ).filter((group) => group.id === "changed" || this.showUnchanged)
      .map((group) => ({ type: "group", id: group.id, rows: group.items.map((item) => item.row) }));
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private async applySelected(): Promise<void> {
    if (!this.actions) return;
    const uris = [...this.selected];
    if (!uris.length) {
      void vscode.window.showInformationMessage("请先勾选待写盘的文件。");
      return;
    }
    try {
      const result = await this.actions.apply(uris);
      this.applyUpdates(result);
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private async revert(row: KtcReorderPreviewRow): Promise<void> {
    if (!this.actions || row.state !== "applied") return;
    try {
      const result = await this.actions.revert(row.uri.toString());
      if (result.state === "reverted" || result.state === "blocked") {
        if (result.warning) this.runtimeWarnings.set(result.uri, result.warning);
        this.selected.delete(result.uri);
        this.refresh();
      }
    } catch (error) {
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private applyUpdates(result: KtcReorderApplyResult): void {
    for (const update of result.updates) {
      if (update.warning) this.runtimeWarnings.set(update.uri, update.warning);
      this.selected.delete(update.uri);
    }
    this.refresh();
  }

  private refresh(): void {
    this.changeEmitter.fire(undefined);
    this.updateContext();
  }

  private updateContext(): void {
    void vscode.commands.executeCommand("setContext", "ktAutoCode.reorderHasSelection", this.selected.size > 0);
    void vscode.commands.executeCommand("setContext", "ktAutoCode.reorderShowsUnchanged", this.showUnchanged);
  }

  private tooltip(row: KtcReorderPreviewRow): vscode.MarkdownString {
    const warnings = [...row.warnings, this.runtimeWarnings.get(row.uri.toString())].filter((warning): warning is string => Boolean(warning));
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**${row.relativePath}**\n\n`);
    tooltip.appendMarkdown(`状态：${ktcStatusLabel(row.state)}  \n类型：${row.kind === "header" ? "头文件" : "源文件"}  \n编码：${row.encoding}`);
    if (warnings.length) tooltip.appendMarkdown(`\n\n诊断：${warnings.join("；")}`);
    return tooltip;
  }
}

function ktcStatusLabel(state: KtcReorderPreviewRow["state"]): string {
  switch (state) {
    case "pending": return "待写盘";
    case "applied": return "已写盘";
    case "reverted": return "已还原";
    case "blocked": return "未写入";
    default: return "无变更";
  }
}
