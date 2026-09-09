export const KTC_DIRECTORY_BAR_TAG = "ktc-directory-bar";
export const KTC_DIRECTORY_BAR_ACTION = "ktc-directory-bar-action";

export interface KtcDirectoryBarModel {
  readonly label: string;
  readonly value: string;
}

export type KtcDirectoryBarActionDetail =
  | { readonly kind: "select" }
  | { readonly kind: "choose" };

const DEFAULT_LABEL = "目录";
const DEFAULT_VALUE = "未选择目录";

const EMPTY_MODEL: KtcDirectoryBarModel = Object.freeze({
  label: DEFAULT_LABEL,
  value: DEFAULT_VALUE,
});

const STYLE = `
  :host {
    display:block; width:100%; height:42px; min-width:0; min-height:42px; flex:0 0 42px;
    margin:0; padding:0; overflow:hidden; color:var(--vscode-foreground);
    background:var(--vscode-sideBar-background);
    font:var(--vscode-font-size) / 1.35 var(--vscode-font-family);
  }
  :host([hidden]) { display:none !important; }
  * { box-sizing:border-box; }
  button { font:inherit; }
  button:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .bar {
    display:grid; width:100%; height:42px; min-width:0; min-height:42px;
    grid-template-columns:auto minmax(0,1fr) 34px; align-items:center; gap:6px;
    margin:0; padding:4px 8px 4px 14px; overflow:hidden;
    border-bottom:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    background:var(--vscode-sideBar-background); white-space:nowrap;
  }
  .label { min-width:0; overflow:hidden; font-weight:600; text-overflow:ellipsis; }
  .select {
    display:flex; width:100%; min-width:0; height:32px; align-items:center; gap:5px;
    margin:0; padding:3px 7px; overflow:hidden; border:1px solid transparent;
    color:var(--vscode-input-foreground,var(--vscode-foreground));
    background:var(--vscode-input-background,var(--vscode-sideBar-background));
    cursor:pointer; text-align:left;
  }
  .select:hover { border-color:var(--vscode-input-border,var(--vscode-focusBorder)); }
  .value { min-width:0; flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .chevron { width:12px; height:12px; min-width:12px; flex:0 0 12px; color:currentColor; }
  .chevron path {
    fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.5;
  }
  .choose {
    display:grid; width:34px; height:32px; min-width:34px; place-items:center;
    margin:0; padding:0; border:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    color:var(--vscode-foreground); background:transparent; cursor:pointer;
  }
  .choose:hover { background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground)); }
  .folder { width:16px; height:16px; color:currentColor; }
  .folder path {
    fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:1.2;
  }
  @media (forced-colors:active) {
    .bar, .select, .choose { border-color:CanvasText; }
    button:focus-visible { outline:2px solid Highlight; }
  }
`;

export class KtcDirectoryBar extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: KtcDirectoryBarModel = EMPTY_MODEL;
  private labelElement?: HTMLElement;
  private valueElement?: HTMLElement;
  private selectButton?: HTMLButtonElement;
  private chooseButton?: HTMLButtonElement;

  connectedCallback(): void {
    this.ensureDom();
    this.applyModel();
  }

  set model(value: KtcDirectoryBarModel) {
    this.activeModel = normalizeKtcDirectoryBarModel(value);
    this.ensureDom();
    this.applyModel();
  }

  get model(): KtcDirectoryBarModel { return this.activeModel; }

  private ensureDom(): void {
    if (this.selectButton) return;
    const style = document.createElement("style");
    style.textContent = STYLE;

    const bar = document.createElement("section");
    bar.className = "bar";
    bar.setAttribute("part", "bar");

    const label = document.createElement("span");
    label.className = "label";
    label.setAttribute("part", "label");

    const select = document.createElement("button");
    select.type = "button";
    select.className = "select";
    select.setAttribute("part", "select");
    const value = document.createElement("span");
    value.className = "value";
    value.setAttribute("part", "value");
    select.append(value, this.chevron());
    select.onclick = () => this.emit({ kind: "select" });

    const choose = document.createElement("button");
    choose.type = "button";
    choose.className = "choose";
    choose.setAttribute("part", "choose");
    choose.append(this.folderIcon());
    choose.onclick = () => this.emit({ kind: "choose" });

    bar.append(label, select, choose);
    this.root.replaceChildren(style, bar);
    this.labelElement = label;
    this.valueElement = value;
    this.selectButton = select;
    this.chooseButton = choose;
  }

  private applyModel(): void {
    if (!this.labelElement || !this.valueElement || !this.selectButton || !this.chooseButton) return;
    this.labelElement.textContent = this.activeModel.label;
    this.labelElement.title = this.activeModel.label;
    this.valueElement.textContent = this.activeModel.value;
    this.valueElement.title = this.activeModel.value;
    this.selectButton.title = `${this.activeModel.label}：${this.activeModel.value}`;
    this.selectButton.setAttribute(
      "aria-label",
      `切换${this.activeModel.label}，当前${this.activeModel.value}`,
    );
    this.chooseButton.title = `选择${this.activeModel.label}`;
    this.chooseButton.setAttribute("aria-label", `选择${this.activeModel.label}`);
  }

  private chevron(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("chevron");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    stroke.setAttribute("d", "M4 6l4 4 4-4");
    svg.append(stroke);
    return svg;
  }

  private folderIcon(): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("folder");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    stroke.setAttribute("d", "M1.5 3.5h5l1.5 2h6.5v7h-13z");
    svg.append(stroke);
    return svg;
  }

  private emit(detail: KtcDirectoryBarActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcDirectoryBarActionDetail>(
      KTC_DIRECTORY_BAR_ACTION,
      {
        detail: Object.freeze({ ...detail }),
        bubbles: true,
        composed: true,
      },
    ));
  }
}

export function normalizeKtcDirectoryBarModel(
  value: KtcDirectoryBarModel | null | undefined,
): KtcDirectoryBarModel {
  const label = typeof value?.label === "string" && value.label.trim()
    ? value.label.trim()
    : DEFAULT_LABEL;
  const normalizedValue = typeof value?.value === "string" && value.value.trim()
    ? value.value.trim()
    : DEFAULT_VALUE;
  return Object.freeze({ label, value: normalizedValue });
}

export function ktcDefineDirectoryBar(tagName = KTC_DIRECTORY_BAR_TAG): typeof KtcDirectoryBar {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcDirectoryBar;
  customElements.define(tagName, KtcDirectoryBar);
  return KtcDirectoryBar;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-directory-bar": KtcDirectoryBar;
  }
}
