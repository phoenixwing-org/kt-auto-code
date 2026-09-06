import type { KtcIgnoreRuleAction, KtcIgnoreWriteTarget } from "../../core/ignoreManagerModel.js";
import {
  ktcBuildIgnorePrimaryPanelViewModel,
  ktcCreateIgnorePrimaryPanelState,
  ktcReconcileIgnorePrimaryPanelState,
  ktcReduceIgnorePrimaryPanelState,
  ktcSelectedIgnoreRules,
  type KtcIgnorePanelSectionId,
  type KtcIgnorePrimaryPanelModel,
  type KtcIgnorePrimaryPanelState,
  type KtcIgnorePrimaryPanelViewModel,
  type KtcIgnoreRecommendationViewModel,
  type KtcIgnoreRuleScope,
  type KtcIgnoreRuleViewModel,
  type KtcIgnoreSourceId,
  type KtcIgnoreTargetViewModel,
} from "./KtcIgnorePrimaryPanelModel.js";

export const KtcIgnorePrimaryPanelTag = "ktc-ignore-primary-panel";
export const KTC_IGNORE_PRIMARY_ACTION = "ktc-ignore-primary-action";

export type KtcIgnorePrimaryActionDetail =
  | { readonly action: "setSourceEnabled"; readonly source: KtcIgnoreSourceId; readonly enabled: boolean }
  | { readonly action: "selectTarget"; readonly target: KtcIgnoreWriteTarget }
  | { readonly action: "openTarget"; readonly target: KtcIgnoreWriteTarget }
  | { readonly action: "analyze" }
  | {
      readonly action: "applyRules";
      readonly scope: KtcIgnoreRuleScope;
      readonly target: KtcIgnoreWriteTarget;
      readonly operation: KtcIgnoreRuleAction;
      readonly rules: readonly string[];
    };

const KtcIgnorePrimaryPanelStyle = `
  :host { display:block; width:100%; min-width:0; max-width:100%; color:var(--vscode-foreground); font:12px/1.35 var(--vscode-font-family); }
  * { box-sizing:border-box; }
  button, input { font:inherit; }
  button:focus-visible, input:focus-visible, summary:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .sections { display:block; width:100%; min-width:0; }
  .section { width:100%; margin:0; border-block-end:1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .section:first-child { border-block-start:1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .section > summary { display:flex; width:100%; min-height:28px; align-items:center; gap:2px; padding:0 5px; color:var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground)); background:var(--vscode-sideBarSectionHeader-background, transparent); cursor:pointer; font-weight:650; list-style:none; }
  .section > summary::-webkit-details-marker, .preset-group > summary::-webkit-details-marker, .recommendation-group > summary::-webkit-details-marker { display:none; }
  .chevron { width:16px; height:16px; flex:0 0 16px; fill:currentColor; transform:rotate(-90deg); transform-origin:center; transition:transform .1s ease; }
  details[open] > summary .chevron { transform:rotate(0); }
  .section-count { margin-left:auto; color:var(--vscode-descriptionForeground); font-size:10px; font-weight:400; white-space:nowrap; }
  .section-body { min-width:0; padding:6px 8px 8px; }
  .status { margin:0 0 7px; color:var(--vscode-descriptionForeground); font-size:11px; }
  .source-row { display:flex; min-width:0; flex-wrap:wrap; align-items:center; gap:5px 12px; margin-bottom:8px; }
  .source-row label { display:inline-flex; align-items:center; gap:4px; cursor:pointer; white-space:nowrap; }
  .source-row input { margin:0; }
  .subheading { margin:8px 0 5px; color:var(--vscode-descriptionForeground); font-size:10px; font-weight:650; letter-spacing:.02em; text-transform:uppercase; }
  .target-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:4px; }
  .target { display:flex; min-width:0; min-height:46px; align-items:center; gap:5px; padding:4px 6px; border:1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius:3px; color:var(--vscode-foreground); background:var(--vscode-button-secondaryBackground); cursor:pointer; text-align:left; }
  .target:hover:not(.disabled) { border-color:var(--ktc-ui-active-border, var(--vscode-focusBorder)); background:var(--vscode-button-secondaryHoverBackground); }
  .target.selected { border-color:var(--ktc-ui-active-border, var(--vscode-focusBorder)); color:var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); background:var(--vscode-list-activeSelectionBackground, var(--vscode-button-secondaryBackground)); }
  .target.disabled { opacity:.55; cursor:not-allowed; }
  .target input { flex:0 0 auto; margin:0; }
  .target-copy { display:grid; min-width:0; flex:1 1 auto; gap:1px; }
  .target-label, .target-status { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .target-label { font-weight:650; }
  .target-status { color:var(--vscode-descriptionForeground); font-size:10px; }
  .toolbar, .selection-actions { display:flex; min-width:0; align-items:center; gap:5px; margin-top:7px; }
  .toolbar button, .selection-actions button { min-height:26px; padding:2px 8px; border:1px solid var(--ktc-ui-border, var(--vscode-button-border, transparent)); border-radius:2px; color:var(--vscode-button-foreground); background:var(--vscode-button-background); cursor:pointer; }
  .toolbar button.secondary, .selection-actions button.secondary { color:var(--vscode-button-secondaryForeground); background:var(--vscode-button-secondaryBackground); }
  .toolbar button:hover:not(:disabled), .selection-actions button:hover:not(:disabled) { border-color:var(--ktc-ui-active-border, var(--vscode-focusBorder)); background:var(--vscode-button-hoverBackground); }
  .toolbar button.secondary:hover:not(:disabled), .selection-actions button.secondary:hover:not(:disabled) { background:var(--vscode-button-secondaryHoverBackground); }
  .toolbar button:disabled, .selection-actions button:disabled { opacity:.5; cursor:not-allowed; }
  .toolbar button { flex:1 1 0; }
  .selection-actions { justify-content:flex-end; }
  .selection-actions .selection-hint { min-width:0; margin-right:auto; color:var(--vscode-descriptionForeground); font-size:10px; }
  .preset-list, .recommendation-list, .rule-list { display:block; min-width:0; }
  .preset-group, .recommendation-group { width:100%; margin:0; border-block-start:1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .preset-group > summary { display:flex; min-height:30px; align-items:center; gap:3px; padding:2px 2px; cursor:pointer; list-style:none; }
  .preset-copy { display:grid; min-width:0; flex:1 1 auto; }
  .preset-title, .preset-description { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .preset-title { font-weight:650; }
  .preset-description { color:var(--vscode-descriptionForeground); font-size:10px; }
  .badge { display:inline-flex; flex:0 0 auto; align-items:center; min-height:17px; padding:0 4px; border:1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius:999px; color:var(--vscode-descriptionForeground); font-size:9px; white-space:nowrap; }
  .rule-list { padding:1px 0 4px 18px; }
  .rule-row { display:flex; min-width:0; min-height:25px; align-items:center; gap:5px; padding:2px 3px; }
  .rule-row:hover { background:var(--vscode-list-hoverBackground); }
  .rule-row input { flex:0 0 auto; margin:0; }
  .rule-value { min-width:0; flex:1 1 auto; overflow:hidden; color:var(--vscode-foreground); font-family:var(--vscode-editor-font-family); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
  .rule-status { flex:0 0 auto; max-width:48%; overflow:hidden; color:var(--vscode-descriptionForeground); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
  .rule-row.blocked .rule-status { color:var(--vscode-errorForeground); }
  .empty, .notice { margin:0; padding:6px 3px; color:var(--vscode-descriptionForeground); font-size:11px; }
  .notice.warning { color:var(--vscode-errorForeground); }
  .built-in-list, .effective-list { display:block; min-width:0; }
  .built-in-row,
  .effective-row { display:flex; min-width:0; min-height:25px; align-items:center; gap:5px; padding:2px 3px; border-block-end:1px solid color-mix(in srgb, var(--ktc-ui-border, var(--vscode-panel-border)) 55%, transparent); }
  .built-in-row:last-child, .effective-row:last-child { border-block-end:0; }
  .source-badges { display:inline-flex; flex:0 0 auto; align-items:center; gap:3px; }
  .source-badge.git { color:var(--vscode-gitDecoration-modifiedResourceForeground, var(--vscode-descriptionForeground)); }
  .source-badge.phoenix { color:var(--vscode-textLink-foreground, var(--vscode-descriptionForeground)); }
  .recommendation-group > summary { display:grid; grid-template-rows:minmax(18px, auto) minmax(16px, auto); min-width:0; min-height:38px; padding:2px 3px; cursor:pointer; list-style:none; }
  .recommendation-line { display:flex; min-width:0; align-items:center; gap:4px; }
  .recommendation-title { min-width:0; flex:1 1 auto; overflow:hidden; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
  .recommendation-stats { flex:0 0 auto; color:var(--vscode-descriptionForeground); font-size:9px; white-space:nowrap; }
  .recommendation-second-line { min-width:0; padding-left:19px; overflow:hidden; color:var(--vscode-descriptionForeground); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
  .recommendation-evidence { margin:2px 3px 3px 21px; overflow:hidden; color:var(--vscode-descriptionForeground); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
  @media (max-width:260px) {
    .target-grid { grid-template-columns:minmax(0, 1fr); }
    .recommendation-stats { display:none; }
    .rule-status { max-width:38%; }
  }
  @media (forced-colors:active) {
    .target.selected, .section, .preset-group, .recommendation-group { border-color:CanvasText; }
  }
`;

export class KtcIgnorePrimaryPanel extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcIgnorePrimaryPanelModel | undefined;
  private uiState: KtcIgnorePrimaryPanelState = ktcCreateIgnorePrimaryPanelState();
  private receivedModel = false;

  get model(): KtcIgnorePrimaryPanelModel | undefined { return this.currentModel; }
  set model(value: KtcIgnorePrimaryPanelModel | undefined) {
    this.currentModel = value;
    this.uiState = this.receivedModel
      ? ktcReconcileIgnorePrimaryPanelState(this.uiState, value)
      : ktcCreateIgnorePrimaryPanelState(value);
    this.receivedModel = true;
    this.render();
  }

  connectedCallback(): void { this.render(); }

  private render(): void {
    if (!this.isConnected) return;
    const view = ktcBuildIgnorePrimaryPanelViewModel(this.currentModel, this.uiState);
    const style = document.createElement("style");
    style.textContent = KtcIgnorePrimaryPanelStyle;
    const sections = document.createElement("div");
    sections.className = "sections";
    sections.append(
      this.sourceSection(view),
      this.builtInSection(view),
      this.effectiveSection(view),
      this.recommendationSection(view),
    );
    this.root.replaceChildren(style, sections);
  }

  private sourceSection(view: KtcIgnorePrimaryPanelViewModel): HTMLDetailsElement {
    const body = document.createElement("div");
    body.className = "section-body";
    const status = document.createElement("p");
    status.className = "status";
    status.textContent = view.message;
    status.title = view.message;
    body.append(status, this.sourceToggles(view));

    const writeHeading = document.createElement("div");
    writeHeading.className = "subheading";
    writeHeading.textContent = "写入到";
    body.append(writeHeading, this.targetPicker(view), this.primaryToolbar(view));

    const presetHeading = document.createElement("div");
    presetHeading.className = "subheading";
    presetHeading.textContent = "常用规则";
    const presets = document.createElement("div");
    presets.className = "preset-list";
    for (const preset of view.presets) {
      const details = document.createElement("details");
      details.className = "preset-group";
      details.open = preset.open;
      details.setAttribute("data-preset-id", preset.id);
      details.ontoggle = () => {
        this.uiState = ktcReduceIgnorePrimaryPanelState(this.uiState, {
          type: "setPresetOpen", presetId: preset.id, open: details.open,
        });
      };
      const summary = document.createElement("summary");
      summary.setAttribute("aria-label", `展开 ${preset.title} 常用规则`);
      summary.append(this.chevron());
      const copy = document.createElement("span");
      copy.className = "preset-copy";
      const title = this.text("span", "preset-title", preset.title);
      const description = this.text("span", "preset-description", preset.description);
      copy.append(title, description);
      const count = this.badge(`${preset.actionableCount}/${preset.rules.length}`);
      summary.append(copy, count);
      details.append(summary, this.ruleList("preset", preset.rules, view.running));
      presets.append(details);
    }
    body.append(presetHeading, presets, this.selectionActions("preset", view));
    return this.section("sources", "来源与写入", "", view.openSections.sources, body);
  }

  private sourceToggles(view: KtcIgnorePrimaryPanelViewModel): HTMLElement {
    const row = document.createElement("div");
    row.className = "source-row";
    row.setAttribute("aria-label", "扫描时启用的 Ignore 来源");
    const sources: readonly [KtcIgnoreSourceId, string, boolean][] = [
      ["builtIn", "插件内置", view.sourceEnabled.builtIn],
      ["git", "Git", view.sourceEnabled.git],
      ["custom", "Phoenix .ignore", view.sourceEnabled.custom],
    ];
    for (const [source, labelText, checked] of sources) {
      const label = document.createElement("label");
      label.title = `扫描时${checked ? "停用" : "启用"}${labelText}规则`;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = checked;
      input.disabled = !view.hasWorkspace || view.running;
      input.setAttribute("aria-label", `启用 ${labelText}`);
      input.onchange = () => this.emit({ action: "setSourceEnabled", source, enabled: input.checked });
      label.append(input, this.text("span", "", labelText));
      row.append(label);
    }
    return row;
  }

  private targetPicker(view: KtcIgnorePrimaryPanelViewModel): HTMLElement {
    const picker = document.createElement("div");
    picker.className = "target-grid";
    picker.setAttribute("role", "radiogroup");
    picker.setAttribute("aria-label", "Ignore 规则写入目标");
    for (const target of view.targets) picker.append(this.targetTile(target));
    return picker;
  }

  private targetTile(target: KtcIgnoreTargetViewModel): HTMLElement {
    const label = document.createElement("label");
    label.className = `target${target.selected ? " selected" : ""}${target.available ? "" : " disabled"}`;
    label.setAttribute("data-target", target.target);
    label.title = [target.fullPath ?? target.relativePath, target.statusText].join("\n");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "ktc-ignore-write-target";
    radio.value = target.target;
    radio.checked = target.selected;
    radio.disabled = !target.available;
    radio.setAttribute("aria-label", `${target.label}，${target.statusText}`);
    radio.onchange = () => {
      if (!radio.checked || !target.available || target.selected) return;
      this.uiState = ktcReduceIgnorePrimaryPanelState(this.uiState, { type: "selectTarget", target: target.target });
      this.emit({ action: "selectTarget", target: target.target });
      this.render();
    };
    const copy = document.createElement("span");
    copy.className = "target-copy";
    copy.append(
      this.text("span", "target-label", target.label),
      this.text("span", "target-status", target.statusText),
    );
    // Native radio precedes its text so the target remains explicit in every theme.
    label.append(radio, copy);
    return label;
  }

  private primaryToolbar(view: KtcIgnorePrimaryPanelViewModel): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    const selectedTarget = view.targets.find((target) => target.target === view.selectedTarget);
    const open = this.button("打开目标文件", true);
    const canOpen = selectedTarget?.available === true && selectedTarget.exists;
    open.disabled = !canOpen || view.running;
    open.title = !selectedTarget?.available
      ? "当前写入目标不可用"
      : !selectedTarget.exists
        ? `${selectedTarget.relativePath} 尚不存在；先添加规则，创建后即可打开`
        : `打开 ${selectedTarget.relativePath}`;
    open.onclick = () => {
      if (canOpen && !view.running) this.emit({ action: "openTarget", target: view.selectedTarget });
    };
    const analyze = this.button(view.running ? "分析中…" : "分析当前目录");
    analyze.disabled = !view.hasWorkspace || view.running;
    analyze.title = view.hasWorkspace ? "分析当前目录并生成推荐规则" : "请先打开工作区文件夹";
    analyze.onclick = () => this.emit({ action: "analyze" });
    toolbar.append(open, analyze);
    return toolbar;
  }

  private effectiveSection(view: KtcIgnorePrimaryPanelViewModel): HTMLDetailsElement {
    const body = document.createElement("div");
    body.className = "section-body";
    if (view.effectiveRules.length === 0) {
      body.append(this.text("p", "empty", view.hasWorkspace ? "Git 与 Phoenix 当前没有有效规则。" : "请先打开工作区文件夹。"));
    } else {
      const list = document.createElement("div");
      list.className = "effective-list";
      list.setAttribute("role", "list");
      for (const rule of view.effectiveRules) {
        const row = document.createElement("div");
        row.className = "effective-row";
        row.setAttribute("role", "listitem");
        row.title = `${rule.value}\n来源：${rule.sources.map(sourceLabel).join("、")}`;
        row.append(this.text("code", "rule-value", rule.value));
        const badges = document.createElement("span");
        badges.className = "source-badges";
        for (const source of rule.sources) {
          const badge = this.badge(sourceLabel(source));
          badge.className += ` source-badge ${source}`;
          badges.append(badge);
        }
        row.append(badges);
        list.append(row);
      }
      body.append(list);
    }
    return this.section("effective", "有效规则", `${view.effectiveRules.length} 条`, view.openSections.effective, body);
  }

  private builtInSection(view: KtcIgnorePrimaryPanelViewModel): HTMLDetailsElement {
    const body = document.createElement("div");
    body.className = "section-body";
    if (view.builtInRules.length === 0) {
      const text = view.hasWorkspace && view.builtInRuleCount > 0
        ? `插件内置 ${view.builtInRuleCount} 条规则，等待 Host 提供规则列表。`
        : "当前没有插件内置规则。";
      body.append(this.text("p", "empty", text));
    } else {
      const list = document.createElement("div");
      list.className = "built-in-list";
      list.setAttribute("role", "list");
      for (const value of view.builtInRules) {
        const row = document.createElement("div");
        row.className = "built-in-row";
        row.setAttribute("role", "listitem");
        row.title = `${value}\n来源：插件内置`;
        row.append(this.text("code", "rule-value", value), this.badge("内置"));
        list.append(row);
      }
      body.append(list);
    }
    return this.section("builtIn", "插件内置规则", `${view.builtInRuleCount} 条`, view.openSections.builtIn, body);
  }

  private recommendationSection(view: KtcIgnorePrimaryPanelViewModel): HTMLDetailsElement {
    const body = document.createElement("div");
    body.className = "section-body";
    const report = view.recommendations;
    if (!report) {
      body.append(this.text("p", "empty", "点击“分析当前目录”生成推荐规则。"));
    } else {
      if (report.catalogError) body.append(this.text("p", "notice warning", `规则目录错误：${report.catalogError}`));
      if (report.truncated) body.append(this.text("p", "notice", "目录较大，本次推荐基于截断后的扫描结果。"));
      if (view.recommendationGroups.length === 0) {
        body.append(this.text("p", "empty", "没有可操作的推荐规则。"));
      } else {
        const list = document.createElement("div");
        list.className = "recommendation-list";
        for (const group of view.recommendationGroups) list.append(this.recommendationGroup(group, view.running));
        body.append(list, this.selectionActions("recommendation", view));
      }
    }
    return this.section(
      "recommendations",
      "推荐规则",
      report ? `${view.recommendationGroups.length} 组` : "未分析",
      view.openSections.recommendations,
      body,
    );
  }

  private recommendationGroup(group: KtcIgnoreRecommendationViewModel, running: boolean): HTMLDetailsElement {
    const details = document.createElement("details");
    details.className = "recommendation-group";
    details.open = group.open;
    details.setAttribute("data-recommendation-id", group.groupId);
    details.ontoggle = () => {
      this.uiState = ktcReduceIgnorePrimaryPanelState(this.uiState, {
        type: "setRecommendationOpen", groupId: group.groupId, open: details.open,
      });
    };
    const summary = document.createElement("summary");
    summary.className = "recommendation-summary";
    summary.setAttribute("aria-label", `展开推荐组 ${group.title}`);
    summary.title = [group.title, group.secondLine, group.evidenceText].filter(Boolean).join("\n");
    const firstLine = document.createElement("span");
    firstLine.className = "recommendation-line recommendation-first-line";
    firstLine.append(this.chevron(), this.text("span", "recommendation-title", group.title));
    firstLine.append(this.badge(group.confidenceLabel));
    if (group.reviewRequired) firstLine.append(this.badge("需复核"));
    const stats = this.text(
      "span",
      "recommendation-stats",
      `待加 ${group.appendCount} · 已有 ${group.existingCount} · 阻止 ${group.blockedCount}`,
    );
    firstLine.append(stats);
    const secondLine = this.text("span", "recommendation-second-line", group.secondLine);
    summary.append(firstLine, secondLine);
    details.append(summary);
    if (group.evidenceText) {
      const evidence = this.text("p", "recommendation-evidence", group.evidenceText);
      evidence.title = group.evidenceText;
      details.append(evidence);
    }
    details.append(this.ruleList("recommendation", group.rules, running));
    return details;
  }

  private ruleList(scope: KtcIgnoreRuleScope, rules: readonly KtcIgnoreRuleViewModel[], running: boolean): HTMLElement {
    const list = document.createElement("div");
    list.className = "rule-list";
    if (rules.length === 0) {
      list.append(this.text("p", "empty", "此组没有规则。"));
      return list;
    }
    for (const rule of rules) {
      const row = document.createElement("label");
      row.className = `rule-row${rule.blocked ? " blocked" : ""}`;
      const actionable = rule.canAppend || rule.canRemove;
      const detail = [rule.description, rule.statusLabel, ...rule.trackedPaths].filter(Boolean).join("\n");
      row.title = detail;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = rule.selected;
      checkbox.disabled = running || !actionable;
      checkbox.setAttribute("aria-label", `选择规则 ${rule.value}`);
      checkbox.setAttribute("data-rule-key", rule.key);
      checkbox.onchange = () => {
        this.uiState = ktcReduceIgnorePrimaryPanelState(this.uiState, {
          type: "setRuleSelected", scope, ruleKey: rule.key, selected: checkbox.checked,
        });
        this.render();
      };
      row.append(
        checkbox,
        this.text("code", "rule-value", rule.value),
        this.text("span", "rule-status", rule.statusLabel),
      );
      list.append(row);
    }
    return list;
  }

  private selectionActions(scope: KtcIgnoreRuleScope, view: KtcIgnorePrimaryPanelViewModel): HTMLElement {
    const appendRules = ktcSelectedIgnoreRules(view, scope, "append");
    const removeRules = ktcSelectedIgnoreRules(view, scope, "remove");
    const row = document.createElement("div");
    row.className = "selection-actions";
    row.setAttribute("data-rule-scope", scope);
    row.append(this.text(
      "span",
      "selection-hint",
      appendRules.length + removeRules.length > 0 ? "只操作勾选的规则" : "展开分组后逐条选择",
    ));
    const append = this.button(appendRules.length ? `添加所选（${appendRules.length}）` : "添加所选");
    append.setAttribute("data-operation", "append");
    append.disabled = view.running || appendRules.length === 0;
    append.title = appendRules.length ? `添加到 ${targetPath(view.selectedTarget)}` : "没有可添加的已选规则";
    append.onclick = () => this.emitApply(scope, view.selectedTarget, "append", appendRules);
    const remove = this.button(removeRules.length ? `去除所选（${removeRules.length}）` : "去除所选", true);
    remove.setAttribute("data-operation", "remove");
    remove.disabled = view.running || removeRules.length === 0;
    remove.title = removeRules.length ? `从 ${targetPath(view.selectedTarget)} 去除` : "没有可去除的已选规则";
    remove.onclick = () => this.emitApply(scope, view.selectedTarget, "remove", removeRules);
    row.append(append, remove);
    return row;
  }

  private emitApply(
    scope: KtcIgnoreRuleScope,
    target: KtcIgnoreWriteTarget,
    operation: KtcIgnoreRuleAction,
    rules: readonly string[],
  ): void {
    if (rules.length === 0) return;
    this.emit({ action: "applyRules", scope, target, operation, rules });
  }

  private section(
    id: KtcIgnorePanelSectionId,
    titleText: string,
    countText: string,
    open: boolean,
    body: HTMLElement,
  ): HTMLDetailsElement {
    const details = document.createElement("details");
    details.className = "section";
    details.open = open;
    details.setAttribute("data-section", id);
    details.ontoggle = () => {
      this.uiState = ktcReduceIgnorePrimaryPanelState(this.uiState, {
        type: "setSectionOpen", section: id, open: details.open,
      });
    };
    const summary = document.createElement("summary");
    summary.setAttribute("aria-label", titleText);
    summary.append(this.chevron(), this.text("span", "section-title", titleText));
    if (countText) summary.append(this.text("span", "section-count", countText));
    details.append(summary, body);
    return details;
  }

  private chevron(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("chevron");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z");
    svg.append(path);
    return svg;
  }

  private button(text: string, secondary = false): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = secondary ? "secondary" : "";
    button.textContent = text;
    return button;
  }

  private badge(text: string): HTMLElement { return this.text("span", "badge", text); }

  private text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  private emit(detail: KtcIgnorePrimaryActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcIgnorePrimaryActionDetail>(
      KTC_IGNORE_PRIMARY_ACTION,
      { bubbles: true, composed: true, detail },
    ));
  }
}

export function KtcDefineIgnorePrimaryPanel(
  tagName = KtcIgnorePrimaryPanelTag,
): typeof KtcIgnorePrimaryPanel {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcIgnorePrimaryPanel;
  customElements.define(tagName, KtcIgnorePrimaryPanel);
  return KtcIgnorePrimaryPanel;
}

function sourceLabel(source: KtcIgnoreWriteTarget): string {
  return source === "git" ? "Git" : "Phoenix";
}

function targetPath(target: KtcIgnoreWriteTarget): string {
  return target === "git" ? ".gitignore" : ".phoenix/.ignore";
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-ignore-primary-panel": KtcIgnorePrimaryPanel;
  }
}
