/** Host-neutral YAML source block. Dialog-level actions live in the dialog Header. */
import type { KtcCleanupYamlWorkspaceModel } from "../core/cleanupYamlContracts.js";
export type { KtcCleanupYamlSource, KtcCleanupYamlWorkspaceModel } from "../core/cleanupYamlContracts.js";
export type KtcCleanupYamlAction =
  | { readonly kind: "edit-rules" | "discover" }
  | { readonly kind: "open-source"; readonly sourceId: string }
  | { readonly kind: "clean-source"; readonly sourceId: string; readonly revision: number };

const STYLE = `
:host { display: block; min-width: 0; color: var(--vscode-foreground); font: inherit; }
* { box-sizing: border-box; }
button, input { font: inherit; }
button { min-height: 26px; padding: 3px 8px; white-space: nowrap; cursor: pointer; border: 1px solid var(--vscode-button-border,var(--vscode-panel-border)); background: var(--vscode-button-secondaryBackground,var(--vscode-editorWidget-background)); color: var(--vscode-button-secondaryForeground,var(--vscode-foreground)); }
button:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground,var(--vscode-list-hoverBackground)); }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, input:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
details { border: 1px solid var(--vscode-panel-border); }
summary { cursor: pointer; padding: 6px 8px; font-weight: 600; background: var(--vscode-sideBarSectionHeader-background,rgba(128,128,128,.12)); }
summary:hover { background: var(--vscode-list-hoverBackground,rgba(128,128,128,.16)); }
summary:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
.sources { margin: 8px 0; border: 1px solid var(--vscode-panel-border); }
.source { display: flex; align-items: center; gap: 6px; padding: 5px 6px; }
.source + .source { border-top: 1px solid var(--vscode-panel-border); }
.label { flex: 1; min-width: 0; }
.path { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status, .notice, .empty { color: var(--vscode-descriptionForeground); font-size: 12px; margin: 6px 0; overflow-wrap: anywhere; }
.status { display: block; margin: 1px 0 0; }
.empty { padding: 0 6px; }
`;

export class KtcCleanupYamlWorkspace extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private current: KtcCleanupYamlWorkspaceModel = { sources: [], busy: false };
  private expanded = true;
  set model(value: KtcCleanupYamlWorkspaceModel) { this.current = value; this.render(); }
  get model(): KtcCleanupYamlWorkspaceModel { return this.current; }
  connectedCallback(): void { this.render(); }
  private emit(detail: KtcCleanupYamlAction): void {
    if (this.current.busy) return;
    this.dispatchEvent(new CustomEvent("ktc-cleanup-yaml-action", { detail, bubbles: true, composed: true }));
  }
  private button(text: string, key: string, action: KtcCleanupYamlAction): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button"; button.textContent = text; button.dataset.focus = key;
    button.disabled = this.current.busy;
    button.onclick = () => this.emit(action);
    return button;
  }
  private render(): void {
    const focused = (this.root.activeElement as HTMLElement | null)?.dataset.focus;
    const style = document.createElement("style"); style.textContent = STYLE;
    const block = document.createElement("details"); block.open = this.expanded;
    const summary = document.createElement("summary"); summary.textContent = `配置 YAML 列表 · ${this.current.sources.length}`;
    summary.onclick = (event) => { event.preventDefault(); block.open = !block.open; this.expanded = block.open; };
    block.ontoggle = () => { if (block.isConnected) this.expanded = block.open; };
    block.append(summary);
    const sources = document.createElement("section"); sources.className = "sources"; sources.setAttribute("aria-label", "探测到的 cleanup.yaml");
    for (const item of this.current.sources) {
      const row = document.createElement("div"); row.className = "source";
      const label = document.createElement("span"); label.className = "label";
      const path = document.createElement("span"); path.className = "path"; path.textContent = item.path; path.title = item.path;
      const status = document.createElement("span"); status.className = "status"; status.setAttribute("role", "status");
      status.textContent = item.status ?? "待清理"; status.title = `清理根目录：${item.root}；仅直属项，不跟随目录链接。`;
      label.append(path, status);
      const open = this.button("打开", `source-open:${item.id}`, { kind: "open-source", sourceId: item.id });
      open.setAttribute("aria-label", `打开 ${item.path}`); open.title = "使用 VS Code 原生编辑器打开；不在清理框内编辑文件";
      const clean = this.button("清理", `source-clean:${item.id}`, { kind: "clean-source", sourceId: item.id, revision: item.revision });
      clean.disabled ||= Boolean(item.disabledReason); clean.setAttribute("aria-label", `清理 ${item.root}`);
      clean.title = item.disabledReason ?? `直接按 ${item.path} 清理；不额外确认`;
      row.title = item.disabledReason ?? `清理根目录：${item.root}`;
      row.append(label, open, clean); sources.append(row);
    }
    if (!this.current.sources.length) {
      const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = "未发现 cleanup.yaml。可在 VS Code 中编辑并自行保存规则，再探测配置。"; sources.append(empty);
    }
    block.append(sources);
    if (this.current.notice) { const notice = document.createElement("p"); notice.className = "notice"; notice.setAttribute("role", "status"); notice.textContent = this.current.notice; block.append(notice); }
    this.root.replaceChildren(style, block);
    if (focused) Array.from(this.root.querySelectorAll<HTMLElement>("[data-focus]")).find((item) => item.dataset.focus === focused)?.focus();
  }
}

export function ktcDefineCleanupYamlWorkspace(): void {
  if (!customElements.get("ktc-cleanup-yaml-workspace")) customElements.define("ktc-cleanup-yaml-workspace", KtcCleanupYamlWorkspace);
}
