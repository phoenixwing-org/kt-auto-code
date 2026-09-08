export const KTC_OPEN_ITEMS_BAR_TAG = "ktc-open-items-bar";
export const KTC_OPEN_ITEMS_BAR_ACTION = "ktc-open-items-bar-action";

export interface KtcOpenItem {
  readonly id: string;
  readonly title: string;
  /** Optional compact label. The complete title remains available to assistive UI. */
  readonly shortTitle?: string;
  /** Serializable semantic icon name; unknown names use the neutral tool icon. */
  readonly icon?: string;
}

export interface KtcOpenItemsBarModel {
  readonly items: readonly KtcOpenItem[];
  readonly activeId?: string;
  readonly overflowLabel?: string;
}

export type KtcOpenItemsBarActionDetail =
  | { readonly kind: "activate"; readonly itemId: string }
  | { readonly kind: "close"; readonly itemId: string }
  | { readonly kind: "closeOthers"; readonly itemId: string };

const EMPTY_MODEL: KtcOpenItemsBarModel = Object.freeze({
  items: [],
  activeId: "",
  overflowLabel: "全部打开项",
});

const STYLE = `
  :host {
    display:block; width:100%; min-width:0; max-width:100%; flex:0 0 auto;
    color:var(--vscode-foreground); background:var(--vscode-sideBar-background);
    font:var(--vscode-font-size) / 1.35 var(--vscode-font-family); container-type:inline-size;
  }
  * { box-sizing:border-box; }
  button { font:inherit; }
  button:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .bar {
    position:relative; display:grid; width:100%; min-width:0;
    height:var(--ktc-open-items-bar-height,31px); min-height:var(--ktc-open-items-bar-height,31px);
    grid-template-columns:minmax(0,1fr) var(--ktc-open-items-more-width,29px); align-items:stretch;
    border-top:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    background:var(--vscode-sideBar-background);
  }
  .track {
    display:flex; min-width:0; align-items:stretch; gap:var(--ktc-open-items-track-gap,1px); overflow-x:auto; overflow-y:hidden;
    overscroll-behavior-inline:contain; scrollbar-width:thin;
  }
  .empty {
    display:flex; min-width:0; align-items:center; padding:0 7px;
    overflow:hidden; color:var(--vscode-descriptionForeground); font-size:11px;
    text-overflow:ellipsis; white-space:nowrap;
  }
  .item {
    position:relative; display:flex; min-width:0; max-width:clamp(82px,42cqi,220px); flex:0 0 auto;
    align-items:stretch; border-bottom:2px solid transparent;
  }
  .item.active {
    color:var(--vscode-list-activeSelectionForeground,var(--vscode-foreground));
    background:var(--vscode-list-activeSelectionBackground,var(--vscode-sideBar-background));
    border-bottom-color:var(--vscode-focusBorder);
  }
  .item:hover:not(.active) { background:var(--vscode-list-hoverBackground); }
  .activate, .close, .more {
    border:0; color:inherit; background:transparent; cursor:pointer;
  }
  .activate {
    display:flex; min-width:38px; max-width:100%; flex:0 1 auto; align-items:center;
    gap:var(--ktc-open-items-activate-gap,5px); overflow:hidden;
    padding:var(--ktc-open-items-activate-padding,0 4px 0 7px); text-align:left;
  }
  .label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .icon { width:16px; height:16px; flex:0 0 16px; color:currentColor; }
  .icon path, .icon rect, .icon circle {
    fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.2;
  }
  .icon[data-icon="sliders"] path { fill:currentColor; stroke:none; }
  .close {
    display:grid; width:var(--ktc-open-items-close-width,22px); min-width:var(--ktc-open-items-close-width,22px);
    flex:0 0 var(--ktc-open-items-close-width,22px); place-items:center; padding:0;
    color:inherit; opacity:.72;
  }
  .close:hover, .more:hover { opacity:1; background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground)); }
  .close-glyph { width:14px; height:14px; line-height:13px; text-align:center; }
  .more {
    display:grid; width:var(--ktc-open-items-more-width,29px); min-width:var(--ktc-open-items-more-width,29px);
    place-items:center; padding:0;
    border-left:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    color:var(--vscode-foreground);
  }
  .more[aria-expanded="true"] { background:var(--vscode-toolbar-activeBackground,var(--vscode-list-hoverBackground)); }
  .menu {
    position:absolute; z-index:20; right:2px; bottom:calc(100% + 2px); min-width:172px;
    max-width:min(300px,calc(100cqi - 4px)); max-height:min(320px,60vh); overflow-y:auto;
    padding:3px; border:1px solid var(--vscode-menu-border,var(--vscode-widget-border,var(--vscode-panel-border)));
    border-radius:3px; color:var(--vscode-menu-foreground,var(--vscode-foreground));
    background:var(--vscode-menu-background,var(--vscode-editorWidget-background));
    box-shadow:0 2px 8px var(--vscode-widget-shadow,rgba(0,0,0,.36));
  }
  .menu[hidden] { display:none; }
  .menu button {
    display:flex; width:100%; min-width:0; min-height:24px; align-items:center; gap:6px;
    padding:2px 7px; overflow:hidden; border:0; border-radius:2px;
    color:inherit; background:transparent; cursor:pointer; text-align:left;
  }
  .menu button:hover, .menu button:focus-visible {
    color:var(--vscode-menu-selectionForeground,var(--vscode-list-activeSelectionForeground,var(--vscode-foreground)));
    background:var(--vscode-menu-selectionBackground,var(--vscode-list-activeSelectionBackground));
  }
  .menu button:disabled { cursor:default; opacity:.5; }
  .menu button > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .menu button[aria-current="true"]::after { margin-left:auto; content:"\u2713"; }
  .separator { height:1px; margin:3px 5px; background:var(--vscode-menu-separatorBackground,var(--vscode-panel-border)); }
  @container (max-width:300px) {
    .item { max-width:clamp(74px,48cqi,120px); }
    .activate { gap:3px; padding-inline:5px 2px; }
  }
  @media (forced-colors:active) {
    .item.active { outline:1px solid Highlight; outline-offset:-1px; }
    .menu { border-color:CanvasText; }
  }
`;

type MenuKind = "overflow" | "context";

export class KtcOpenItemsBar extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: KtcOpenItemsBarModel = EMPTY_MODEL;
  private activationButtons: HTMLButtonElement[] = [];
  private menu?: HTMLElement;
  private menuButtons: HTMLButtonElement[] = [];
  private overflowButton?: HTMLButtonElement;
  private menuTrigger?: HTMLElement;
  private openMenuKind?: MenuKind;
  private pointerDownDocument?: Document;
  private readonly handleOwnerDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.menu || this.menu.hidden) return;
    const path = event.composedPath();
    if (path.includes(this.menu) || (this.menuTrigger && path.includes(this.menuTrigger))) return;
    this.closeMenu(false);
  };

  connectedCallback(): void {
    this.render();
    this.listenForOutsidePointerDown();
  }

  disconnectedCallback(): void {
    this.stopListeningForOutsidePointerDown();
    this.closeMenu(false);
  }

  set model(value: KtcOpenItemsBarModel) {
    this.activeModel = normalizeModel(value);
    this.closeMenu(false);
    this.render();
  }

  get model(): KtcOpenItemsBarModel { return this.activeModel; }

  /** Restores keyboard focus to the active tab after a Host-driven rerender. */
  focusActiveItem(): boolean {
    const activeIndex = this.activeModel.items.findIndex((item) => item.id === this.activeModel.activeId);
    const activeButton = activeIndex >= 0 ? this.activationButtons[activeIndex] : undefined;
    if (!activeButton) return false;
    activeButton.focus();
    activeButton.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = STYLE;
    const bar = document.createElement("nav");
    bar.className = "bar";
    bar.setAttribute("aria-label", "打开项");
    const track = document.createElement("div");
    track.className = "track";
    track.setAttribute("role", "tablist");
    track.setAttribute("aria-label", "已打开的工具");
    this.activationButtons = [];

    if (this.activeModel.items.length === 0) {
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.textContent = "暂无打开项";
      track.append(empty);
    } else {
      this.activeModel.items.forEach((item, index) => track.append(this.renderItem(item, index)));
    }

    const overflowButton = this.button("\u2026", "more", this.overflowButtonLabel());
    this.overflowButton = overflowButton;
    overflowButton.title = this.overflowButtonLabel();
    overflowButton.setAttribute("aria-haspopup", "menu");
    overflowButton.setAttribute("aria-expanded", "false");
    overflowButton.disabled = this.activeModel.items.length === 0;
    overflowButton.onclick = () => this.toggleOverflowMenu();
    overflowButton.onkeydown = (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.openMenu("overflow", undefined, overflowButton, event.key === "ArrowUp");
      }
    };

    this.menu = document.createElement("div");
    this.menu.className = "menu";
    this.menu.hidden = true;
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", this.activeModel.overflowLabel || "全部打开项");
    this.menu.onkeydown = (event) => this.handleMenuKeydown(event);
    bar.append(track, overflowButton, this.menu);
    this.root.replaceChildren(style, bar);
  }

  private renderItem(item: KtcOpenItem, index: number): HTMLElement {
    const active = item.id === this.activeModel.activeId;
    const wrapper = document.createElement("div");
    wrapper.className = `item${active ? " active" : ""}`;
    wrapper.dataset.itemId = item.id;
    wrapper.oncontextmenu = (event) => {
      event.preventDefault();
      this.openMenu("context", item.id, activate);
    };

    const activate = this.button("", "activate", `打开${item.title}`);
    activate.title = item.title;
    activate.setAttribute("role", "tab");
    activate.setAttribute("aria-selected", String(active));
    activate.tabIndex = active || (!this.activeModel.activeId && index === 0) ? 0 : -1;
    if (active) activate.setAttribute("aria-current", "page");
    activate.append(this.icon(item.icon), this.span(item.shortTitle || item.title, "label"));
    activate.onclick = () => this.emit({ kind: "activate", itemId: item.id });
    activate.onkeydown = (event) => this.handleTabKeydown(event, index, item.id, activate);
    this.activationButtons.push(activate);

    const close = this.button("", "close", `关闭${item.title}`);
    close.title = `关闭 ${item.title}`;
    close.append(this.span("\u00d7", "close-glyph"));
    close.onclick = (event) => {
      event.stopPropagation();
      this.emit({ kind: "close", itemId: item.id });
    };
    wrapper.append(activate, close);
    return wrapper;
  }

  private handleTabKeydown(event: KeyboardEvent, index: number, itemId: string, trigger: HTMLElement): void {
    if (event.key === "Delete") {
      event.preventDefault();
      this.emit({ kind: "close", itemId });
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      this.openMenu("context", itemId, trigger);
      return;
    }
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % this.activationButtons.length;
    if (event.key === "ArrowLeft") next = (index - 1 + this.activationButtons.length) % this.activationButtons.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = this.activationButtons.length - 1;
    if (next >= 0) {
      event.preventDefault();
      this.activationButtons[next]?.focus();
      this.activationButtons[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  private toggleOverflowMenu(): void {
    if (this.menu && !this.menu.hidden && this.openMenuKind === "overflow") this.closeMenu(true);
    else if (this.overflowButton) this.openMenu("overflow", undefined, this.overflowButton);
  }

  private openMenu(kind: MenuKind, itemId: string | undefined, trigger: HTMLElement, focusLast = false): void {
    if (!this.menu) return;
    this.menuTrigger = trigger;
    this.openMenuKind = kind;
    this.menu.replaceChildren();
    this.menuButtons = [];
    if (kind === "overflow") {
      this.menu.setAttribute("aria-label", this.activeModel.overflowLabel || "全部打开项");
      this.renderOverflowMenu();
    } else if (itemId) {
      const item = this.activeModel.items.find((candidate) => candidate.id === itemId);
      this.menu.setAttribute("aria-label", `${item?.title || "打开项"}菜单`);
      this.renderContextMenu(itemId);
    }
    this.menu.hidden = false;
    this.overflowButton?.setAttribute("aria-expanded", String(kind === "overflow"));
    const target = focusLast ? this.lastEnabledMenuButton() : this.firstEnabledMenuButton();
    target?.focus();
  }

  private renderOverflowMenu(): void {
    this.activeModel.items.forEach((item) => {
      const button = this.menuButton(item.title, `打开${item.title}`);
      button.title = item.title;
      button.prepend(this.icon(item.icon));
      if (item.id === this.activeModel.activeId) button.setAttribute("aria-current", "true");
      button.onclick = () => {
        this.closeMenu(false);
        this.emit({ kind: "activate", itemId: item.id });
      };
      this.menu?.append(button);
    });
  }

  private renderContextMenu(itemId: string): void {
    const item = this.activeModel.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const close = this.menuButton("关闭", `关闭${item.title}`);
    close.onclick = () => {
      this.closeMenu(false);
      this.emit({ kind: "close", itemId });
    };
    const closeOthers = this.menuButton("关闭其他项", `关闭${item.title}以外的其他项`);
    closeOthers.disabled = this.activeModel.items.length < 2;
    closeOthers.onclick = () => {
      if (closeOthers.disabled) return;
      this.closeMenu(false);
      this.emit({ kind: "closeOthers", itemId });
    };
    this.menu?.append(close, this.separator(), closeOthers);
  }

  private handleMenuKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeMenu(true);
      return;
    }
    if (event.key === "Tab") {
      this.closeMenu(false);
      return;
    }
    const enabled = this.menuButtons.filter((button) => !button.disabled);
    if (enabled.length === 0) return;
    const current = enabled.indexOf(this.root.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (current + 1) % enabled.length;
    if (event.key === "ArrowUp") next = (current - 1 + enabled.length) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    if (next >= 0) {
      event.preventDefault();
      enabled[next]?.focus();
    }
  }

  private listenForOutsidePointerDown(): void {
    const ownerDocument = this.ownerDocument;
    if (this.pointerDownDocument === ownerDocument) return;
    this.stopListeningForOutsidePointerDown();
    ownerDocument.addEventListener("pointerdown", this.handleOwnerDocumentPointerDown, true);
    this.pointerDownDocument = ownerDocument;
  }

  private stopListeningForOutsidePointerDown(): void {
    this.pointerDownDocument?.removeEventListener("pointerdown", this.handleOwnerDocumentPointerDown, true);
    this.pointerDownDocument = undefined;
  }

  private closeMenu(restoreFocus: boolean): void {
    if (this.menu) {
      this.menu.hidden = true;
      this.menu.replaceChildren();
    }
    this.menuButtons = [];
    this.overflowButton?.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.menuTrigger?.focus();
    this.menuTrigger = undefined;
    this.openMenuKind = undefined;
  }

  private menuButton(text: string, ariaLabel: string): HTMLButtonElement {
    const button = this.button("", "", ariaLabel);
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.append(this.span(text, ""));
    this.menuButtons.push(button);
    return button;
  }

  private firstEnabledMenuButton(): HTMLButtonElement | undefined {
    return this.menuButtons.find((button) => !button.disabled);
  }

  private lastEnabledMenuButton(): HTMLButtonElement | undefined {
    return [...this.menuButtons].reverse().find((button) => !button.disabled);
  }

  private overflowButtonLabel(): string {
    return `${this.activeModel.overflowLabel || "全部打开项"}（${this.activeModel.items.length}）`;
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

  private separator(): HTMLElement {
    const separator = document.createElement("div");
    separator.className = "separator";
    separator.setAttribute("role", "separator");
    return separator;
  }

  private icon(kind?: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("icon");
    svg.setAttribute("viewBox", kind === "sliders" ? "0 0 1024 1024" : "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("data-icon", kind ?? "");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", iconPath(kind));
    svg.append(path);
    return svg;
  }

  private emit(detail: KtcOpenItemsBarActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcOpenItemsBarActionDetail>(
      KTC_OPEN_ITEMS_BAR_ACTION,
      { detail, bubbles: true, composed: true },
    ));
  }
}

export function ktcDefineOpenItemsBar(tagName = KTC_OPEN_ITEMS_BAR_TAG): typeof KtcOpenItemsBar {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcOpenItemsBar;
  customElements.define(tagName, KtcOpenItemsBar);
  return KtcOpenItemsBar;
}

function normalizeModel(value: KtcOpenItemsBarModel): KtcOpenItemsBarModel {
  const seen = new Set<string>();
  const items: KtcOpenItem[] = [];
  for (const candidate of Array.isArray(value?.items) ? value.items : []) {
    const id = typeof candidate?.id === "string" ? candidate.id.trim() : "";
    const title = typeof candidate?.title === "string" ? candidate.title.trim() : "";
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const shortTitle = typeof candidate.shortTitle === "string" && candidate.shortTitle.trim()
      ? candidate.shortTitle.trim()
      : undefined;
    const icon = typeof candidate.icon === "string" && candidate.icon.trim() ? candidate.icon.trim() : undefined;
    items.push({ id, title, ...(shortTitle ? { shortTitle } : {}), ...(icon ? { icon } : {}) });
  }
  const activeId = typeof value?.activeId === "string" ? value.activeId : "";
  const overflowLabel = typeof value?.overflowLabel === "string" && value.overflowLabel.trim()
    ? value.overflowLabel.trim()
    : "全部打开项";
  return { items, activeId, overflowLabel };
}

function iconPath(kind?: string): string {
  if (kind === "search" || kind === "replace") return "M6.5 2.5a4 4 0 100 8 4 4 0 000-8zM9.5 9.5l3.5 3.5";
  if (kind === "settings") return "M8 3v2M8 11v2M3 8h2M11 8h2M4.5 4.5l1.4 1.4M10.1 10.1l1.4 1.4M11.5 4.5l-1.4 1.4M5.9 10.1l-1.4 1.4M8 6.2a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z";
  if (kind === "shield" || kind === "ignore" || kind === "exclude") return "M8 1.8l4.5 1.7v3.7c0 3-1.7 5.2-4.5 6.6-2.8-1.4-4.5-3.6-4.5-6.6V3.5zM5.8 8h4.4";
  if (kind === "git") return "M5 3.2a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM13.4 4.8a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM5 12.8a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM3.8 4.4v7.2M4.2 8c3.8 0 3.8-3.2 6.8-3.2";
  if (kind === "run" || kind === "play") return "M3 2.5l10 5.5-10 5.5z";
  if (kind === "build") return "M2 4h12v8H2zM4 6h4M4 9h7";
  if (kind === "sort") return "M3 4h7M3 8h10M3 12h5M11 2v10M9 4l2-2 2 2M13 10l-2 2-2-2";
  if (kind === "uuid") return "M3 5l2-2 2 2-2 2zM9 3l2-2 2 2-2 2zM9 11l2-2 2 2-2 2zM3 11l2-2 2 2-2 2z";
  if (kind === "file") return "M3 1.5h6l3 3v10H3zM9 1.5v3h3";
  if (kind === "file-code") return "M3 1.5h6l3 3v10H3zM9 1.5v3h3M6.2 8l-1.5 1.5L6.2 11M8.8 8l1.5 1.5L8.8 11";
  if (kind === "layout") return "M1.5 2h13v12h-13zM5.5 2v12M5.5 5.5h9";
  if (kind === "sliders") return "M389.44 768a96.064 96.064 0 0 1 181.12 0H896v64H570.56a96.064 96.064 0 0 1-181.12 0H128v-64zm192-288a96.064 96.064 0 0 1 181.12 0H896v64H762.56a96.064 96.064 0 0 1-181.12 0H128v-64zm-320-288a96.064 96.064 0 0 1 181.12 0H896v64H442.56a96.064 96.064 0 0 1-181.12 0H128v-64z";
  if (kind === "window") return "M2.5 3h11v10h-11zM2.5 6h11M6 6v7";
  return "M3 2.5h6l3.5 3.5v7.5H3zM9 2.5V6h3.5M5.5 9h4.5M5.5 11h3.5";
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-open-items-bar": KtcOpenItemsBar;
  }
}
