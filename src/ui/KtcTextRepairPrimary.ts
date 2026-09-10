import { ktcCreatePrimaryActionBar } from "./KtcPrimaryActionBar.js";
import { KtcCompactManagerLabelStyle } from "./KtcCompactManagerLabel.js";

export type KtcTextRepairKind = "headerAscii" | "encodingFix";
export type KtcTextRepairScopeKey = "includeHeaders" | "includeSource" | "includeMarkdown";
export interface KtcTextRepairRow {
  readonly id: string;
  readonly relativePath: string;
  readonly fullPath: string;
  readonly badge: string;
  readonly tone?: "warning" | "success" | "error";
  readonly highlightNonAscii?: boolean;
  readonly description?: string;
  readonly detail?: string;
  readonly line?: number;
  readonly issues?: readonly { readonly line: number; readonly column: number; readonly from: string; readonly to: string }[];
}
export interface KtcTextRepairPrimaryModel {
  readonly kind: KtcTextRepairKind;
  readonly directory: string;
  readonly busy: boolean;
  readonly scanEnabled: boolean;
  readonly writeEnabled: boolean;
  readonly disabledReason?: string;
  readonly scope: Readonly<Record<KtcTextRepairScopeKey, boolean>>;
  readonly preserveGbk: boolean;
  readonly stripBom: boolean;
  readonly showDetails: boolean;
  readonly targetEncoding: "utf8" | "gbk";
  readonly targetSummary: string;
  readonly status: string;
  readonly statusTone?: "error";
  readonly summary: string;
  readonly emptyMessage: string;
  readonly rows: readonly KtcTextRepairRow[];
}
export type KtcTextRepairPrimaryAction =
  | { readonly action: "scan" | "fix" | "convert" | "settings" }
  | { readonly action: "setScope"; readonly key: KtcTextRepairScopeKey; readonly value: boolean }
  | { readonly action: "setOption"; readonly key: "preserveGbk" | "stripBom" | "showDetails"; readonly value: boolean }
  | { readonly action: "setTarget"; readonly value: "utf8" | "gbk" }
  | { readonly action: "open"; readonly rowId: string; readonly line?: number };

export const KTC_TEXT_REPAIR_PRIMARY_TAG = "ktc-text-repair-primary";
export const KTC_TEXT_REPAIR_PRIMARY_ACTION = "ktc-text-repair-primary-action";

const STYLE = `
 :host { display:block; min-width:0; color:var(--vscode-foreground); font:var(--vscode-font-size,13px)/1.4 var(--vscode-font-family,system-ui); }
 :host([hidden]),[hidden] { display:none !important; } * { box-sizing:border-box; }
 .block { margin:0; padding:6px 8px; border-bottom:1px solid var(--vscode-panel-border); }
 h3 { font:inherit; font-weight:600; margin:0 0 5px; } p { margin:4px 0; }
 .scope { display:flex; flex-wrap:wrap; gap:6px 12px; } label { display:flex; align-items:center; gap:5px; min-width:0; }
 .options { display:grid; gap:6px; } input { margin:0; accent-color:var(--vscode-focusBorder); }
 select { min-width:0; padding:3px; font:inherit; color:var(--vscode-dropdown-foreground); background:var(--vscode-dropdown-background); border:1px solid var(--vscode-dropdown-border,var(--vscode-panel-border)); }
 .muted { color:var(--vscode-descriptionForeground); font-size:12px; } .status { overflow-wrap:anywhere; }
 .status.error,.badge.error { color:var(--vscode-errorForeground); }
 mark.result-hit { padding:0 1px; color:inherit; background:var(--vscode-editor-findMatchBackground,var(--vscode-editor-findMatchHighlightBackground)); outline:1px solid var(--vscode-editor-findMatchBorder,transparent); }
 .results { padding:0; } .results h3,.empty { padding:5px 8px; margin:0; }
 .result { border-top:1px solid var(--vscode-panel-border); } .row { display:flex; align-items:center; gap:6px; min-width:0; padding:5px 8px; }
 button { font:inherit; color:inherit; background:none; border:1px solid transparent; cursor:pointer; }
 button:hover { background:var(--vscode-list-hoverBackground); } button:focus-visible,input:focus-visible,select:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
 button:disabled { opacity:.55; cursor:default; } .open { padding:0; text-align:left; flex:1 1 auto; min-width:0; }
 .badge { flex:0 0 auto; font-size:11px; color:var(--vscode-descriptionForeground); }
 .badge.warning { color:var(--vscode-editorWarning-foreground,var(--vscode-foreground)); } .badge.success { color:var(--vscode-testing-iconPassed,var(--vscode-foreground)); }
 .description,.detail { padding:0 8px 5px; overflow-wrap:anywhere; } .issues { margin:0; padding:0 8px 5px; list-style:none; }
 .issues button { text-align:left; max-width:100%; overflow-wrap:anywhere; padding:2px 0; }
`;

/** Serialisable presentation only: the consumer owns scans, confirmation, policy and file I/O. */
export class KtcTextRepairPrimary extends HTMLElement {
  private current?: KtcTextRepairPrimaryModel;
  private readonly root = this.attachShadow({ mode: "open" });
  private readonly bar = ktcCreatePrimaryActionBar({ label: "文本修正操作", actions: [] }, id => {
    if (!this.current || this.current.busy) return;
    if (id === "scan" && this.current.scanEnabled) this.emit({ action: "scan" });
    else if ((id === "fix" || id === "convert") && this.current.writeEnabled) this.emit({ action: id });
    else if (id === "settings" && this.current.kind === "encodingFix") this.emit({ action: "settings" });
  });
  private readonly scopeInputs = new Map<KtcTextRepairScopeKey, HTMLInputElement>();
  private readonly optionInputs = new Map<"preserveGbk" | "stripBom" | "showDetails", HTMLInputElement>();
  private readonly scopeBlock = document.createElement("section");
  private readonly optionBlock = document.createElement("section");
  private readonly targetBlock = document.createElement("section");
  private readonly target = document.createElement("select");
  private readonly targetSummary = document.createElement("p");
  private readonly optionHint = document.createElement("p");
  private readonly status = document.createElement("p");
  private readonly summary = document.createElement("p");
  private readonly results = document.createElement("section");
  private rowsSignature = "";

  constructor() {
    super();
    const style = document.createElement("style"); style.textContent = STYLE + KtcCompactManagerLabelStyle;
    this.scopeBlock.className = "block";
    this.scopeBlock.append(this.heading("范围"));
    const scope = document.createElement("div"); scope.className = "scope";
    for (const [key, text] of [["includeHeaders", "头文件"], ["includeSource", "源文件"], ["includeMarkdown", ".md 文档"]] as const) {
      const input = this.checkbox(text, value => this.emit({ action: "setScope", key, value }));
      this.scopeInputs.set(key, input); scope.append(input.parentElement!);
    }
    this.scopeBlock.append(scope);
    this.optionBlock.className = "block options";
    for (const [key, text] of [["preserveGbk", "保留 GBK 中文注释"], ["stripBom", "去除 BOM（含 UTF-8 BOM / UTF-16）→ UTF-8"], ["showDetails", "显示详细"]] as const) {
      const input = this.checkbox(text, value => this.emit({ action: "setOption", key, value }));
      this.optionInputs.set(key, input); this.optionBlock.append(input.parentElement!);
    }
    this.optionHint.className = "muted"; this.optionBlock.append(this.optionHint);
    this.targetBlock.className = "block options";
    const label = document.createElement("label"); label.textContent = "默认目标";
    this.target.setAttribute("aria-label", "当前项目默认目标编码");
    for (const [value, text] of [["utf8", "UTF-8"], ["gbk", "GBK（本地）"]]) {
      const option = document.createElement("option"); option.value = value!; option.textContent = text!; this.target.append(option);
    }
    this.target.addEventListener("change", () => { if (!this.current?.busy) this.emit({ action: "setTarget", value: this.target.value === "gbk" ? "gbk" : "utf8" }); });
    label.append(this.target); this.targetSummary.className = "muted"; this.targetBlock.append(label, this.targetSummary);
    const stateBlock = document.createElement("section"); stateBlock.className = "block";
    this.status.className = "status"; this.status.setAttribute("role", "status"); this.status.setAttribute("aria-live", "polite");
    this.summary.className = "muted"; stateBlock.append(this.status, this.summary);
    this.results.className = "results";
    this.root.append(style, this.bar, this.scopeBlock, this.targetBlock, this.optionBlock, stateBlock, this.results);
  }
  connectedCallback(): void {
    // Upgrade a model assigned before custom-element registration without replacing its accessor.
    if (Object.prototype.hasOwnProperty.call(this, "model")) {
      const model = this.model;
      delete (this as { model?: KtcTextRepairPrimaryModel }).model;
      if (model) this.model = model;
    }
  }
  set model(model: KtcTextRepairPrimaryModel) { this.current = model; this.render(); }
  get model(): KtcTextRepairPrimaryModel | undefined { return this.current; }
  private heading(text: string): HTMLElement { const node = document.createElement("h3"); node.textContent = text; return node; }
  private checkbox(text: string, change: (value: boolean) => void): HTMLInputElement {
    const label = document.createElement("label"), input = document.createElement("input"), span = document.createElement("span");
    input.type = "checkbox"; input.setAttribute("aria-label", text); span.textContent = text; label.append(input, span);
    input.addEventListener("change", () => { if (!this.current?.busy && !input.disabled) change(input.checked); });
    return input;
  }
  private emit(detail: KtcTextRepairPrimaryAction): void {
    this.dispatchEvent(new CustomEvent(KTC_TEXT_REPAIR_PRIMARY_ACTION, { detail, bubbles: true, composed: true }));
  }
  private render(): void {
    const model = this.current!;
    const header = model.kind === "headerAscii";
    this.setAttribute("aria-busy", String(model.busy));
    this.bar.model = { label: header ? "头文件 ASCII 操作" : "编码修正操作", actions: [
      { id: "scan", label: "预检", enabled: !model.busy && model.scanEnabled, title: model.disabledReason ?? "预检当前工作目录" },
      { id: header ? "fix" : "convert", label: header ? "修复" : "转换", enabled: !model.busy && model.writeEnabled, primary: true, title: model.disabledReason ?? "重新核对当前范围后确认处理" },
      ...(!header ? [{ id: "settings", label: "更多设置", enabled: !model.busy, title: "配置头文件、源文件和 Markdown 的项目级目标" }] : []),
    ] };
    for (const [key, input] of this.scopeInputs) {
      input.checked = model.scope[key]; input.disabled = model.busy || (header && key === "includeMarkdown");
      input.parentElement!.hidden = header && key === "includeMarkdown";
    }
    for (const [key, input] of this.optionInputs) {
      input.checked = model[key]; input.disabled = model.busy;
      input.parentElement!.hidden = !header && key !== "showDetails";
    }
    const detail = this.optionInputs.get("showDetails")!;
    const detailLabel = header ? "显示详细（原字符 → 修正为）" : "显示详细（BOM 十六进制、检测说明）";
    detail.setAttribute("aria-label", detailLabel); detail.nextElementSibling!.textContent = detailLabel;
    this.optionHint.hidden = !header;
    this.optionHint.textContent = `${model.preserveGbk ? "仅修复弯引号等问题字节，GBK 中文保留。" : "纯 ASCII：替换非 ASCII 内容（包括中文）。"}${model.stripBom ? "去除 BOM 并转为 UTF-8。" : "宽字节 BOM 文件跳过字节级修复。"}`;
    this.targetBlock.hidden = header; this.target.value = model.targetEncoding; this.target.disabled = model.busy;
    this.targetSummary.textContent = model.targetSummary;
    this.status.textContent = model.status; this.status.className = model.statusTone === "error" ? "status error" : "status"; this.summary.textContent = model.summary;
    const signature = JSON.stringify([model.kind, model.rows, model.emptyMessage]);
    if (signature !== this.rowsSignature) { this.rowsSignature = signature; this.renderRows(); }
    for (const node of Array.from(this.results.querySelectorAll<HTMLElement>(".detail,.issues"))) node.hidden = !model.showDetails;
    for (const button of Array.from(this.results.querySelectorAll<HTMLButtonElement>("button"))) button.disabled = model.busy;
  }
  private renderRows(): void {
    const model = this.current!;
    this.results.replaceChildren(this.heading(model.kind === "headerAscii" ? "问题文件" : "编码结果"));
    if (!model.rows.length) { const empty = document.createElement("p"); empty.className = "empty muted"; empty.textContent = model.emptyMessage; empty.hidden = !model.emptyMessage; this.results.append(empty); return; }
    for (const row of model.rows) {
      const wrapper = document.createElement("div"), line = document.createElement("div"), open = document.createElement("button"), label = document.createElement("span");
      wrapper.className = "result"; line.className = "row"; open.className = "open"; open.type = "button";
      open.title = row.fullPath; open.setAttribute("aria-label", `${model.kind === "headerAscii" ? "打开并定位" : "打开文件"} ${row.fullPath}`);
      open.addEventListener("click", () => { if (!this.current?.busy) this.emit({ action: "open", rowId: row.id, ...(row.line ? { line: row.line } : {}) }); });
      label.className = "ktc-compact-label";
      const path = row.relativePath.replace(/\\/g, "/"), index = path.lastIndexOf("/");
      const name = document.createElement("span"), directory = document.createElement("span");
      name.className = "ktc-compact-label-primary";
      const fileName = path.slice(index + 1);
      if (row.highlightNonAscii) {
        let offset = 0;
        for (const match of fileName.matchAll(/[^\x00-\x7f]+/gu)) {
          name.append(document.createTextNode(fileName.slice(offset, match.index)));
          const mark = document.createElement("mark"); mark.className = "result-hit"; mark.textContent = match[0]; name.append(mark);
          offset = match.index! + match[0].length;
        }
        name.append(document.createTextNode(fileName.slice(offset)));
      } else name.textContent = fileName;
      directory.className = "ktc-compact-label-secondary"; directory.textContent = index < 0 ? "" : ` · ${path.slice(0, index)}`;
      label.append(name, directory); open.append(label);
      const badge = document.createElement("span"); badge.className = `badge ${row.tone ?? ""}`; badge.textContent = row.badge; badge.title = row.description ?? row.badge;
      line.append(open, badge); wrapper.append(line);
      for (const [className, text] of [["description", row.description], ["detail", row.detail]] as const) {
        if (!text) continue;
        const node = document.createElement("div"); node.className = `${className} muted`; node.textContent = text; wrapper.append(node);
      }
      if (row.issues?.length) {
        const issues = document.createElement("ul"); issues.className = "issues";
        for (const issue of row.issues) {
          const li = document.createElement("li"), button = document.createElement("button"); button.type = "button";
          button.textContent = `L${issue.line}:C${issue.column} ${issue.from} → ${issue.to}`;
          button.title = `${row.fullPath}:${issue.line}:${issue.column}`;
          button.addEventListener("click", () => { if (!this.current?.busy) this.emit({ action: "open", rowId: row.id, line: issue.line }); });
          li.append(button); issues.append(li);
        }
        wrapper.append(issues);
      }
      this.results.append(wrapper);
    }
  }
}
export function ktcDefineTextRepairPrimary(): void {
  if (!customElements.get(KTC_TEXT_REPAIR_PRIMARY_TAG)) customElements.define(KTC_TEXT_REPAIR_PRIMARY_TAG, KtcTextRepairPrimary);
}
declare global { interface HTMLElementTagNameMap { "ktc-text-repair-primary": KtcTextRepairPrimary; } }
