import type { KtCodegenBlockKey } from "@phoenix-wing/kt-codegen";
import type { KtcCodegenControlCatalogViewModel, KtcCodegenControlViewModel } from "./controlViewModel.js";

export const KTC_CODEGEN_CONTROL_PANEL_TAG = "ktc-codegen-control-panel";

export interface KtcCodegenControlOpenDetail {
  readonly path: string;
  readonly line: number;
}

export interface KtcCodegenControlCopyEndDetail extends KtcCodegenControlOpenDetail {
  readonly blockKey: KtCodegenBlockKey;
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
  .section-title { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-height: 34px; padding: 5px 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border-bottom: 1px solid var(--vscode-panel-border); font-size: 11px; font-weight: 650; }
  .section-title .spacer { flex: 1 1 auto; }
  .filter { min-height: 24px; padding: 2px 7px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  .filter[aria-pressed="true"] { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: var(--vscode-button-background); }
  .preflight-summary { padding: 8px 9px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
  .result-layout { display: grid; grid-template-columns: minmax(220px, 36%) minmax(0, 1fr); min-width: 0; align-items: start; overflow: visible; }
  .result-master { min-width: 0; overflow-x: hidden; overflow-y: visible; border-right: 1px solid var(--vscode-panel-border); }
  .result-list { min-width: 0; overflow-y: visible; }
  .result-row { display: grid; width: 100%; min-width: 0; min-height: 47px; grid-template-columns: minmax(0, 1fr); gap: 2px; padding: 7px 9px; color: var(--vscode-foreground); background: transparent; border: 0; border-bottom: 1px solid var(--vscode-panel-border); text-align: left; }
  .result-row:hover { background: var(--vscode-list-hoverBackground); }
  .result-row[aria-pressed="true"] { background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); }
  .result-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .result-row span { overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); font-size: 10px; }
  .result-row.error { border-left: 3px solid var(--vscode-errorForeground); }
  .result-row.warning { border-left: 3px solid var(--vscode-editorWarning-foreground); }
  .result-detail { position: sticky; top: var(--ktc-codegen-detail-sticky-top, 58px); align-self: start; min-width: 0; padding: 10px; overflow: visible; background: var(--vscode-editor-background); }
  .detail-header { display: grid; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
  .detail-header h3 { margin: 0; font-size: 13px; }
  .detail-summary, .detail-location, .detail-message { margin: 0; overflow-wrap: anywhere; color: var(--vscode-descriptionForeground); }
  .detail-message { color: var(--vscode-foreground); }
  .detail-actions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .detail-actions button { min-height: 25px; padding: 2px 8px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  .detail-preview { display: block; max-block-size: min(42vh, 420px); margin: 9px 0 0; padding: 9px; overflow: auto; overscroll-behavior: contain; color: var(--vscode-editor-foreground); background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 5px; font: 12px/1.45 var(--vscode-editor-font-family); white-space: pre; }
  .empty { padding: 22px 12px; color: var(--vscode-descriptionForeground); text-align: center; }
  @media (max-width: 680px) {
    .result-layout { grid-template-columns: minmax(160px, 34%) minmax(0, 1fr); }
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
    const master = document.createElement("section");
    master.className = "result-master";
    master.setAttribute("aria-label", "预检命中与问题列表");
    const list = document.createElement("div");
    list.className = "result-list";
    for (const item of items) list.append(this.resultRow(item, item.key === selected?.key));
    if (!items.length) list.append(this.empty(
      this.resultFilter === "hits"
        ? "当前配置没有命中源码区域。可在 Primary 的控制符目录调整选择后重新预检。"
        : this.resultFilter === "issues"
          ? "当前预检没有 warning 或 error。"
          : "当前预检没有可显示的命中或问题。",
    ));
    master.append(list);
    const detail = document.createElement("aside");
    detail.className = "result-detail";
    detail.setAttribute("aria-label", "当前预检项详情");
    detail.append(selected ? this.detailNode(model, plan, selected) : this.empty("选择左侧条目查看详情。"));
    layout.append(master, detail);
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

  private resultRow(item: KtcCodegenResultItem, selected: boolean): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = item.kind === "issue" ? `result-row ${item.diagnostic.severity}` : "result-row hit";
    row.setAttribute("aria-pressed", String(selected));
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    if (item.kind === "hit") {
      title.textContent = item.region.blockKey;
      meta.textContent = `${item.region.path}:${item.region.start.line + 1} · ${item.region.classId}`;
    } else {
      title.textContent = `${item.diagnostic.severity.toUpperCase()} · ${item.diagnostic.code}`;
      meta.textContent = item.diagnostic.path?.file && Number.isInteger(item.diagnostic.path.row)
        ? `${item.diagnostic.path.file}:${item.diagnostic.path.row! + 1}`
        : item.diagnostic.message;
    }
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
    const header = document.createElement("div");
    header.className = "detail-header";
    const title = document.createElement("h3");
    const summary = document.createElement("p");
    summary.className = "detail-summary";
    const actions = document.createElement("div");
    actions.className = "detail-actions";
    if (item.kind === "hit") {
      title.textContent = item.region.blockKey;
      summary.textContent = `${item.region.path}:${item.region.start.line + 1} · ${item.region.classId}`;
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

    title.textContent = `${item.diagnostic.severity.toUpperCase()} · ${item.diagnostic.code}`;
    const message = document.createElement("p");
    message.className = "detail-message";
    message.textContent = item.diagnostic.message;
    const located = Boolean(item.diagnostic.path?.file) && Number.isInteger(item.diagnostic.path?.row);
    if (located && item.diagnostic.path?.file !== undefined && item.diagnostic.path.row !== undefined) {
      summary.textContent = `${item.diagnostic.path.file}:${item.diagnostic.path.row + 1}`;
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
    button.textContent = "打开位置";
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
