export const KTC_SYSTEM_OUTPUT_BLOCK_TAG = "ktc-system-output-block";
export const KTC_SYSTEM_OUTPUT_BLOCK_ACTION = "ktc-system-output-block-action";

export interface KtcSystemOutputBlockModel {
  readonly title?: string;
  readonly lines: readonly string[];
}

export interface KtcSystemOutputBlockActionDetail {
  readonly kind: "close";
}

export interface KtcNormalizedSystemOutputBlockModel {
  readonly title: string;
  readonly lines: readonly string[];
}

const DEFAULT_TITLE = "输出";

const EMPTY_MODEL: KtcNormalizedSystemOutputBlockModel = Object.freeze({
  title: DEFAULT_TITLE,
  lines: Object.freeze([]),
});

const STYLE = `
  :host {
    display:block; width:100%; min-width:0; max-width:100%; min-height:0;
    margin:0; padding:0; color:var(--vscode-foreground);
    background:var(--vscode-editor-background);
    font:var(--vscode-font-size) / 1.35 var(--vscode-font-family);
  }
  :host([hidden]) { display:none !important; }
  * { box-sizing:border-box; }
  button { font:inherit; }
  button:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
  .block {
    display:grid; width:100%; height:100%; min-width:0; min-height:0;
    grid-template-rows:30px minmax(0,1fr);
    margin:0; padding:0; border-top:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    background:var(--vscode-editor-background);
  }
  .header {
    display:flex; width:100%; min-width:0; height:30px; min-height:30px;
    align-items:center; gap:6px; margin:0; padding:0 4px 0 8px;
    border-bottom:1px solid var(--ktc-ui-border,var(--vscode-panel-border));
    color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground));
    background:var(--vscode-sideBarSectionHeader-background,var(--vscode-editor-background));
  }
  .title {
    min-width:0; flex:1 1 auto; overflow:hidden; font-weight:600;
    text-overflow:ellipsis; white-space:nowrap;
  }
  .close {
    display:grid; width:24px; height:24px; min-width:24px; flex:0 0 24px; place-items:center;
    margin:0; padding:0; border:0; color:inherit; background:transparent; cursor:pointer;
  }
  .close:hover { background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground)); }
  .close-glyph { width:16px; height:16px; font-size:18px; line-height:15px; text-align:center; }
  .body {
    width:100%; min-width:0; min-height:0; margin:0; padding:0; overflow:auto;
    overscroll-behavior:contain; color:var(--vscode-editor-foreground,var(--vscode-foreground));
    background:var(--vscode-editor-background);
  }
  .output {
    width:max-content; min-width:100%; min-height:100%; margin:0; padding:6px 8px;
    color:inherit; background:transparent; tab-size:4; white-space:pre;
    font:var(--vscode-editor-font-size,var(--vscode-font-size)) / var(--vscode-editor-line-height,1.4)
      var(--vscode-editor-font-family,var(--vscode-font-family,monospace));
  }
  @media (forced-colors:active) {
    .block, .header { border-color:CanvasText; }
  }
`;

export class KtcSystemOutputBlock extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel: KtcNormalizedSystemOutputBlockModel = EMPTY_MODEL;

  connectedCallback(): void { this.render(); }

  set model(value: KtcSystemOutputBlockModel) {
    const nextModel = normalizeKtcSystemOutputBlockModel(value);
    if (isSameModel(this.activeModel, nextModel)) return;
    this.activeModel = nextModel;
    this.render();
  }

  get model(): KtcNormalizedSystemOutputBlockModel { return this.activeModel; }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = STYLE;

    const block = document.createElement("section");
    block.className = "block";
    block.setAttribute("aria-labelledby", "ktc-system-output-title");

    const header = document.createElement("header");
    header.className = "header";
    header.setAttribute("part", "header");

    const title = this.span(this.activeModel.title, "title");
    title.id = "ktc-system-output-title";
    title.title = this.activeModel.title;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.setAttribute("aria-label", "关闭输出");
    close.title = "关闭输出";
    close.append(this.span("\u00d7", "close-glyph"));
    close.onclick = () => this.emit({ kind: "close" });
    header.append(title, close);

    const body = document.createElement("div");
    body.id = "ktc-system-output-body";
    body.className = "body";
    body.setAttribute("part", "body");
    body.setAttribute("role", "region");
    body.setAttribute("aria-label", `${this.activeModel.title}内容`);
    body.tabIndex = 0;

    const output = document.createElement("pre");
    output.className = "output";
    output.setAttribute("part", "output");
    output.setAttribute("role", "log");
    output.setAttribute("aria-live", "polite");
    output.textContent = this.activeModel.lines.join("\n");
    body.append(output);
    block.append(header, body);

    this.root.replaceChildren(style, block);
    body.scrollTop = body.scrollHeight;
  }

  private span(text: string, className: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  private emit(detail: KtcSystemOutputBlockActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcSystemOutputBlockActionDetail>(KTC_SYSTEM_OUTPUT_BLOCK_ACTION, {
      detail: Object.freeze({ ...detail }),
      bubbles: true,
      composed: true,
    }));
  }
}

function isSameModel(
  current: KtcNormalizedSystemOutputBlockModel,
  next: KtcNormalizedSystemOutputBlockModel,
): boolean {
  return current.title === next.title
    && current.lines.length === next.lines.length
    && current.lines.every((line, index) => line === next.lines[index]);
}

export function normalizeKtcSystemOutputBlockModel(
  value: KtcSystemOutputBlockModel | null | undefined,
): KtcNormalizedSystemOutputBlockModel {
  const title = typeof value?.title === "string" && value.title.trim()
    ? value.title.trim()
    : DEFAULT_TITLE;
  const lines = Object.freeze(
    (Array.isArray(value?.lines) ? value.lines : []).filter((line): line is string => typeof line === "string"),
  );
  return Object.freeze({
    title,
    lines,
  });
}

export function ktcDefineSystemOutputBlock(
  tagName = KTC_SYSTEM_OUTPUT_BLOCK_TAG,
): typeof KtcSystemOutputBlock {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcSystemOutputBlock;
  customElements.define(tagName, KtcSystemOutputBlock);
  return KtcSystemOutputBlock;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-system-output-block": KtcSystemOutputBlock;
  }
}
