export const KTC_IGNORE_POLICY_BLOCK_TAG = "ktc-ignore-policy-block";
export const KTC_IGNORE_POLICY_ACTION = "ktc-ignore-policy-action";

export type KtcIgnorePolicySource = "builtIn" | "git" | "custom";

export interface KtcIgnorePolicyBlockModel {
  readonly enabled: boolean;
  readonly builtInEnabled: boolean;
  readonly gitEnabled: boolean;
  readonly customEnabled: boolean;
  readonly customCount?: number;
  readonly busy?: boolean;
}

export type KtcIgnorePolicyBlockActionDetail =
  | { readonly kind: "toggleMaster"; readonly enabled: boolean }
  | { readonly kind: "toggleSource"; readonly source: KtcIgnorePolicySource; readonly enabled: boolean }
  | { readonly kind: "manage" };

const KTC_IGNORE_POLICY_SOURCES = [
  { source: "builtIn", key: "builtInEnabled", label: "插件", description: "插件内置的 CAA、C++、Web 生成物和缓存目录" },
  { source: "git", key: "gitEnabled", label: "Git", description: "读取本次扫描根所在最近 Git 仓库根部的 .gitignore" },
  { source: "custom", key: "customEnabled", label: "自定义", description: "读取本次扫描根的 .phoenix/.ignore" },
] as const;

const KTC_IGNORE_POLICY_STYLE = `
  :host { display:block; width:100%; min-width:0; margin:0; padding:0;
    color:var(--vscode-foreground,#3b3b3b); background:var(--vscode-sideBar-background,#f3f3f3);
    font:var(--vscode-font-size,13px)/1.35 var(--vscode-font-family,system-ui,sans-serif); }
  :host([hidden]) { display:none !important; }
  * { box-sizing:border-box; }
  button,input { font:inherit; }
  .block { margin:0; padding:0; border-top:1px solid var(--ktc-ui-border,var(--vscode-panel-border,#d4d4d4));
    border-bottom:1px solid var(--ktc-ui-border,var(--vscode-panel-border,#d4d4d4)); }
  .header { display:flex; align-items:center; gap:5px; min-height:30px; padding:3px 6px 3px 4px;
    list-style:none; cursor:pointer; user-select:none;
    background:var(--vscode-sideBarSectionHeader-background,transparent);
    color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground,#3b3b3b)); }
  .header::-webkit-details-marker { display:none; }
  .chevron { display:grid; place-items:center; flex:0 0 16px; width:16px; height:16px; }
  .chevron::before { content:""; width:6px; height:6px; border-right:1.4px solid currentColor;
    border-bottom:1.4px solid currentColor; transform:rotate(-45deg); }
  .block[open] .chevron::before { transform:rotate(45deg); margin-top:-3px; }
  .title { font-weight:600; white-space:nowrap; }
  .state { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-size:11px; color:var(--vscode-descriptionForeground,#616161); }
  .actions { display:flex; flex:0 0 auto; gap:4px; }
  button { min-height:24px; padding:2px 7px; cursor:pointer;
    border:1px solid var(--vscode-button-border,var(--ktc-ui-border,var(--vscode-panel-border,#c9c9c9)));
    color:var(--vscode-button-secondaryForeground,var(--vscode-foreground,#3b3b3b));
    background:var(--vscode-button-secondaryBackground,var(--vscode-input-background,#f5f5f5)); }
  button:hover:not(:disabled) { background:var(--vscode-button-secondaryHoverBackground,var(--vscode-toolbar-hoverBackground,#e5e5e5)); }
  button:disabled { opacity:.5; cursor:default; }
  button:focus-visible,input:focus-visible,.header:focus-visible { outline:1px solid var(--vscode-focusBorder,#007fd4); outline-offset:-1px; }
  .body { padding:6px 8px; }
  .sources { display:flex; align-items:center; flex-wrap:wrap; gap:6px 12px; }
  .source { display:inline-flex; align-items:center; gap:4px; white-space:nowrap; cursor:pointer; }
  .source input { margin:0; accent-color:var(--vscode-checkbox-selectBackground,var(--vscode-focusBorder,#007fd4)); }
  .source:has(input:disabled) { opacity:.65; cursor:default; }
  .count { font-size:11px; color:var(--vscode-descriptionForeground,#616161); }
  .hint { margin:5px 0 0; font-size:11px; color:var(--vscode-descriptionForeground,#616161); }
  @media (forced-colors:active) { .block,button { border-color:CanvasText; } }
`;

/** Controlled policy projection; only disclosure state belongs to this component. */
export class KtcIgnorePolicyBlock extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private activeModel = normalizeKtcIgnorePolicyBlockModel(undefined);
  private details?: HTMLDetailsElement;
  private state?: HTMLSpanElement;
  private masterButton?: HTMLButtonElement;
  private manageButton?: HTMLButtonElement;
  private customCount?: HTMLSpanElement;
  private readonly sources = new Map<KtcIgnorePolicySource, HTMLInputElement>();

  connectedCallback(): void {
    if (Object.prototype.hasOwnProperty.call(this, "model")) {
      const value = this.model;
      delete (this as unknown as { model?: KtcIgnorePolicyBlockModel }).model;
      this.model = value;
    }
    this.render();
  }

  set model(value: KtcIgnorePolicyBlockModel | undefined) {
    this.activeModel = normalizeKtcIgnorePolicyBlockModel(value);
    this.render();
  }

  get model(): KtcIgnorePolicyBlockModel { return this.activeModel; }

  private render(): void {
    if (!this.details) this.createContent();
    const model = this.activeModel;
    this.state!.textContent = model.enabled ? "已启用" : "已停用";
    this.masterButton!.textContent = model.enabled ? "停用" : "启用";
    this.masterButton!.title = model.enabled ? "停用忽略策略（保留安全排除）" : "启用忽略策略";
    this.masterButton!.setAttribute("aria-label", model.enabled ? "停用忽略策略" : "启用忽略策略");
    this.masterButton!.setAttribute("aria-pressed", String(model.enabled));
    this.masterButton!.disabled = Boolean(model.busy);
    this.manageButton!.disabled = Boolean(model.busy);
    this.details!.setAttribute("aria-busy", String(Boolean(model.busy)));
    for (const { source, key } of KTC_IGNORE_POLICY_SOURCES) {
      const input = this.sources.get(source)!;
      input.checked = model[key];
      input.disabled = !model.enabled || Boolean(model.busy);
    }
    this.customCount!.hidden = model.customCount === undefined;
    this.customCount!.textContent = model.customCount === undefined ? "" : `(${model.customCount})`;
  }

  private createContent(): void {
    const style = document.createElement("style");
    style.textContent = KTC_IGNORE_POLICY_STYLE;
    const details = document.createElement("details");
    details.className = "block";
    details.open = true;
    const header = document.createElement("summary");
    header.className = "header";
    const chevron = this.span("", "chevron");
    chevron.setAttribute("aria-hidden", "true");
    this.state = this.span("", "state");
    this.state.setAttribute("role", "status");
    const actions = document.createElement("span");
    actions.className = "actions";
    this.masterButton = this.button("toggle-master", () => {
      if (!this.activeModel.busy) this.emit({ kind: "toggleMaster", enabled: !this.activeModel.enabled });
    });
    this.manageButton = this.button("manage", () => {
      if (!this.activeModel.busy) this.emit({ kind: "manage" });
    });
    this.manageButton.textContent = "修改";
    this.manageButton.title = "修改忽略规则";
    this.manageButton.setAttribute("aria-label", "修改忽略规则");
    actions.append(this.masterButton, this.manageButton);
    header.append(chevron, this.span("忽略", "title"), this.state, actions);
    const body = document.createElement("div");
    body.className = "body";
    const sources = document.createElement("div");
    sources.className = "sources";
    sources.setAttribute("role", "group");
    sources.setAttribute("aria-label", "忽略来源");
    for (const { source, key, label: text, description } of KTC_IGNORE_POLICY_SOURCES) {
      const label = document.createElement("label");
      label.className = "source";
      label.title = description;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.source = source;
      input.setAttribute("aria-label", text);
      input.onchange = () => {
        const enabled = input.checked;
        input.checked = this.activeModel[key];
        if (this.activeModel.enabled && !this.activeModel.busy) this.emit({ kind: "toggleSource", source, enabled });
      };
      label.append(input, this.span(text, "source-label"));
      if (source === "custom") {
        this.customCount = this.span("", "count");
        this.customCount.setAttribute("aria-label", "自定义规则数量");
        label.append(this.customCount);
      }
      this.sources.set(source, input);
      sources.append(label);
    }
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "停用后仍保留不可关闭的安全排除；规则正文统一在 Ignore 管理中修改。";
    body.append(sources, hint);
    details.append(header, body);
    this.details = details;
    this.root.append(style, details);
  }

  private button(className: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.onclick = (event) => { event.preventDefault(); event.stopPropagation(); action(); };
    button.onkeydown = (event) => event.stopPropagation();
    return button;
  }

  private span(text: string, className: string): HTMLSpanElement {
    const value = document.createElement("span");
    value.className = className;
    value.textContent = text;
    return value;
  }

  private emit(detail: KtcIgnorePolicyBlockActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcIgnorePolicyBlockActionDetail>(KTC_IGNORE_POLICY_ACTION, {
      detail: Object.freeze({ ...detail }), bubbles: true, composed: true,
    }));
  }
}

export function normalizeKtcIgnorePolicyBlockModel(
  value: KtcIgnorePolicyBlockModel | null | undefined,
): KtcIgnorePolicyBlockModel {
  return Object.freeze({
    enabled: value?.enabled !== false,
    builtInEnabled: value?.builtInEnabled !== false,
    gitEnabled: value?.gitEnabled !== false,
    customEnabled: value?.customEnabled === true,
    customCount: typeof value?.customCount === "number" && Number.isFinite(value.customCount) && value.customCount >= 0
      ? Math.floor(value.customCount) : undefined,
    busy: value?.busy === true,
  });
}

export function ktcDefineIgnorePolicyBlock(tagName = KTC_IGNORE_POLICY_BLOCK_TAG): typeof KtcIgnorePolicyBlock {
  const existing = customElements.get(tagName);
  if (existing) return existing as typeof KtcIgnorePolicyBlock;
  customElements.define(tagName, KtcIgnorePolicyBlock);
  return KtcIgnorePolicyBlock;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-ignore-policy-block": KtcIgnorePolicyBlock;
  }
}
