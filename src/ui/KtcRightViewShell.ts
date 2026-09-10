export const KTC_RIGHT_VIEW_SHELL_TAG = "ktc-right-view-shell";

export type KtcRightViewScrollMode = "vertical" | "both" | "none";

export interface KtcRightViewShellModel {
  readonly title: string;
  readonly contextPath?: string;
  /** Optional compact context copy; the full contextPath remains its tooltip. */
  readonly contextLabel?: string;
  readonly hideContext?: boolean;
  readonly scrollMode?: KtcRightViewScrollMode;
}

export interface KtcRightViewContextDisplay {
  readonly label: string;
  readonly title: string;
}

const DEFAULT_TITLE = "Right View";
const DEFAULT_SCROLL_MODE: KtcRightViewScrollMode = "vertical";
const UNASSOCIATED_CONTEXT = "未关联目录";

const EMPTY_MODEL: Readonly<Required<KtcRightViewShellModel>> = Object.freeze({
  title: DEFAULT_TITLE,
  contextPath: "",
  contextLabel: "",
  hideContext: false,
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
  .heading {
    display:flex; min-width:0; flex:1 1 auto; align-items:baseline; gap:8px;
    overflow:hidden;
  }
  .title {
    min-width:0; flex:0 1 auto; overflow:hidden; margin:0;
    color:var(--vscode-foreground); font:600 15px/1.25 var(--vscode-font-family);
    text-overflow:ellipsis; white-space:nowrap;
  }
  .context {
    min-width:0; flex:1 1 auto; overflow:hidden;
    color:var(--vscode-descriptionForeground); font:400 12px/1.25 var(--vscode-font-family);
    text-overflow:ellipsis; white-space:nowrap;
  }
  .actions {
    display:flex; min-width:0; max-width:60%; flex:0 0 auto;
    align-items:center; justify-content:flex-end; gap:6px; overflow-x:auto;
  }
  .main {
    width:100%; height:100%; min-width:0; min-height:0; margin:0; padding:0;
    overscroll-behavior:contain;
  }
  .scroll-vertical { overflow-x:hidden; overflow-y:auto; }
  .scroll-both { overflow:auto; }
  .scroll-none { overflow:hidden; }
  slot:not([name]) { display:block; min-width:100%; min-height:100%; }
  /* Consumers with their own scrollport need a definite height through the slot. */
  .scroll-none > slot:not([name]) { height:100%; min-height:0; }
  @media (forced-colors:active) {
    .header { border-bottom-color:CanvasText; }
  }
`;

export class KtcRightViewShell extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: Readonly<Required<KtcRightViewShellModel>> = EMPTY_MODEL;

  connectedCallback(): void { this.render(); }

  set model(value: KtcRightViewShellModel) {
    const nextModel = normalizeModel(value);
    if (sameModel(this.activeModel, nextModel)) return;
    this.activeModel = nextModel;
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

    const heading = document.createElement("div");
    heading.className = "heading";

    const title = document.createElement("h2");
    title.id = "ktc-right-view-title";
    title.className = "title";
    title.textContent = this.activeModel.title;
    title.title = this.activeModel.title;
    heading.append(title);

    if (!this.activeModel.hideContext) {
      const contextDisplay = ktcFormatRightViewContextPath(this.activeModel.contextPath);
      const context = document.createElement("span");
      context.className = "context";
      context.textContent = this.activeModel.contextLabel || contextDisplay.label;
      context.title = contextDisplay.title;
      context.setAttribute("aria-label", this.activeModel.contextLabel
        ? `${this.activeModel.contextLabel}；${contextDisplay.title}`
        : this.activeModel.contextPath
        ? `关联目录：${contextDisplay.title}`
        : UNASSOCIATED_CONTEXT);
      heading.append(context);
    }

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

    header.append(heading, actions);
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
  const contextPath = typeof value?.contextPath === "string" ? value.contextPath.trim() : "";
  const contextLabel = typeof value?.contextLabel === "string" ? value.contextLabel.trim() : "";
  const hideContext = value?.hideContext === true;
  return Object.freeze({ title, contextPath, contextLabel, hideContext, scrollMode });
}

export function ktcFormatRightViewContextPath(value: string | null | undefined): KtcRightViewContextDisplay {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title) return Object.freeze({ label: UNASSOCIATED_CONTEXT, title: UNASSOCIATED_CONTEXT });

  const separator = choosePathSeparator(title);
  const path = trimTrailingSeparators(title, separator);
  if (isDriveRoot(path)) return Object.freeze({ label: `${path} @ ${path}`, title });
  const lastSeparator = path.lastIndexOf(separator);
  if (lastSeparator < 0) return Object.freeze({ label: `${path} @ .`, title });
  if (path === separator) return Object.freeze({ label: `${separator} @ ${separator}`, title });

  const directoryName = path.slice(lastSeparator + 1) || path;
  let parentPath = path.slice(0, lastSeparator);
  if (!parentPath) parentPath = separator;
  if (/^[A-Za-z]:$/u.test(parentPath)) parentPath += separator;
  return Object.freeze({ label: `${directoryName} @ ${parentPath}`, title });
}

function choosePathSeparator(value: string): "/" | "\\" {
  if (/^(?:[A-Za-z]:\\|\\\\)/u.test(value)) return "\\";
  if (value.includes("/") || !value.includes("\\")) return "/";
  return "\\";
}

function trimTrailingSeparators(value: string, separator: "/" | "\\"): string {
  let result = value;
  while (result.length > 1 && result.endsWith(separator) && !isDriveRoot(result)) {
    result = result.slice(0, -1);
  }
  return result;
}

function isDriveRoot(value: string): boolean {
  return /^[A-Za-z]:[\\/]$/u.test(value);
}

function isScrollMode(value: unknown): value is KtcRightViewScrollMode {
  return value === "vertical" || value === "both" || value === "none";
}

function sameModel(
  left: Readonly<Required<KtcRightViewShellModel>>,
  right: Readonly<Required<KtcRightViewShellModel>>,
): boolean {
  return left.title === right.title
    && left.contextPath === right.contextPath
    && left.contextLabel === right.contextLabel
    && left.hideContext === right.hideContext
    && left.scrollMode === right.scrollMode;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-right-view-shell": KtcRightViewShell;
  }
}
