import type { KtcCodegenControlCatalogViewModel, KtcCodegenControlViewModel } from "./controlViewModel.js";
import {
  KTC_CODEGEN_CONTROL_SPLIT_MAX,
  KTC_CODEGEN_CONTROL_SPLIT_MIN,
  KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT,
  ktcClampCodegenControlSplitPercent,
} from "./editorLayoutState.js";

export const KTC_CODEGEN_CONTROL_PANEL_TAG = "ktc-codegen-control-panel";

export interface KtcCodegenControlOpenDetail {
  readonly path: string;
  readonly line: number;
}

export interface KtcCodegenControlSplitChangeDetail {
  readonly percent: number;
}

type KtcCodegenControlResultFilter = "hits" | "issues" | "all";

const STYLE = `
  :host { display: block; min-width: 0; min-height: 0; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, [tabindex]:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  :host([mode="full"]) { block-size: auto; min-block-size: 0; overflow-x: auto; overflow-y: hidden; }
  .grid { display: grid; min-width: 540px; min-block-size: 0; grid-template-columns: minmax(220px, var(--ktc-control-split, 42%)) 8px minmax(300px, 1fr); align-items: stretch; overflow: visible; }
  .section { display: flex; min-width: 0; min-height: 0; overflow: visible; flex-direction: column; }
  ktc-codegen-control-catalog { flex: 0 0 auto; min-height: 0; overflow: visible; }
  .splitter { position: relative; min-height: 44px; background: var(--vscode-panel-border); cursor: col-resize; touch-action: none; }
  .splitter::before { content: ""; position: absolute; inset: 0 2px; background: var(--vscode-editor-background); }
  .splitter:hover, .splitter:focus-visible, .splitter.dragging { background: var(--vscode-focusBorder); outline: none; }
  .section-title { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; gap: 5px; min-height: 34px; padding: 5px 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border-bottom: 1px solid var(--vscode-panel-border); font-size: 11px; font-weight: 650; }
  .section-title .spacer { flex: 1 1 auto; }
  .filter { min-height: 24px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  .filter[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
  .scroll { flex: 0 0 auto; min-width: 0; min-height: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-color: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)) transparent; }
  .scroll::-webkit-scrollbar { width: 0; height: 12px; }
  .scroll::-webkit-scrollbar-track { background: transparent; }
  .scroll::-webkit-scrollbar-thumb { min-height: 28px; background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, .7)); border: 3px solid transparent; border-radius: 999px; background-clip: padding-box; }
  .scroll::-webkit-scrollbar-thumb:hover { background-color: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, .9)); }
  .content { min-width: 520px; }
  .preflight-summary { padding: 8px 9px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .hit { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; padding: 7px 9px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer; }
  .hit:hover, .diagnostic:hover { background: var(--vscode-list-hoverBackground); }
  .hit strong, .hit span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hit span { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .open { min-height: 24px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  .diagnostic { display: block; width: calc(100% - 16px); height: auto; margin: 6px 8px; padding: 7px 9px; color: var(--vscode-foreground); background: var(--vscode-textBlockQuote-background); border: 0; border-left: 3px solid var(--vscode-editorWarning-foreground); border-radius: 2px; text-align: left; cursor: default; }
  .diagnostic.located { cursor: pointer; }
  .diagnostic.error { border-left-color: var(--vscode-errorForeground); }
  .diagnostic-code { display: block; margin-bottom: 2px; font-weight: 650; }
  .diagnostic-location { display: block; margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 10px; }
  .preview { margin: 8px; padding: 9px; overflow-x: auto; overflow-y: hidden; color: var(--vscode-editor-foreground); background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 5px; font: 12px/1.45 var(--vscode-editor-font-family); white-space: pre; }
  .empty { padding: 22px 12px; color: var(--vscode-descriptionForeground); text-align: center; }
`;

function fullModel(
  model: KtcCodegenControlCatalogViewModel,
): KtcCodegenControlViewModel {
  return model as KtcCodegenControlViewModel;
}

/** Primary compact / JSON View full 共用的高层控制符面板。 */
export class KtcCodegenControlPanel extends HTMLElement {
  static readonly observedAttributes = ["mode"];
  private readonly root = this.attachShadow({ mode: "open" });
  /** 保留同一个目录实例，切换右侧结果筛选时不重置左侧本地筛选。 */
  private readonly catalog = document.createElement("ktc-codegen-control-catalog");
  private currentModel: KtcCodegenControlCatalogViewModel | undefined;
  private resultFilter: KtcCodegenControlResultFilter = "hits";
  private splitPercent = KTC_CODEGEN_DEFAULT_EDITOR_LAYOUT.controlSplitPercent;

  get splitRatio(): number { return this.splitPercent; }
  set splitRatio(value: number) {
    this.splitPercent = ktcClampCodegenControlSplitPercent(value);
    this.render();
  }

  get model(): KtcCodegenControlCatalogViewModel | undefined { return this.currentModel; }
  set model(value: KtcCodegenControlCatalogViewModel | undefined) {
    if (!this.currentModel?.preflightAvailable && value?.preflightAvailable) this.resultFilter = "hits";
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
    this.catalog.setAttribute("mode", this.getAttribute("mode") === "full" ? "full" : "compact");
    this.catalog.model = model;
    if (this.getAttribute("mode") !== "full") {
      this.root.replaceChildren(style, this.catalog);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "grid";
    const catalogSection = document.createElement("section");
    catalogSection.className = "section catalog";
    catalogSection.setAttribute("aria-label", "可筛选的控制符目录");
    catalogSection.append(this.catalog);
    const results = document.createElement("section");
    results.className = "section results";
    results.setAttribute("aria-label", "可筛选的预检命中与问题");
    results.append(...this.resultNodes(model));
    const splitter = this.splitter(grid);
    grid.append(catalogSection, splitter, results);
    this.root.replaceChildren(style, grid);
  }

  private splitter(grid: HTMLElement): HTMLElement {
    const splitter = document.createElement("div");
    splitter.className = "splitter";
    splitter.tabIndex = 0;
    splitter.setAttribute("role", "separator");
    splitter.setAttribute("aria-label", "调整控制符目录与预检结果宽度");
    splitter.setAttribute("aria-orientation", "vertical");
    splitter.setAttribute("aria-valuemin", String(KTC_CODEGEN_CONTROL_SPLIT_MIN));
    splitter.setAttribute("aria-valuemax", String(KTC_CODEGEN_CONTROL_SPLIT_MAX));
    splitter.title = "拖动调整左右宽度；方向键可微调";
    this.applySplit(grid, splitter, this.splitPercent);
    let dragging = false;
    splitter.onpointerdown = (event) => {
      dragging = true;
      splitter.classList.add("dragging");
      splitter.setPointerCapture?.(event.pointerId);
    };
    splitter.onpointermove = (event) => {
      if (!dragging) return;
      const rect = grid.getBoundingClientRect();
      const usableWidth = Math.max(1, rect.width - 8);
      this.applySplit(grid, splitter, ((event.clientX - rect.left) / usableWidth) * 100);
    };
    const finish = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove("dragging");
      if (splitter.hasPointerCapture?.(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
      this.emitSplit();
    };
    splitter.onpointerup = finish;
    splitter.onpointercancel = finish;
    splitter.onkeydown = (event) => {
      const direction = event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : 0;
      if (!direction) return;
      event.preventDefault();
      this.applySplit(grid, splitter, this.splitPercent + direction);
      this.emitSplit();
    };
    return splitter;
  }

  private applySplit(grid: HTMLElement, splitter: HTMLElement, value: number): void {
    this.splitPercent = ktcClampCodegenControlSplitPercent(value);
    grid.style.setProperty("--ktc-control-split", `${this.splitPercent}%`);
    splitter.setAttribute("aria-valuenow", String(this.splitPercent));
  }

  private emitSplit(): void {
    this.dispatchEvent(new CustomEvent<KtcCodegenControlSplitChangeDetail>(
      "ktc-codegen-control-split-change",
      { bubbles: true, composed: true, detail: { percent: this.splitPercent } },
    ));
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
    cache.textContent = preflight ? (preflight.reused ? "缓存" : "新计划") : "尚未预检";
    title.append(name, spacer);
    for (const [filter, label, count] of [
      ["hits", "命中", plan?.markerRegions.length ?? 0],
      ["issues", "问题", issueCount],
      ["all", "全部", (plan?.markerRegions.length ?? 0) + issueCount],
    ] as const) title.append(this.filterButton(`${label} ${count}`, filter));
    title.append(cache);

    const scroll = document.createElement("div");
    scroll.className = "scroll";
    scroll.tabIndex = 0;
    scroll.setAttribute("aria-label", "预检结果内容；宽内容可横向滚动");
    const content = document.createElement("div");
    content.className = "content";
    const summary = document.createElement("div");
    summary.className = "preflight-summary";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    if (!plan) {
      summary.textContent = "尚未预检。可点击页面上方“预检”，或直接点击 Apply 自动预检并写入源码。";
      content.append(summary);
      scroll.append(content);
      return [title, scroll];
    }
    summary.textContent = `${plan.markerRegions.length} 个区域 · ${plan.artifacts.length} 个产物 · ${plan.diagnostics.length} 条诊断`;
    content.append(summary);
    if (this.resultFilter === "hits" || this.resultFilter === "all") this.appendHits(content, plan);
    if (this.resultFilter === "issues" || this.resultFilter === "all") this.appendIssues(content, plan);
    scroll.append(content);
    return [title, scroll];
  }

  private appendHits(
    content: HTMLElement,
    plan: NonNullable<KtcCodegenControlViewModel["preflight"]>["plan"],
  ): void {
    const artifacts = new Map(plan.artifacts.map((artifact) => [artifact.regionId, artifact]));
    const preview = document.createElement("pre");
    preview.className = "preview";
    preview.hidden = true;
    for (const region of plan.markerRegions) {
      const row = document.createElement("div");
      row.className = "hit";
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      const title = document.createElement("strong");
      title.textContent = region.blockKey;
      const line = document.createElement("span");
      line.textContent = `${region.path}:${region.start.line + 1} · ${region.classId}`;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "open";
      open.textContent = "打开";
      open.onclick = (event) => {
        event.stopPropagation();
        this.emitOpen(region.path, region.start.line);
      };
      const showPreview = () => {
        preview.textContent = artifacts.get(region.id)?.content ?? "该区域没有生成 Artifact。";
        preview.hidden = false;
      };
      row.setAttribute("aria-label", `预览 ${region.blockKey}，${line.textContent}`);
      row.onclick = showPreview;
      row.onkeydown = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        showPreview();
      };
      row.append(title, open, line);
      content.append(row);
    }
    if (!plan.markerRegions.length) content.append(this.empty("当前配置与所选控制符没有命中源码区域。可切换左侧“未命中”筛选查看。"));
    content.append(preview);
  }

  private appendIssues(
    content: HTMLElement,
    plan: NonNullable<KtcCodegenControlViewModel["preflight"]>["plan"],
  ): void {
    const issues = plan.diagnostics.filter((item) => item.severity !== "info");
    for (const item of issues) {
      const located = Boolean(item.path?.file) && Number.isInteger(item.path?.row);
      const row = document.createElement(located ? "button" : "div");
      if (located) (row as HTMLButtonElement).type = "button";
      row.className = `diagnostic ${item.severity}${located ? " located" : ""}`;
      const code = document.createElement("span");
      code.className = "diagnostic-code";
      code.textContent = `${item.severity.toUpperCase()} · ${item.code}`;
      const message = document.createElement("span");
      message.textContent = item.message;
      row.append(code, message);
      if (located && item.path?.file !== undefined && item.path.row !== undefined) {
        const location = document.createElement("span");
        location.className = "diagnostic-location";
        location.textContent = `${item.path.file}:${item.path.row + 1}`;
        row.append(location);
        row.title = "打开并定位到问题行";
        row.onclick = () => this.emitOpen(item.path!.file!, item.path!.row!);
      }
      content.append(row);
    }
    if (!issues.length) content.append(this.empty("当前预检没有 warning 或 error。"));
  }

  private filterButton(label: string, filter: KtcCodegenControlResultFilter): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(this.resultFilter === filter));
    button.onclick = () => {
      this.resultFilter = filter;
      this.render();
    };
    return button;
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
