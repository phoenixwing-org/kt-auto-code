import type { KtcReplacementRuleDraft } from "../../../src/associatedReplacementRules.js";
import type { KtcAssociatedRulePickerState } from "../tools/types.js";

export const KTC_ASSOCIATED_RULE_PICKER_TAG = "ktc-associated-rule-picker";
export const KTC_ASSOCIATED_RULE_PICKER_ACTION = "ktc-associated-rule-picker-action";

export type KtcAssociatedRulePickerActionDetail =
  | { readonly kind: "confirm"; readonly rules: readonly KtcReplacementRuleDraft[] }
  | { readonly kind: "cancel" };

const STYLE = `
  :host { display: contents; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  dialog {
    width: min(430px, calc(100vw - 20px));
    max-height: calc(100vh - 24px);
    padding: 0;
    border: 1px solid var(--ktc-ui-border, var(--vscode-widget-border, var(--vscode-panel-border)));
    border-radius: 4px;
    color: var(--vscode-editorWidget-foreground, var(--vscode-foreground));
    background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    box-shadow: 0 8px 24px var(--vscode-widget-shadow, rgba(0, 0, 0, .35));
  }
  dialog::backdrop { background: rgba(0, 0, 0, .38); }
  .shell { display: flex; flex-direction: column; max-height: calc(100vh - 26px); }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 38px;
    padding: 6px 10px 6px 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .header strong { font-size: 12px; font-weight: 600; }
  .header .summary { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 10px; }
  .close {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--ktc-ui-border, transparent);
    color: var(--vscode-foreground);
    background: transparent;
    cursor: pointer;
    font-size: 17px;
  }
  .close:hover { background: var(--vscode-toolbar-hoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, transparent)); }
  .list { overflow: auto; padding: 6px 12px 2px; }
  .empty { margin: 7px 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 7px;
    align-items: start;
    padding: 7px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .row > input[type="checkbox"] { margin-top: 3px; }
  .label { margin-bottom: 4px; color: var(--vscode-descriptionForeground); font-size: 10px; }
  .values {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 5px;
    align-items: center;
  }
  .values code {
    overflow: hidden;
    padding: 3px 5px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-textCodeBlock-background);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .values input {
    min-width: 0;
    height: 27px;
    padding: 3px 6px;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    border-radius: 2px;
    outline: none;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    font-family: var(--vscode-editor-font-family);
  }
  .values input:focus { border-color: var(--vscode-focusBorder); }
  .arrow { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    padding: 8px 12px;
    border-top: 1px solid var(--vscode-panel-border);
  }
  .action {
    min-height: 28px;
    padding: 4px 12px;
    border: 1px solid var(--ktc-ui-border, var(--vscode-button-border, transparent));
    border-radius: 2px;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    cursor: pointer;
  }
  .action:not(:disabled):hover { background: var(--vscode-button-hoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-button-border, transparent))); }
  .action.secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  .action.secondary:not(:disabled):hover { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-button-border, transparent))); }
  .action:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 320px) {
    .values { grid-template-columns: minmax(0, 1fr); }
    .values .arrow { display: none; }
  }
`;

export class KtcAssociatedRulePicker extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private dialog: HTMLDialogElement | undefined;
  private titleElement: HTMLElement | undefined;
  private summaryElement: HTMLElement | undefined;
  private list: HTMLElement | undefined;
  private confirm: HTMLButtonElement | undefined;
  private activeModel: KtcAssociatedRulePickerState | undefined;
  private candidateChecks: HTMLInputElement[] = [];
  private customEnabled: HTMLInputElement | undefined;
  private customSearch: HTMLInputElement | undefined;
  private customReplace: HTMLInputElement | undefined;

  connectedCallback(): void { this.ensureShell(); }

  /**
   * 打开一次性候选模型。已打开时只刷新当前内容，不重复调用 showModal。
   * Host 必须继续负责候选生成、去重和确认后的持久化。
   */
  openPicker(model: KtcAssociatedRulePickerState): void {
    this.ensureShell();
    this.activeModel = model;
    this.renderModel(model);
    if (!this.dialog?.open) this.dialog?.showModal();
    if (model.candidates.length === 0) this.customSearch?.focus();
  }

  private ensureShell(): void {
    if (this.dialog) return;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const dialog = document.createElement("dialog");
    dialog.setAttribute("aria-labelledby", "associated-rule-picker-title");
    const shell = document.createElement("div");
    shell.className = "shell";
    const header = document.createElement("div");
    header.className = "header";
    const title = document.createElement("strong");
    title.id = "associated-rule-picker-title";
    title.textContent = "添加关联规则";
    const summary = document.createElement("span");
    summary.className = "summary";
    const close = this.button("×", "close", () => this.cancelPicker());
    close.title = "关闭";
    close.setAttribute("aria-label", "关闭");
    header.append(title, summary, close);
    const list = document.createElement("div");
    list.className = "list";
    const footer = document.createElement("div");
    footer.className = "footer";
    const cancel = this.button("取消", "action secondary", () => this.cancelPicker());
    const confirm = this.button("添加", "action", () => this.confirmSelection());
    footer.append(cancel, confirm);
    shell.append(header, list, footer);
    dialog.append(shell);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.cancelPicker();
    });
    this.root.replaceChildren(style, dialog);
    this.dialog = dialog;
    this.titleElement = title;
    this.summaryElement = summary;
    this.list = list;
    this.confirm = confirm;
  }

  private renderModel(model: KtcAssociatedRulePickerState): void {
    if (!this.list || !this.titleElement || !this.summaryElement) return;
    this.titleElement.textContent = model.title || "添加关联规则";
    this.summaryElement.textContent = model.summary || `${model.candidates.length} 条候选`;
    this.candidateChecks = [];
    this.customEnabled = undefined;
    this.customSearch = undefined;
    this.customReplace = undefined;
    const rows: HTMLElement[] = [];
    if (model.candidates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "没有新的推荐规则。";
      rows.push(empty);
    }
    model.candidates.forEach((candidate, index) => {
      const row = document.createElement("label");
      row.className = "row";
      const checked = document.createElement("input");
      checked.type = "checkbox";
      checked.checked = Boolean(candidate.checked);
      checked.dataset.ruleIndex = String(index);
      checked.onchange = () => this.updateConfirm();
      this.candidateChecks.push(checked);
      const content = document.createElement("div");
      const label = document.createElement("div");
      label.className = "label";
      label.textContent = candidate.label;
      const values = document.createElement("div");
      values.className = "values";
      const search = document.createElement("code");
      search.textContent = candidate.rule.search;
      search.title = candidate.rule.search;
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "→";
      const replace = document.createElement("code");
      replace.textContent = candidate.rule.replace;
      replace.title = candidate.rule.replace;
      values.append(search, arrow, replace);
      content.append(label, values);
      row.append(checked, content);
      rows.push(row);
    });
    rows.push(this.customRow());
    this.list.replaceChildren(...rows);
    this.updateConfirm();
  }

  private customRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "row";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.dataset.customEnabled = "true";
    enabled.onchange = () => this.updateConfirm();
    const content = document.createElement("div");
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = "自定义规则";
    const values = document.createElement("div");
    values.className = "values";
    const search = document.createElement("input");
    search.placeholder = "Source";
    search.setAttribute("aria-label", "自定义规则 Source");
    search.dataset.customSearch = "true";
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "→";
    const replace = document.createElement("input");
    replace.placeholder = "Target";
    replace.setAttribute("aria-label", "自定义规则 Target");
    replace.dataset.customReplace = "true";
    const update = () => {
      if (search.value.trim()) enabled.checked = true;
      this.updateConfirm();
    };
    search.oninput = update;
    replace.oninput = update;
    search.onkeydown = (event) => this.stopTextInputEnter(event);
    replace.onkeydown = (event) => this.stopTextInputEnter(event);
    values.append(search, arrow, replace);
    content.append(label, values);
    row.append(enabled, content);
    this.customEnabled = enabled;
    this.customSearch = search;
    this.customReplace = replace;
    return row;
  }

  private updateConfirm(): void {
    if (!this.confirm) return;
    const selected = this.candidateChecks.some((input) => input.checked);
    const custom = Boolean(this.customEnabled?.checked && this.customSearch?.value.trim());
    this.confirm.disabled = !selected && !custom;
  }

  private confirmSelection(): void {
    const model = this.activeModel;
    if (!model) return;
    const rules = this.candidateChecks.flatMap((input, index) =>
      input.checked && model.candidates[index] ? [model.candidates[index]!.rule] : []);
    const customSearch = this.customSearch?.value ?? "";
    if (this.customEnabled?.checked && customSearch.trim()) {
      rules.push({
        id: `custom-${Date.now()}`,
        search: customSearch,
        replace: this.customReplace?.value ?? "",
        enabled: true,
        source: "user",
        relationKind: "custom",
      });
    }
    if (rules.length === 0) return;
    this.dispatchEvent(new CustomEvent<KtcAssociatedRulePickerActionDetail>(
      KTC_ASSOCIATED_RULE_PICKER_ACTION,
      { bubbles: true, composed: true, detail: { kind: "confirm", rules } },
    ));
    this.closePicker();
  }

  private cancelPicker(): void {
    if (!this.activeModel) return;
    this.dispatchEvent(new CustomEvent<KtcAssociatedRulePickerActionDetail>(
      KTC_ASSOCIATED_RULE_PICKER_ACTION,
      { bubbles: true, composed: true, detail: { kind: "cancel" } },
    ));
    this.closePicker();
  }

  private closePicker(): void {
    if (this.dialog?.open) this.dialog.close();
    this.activeModel = undefined;
    this.candidateChecks = [];
    this.customEnabled = undefined;
    this.customSearch = undefined;
    this.customReplace = undefined;
    this.list?.replaceChildren();
  }

  private stopTextInputEnter(event: KeyboardEvent): void {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
  }

  private button(label: string, className: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.onclick = action;
    return button;
  }
}

export function ktcDefineAssociatedRulePicker(
  tagName = KTC_ASSOCIATED_RULE_PICKER_TAG,
): typeof KtcAssociatedRulePicker {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcAssociatedRulePicker;
  customElements.define(tagName, KtcAssociatedRulePicker);
  return KtcAssociatedRulePicker;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-associated-rule-picker": KtcAssociatedRulePicker;
  }
}
