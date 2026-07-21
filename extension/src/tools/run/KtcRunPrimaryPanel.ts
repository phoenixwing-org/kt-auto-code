import type {
  KtcRunGroup,
  KtcRunProject,
  KtcRunTarget,
  KtcRunViewModel,
} from "../../../../src/run/KtcRunModel.js";
import { KtcCompactManagerLabelStyle } from "../../ui/KtcCompactManagerLabel.js";

export const KtcRunPrimaryPanelTag = "ktc-run-primary-panel";

export type KtcRunPrimaryActionDetail =
  | { readonly action: "refresh" | "openOutput" | "openProblems" | "openTerminal" }
  | { readonly action: "runTarget" | "dryRunTarget" | "openSource"; readonly targetId: string }
  | { readonly action: "stopRun"; readonly runId: string }
  | { readonly action: "selectCaaRelated" | "addCaaRelatedFolder"; readonly projectId: string }
  | { readonly action: "setCaaVersion"; readonly projectId: string; readonly value: string };

const KtcRunPrimaryPanelStyle = `
  :host { display: grid; width: 100%; min-width: 0; max-width: 100%; min-height: 0; overflow-x: hidden; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button:focus-visible, input:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .toolbar { position: sticky; z-index: 12; top: 0; display: flex; min-width: 0; max-width: 100%; flex-wrap: wrap; align-items: center; gap: 3px; padding: 3px 5px; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); border-block: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .toolbar-button { min-height: 26px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 3px; cursor: pointer; }
  .toolbar-button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); }
  .platform-filter { display: inline-flex; min-width: 0; align-items: center; gap: 4px; margin-left: auto; color: var(--vscode-descriptionForeground); white-space: nowrap; }
  .summary { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 5px 6px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .summary-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge-tail { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; }
  .badge { padding: 1px 5px; color: var(--vscode-descriptionForeground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 999px; font-size: 10px; white-space: nowrap; }
  .project { border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .project > summary, .group > summary { display: flex; min-width: 0; align-items: center; gap: 5px; min-height: 30px; padding: 3px 6px; background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)); cursor: pointer; user-select: none; }
  .project > summary::-webkit-details-marker, .group > summary::-webkit-details-marker { display: none; }
  .project > summary::before, .group > summary::before { content: "›"; flex: 0 0 auto; font-size: 16px; line-height: 1; }
  .project[open] > summary::before, .group[open] > summary::before { transform: rotate(90deg); }
  .project-options { display: flex; min-width: 0; max-width: 100%; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 6px 4px 22px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .version-input { width: 64px; min-height: 24px; padding: 2px 5px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .project-option-button { min-height: 24px; padding: 1px 6px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 3px; cursor: pointer; white-space: nowrap; }
  .project-option-button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); }
  .project-option-source { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .groups { border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .group { border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .group:last-child { border-bottom: 0; }
  .group > summary { min-height: 27px; padding-left: 16px; font-weight: 600; }
  .group-title { margin-right: auto; }
  .target-list { display: grid; }
  .target-row { display: flex; min-width: 0; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .target-row:last-child { border-bottom: 0; }
  .target { display: flex; flex: 1 1 auto; width: 100%; min-width: 0; min-height: 34px; align-items: center; gap: 6px; padding: 3px 6px 3px 34px; color: var(--vscode-foreground); background: transparent; border: 0; text-align: left; }
  .target-action { flex: 0 0 52px; min-width: 52px; padding: 0 7px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-left: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); cursor: pointer; font-weight: 600; opacity: 0; pointer-events: none; transition: opacity .08s ease; white-space: nowrap; }
  .target-action.trial { color: var(--vscode-editorWarning-foreground); background: transparent; }
  .target-action:hover:not(:disabled), .source-button:hover:not(:disabled) { background: var(--vscode-list-hoverBackground); box-shadow: inset 0 0 0 1px var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .target-action:disabled, .source-button:disabled { opacity: .48; cursor: not-allowed; }
  .source-button { flex: 0 0 28px; padding: 0; color: var(--vscode-foreground); background: transparent; border: 0; border-left: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .08s ease; }
  .target-row:hover .target-action, .target-row:hover .source-button, .target-row:focus-within .target-action, .target-row:focus-within .source-button { opacity: 1; pointer-events: auto; }
  .target-row:hover .target-action:disabled, .target-row:hover .source-button:disabled, .target-row:focus-within .target-action:disabled, .target-row:focus-within .source-button:disabled { opacity: .42; }
  .target-platform { color: var(--vscode-editorWarning-foreground); border-color: currentColor; }
  .target-running { color: var(--vscode-charts-blue); border-color: currentColor; }
  .target-failed { color: var(--vscode-errorForeground); border-color: currentColor; }
  .diagnostics { max-height: 100px; padding: 5px 6px; overflow: auto; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font-size: 10px; }
  .history { max-height: 130px; overflow: auto; border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .history-title, .history-row { display: flex; min-width: 0; align-items: center; gap: 6px; min-height: 26px; padding: 3px 6px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .history-title { font-weight: 650; background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)); }
  .history-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { padding: 10px 8px 10px 34px; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .note { padding: 7px 6px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font-size: 11px; }
`;

export class KtcRunPrimaryPanel extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcRunViewModel | undefined;
  private showAllPlatforms = false;

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
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.append(
      this.toolbarButton("刷新", "refresh", "重新扫描运行目标"),
      this.toolbarButton("Terminal", "openTerminal", "打开 VS Code Terminal"),
      this.toolbarButton("Problems", "openProblems", "打开 VS Code Problems"),
      this.toolbarButton("日志", "openOutput", "打开 KT Auto Code 输出"),
    );
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

    const activeCount = model.executions.filter((execution) => ["starting", "running", "stopping"].includes(execution.state)).length;
    const summary = document.createElement("div");
    summary.className = "summary";
    const summaryText = document.createElement("span");
    summaryText.className = "summary-text";
    summaryText.textContent = model.trusted ? model.statusText : `${model.statusText} 未信任工作区只读。`;
    summaryText.title = summaryText.textContent;
    const badges = document.createElement("span");
    badges.className = "badge-tail";
    badges.append(this.badge(model.platformLabel), this.badge(`${model.projects.length} 项目`), this.badge(`${activeCount} 运行中`));
    summary.append(summaryText, badges);

    const projects = document.createElement("div");
    if (model.projects.length === 0) projects.append(this.empty("打开文件夹或工作区后，这里会按项目列出运行目标。"));
    else for (const project of model.projects) projects.append(this.project(project));
    const content: Node[] = [style, toolbar, summary, projects];
    if (model.executions.length > 0) content.push(this.executionHistory(model));
    if (model.diagnostics.length > 0) {
      const diagnostics = document.createElement("div");
      diagnostics.className = "diagnostics";
      diagnostics.textContent = model.diagnostics.join("\n");
      content.push(diagnostics);
    }
    const note = document.createElement("div");
    note.className = "note";
    note.textContent = "所有目标通过 VS Code Task API 进入 Task Terminal；命名 problem matcher 会把编译错误送入 Problems。";
    content.push(note);
    this.root.replaceChildren(...content);
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

  private project(project: KtcRunProject): HTMLElement {
    const details = document.createElement("details");
    details.className = "project";
    details.open = project.groups.some((group) => group.targets.length > 0);
    const summary = document.createElement("summary");
    const label = document.createElement("span");
    label.className = "project-label ktc-compact-label";
    label.title = `${project.name} · ${project.relativePath}`;
    const name = document.createElement("span");
    name.className = "project-name ktc-compact-label-primary";
    name.textContent = project.name;
    const projectPath = document.createElement("span");
    projectPath.className = "project-path ktc-compact-label-secondary";
    projectPath.textContent = ` · ${project.relativePath}`;
    label.append(name, projectPath);
    const tail = document.createElement("span");
    tail.className = "badge-tail";
    tail.append(this.badge(project.kindLabel));
    summary.append(label, tail);
    details.append(summary);
    if (project.caaVersion) details.append(this.caaVersion(project));
    const groups = document.createElement("div");
    groups.className = "groups";
    for (const group of project.groups) {
      const rendered = this.group(group);
      if (rendered) groups.append(rendered);
    }
    details.append(groups);
    return details;
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
    related.title = project.relatedProjectSummary
      ? `MK Preq：${project.relatedProjectSummary}`
      : "从当前工作区已发现的项目中选择 MK Preq";
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

  private group(group: KtcRunGroup): HTMLElement | undefined {
    const visible = group.targets.filter((target) => this.showAllPlatforms || target.availability !== "other-platform");
    if (visible.length === 0) return undefined;
    const details = document.createElement("details");
    details.className = "group";
    details.open = visible.length > 0;
    const summary = document.createElement("summary");
    const title = document.createElement("span");
    title.className = "group-title";
    title.textContent = group.title;
    const tail = document.createElement("span");
    tail.className = "badge-tail";
    tail.append(this.badge(`${visible.length} 项`));
    summary.append(title, tail);
    const list = document.createElement("div");
    list.className = "target-list";
    for (const target of visible) list.append(this.target(target));
    details.append(summary, list);
    return details;
  }

  private target(target: KtcRunTarget): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "target-row";
    const row = document.createElement("div");
    row.className = "target";
    row.title = `${target.title} · ${target.relativePath}\ncwd: ${target.cwd}\nsource: ${target.source}\nmatcher: ${target.problemMatchers.join(", ") || "none"}${target.disabledReason ? `\n${target.disabledReason}` : ""}`;
    row.setAttribute("aria-label", row.title);
    const label = document.createElement("span");
    label.className = "target-label ktc-compact-label";
    const name = document.createElement("span");
    name.className = "target-name ktc-compact-label-primary";
    name.textContent = target.title;
    const targetPath = document.createElement("span");
    targetPath.className = "target-path ktc-compact-label-secondary";
    targetPath.textContent = ` · ${target.relativePath}`;
    label.append(name, targetPath);
    const tail = document.createElement("span");
    tail.className = "badge-tail";
    tail.append(this.badge(target.source));
    if (target.problemMatchers.length > 0) tail.append(this.badge(target.matcherFidelity === "native" ? "Problems 完整" : "Problems"));
    if (target.platformLabel !== "全部") {
      const platform = this.badge(target.platformLabel);
      platform.classList.add("target-platform");
      tail.append(platform);
    }
    if (target.running) {
      const running = this.badge(target.running.state === "stopping" ? "停止中" : "运行中 · 点击停止");
      running.classList.add("target-running");
      tail.append(running);
    }
    row.append(label, tail);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "target-action" + (target.availability === "other-platform" ? " trial" : "");
    action.textContent = target.running
      ? "停止"
      : target.availability === "other-platform"
        ? "试运行"
        : target.availability === "ready"
          ? "运行"
          : "不可用";
    action.title = target.availability === "other-platform"
      ? "只输出目标、平台、cwd、命令与 matcher 诊断；不会启动任务"
      : action.textContent;
    action.disabled = !target.running && target.availability !== "ready" && target.availability !== "other-platform";
    action.onclick = () => target.running
      ? this.emit({ action: "stopRun", runId: target.running!.runId })
      : target.availability === "other-platform"
        ? this.emit({ action: "dryRunTarget", targetId: target.id })
        : this.emit({ action: "runTarget", targetId: target.id });
    const source = document.createElement("button");
    source.type = "button";
    source.className = "source-button";
    source.textContent = "↗";
    source.title = "打开目标来源";
    source.setAttribute("aria-label", "打开目标来源");
    source.disabled = !target.sourceUri;
    source.onclick = () => this.emit({ action: "openSource", targetId: target.id });
    wrapper.append(row, action, source);
    return wrapper;
  }

  private toolbarButton(
    label: string,
    action: "refresh" | "openOutput" | "openProblems" | "openTerminal",
    title: string,
  ): HTMLButtonElement {
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

  private empty(text: string): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    return empty;
  }

  private emit(detail: KtcRunPrimaryActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcRunPrimaryActionDetail>(
      "ktc-run-primary-action",
      { bubbles: true, composed: true, detail },
    ));
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
