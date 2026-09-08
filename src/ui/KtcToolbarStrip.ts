export const KTC_TOOLBAR_STRIP_TAG = "ktc-toolbar-strip";
export const KTC_TOOLBAR_STRIP_ACTION = "ktc-toolbar-strip-action";

export type KtcToolbarStripMode = "expanded" | "compact";

export interface KtcToolbarStripModel {
  readonly mode: KtcToolbarStripMode;
  readonly groupContentVisible: boolean;
  readonly overflowOpen: boolean;
}

export type KtcToolbarStripActionDetail =
  | { readonly kind: "setMode"; readonly mode: KtcToolbarStripMode }
  | { readonly kind: "setOverflowOpen"; readonly open: boolean };

const EMPTY_MODEL: KtcToolbarStripModel = Object.freeze({
  mode: "expanded",
  groupContentVisible: false,
  overflowOpen: false,
});

const STYLE = `
  :host {
    display:block; width:100%; min-width:0; flex:0 0 auto;
    margin:0; padding:0; overflow:hidden; color:var(--vscode-foreground);
    background:var(--vscode-sideBar-background);
    font:var(--vscode-font-size) / 1.35 var(--vscode-font-family);
  }
  :host([hidden]) { display:none !important; }
  * { box-sizing:border-box; }
  button { font:inherit; }
  button:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .toolbar {
    --ktc-ribbon-item-width:max-content;
    --ktc-ribbon-item-min-width:var(--ktc-toolbar-expanded-item-min-width,46px);
    --ktc-ribbon-item-height:58px;
    --ktc-ribbon-item-flex-basis:auto;
    --ktc-ribbon-icon-size:22px;
    --ktc-ribbon-group-chevron-size:9px;
    --ktc-ribbon-group-chevron-right:3px;
    --ktc-ribbon-group-chevron-bottom:3px;
    --ktc-ribbon-label-display:block;
    --ktc-ribbon-wrap:wrap;
    --ktc-ribbon-module-min-width:var(--ktc-toolbar-expanded-module-min-width,18px);
    --ktc-ribbon-module-writing-mode:vertical-rl;
    --ktc-ribbon-module-font-size:10px;
    --ktc-ribbon-module-letter-spacing:1px;
    display:flex; width:100%; min-width:0; flex-direction:column; margin:0; padding:0;
    overflow:hidden; border-bottom:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    background:var(--vscode-sideBar-background);
  }
  .toolbar.mode-compact {
    --ktc-ribbon-item-width:34px;
    --ktc-ribbon-item-min-width:34px;
    --ktc-ribbon-item-height:32px;
    --ktc-ribbon-item-flex-basis:34px;
    --ktc-ribbon-icon-size:19px;
    --ktc-ribbon-group-chevron-size:8px;
    --ktc-ribbon-group-chevron-right:1px;
    --ktc-ribbon-group-chevron-bottom:2px;
    --ktc-ribbon-label-display:none;
    --ktc-ribbon-wrap:nowrap;
    --ktc-ribbon-module-min-width:var(--ktc-toolbar-compact-module-min-width,18px);
    --ktc-ribbon-module-writing-mode:var(--ktc-toolbar-compact-module-writing-mode,vertical-rl);
    --ktc-ribbon-module-font-size:var(--ktc-toolbar-compact-module-font-size,8px);
    --ktc-ribbon-module-letter-spacing:var(--ktc-toolbar-compact-module-letter-spacing,.7px);
  }
  .strip {
    display:grid; width:100%; min-width:0; min-height:70px;
    grid-template-columns:var(--ktc-toolbar-toggle-track-width,24px) minmax(0,1fr) 30px; align-items:stretch;
    margin:0; padding:0; transition:min-height 120ms ease;
  }
  .toolbar.mode-compact .strip { min-height:40px; }
  .mode-toggle, .overflow {
    border:0; color:inherit; background:transparent; cursor:pointer;
  }
  .mode-toggle {
    display:flex; width:var(--ktc-toolbar-toggle-track-width,24px); min-width:var(--ktc-toolbar-toggle-track-width,24px); height:40px; align-self:start;
    align-items:flex-start; justify-content:center; margin:0; padding:12px 0 0;
  }
  .toolbar.mode-compact .mode-toggle { align-items:center; padding-top:0; }
  .chevron {
    width:16px; height:16px; min-width:16px; flex:0 0 16px;
    color:currentColor; transform:rotate(0deg); transform-origin:center;
    transition:transform 120ms ease;
  }
  .chevron path {
    fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.5;
  }
  .toolbar.mode-compact .chevron { transform:rotate(-90deg); }
  .track { min-width:0; overflow:visible; }
  .toolbar.mode-compact .track {
    overflow-x:auto; overflow-y:hidden; overscroll-behavior-inline:contain; scrollbar-width:none;
  }
  .toolbar.mode-compact .track::-webkit-scrollbar { display:none; }
  slot[name="ribbon"] { display:block; min-width:0; }
  ::slotted([slot="ribbon"]) {
    display:flex; width:100%; min-width:0; align-content:flex-start; align-items:stretch;
    flex-wrap:var(--ktc-ribbon-wrap); gap:2px; margin:0; padding:5px 4px;
  }
  .toolbar.mode-compact ::slotted([slot="ribbon"]) {
    width:max-content; min-width:100%; align-items:center; flex-wrap:nowrap; padding-block:3px;
  }
  .overflow {
    display:grid; width:30px; min-width:30px; height:30px; align-self:start;
    place-items:center; margin:5px 2px 0 0; padding:0; border-radius:3px;
    font-size:18px; line-height:1;
  }
  .overflow:hover, .overflow[aria-expanded="true"] {
    background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground));
  }
  .more-glyph { width:18px; height:18px; overflow:hidden; line-height:14px; text-align:center; }
  .group-content {
    min-width:0; margin:0 4px 4px 20px; padding:4px;
    border-right:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    border-bottom:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    border-left:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    border-radius:0 0 3px 3px;
  }
  .group-content[hidden] { display:none; }
  slot[name="group-content"] { display:block; min-width:0; }
  ::slotted([slot="group-content"]) { display:block; min-width:0; margin:0; }
  @media (prefers-reduced-motion:reduce) {
    .strip, .chevron { transition:none; }
  }
  @media (forced-colors:active) {
    .toolbar, .group-content { border-color:CanvasText; }
    button:focus-visible { outline:2px solid Highlight; }
  }
`;

export class KtcToolbarStrip extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: KtcToolbarStripModel = EMPTY_MODEL;
  private toolbar?: HTMLElement;
  private modeToggle?: HTMLButtonElement;
  private overflowButton?: HTMLButtonElement;
  private groupContent?: HTMLElement;
  private groupContentSlot?: HTMLSlotElement;

  connectedCallback(): void {
    this.ensureDom();
    this.applyModel();
  }

  set model(value: KtcToolbarStripModel) {
    this.activeModel = normalizeKtcToolbarStripModel(value);
    this.ensureDom();
    this.applyModel();
  }

  get model(): KtcToolbarStripModel { return this.activeModel; }

  getOverflowAnchorRect(): DOMRectReadOnly {
    this.ensureDom();
    return this.overflowButton!.getBoundingClientRect();
  }

  focusOverflowTrigger(): boolean {
    this.ensureDom();
    this.overflowButton!.focus();
    return true;
  }

  private ensureDom(): void {
    if (this.toolbar) return;
    const style = document.createElement("style");
    style.textContent = STYLE;

    const toolbar = document.createElement("section");
    toolbar.className = "toolbar mode-expanded";
    toolbar.setAttribute("part", "toolbar");
    toolbar.setAttribute("aria-label", "工具栏");

    const strip = document.createElement("div");
    strip.className = "strip";
    strip.setAttribute("part", "strip");

    const modeToggle = document.createElement("button");
    modeToggle.type = "button";
    modeToggle.className = "mode-toggle";
    modeToggle.setAttribute("part", "mode-toggle");
    modeToggle.append(this.chevron());
    modeToggle.onclick = () => this.emit({
      kind: "setMode",
      mode: this.activeModel.mode === "expanded" ? "compact" : "expanded",
    });

    const track = document.createElement("div");
    track.className = "track";
    track.setAttribute("part", "ribbon-track");
    const ribbonSlot = document.createElement("slot");
    ribbonSlot.name = "ribbon";
    track.append(ribbonSlot);

    const overflow = document.createElement("button");
    overflow.type = "button";
    overflow.className = "overflow";
    overflow.setAttribute("part", "overflow");
    overflow.setAttribute("aria-haspopup", "menu");
    overflow.setAttribute("aria-label", "全部工具与自定义");
    const moreGlyph = document.createElement("span");
    moreGlyph.className = "more-glyph";
    moreGlyph.setAttribute("aria-hidden", "true");
    moreGlyph.textContent = "\u2026";
    overflow.append(moreGlyph);
    overflow.onclick = () => this.emit({
      kind: "setOverflowOpen",
      open: !this.activeModel.overflowOpen,
    });
    strip.append(modeToggle, track, overflow);

    const groupContent = document.createElement("div");
    groupContent.className = "group-content";
    groupContent.setAttribute("part", "group-content");
    groupContent.hidden = true;
    const groupContentSlot = document.createElement("slot");
    groupContentSlot.name = "group-content";
    groupContentSlot.addEventListener("slotchange", () => this.applyGroupContentVisibility());
    groupContent.append(groupContentSlot);

    toolbar.append(strip, groupContent);
    this.root.replaceChildren(style, toolbar);
    this.toolbar = toolbar;
    this.modeToggle = modeToggle;
    this.overflowButton = overflow;
    this.groupContent = groupContent;
    this.groupContentSlot = groupContentSlot;
  }

  private applyModel(): void {
    if (!this.toolbar || !this.modeToggle || !this.overflowButton) return;
    const compact = this.activeModel.mode === "compact";
    this.toolbar.className = `toolbar mode-${this.activeModel.mode}`;
    const modeLabel = compact ? "切换为图标和文字工具栏" : "切换为仅图标工具栏";
    this.modeToggle.title = modeLabel;
    this.modeToggle.setAttribute("aria-label", modeLabel);
    this.modeToggle.setAttribute("aria-pressed", String(compact));
    this.overflowButton.title = "全部工具与自定义";
    this.overflowButton.setAttribute("aria-expanded", String(this.activeModel.overflowOpen));
    this.applyGroupContentVisibility();
  }

  private applyGroupContentVisibility(): void {
    if (!this.groupContent || !this.groupContentSlot) return;
    const hasVisibleContent = this.groupContentSlot
      .assignedElements({ flatten: true })
      .some((element) => !element.hasAttribute("hidden"));
    this.groupContent.hidden = !this.activeModel.groupContentVisible || !hasVisibleContent;
  }

  private chevron(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("chevron");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 6l4 4 4-4");
    svg.append(path);
    return svg;
  }

  private emit(detail: KtcToolbarStripActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcToolbarStripActionDetail>(
      KTC_TOOLBAR_STRIP_ACTION,
      {
        detail: Object.freeze({ ...detail }),
        bubbles: true,
        composed: true,
      },
    ));
  }
}

export function normalizeKtcToolbarStripModel(
  value: KtcToolbarStripModel | null | undefined,
): KtcToolbarStripModel {
  return Object.freeze({
    mode: value?.mode === "compact" ? "compact" : "expanded",
    groupContentVisible: value?.groupContentVisible === true,
    overflowOpen: value?.overflowOpen === true,
  });
}

export function ktcDefineToolbarStrip(tagName = KTC_TOOLBAR_STRIP_TAG): typeof KtcToolbarStrip {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcToolbarStrip;
  customElements.define(tagName, KtcToolbarStrip);
  return KtcToolbarStrip;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-toolbar-strip": KtcToolbarStrip;
  }
}
