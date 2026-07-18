import type { KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlCatalogViewModel } from "./controlViewModel.js";
import {
  ktcFilterCodegenControlBlocks,
  ktcNextCodegenControlSelection,
  ktcToggleCodegenControlSingleMode,
  type KtcCodegenControlCatalogFilter,
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
  | { readonly scope: "visible"; readonly blockKeys: readonly KtCodegenBlockKey[] }
  | { readonly scope: "block"; readonly blockKey: KtCodegenBlockKey };

const STYLE = `
  :host { display: block; min-height: 0; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button {
    min-height: 25px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border);
    border-radius: 3px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .filters, .toolbar { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; gap: 5px; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  .filters { background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
  .filter-label { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .filter[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
  .toolbar .spacer { flex: 1 1 auto; }
  .toggle { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .selection-tools { position: relative; }
  .selection-tools > summary { min-height: 25px; padding: 3px 7px; list-style: none; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border); border-radius: 3px; cursor: pointer; }
  .selection-tools > summary::-webkit-details-marker { display: none; }
  .selection-tools[open] > .selection-menu { display: flex; }
  .selection-menu { display: none; flex-wrap: wrap; gap: 5px; padding: 5px 0 0; }
  .summary, .hint { flex: 0 0 auto; padding: 5px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .list { max-height: 290px; overflow-x: hidden; overflow-y: scroll; overscroll-behavior: contain; scrollbar-gutter: stable both-edges; scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)) transparent; }
  .list::-webkit-scrollbar { width: 12px; height: 12px; }
  .list::-webkit-scrollbar-track { background: transparent; }
  .list::-webkit-scrollbar-thumb { min-height: 28px; background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)); border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
  .list::-webkit-scrollbar-thumb:hover { background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, .9)); }
  .row { display: grid; grid-template-columns: 22px 26px minmax(0, 1fr) auto auto auto; align-items: center; gap: 5px; min-height: 36px; padding: 3px 7px; border-bottom: 1px solid var(--vscode-panel-border); }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .legacy-id, .key { color: var(--vscode-descriptionForeground); }
  .copy { min-width: 0; }
  .title, .key { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title { font-weight: 600; }
  .tag, .state { padding: 1px 4px; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-panel-border); border-radius: 999px; font-size: 10px; white-space: nowrap; }
  .state.hit { color: var(--vscode-testing-iconPassed, #2ea043); border-color: currentColor; }
  .state.missing { color: var(--vscode-editorWarning-foreground, #b89500); border-color: currentColor; }
  .output-one { width: 28px; padding: 2px; }
  .templates { grid-column: 3 / -1; display: grid; gap: 4px; padding: 3px 0 6px; }
  .template { margin: 0; padding: 5px 7px; overflow: auto; color: var(--vscode-editor-foreground, var(--vscode-foreground)); background: var(--vscode-textCodeBlock-background); border-radius: 3px; font: 11px/1.4 var(--vscode-editor-font-family, monospace); white-space: pre; }
  :host([mode="compact"]) .list { max-height: 236px; }
  :host([mode="compact"]) .row { grid-template-columns: 22px 24px minmax(0, 1fr) auto auto; }
  :host([mode="compact"]) .tag, :host([mode="compact"]) .key { display: none; }
  :host([mode="compact"]) .templates { grid-column: 3 / -1; }
  :host([mode="full"]) { display: flex; block-size: 100%; min-block-size: 0; overflow: hidden; flex-direction: column; }
  :host([mode="full"]) .list { flex: 1 1 0; min-block-size: 0; max-height: none; }
  .empty { padding: 12px 8px; color: var(--vscode-descriptionForeground); text-align: center; }
`;

export class KtcCodegenControlCatalog extends HTMLElement {
  static readonly observedAttributes = ["mode"];
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcCodegenControlCatalogViewModel | undefined;
  private filter: KtcCodegenControlCatalogFilter = { status: "selected", scope: "all" };

  get model(): KtcCodegenControlCatalogViewModel | undefined {
    return this.currentModel;
  }

  set model(value: KtcCodegenControlCatalogViewModel | undefined) {
    const gainedPreflight = !this.currentModel?.preflightAvailable && Boolean(value?.preflightAvailable);
    const lostPreflight = Boolean(this.currentModel?.preflightAvailable) && !value?.preflightAvailable;
    if (gainedPreflight) this.filter = { ...this.filter, status: "hit" };
    else if (!value?.preflightAvailable && (lostPreflight || !this.currentModel)) {
      this.filter = { ...this.filter, status: "selected" };
    }
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

    const visibleBlocks = this.visibleBlocks(model);
    const filters = document.createElement("div");
    filters.className = "filters";
    filters.setAttribute("aria-label", "控制符显示筛选，不改变预检和 Apply 选择");
    filters.append(this.label("显示"));
    for (const [status, label] of [
      ["hit", "命中"],
      ["missing", "未命中"],
      ["selected", "已选"],
      ["all", "全部"],
    ] as const) {
      filters.append(this.filterButton(
        `${label} ${this.visibleBlocks(model, { ...this.filter, status }).length}`,
        this.filter.status === status,
        () => this.setFilter({ status }),
      ));
    }
    filters.append(this.label("范围"));
    for (const [scope, label] of [
      ["all", "全部类型"],
      ["cpp-only", "C++ only"],
      ["field-code", "Field Code"],
    ] as const) {
      filters.append(this.filterButton(
        label,
        this.filter.scope === scope,
        () => this.setFilter({ scope }),
      ));
    }

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.setAttribute("aria-label", "控制符输出与低频选择工具");
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
    missingLabel.append(missing, "展开缺失模板");
    const outputVisible = document.createElement("button");
    outputVisible.type = "button";
    outputVisible.textContent = `输出筛选并复制 (${visibleBlocks.length})`;
    outputVisible.disabled = visibleBlocks.length === 0;
    outputVisible.title = "只输出当前筛选可见的控制块到日志，并复制可粘贴源码；不改变预检和 Apply 选择";
    outputVisible.onclick = () => this.emit<KtcCodegenControlOutputDetail>(
      "ktc-codegen-control-output",
      { scope: "visible", blockKeys: visibleBlocks.map((block) => block.key) },
    );
    const selectionTools = document.createElement("details");
    selectionTools.className = "selection-tools";
    const selectionSummary = document.createElement("summary");
    selectionSummary.textContent = `选择工具 · ${model.selectedBlockKeys.length}`;
    selectionSummary.title = "低频操作：修改参与 Preflight/Apply 的勾选范围";
    const selectionMenu = document.createElement("div");
    selectionMenu.className = "selection-menu";
    const selected = new Set(model.selectedBlockKeys);
    selectionMenu.append(
      this.selectionButton("选中当前筛选", () => this.applySelection({
        blockKeys: [...new Set([...model.selectedBlockKeys, ...visibleBlocks.map((block) => block.key)])],
        singleMode: false,
      })),
      this.selectionButton("取消当前筛选", () => this.applySelection({
        blockKeys: model.selectedBlockKeys.filter((key) => !visibleBlocks.some((block) => block.key === key)),
        singleMode: model.singleSelectionMode,
      })),
      this.selectionButton("全选", () => this.applySelection({ blockKeys: model.presets.all, singleMode: false })),
      this.selectionButton("全不选", () => this.applySelection({ blockKeys: model.presets.none, singleMode: false })),
      this.selectionButton(model.singleSelectionMode ? "关闭单选" : "开启单选", () => {
        this.applySelection(ktcToggleCodegenControlSingleMode(this.selection()));
      }),
    );
    selectionTools.append(selectionSummary, selectionMenu);
    toolbar.append(outputVisible, spacer, missingLabel, selectionTools);

    const summary = document.createElement("div");
    summary.className = "summary";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    summary.textContent = `${visibleBlocks.length} / ${model.blocks.length} 显示 · ${model.selectedBlockKeys.length} 已选`
      + (model.showMissingTemplates && model.preflightAvailable
        ? ` · ${model.missingTemplates.length} 组缺失模板`
        : "");

    const fragment = document.createDocumentFragment();
    if (model.showMissingTemplates && !model.preflightAvailable) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = "尚未预检；可先运行预检定位缺失项，或输出当前筛选。显示筛选不会修改 Apply 勾选。";
      fragment.append(hint);
    }
    const list = document.createElement("div");
    list.className = "list";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Codegen 控制符目录");
    for (const block of visibleBlocks) {
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
      const state = document.createElement("span");
      state.className = `state ${block.status}`;
      state.textContent = this.statusLabel(block.status, block.hitCount);
      const output = document.createElement("button");
      output.type = "button";
      output.className = "output-one";
      output.textContent = "⧉";
      output.title = `按当前已打开 JSON 的真实数据输出${block.title}控制块到日志并复制可粘贴源码`;
      output.setAttribute("aria-label", output.title);
      output.onclick = () => this.emit<KtcCodegenControlOutputDetail>(
        "ktc-codegen-control-output",
        { scope: "block", blockKey: block.key },
      );
      row.append(check, id, copy, state, platform, output);

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
    if (!visibleBlocks.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = model.preflightAvailable && this.filter.status === "hit"
        ? "当前筛选没有命中的控制符；可切换到“未命中”或“全部”。"
        : "当前筛选没有控制符。";
      list.append(empty);
    }
    fragment.append(list);
    this.root.replaceChildren(style, filters, toolbar, summary, fragment);
  }

  private label(text: string): HTMLElement {
    const label = document.createElement("span");
    label.className = "filter-label";
    label.textContent = text;
    return label;
  }

  private filterButton(label: string, pressed: boolean, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(pressed));
    button.onclick = action;
    return button;
  }

  private selectionButton(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = action;
    return button;
  }

  private setFilter(next: Partial<KtcCodegenControlCatalogFilter>): void {
    this.filter = { ...this.filter, ...next };
    this.render();
  }

  private visibleBlocks(
    model: KtcCodegenControlCatalogViewModel,
    filter = this.filter,
  ): readonly KtcCodegenControlCatalogViewModel["blocks"][number][] {
    return ktcFilterCodegenControlBlocks(model.blocks, model.selectedBlockKeys, filter, model.presets);
  }

  private statusLabel(
    status: KtcCodegenControlCatalogViewModel["blocks"][number]["status"],
    hitCount: number,
  ): string {
    if (status === "hit") return `${hitCount} 命中`;
    if (status === "missing") return "未命中";
    if (status === "pending") return "待预检";
    return "未选择";
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
    const before = new Set(model.selectedBlockKeys);
    const after = new Set(next.blockKeys);
    const selectionChanged = before.size !== after.size || [...before].some((key) => !after.has(key));
    this.currentModel = {
      ...model,
      selectedBlockKeys: [...next.blockKeys],
      singleSelectionMode: next.singleMode,
      ...(selectionChanged ? {
        preflightAvailable: false,
        missingTemplates: [],
        blocks: model.blocks.map((block) => ({
          ...block,
          status: after.has(block.key) ? "pending" as const : "unselected" as const,
          hitCount: 0,
          artifactCount: 0,
        })),
      } : {}),
    };
    if (selectionChanged) this.filter = { ...this.filter, status: "selected" };
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
