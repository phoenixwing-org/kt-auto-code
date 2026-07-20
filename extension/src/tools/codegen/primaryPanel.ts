import type { KtcCodegenMetaField } from "./contracts.js";
import type { KtcCodegenPrimaryViewModel } from "./primaryViewModel.js";

export const KTC_CODEGEN_PRIMARY_PANEL_TAG = "ktc-codegen-primary-panel";

export type KtcCodegenPrimaryActionDetail =
  | { readonly action: "openJson" | "importCsv" | "refresh" | "scanCandidates" | "cancelOperation" | "copyDiagnostics" | "applyAll" }
  | { readonly action: "openDocument" | "openCandidate"; readonly uri: string }
  | {
      readonly action: "updateMeta";
      readonly uri: string;
      readonly field: KtcCodegenMetaField;
      readonly value: string;
    };

const STYLE = `
  :host { position: relative; display: grid; gap: 4px; min-height: 0; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible, summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .actions { position: sticky; z-index: 12; top: 0; display: flex; flex-wrap: nowrap; gap: 2px; padding: 2px 5px 3px; overflow: hidden; background: var(--vscode-sideBar-background, var(--vscode-editor-background)); border-bottom: 1px solid var(--vscode-panel-border); }
  .action { min-height: 27px; padding: 3px 9px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-background); border-radius: 3px; }
  .action.secondary, .text-button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border-color: var(--vscode-panel-border); }
  .text-button { min-height: 25px; padding: 2px 7px; border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  .actions .action, .actions .text-button { display: inline-grid; flex: 0 0 28px; width: 28px; height: 28px; min-height: 28px; place-items: center; padding: 0; overflow: hidden; font-size: 0; }
  .action-icon { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .hint { color: var(--vscode-descriptionForeground); font-size: 11px; }
  .properties { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 4px 6px; padding: 5px 6px; border: 1px solid var(--vscode-panel-border); border-radius: 5px; background: var(--vscode-editorWidget-background, transparent); }
  .property { display: grid; gap: 1px; min-width: 0; }
  .property span { color: var(--vscode-descriptionForeground); font-size: 10px; }
  .property input { width: 100%; min-width: 0; height: 25px; padding: 2px 5px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; }
  .mini { min-width: 0; overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 5px; background: var(--vscode-editor-background); }
  .mini > summary { display: flex; align-items: center; justify-content: space-between; gap: 5px; min-height: 28px; padding: 3px 5px; color: var(--vscode-descriptionForeground); background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)); font-size: 11px; font-weight: 650; cursor: pointer; user-select: none; }
  .mini > summary::-webkit-details-marker { display: none; }
  .mini > summary::before { content: "›"; flex: 0 0 auto; font-size: 16px; line-height: 1; }
  .mini[open] > summary::before { transform: rotate(90deg); }
  .mini-title { margin-right: auto; color: var(--vscode-foreground); }
  .mini-count { white-space: nowrap; font-weight: 500; }
  .current-config > summary { justify-content: flex-start; }
  .current-identity { display: flex; flex: 1 1 auto; min-width: 0; align-items: baseline; gap: 6px; }
  .current-file { flex: 0 1 52%; min-width: 0; max-width: 52%; overflow: hidden; color: var(--vscode-foreground); text-overflow: ellipsis; white-space: nowrap; }
  .current-meta { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 10px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
  .current-config > .properties { border: 0; border-top: 1px solid var(--vscode-panel-border); border-radius: 0; }
  .mini[open] > .list { border-top: 1px solid var(--vscode-panel-border); }
  .list { display: grid; grid-auto-rows: 40px; gap: 0; max-height: 252px; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
  .candidate-list { grid-auto-rows: 30px; gap: 0; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 1px 6px; width: 100%; padding: 3px 5px; border: 1px solid transparent; border-radius: 4px; color: var(--vscode-foreground); background: transparent; text-align: left; }
  .candidate-row { display: flex; min-width: 0; min-height: 30px; align-items: center; gap: 6px; padding: 2px 4px; border: 0; border-bottom: 1px solid var(--vscode-panel-border); border-radius: 0; }
  .candidate-row:last-child { border-bottom: 0; }
  .candidate-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .candidate-name { color: var(--vscode-foreground); font-weight: 600; }
  .candidate-path { color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 400; }
  .candidate-row .tags { flex: 0 0 auto; grid-row: auto; grid-column: auto; }
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
  .batch-overlay { position: absolute; z-index: 20; inset: 0; display: grid; place-content: center; gap: 6px; padding: 16px; color: var(--vscode-foreground); background: color-mix(in srgb, var(--vscode-editor-background) 88%, transparent); border: 1px solid var(--vscode-focusBorder); border-radius: 6px; text-align: center; cursor: progress; }
  .batch-overlay[hidden] { display: none; }
  .batch-overlay strong { font-size: 13px; }
  .batch-overlay span { color: var(--vscode-descriptionForeground); }
`;

export class KtcCodegenPrimaryPanel extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  /** Host snapshot 重绘时复用同一实例，保留目录自己的筛选与 Tree 展开状态。 */
  private readonly controlPanel = document.createElement("ktc-codegen-control-panel");
  private currentModel: KtcCodegenPrimaryViewModel | undefined;
  private currentConfigExpanded = true;
  private documentsExpanded = true;
  private controlsExpanded = true;
  private candidatesExpanded = true;
  private documentScrollTop = 0;
  private candidateScrollTop = 0;

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
      this.actionButton("打开", "openJson", model.running || busy, "action", "打开一份 Codegen JSON"),
      this.actionButton("导入", "importCsv", model.running || busy, "action secondary", "导入 CSV 并转换为 Codegen JSON"),
      this.actionButton("全部应用", "applyAll", model.running || busy || model.documents.length === 0, "text-button", "依次打开当前列表中的全部 JSON View，并逐份运行预检与 Apply"),
      this.actionButton(
        model.operation === "discovery" ? "取消刷新" : "刷新",
        model.operation === "discovery" ? "cancelOperation" : "refresh",
        (model.running || busy) && model.operation !== "discovery",
        "text-button",
        model.operation === "discovery" ? "取消正在进行的 JSON 列表扫描" : "重新扫描工作区中的 Codegen JSON 列表",
      ),
      this.actionButton(
        model.operation === "candidates" ? "取消扫描" : "扫源码",
        model.operation === "candidates" ? "cancelOperation" : "scanCandidates",
        (model.running || busy) && model.operation !== "candidates",
        "text-button",
        model.operation === "candidates" ? "取消正在进行的控制符源码候选扫描" : "扫描工作区中含 Codegen 控制符的源码候选",
      ),
    );

    const properties = document.createElement("div");
    properties.className = "properties";
    if (active) {
      properties.append(
        this.property("Prefix", "namePrefix", active.namePrefix, active.uri, model.running || busy),
        this.property("Middle", "nameMiddle", active.nameMiddle, active.uri, model.running || busy),
        this.property("Namespace", "nameSpace", active.nameSpace, active.uri, model.running || busy),
        this.property("Append", "appendFunction", active.appendFunction, active.uri, model.running || busy),
      );
    }
    const currentConfig = document.createElement("details");
    currentConfig.className = "mini current-config";
    currentConfig.open = this.currentConfigExpanded;
    currentConfig.hidden = !active;
    currentConfig.setAttribute("aria-label", "当前配置区");
    currentConfig.ontoggle = () => { this.currentConfigExpanded = currentConfig.open; };
    if (active) currentConfig.append(this.currentConfigSummary(active), properties);

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
    documents.open = this.documentsExpanded;
    documents.setAttribute("aria-label", "JSON 配置区");
    documents.ontoggle = () => { this.documentsExpanded = documents.open; };
    documents.append(this.summary("JSON 配置", model.documents.length ? `${model.documents.length} 份` : ""));
    documents.append(this.documentList(model));

    const candidates = document.createElement("details");
    candidates.className = "mini";
    candidates.open = this.candidatesExpanded;
    candidates.setAttribute("aria-label", "控制符候选区");
    candidates.ontoggle = () => { this.candidatesExpanded = candidates.open; };
    candidates.append(this.summary("控制符候选（工作区级）", model.candidates.length ? `${model.candidates.length} 个` : ""));
    candidates.append(this.candidateList(model));

    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "一份 JSON 对应当前编辑区一个表格 View；Primary 与 JSON View 的控制符目录由 Host session 同步。";
    const overlay = document.createElement("div");
    overlay.className = "batch-overlay";
    overlay.hidden = model.operation !== "batch-apply" || !model.batch;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "assertive");
    overlay.setAttribute("aria-label", "全部应用正在运行，Auto Code 操作暂时锁定");
    const overlayTitle = document.createElement("strong");
    overlayTitle.textContent = model.batch
      ? `正在全部应用 ${model.batch.current} / ${model.batch.total}`
      : "正在全部应用";
    const overlayFile = document.createElement("span");
    overlayFile.textContent = model.batch?.fileName ?? "正在准备 JSON View…";
    overlay.append(overlayTitle, overlayFile);
    this.root.replaceChildren(style, actions, currentConfig, documents, controls, candidates, hint, overlay);
  }

  private actionButton(
    label: string,
    action: "openJson" | "importCsv" | "refresh" | "scanCandidates" | "cancelOperation" | "copyDiagnostics" | "applyAll",
    disabled: boolean,
    className: string,
    title = "",
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", label);
    button.disabled = disabled;
    button.append(this.actionIcon(action));
    button.onclick = () => this.emit({ action });
    return button;
  }

  private actionIcon(action: KtcCodegenPrimaryActionDetail["action"]): SVGSVGElement {
    type ToolbarAction = "openJson" | "importCsv" | "applyAll" | "refresh" | "scanCandidates" | "cancelOperation";
    const toolbarAction = action as ToolbarAction;
    const paths: Record<ToolbarAction, readonly string[]> = {
      openJson: ["M3 6h6l2 2h10v10H3z", "M15 10v6", "M12 13h6"],
      importCsv: ["M5 3h9l5 5v13H5z", "M14 3v5h5", "M12 10v7", "M9 14l3 3 3-3"],
      applyAll: ["M4 7h10", "M4 12h7", "M4 17h6", "M14 16l2 2 4-5"],
      refresh: ["M20 7v5h-5", "M19 12a7 7 0 1 1-2-5"],
      scanCandidates: ["M4 5h10", "M4 10h7", "M4 15h5", "M16 15l4 4", "M18 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
      cancelOperation: ["M6 6l12 12", "M18 6 6 18"],
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("action-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const data of paths[toolbarAction]) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", data);
      svg.append(path);
    }
    return svg;
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

  private currentConfigSummary(active: KtcCodegenPrimaryViewModel["documents"][number]): HTMLElement {
    const summary = document.createElement("summary");
    const identity = document.createElement("span");
    identity.className = "current-identity";
    const name = document.createElement("span");
    name.className = "mini-title current-file";
    name.textContent = active.fileName;
    const meta = document.createElement("span");
    meta.className = "current-meta";
    meta.textContent = (active.className || "未命名类") + " · " + active.itemCount + " 行 · 当前编辑 View"
      + (active.dirty ? " · 未保存" : "")
      + (active.externalConflict ? " · 外部文件已变更" : "");
    identity.append(name, meta);
    summary.append(identity);
    return summary;
  }

  private documentList(model: KtcCodegenPrimaryViewModel): HTMLElement {
    const list = document.createElement("div");
    list.className = "list document-list";
    list.tabIndex = 0;
    list.scrollTop = this.documentScrollTop;
    list.onscroll = () => { this.documentScrollTop = list.scrollTop; };
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
    return list;
  }

  private candidateList(model: KtcCodegenPrimaryViewModel): HTMLElement {
    const list = document.createElement("div");
    list.className = "list candidate-list";
    list.tabIndex = 0;
    list.scrollTop = this.candidateScrollTop;
    list.onscroll = () => { this.candidateScrollTop = list.scrollTop; };
    list.setAttribute("aria-label", "含控制符的源码候选列表");
    list.setAttribute("aria-busy", String(model.operation === "candidates"));
    for (const candidate of model.candidates) {
      const name = candidate.displayPath.split(/[\\/]/u).at(-1) ?? candidate.displayPath;
      const separatorIndex = Math.max(candidate.displayPath.lastIndexOf("/"), candidate.displayPath.lastIndexOf("\\"));
      const directory = separatorIndex >= 0 ? candidate.displayPath.slice(0, separatorIndex) : "";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "row candidate-row";
      const label = document.createElement("span");
      label.className = "candidate-label";
      const candidateName = document.createElement("span");
      candidateName.className = "candidate-name";
      candidateName.textContent = name;
      label.append(candidateName);
      if (directory) {
        const candidatePath = document.createElement("span");
        candidatePath.className = "candidate-path";
        candidatePath.textContent = ` · ${directory}`;
        label.append(candidatePath);
      }
      const tags = document.createElement("span");
      tags.className = "tags";
      row.append(label, tags);
      row.title = `打开 ${candidate.displayPath}`;
      row.setAttribute("aria-label", `${row.title}，${candidate.markerCount} 个控制标记，${candidate.encoding}`);
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
