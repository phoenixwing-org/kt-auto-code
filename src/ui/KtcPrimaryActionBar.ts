export interface KtcPrimaryActionBarModel {
  readonly label: string;
  readonly actions: readonly {
    readonly id: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly primary?: boolean;
    readonly title?: string;
  }[];
}

export interface KtcPrimaryActionBarActionDetail {
  readonly actionId: string;
}

export const KTC_PRIMARY_ACTION_BAR_TAG = "ktc-primary-action-bar";
export const KTC_PRIMARY_ACTION_BAR_ACTION = "ktc-primary-action-bar-action";

const STYLE = `
  :host {
    display: block;
    width: 100%;
    min-width: 0;
    color: var(--vscode-foreground);
    font: var(--vscode-font-size, 13px)/16px var(--vscode-font-family, system-ui);
  }
  :host([hidden]) { display: none !important; }
  * { box-sizing: border-box; }
  .bar {
    display: flex;
    width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .action-slot { display: inline-flex; flex: 0 0 auto; min-width: 0; }
  button {
    min-height: 30px;
    padding: 3px 8px;
    border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    background: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
    font: inherit;
    white-space: nowrap;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button.is-primary {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  button.is-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: .5; cursor: default; }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (forced-colors: active) {
    .bar, button { border-color: CanvasText; }
    button:disabled { opacity: 1; color: GrayText; }
  }
`;

interface KtcPrimaryActionBarRecord {
  readonly slot: HTMLSpanElement;
  readonly button: HTMLButtonElement;
  readonly description: HTMLSpanElement;
  readonly actionId: string;
}

let nextPrimaryActionBarId = 1;

/** Host-neutral compact text actions for one Primary content block. */
export class KtcPrimaryActionBar extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private readonly bar = document.createElement("div");
  private readonly records = new Map<string, KtcPrimaryActionBarRecord>();
  private readonly instanceId = nextPrimaryActionBarId++;
  private nextDescriptionId = 1;
  private current: KtcPrimaryActionBarModel = { label: "操作", actions: [] };

  constructor() {
    super();
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.bar.className = "bar";
    this.bar.setAttribute("role", "group");
    this.root.append(style, this.bar);
  }

  connectedCallback(): void {
    if (Object.prototype.hasOwnProperty.call(this, "model")) {
      const model = (this as unknown as { model?: KtcPrimaryActionBarModel }).model;
      delete (this as unknown as { model?: KtcPrimaryActionBarModel }).model;
      if (model) this.model = model;
      return;
    }
    this.render();
  }

  set model(value: KtcPrimaryActionBarModel) {
    this.current = value;
    this.render();
  }

  get model(): KtcPrimaryActionBarModel {
    return this.current;
  }

  private render(): void {
    this.bar.setAttribute("aria-label", this.current.label.trim() || "操作");
    const occurrences = new Map<string, number>();
    const desired: KtcPrimaryActionBarRecord[] = [];
    for (const action of this.current.actions) {
      const occurrence = occurrences.get(action.id) ?? 0;
      occurrences.set(action.id, occurrence + 1);
      const key = `${action.id}\u0000${occurrence}`;
      let record = this.records.get(key);
      if (!record) {
        record = this.createRecord(action.id);
        this.records.set(key, record);
      }
      record.button.textContent = action.label;
      record.button.disabled = !action.enabled;
      record.button.classList.toggle("is-primary", action.primary === true);
      const description = action.title?.trim()
        || (action.enabled ? "" : `${action.label}当前不可用`);
      record.slot.title = description;
      record.button.title = action.enabled ? description : "";
      record.description.textContent = description;
      if (!action.enabled && description) {
        record.button.setAttribute("aria-describedby", record.description.id);
      } else {
        record.button.removeAttribute("aria-describedby");
      }
      desired.push(record);
    }

    const desiredKeys = new Set(desired);
    for (const [key, record] of this.records) {
      if (desiredKeys.has(record)) continue;
      record.slot.remove();
      this.records.delete(key);
    }
    for (let index = 0; index < desired.length; index += 1) {
      const slot = desired[index]!.slot;
      const current = this.bar.children.item(index);
      if (current !== slot) this.bar.insertBefore(slot, current);
    }
  }

  private createRecord(actionId: string): KtcPrimaryActionBarRecord {
    const slot = document.createElement("span");
    slot.className = "action-slot";
    const button = document.createElement("button");
    button.type = "button";
    const description = document.createElement("span");
    description.className = "sr-only";
    description.id = `ktc-primary-action-${this.instanceId}-${this.nextDescriptionId++}`;
    button.addEventListener("click", () => {
      if (button.disabled) return;
      this.dispatchEvent(new CustomEvent<KtcPrimaryActionBarActionDetail>(KTC_PRIMARY_ACTION_BAR_ACTION, {
        detail: { actionId },
        bubbles: true,
        composed: true,
      }));
    });
    slot.append(button, description);
    return { slot, button, description, actionId };
  }
}

export function ktcDefinePrimaryActionBar(): void {
  if (!customElements.get(KTC_PRIMARY_ACTION_BAR_TAG)) {
    customElements.define(KTC_PRIMARY_ACTION_BAR_TAG, KtcPrimaryActionBar);
  }
}

export function ktcCreatePrimaryActionBar(
  model: KtcPrimaryActionBarModel,
  onAction: (actionId: string) => void,
): KtcPrimaryActionBar {
  ktcDefinePrimaryActionBar();
  const bar = document.createElement(KTC_PRIMARY_ACTION_BAR_TAG) as KtcPrimaryActionBar;
  bar.model = model;
  bar.addEventListener(KTC_PRIMARY_ACTION_BAR_ACTION, (event) => {
    onAction((event as CustomEvent<KtcPrimaryActionBarActionDetail>).detail.actionId);
  });
  return bar;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-primary-action-bar": KtcPrimaryActionBar;
  }
}
