import type { KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlCatalogViewModel, KtcCodegenControlViewModel } from "./controlViewModel.js";
import { ktcClampCodegenControlSplitPercent } from "./editorLayoutState.js";

export const KTC_CODEGEN_CONTROL_PANEL_TAG = "ktc-codegen-control-panel";

export interface KtcCodegenControlOpenDetail {
  readonly path: string;
  readonly line: number;
}

export interface KtcCodegenControlCopyEndDetail extends KtcCodegenControlOpenDetail {
  readonly blockKey: KtCodegenBlockKey;
}

export interface KtcCodegenControlSplitDetail {
  readonly ratio: number;
}

type KtcCodegenControlResultFilter = "hits" | "issues" | "all";
type KtcCodegenPlan = NonNullable<KtcCodegenControlViewModel["preflight"]>["plan"];
type KtcCodegenMarkerRegion = KtcCodegenPlan["markerRegions"][number];
type KtcCodegenDiagnostic = KtcCodegenPlan["diagnostics"][number];

type KtcCodegenResultItem =
  | { readonly kind: "hit"; readonly key: string; readonly region: KtcCodegenMarkerRegion }
  | { readonly kind: "issue"; readonly key: string; readonly diagnostic: KtcCodegenDiagnostic };

const STYLE = `
  :host { display: block; min-width: 0; min-height: 0; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, [tabindex]:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  :host([mode="full"]) { block-size: auto; min-block-size: 0; overflow: visible; }
  .section { min-width: 0; min-height: 0; overflow: visible; }
  .section-title { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-height: 34px; padding: 5px 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); font-size: 11px; font-weight: 650; }
  .section-title .spacer { flex: 1 1 auto; }
  .path-toggle { display: inline-flex; align-items: center; gap: 4px; min-height: 24px; white-space: nowrap; cursor: pointer; }
  .path-toggle input { margin: 0; }
  .filter { min-height: 24px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 3px; }
  .filter:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .filter[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: var(--ktc-ui-border, var(--vscode-button-background)); }
  .preflight-summary { padding: 8px 9px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .result-layout { display: grid; grid-template-columns: minmax(180px, var(--ktc-codegen-result-master, 42%)) 7px minmax(0, 1fr); min-width: 0; align-items: start; overflow: visible; }
  .result-master { min-width: 0; overflow-x: hidden; overflow-y: visible; }
  .result-splitter { position: relative; align-self: stretch; min-height: 100%; cursor: col-resize; touch-action: none; }
  .result-splitter::before { content: ""; position: absolute; inset: 0 3px; background: var(--ktc-ui-border, var(--vscode-panel-border)); }
  .result-splitter:hover::before, .result-splitter:focus-visible::before { background: var(--vscode-focusBorder); }
  .result-list { min-width: 0; overflow-y: visible; }
  .result-row { display: grid; width: 100%; min-width: 0; min-height: 41px; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 6px 9px; color: var(--vscode-foreground); background: transparent; border: 0; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); text-align: left; }
  .result-row:hover { background: var(--vscode-list-hoverBackground); }
  .result-row[aria-pressed="true"] { background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); }
  .result-heading, .detail-heading { display: flex; min-width: 0; align-items: center; gap: 6px; overflow: hidden; }
  .result-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .control-id { flex: 0 0 auto; padding: 1px 4px; color: var(--vscode-descriptionForeground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 999px; font-size: 10px; font-weight: 500; white-space: nowrap; }
  .result-row span { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .result-row .result-name { color: inherit; font-size: inherit; font-weight: inherit; }
  .result-row span.path { overflow-wrap: anywhere; white-space: normal; }
  .result-row.error { border-left: 3px solid var(--vscode-errorForeground); }
  .result-row.warning { border-left: 3px solid var(--vscode-editorWarning-foreground); }
  .result-detail { display: flex; position: sticky; top: var(--ktc-codegen-detail-sticky-top, 58px); align-self: start; min-width: 0; block-size: var(--ktc-codegen-detail-available-height, calc(100vh - 74px)); max-block-size: var(--ktc-codegen-detail-available-height, calc(100vh - 74px)); padding: 10px; overflow: hidden; background: var(--vscode-editor-background); }
  .detail-content { display: flex; flex: 1 1 auto; min-width: 0; min-height: 0; flex-direction: column; }
  .detail-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 6px; padding-bottom: 5px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
  .detail-header h3 { min-width: 0; margin: 0; overflow: hidden; font-size: 13px; }
  .detail-summary, .detail-location, .detail-message { grid-column: 1 / -1; min-width: 0; margin: 0; overflow: hidden; color: var(--vscode-descriptionForeground); text-overflow: ellipsis; white-space: nowrap; }
  .detail-summary { font-size: 10px; }
  .detail-message { color: var(--vscode-foreground); white-space: normal; }
  .detail-actions { display: flex; grid-column: 2; grid-row: 1; flex-wrap: nowrap; gap: 3px; margin: 0; }
  .detail-actions button { min-height: 24px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 3px; white-space: nowrap; }
  .detail-actions button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
  .detail-preview { display: block; flex: 1 1 auto; min-block-size: 120px; margin: 9px 0 0; padding: 9px; overflow: auto; overscroll-behavior: contain; color: var(--vscode-editor-foreground); background: var(--vscode-textCodeBlock-background); border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 5px; font: 12px/1.45 var(--vscode-editor-font-family); white-space: pre; }
  .empty { padding: 22px 12px; color: var(--vscode-descriptionForeground); text-align: center; }
  @media (max-width: 680px) {
    .result-layout { grid-template-columns: minmax(150px, var(--ktc-codegen-result-master, 42%)) 7px minmax(0, 1fr); }
    .result-detail { padding: 8px; }
  }
`;

function fullModel(model: KtcCodegenControlCatalogViewModel): KtcCodegenControlViewModel {
  return model as KtcCodegenControlViewModel;
}

/** Primary compact 控制符目录 / JSON View full 预检结果共用的高层容器。 */
export class KtcCodegenControlPanel extends HTMLElement {
  static readonly observedAttributes = ["mode"];
  private readonly root = this.attachShadow({ mode: "open" });
  /** Primary 重绘时复用同一个目录实例，保留其本地显示筛选。 */
  private readonly catalog = document.createElement("ktc-codegen-control-catalog");
  private currentModel: KtcCodegenControlCatalogViewModel | undefined;
  private resultFilter: KtcCodegenControlResultFilter = "hits";
  private selectedResultKey: string | undefined;
  private currentSplitRatio = 42;
  private showResultPaths = false;

  get splitRatio(): number { return this.currentSplitRatio; }
  set splitRatio(value: number) {
    this.currentSplitRatio = ktcClampCodegenControlSplitPercent(value);
    this.render();
  }

  get model(): KtcCodegenControlCatalogViewModel | undefined { return this.currentModel; }
  set model(value: KtcCodegenControlCatalogViewModel | undefined) {
    if (!this.currentModel?.preflightAvailable && value?.preflightAvailable) {
      this.resultFilter = "hits";
      this.selectedResultKey = undefined;
    }
    this.currentModel = value;
    this.render();
  }

  connectedCallback(): void { this.render(); }
  attributeChangedCallback(): void { this.render(); }

  private render(): void {
    if (!this.isConnected) return;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const model = this.currentModel;
    if (this.getAttribute("mode") !== "full") {
      this.catalog.setAttribute("mode", "compact");
      this.catalog.model = model;
      this.root.replaceChildren(style, this.catalog);
      return;
    }
    const results = document.createElement("section");
    results.className = "section results";
    results.setAttribute("aria-label", "预检结果主从视图：左侧列表，右侧详情");
    results.append(...this.resultNodes(model));
    this.root.replaceChildren(style, results);
  }

  private resultNodes(model: KtcCodegenControlCatalogViewModel | undefined): HTMLElement[] {
    const title = document.createElement("div");
    title.className = "section-title";
    const name = document.createElement("span");
    name.textContent = "预检结果";
    const spacer = document.createElement("span");
    spacer.className = "spacer";
    const cache = document.createElement("span");
    const preflight = model ? fullModel(model).preflight : undefined;
    const plan = preflight?.plan;
    const issueCount = plan?.diagnostics.filter((item) => item.severity !== "info").length ?? 0;
    cache.textContent = preflight
      ? preflight.state === "applied"
        ? "已应用 · 需重新预检"
        : preflight.state === "stale"
          ? "结果已过期 · 需重新预检"
          : preflight.reused ? "缓存计划" : "新计划"
      : "尚未预检";
    if (preflight) cache.title = preflight.message;
    title.append(name, spacer);
    for (const [filter, label, count] of [
      ["hits", "命中", plan?.markerRegions.length ?? 0],
      ["issues", "问题", issueCount],
      ["all", "全部", (plan?.markerRegions.length ?? 0) + issueCount],
    ] as const) title.append(this.filterButton(`${label} ${count}`, filter));
    const pathToggle = document.createElement("label");
    pathToggle.className = "path-toggle";
    pathToggle.title = "仅控制左侧列表是否显示完整源码路径；右侧详情始终保留定位信息";
    const pathCheck = document.createElement("input");
    pathCheck.type = "checkbox";
    pathCheck.checked = this.showResultPaths;
    pathCheck.setAttribute("aria-label", "显示左侧源码路径");
    pathCheck.onchange = () => {
      this.showResultPaths = pathCheck.checked;
      this.render();
    };
    pathToggle.append(pathCheck, "显示路径");
    title.append(pathToggle);
    title.append(cache);

    const summary = document.createElement("div");
    summary.className = "preflight-summary";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    if (!plan || !model) {
      summary.textContent = "尚未预检。可点击页面上方“预检”，或直接点击 Apply 自动预检并写入源码。";
      return [title, summary];
    }
    summary.textContent = `${plan.markerRegions.length} 个区域 · ${plan.artifacts.length} 个产物 · ${plan.diagnostics.length} 条诊断`
      + (preflight?.state === "ready" ? "" : ` · ${preflight?.message ?? "需重新预检"}`);

    const items = this.resultItems(plan);
    const selected = items.find((item) => item.key === this.selectedResultKey) ?? items[0];
    this.selectedResultKey = selected?.key;
    const layout = document.createElement("div");
    layout.className = "result-layout";
    layout.style.setProperty("--ktc-codegen-result-master", `${this.currentSplitRatio}%`);
    const master = document.createElement("section");
    master.className = "result-master";
    master.setAttribute("aria-label", "预检命中与问题列表");
    const list = document.createElement("div");
    list.className = "result-list";
    for (const item of items) list.append(this.resultRow(model, item, item.key === selected?.key));
    if (!items.length) list.append(this.empty(
      this.resultFilter === "hits"
        ? "当前配置没有命中源码区域。可在 Primary 的控制符目录调整选择后重新预检。"
        : this.resultFilter === "issues"
          ? "当前预检没有 warning 或 error。"
          : "当前预检没有可显示的命中或问题。",
    ));
    master.append(list);
    const splitter = this.resultSplitter(layout);
    const detail = document.createElement("aside");
    detail.className = "result-detail";
    detail.setAttribute("aria-label", "当前预检项详情");
    detail.append(selected ? this.detailNode(model, plan, selected) : this.empty("选择左侧条目查看详情。"));
    layout.append(master, splitter, detail);
    return [title, summary, layout];
  }

  private resultItems(plan: KtcCodegenPlan): KtcCodegenResultItem[] {
    const items: KtcCodegenResultItem[] = [];
    if (this.resultFilter === "hits" || this.resultFilter === "all") {
      for (const region of plan.markerRegions) items.push({ kind: "hit", key: `hit:${region.id}`, region });
    }
    if (this.resultFilter === "issues" || this.resultFilter === "all") {
      plan.diagnostics.forEach((diagnostic, index) => {
        if (diagnostic.severity !== "info") items.push({ kind: "issue", key: `issue:${index}`, diagnostic });
      });
    }
    return items;
  }

  private resultRow(
    model: KtcCodegenControlCatalogViewModel,
    item: KtcCodegenResultItem,
    selected: boolean,
  ): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = item.kind === "issue" ? `result-row ${item.diagnostic.severity}` : "result-row hit";
    row.setAttribute("aria-pressed", String(selected));
    const title = document.createElement("strong");
    title.className = "result-heading";
    const meta = document.createElement("span");
    if (item.kind === "hit") {
      this.appendResultHeading(title, model, item.region.blockKey, item.region.blockKey);
      meta.textContent = this.showResultPaths
        ? `${item.region.path}:${item.region.start.line + 1} · ${item.region.classId}`
        : `${item.region.classId} · 第 ${item.region.start.line + 1} 行`;
      meta.title = `${item.region.path}:${item.region.start.line + 1}`;
    } else {
      this.appendResultHeading(
        title,
        model,
        this.diagnosticBlockKey(model, item.diagnostic),
        `${item.diagnostic.severity.toUpperCase()} · ${item.diagnostic.code}`,
      );
      const location = item.diagnostic.path?.file && Number.isInteger(item.diagnostic.path.row)
        ? `${item.diagnostic.path.file}:${item.diagnostic.path.row! + 1}`
        : undefined;
      meta.textContent = this.showResultPaths && location ? location : item.diagnostic.message;
      if (location) meta.title = location;
    }
    if (this.showResultPaths) meta.className = "path";
    row.append(title, meta);
    row.onclick = () => {
      this.selectedResultKey = item.key;
      this.render();
    };
    return row;
  }

  private detailNode(
    model: KtcCodegenControlCatalogViewModel,
    plan: KtcCodegenPlan,
    item: KtcCodegenResultItem,
  ): HTMLElement {
    const container = document.createElement("div");
    container.className = "detail-content";
    const header = document.createElement("div");
    header.className = "detail-header";
    const title = document.createElement("h3");
    title.className = "detail-heading";
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    const actions = document.createElement("div");
    actions.className = "detail-actions";
    if (item.kind === "hit") {
      this.appendResultHeading(title, model, item.region.blockKey, item.region.blockKey);
      summary.textContent = `${item.region.path}:${item.region.start.line + 1} · ${item.region.classId}`;
      summary.title = summary.textContent;
      actions.append(this.openButton(item.region.path, item.region.start.line));
      header.append(title, summary, actions);
      container.append(header);
      const artifact = plan.artifacts.find((candidate) => candidate.regionId === item.region.id);
      const preview = document.createElement("pre");
      preview.className = "detail-preview";
      preview.tabIndex = 0;
      preview.setAttribute("aria-label", `${item.region.blockKey} Artifact 预览`);
      preview.textContent = artifact?.content ?? "该区域没有生成 Artifact。";
      container.append(preview);
      return container;
    }

    this.appendResultHeading(
      title,
      model,
      this.diagnosticBlockKey(model, item.diagnostic),
      `${item.diagnostic.severity.toUpperCase()} · ${item.diagnostic.code}`,
    );
    const message = document.createElement("p");
    message.className = "detail-message";
    message.textContent = item.diagnostic.message;
    const located = Boolean(item.diagnostic.path?.file) && Number.isInteger(item.diagnostic.path?.row);
    if (located && item.diagnostic.path?.file !== undefined && item.diagnostic.path.row !== undefined) {
      summary.textContent = `${item.diagnostic.path.file}:${item.diagnostic.path.row + 1}`;
      summary.title = summary.textContent;
      actions.append(this.openButton(item.diagnostic.path.file, item.diagnostic.path.row));
    } else {
      summary.textContent = "该诊断没有可打开的源码位置。";
    }
    const unclosed = this.structuredUnclosed(model, item.diagnostic);
    if (unclosed) {
      const copyEnd = document.createElement("button");
      copyEnd.type = "button";
      copyEnd.textContent = "复制 END";
      copyEnd.title = "复制 Host 根据结构化 marker 上下文生成的 END 控制符；不修改源码";
      copyEnd.onclick = () => this.emitCopyEnd(unclosed.blockKey, unclosed.path, unclosed.line);
      actions.append(copyEnd);
    }
    header.append(title, summary, message, actions);
    container.append(header);
    if (unclosed) {
      const expected = document.createElement("pre");
      expected.className = "detail-preview";
      expected.tabIndex = 0;
      expected.setAttribute("aria-label", "期望的 END 控制符");
      expected.textContent = unclosed.expectedEnd;
      container.append(expected);
    }
    return container;
  }

  private appendResultHeading(
    container: HTMLElement,
    model: KtcCodegenControlCatalogViewModel,
    blockKey: KtCodegenBlockKey | undefined,
    label: string,
  ): void {
    const block = blockKey ? model.blocks.find((candidate) => candidate.key === blockKey) : undefined;
    if (block) {
      const id = document.createElement("span");
      id.className = "control-id";
      id.textContent = `#${block.legacyId}`;
      id.title = `内部 legacyId：${block.legacyId}`;
      container.append(id);
    }
    const name = document.createElement("span");
    name.className = "result-name";
    name.textContent = label;
    container.append(name);
  }

  private diagnosticBlockKey(
    model: KtcCodegenControlCatalogViewModel,
    diagnostic: KtcCodegenDiagnostic,
  ): KtCodegenBlockKey | undefined {
    const marker = (diagnostic as typeof diagnostic & {
      readonly marker?: { readonly blockKey?: string };
    }).marker;
    const structured = model.blocks.find((block) => block.key === marker?.blockKey);
    if (structured) return structured.key;
    return this.structuredUnclosed(model, diagnostic)?.blockKey;
  }

  private structuredUnclosed(
    model: KtcCodegenControlCatalogViewModel,
    diagnostic: KtcCodegenDiagnostic,
  ): { readonly blockKey: KtCodegenBlockKey; readonly path: string; readonly line: number; readonly expectedEnd: string } | undefined {
    if (diagnostic.code !== "marker.missing-end" || !diagnostic.path?.file || diagnostic.path.row === undefined) return undefined;
    for (const block of model.blocks) {
      const issue = block.unclosed?.find((candidate) => (
        candidate.code === diagnostic.code
        && candidate.path === diagnostic.path?.file
        && candidate.line === diagnostic.path?.row
      ));
      if (issue) return { blockKey: block.key, path: issue.path, line: issue.line, expectedEnd: issue.expectedEnd };
    }
    return undefined;
  }

  private openButton(path: string, line: number): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "打开";
    button.title = "打开源码位置";
    button.onclick = () => this.emitOpen(path, line);
    return button;
  }

  private filterButton(label: string, filter: KtcCodegenControlResultFilter): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(this.resultFilter === filter));
    button.onclick = () => {
      this.resultFilter = filter;
      this.selectedResultKey = undefined;
      this.render();
    };
    return button;
  }

  private resultSplitter(layout: HTMLElement): HTMLElement {
    const splitter = document.createElement("div");
    splitter.className = "result-splitter";
    splitter.tabIndex = 0;
    splitter.setAttribute("role", "separator");
    splitter.setAttribute("aria-label", "调整预检结果列表与详情宽度");
    splitter.setAttribute("aria-orientation", "vertical");
    splitter.setAttribute("aria-valuemin", "20");
    splitter.setAttribute("aria-valuemax", "75");
    splitter.setAttribute("aria-valuenow", String(this.currentSplitRatio));
    const updateFromPointer = (clientX: number, emit: boolean) => {
      const rect = layout.getBoundingClientRect();
      if (rect.width <= 0) return;
      this.currentSplitRatio = ktcClampCodegenControlSplitPercent(((clientX - rect.left) / rect.width) * 100);
      layout.style.setProperty("--ktc-codegen-result-master", `${this.currentSplitRatio}%`);
      splitter.setAttribute("aria-valuenow", String(this.currentSplitRatio));
      if (emit) this.emitSplitChange();
    };
    splitter.onpointerdown = (event) => splitter.setPointerCapture(event.pointerId);
    splitter.onpointermove = (event) => {
      if (splitter.hasPointerCapture(event.pointerId)) updateFromPointer(event.clientX, false);
    };
    splitter.onpointerup = (event) => {
      if (!splitter.hasPointerCapture(event.pointerId)) return;
      updateFromPointer(event.clientX, true);
      splitter.releasePointerCapture(event.pointerId);
    };
    splitter.onkeydown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -2 : 2;
      this.currentSplitRatio = ktcClampCodegenControlSplitPercent(this.currentSplitRatio + delta);
      layout.style.setProperty("--ktc-codegen-result-master", `${this.currentSplitRatio}%`);
      splitter.setAttribute("aria-valuenow", String(this.currentSplitRatio));
      this.emitSplitChange();
    };
    return splitter;
  }

  private empty(text: string): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    return empty;
  }

  private emitOpen(path: string, line: number): void {
    this.dispatchEvent(new CustomEvent<KtcCodegenControlOpenDetail>(
      "ktc-codegen-control-open",
      { bubbles: true, composed: true, detail: { path, line } },
    ));
  }

  private emitCopyEnd(blockKey: KtCodegenBlockKey, path: string, line: number): void {
    this.dispatchEvent(new CustomEvent<KtcCodegenControlCopyEndDetail>(
      "ktc-codegen-control-copy-end",
      { bubbles: true, composed: true, detail: { blockKey, path, line } },
    ));
  }

  private emitSplitChange(): void {
    this.dispatchEvent(new CustomEvent<KtcCodegenControlSplitDetail>(
      "ktc-codegen-control-split-change",
      { bubbles: true, composed: true, detail: { ratio: this.currentSplitRatio } },
    ));
  }
}

export function ktcDefineCodegenControlPanel(
  tagName = KTC_CODEGEN_CONTROL_PANEL_TAG,
): typeof KtcCodegenControlPanel {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcCodegenControlPanel;
  customElements.define(tagName, KtcCodegenControlPanel);
  return KtcCodegenControlPanel;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-codegen-control-panel": KtcCodegenControlPanel;
  }
}
