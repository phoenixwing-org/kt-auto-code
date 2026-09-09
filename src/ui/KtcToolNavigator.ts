import {
  ktcToolNavigatorToolCount,
  ktcValidateToolNavigatorNodes,
  type KtcToolNavigatorGroupNode,
  type KtcToolNavigatorMode,
  type KtcToolNavigatorNode,
  type KtcToolNavigatorToolNode,
} from "./KtcToolNavigatorModel.js";

export const KTC_TOOL_NAVIGATOR_TAG = "ktc-tool-navigator";
export const KTC_TOOL_NAVIGATOR_ACTION = "ktc-tool-navigator-action";

interface KtcToolNavigatorCommonModel {
  readonly title: string;
  readonly nodes: readonly KtcToolNavigatorNode[];
  readonly activeToolId?: string;
}

/**
 * Compatibility presentation used by the installed extension until the
 * four-region prototype is intentionally migrated into the formal Host.
 * Omitting `presentation` deliberately selects this contract.
 */
export interface KtcToolNavigatorLegacyModel extends KtcToolNavigatorCommonModel {
  readonly presentation?: "legacy";
  readonly mode: KtcToolNavigatorMode;
  readonly expanded: boolean;
  readonly expandedGroupIds: readonly string[];
}

/** Headerless, flattened child-tool surface used by the UI prototype. */
export interface KtcToolNavigatorCompactModel extends KtcToolNavigatorCommonModel {
  readonly presentation: "compact";
  readonly showLabels?: boolean;
}

export type KtcToolNavigatorModel = KtcToolNavigatorLegacyModel | KtcToolNavigatorCompactModel;

export type KtcToolNavigatorActionDetail =
  | { readonly kind: "activate"; readonly toolId: string }
  | { readonly kind: "setMode"; readonly mode: KtcToolNavigatorMode }
  | { readonly kind: "setExpanded"; readonly expanded: boolean }
  | { readonly kind: "setGroupExpanded"; readonly groupId: string; readonly expanded: boolean }
  | { readonly kind: "setShowLabels"; readonly showLabels: boolean };

type NormalizedModel =
  | (KtcToolNavigatorLegacyModel & { readonly presentation: "legacy" })
  | KtcToolNavigatorCompactModel;
type NormalizedLegacyModel = Extract<NormalizedModel, { readonly presentation: "legacy" }>;

const EMPTY_MODEL: NormalizedModel = Object.freeze({
  presentation: "legacy",
  title: "功能目录",
  nodes: [],
  mode: "outline",
  expanded: true,
  expandedGroupIds: [],
  activeToolId: "",
});

const STYLE = `
  :host {
    display:block; min-width:0; color:var(--vscode-foreground);
    font:var(--vscode-font-size) / 1.35 var(--vscode-font-family); container-type:inline-size;
  }
  * { box-sizing:border-box; }
  button { font:inherit; }
  button:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .navigator { min-width:0; }
  .navigator.legacy { margin:0 0 4px; border:1px solid var(--ktc-ui-border,var(--vscode-panel-border)); }
  .navigator-header {
    display:flex; min-width:0; min-height:25px; align-items:center; gap:3px; padding:0 2px;
    color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground));
    background:var(--vscode-sideBarSectionHeader-background,var(--vscode-sideBar-background));
  }
  .section-toggle {
    display:flex; min-width:0; min-height:23px; flex:1 1 auto; align-items:center; gap:2px; padding:0;
    overflow:hidden; border:0; color:inherit; background:transparent; cursor:pointer; text-align:left;
  }
  .section-toggle:hover, .group-toggle:hover { background:var(--vscode-list-hoverBackground); }
  .chevron { width:16px; height:16px; flex:0 0 16px; color:currentColor; transition:transform .1s ease; }
  .chevron path { fill:currentColor; }
  .collapsed > .navigator-header .section-toggle .chevron,
  .group.collapsed > .group-header .chevron { transform:rotate(-90deg); }
  .title { min-width:0; overflow:hidden; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .count { flex:0 0 auto; color:var(--vscode-descriptionForeground); font-size:11px; font-variant-numeric:tabular-nums; }
  .mode-switch {
    display:flex; flex:0 0 auto; overflow:hidden; border:1px solid var(--vscode-panel-border); border-radius:3px;
  }
  .mode-switch button {
    min-height:20px; padding:0 5px; border:0; color:var(--vscode-descriptionForeground);
    background:transparent; cursor:pointer; font-size:11px;
  }
  .mode-switch button + button { border-left:1px solid var(--vscode-panel-border); }
  .mode-switch button:hover { color:var(--vscode-foreground); background:var(--vscode-toolbar-hoverBackground); }
  .mode-switch button.active {
    color:var(--vscode-button-foreground,var(--vscode-foreground));
    background:var(--vscode-button-background,var(--vscode-list-activeSelectionBackground));
  }
  .legacy .navigator-body { min-width:0; border-top:1px solid var(--ktc-ui-border,var(--vscode-panel-border)); }
  .legacy.collapsed > .navigator-body { display:none; }
  .group { min-width:0; }
  .group + .group { border-top:1px solid color-mix(in srgb,var(--vscode-panel-border) 75%,transparent); }
  .group-header {
    display:flex; min-width:0; min-height:22px; align-items:center; gap:2px;
    color:var(--vscode-foreground); background:transparent;
  }
  .group-toggle {
    display:flex; min-width:0; min-height:21px; flex:1 1 auto; align-items:center; gap:2px; padding:0 3px;
    border:0; color:inherit; background:transparent; cursor:pointer; text-align:left;
  }
  .group-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .group-count { margin-left:auto; padding-right:2px; color:var(--vscode-descriptionForeground); font-size:11px; }
  .group.collapsed > .group-content { display:none; }
  .tool-list { min-width:0; margin:0; padding:0; }
  .mode-grid .tool-list {
    display:grid; grid-template-columns:repeat(auto-fit,minmax(min(142px,100%),1fr)); gap:3px; padding:3px;
  }
  .tool {
    min-width:0; border:1px solid transparent; color:var(--vscode-foreground); background:transparent;
    cursor:pointer; text-align:left;
  }
  .mode-outline .tool {
    display:flex; width:100%; min-height:22px; align-items:center; gap:3px; padding:0 5px 0 8px;
  }
  .mode-grid .tool {
    display:grid; min-height:38px; grid-template-columns:19px minmax(0,1fr); grid-template-rows:auto auto;
    align-content:center; column-gap:5px; padding:3px 5px; border-color:var(--vscode-panel-border); border-radius:3px;
    background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
  }
  .tool:hover, .compact-tool:hover { background:var(--vscode-list-hoverBackground); }
  .tool.active, .compact-tool.active {
    color:var(--vscode-list-activeSelectionForeground,var(--vscode-foreground));
    background:var(--vscode-list-activeSelectionBackground,var(--vscode-list-hoverBackground));
    box-shadow:inset 2px 0 0 var(--vscode-focusBorder);
  }
  .tool.active .tool-description, .tool.active .tool-icon, .compact-tool.active .tool-icon { color:inherit; }
  .tool-icon { width:16px; height:16px; flex:0 0 16px; color:var(--vscode-descriptionForeground); }
  .tool-icon path, .tool-icon rect, .tool-icon circle {
    fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.2;
  }
  .mode-grid .tool-icon { grid-row:1 / span 2; align-self:center; }
  .tool-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tool-description {
    min-width:0; overflow:hidden; color:var(--vscode-descriptionForeground); font-size:10px;
    text-overflow:ellipsis; white-space:nowrap;
  }
  .mode-outline .tool-description { display:none; }

  .navigator.compact { margin:0; border:0; }
  .compact-body {
    display:grid; grid-template-columns:repeat(auto-fit,minmax(min(96px,100%),1fr)); gap:3px; padding:0;
  }
  .compact.labels-hidden .compact-body {
    grid-template-columns:repeat(auto-fit,minmax(min(32px,100%),1fr));
  }
  .compact-tool {
    display:flex; min-width:0; min-height:27px; align-items:center; gap:4px; padding:2px 5px;
    border:1px solid var(--vscode-panel-border); border-radius:3px; color:var(--vscode-foreground);
    background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background)); cursor:pointer; text-align:left;
  }
  .compact.labels-hidden .compact-tool { min-height:34px; justify-content:center; padding-inline:2px; }
  .compact.labels-hidden .tool-icon { width:22px; height:22px; flex-basis:22px; }
  .compact.labels-hidden .tool-label { display:none; }
  .label-toggle {
    display:inline-flex; min-width:27px; min-height:27px; grid-column:-2 / -1; justify-self:end;
    align-items:center; justify-content:center; padding:1px 4px; border:1px solid var(--vscode-panel-border);
    border-radius:3px; color:var(--vscode-descriptionForeground); background:transparent; cursor:pointer; font-size:11px;
  }
  .label-toggle:hover { color:var(--vscode-foreground); background:var(--vscode-toolbar-hoverBackground); }
  .label-toggle[aria-pressed="true"] { color:var(--vscode-foreground); }
  .invalid { margin:0; padding:6px; color:var(--vscode-errorForeground); }
  @container (max-width:300px) {
    .mode-switch button { padding-inline:3px; }
    .mode-grid .tool-list { grid-template-columns:1fr; }
  }
  @media (forced-colors:active) {
    .tool.active, .compact-tool.active, .mode-switch button.active { outline:1px solid Highlight; }
  }
`;

export class KtcToolNavigator extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: NormalizedModel = EMPTY_MODEL;

  connectedCallback(): void { this.render(); }

  set model(value: KtcToolNavigatorModel) {
    const common = {
      title: typeof value?.title === "string" && value.title.trim() ? value.title : "功能目录",
      nodes: Array.isArray(value?.nodes) ? value.nodes : [],
      activeToolId: typeof value?.activeToolId === "string" ? value.activeToolId : "",
    };
    this.activeModel = value?.presentation === "compact"
      ? { ...common, presentation: "compact", showLabels: value.showLabels !== false }
      : {
          ...common,
          presentation: "legacy",
          mode: value?.mode === "grid" ? "grid" : "outline",
          expanded: value?.expanded !== false,
          expandedGroupIds: Array.isArray(value?.expandedGroupIds) ? [...value.expandedGroupIds] : [],
        };
    this.render();
  }

  get model(): KtcToolNavigatorModel { return this.activeModel; }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = STYLE;
    const shell = this.activeModel.presentation === "compact"
      ? this.renderCompact()
      : this.renderLegacy();
    this.root.replaceChildren(style, shell);
  }

  private renderLegacy(): HTMLElement {
    const model = this.activeModel;
    if (model.presentation !== "legacy") throw new Error("Expected legacy navigator model");
    const shell = document.createElement("section");
    shell.className = `navigator legacy mode-${model.mode}${model.expanded ? "" : " collapsed"}`;
    shell.setAttribute("aria-label", model.title);
    const validation = ktcValidateToolNavigatorNodes(model.nodes);
    shell.append(this.renderLegacyHeader(model, validation.toolCount));
    const body = document.createElement("nav");
    body.className = "navigator-body";
    body.setAttribute("aria-label", `${model.title}工具`);
    if (!validation.valid) body.append(this.renderInvalid(validation.issues));
    else model.nodes.forEach((node) => body.append(this.renderLegacyNode(model, node)));
    shell.append(body);
    return shell;
  }

  private renderLegacyHeader(model: KtcToolNavigatorLegacyModel, toolCount: number): HTMLElement {
    const header = document.createElement("header");
    header.className = "navigator-header";
    const toggle = this.button("", "section-toggle", `${model.expanded ? "收起" : "展开"}${model.title}`);
    toggle.setAttribute("aria-expanded", String(model.expanded));
    toggle.append(this.chevron(), this.span(model.title, "title"), this.span(`（${toolCount}）`, "count"));
    toggle.onclick = () => this.emit({ kind: "setExpanded", expanded: !model.expanded });
    const switcher = document.createElement("div");
    switcher.className = "mode-switch";
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "功能目录显示方式");
    switcher.append(this.modeButton(model, "大纲", "outline"), this.modeButton(model, "网格", "grid"));
    header.append(toggle, switcher);
    return header;
  }

  private modeButton(model: KtcToolNavigatorLegacyModel, label: string, mode: KtcToolNavigatorMode): HTMLButtonElement {
    const active = model.mode === mode;
    const button = this.button(label, active ? "active" : "", `切换为${label}模式`);
    button.setAttribute("aria-pressed", String(active));
    button.onclick = () => {
      if (!active) this.emit({ kind: "setMode", mode });
    };
    return button;
  }

  private renderLegacyNode(model: NormalizedLegacyModel, node: KtcToolNavigatorNode): HTMLElement {
    return node.kind === "group" ? this.renderLegacyGroup(model, node) : this.renderTool(model, node, "tool");
  }

  private renderLegacyGroup(model: NormalizedLegacyModel, node: KtcToolNavigatorGroupNode): HTMLElement {
    const expanded = model.expandedGroupIds.includes(node.id);
    const section = document.createElement("section");
    section.className = `group${expanded ? "" : " collapsed"}`;
    section.dataset.groupId = node.id;
    const header = document.createElement("header");
    header.className = "group-header";
    const toggle = this.button("", "group-toggle", `${expanded ? "收起" : "展开"}${node.label}`);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.append(
      this.chevron(),
      this.span(node.label, "group-title"),
      this.span(`（${ktcToolNavigatorToolCount(node.children)}）`, "group-count"),
    );
    toggle.onclick = () => this.emit({ kind: "setGroupExpanded", groupId: node.id, expanded: !expanded });
    header.append(toggle);
    const content = document.createElement("div");
    content.className = node.children.every((child) => child.kind === "tool") ? "group-content tool-list" : "group-content";
    node.children.forEach((child) => content.append(this.renderLegacyNode(model, child)));
    section.append(header, content);
    return section;
  }

  private renderCompact(): HTMLElement {
    const model = this.activeModel;
    if (model.presentation !== "compact") throw new Error("Expected compact navigator model");
    const shell = document.createElement("section");
    shell.className = `navigator compact${model.showLabels === false ? " labels-hidden" : ""}`;
    shell.setAttribute("aria-label", model.title);
    const validation = ktcValidateToolNavigatorNodes(model.nodes);
    const body = document.createElement("nav");
    body.className = "compact-body";
    body.setAttribute("aria-label", `${model.title}工具`);
    if (!validation.valid) body.append(this.renderInvalid(validation.issues));
    else {
      this.appendCompactTools(body, model, model.nodes);
      body.append(this.renderLabelToggle(model));
    }
    shell.append(body);
    return shell;
  }

  private appendCompactTools(parent: HTMLElement, model: KtcToolNavigatorCompactModel, nodes: readonly KtcToolNavigatorNode[]): void {
    nodes.forEach((node) => {
      if (node.kind === "group") this.appendCompactTools(parent, model, node.children);
      else parent.append(this.renderTool(model, node, "compact-tool"));
    });
  }

  private renderTool(
    model: NormalizedModel,
    node: KtcToolNavigatorToolNode,
    className: "tool" | "compact-tool",
  ): HTMLButtonElement {
    const active = node.toolId === model.activeToolId;
    const button = this.button("", `${className}${active ? " active" : ""}`, `打开${node.label}`);
    button.dataset.toolId = node.toolId;
    button.title = node.description ? `${node.label} · ${node.description}` : node.label;
    if (active) button.setAttribute("aria-current", "page");
    button.append(this.icon(node.icon), this.span(node.label, "tool-label"));
    if (model.presentation === "legacy") button.append(this.span(node.description || "", "tool-description"));
    button.onclick = () => this.emit({ kind: "activate", toolId: node.toolId });
    return button;
  }

  private renderLabelToggle(model: KtcToolNavigatorCompactModel): HTMLButtonElement {
    const showLabels = model.showLabels !== false;
    const button = this.button("Aa", "label-toggle", showLabels ? "隐藏工具名称" : "显示工具名称");
    button.title = showLabels ? "隐藏工具名称，只显示图标" : "显示工具名称";
    button.setAttribute("aria-pressed", String(showLabels));
    button.onclick = () => this.emit({ kind: "setShowLabels", showLabels: !showLabels });
    return button;
  }

  private renderInvalid(issues: readonly string[]): HTMLElement {
    const invalid = document.createElement("p");
    invalid.className = "invalid";
    invalid.textContent = "功能目录配置无效。";
    invalid.title = issues.join("；");
    return invalid;
  }

  private button(text: string, className: string, ariaLabel: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.setAttribute("aria-label", ariaLabel);
    return button;
  }

  private span(text: string, className: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
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

  private icon(kind: KtcToolNavigatorToolNode["icon"]): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("tool-icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", iconPath(kind));
    svg.append(path);
    return svg;
  }

  private emit(detail: KtcToolNavigatorActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcToolNavigatorActionDetail>(
      KTC_TOOL_NAVIGATOR_ACTION,
      { detail, bubbles: true, composed: true },
    ));
  }
}

export function ktcDefineToolNavigator(tagName = KTC_TOOL_NAVIGATOR_TAG): typeof KtcToolNavigator {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcToolNavigator;
  customElements.define(tagName, KtcToolNavigator);
  return KtcToolNavigator;
}

function iconPath(kind: KtcToolNavigatorToolNode["icon"]): string {
  if (kind === "build") return "M2 4h12v8H2zM4 6h4M4 9h7";
  if (kind === "sort") return "M3 4h7M3 8h10M3 12h5M11 2v10M9 4l2-2 2 2M13 10l-2 2-2-2";
  if (kind === "uuid") return "M3 5l2-2 2 2-2 2zM9 3l2-2 2 2-2 2zM9 11l2-2 2 2-2 2zM3 11l2-2 2 2-2 2z";
  return "M3 3.5h6l3 3v6H3zM9 3.5v3h3M5 9h5M5 11h4";
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-tool-navigator": KtcToolNavigator;
  }
}
