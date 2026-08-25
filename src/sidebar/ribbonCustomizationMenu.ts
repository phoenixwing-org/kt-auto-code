export const KTC_RIBBON_CUSTOMIZATION_MENU_TAG = "ktc-ribbon-customization-menu";
export const KTC_RIBBON_CUSTOMIZATION_MENU_ACTION = "ktc-ribbon-customization-menu-action";

export interface KtcRibbonCustomizationTool {
  readonly id: string;
  readonly title: string;
  readonly shortTitle?: string;
  readonly moduleId?: string;
  readonly moduleTitle?: string;
}

export interface KtcRibbonCustomizationMenuModel {
  readonly tools: readonly KtcRibbonCustomizationTool[];
  readonly pinnedToolIds: readonly string[];
  readonly visibleModuleIds?: readonly string[];
}

export type KtcRibbonCustomizationMenuActionDetail =
  | { readonly kind: "open"; readonly toolId: string }
  | { readonly kind: "togglePin"; readonly toolId: string }
  | { readonly kind: "toggleModule"; readonly moduleId: string }
  | { readonly kind: "resetCodeLayout" }
  | {
      readonly kind: "move";
      readonly sourceId: string;
      readonly targetId: string;
      readonly placement: "before" | "after";
    };

const STYLE = `
  :host { display:block; min-width:0; color:var(--vscode-foreground); font:12px/1.35 var(--vscode-font-family); }
  * { box-sizing:border-box; }
  button { font:inherit; }
  button:focus-visible, .row:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .menu { min-width:0; padding:2px 0; }
  .group + .group { border-top:1px solid var(--vscode-panel-border); }
  .group-header { display:flex; min-width:0; align-items:center; background:var(--vscode-sideBarSectionHeader-background,transparent); }
  .group-toggle {
    display:flex; min-width:0; flex:1 1 auto; align-items:center; gap:5px; min-height:27px; padding:3px 4px;
    border:0; color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground));
    background:var(--vscode-sideBarSectionHeader-background,transparent); cursor:pointer; text-align:left;
  }
  .group-toggle:hover, .module-visibility:hover { background:var(--vscode-list-hoverBackground); }
  .module-visibility {
    display:grid; width:26px; height:25px; flex:0 0 26px; place-items:center; padding:0;
    border:1px solid transparent; color:var(--vscode-foreground); background:transparent; cursor:pointer;
  }
  .module-visibility:disabled { opacity:.45; cursor:default; }
  .module-visibility svg { width:14px; height:14px; fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.3; }
  .chevron { width:12px; color:var(--vscode-descriptionForeground); text-align:center; }
  .group-title { min-width:0; overflow:hidden; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
  .count { margin-left:auto; color:var(--vscode-descriptionForeground); font-size:10px; }
  .list[hidden] { display:none; }
  .row {
    display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; align-items:center; gap:1px;
    min-width:0; min-height:28px; padding:1px 4px 1px 17px; border:1px solid transparent;
  }
  .row[draggable="true"] { cursor:grab; }
  .row.dragging { opacity:.55; }
  .row.drop-before { border-top-color:var(--vscode-focusBorder); }
  .row.drop-after { border-bottom-color:var(--vscode-focusBorder); }
  .row:hover, .row:focus-within { background:var(--vscode-list-hoverBackground); }
  .open {
    min-width:0; overflow:hidden; padding:4px 5px; border:0; color:inherit; background:transparent;
    cursor:pointer; text-align:left; text-overflow:ellipsis; white-space:nowrap;
  }
  .icon {
    display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; padding:3px;
    border:1px solid transparent; border-radius:2px; color:var(--vscode-icon-foreground,var(--vscode-foreground));
    background:transparent; cursor:pointer;
  }
  .icon:hover { border-color:var(--ktc-ui-active-border,var(--vscode-focusBorder)); background:var(--vscode-toolbar-hoverBackground); }
  .icon:disabled { opacity:.28; cursor:default; }
  .pin:not(.pinned) { opacity:0; }
  .row:hover .pin:not(.pinned), .row:focus-within .pin:not(.pinned), .pin:not(.pinned):focus-visible { opacity:1; }
  .pin svg { width:14px; height:14px; pointer-events:none; }
  .pin.pinned svg { fill:currentColor; }
  .pin:not(.pinned) svg { fill:none; }
  .reset-code { display:block; width:calc(100% - 8px); min-height:25px; margin:3px 4px 4px; padding:2px 6px; border:1px solid var(--vscode-panel-border); border-radius:3px; color:var(--vscode-textLink-foreground,var(--vscode-foreground)); background:transparent; cursor:pointer; text-align:left; }
  .reset-code:hover { background:var(--vscode-list-hoverBackground); border-color:var(--ktc-ui-active-border,var(--vscode-focusBorder)); }
  @media (forced-colors:active) {
    .row.drop-before, .row.drop-after, .icon:hover { border-color:Highlight; }
  }
`;

export class KtcRibbonCustomizationMenu extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: KtcRibbonCustomizationMenuModel = { tools: [], pinnedToolIds: [], visibleModuleIds: [] };
  private readonly collapsedModules = new Set<string>();
  private draggedToolId: string | undefined;

  connectedCallback(): void { this.render(); }

  focusFirst(): void {
    this.root.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }

  set model(value: KtcRibbonCustomizationMenuModel) {
    this.activeModel = {
      tools: Array.isArray(value?.tools) ? value.tools : [],
      pinnedToolIds: Array.isArray(value?.pinnedToolIds) ? value.pinnedToolIds : [],
      visibleModuleIds: Array.isArray(value?.visibleModuleIds) ? value.visibleModuleIds : undefined,
    };
    this.render();
  }

  get model(): KtcRibbonCustomizationMenuModel { return this.activeModel; }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = STYLE;
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("aria-label", "Ribbon 工具定制");
    const pinned = new Set(this.activeModel.pinnedToolIds);
    const groups = groupTools(this.activeModel.tools);
    const visible = new Set(this.activeModel.visibleModuleIds ?? groups.map((group) => group.moduleId));
    for (const group of groups) {
      menu.append(this.renderGroup(group.moduleId, group.moduleTitle, group.tools, pinned, visible));
    }
    this.root.replaceChildren(style, menu);
  }

  private renderGroup(
    moduleId: string,
    moduleTitle: string,
    tools: readonly KtcRibbonCustomizationTool[],
    pinned: ReadonlySet<string>,
    visible: ReadonlySet<string>,
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "group";
    section.dataset.moduleId = moduleId;
    const listId = `ktc-ribbon-menu-${safeDomId(moduleId)}`;
    const collapsed = this.collapsedModules.has(moduleId);
    const header = document.createElement("div");
    header.className = "group-header";
    const toggle = this.button("", "group-toggle", `切换 ${moduleTitle} 工具分组`);
    toggle.setAttribute("aria-controls", listId);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    const chevron = document.createElement("span");
    chevron.className = "chevron";
    chevron.textContent = collapsed ? "›" : "⌄";
    const title = document.createElement("span");
    title.className = "group-title";
    title.textContent = moduleTitle;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${tools.filter((tool) => pinned.has(tool.id)).length}/${tools.length}`;
    toggle.append(chevron, title, count);
    toggle.onclick = () => {
      if (collapsed) this.collapsedModules.delete(moduleId);
      else this.collapsedModules.add(moduleId);
      this.render();
    };
    const isVisible = visible.has(moduleId);
    const visibility = this.button("", "module-visibility", `${isVisible ? "隐藏" : "显示"} ${moduleTitle} 工具`);
    visibility.title = isVisible ? "隐藏模块" : "显示模块";
    visibility.disabled = isVisible && visible.size <= 1;
    visibility.setAttribute("aria-pressed", String(isVisible));
    visibility.append(checkboxSvg(isVisible));
    visibility.onclick = () => this.emit({ kind: "toggleModule", moduleId });
    header.append(toggle, visibility);

    const list = document.createElement("div");
    list.id = listId;
    list.className = "list";
    list.hidden = collapsed;
    list.setAttribute("role", "list");
    tools.forEach((tool) => list.append(this.renderToolRow(tool, moduleId, pinned, tools)));
    section.append(header, list);
    if (moduleId === "code") {
      const reset = this.button("重置 Code 默认顺序", "reset-code", "重置 Code 默认顺序和固定项");
      reset.title = "恢复代码辅助、Git、Run、替换、自动代码的默认顺序";
      reset.onclick = () => this.emit({ kind: "resetCodeLayout" });
      section.append(reset);
    }
    return section;
  }

  private renderToolRow(
    tool: KtcRibbonCustomizationTool,
    moduleId: string,
    pinned: ReadonlySet<string>,
    orderedTools: readonly KtcRibbonCustomizationTool[],
  ): HTMLElement {
    const isPinned = pinned.has(tool.id);
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.toolId = tool.id;
    row.dataset.moduleId = moduleId;
    row.setAttribute("role", "listitem");
    row.draggable = true;

    const open = this.button(tool.shortTitle || tool.title, "open", `打开 ${tool.title}`);
    open.title = tool.title;
    open.onclick = () => this.emit({ kind: "open", toolId: tool.id });

    const orderedIndex = orderedTools.findIndex((candidate) => candidate.id === tool.id);
    const moveUp = this.button("↑", "icon move-up", `上移 ${tool.title}`);
    moveUp.title = "上移";
    moveUp.disabled = orderedIndex <= 0;
    moveUp.onclick = () => {
      const target = orderedTools[orderedIndex - 1];
      if (target) this.emit({ kind: "move", sourceId: tool.id, targetId: target.id, placement: "before" });
    };
    const moveDown = this.button("↓", "icon move-down", `下移 ${tool.title}`);
    moveDown.title = "下移";
    moveDown.disabled = orderedIndex < 0 || orderedIndex >= orderedTools.length - 1;
    moveDown.onclick = () => {
      const target = orderedTools[orderedIndex + 1];
      if (target) this.emit({ kind: "move", sourceId: tool.id, targetId: target.id, placement: "after" });
    };

    const pin = this.button("", `icon pin${isPinned ? " pinned" : ""}`, `${isPinned ? "取消固定" : "固定"} ${tool.title}`);
    pin.title = isPinned ? "取消固定" : "固定";
    pin.setAttribute("aria-pressed", String(isPinned));
    pin.append(pinSvg());
    pin.onclick = () => this.emit({ kind: "togglePin", toolId: tool.id });

    row.ondragstart = (event) => {
      this.draggedToolId = tool.id;
      row.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", tool.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    };
    row.ondragover = (event) => {
      const source = this.toolById(this.draggedToolId);
      if (!source || moduleOf(source) !== moduleId || source.id === tool.id) return;
      event.preventDefault();
      row.classList.remove("drop-before", "drop-after");
      row.classList.add(dropPlacement(row, event.clientY) === "after" ? "drop-after" : "drop-before");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };
    row.ondragleave = () => row.classList.remove("drop-before", "drop-after");
    row.ondrop = (event) => {
      event.preventDefault();
      const source = this.toolById(this.draggedToolId || event.dataTransfer?.getData("text/plain"));
      row.classList.remove("drop-before", "drop-after");
      if (!source || moduleOf(source) !== moduleId || source.id === tool.id) return;
      this.emit({
        kind: "move",
        sourceId: source.id,
        targetId: tool.id,
        placement: dropPlacement(row, event.clientY),
      });
    };
    row.ondragend = () => {
      this.draggedToolId = undefined;
      row.classList.remove("dragging", "drop-before", "drop-after");
    };

    row.append(open, moveUp, moveDown, pin);
    return row;
  }

  private button(text: string, className: string, ariaLabel: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.setAttribute("aria-label", ariaLabel);
    return button;
  }

  private toolById(toolId: string | undefined): KtcRibbonCustomizationTool | undefined {
    return toolId ? this.activeModel.tools.find((tool) => tool.id === toolId) : undefined;
  }

  private emit(detail: KtcRibbonCustomizationMenuActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcRibbonCustomizationMenuActionDetail>(
      KTC_RIBBON_CUSTOMIZATION_MENU_ACTION,
      { detail, bubbles: true, composed: true },
    ));
  }
}

export function ktcDefineRibbonCustomizationMenu(
  tagName = KTC_RIBBON_CUSTOMIZATION_MENU_TAG,
): typeof KtcRibbonCustomizationMenu {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcRibbonCustomizationMenu;
  customElements.define(tagName, KtcRibbonCustomizationMenu);
  return KtcRibbonCustomizationMenu;
}

function groupTools(tools: readonly KtcRibbonCustomizationTool[]): Array<{
  moduleId: string;
  moduleTitle: string;
  tools: KtcRibbonCustomizationTool[];
}> {
  const groups = new Map<string, { moduleId: string; moduleTitle: string; tools: KtcRibbonCustomizationTool[] }>();
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!tool || typeof tool.id !== "string" || !tool.id || seen.has(tool.id)) continue;
    seen.add(tool.id);
    const moduleId = moduleOf(tool);
    const current = groups.get(moduleId) ?? {
      moduleId,
      moduleTitle: tool.moduleTitle || defaultModuleTitle(moduleId),
      tools: [],
    };
    current.tools.push(tool);
    groups.set(moduleId, current);
  }
  return [...groups.values()];
}

function moduleOf(tool: KtcRibbonCustomizationTool): string {
  return tool.moduleId || "code";
}

function defaultModuleTitle(moduleId: string): string {
  if (moduleId === "code") return "Code";
  if (moduleId === "cad") return "CAD";
  return moduleId;
}

function safeDomId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/gu, "-");
}

function dropPlacement(row: HTMLElement, clientY: number): "before" | "after" {
  const bounds = row.getBoundingClientRect();
  return clientY >= bounds.top + bounds.height / 2 ? "after" : "before";
}

function pinSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5.2 1.5h5.6l-.7 3.2 2.2 2.2v1.2H8.8V14l-.8.8-.8-.8V8.1H3.7V6.9l2.2-2.2-.7-3.2Z");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function checkboxSvg(checked: boolean): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const box = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  box.setAttribute("x", "2.5");
  box.setAttribute("y", "2.5");
  box.setAttribute("width", "11");
  box.setAttribute("height", "11");
  box.setAttribute("rx", "1.5");
  svg.append(box);
  if (checked) {
    const check = document.createElementNS("http://www.w3.org/2000/svg", "path");
    check.setAttribute("d", "M5 8l2 2 4-5");
    svg.append(check);
  }
  return svg;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-ribbon-customization-menu": KtcRibbonCustomizationMenu;
  }
}
