import type {
  KtcRunProject,
  KtcRunTarget,
  KtcRunViewModel,
} from "../../core/run/KtcRunModel.js";
import { KtcCompactManagerLabelStyle } from "../../ui/KtcCompactManagerLabel.js";

export const KtcRunPrimaryPanelTag = "ktc-run-primary-panel";

export type KtcRunPrimaryActionDetail =
  | { readonly action: "refresh" | "openOutput" | "openProblems" | "openTerminal" }
  | { readonly action: "runTarget" | "dryRunTarget" | "openSource"; readonly targetId: string }
  | { readonly action: "stopRun"; readonly runId: string }
  | { readonly action: "selectCaaRelated" | "addCaaRelatedFolder"; readonly projectId: string }
  | { readonly action: "setCaaVersion"; readonly projectId: string; readonly value: string };

type KtcNavigationTreeIconKey = "catalog" | "folder" | "folder-open" | "file" | "info" | "settings" | "search" | "warning" | "error";

interface KtcNavigationTreeNode {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly iconKey?: KtcNavigationTreeIconKey;
  readonly disabled?: boolean;
  readonly children?: readonly KtcNavigationTreeNode[];
}

interface KtcNavigationTreeModel {
  readonly ariaLabel: string;
  readonly nodes: readonly KtcNavigationTreeNode[];
  readonly expandedNodeIds: readonly string[];
  readonly selectedNodeId?: string;
  readonly emptyMessage: string;
}

type KtcNavigationTreeAction =
  | { readonly kind: "select" | "activate"; readonly nodeId: string }
  | { readonly kind: "toggle"; readonly nodeId: string; readonly expanded: boolean };

type KtcRunUtilityAction = "openTerminal" | "openProblems" | "openOutput";

interface KtcNavigationTreeElement extends HTMLElement {
  model: KtcNavigationTreeModel | undefined;
  colorScheme: "light" | "dark" | "system";
}

const KtcRunPrimaryPanelStyle = `
  :host { display: grid; width: 100%; min-width: 0; max-width: 100%; min-height: 0; overflow-x: hidden; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .toolbar { position: sticky; z-index: 1; top: 0; display: flex; min-width: 0; max-width: 100%; flex-wrap: wrap; align-items: center; gap: 2px; padding: 2px 4px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .toolbar-button, .project-option-button { min-height: 24px; padding: 1px 6px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 3px; cursor: pointer; }
  .toolbar-button:hover:not(:disabled), .project-option-button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); }
  .platform-filter { display: inline-flex; min-width: 0; align-items: center; gap: 4px; margin-left: auto; color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .summary, .project-options { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 4px 6px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .summary-text, .project-option-source { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-tail { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; }
  .badge { padding: 1px 5px; color: var(--vscode-descriptionForeground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 999px; font-size: 10px; white-space: nowrap; }
  .run-tree { display: block; min-width: 0; --pnw-navigation-tree-bg: transparent; --pnw-navigation-tree-row-height: 25px; --pnw-navigation-tree-indent: 14px; }
  .project-options { flex-wrap: wrap; padding-left: 20px; }
  .version-input { width: 64px; min-height: 24px; padding: 2px 5px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .history { max-height: 130px; overflow: auto; border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .history-title, .history-row { display: flex; min-width: 0; align-items: center; gap: 6px; min-height: 25px; padding: 2px 6px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .history-title { font-weight: 650; background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)); }
  .history-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty, .note, .diagnostics { padding: 7px 8px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font-size: 11px; }
  .diagnostics { max-height: 100px; overflow: auto; }
`;

export class KtcRunPrimaryPanel extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcRunViewModel | undefined;
  private showAllPlatforms = false;
  private readonly expandedNodeIds = new Set<string>();
  private selectedNodeId: string | undefined;
  private readonly targetByNodeId = new Map<string, KtcRunTarget>();
  private readonly projectByNodeId = new Map<string, KtcRunProject>();
  private readonly utilityActionByNodeId = new Map<string, KtcRunUtilityAction>();
  private readonly groupIdsByProjectNodeId = new Map<string, readonly string[]>();

  get model(): KtcRunViewModel | undefined { return this.currentModel; }
  set model(value: KtcRunViewModel | undefined) {
    this.currentModel = value;
    this.render();
  }

  connectedCallback(): void { this.render(); }

  private render(): void {
    if (!this.isConnected) return;
    const style = document.createElement("style");
    style.textContent = KtcCompactManagerLabelStyle + KtcRunPrimaryPanelStyle;
    const model = this.currentModel;
    if (!model) {
      this.root.replaceChildren(style, this.empty("Run Primary 正在发现运行目标…"));
      return;
    }

    this.targetByNodeId.clear();
    this.projectByNodeId.clear();
    this.utilityActionByNodeId.clear();
    this.groupIdsByProjectNodeId.clear();
    const toolbar = this.toolbar();
    const summary = this.summary(model);
    const tree = this.navigationTree(model);
    const content: Node[] = [style, toolbar, summary, tree];
    const selectedProject = this.selectedProject();
    if (selectedProject?.caaVersion) content.push(this.caaVersion(selectedProject));
    if (model.executions.length > 0) content.push(this.executionHistory(model));
    if (model.diagnostics.length > 0) {
      const diagnostics = document.createElement("div");
      diagnostics.className = "diagnostics";
      diagnostics.textContent = model.diagnostics.join("\n");
      content.push(diagnostics);
    }
    content.push(this.note());
    this.root.replaceChildren(...content);
  }

  private toolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.append(this.toolbarButton("↻", "refresh", "刷新运行目标"));
    const platformFilter = document.createElement("label");
    platformFilter.className = "platform-filter";
    platformFilter.title = "关闭后显示其他系统目标，但仍禁止跨平台执行";
    const currentPlatformOnly = document.createElement("input");
    currentPlatformOnly.type = "checkbox";
    currentPlatformOnly.checked = !this.showAllPlatforms;
    currentPlatformOnly.onchange = () => {
      this.showAllPlatforms = !currentPlatformOnly.checked;
      this.render();
    };
    const filterText = document.createElement("span");
    filterText.textContent = "仅当前系统";
    platformFilter.append(currentPlatformOnly, filterText);
    toolbar.append(platformFilter);
    return toolbar;
  }

  private summary(model: KtcRunViewModel): HTMLElement {
    const activeCount = model.executions.filter((execution) => ["starting", "running", "stopping"].includes(execution.state)).length;
    const summary = document.createElement("div");
    summary.className = "summary";
    const text = document.createElement("span");
    text.className = "summary-text";
    text.textContent = model.trusted ? model.statusText : `${model.statusText} 未信任工作区只读。`;
    text.title = text.textContent;
    const badges = document.createElement("span");
    badges.className = "badge-tail";
    badges.append(this.badge(model.platformLabel), this.badge(`${model.projects.length} 项目`), this.badge(`${activeCount} 运行中`));
    summary.append(text, badges);
    return summary;
  }

  private navigationTree(model: KtcRunViewModel): KtcNavigationTreeElement {
    const tree = document.createElement("pnw-navigation-tree") as KtcNavigationTreeElement;
    tree.className = "run-tree";
    tree.colorScheme = "system";
    const nodes = [this.utilityNode(), ...model.projects.map((project, index) => this.projectNode(project, index))];
    const allNodeIds = new Set(this.projectByNodeId.keys());
    for (const targetId of this.targetByNodeId.keys()) allNodeIds.add(targetId);
    for (const actionId of this.utilityActionByNodeId.keys()) allNodeIds.add(actionId);
    if (this.selectedNodeId && !allNodeIds.has(this.selectedNodeId)) this.selectedNodeId = undefined;
    tree.model = {
      ariaLabel: "运行目标树",
      nodes,
      expandedNodeIds: [...this.expandedNodeIds],
      ...(this.selectedNodeId ? { selectedNodeId: this.selectedNodeId } : {}),
      emptyMessage: "打开文件夹或工作区后，这里会按项目列出运行目标。",
    };
    tree.addEventListener("pnw-navigation-tree-action", (event) => {
      this.handleTreeAction((event as CustomEvent<KtcNavigationTreeAction>).detail);
    });
    return tree;
  }

  private utilityNode(): KtcNavigationTreeNode {
    const id = "run-utility";
    const children: readonly [string, string, KtcRunUtilityAction, KtcNavigationTreeIconKey][] = [
      ["run-utility-terminal", "打开 Terminal", "openTerminal", "catalog"],
      ["run-utility-problems", "查看 Problems", "openProblems", "warning"],
      ["run-utility-output", "查看运行日志", "openOutput", "info"],
    ];
    for (const [childId, , action] of children) this.utilityActionByNodeId.set(childId, action);
    return {
      id,
      label: "运行辅助",
      description: "Terminal · Problems · 日志",
      iconKey: "settings",
      children: children.map(([childId, label, action, iconKey]) => ({
        id: childId,
        label,
        iconKey,
        description: action === "openTerminal" ? "VS Code Terminal" : action === "openProblems" ? "编译与运行问题" : "KT Auto Code 输出",
      })),
    };
  }

  private projectNode(project: KtcRunProject, index: number): KtcNavigationTreeNode {
    const projectId = this.projectNodeId(project);
    this.projectByNodeId.set(projectId, project);
    const groups: KtcNavigationTreeNode[] = [];
    const groupIds: string[] = [];
    project.groups.forEach((group, groupIndex) => {
      const visible = group.targets.filter((target) => this.showAllPlatforms || target.availability !== "other-platform");
      if (!visible.length) return;
      const groupId = `${projectId}:group:${group.id}`;
      groupIds.push(groupId);
      groups.push({
        id: groupId,
        label: group.title,
        description: `${visible.length} 项`,
        iconKey: "catalog",
        children: visible.map((target) => this.targetNode(project, target)),
      });
    });
    this.groupIdsByProjectNodeId.set(projectId, groupIds);
    // 首次只展开首个项目；项目内部的目标分组全部展开，打开后即可直接执行命令。
    if (index === 0 && this.expandedNodeIds.size === 0) this.expandProjectWithGroups(projectId);
    return {
      id: projectId,
      label: project.name,
      description: `${project.kindLabel} · ${project.relativePath}`,
      iconKey: this.expandedNodeIds.has(projectId) ? "folder-open" : "folder",
      children: groups,
    };
  }

  private targetNode(project: KtcRunProject, target: KtcRunTarget): KtcNavigationTreeNode {
    const id = this.targetNodeId(project, target);
    this.targetByNodeId.set(id, target);
    const availability = target.running
      ? "运行中"
      : target.availability === "other-platform"
        ? "其他系统（可试运行）"
        : target.availability === "ready"
          ? target.source
          : "不可用";
    return {
      id,
      label: target.title,
      description: `${availability} · ${target.relativePath}`,
      iconKey: target.availability === "disabled" || target.availability === "untrusted" ? "warning" : "file",
      disabled: target.availability === "disabled" || target.availability === "untrusted",
    };
  }

  private handleTreeAction(action: KtcNavigationTreeAction): void {
    if (action.kind === "toggle") {
      if (action.expanded) this.expandProjectWithGroups(action.nodeId);
      else this.expandedNodeIds.delete(action.nodeId);
      this.render();
      return;
    }
    // Wing 对有 children 的整行单击会发 select + 唯一 toggle：Auto 只记录选择，
    // 展开状态只由上面的标准 toggle 事件回写，避免维护第二套分组切换逻辑。
    this.selectedNodeId = action.nodeId;
    // 叶子命令单击即直接调用 Host runner；不再在 Tree 下方重复放一行运行按钮。
    this.runSelectedTarget();
  }

  private expandProjectWithGroups(nodeId: string): void {
    this.expandedNodeIds.add(nodeId);
    for (const groupId of this.groupIdsByProjectNodeId.get(nodeId) ?? []) this.expandedNodeIds.add(groupId);
  }

  private runSelectedTarget(): void {
    const utilityAction = this.selectedUtilityAction();
    if (utilityAction) {
      this.emit({ action: utilityAction });
      return;
    }
    const target = this.selectedTarget();
    if (!target) return;
    if (target.running) this.emit({ action: "stopRun", runId: target.running.runId });
    else if (target.availability === "other-platform") this.emit({ action: "dryRunTarget", targetId: target.id });
    else if (target.availability === "ready") this.emit({ action: "runTarget", targetId: target.id });
  }

  private caaVersion(project: KtcRunProject): HTMLElement {
    const row = document.createElement("div");
    row.className = "project-options";
    const text = document.createElement("span");
    text.textContent = "当前 CAA 版本";
    const input = document.createElement("input");
    input.className = "version-input";
    input.value = project.caaVersion ?? "19";
    input.setAttribute("aria-label", `${project.name} 当前 CAA 版本`);
    input.onchange = () => this.emit({ action: "setCaaVersion", projectId: project.id, value: input.value });
    const source = document.createElement("span");
    source.className = "project-option-source";
    source.textContent = `来源：${project.caaVersionSource ?? "建议"}`;
    const related = document.createElement("button");
    related.type = "button";
    related.className = "project-option-button";
    related.textContent = `关联工程 ${project.relatedProjectCount}`;
    related.title = project.relatedProjectSummary ? `MK Preq：${project.relatedProjectSummary}` : "从当前工作区已发现的项目中选择 MK Preq";
    related.onclick = () => this.emit({ action: "selectCaaRelated", projectId: project.id });
    const addFolder = document.createElement("button");
    addFolder.type = "button";
    addFolder.className = "project-option-button";
    addFolder.textContent = "+目录";
    addFolder.title = "添加一个或多个 MK Preq 目录";
    addFolder.onclick = () => this.emit({ action: "addCaaRelatedFolder", projectId: project.id });
    row.append(text, input, source, related, addFolder);
    return row;
  }

  private executionHistory(model: KtcRunViewModel): HTMLElement {
    const history = document.createElement("section");
    history.className = "history";
    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = "最近运行";
    history.append(title);
    for (const execution of [...model.executions].reverse().slice(0, 30)) {
      const row = document.createElement("div");
      row.className = "history-row";
      const label = document.createElement("span");
      label.className = "history-label";
      label.textContent = execution.label;
      label.title = `${execution.label} · ${execution.runId}`;
      row.append(label, this.badge(execution.exitCode === undefined ? execution.state : `${execution.state} (${execution.exitCode})`));
      history.append(row);
    }
    return history;
  }

  private selectedTarget(): KtcRunTarget | undefined {
    return this.selectedNodeId ? this.targetByNodeId.get(this.selectedNodeId) : undefined;
  }

  private selectedUtilityAction(): KtcRunUtilityAction | undefined {
    return this.selectedNodeId ? this.utilityActionByNodeId.get(this.selectedNodeId) : undefined;
  }

  private selectedProject(): KtcRunProject | undefined {
    if (!this.selectedNodeId) return undefined;
    const direct = this.projectByNodeId.get(this.selectedNodeId);
    if (direct) return direct;
    const target = this.selectedTarget();
    if (!target) return undefined;
    return this.currentModel?.projects.find((project) => project.groups.some((group) => group.targets.some((candidate) => candidate.id === target.id)));
  }

  private projectNodeId(project: KtcRunProject): string { return `run-project:${project.id}`; }
  private targetNodeId(project: KtcRunProject, target: KtcRunTarget): string { return `run-target:${project.id}:${target.id}`; }

  private toolbarButton(label: string, action: "refresh" | "openOutput" | "openProblems" | "openTerminal", title: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar-button";
    button.textContent = label;
    button.title = title;
    button.onclick = () => this.emit({ action });
    return button;
  }

  private badge(text: string): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = text;
    return badge;
  }

  private note(): HTMLElement {
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "单击可运行的命令会直接启动；所有目标均通过 VS Code Task API 进入 Task Terminal。";
    return note;
  }

  private empty(text: string): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    return empty;
  }

  private emit(detail: KtcRunPrimaryActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcRunPrimaryActionDetail>("ktc-run-primary-action", { bubbles: true, composed: true, detail }));
  }
}

export function KtcDefineRunPrimaryPanel(tagName = KtcRunPrimaryPanelTag): typeof KtcRunPrimaryPanel {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcRunPrimaryPanel;
  customElements.define(tagName, KtcRunPrimaryPanel);
  return KtcRunPrimaryPanel;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-run-primary-panel": KtcRunPrimaryPanel;
  }
}
