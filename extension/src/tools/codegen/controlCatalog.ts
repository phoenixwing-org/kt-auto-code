import type { KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlCatalogViewModel } from "./controlViewModel.js";
import {
  ktcNextCodegenControlSelection,
  ktcToggleCodegenControlSingleMode,
  type KtcCodegenControlCatalogSelection,
} from "./controlCatalogState.js";

export const KTC_CODEGEN_CONTROL_CATALOG_TAG = "ktc-codegen-control-catalog";

export interface KtcCodegenControlSelectionDetail {
  readonly blockKeys: readonly KtCodegenBlockKey[];
  readonly singleMode: boolean;
}

export interface KtcCodegenControlDisplayDetail {
  readonly showMissingTemplates: boolean;
}

export type KtcCodegenControlOutputDetail =
  | { readonly scope: "all" }
  | { readonly scope: "block"; readonly blockKey: KtCodegenBlockKey };

const STYLE = `
  :host { display: block; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button {
    min-height: 25px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border);
    border-radius: 3px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  .toolbar .spacer { flex: 1 1 auto; }
  .toggle { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .summary, .hint { padding: 5px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .list { max-height: 290px; overflow: auto; scrollbar-gutter: stable; }
  .row { display: grid; grid-template-columns: 22px 26px minmax(0, 1fr) auto auto; align-items: center; gap: 5px; min-height: 36px; padding: 3px 7px; border-bottom: 1px solid var(--vscode-panel-border); }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .legacy-id, .key { color: var(--vscode-descriptionForeground); }
  .copy { min-width: 0; }
  .title, .key { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title { font-weight: 600; }
  .tag { padding: 1px 4px; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-panel-border); border-radius: 999px; font-size: 10px; }
  .output-one { width: 28px; padding: 2px; }
  .templates { grid-column: 3 / -1; display: grid; gap: 4px; padding: 3px 0 6px; }
  .template { margin: 0; padding: 5px 7px; overflow: auto; color: var(--vscode-editor-foreground, var(--vscode-foreground)); background: var(--vscode-textCodeBlock-background); border-radius: 3px; font: 11px/1.4 var(--vscode-editor-font-family, monospace); white-space: pre; }
  :host([mode="compact"]) .list { max-height: 236px; }
  :host([mode="compact"]) .row { grid-template-columns: 22px 24px minmax(0, 1fr) auto; }
  :host([mode="compact"]) .tag, :host([mode="compact"]) .key { display: none; }
  :host([mode="compact"]) .templates { grid-column: 3 / -1; }
  :host([mode="full"]) { display: flex; height: 100%; min-height: 0; overflow: hidden; flex-direction: column; }
  :host([mode="full"]) .list { flex: 1 1 auto; min-height: 0; max-height: none; }
  .empty { padding: 12px 8px; color: var(--vscode-descriptionForeground); text-align: center; }
`;

export class KtcCodegenControlCatalog extends HTMLElement {
  static readonly observedAttributes = ["mode"];
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcCodegenControlCatalogViewModel | undefined;

  get model(): KtcCodegenControlCatalogViewModel | undefined {
    return this.currentModel;
  }

  set model(value: KtcCodegenControlCatalogViewModel | undefined) {
    this.currentModel = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.render();
  }

  private render(): void {
    if (!this.isConnected) return;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const model = this.currentModel;
    if (!model) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "请先打开一份 Codegen JSON。";
      this.root.replaceChildren(style, empty);
      return;
    }

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.setAttribute("aria-label", "控制符目录操作");
    for (const [label, keys] of [
      ["全选", model.presets.all],
      ["全不选", model.presets.none],
      ["C++ only", model.presets.cppOnly],
      ["Field Code", model.presets.fieldCode],
    ] as const) toolbar.append(this.presetButton(label, keys));

    const spacer = document.createElement("span");
    spacer.className = "spacer";
    const missingLabel = document.createElement("label");
    missingLabel.className = "toggle";
    const missing = document.createElement("input");
    missing.type = "checkbox";
    missing.checked = model.showMissingTemplates;
    missing.setAttribute("aria-label", "显示已选但未命中的控制符模板");
    missing.onchange = () => {
      this.currentModel = { ...model, showMissingTemplates: missing.checked };
      this.emit<KtcCodegenControlDisplayDetail>("ktc-codegen-control-display-change", {
        showMissingTemplates: missing.checked,
      });
      this.render();
    };
    missingLabel.append(missing, "显示缺失模板");
    const outputAll = document.createElement("button");
    outputAll.type = "button";
    outputAll.textContent = "全部输出到日志";
    outputAll.title = "输出当前 Param 的全部 32 个控制符模板到 KT Auto Code 日志";
    outputAll.onclick = () => this.emit<KtcCodegenControlOutputDetail>(
      "ktc-codegen-control-output",
      { scope: "all" },
    );
    const single = document.createElement("button");
    single.type = "button";
    single.textContent = "单选";
    single.setAttribute("aria-pressed", String(model.singleSelectionMode));
    single.onclick = () => this.applySelection(ktcToggleCodegenControlSingleMode(this.selection()));
    toolbar.append(spacer, missingLabel, outputAll, single);

    const summary = document.createElement("div");
    summary.className = "summary";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    summary.textContent = `${model.selectedBlockKeys.length} / ${model.blocks.length} 已选`
      + (model.showMissingTemplates && model.preflightAvailable
        ? ` · ${model.missingTemplates.length} 组缺失模板`
        : "");

    const fragment = document.createDocumentFragment();
    if (model.showMissingTemplates && !model.preflightAvailable) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "尚未预检；可先运行预检定位缺失项，或直接使用“全部输出到日志”。";
      fragment.append(hint);
    }
    const list = document.createElement("div");
    list.className = "list";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Codegen 控制符目录");
    const selected = new Set(model.selectedBlockKeys);
    for (const block of model.blocks) {
      const row = document.createElement("div");
      row.className = "row";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selected.has(block.key);
      check.setAttribute("aria-label", `选择 ${block.title} 参与预检和 Apply`);
      check.onchange = () => this.applySelection(ktcNextCodegenControlSelection(
        this.selection(), block.key, check.checked,
      ));
      const id = document.createElement("span");
      id.className = "legacy-id";
      id.textContent = String(block.legacyId);
      const copy = document.createElement("span");
      copy.className = "copy";
      copy.title = block.notes;
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = block.title;
      const key = document.createElement("span");
      key.className = "key";
      key.textContent = block.controlWords;
      copy.append(title, key);
      const platform = document.createElement("span");
      platform.className = "tag";
      platform.textContent = block.platform;
      const output = document.createElement("button");
      output.type = "button";
      output.className = "output-one";
      output.textContent = "↗";
      output.title = `输出${block.title}控制符模板到日志`;
      output.setAttribute("aria-label", output.title);
      output.onclick = () => this.emit<KtcCodegenControlOutputDetail>(
        "ktc-codegen-control-output",
        { scope: "block", blockKey: block.key },
      );
      row.append(check, id, copy, platform, output);

      const templates = model.showMissingTemplates
        ? model.missingTemplates.filter((template) => template.blockKey === block.key)
        : [];
      if (templates.length) {
        const container = document.createElement("div");
        container.className = "templates";
        for (const template of templates) {
          const pre = document.createElement("pre");
          pre.className = "template";
          pre.setAttribute("aria-label", `${block.title}，${template.classId} 缺失模板`);
          pre.textContent = `${template.classId}\n${template.start}\n${template.end}`;
          container.append(pre);
        }
        row.append(container);
      }
      list.append(row);
    }
    fragment.append(list);
    this.root.replaceChildren(style, toolbar, summary, fragment);
  }

  private presetButton(label: string, blockKeys: readonly KtCodegenBlockKey[]): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = () => this.applySelection({ blockKeys, singleMode: false });
    return button;
  }

  private selection(): KtcCodegenControlCatalogSelection {
    return {
      blockKeys: this.currentModel?.selectedBlockKeys ?? [],
      singleMode: Boolean(this.currentModel?.singleSelectionMode),
    };
  }

  private applySelection(next: KtcCodegenControlCatalogSelection): void {
    const model = this.currentModel;
    if (!model) return;
    this.currentModel = {
      ...model,
      selectedBlockKeys: [...next.blockKeys],
      singleSelectionMode: next.singleMode,
    };
    this.emit<KtcCodegenControlSelectionDetail>("ktc-codegen-control-selection-change", {
      blockKeys: next.blockKeys,
      singleMode: next.singleMode,
    });
    this.render();
  }

  private emit<T>(type: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { bubbles: true, composed: true, detail }));
  }
}

export function ktcDefineCodegenControlCatalog(
  tagName = KTC_CODEGEN_CONTROL_CATALOG_TAG,
): typeof KtcCodegenControlCatalog {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcCodegenControlCatalog;
  customElements.define(tagName, KtcCodegenControlCatalog);
  return KtcCodegenControlCatalog;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-codegen-control-catalog": KtcCodegenControlCatalog;
  }
}
