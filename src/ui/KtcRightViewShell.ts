export const KTC_RIGHT_VIEW_SHELL_TAG = "ktc-right-view-shell";

export type KtcRightViewScrollMode = "vertical" | "both" | "none";

export interface KtcRightViewShellModel {
  readonly title: string;
  readonly scrollMode?: KtcRightViewScrollMode;
}

const DEFAULT_TITLE = "Right View";
const DEFAULT_SCROLL_MODE: KtcRightViewScrollMode = "vertical";

const EMPTY_MODEL: Readonly<Required<KtcRightViewShellModel>> = Object.freeze({
  title: DEFAULT_TITLE,
  scrollMode: DEFAULT_SCROLL_MODE,
});

const STYLE = `
  :host {
    display:block; width:100%; height:100%; min-width:0; min-height:0;
    margin:0; padding:0; overflow:hidden;
    color:var(--vscode-foreground); background:var(--vscode-editor-background);
    font:var(--vscode-font-size) / 1.35 var(--vscode-font-family);
  }
  :host([hidden]) { display:none !important; }
  * { box-sizing:border-box; }
  .shell {
    display:grid; width:100%; height:100%; min-width:0; min-height:0;
    grid-template-rows:44px minmax(0,1fr); margin:0; padding:0;
    background:var(--vscode-editor-background);
  }
  .header {
    display:flex; width:100%; min-width:0; height:44px; min-height:44px;
    align-items:center; gap:12px; margin:0; padding:0 12px;
    border-bottom:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    background:var(--vscode-editor-background);
  }
  .title {
    min-width:0; flex:1 1 auto; overflow:hidden; margin:0;
    color:var(--vscode-foreground); font:600 15px/1.25 var(--vscode-font-family);
    text-overflow:ellipsis; white-space:nowrap;
  }
  .actions {
    display:flex; min-width:0; flex:0 1 auto; align-items:center; justify-content:flex-end;
    gap:6px;
  }
  .main {
    width:100%; height:100%; min-width:0; min-height:0; margin:0; padding:0;
    overscroll-behavior:contain;
  }
  .scroll-vertical { overflow-x:hidden; overflow-y:auto; }
  .scroll-both { overflow:auto; }
  .scroll-none { overflow:hidden; }
  slot:not([name]) { display:block; min-width:100%; min-height:100%; }
  @media (forced-colors:active) {
    .header { border-bottom-color:CanvasText; }
  }
`;

export class KtcRightViewShell extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: Readonly<Required<KtcRightViewShellModel>> = EMPTY_MODEL;

  connectedCallback(): void { this.render(); }

  set model(value: KtcRightViewShellModel) {
    this.activeModel = normalizeModel(value);
    this.render();
  }

  get model(): Readonly<Required<KtcRightViewShellModel>> { return this.activeModel; }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = STYLE;

    const shell = document.createElement("section");
    shell.className = "shell";
    shell.setAttribute("aria-labelledby", "ktc-right-view-title");

    const header = document.createElement("header");
    header.className = "header";
    header.setAttribute("part", "header");

    const title = document.createElement("h2");
    title.id = "ktc-right-view-title";
    title.className = "title";
    title.textContent = this.activeModel.title;
    title.title = this.activeModel.title;

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.setAttribute("part", "actions");
    const actionSlot = document.createElement("slot");
    actionSlot.name = "actions";
    actions.append(actionSlot);

    const main = document.createElement("section");
    main.className = `main scroll-${this.activeModel.scrollMode}`;
    main.setAttribute("part", "main");
    main.setAttribute("aria-label", `${this.activeModel.title}内容`);
    if (this.activeModel.scrollMode !== "none") main.setAttribute("tabindex", "0");
    const contentSlot = document.createElement("slot");
    main.append(contentSlot);

    header.append(title, actions);
    shell.append(header, main);
    this.root.replaceChildren(style, shell);
  }
}

export function ktcDefineRightViewShell(tagName = KTC_RIGHT_VIEW_SHELL_TAG): typeof KtcRightViewShell {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcRightViewShell;
  customElements.define(tagName, KtcRightViewShell);
  return KtcRightViewShell;
}

function normalizeModel(value: KtcRightViewShellModel | null | undefined): Readonly<Required<KtcRightViewShellModel>> {
  const title = typeof value?.title === "string" && value.title.trim()
    ? value.title.trim()
    : DEFAULT_TITLE;
  const scrollMode = isScrollMode(value?.scrollMode) ? value.scrollMode : DEFAULT_SCROLL_MODE;
  return Object.freeze({ title, scrollMode });
}

function isScrollMode(value: unknown): value is KtcRightViewScrollMode {
  return value === "vertical" || value === "both" || value === "none";
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-right-view-shell": KtcRightViewShell;
  }
}
