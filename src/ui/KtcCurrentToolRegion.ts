export const KTC_CURRENT_TOOL_REGION_TAG = "ktc-current-tool-region";
export const KTC_CURRENT_TOOL_REGION_ACTION = "ktc-current-tool-region-action";

export interface KtcCurrentToolRegionModel {
  readonly itemId: string;
  readonly title: string;
  readonly icon: string;
}

export interface KtcCurrentToolRegionActionDetail {
  readonly kind: "close";
  readonly itemId: string;
}

const DEFAULT_TITLE = "工具";
const DEFAULT_ICON = "tool";

const EMPTY_MODEL: KtcCurrentToolRegionModel = Object.freeze({
  itemId: "",
  title: DEFAULT_TITLE,
  icon: DEFAULT_ICON,
});

const STYLE = `
  :host {
    display:block; width:100%; height:100%; min-width:0; min-height:0; flex:1 1 auto;
    margin:0; padding:0; overflow:hidden; color:var(--vscode-foreground);
    background:var(--vscode-sideBar-background);
    font:var(--vscode-font-size) / 1.35 var(--vscode-font-family);
  }
  :host([hidden]) { display:none !important; }
  * { box-sizing:border-box; }
  button { font:inherit; }
  button:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .region {
    display:grid; width:100%; height:100%; min-width:0; min-height:0;
    grid-template-rows:34px minmax(0,1fr); margin:0; padding:0; overflow:hidden;
    background:var(--vscode-sideBar-background);
  }
  .header {
    display:grid; width:100%; min-width:0; height:34px; min-height:34px;
    grid-template-columns:minmax(0,1fr) 28px; align-items:stretch; margin:0; padding:0 3px 0 10px;
    border-bottom:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground));
    background:var(--vscode-sideBarSectionHeader-background,var(--vscode-sideBar-background));
  }
  .identity {
    display:flex; min-width:0; align-items:center; gap:5px; overflow:hidden;
  }
  .icon { width:16px; height:16px; min-width:16px; flex:0 0 16px; color:currentColor; }
  .icon path {
    fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.2;
  }
  .icon[data-icon="sliders"] path { fill:currentColor; stroke:none; }
  .title {
    min-width:0; overflow:hidden; margin:0; font-weight:600; text-overflow:ellipsis; white-space:nowrap;
  }
  .close {
    display:grid; width:28px; height:32px; min-width:28px; place-items:center;
    margin:0; padding:0; border:0; color:inherit; background:transparent; cursor:pointer;
  }
  .close[hidden] { display:none; }
  .close:hover { background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground)); }
  .close-icon { width:16px; height:16px; color:currentColor; }
  .close-icon path {
    fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.2;
  }
  .body {
    width:100%; height:100%; min-width:0; min-height:0; margin:0; padding:0;
    overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain;
    color:var(--vscode-foreground); background:var(--vscode-sideBar-background);
  }
  slot:not([name]) { display:block; min-width:100%; min-height:100%; }
  @media (forced-colors:active) {
    .header { border-color:CanvasText; }
  }
`;

export class KtcCurrentToolRegion extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: KtcCurrentToolRegionModel = EMPTY_MODEL;
  private body?: HTMLElement;
  private titleElement?: HTMLElement;
  private iconElement?: SVGSVGElement;
  private iconPathElement?: SVGPathElement;
  private closeButton?: HTMLButtonElement;

  connectedCallback(): void {
    this.ensureDom();
    this.applyModel();
  }

  set model(value: KtcCurrentToolRegionModel) {
    const previousItemId = this.activeModel.itemId;
    this.activeModel = normalizeKtcCurrentToolRegionModel(value);
    this.ensureDom();
    if (previousItemId !== this.activeModel.itemId && this.body) this.body.scrollTop = 0;
    this.applyModel();
  }

  get model(): KtcCurrentToolRegionModel { return this.activeModel; }

  get contentScrollTop(): number { return this.body?.scrollTop ?? 0; }

  set contentScrollTop(value: number) {
    if (!this.body) return;
    this.body.scrollTop = Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  focusContent(): void { this.body?.focus(); }

  private ensureDom(): void {
    if (this.body) return;
    const style = document.createElement("style");
    style.textContent = STYLE;

    const region = document.createElement("section");
    region.className = "region";
    region.setAttribute("aria-labelledby", "ktc-current-tool-region-title");

    const header = document.createElement("header");
    header.className = "header";
    header.setAttribute("part", "header");

    const identity = document.createElement("div");
    identity.className = "identity";
    identity.setAttribute("part", "identity");
    const icon = this.icon(this.activeModel.icon);
    identity.append(icon);

    const title = document.createElement("h2");
    title.id = "ktc-current-tool-region-title";
    title.className = "title";
    title.setAttribute("part", "title");
    identity.append(title);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.setAttribute("part", "close");
    close.hidden = true;
    close.disabled = true;
    close.tabIndex = -1;
    close.setAttribute("aria-hidden", "true");
    const closeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    closeIcon.classList.add("close-icon");
    closeIcon.setAttribute("viewBox", "0 0 16 16");
    closeIcon.setAttribute("aria-hidden", "true");
    const closePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    closePath.setAttribute("d", "M4 4l8 8M12 4l-8 8");
    closeIcon.append(closePath);
    close.append(closeIcon);
    close.onclick = () => this.emitClose();
    header.append(identity, close);

    const body = document.createElement("section");
    body.className = "body";
    body.setAttribute("part", "body");
    body.setAttribute("role", "region");
    body.setAttribute("aria-label", `${this.activeModel.title}内容`);
    body.tabIndex = 0;
    body.append(document.createElement("slot"));

    region.append(header, body);
    this.root.replaceChildren(style, region);
    this.body = body;
    this.titleElement = title;
    this.iconElement = icon;
    this.iconPathElement = icon.children[0] as SVGPathElement;
    this.closeButton = close;
  }

  private applyModel(): void {
    if (!this.titleElement || !this.iconElement || !this.iconPathElement || !this.closeButton || !this.body) return;
    this.titleElement.textContent = this.activeModel.title;
    this.titleElement.title = this.activeModel.title;
    this.iconElement.setAttribute("data-icon", this.activeModel.icon);
    this.iconElement.setAttribute("viewBox", this.activeModel.icon === "sliders" ? "0 0 1024 1024" : "0 0 16 16");
    this.iconPathElement.setAttribute("d", iconPath(this.activeModel.icon));
    const closable = Boolean(this.activeModel.itemId);
    this.closeButton.hidden = !closable;
    this.closeButton.disabled = !closable;
    this.closeButton.tabIndex = closable ? 0 : -1;
    if (closable) {
      const closeLabel = `关闭 ${this.activeModel.title}`;
      this.closeButton.setAttribute("aria-label", closeLabel);
      this.closeButton.removeAttribute("aria-hidden");
      this.closeButton.title = closeLabel;
    } else {
      this.closeButton.removeAttribute("aria-label");
      this.closeButton.setAttribute("aria-hidden", "true");
      this.closeButton.title = "";
    }
    this.body.setAttribute("aria-label", `${this.activeModel.title}内容`);
  }

  private icon(kind: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("icon");
    svg.setAttribute("part", "icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("data-icon", kind);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", iconPath(kind));
    svg.append(path);
    return svg;
  }

  private emitClose(): void {
    if (!this.activeModel.itemId) return;
    this.dispatchEvent(new CustomEvent<KtcCurrentToolRegionActionDetail>(
      KTC_CURRENT_TOOL_REGION_ACTION,
      {
        detail: Object.freeze({ kind: "close", itemId: this.activeModel.itemId }),
        bubbles: true,
        composed: true,
      },
    ));
  }
}

export function normalizeKtcCurrentToolRegionModel(
  value: KtcCurrentToolRegionModel | null | undefined,
): KtcCurrentToolRegionModel {
  const itemId = typeof value?.itemId === "string" ? value.itemId.trim() : "";
  const title = typeof value?.title === "string" && value.title.trim()
    ? value.title.trim()
    : DEFAULT_TITLE;
  const icon = typeof value?.icon === "string" && value.icon.trim()
    ? value.icon.trim()
    : DEFAULT_ICON;
  return Object.freeze({ itemId, title, icon });
}

export function ktcDefineCurrentToolRegion(
  tagName = KTC_CURRENT_TOOL_REGION_TAG,
): typeof KtcCurrentToolRegion {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcCurrentToolRegion;
  customElements.define(tagName, KtcCurrentToolRegion);
  return KtcCurrentToolRegion;
}

function iconPath(kind: string): string {
  if (kind === "search" || kind === "replace") {
    return "M6.5 2.5a4 4 0 100 8 4 4 0 000-8zM9.5 9.5l3.5 3.5";
  }
  if (kind === "settings") {
    return "M8 3v2M8 11v2M3 8h2M11 8h2M4.5 4.5l1.4 1.4M10.1 10.1l1.4 1.4M11.5 4.5l-1.4 1.4M5.9 10.1l-1.4 1.4M8 6.2a1.8 1.8 0 110 3.6 1.8 1.8 0 010-3.6z";
  }
  if (kind === "shield" || kind === "ignore" || kind === "exclude") {
    return "M8 1.8l4.5 1.7v3.7c0 3-1.7 5.2-4.5 6.6-2.8-1.4-4.5-3.6-4.5-6.6V3.5zM5.8 8h4.4";
  }
  if (kind === "git") {
    return "M5 3.2a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM13.4 4.8a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM5 12.8a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM3.8 4.4v7.2M4.2 8c3.8 0 3.8-3.2 6.8-3.2";
  }
  if (kind === "run" || kind === "play") return "M3 2.5l10 5.5-10 5.5z";
  if (kind === "build") return "M2 4h12v8H2zM4 6h4M4 9h7";
  if (kind === "sort") return "M3 4h7M3 8h10M3 12h5M11 2v10M9 4l2-2 2 2M13 10l-2 2-2-2";
  if (kind === "uuid") return "M3 5l2-2 2 2-2 2zM9 3l2-2 2 2-2 2zM9 11l2-2 2 2-2 2zM3 11l2-2 2 2-2 2z";
  if (kind === "file") return "M3 1.5h6l3 3v10H3zM9 1.5v3h3";
  if (kind === "file-code") {
    return "M3 1.5h6l3 3v10H3zM9 1.5v3h3M6.2 8l-1.5 1.5L6.2 11M8.8 8l1.5 1.5L8.8 11";
  }
  if (kind === "layout") return "M1.5 2h13v12h-13zM5.5 2v12M5.5 5.5h9";
  if (kind === "sliders") {
    return "M389.44 768a96.064 96.064 0 0 1 181.12 0H896v64H570.56a96.064 96.064 0 0 1-181.12 0H128v-64zm192-288a96.064 96.064 0 0 1 181.12 0H896v64H762.56a96.064 96.064 0 0 1-181.12 0H128v-64zm-320-288a96.064 96.064 0 0 1 181.12 0H896v64H442.56a96.064 96.064 0 0 1-181.12 0H128v-64z";
  }
  if (kind === "window") return "M2.5 3h11v10h-11zM2.5 6h11M6 6v7";
  return "M3 2.5h6l3.5 3.5v7.5H3zM9 2.5V6h3.5M5.5 9h4.5M5.5 11h3.5";
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-current-tool-region": KtcCurrentToolRegion;
  }
}
