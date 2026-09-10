import type {
  KtcAutoBuildPrimaryPanelAction,
  KtcAutoBuildPrimaryPanelModel,
} from "../../core/autoBuildPrimaryContracts.js";
import { ktcCreateCmakeBuildOptions } from "../../ui/KtcCmakeBuildOptions.js";

export const KtcAutoBuildPrimaryPanelTag = "ktc-auto-build-primary-panel";

export interface KtcAutoBuildPrimaryActionDetail {
  readonly actionId: string;
  readonly value?: string;
}

const styleText = `
  :host { display: block; width: 100%; min-width: 0; max-width: 100%; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button { font: inherit; }
  button:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .section-heading, .subheading, .config, .config-status, details > summary { display: flex; min-width: 0; min-height: 28px; align-items: center; gap: 6px; padding: 4px 7px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .section-heading { border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font-weight: 650; }
  .status { margin-left: auto; padding: 1px 5px; color: var(--vscode-descriptionForeground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 999px; font-size: 10px; font-weight: 400; white-space: nowrap; }
  .status.running { color: var(--vscode-progressBar-background, var(--vscode-focusBorder)); }
  .status.done { color: var(--vscode-testing-iconPassed, var(--vscode-foreground)); }
  .status.error { color: var(--vscode-errorForeground); }
  .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .metric { display: grid; min-width: 0; justify-items: center; gap: 1px; padding: 5px 2px; border-right: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .metric:last-child { border-right: 0; }
  .metric strong { font-size: 14px; }
  .metric small { color: var(--vscode-descriptionForeground); font-size: 10px; }
  .actions { display: flex; min-width: 0; flex-wrap: wrap; justify-content: flex-start; gap: 5px; padding: 5px 7px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .execution-options { display: flex; flex-wrap: wrap; gap: 5px; min-height: 27px; align-items: center; padding: 3px 7px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .execution-options label { display: inline-flex; align-items: center; gap: 5px; }
  .execution-options input { width: 14px; height: 14px; margin: 0; }
  .status-line { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 4px 7px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); color: var(--vscode-descriptionForeground); }
  .status-copy { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-line button { flex: 0 0 auto; min-height: 23px; }
  button { min-height: 25px; padding: 2px 8px; color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); background: var(--vscode-button-secondaryBackground, transparent); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 2px; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); }
  button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
  button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button.danger { color: var(--vscode-errorForeground); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .config { max-width: 100%; flex-wrap: wrap; gap: 4px; padding-block: 3px; }
  .config:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .config-action-slot { display: inline-flex; flex: 0 0 auto; }
  .config-status { flex-wrap: nowrap; }
  .config-status strong { flex: 0 0 auto; white-space: nowrap; }
  .config-name { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); text-overflow: ellipsis; white-space: nowrap; }
  .config-state { flex: 0 0 auto; color: var(--vscode-descriptionForeground); font-size: 10px; white-space: nowrap; }
  .config-state.dirty { color: var(--vscode-editorWarning-foreground, var(--vscode-descriptionForeground)); }
  .config button { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; min-width: 0; white-space: nowrap; }
  .config-warning { display: grid; gap: 5px; padding: 6px 7px; color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); background: var(--vscode-inputValidation-warningBackground, transparent); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .config-warning-actions { display: flex; gap: 5px; flex-wrap: wrap; }
  .config-recent { display: flex; min-width: 0; padding: 4px 7px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .config-recent select { width: 100%; min-width: 0; height: 25px; color: var(--vscode-dropdown-foreground, var(--vscode-foreground)); background: var(--vscode-dropdown-background, var(--vscode-input-background)); border: 1px solid var(--vscode-dropdown-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .empty { padding: 7px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font-size: 11px; }
  details { border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  details > summary { min-height: 27px; cursor: pointer; list-style: none; font-weight: 650; }
  details > summary::-webkit-details-marker { display: none; }
  details > summary::before { width: 14px; content: "›"; font-size: 17px; line-height: 1; }
  details[open] > summary::before { transform: rotate(90deg); }
  .summary-hint { min-width: 0; margin-left: auto; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  dl { display: grid; min-width: 0; grid-template-columns: max-content minmax(0, 1fr); gap: 3px 8px; margin: 0; padding: 6px 7px 7px 21px; }
  dt { color: var(--vscode-descriptionForeground); }
  dd { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .maintenance { display: grid; }
  .maintenance-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 6px 7px 7px 21px; }
  .maintenance-copy { display: grid; min-width: 0; gap: 1px; }
  .maintenance-copy small { overflow: hidden; color: var(--vscode-descriptionForeground); text-overflow: ellipsis; white-space: nowrap; }
`;

export class KtcAutoBuildPrimaryPanel extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcAutoBuildPrimaryPanelModel | undefined;
  private environmentExpanded = true;
  private maintenanceExpanded = true;

  get model(): KtcAutoBuildPrimaryPanelModel | undefined { return this.currentModel; }
  set model(value: KtcAutoBuildPrimaryPanelModel | undefined) {
    this.currentModel = value;
    this.render();
  }

  connectedCallback(): void {
    this.upgradePreDefinitionModel();
    this.render();
  }

  private upgradePreDefinitionModel(): void {
    if (!Object.prototype.hasOwnProperty.call(this, "model")) return;
    const holder = this as unknown as { model?: KtcAutoBuildPrimaryPanelModel };
    const model = holder.model;
    delete holder.model;
    this.model = model;
  }

  private render(): void {
    if (!this.isConnected) return;
    const style = document.createElement("style");
    style.textContent = styleText;
    const model = this.currentModel;
    if (!model) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "编译工具 Primary 正在读取状态…";
      this.root.replaceChildren(style, empty);
      return;
    }

    this.root.replaceChildren(
      style,
      this.configuration(model),
      this.overview(model),
      this.maintenance(model),
      this.environment(model),
    );
  }

  private overview(model: KtcAutoBuildPrimaryPanelModel): HTMLElement {
    const section = document.createElement("section");
    section.className = "region execution";
    section.setAttribute("data-section", "execution");
    const heading = document.createElement("div");
    heading.className = "section-heading";
    const title = document.createElement("span");
    title.textContent = "执行";
    const status = document.createElement("span");
    status.className = `status ${model.status}`;
    status.textContent = model.ready
      ? model.status === "running" ? "运行中" : model.status === "done" ? "已完成" : model.status === "error" ? "失败" : "等待操作"
      : "连接中";
    status.title = model.statusText;
    heading.append(title, status);

    const actions = document.createElement("div");
    actions.className = "actions";
    for (const id of ["openScript", "preflight", "start", "stop"]) {
      const action = model.actions.find((candidate) => candidate.id === id);
      if (action) actions.append(this.actionButton(action, model.ready));
    }

    const executionOptions = document.createElement("div");
    executionOptions.className = "execution-options";
    const parallelAction = model.actions.find(({ id }) => id === "toggleParallelBuild");
    if (parallelAction) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = model.parallelBuild;
      checkbox.disabled = !model.ready || !parallelAction.enabled;
      checkbox.title = checkbox.disabled ? parallelAction.disabledReason || "当前动作不可用。" : "并行编译";
      checkbox.onchange = () => this.emitAction(parallelAction.id);
      label.append(checkbox, document.createTextNode("并行编译"));
      executionOptions.append(label);
    }

    const cmakeAction = model.actions.find(({ id }) => id === "setCmakeBuildTypes");
    if (cmakeAction) executionOptions.append(ktcCreateCmakeBuildOptions(
      model.cmakeBuildTypes,
      !model.ready || !cmakeAction.enabled,
      (selected) => this.emitAction(cmakeAction.id, selected.join(",")),
    ));
    const statusLine = document.createElement("div");
    statusLine.className = "status-line";
    const statusCopy = document.createElement("span");
    statusCopy.className = "status-copy";
    statusCopy.textContent = model.statusText;
    statusCopy.title = model.statusText;
    statusLine.append(statusCopy);
    const output = model.actions.find(({ id }) => id === "openOutput");
    if (output) statusLine.append(this.actionButton(output, model.ready));

    const metrics = document.createElement("div");
    metrics.className = "metrics";
    for (const item of model.metrics) {
      const metric = document.createElement("span");
      metric.className = "metric";
      const value = document.createElement("strong");
      value.textContent = item.value;
      const label = document.createElement("small");
      label.textContent = item.label;
      metric.append(value, label);
      metrics.append(metric);
    }

    section.append(heading, actions, executionOptions, statusLine, metrics);
    return section;
  }

  private configuration(model: KtcAutoBuildPrimaryPanelModel): HTMLElement {
    const section = document.createElement("section");
    section.className = "region configuration";
    section.setAttribute("data-section", "configuration");
    const row = document.createElement("div");
    row.className = "config";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "配置操作");
    row.tabIndex = 0;
    const statusRow = document.createElement("div");
    statusRow.className = "config-status";
    const label = document.createElement("strong");
    label.textContent = "当前配置";
    const name = document.createElement("span");
    name.className = "config-name";
    name.textContent = model.configuration.name;
    name.title = model.configuration.fullPath || model.configuration.name;
    const state = document.createElement("small");
    state.className = `config-state${model.configuration.dirty ? " dirty" : ""}`;
    state.textContent = model.configuration.statusLabel;
    statusRow.append(label, name, state);
    for (const id of ["openConfig", "saveConfig", "saveAsConfig", "closeConfig", "reveal"]) {
      const action = model.actions.find((candidate) => candidate.id === id);
      if (action) {
        const button = this.actionButton(action, model.ready);
        const slot = document.createElement("span");
        slot.className = "config-action-slot";
        // Disabled native buttons may not surface their own hover tooltip.
        slot.title = button.title;
        slot.append(button);
        row.append(slot);
      }
    }
    const recentRow = document.createElement("div");
    recentRow.className = "config-recent";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "最近配置");
    const placeholder = document.createElement("option");
    placeholder.textContent = "最近配置…";
    placeholder.value = "";
    select.append(placeholder);
    let enabledRecentCount = 0;
    for (const recent of model.configuration.recent) {
      const action = model.actions.find(({ id }) => id === recent.actionId);
      const option = document.createElement("option");
      option.textContent = recent.name;
      option.value = recent.actionId;
      option.title = recent.fullPath;
      option.disabled = !model.ready || !action?.enabled;
      if (action?.enabled && model.ready) enabledRecentCount += 1;
      select.append(option);
    }
    select.disabled = enabledRecentCount === 0;
    select.onchange = () => {
      const actionId = select.value;
      select.value = "";
      const action = model.actions.find(({ id }) => id === actionId);
      if (action?.enabled && model.ready) this.emitAction(actionId);
    };
    recentRow.append(select);
    section.append(row, recentRow, statusRow);
    if (model.configuration.workingDirectoryMismatch) {
      const warning = document.createElement("div");
      warning.className = "config-warning";
      warning.setAttribute("role", "alert");
      const copy = document.createElement("span");
      copy.textContent = model.configuration.workingDirectoryMismatchMessage;
      const actions = document.createElement("span");
      actions.className = "config-warning-actions";
      for (const id of ["newConfigForDirectory", "keepProjectsForDirectory"]) {
        const action = model.actions.find((candidate) => candidate.id === id);
        if (action) actions.append(this.actionButton(action, model.ready));
      }
      warning.append(copy, actions);
      section.append(warning);
    }
    return section;
  }

  private environment(model: KtcAutoBuildPrimaryPanelModel): HTMLDetailsElement {
    const details = document.createElement("details");
    details.setAttribute("data-section", "environment");
    details.open = this.environmentExpanded;
    details.ontoggle = () => { this.environmentExpanded = details.open; };
    const summary = document.createElement("summary");
    summary.append(document.createTextNode("工程环境"));
    const hint = document.createElement("span");
    hint.className = "summary-hint";
    hint.textContent = model.environmentLabel;
    summary.append(hint);
    const facts = document.createElement("dl");
    for (const item of model.environment) {
      const term = document.createElement("dt");
      term.textContent = item.label;
      const value = document.createElement("dd");
      value.textContent = item.value;
      value.title = item.value;
      facts.append(term, value);
    }
    details.append(summary, facts);
    return details;
  }

  private maintenance(model: KtcAutoBuildPrimaryPanelModel): HTMLDetailsElement {
    const details = document.createElement("details");
    details.setAttribute("data-section", "maintenance");
    details.open = this.maintenanceExpanded;
    details.ontoggle = () => { this.maintenanceExpanded = details.open; };
    const summary = document.createElement("summary");
    summary.append(document.createTextNode("维护"));
    const hint = document.createElement("span");
    hint.className = "summary-hint";
    hint.textContent = "低频";
    summary.append(hint);
    const body = document.createElement("div");
    body.className = "maintenance";
    const scriptRow = document.createElement("div");
    scriptRow.className = "maintenance-row";
    const copy = document.createElement("span");
    copy.className = "maintenance-copy";
    const label = document.createElement("strong");
    label.textContent = "脚本";
    const status = document.createElement("small");
    status.textContent = `ROOT/tools 与 ROOT/sample 同步 · ${model.maintenance.scriptStatus}`;
    status.title = model.maintenance.scriptDetail || model.maintenance.scriptStatus;
    copy.append(label, status);
    scriptRow.append(copy);
    const sync = model.actions.find(({ id }) => id === "syncRootScript");
    if (sync) scriptRow.append(this.actionButton(sync, model.ready));
    body.append(scriptRow);

    details.append(summary, body);
    return details;
  }

  private actionButton(
    action: KtcAutoBuildPrimaryPanelAction,
    ready: boolean,
    displayLabel = action.label,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.tone ?? "secondary";
    button.textContent = displayLabel;
    button.disabled = !ready || !action.enabled;
    button.title = button.disabled ? action.disabledReason || "当前动作不可用。" : action.label;
    button.setAttribute("aria-label", displayLabel);
    button.setAttribute("data-action-id", action.id);
    button.onclick = () => this.emitAction(action.id);
    return button;
  }

  private emitAction(actionId: string, value?: string): void {
    this.dispatchEvent(new CustomEvent<KtcAutoBuildPrimaryActionDetail>(
      "ktc-auto-build-primary-action",
      { detail: { actionId, ...(value === undefined ? {} : { value }) }, bubbles: true, composed: true },
    ));
  }
}

export function KtcDefineAutoBuildPrimaryPanel(): void {
  if (!customElements.get(KtcAutoBuildPrimaryPanelTag)) {
    customElements.define(KtcAutoBuildPrimaryPanelTag, KtcAutoBuildPrimaryPanel);
  }
}
