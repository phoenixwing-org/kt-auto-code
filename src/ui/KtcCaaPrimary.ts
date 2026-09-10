import { ktcCreatePrimaryActionBar, type KtcPrimaryActionBar } from "./KtcPrimaryActionBar.js";

export const KTC_CAA_PRIMARY_ACTION = "ktc-caa-primary-action";
export interface KtcCaaPrimaryModel {
  readonly running: boolean;
  readonly canScan: boolean;
  readonly resultActionsEnabled: boolean;
  readonly message: string;
  readonly notice?: string;
  readonly environmentText?: string;
  readonly connection: { readonly status: string; readonly text: string };
  readonly rows?: readonly { readonly uri: string; readonly relativePath: string; readonly selected?: boolean }[];
}
export type KtcCaaPrimaryActionDetail =
  | { readonly actionId: "scan" | "settings" | "checkConnection" }
  | { readonly actionId: "open" | "openExternal"; readonly uri: string };

const STYLE = `
 :host { display:block; min-width:0; width:100%; color:var(--vscode-foreground); font:var(--vscode-font-size,13px)/1.4 var(--vscode-font-family,system-ui); }
 :host([hidden]) { display:none!important; } * { box-sizing:border-box; }
 section { margin:0; min-width:0; border-bottom:1px solid var(--vscode-panel-border); }
 h3 { margin:0; padding:5px 8px; font-size:12px; font-weight:600; color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground)); background:var(--vscode-sideBarSectionHeader-background); }
 p { margin:0; padding:6px 8px; overflow-wrap:anywhere; }
 .notice,.environment,.empty { color:var(--vscode-descriptionForeground); font-size:12px; }
 [hidden] { display:none!important; }
 .file { display:flex; align-items:center; gap:5px; min-width:0; padding:5px 8px; border-bottom:1px solid var(--vscode-panel-border); }
 .file:last-child { border-bottom:0; }
 .file:hover { background:var(--vscode-list-hoverBackground); }
 button { font:inherit; color:var(--vscode-button-secondaryForeground,var(--vscode-foreground)); background:var(--vscode-button-secondaryBackground,var(--vscode-input-background)); border:1px solid var(--vscode-button-border,var(--vscode-panel-border)); min-height:28px; padding:2px 6px; cursor:pointer; white-space:nowrap; }
 button:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
 button:disabled { opacity:.5; cursor:default; }
 .path { min-width:0; flex:1 1 0; overflow:hidden; text-overflow:ellipsis; text-align:left; border:0; background:transparent; color:inherit; padding:2px 0; }
 .path strong { font-weight:600; } .relative { color:var(--vscode-descriptionForeground); font-size:12px; }
 .tail { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
 .badge { font-size:11px; white-space:nowrap; color:var(--vscode-descriptionForeground); }
 @media (forced-colors:active) { section,.file,button { border-color:CanvasText; } }
`;

/** Host-neutral presentation only. File access and Desk Tools transport belong to the consumer. */
export class KtcCaaPrimary extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private value?: KtcCaaPrimaryModel;
  private toolbar?: KtcPrimaryActionBar;
  private notice!: HTMLParagraphElement;
  private connection!: HTMLParagraphElement;
  private environment!: HTMLParagraphElement;
  private status!: HTMLParagraphElement;
  private heading!: HTMLElement;
  private empty!: HTMLParagraphElement;
  private files!: HTMLElement;
  private readonly rows = new Map<string, {
    element: HTMLElement; path: HTMLButtonElement; name: HTMLElement; relative: HTMLElement;
    badge: HTMLElement; open: HTMLButtonElement; external: HTMLButtonElement;
  }>();

  connectedCallback(): void {
    // Upgrade a model assigned before custom-element registration without
    // leaving an own property that shadows the class accessor.
    if (Object.prototype.hasOwnProperty.call(this, "model")) {
      const model = this.model;
      delete (this as { model?: KtcCaaPrimaryModel }).model;
      this.model = model;
      return;
    }
    this.render();
  }
  get model(): KtcCaaPrimaryModel | undefined { return this.value; }
  set model(value: KtcCaaPrimaryModel | undefined) { this.value = value; this.render(); }

  private emit(detail: KtcCaaPrimaryActionDetail): void {
    const model = this.value;
    if (!model || model.running) return;
    if (detail.actionId === "scan" && !model.canScan) return;
    if ("uri" in detail && (!model.resultActionsEnabled || !model.rows?.some((row) => row.uri === detail.uri))) return;
    this.dispatchEvent(new CustomEvent(KTC_CAA_PRIMARY_ACTION, { detail, bubbles: true, composed: true }));
  }

  private ensureDom(): void {
    if (this.toolbar) return;
    const style = document.createElement("style"); style.textContent = STYLE;
    this.toolbar = ktcCreatePrimaryActionBar({ label: "CAA UI 操作", actions: [] }, (actionId) => {
      if (actionId === "scan" || actionId === "settings" || actionId === "checkConnection") this.emit({ actionId });
    });
    this.notice = document.createElement("p"); this.notice.className = "notice";
    const connection = document.createElement("section");
    const title = document.createElement("h3"); title.textContent = "Desk Tools";
    this.connection = document.createElement("p"); this.connection.setAttribute("role", "status");
    this.environment = document.createElement("p"); this.environment.className = "environment";
    connection.append(title, this.connection, this.environment);
    const results = document.createElement("section");
    this.heading = document.createElement("h3");
    this.status = document.createElement("p"); this.status.setAttribute("role", "status");
    this.files = document.createElement("div"); this.files.setAttribute("role", "list"); this.files.setAttribute("aria-label", "CATDlg 文件");
    this.empty = document.createElement("p"); this.empty.className = "empty";
    results.append(this.heading, this.status, this.files, this.empty);
    this.root.append(style, this.toolbar, this.notice, connection, results);
  }

  private createRow(uri: string) {
    const element = document.createElement("div"); element.className = "file"; element.setAttribute("role", "listitem");
    const path = document.createElement("button"); path.type = "button"; path.className = "path";
    const name = document.createElement("strong");
    const relative = document.createElement("span"); relative.className = "relative";
    path.append(name, relative); path.onclick = () => this.emit({ actionId: "open", uri });
    const tail = document.createElement("div"); tail.className = "tail";
    const badge = document.createElement("span"); badge.className = "badge";
    const button = (label: string, actionId: "open" | "openExternal") => {
      const control = document.createElement("button"); control.type = "button"; control.textContent = label;
      control.onclick = () => this.emit({ actionId, uri }); return control;
    };
    const open = button("打开", "open"); const external = button("Desk Tools", "openExternal");
    tail.append(badge, open, external); element.append(path, tail);
    return { element, path, name, relative, badge, open, external };
  }

  private render(): void {
    this.ensureDom();
    const model = this.value;
    const enabled = Boolean(model && !model.running);
    const disabledTitle = model?.running ? "正在处理，请稍候" : "请先选择工作目录";
    this.toolbar!.model = { label: "CAA UI 操作", actions: [
      { id: "scan", label: "扫描 CATDlg", primary: true, enabled: enabled && Boolean(model?.canScan), title: enabled && model?.canScan ? "定位当前目录中的 CATDlg 文件" : disabledTitle },
      { id: "settings", label: "Desk Tools 设置", enabled, title: "打开 Desk Tools 机器级设置" },
      { id: "checkConnection", label: model?.connection.status === "online" ? "重新检测" : "连接 Desk Tools", enabled, title: "检测 Desk Tools 连接" },
    ] };
    this.notice.textContent = model?.notice ?? ""; this.notice.hidden = !model?.notice;
    this.connection.textContent = model?.connection.text ?? "尚未检测连接";
    this.environment.textContent = model?.environmentText ?? ""; this.environment.hidden = !model?.environmentText;
    this.status.textContent = model?.message ?? ""; this.status.hidden = !model?.message;
    this.heading.textContent = model?.rows ? `CATDlg 文件 · ${model.rows.length} 个` : "CATDlg 文件";
    this.setAttribute("aria-busy", String(Boolean(model?.running)));
    const wanted = (model?.rows ?? []).map((item) => {
      let row = this.rows.get(item.uri);
      if (!row) { row = this.createRow(item.uri); this.rows.set(item.uri, row); }
      const slash = item.relativePath.replace(/\\/g, "/").lastIndexOf("/");
      row.name.textContent = item.relativePath.slice(slash + 1);
      row.relative.textContent = slash < 0 ? "" : ` · ${item.relativePath.slice(0, slash)}`;
      row.path.title = item.relativePath; row.path.setAttribute("aria-label", `打开 ${item.relativePath}`);
      row.badge.textContent = item.selected ? "已交接" : ""; row.badge.hidden = !item.selected;
      row.open.title = `在 VS Code 中打开 ${item.relativePath}`;
      row.external.title = `在 Desk Tools 中打开 ${item.relativePath}`;
      for (const control of [row.path, row.open, row.external]) control.disabled = !enabled || !model?.resultActionsEnabled;
      row.element.title = model?.resultActionsEnabled ? item.relativePath : "结果已失效，请重新扫描";
      return row.element;
    });
    for (const key of this.rows.keys()) if (!model?.rows?.some((row) => row.uri === key)) this.rows.delete(key);
    if (wanted.length !== this.files.children.length || wanted.some((row, index) => row !== this.files.children[index])) this.files.replaceChildren(...wanted);
    this.empty.hidden = Boolean(model?.rows?.length);
    this.empty.textContent = model?.rows ? "没有找到 .CATDlg 文件。" : "点击“扫描 CATDlg”定位文件。";
  }
}

export function ktcDefineCaaPrimary(): void {
  if (!customElements.get("ktc-caa-primary")) customElements.define("ktc-caa-primary", KtcCaaPrimary);
}
