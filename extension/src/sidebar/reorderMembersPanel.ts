import {
  ktcNextReorderSelection,
  ktcProjectReorderMembersPanel,
  ktcReorderStateLabel,
  ktcReorderStateMark,
  ktcSetReorderSelection,
  type KtcReorderMembersPanelModel,
  type KtcReorderMembersPanelRow,
  type KtcReorderMembersSelectionState,
} from "./reorderMembersPanelState.js";

export const KTC_REORDER_MEMBERS_PANEL_TAG = "ktc-reorder-members-panel";
export const KTC_REORDER_MEMBERS_PANEL_ACTION = "ktc-reorder-members-action";

export type KtcReorderMembersPanelActionDetail =
  | { readonly kind: "run"; readonly action: "preview" | "addToWorkset" }
  | {
      readonly kind: "reorderAction";
      readonly action: "open" | "preview" | "apply" | "cancel" | "gitDiff" | "revert";
      readonly uris: readonly string[];
    }
  | { readonly kind: "reorderSelection"; readonly uris: readonly string[] };

const STYLE = `
  :host { display: block; min-width: 0; max-width: 100%; color: var(--vscode-foreground); font: 12px/1.35 var(--vscode-font-family); }
  :host([hidden]) { display: none; }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .shell { min-width: 0; max-width: 100%; margin: 10px 0 12px; padding: 9px; overflow: hidden; border: 1px solid var(--vscode-panel-border); border-radius: 3px; }
  h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
  .summary { margin: 6px 0; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; }
  .actions { display: flex; align-items: center; gap: 6px; }
  .action, .text-button { min-height: 27px; padding: 3px 9px; border-radius: 3px; }
  .action { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid var(--vscode-button-background); }
  .action.secondary, .text-button { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-panel-border); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .options { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 7px 0 1px; }
  .filter { display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .status { min-height: 28px; margin: 8px 0; padding: 6px 8px; border-left: 3px solid var(--vscode-focusBorder); background: var(--vscode-editorWidget-background); color: var(--vscode-descriptionForeground); }
  .status.error { border-color: var(--vscode-errorForeground); color: var(--vscode-errorForeground); }
  .groups { min-width: 0; margin-top: 6px; }
  .group { min-width: 0; border-top: 1px solid var(--vscode-panel-border); }
  .group-header { display: flex; align-items: center; gap: 5px; min-height: 29px; font-weight: 600; }
  .group-header .detail { margin-left: auto; font-weight: 400; white-space: nowrap; }
  .list { min-width: 0; margin: 0; padding: 0 0 0 18px; list-style: none; }
  .file-row { display: flex; align-items: center; gap: 5px; min-width: 0; min-height: 28px; padding: 2px 3px; }
  .file-row:hover { background: var(--vscode-list-hoverBackground); }
  .kind { flex: 0 0 18px; color: var(--vscode-symbolIcon-classForeground, var(--vscode-foreground)); font-size: 11px; font-weight: 600; }
  .file-main { display: flex; flex: 1 1 auto; align-items: baseline; gap: 5px; min-width: 0; overflow: hidden; cursor: pointer; }
  .file-name { flex: 0 0 auto; overflow: visible; text-overflow: clip; white-space: nowrap; }
  .file-dir { flex: 1 1 0; min-width: 0; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .inline { display: flex; flex: 0 0 auto; opacity: 0; }
  .file-row:hover .inline, .inline:focus-within { opacity: 1; }
  .icon { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 3px; color: var(--vscode-foreground); background: transparent; font-size: 16px; line-height: 24px; }
  .icon:hover { background: var(--vscode-toolbar-hoverBackground); }
  .state { flex: 0 0 14px; width: 14px; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 12px; font-weight: 600; text-align: right; white-space: nowrap; }
  .state.pending { color: var(--vscode-gitDecoration-modifiedResourceForeground, var(--vscode-descriptionForeground)); }
  .state.blocked { color: var(--vscode-errorForeground); }
  .state.applied { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
  .empty { padding: 12px 8px; color: var(--vscode-descriptionForeground); text-align: center; }
  :host([presentation="detailBlock"]) .shell { margin: 0; padding: 0; border: 0; }
  :host([presentation="detailBlock"]) h2,
  :host([presentation="detailBlock"]) .summary { display: none; }
  :host([presentation="detailBlock"]) .actions .action { flex: 1 1 0; }
  :host([presentation="detailBlock"]) .status { min-height: 0; margin: 6px 0 0; padding: 4px 6px; font-size: 11px; }
`;

export class KtcReorderMembersPanel extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private currentModel: KtcReorderMembersPanelModel | undefined;
  private selection: KtcReorderMembersSelectionState = { selectedUris: [] };
  private showUnchanged = false;

  get model(): KtcReorderMembersPanelModel | undefined { return this.currentModel; }
  set model(value: KtcReorderMembersPanelModel | undefined) {
    this.currentModel = value;
    if (value) {
      this.selection = ktcNextReorderSelection(this.selection, value);
      this.setAttribute("presentation", value.presentation);
    } else {
      this.removeAttribute("presentation");
    }
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
      empty.textContent = "成员排序尚未激活。";
      this.root.replaceChildren(style, empty);
      return;
    }
    const projection = ktcProjectReorderMembersPanel(model, this.selection);
    const shell = document.createElement("section");
    shell.className = "shell";
    shell.setAttribute("aria-label", "C++ 成员排序");

    const title = document.createElement("h2");
    title.textContent = "C++ 成员排序";
    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = "扫描、预览、勾选并确认写回；结果保留在当前 Block。";

    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      this.button("扫描", "action", projection.running, () => this.emit({ kind: "run", action: "preview" })),
      this.button(projection.applyLabel, "action secondary", projection.applyDisabled, () => {
        if (projection.selectedPendingUris.length > 0) {
          this.emit({ kind: "reorderAction", action: "apply", uris: projection.selectedPendingUris });
        }
      }),
    );

    const options = document.createElement("div");
    options.className = "options";
    const filter = document.createElement("label");
    filter.className = "filter";
    const show = document.createElement("input");
    show.type = "checkbox";
    show.checked = this.showUnchanged;
    show.onchange = () => {
      this.showUnchanged = show.checked;
      this.render();
    };
    filter.append(show, document.createTextNode("显示无变更文件"));
    const workset = this.button("加入工作集", "text-button", projection.worksetDisabled, () => {
      this.emit({ kind: "run", action: "addToWorkset" });
    });
    options.append(filter, workset);

    const status = document.createElement("p");
    status.className = "status" + (model.status === "error" ? " error" : "");
    status.textContent = model.message ?? "";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const groups = document.createElement("div");
    groups.className = "groups";
    groups.hidden = !projection.hasCache;
    if (projection.hasCache) {
      groups.append(this.group("变更文件", projection.changedRows, model, {
        pendingRows: projection.pendingRows,
        allSelected: projection.allPendingSelected,
        someSelected: projection.somePendingSelected,
      }));
      if (this.showUnchanged) groups.append(this.group("无变更文件", projection.unchangedRows, model));
    }
    shell.append(title, summary, actions, options, status, groups);
    this.root.replaceChildren(style, shell);
  }

  private group(
    titleText: string,
    rows: readonly KtcReorderMembersPanelRow[],
    model: KtcReorderMembersPanelModel,
    selection?: {
      readonly pendingRows: readonly KtcReorderMembersPanelRow[];
      readonly allSelected: boolean;
      readonly someSelected: boolean;
    },
  ): HTMLElement {
    const group = document.createElement("section");
    group.className = "group";
    const header = document.createElement("div");
    header.className = "group-header";
    if (selection) {
      const all = document.createElement("input");
      all.type = "checkbox";
      all.disabled = selection.pendingRows.length === 0 || model.status === "running";
      all.checked = selection.allSelected;
      all.indeterminate = selection.someSelected;
      all.setAttribute("aria-label", "选择全部待写盘文件");
      all.onchange = () => {
        const pendingUris = new Set(selection.pendingRows.map((row) => row.uri));
        const requested = all.checked
          ? [...pendingUris]
          : this.selection.selectedUris.filter((uri) => !pendingUris.has(uri));
        this.updateSelection(requested);
      };
      header.append(all);
    }
    const label = document.createElement("span");
    label.textContent = `${titleText} · ${rows.length} 个`;
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = `扫描 ${model.scanned || rows.length} 个`;
    header.append(label, detail);
    group.append(header);

    const list = document.createElement("ul");
    list.className = "list";
    for (const row of rows) list.append(this.row(row, model.status === "running", Boolean(selection)));
    group.append(list);
    return group;
  }

  private row(row: KtcReorderMembersPanelRow, running: boolean, selectable: boolean): HTMLElement {
    const item = document.createElement("li");
    item.className = "file-row";
    if (selectable) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selection.selectedUris.includes(row.uri);
      checkbox.disabled = row.state !== "pending" || running;
      checkbox.setAttribute("aria-label", `选择 ${row.relativePath}`);
      checkbox.onchange = () => {
        const selected = new Set(this.selection.selectedUris);
        if (checkbox.checked) selected.add(row.uri); else selected.delete(row.uri);
        this.updateSelection([...selected]);
      };
      item.append(checkbox);
    }
    const kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = row.kind === "header" ? "C" : "C++";
    const main = document.createElement("span");
    main.className = "file-main";
    const parts = row.relativePath.split("/");
    const file = parts.pop() || row.relativePath;
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file;
    const directory = document.createElement("span");
    directory.className = "file-dir";
    directory.textContent = parts.join("/");
    main.append(name, directory);
    main.title = [row.relativePath, row.encoding, ...row.warnings].join("\n");
    main.onclick = () => this.emit({ kind: "reorderAction", action: "open", uris: [row.uri] });
    const inline = document.createElement("span");
    inline.className = "inline";
    if (!running && row.state === "pending") {
      inline.append(
        this.icon("⇄", "预览排序差异", "preview", row.uri),
        this.icon("✓", "应用此文件", "apply", row.uri),
        this.icon("×", "从本次结果移除", "cancel", row.uri),
      );
    } else if (!running && row.state === "applied") {
      inline.append(
        this.icon("⇄", "在 VS Code Git 中查看差异", "gitDiff", row.uri),
        this.icon("↶", "还原本次成员排序", "revert", row.uri),
      );
    }
    const status = document.createElement("span");
    status.className = `state ${row.state}`;
    status.textContent = ktcReorderStateMark(row.state);
    status.title = `${ktcReorderStateLabel(row.state)} · ${row.encoding}`;
    item.append(kind, main, inline, status);
    return item;
  }

  private button(
    label: string,
    className: string,
    disabled: boolean,
    action: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.disabled = disabled;
    button.onclick = action;
    return button;
  }

  private icon(
    text: string,
    title: string,
    action: "preview" | "apply" | "cancel" | "gitDiff" | "revert",
    uri: string,
  ): HTMLButtonElement {
    const button = this.button(text, "icon", false, () => {
      this.emit({ kind: "reorderAction", action, uris: [uri] });
    });
    button.title = title;
    button.setAttribute("aria-label", title);
    return button;
  }

  private updateSelection(requestedUris: readonly string[]): void {
    if (!this.currentModel) return;
    this.selection = ktcSetReorderSelection(this.selection, this.currentModel, requestedUris);
    const uris = [...this.selection.selectedUris];
    this.render();
    this.emit({ kind: "reorderSelection", uris });
  }

  private emit(detail: KtcReorderMembersPanelActionDetail): void {
    this.dispatchEvent(new CustomEvent<KtcReorderMembersPanelActionDetail>(
      KTC_REORDER_MEMBERS_PANEL_ACTION,
      { bubbles: true, composed: true, detail },
    ));
  }
}

export function ktcDefineReorderMembersPanel(
  tagName = KTC_REORDER_MEMBERS_PANEL_TAG,
): typeof KtcReorderMembersPanel {
  const registered = customElements.get(tagName);
  if (registered) return registered as typeof KtcReorderMembersPanel;
  customElements.define(tagName, KtcReorderMembersPanel);
  return KtcReorderMembersPanel;
}

declare global {
  interface HTMLElementTagNameMap {
    "ktc-reorder-members-panel": KtcReorderMembersPanel;
  }
}
