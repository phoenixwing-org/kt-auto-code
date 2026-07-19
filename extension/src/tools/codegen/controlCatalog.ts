import type { KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlCatalogViewModel } from "./controlViewModel.js";
import {
  KTC_CODEGEN_CONTROL_GROUPS,
  ktcCodegenControlVisibleSelectionState,
  ktcFilterCodegenControlBlocks,
  ktcGroupCodegenControlBlocks,
  ktcNextCodegenControlSelection,
  ktcNextCodegenControlVisibleSelection,
  type KtcCodegenControlCatalogFilter,
  type KtcCodegenControlCatalogSelection,
  type KtcCodegenControlGroupId,
  type KtcCodegenControlScopeFilter,
} from "./controlCatalogState.js";

export const KTC_CODEGEN_CONTROL_CATALOG_TAG = "ktc-codegen-control-catalog";

export interface KtcCodegenControlSelectionDetail {
  readonly blockKeys: readonly KtCodegenBlockKey[];
  readonly singleMode: boolean;
}

export type KtcCodegenControlOutputDetail =
  | { readonly scope: "visible"; readonly blockKeys: readonly KtCodegenBlockKey[] }
  | { readonly scope: "block"; readonly blockKey: KtCodegenBlockKey };

const STYLE = `
  :host { display: block; min-height: 0; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input, select { font: inherit; }
  button {
    min-height: 25px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border);
    border-radius: 3px; cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .filters, .toolbar { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; gap: 5px; padding: 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  .filters { background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); }
  .filter-label { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .filter[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
  .scope-filter { min-height: 25px; padding: 2px 24px 2px 7px; color: var(--vscode-dropdown-foreground, var(--vscode-foreground)); background: var(--vscode-dropdown-background, var(--vscode-input-background)); border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); border-radius: 3px; }
  .summary, .hint { flex: 0 0 auto; padding: 5px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .list { max-height: 290px; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable both-edges; scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)) transparent; }
  .list::-webkit-scrollbar { width: 12px; height: 12px; }
  .list::-webkit-scrollbar-track { background: transparent; }
  .list::-webkit-scrollbar-thumb { min-height: 28px; background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)); border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
  .list::-webkit-scrollbar-thumb:hover { background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, .9)); }
  .group { border-bottom: 1px solid var(--vscode-panel-border); }
  .group:last-child { border-bottom: 0; }
  .group > summary { display: flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 8px; color: var(--vscode-foreground); background: var(--vscode-sideBarSectionHeader-background, var(--vscode-editorWidget-background)); cursor: pointer; user-select: none; }
  .group > summary:hover { background: var(--vscode-list-hoverBackground); }
  .group > summary::marker { color: var(--vscode-descriptionForeground); }
  .group-check { flex: 0 0 auto; margin: 0; }
  .group-title { font-weight: 700; }
  .group-count { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 400; white-space: nowrap; }
  .group-list { border-top: 1px solid var(--vscode-panel-border); }
  .row { display: grid; grid-template-columns: 22px 26px minmax(0, 1fr) auto auto auto; align-items: center; gap: 5px; min-height: 36px; padding: 3px 7px 3px 20px; border-bottom: 1px solid var(--vscode-panel-border); }
  .row:last-child { border-bottom: 0; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .legacy-id, .key { color: var(--vscode-descriptionForeground); }
  .copy { min-width: 0; }
  .title-line { display: flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; white-space: nowrap; }
  .title, .key { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .title { min-width: 0; font-weight: 600; }
  .title-separator { flex: 0 0 auto; color: var(--vscode-descriptionForeground); }
  .badges { display: flex; align-items: center; justify-content: flex-end; gap: 3px; }
  .tag, .state { padding: 1px 4px; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-panel-border); border-radius: 999px; font-size: 10px; white-space: nowrap; }
  .tag.legacy { color: var(--vscode-editorWarning-foreground, #b89500); border-color: currentColor; }
  .inline-legacy { flex: 0 0 auto; }
  .state.hit { color: var(--vscode-testing-iconPassed, #2ea043); border-color: currentColor; }
  .state.unclosed { color: var(--vscode-errorForeground, #f14c4c); border-color: currentColor; }
  .state.missing { color: var(--vscode-editorWarning-foreground, #b89500); border-color: currentColor; }
  .output-one { width: 28px; padding: 2px; }
  :host([mode="compact"]) .list { max-height: 236px; overflow-y: auto; }
  :host([mode="compact"]) .row { grid-template-columns: 22px 24px minmax(0, 1fr) auto auto; }
  :host([mode="compact"]) .badges, :host([mode="compact"]) .key { display: none; }
  :host([mode="compact"]) .group-count { white-space: normal; text-align: right; }
  :host([mode="full"]) { display: flex; block-size: auto; min-block-size: 0; overflow: visible; flex-direction: column; }
  :host([mode="full"]) .list { flex: 0 0 auto; min-block-size: 0; max-height: none; overflow: visible; }
  .empty { padding: 12px 8px; color: var(--vscode-descriptionForeground); text-align: center; }
`;

export class KtcCodegenControlCatalog extends HTMLElement {
  static readonly observedAttributes = ["mode"];
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcCodegenControlCatalogViewModel | undefined;
  private filter: KtcCodegenControlCatalogFilter = { status: "all", scope: "all" };
  private listScrollTop = 0;
  private focusedBlockKey: KtCodegenBlockKey | undefined;
  private focusAfterRender: HTMLInputElement | undefined;
  private readonly rowChecks = new Map<KtCodegenBlockKey, HTMLInputElement>();
  private readonly groupSelection = new Map<KtcCodegenControlGroupId, {
    readonly check: HTMLInputElement;
    readonly count: HTMLElement;
    readonly visibleBlockKeys: readonly KtCodegenBlockKey[];
    readonly totalCount: number;
  }>();
  private selectionSummaryNode: HTMLElement | undefined;
  private readonly expandedGroups = new Set<KtcCodegenControlGroupId>(
    KTC_CODEGEN_CONTROL_GROUPS.map((group) => group.id),
  );
  get model(): KtcCodegenControlCatalogViewModel | undefined {
    return this.currentModel;
  }

  set model(value: KtcCodegenControlCatalogViewModel | undefined) {
    const previous = this.currentModel;
    const gainedPreflight = !this.currentModel?.preflightAvailable && Boolean(value?.preflightAvailable);
    if (gainedPreflight) this.filter = { ...this.filter, status: "hit" };
    this.currentModel = value;
    if (previous && value && this.canPatchSelection(previous, value)) {
      this.syncSelectionPresentation();
      return;
    }
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
    this.focusAfterRender = undefined;
    this.rowChecks.clear();
    this.groupSelection.clear();
    this.selectionSummaryNode = undefined;
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
    const selected = new Set(model.selectedBlockKeys);
    const canonicalBlockKeys = this.canonicalBlockKeys(model);
    const filters = document.createElement("div");
    filters.className = "filters";
    filters.setAttribute("aria-label", "控制符显示筛选，不改变预检和 Apply 选择");
    filters.append(this.label("显示"));
    if (model.preflightAvailable) {
      for (const [status, label] of [
        ["hit", "命中"],
        ["unclosed", "未闭合"],
        ["missing", "未命中"],
        ["all", "全部"],
      ] as const) {
        filters.append(this.filterButton(
          `${label} ${this.visibleBlocks(model, { ...this.filter, status }).length}`,
          this.filter.status === status,
          () => this.setFilter({ status }),
        ));
      }
    } else {
      filters.append(this.label("尚未预检"));
    }
    filters.append(this.label("范围"));
    const scopeFilter = document.createElement("select");
    scopeFilter.className = "scope-filter";
    scopeFilter.setAttribute("aria-label", "控制符范围");
    for (const [scope, label] of [
      ["all", "全部类型"],
      ["cpp-only", "C++ only"],
      ["field-code", "Field Code"],
    ] as const) {
      const option = document.createElement("option");
      option.value = scope;
      option.textContent = label;
      scopeFilter.append(option);
    }
    scopeFilter.value = this.filter.scope;
    scopeFilter.onchange = () => this.setFilter({
      scope: scopeFilter.value as KtcCodegenControlScopeFilter,
    });
    filters.append(scopeFilter);

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.setAttribute("aria-label", "控制符输出");
    const outputVisible = document.createElement("button");
    outputVisible.type = "button";
    outputVisible.textContent = `输出筛选并复制 (${visibleBlocks.length})`;
    outputVisible.disabled = visibleBlocks.length === 0;
    outputVisible.title = "只输出当前筛选可见的控制块到日志，并复制可粘贴源码；不改变预检和 Apply 选择";
    outputVisible.onclick = () => this.emit<KtcCodegenControlOutputDetail>(
      "ktc-codegen-control-output",
      { scope: "visible", blockKeys: visibleBlocks.map((block) => block.key) },
    );
    toolbar.append(outputVisible);

    const summary = document.createElement("div");
    summary.className = "summary";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    this.selectionSummaryNode = summary;
    summary.textContent = `${visibleBlocks.length} / ${model.blocks.length} 显示 · ${model.selectedBlockKeys.length} 已选`;

    const fragment = document.createDocumentFragment();
    const list = document.createElement("div");
    list.className = "list";
    list.tabIndex = 0;
    list.onscroll = () => { this.listScrollTop = list.scrollTop; };
    list.setAttribute("role", "tree");
    list.setAttribute("aria-label", "Codegen 控制符目录");
    const allGroups = ktcGroupCodegenControlBlocks(model.blocks);
    const visibleGroups = ktcGroupCodegenControlBlocks(visibleBlocks);
    for (const group of allGroups) {
      const groupVisible = visibleGroups.find((candidate) => candidate.id === group.id)?.blocks ?? [];
      if (!groupVisible.length) continue;
      const groupVisibleKeys = groupVisible.map((block) => block.key);
      const groupState = ktcCodegenControlVisibleSelectionState(groupVisibleKeys, model.selectedBlockKeys);
      const details = document.createElement("details");
      details.className = "group";
      details.open = this.expandedGroups.has(group.id);
      details.setAttribute("data-group-id", group.id);
      details.setAttribute("role", "treeitem");
      details.setAttribute("aria-expanded", String(details.open));
      details.ontoggle = () => {
        if (details.open) this.expandedGroups.add(group.id);
        else this.expandedGroups.delete(group.id);
        details.setAttribute("aria-expanded", String(details.open));
      };
      const header = document.createElement("summary");
      const groupCheck = document.createElement("input");
      groupCheck.type = "checkbox";
      groupCheck.className = "group-check";
      groupCheck.checked = groupState.checked;
      groupCheck.indeterminate = groupState.indeterminate;
      groupCheck.disabled = groupState.disabled;
      groupCheck.setAttribute("aria-label", `选择 ${group.label} 当前可见控制符`);
      groupCheck.onclick = (event) => event.stopPropagation();
      groupCheck.onchange = () => this.applySelection(ktcNextCodegenControlVisibleSelection(
        this.selection(),
        groupVisible.map((block) => block.key),
        groupCheck.checked,
        canonicalBlockKeys,
      ));
      const groupTitle = document.createElement("span");
      groupTitle.className = "group-title";
      groupTitle.textContent = group.label;
      const groupCount = document.createElement("span");
      groupCount.className = "group-count";
      groupCount.textContent = `显示 ${groupState.visibleCount}/${group.blocks.length} · 可见已选 ${groupState.selectedCount}/${groupState.visibleCount}`;
      this.groupSelection.set(group.id, {
        check: groupCheck,
        count: groupCount,
        visibleBlockKeys: groupVisibleKeys,
        totalCount: group.blocks.length,
      });
      header.append(groupCheck, groupTitle, groupCount);
      const groupList = document.createElement("div");
      groupList.className = "group-list";
      groupList.setAttribute("role", "group");
      for (const block of groupVisible) groupList.append(this.blockRow(block, model, selected));
      details.append(header, groupList);
      list.append(details);
    }
    if (!visibleBlocks.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = model.preflightAvailable && this.filter.status === "hit"
        ? "当前筛选没有命中的控制符；可切换到“未闭合”或“未命中”。"
        : "当前筛选没有控制符。";
      list.append(empty);
    }
    fragment.append(list);
    this.root.replaceChildren(style, filters, toolbar, summary, fragment);
    // Detached element 的 scrollTop 会被真实 Webview 布局丢弃；必须接回 Shadow DOM 后恢复。
    list.scrollTop = this.listScrollTop;
    this.restoreFocusAfterRender();
  }

  private restoreFocusAfterRender(): void {
    this.focusAfterRender?.focus({ preventScroll: true });
    this.focusAfterRender = undefined;
  }

  private blockRow(
    block: KtcCodegenControlCatalogViewModel["blocks"][number],
    model: KtcCodegenControlCatalogViewModel,
    selected: ReadonlySet<KtCodegenBlockKey>,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute("role", "treeitem");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selected.has(block.key);
    check.setAttribute("aria-label", `选择 ${block.title} 参与预检和 Apply`);
    check.setAttribute("data-block-key", block.key);
    this.rowChecks.set(block.key, check);
    check.onfocus = () => { this.focusedBlockKey = block.key; };
    check.onblur = () => {
      if (this.focusedBlockKey === block.key) this.focusedBlockKey = undefined;
    };
    check.onchange = () => {
      this.focusedBlockKey = block.key;
      this.applySelection(ktcNextCodegenControlSelection(
        this.selection(), block.key, check.checked,
      ));
    };
    if (this.focusedBlockKey === block.key) this.focusAfterRender = check;
    const id = document.createElement("span");
    id.className = "legacy-id";
    id.textContent = `#${block.legacyId}`;
    const copy = document.createElement("span");
    copy.className = "copy";
    copy.title = block.notes;
    const titleLine = document.createElement("span");
    titleLine.className = "title-line";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = block.title;
    titleLine.append(title);
    if (block.legacyState === "legacy-deprecated") {
      const separator = document.createElement("span");
      separator.className = "title-separator";
      separator.textContent = "·";
      const legacy = document.createElement("span");
      legacy.className = "tag legacy inline-legacy";
      legacy.textContent = "旧兼容";
      legacy.title = "保留用于旧项目兼容";
      titleLine.append(separator, legacy);
    }
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = block.controlWords;
    copy.append(titleLine, key);
    const state = document.createElement("span");
    state.className = `state ${block.status}`;
    state.textContent = this.statusLabel(block.status, block.hitCount);
    const badges = document.createElement("span");
    badges.className = "badges";
    const platform = document.createElement("span");
    platform.className = "tag";
    platform.textContent = block.platform.toUpperCase();
    badges.append(platform);
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
    row.append(check, id, copy, state, badges, output);

    return row;
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

  private setFilter(next: Partial<KtcCodegenControlCatalogFilter>): void {
    this.filter = { ...this.filter, ...next };
    this.render();
  }

  private visibleBlocks(
    model: KtcCodegenControlCatalogViewModel,
    filter = this.filter,
  ): readonly KtcCodegenControlCatalogViewModel["blocks"][number][] {
    return [...ktcFilterCodegenControlBlocks(
      model.blocks, model.selectedBlockKeys, filter, model.presets,
    )].sort((left, right) => left.legacyId - right.legacyId);
  }

  private canonicalBlockKeys(
    model: KtcCodegenControlCatalogViewModel,
  ): readonly KtCodegenBlockKey[] {
    return [...model.blocks]
      .sort((left, right) => left.legacyId - right.legacyId)
      .map((block) => block.key);
  }

  private statusLabel(
    status: KtcCodegenControlCatalogViewModel["blocks"][number]["status"],
    hitCount: number,
  ): string {
    if (status === "hit") return `${hitCount} 命中`;
    if (status === "unclosed") return "未闭合";
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
    const requested = new Set(next.blockKeys);
    const orderedNext: KtcCodegenControlCatalogSelection = {
      blockKeys: this.canonicalBlockKeys(model).filter((key) => requested.has(key)),
      singleMode: next.singleMode,
    };
    this.currentModel = {
      ...model,
      selectedBlockKeys: [...orderedNext.blockKeys],
      singleSelectionMode: orderedNext.singleMode,
    };
    this.emit<KtcCodegenControlSelectionDetail>("ktc-codegen-control-selection-change", {
      blockKeys: orderedNext.blockKeys,
      singleMode: orderedNext.singleMode,
    });
    this.syncSelectionPresentation();
  }

  private syncSelectionPresentation(): void {
    const model = this.currentModel;
    if (!model) return;
    const selected = new Set(model.selectedBlockKeys);
    for (const [blockKey, check] of this.rowChecks) check.checked = selected.has(blockKey);
    for (const binding of this.groupSelection.values()) {
      const state = ktcCodegenControlVisibleSelectionState(binding.visibleBlockKeys, model.selectedBlockKeys);
      binding.check.checked = state.checked;
      binding.check.indeterminate = state.indeterminate;
      binding.check.disabled = state.disabled;
      binding.count.textContent = `显示 ${state.visibleCount}/${binding.totalCount} · 可见已选 ${state.selectedCount}/${state.visibleCount}`;
    }
    if (this.selectionSummaryNode) {
      const visibleCount = this.visibleBlocks(model).length;
      this.selectionSummaryNode.textContent = `${visibleCount} / ${model.blocks.length} 显示 · ${model.selectedBlockKeys.length} 已选`;
    }
  }

  private canPatchSelection(
    previous: KtcCodegenControlCatalogViewModel,
    next: KtcCodegenControlCatalogViewModel,
  ): boolean {
    if (previous.uri !== next.uri
      || previous.preflightAvailable !== next.preflightAvailable
      || previous.blocks.length !== next.blocks.length) return false;
    if (!this.sameKeys(previous.presets.cppOnly, next.presets.cppOnly)
      || !this.sameKeys(previous.presets.fieldCode, next.presets.fieldCode)) return false;
    return previous.blocks.every((block, index) => {
      const candidate = next.blocks[index];
      return candidate?.key === block.key
        && candidate.status === block.status
        && candidate.hitCount === block.hitCount
        && candidate.artifactCount === block.artifactCount;
    });
  }

  private sameKeys(left: readonly KtCodegenBlockKey[], right: readonly KtCodegenBlockKey[]): boolean {
    return left.length === right.length && left.every((key, index) => right[index] === key);
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
