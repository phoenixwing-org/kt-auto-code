import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import type { PnwUuidReplacementPlan, PnwUuidReplacementPlanHit } from "phoenix-wing/code-core";
import { ktcActivateResultAccordion, ktcRegisterResultAccordion } from "./resultAccordion.js";

export type KtcUuidResultFile = { readonly id: string; readonly uri: vscode.Uri; readonly relativePath: string };
export type KtcUuidApplyUpdate = { readonly hitId: string; readonly state: "applied" | "blocked"; readonly warning?: string };
export interface KtcUuidResultActions {
  openFile(uri: string, line: number): Promise<void>;
  openGitDiff(uri: string): Promise<void>;
  apply(hitIds: readonly string[]): Promise<readonly KtcUuidApplyUpdate[]>;
}

type KtcUuidFileState = "pending" | "cancelled" | "applied" | "blocked";
type KtcUuidTreeNode = KtcUuidGroupNode | KtcUuidFileNode;
type KtcUuidGroupNode = { readonly type: "group"; readonly state: KtcUuidFileState; readonly files: readonly KtcUuidFileNode[] };
type KtcUuidFileNode = { readonly type: "file"; readonly file: KtcUuidResultFile; readonly hitIds: readonly string[] };

const VIEW_ID = "ktAutoCode.uuidResults";
const GROUP_ORDER: readonly KtcUuidFileState[] = ["pending", "applied", "blocked"];

/** Git-style, file-first UUID result view. Token mappings stay in tooltips rather than becoming long list rows. */
export class KtcUuidReplacementResultView implements vscode.TreeDataProvider<KtcUuidTreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<KtcUuidTreeNode | undefined>();
  private readonly selectedFiles = new Set<string>();
  private readonly states = new Map<string, KtcUuidFileState>();
  private readonly warnings = new Map<string, string>();
  private readonly treeView: vscode.TreeView<KtcUuidTreeNode>;
  private plan: PnwUuidReplacementPlan | undefined;
  private files = new Map<string, KtcUuidResultFile>();
  private actions: KtcUuidResultActions | undefined;
  private rootExpanded = true;

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this.treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: this, showCollapseAll: true, canSelectMany: true });
    context.subscriptions.push(
      this.treeView,
      ktcRegisterResultAccordion(VIEW_ID, this),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.openFile", (node: KtcUuidTreeNode) => {
        if (node?.type === "file") void this.actions?.openFile(node.file.uri.toString(), this.hitsFor(node)[0]?.line ?? 1);
      }),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.openGitDiff", (node: KtcUuidTreeNode) => {
        if (node?.type === "file" && this.hitsFor(node).some((hit) => this.stateOf(hit.id) === "applied")) void this.actions?.openGitDiff(node.file.uri.toString());
      }),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.cancelCandidate", (node: KtcUuidTreeNode) => {
        if (node?.type === "file" && this.fileState(node.file.id) === "pending") this.cancel(node);
      }),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.applyCandidate", (node: KtcUuidTreeNode) => {
        if (node?.type === "file" && this.fileState(node.file.id) === "pending") void this.applyFile(node);
      }),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.applySelected", () => { void this.applySelected(); }),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.closeResults", () => { void this.closeResults(); }),
      vscode.commands.registerCommand("ktAutoCode.uuidReplace.showResults", () => { void this.showResults(); }),
      this.treeView.onDidChangeCheckboxState(({ items }) => {
        for (const [node, checkbox] of items) {
          const checked = checkbox === vscode.TreeItemCheckboxState.Checked;
          if (node.type === "group") for (const file of node.files) this.setFileSelected(file, checked);
          if (node.type === "file") this.setFileSelected(node, checked);
        }
        this.refresh();
      }),
      this.treeView.onDidExpandElement(({ element }) => {
        if (element.type === "group" && element.state === "pending") {
          this.rootExpanded = true;
          ktcActivateResultAccordion(VIEW_ID);
        }
      }),
      this.treeView.onDidCollapseElement(({ element }) => {
        if (element.type === "group" && element.state === "pending") this.rootExpanded = false;
      }),
    );
    this.updateContext();
  }

  show(plan: PnwUuidReplacementPlan, files: readonly KtcUuidResultFile[], actions: KtcUuidResultActions): void {
    this.plan = plan;
    this.files = new Map(files.map((file) => [file.id, file]));
    this.actions = actions;
    this.selectedFiles.clear();
    this.states.clear();
    this.warnings.clear();
    this.rootExpanded = true;
    for (const hit of plan.hits) this.states.set(hit.id, "pending");
    for (const file of this.fileNodes()) this.selectedFiles.add(file.file.id);
    this.refresh();
    void this.activateResult();
  }

  async applyFromSidebar(): Promise<boolean> {
    if (!this.plan) return false;
    await this.applySelected();
    return true;
  }

  getTreeItem(node: KtcUuidTreeNode): vscode.TreeItem {
    if (node.type === "group") {
      const label = node.state === "pending" ? "待写盘" : node.state === "applied" ? "已写盘" : node.state === "cancelled" ? "已取消" : "未写入";
      const item = new vscode.TreeItem(
        `${label} · ${node.files.length} 个文件`,
        node.state === "pending" && this.rootExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.iconPath = new vscode.ThemeIcon(node.state === "pending" ? "symbol-key" : node.state === "applied" ? "check" : node.state === "cancelled" ? "close" : "warning");
      item.contextValue = `ktAutoCode.uuid.group.${node.state}`;
      if (node.state === "pending") {
        item.checkboxState = node.files.every((file) => this.selectedFiles.has(file.file.id))
          ? vscode.TreeItemCheckboxState.Checked
          : vscode.TreeItemCheckboxState.Unchecked;
      }
      return item;
    }
    const hits = this.hitsFor(node);
    const state = this.fileState(node.file.id);
    const directory = dirname(node.file.relativePath).replace(/^\.$/, "");
    const hasApplied = hits.some((hit) => this.stateOf(hit.id) === "applied");
    const item = new vscode.TreeItem(basename(node.file.relativePath), vscode.TreeItemCollapsibleState.None);
    item.resourceUri = node.file.uri;
    item.description = [directory, `${hits.length} 处`, ktcUuidStatusLabel(state)].filter(Boolean).join(" · ");
    item.tooltip = this.fileTooltip(node, state);
    item.contextValue = hasApplied ? "ktAutoCode.uuid.applied" : `ktAutoCode.uuid.${state}`;
    item.command = { command: "ktAutoCode.uuidReplace.openFile", title: "打开文件", arguments: [node] };
    if (state === "pending") item.checkboxState = this.selectedFiles.has(node.file.id)
      ? vscode.TreeItemCheckboxState.Checked
      : vscode.TreeItemCheckboxState.Unchecked;
    return item;
  }

  getChildren(node?: KtcUuidTreeNode): KtcUuidTreeNode[] {
    if (!this.plan) return [];
    if (node?.type === "group") return [...node.files];
    if (node?.type === "file") return [];
    return GROUP_ORDER.map((state): KtcUuidGroupNode => ({ type: "group", state, files: this.fileNodes().filter((file) => this.fileState(file.file.id) === state) }))
      .filter((group) => group.files.length > 0);
  }

  getParent(node: KtcUuidTreeNode): KtcUuidTreeNode | undefined {
    if (node.type === "group") return undefined;
    return this.getChildren().find((candidate): candidate is KtcUuidGroupNode =>
      candidate.type === "group" && candidate.files.some((file) => file.file.id === node.file.id),
    );
  }

  collapseForAccordion(): void {
    if (!this.rootExpanded) return;
    this.rootExpanded = false;
    this.changeEmitter.fire(undefined);
  }

  dispose(): void { this.changeEmitter.dispose(); }

  private async applySelected(): Promise<void> {
    if (!this.actions) return;
    const selected = this.fileNodes().filter((file) => this.fileState(file.file.id) === "pending" && this.selectedFiles.has(file.file.id));
    const hitIds = selected.flatMap((file) => this.hitsFor(file).filter((hit) => this.stateOf(hit.id) === "pending").map((hit) => hit.id));
    if (!hitIds.length) { void vscode.window.showInformationMessage("请先勾选待写盘的 UUID 文件。"); return; }
    await this.applyHitIds(hitIds);
  }

  private async applyFile(file: KtcUuidFileNode): Promise<void> {
    const hitIds = this.hitsFor(file).filter((hit) => this.stateOf(hit.id) === "pending").map((hit) => hit.id);
    if (!hitIds.length) return;
    await this.applyHitIds(hitIds);
  }

  private async applyHitIds(hitIds: readonly string[]): Promise<void> {
    if (!this.actions) return;
    try { this.applyUpdates(await this.actions.apply(hitIds)); }
    catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error)); }
  }

  private applyUpdates(updates: readonly KtcUuidApplyUpdate[]): void {
    const changedFiles = new Set<string>();
    for (const update of updates) {
      this.states.set(update.hitId, update.state);
      const hit = this.plan?.hits.find((item) => item.id === update.hitId);
      if (hit) changedFiles.add(hit.fileId);
      if (update.warning) this.warnings.set(update.hitId, update.warning);
    }
    for (const fileId of changedFiles) if (this.fileState(fileId) !== "pending") this.selectedFiles.delete(fileId);
    this.refresh();
  }

  private cancel(node: KtcUuidFileNode): void {
    for (const hit of this.hitsFor(node)) if (this.stateOf(hit.id) === "pending") this.states.set(hit.id, "cancelled");
    this.selectedFiles.delete(node.file.id);
    this.refresh();
  }

  private fileNodes(): readonly KtcUuidFileNode[] {
    if (!this.plan) return [];
    return [...this.files.values()].map((file): KtcUuidFileNode => ({ type: "file", file, hitIds: this.plan!.hits.filter((hit) => hit.fileId === file.id).map((hit) => hit.id) }))
      .filter((file) => file.hitIds.length > 0)
      .sort((left, right) => basename(left.file.relativePath).localeCompare(basename(right.file.relativePath), undefined, { sensitivity: "base" }) || left.file.relativePath.localeCompare(right.file.relativePath));
  }
  private hitsFor(node: KtcUuidFileNode): readonly PnwUuidReplacementPlanHit[] { return this.plan?.hits.filter((hit) => node.hitIds.includes(hit.id)) ?? []; }
  private stateOf(hitId: string): KtcUuidFileState { return this.states.get(hitId) ?? "blocked"; }
  private fileState(fileId: string): KtcUuidFileState {
    const hits = this.plan?.hits.filter((hit) => hit.fileId === fileId) ?? [];
    if (hits.some((hit) => this.stateOf(hit.id) === "pending")) return "pending";
    if (hits.some((hit) => this.stateOf(hit.id) === "blocked")) return "blocked";
    if (hits.some((hit) => this.stateOf(hit.id) === "cancelled")) return "cancelled";
    return "applied";
  }
  private setFileSelected(node: KtcUuidFileNode, selected: boolean): void {
    if (this.fileState(node.file.id) !== "pending") return;
    if (selected) this.selectedFiles.add(node.file.id); else this.selectedFiles.delete(node.file.id);
  }
  private refresh(): void { this.changeEmitter.fire(undefined); this.updateContext(); }
  private updateContext(): void { void vscode.commands.executeCommand("setContext", "ktAutoCode.uuidHasSelection", this.selectedFiles.size > 0); }
  private async focusResults(): Promise<void> {
    try { await vscode.commands.executeCommand("workbench.view.extension.kt-auto-code"); }
    catch { void vscode.window.showWarningMessage("无法自动显示 UUID 结果；请从主侧栏选择“KT Auto Code”。"); }
  }
  private async closeResults(): Promise<void> {
    await vscode.commands.executeCommand("setContext", "ktAutoCode.uuidHasResults", false);
  }
  private async showResults(): Promise<void> {
    if (!this.actions) return;
    this.rootExpanded = true;
    await this.activateResult();
  }
  private async activateResult(): Promise<void> {
    ktcActivateResultAccordion(VIEW_ID);
    await vscode.commands.executeCommand("setContext", "ktAutoCode.uuidHasResults", true);
    await this.focusResults();
    const pending = this.getChildren().find((node): node is KtcUuidGroupNode => node.type === "group" && node.state === "pending");
    if (pending) await this.treeView.reveal(pending, { select: false, focus: true, expand: true });
  }
  private fileTooltip(node: KtcUuidFileNode, state: KtcUuidFileState): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**${node.file.relativePath}**  \n状态：${ktcUuidStatusLabel(state)}  \n命中：${node.hitIds.length} 处`);
    for (const hit of this.hitsFor(node)) tooltip.appendMarkdown(`\n\nL${hit.line}:C${hit.column}  \`${hit.from}\`  \n→ \`${hit.formattedTo}\``);
    const notes = this.hitsFor(node).map((hit) => this.warnings.get(hit.id)).filter((note): note is string => Boolean(note));
    if (notes.length) tooltip.appendMarkdown(`\n\n诊断：${notes.join("；")}`);
    return tooltip;
  }
}

function ktcUuidStatusLabel(state: KtcUuidFileState): string {
  return state === "pending" ? "待写盘" : state === "applied" ? "已写盘" : state === "cancelled" ? "已取消" : "未写入";
}
