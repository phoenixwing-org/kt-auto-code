import type { KtcCodegenMetaField } from "./contracts.js";
import type { KtcCodegenPrimaryViewModel } from "./primaryViewModel.js";

export const KTC_CODEGEN_PRIMARY_PANEL_TAG = "ktc-codegen-primary-panel";

export type KtcCodegenPrimaryActionDetail =
  | { readonly action: "openJson" | "importCsv" | "refresh" | "scanCandidates" | "cancelOperation" | "copyDiagnostics" }
  | { readonly action: "openDocument" | "openCandidate"; readonly uri: string }
  | {
      readonly action: "updateMeta";
      readonly uri: string;
      readonly field: KtcCodegenMetaField;
      readonly value: string;
    };

const STYLE = `
  :host { display: grid; gap: 9px; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .action { min-height: 27px; padding: 3px 9px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-background); border-radius: 3px; }
  .action.secondary, .text-button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border-color: var(--vscode-panel-border); }
  .text-button { min-height: 25px; padding: 2px 7px; border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .current { display: grid; gap: 3px; padding: 8px 9px; border: 1px solid var(--vscode-focusBorder); border-radius: 5px; background: color-mix(in srgb, var(--vscode-focusBorder) 9%, transparent); }
  .current strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .current span, .hint { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .properties { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 7px 8px; padding: 9px; border: 1px solid var(--vscode-panel-border); border-radius: 5px; background: var(--vscode-editorWidget-background, transparent); }
  .property { display: grid; gap: 3px; min-width: 0; }
  .property span { color: var(--vscode-descriptionForeground); font-size: 10px; }
  .property input { width: 100%; min-width: 0; height: 27px; padding: 3px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; }
  .mini { min-width: 0; overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 5px; background: var(--vscode-editor-background); }
  .mini > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; padding: 5px 8px; color: var(--vscode-descriptionForeground); background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)); font-size: 11px; font-weight: 650; cursor: pointer; user-select: none; }
  .mini > summary::-webkit-details-marker { display: none; }
  .mini > summary::before { content: "›"; flex: 0 0 auto; font-size: 16px; line-height: 1; }
  .mini[open] > summary::before { transform: rotate(90deg); }
  .mini-title { margin-right: auto; color: var(--vscode-foreground); }
  .mini-count { white-space: nowrap; font-weight: 500; }
  .mini[open] > .list { border-top: 1px solid var(--vscode-panel-border); }
  .list { display: grid; grid-auto-rows: 48px; gap: 3px; max-height: 252px; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .candidate-list { gap: 2px; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; width: 100%; padding: 7px 8px; border: 1px solid transparent; border-radius: 4px; color: var(--vscode-foreground); background: transparent; text-align: left; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.active { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); border-color: var(--vscode-focusBorder); }
  .row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .row-path { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .row.active .row-path { color: inherit; opacity: .8; }
  .tags { display: flex; align-items: center; justify-content: flex-end; gap: 4px; grid-row: 1 / span 2; grid-column: 2; }
  .tag { padding: 1px 5px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; color: var(--vscode-descriptionForeground); font-size: 10px; white-space: nowrap; }
  .tag.dirty { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); }
  .row.active .tag { color: inherit; border-color: currentColor; opacity: .86; }
  .empty { padding: 12px 8px; color: var(--vscode-descriptionForeground); text-align: center; }
`;

export class KtcCodegenPrimaryPanel extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  /** Host snapshot 重绘时复用同一实例，保留目录自己的筛选与 Tree 展开状态。 */
  private readonly controlPanel = document.createElement("ktc-codegen-control-panel");
  private currentModel: KtcCodegenPrimaryViewModel | undefined;
  private controlsExpanded = true;

  get model(): KtcCodegenPrimaryViewModel | undefined { return this.currentModel; }
  set model(value: KtcCodegenPrimaryViewModel | undefined) {
    this.currentModel = value;
    this.render();
  }

  connectedCallback(): void { this.render(); }

  private render(): void {
    if (!this.isConnected) return;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const model = this.currentModel;
    if (!model) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Codegen 尚未激活。";
      this.root.replaceChildren(style, empty);
      return;
    }
    const active = model.documents.find((entry) => entry.active || entry.uri === model.activeUri);
    const busy = Boolean(model.operation);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      this.actionButton("打开 JSON…", "openJson", model.running || busy, "action"),
      this.actionButton("导入 CSV…", "importCsv", model.running || busy, "action secondary"),
      this.actionButton(model.operation === "discovery" ? "取消扫描" : "刷新列表", model.operation === "discovery" ? "cancelOperation" : "refresh", (model.running || busy) && model.operation !== "discovery", "text-button"),
      this.actionButton(model.operation === "candidates" ? "取消候选扫描" : "扫描候选源码", model.operation === "candidates" ? "cancelOperation" : "scanCandidates", (model.running || busy) && model.operation !== "candidates", "text-button"),
      this.actionButton("复制诊断", "copyDiagnostics", false, "text-button", "复制不含表格内容和源码内容的运行状态"),
    );

    const current = document.createElement("div");
    current.className = "current";
    current.hidden = !active;
    current.setAttribute("role", "status");
    current.setAttribute("aria-live", "polite");
    if (active) {
      const name = document.createElement("strong");
      name.textContent = active.fileName + (active.dirty ? " · 未保存" : "");
      const meta = document.createElement("span");
      meta.textContent = (active.className || "未命名类") + " · " + active.itemCount + " 行 · 当前编辑 View"
        + (active.externalConflict ? " · 外部文件已变更" : "");
      current.append(name, meta);
    }

    const properties = document.createElement("div");
    properties.className = "properties";
    properties.hidden = !active;
    if (active) {
      properties.append(
        this.property("Prefix", "namePrefix", active.namePrefix, active.uri, model.running || busy),
        this.property("Middle", "nameMiddle", active.nameMiddle, active.uri, model.running || busy),
        this.property("Namespace", "nameSpace", active.nameSpace, active.uri, model.running || busy),
        this.property("Append", "appendFunction", active.appendFunction, active.uri, model.running || busy),
      );
    }

    const controls = document.createElement("details");
    controls.className = "mini";
    controls.open = this.controlsExpanded;
    controls.hidden = !active || !model.controls;
    controls.setAttribute("aria-label", "控制符目录区");
    controls.ontoggle = () => { this.controlsExpanded = controls.open; };
    controls.append(this.summary("控制符目录", "会话级"));
    this.controlPanel.setAttribute("mode", "compact");
    this.controlPanel.model = model.controls;
    controls.append(this.controlPanel);

    const documents = document.createElement("details");
    documents.className = "mini";
    documents.open = true;
    documents.append(this.summary("JSON 配置", model.documents.length ? `${model.documents.length} 份` : ""));
    documents.append(this.documentList(model));

    const candidates = document.createElement("details");
    candidates.className = "mini";
    candidates.open = true;
    candidates.append(this.summary("控制符候选（工作区级）", model.candidates.length ? `${model.candidates.length} 个` : ""));
    candidates.append(this.candidateList(model));

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "一份 JSON 对应当前编辑区一个表格 View；Primary 与 JSON View 的控制符目录由 Host session 同步。";
    this.root.replaceChildren(style, actions, current, properties, controls, documents, candidates, hint);
  }

  private actionButton(
    label: string,
    action: "openJson" | "importCsv" | "refresh" | "scanCandidates" | "cancelOperation" | "copyDiagnostics",
    disabled: boolean,
    className: string,
    title = "",
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.title = title;
    button.disabled = disabled;
    button.onclick = () => this.emit({ action });
    return button;
  }

  private property(
    label: string,
    field: KtcCodegenMetaField,
    value: string,
    uri: string,
    disabled: boolean,
  ): HTMLLabelElement {
    const wrapper = document.createElement("label");
    wrapper.className = "property";
    const caption = document.createElement("span");
    caption.textContent = label;
    const input = document.createElement("input");
    input.value = value;
    input.disabled = disabled;
    input.spellcheck = false;
    input.setAttribute("aria-label", `Codegen ${label}`);
    input.onchange = () => this.emit({ action: "updateMeta", uri, field, value: input.value });
    wrapper.append(caption, input);
    return wrapper;
  }

  private summary(title: string, count: string): HTMLElement {
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.className = "mini-title";
    name.textContent = title;
    const value = document.createElement("span");
    value.className = "mini-count";
    value.textContent = count;
    summary.append(name, value);
    return summary;
  }

  private documentList(model: KtcCodegenPrimaryViewModel): HTMLElement {
    const list = document.createElement("div");
    list.className = "list";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "Codegen JSON 列表");
    list.setAttribute("aria-busy", String(model.operation === "discovery"));
    for (const entry of model.documents) {
      const row = this.row(entry.fileName, (entry.className || "未命名类") + " · " + entry.displayPath);
      row.classList.toggle("active", entry.active);
      row.title = `在右侧${entry.open ? "切换到" : "打开"} ${entry.displayPath}`;
      row.setAttribute("aria-label", row.title + (entry.active ? "，当前显示" : ""));
      row.setAttribute("aria-current", entry.active ? "true" : "false");
      const tags = row.querySelector<HTMLElement>(".tags")!;
      tags.append(this.tag(`${entry.itemCount} 行`));
      if (entry.open) tags.append(this.tag(entry.active ? "当前" : "已开"));
      if (entry.dirty) tags.append(this.tag("未保存", true));
      if (entry.externalConflict) tags.append(this.tag(entry.externalState === "deleted" ? "磁盘已删除" : "外部变更", true));
      row.onclick = () => this.emit({ action: "openDocument", uri: entry.uri });
      list.append(row);
    }
    if (!model.documents.length) list.append(this.empty(model.operation === "discovery" ? "正在查找 Codegen JSON…" : "暂无 Codegen JSON"));
    queueMicrotask(() => list.querySelector<HTMLElement>(".row.active")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
    return list;
  }

  private candidateList(model: KtcCodegenPrimaryViewModel): HTMLElement {
    const list = document.createElement("div");
    list.className = "list candidate-list";
    list.tabIndex = 0;
    list.setAttribute("aria-label", "含控制符的源码候选列表");
    list.setAttribute("aria-busy", String(model.operation === "candidates"));
    for (const candidate of model.candidates) {
      const name = candidate.displayPath.split(/[\\/]/u).at(-1) ?? candidate.displayPath;
      const row = this.row(name, candidate.displayPath);
      row.title = `打开 ${candidate.displayPath}`;
      row.setAttribute("aria-label", `${row.title}，${candidate.markerCount} 个控制标记，${candidate.encoding}`);
      const tags = row.querySelector<HTMLElement>(".tags")!;
      tags.append(this.tag(`${candidate.markerCount} 标记`), this.tag(candidate.encoding));
      row.onclick = () => this.emit({ action: "openCandidate", uri: candidate.uri });
      list.append(row);
    }
    if (!model.candidates.length) list.append(this.empty(
      model.operation === "candidates" ? "正在扫描候选源码…" : "点击“扫描候选源码”建立工作区控制符列表",
    ));
    return list;
  }

  private row(nameText: string, pathText: string): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "row";
    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = nameText;
    const path = document.createElement("span");
    path.className = "row-path";
    path.textContent = pathText;
    const tags = document.createElement("span");
    tags.className = "tags";
    row.append(name, path, tags);
    return row;
  }

  private tag(text: string, dirty = false): HTMLElement {
    const tag = document.createElement("span");
    tag.className = "tag" + (dirty ? " dirty" : "");
    tag.textContent = text;
    return tag;
  }

  private empty(text: string): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = text;
    return empty;
  }

  private emit(detail: KtcCodegenPrimaryActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcCodegenPrimaryActionDetail>(
      "ktc-codegen-primary-action",
      { bubbles: true, composed: true, detail },
    ));
  }
}

export function ktcDefineCodegenPrimaryPanel(
  tagName = KTC_CODEGEN_PRIMARY_PANEL_TAG,
): typeof KtcCodegenPrimaryPanel {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcCodegenPrimaryPanel;
  customElements.define(tagName, KtcCodegenPrimaryPanel);
  return KtcCodegenPrimaryPanel;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-codegen-primary-panel": KtcCodegenPrimaryPanel;
  }
}
