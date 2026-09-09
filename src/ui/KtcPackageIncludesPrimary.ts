import {
  KTC_PACKAGE_INCLUDES_PATH_MAX_LENGTH,
  ktcIsPackageIncludesDirectoryDraft,
  type KtcPackageIncludesDirectoryDraft,
  type KtcPackageIncludesPrimaryActionDetail,
  type KtcPackageIncludesPrimaryPanelModel,
} from "../core/packageIncludesPrimaryContracts.js";
import { ktcDefineIgnorePolicyBlock, type KtcIgnorePolicyBlock } from "./KtcIgnorePolicyBlock.js";

export const KTC_PACKAGE_INCLUDES_PRIMARY_TAG = "ktc-package-includes-primary";
export const KTC_PACKAGE_INCLUDES_PRIMARY_ACTION = "ktc-package-includes-primary-action";

const STYLE = `
 :host { display:block; min-width:0; font:var(--vscode-font-size,13px)/1.35 var(--vscode-font-family,system-ui); color:var(--vscode-foreground); }
 :host([hidden]) { display:none !important; } * { box-sizing:border-box; }
 .preview-package-actions { display:flex; flex-wrap:wrap; gap:4px; padding:5px 8px; border-bottom:1px solid var(--vscode-panel-border); }
 button { min-height:30px; padding:3px 8px; border:1px solid var(--vscode-button-border,var(--vscode-panel-border)); color:var(--vscode-button-secondaryForeground,var(--vscode-foreground)); background:var(--vscode-button-secondaryBackground,var(--vscode-input-background)); font:inherit; cursor:pointer; white-space:nowrap; }
 button.is-primary { color:var(--vscode-button-foreground); background:var(--vscode-button-background); border-color:var(--vscode-button-background); }
 button:disabled,input:disabled { opacity:.5; cursor:default; }
 button:focus-visible,input:focus-visible { outline:1px solid var(--vscode-focusBorder); outline-offset:-1px; }
 .preview-package-directories { border-bottom:1px solid var(--vscode-panel-border); }
 h3 { margin:0; padding:5px 8px; font-size:12px; background:var(--vscode-sideBarSectionHeader-background); }
 .preview-package-directory-body { display:grid; gap:6px; padding:6px 8px; }
 .preview-package-directory-row { display:grid; grid-template-columns:2em minmax(0,1fr) auto auto; align-items:center; gap:4px; min-width:0; }
 .preview-package-directory-row > span { color:var(--vscode-descriptionForeground); font-size:11px; }
 input { width:100%; min-width:0; height:28px; padding:3px 6px; font:inherit; color:var(--vscode-input-foreground); background:var(--vscode-input-background); border:1px solid var(--vscode-input-border,var(--vscode-panel-border)); text-overflow:ellipsis; }
 input[aria-invalid=true] { border-color:var(--vscode-inputValidation-warningBorder,var(--vscode-editorWarning-foreground)); }
 .is-target input { grid-column:2 / -1; }
 .preview-package-directory-row button { min-height:28px; padding:2px 6px; }
 .preview-package-scan-status { margin:0; padding:7px 8px; font-size:11px; line-height:1.4; color:var(--vscode-descriptionForeground); border-bottom:1px solid var(--vscode-panel-border); }
 .preview-companion-facts { display:grid; grid-template-columns:max-content minmax(0,1fr); column-gap:8px; margin:0; padding:0 8px; }
 dt,dd { min-width:0; margin:0; padding:4px 0; border-bottom:1px solid var(--vscode-panel-border); }
 dt { color:var(--vscode-descriptionForeground); } dd { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
 @media(forced-colors:active) { input,button { border-color:CanvasText; } }
`;

function sameDraft(a: KtcPackageIncludesDirectoryDraft, b: KtcPackageIncludesDirectoryDraft): boolean {
  return a.packageDirectory === b.packageDirectory && a.targetDirectory === b.targetDirectory;
}

/** Shared Primary DOM. Owns only transient input acknowledgement and disclosure state. */
export class KtcPackageIncludesPrimary extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private current?: KtcPackageIncludesPrimaryPanelModel;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private packageInput!: HTMLInputElement;
  private targetInput!: HTMLInputElement;
  private ignore!: KtcIgnorePolicyBlock;
  private status!: HTMLParagraphElement;
  private summary!: HTMLDListElement;
  private draft?: KtcPackageIncludesDirectoryDraft;
  private inFlight?: KtcPackageIncludesDirectoryDraft;
  private inFlightRevision = -1;
  private pendingPreview = false;

  connectedCallback(): void {
    if (Object.prototype.hasOwnProperty.call(this, "model")) {
      const model = this.model;
      delete (this as unknown as { model?: KtcPackageIncludesPrimaryPanelModel }).model;
      this.model = model;
    }
    this.render();
  }

  set model(value: KtcPackageIncludesPrimaryPanelModel | undefined) {
    if (value?.sessionId !== this.current?.sessionId || !value?.ready) {
      this.draft = this.inFlight = undefined;
      this.pendingPreview = false;
    }
    this.current = value;
    if (value && this.inFlight && (sameDraft(value, this.inFlight) || value.revision > this.inFlightRevision)) this.inFlight = undefined;
    if (value && this.draft && sameDraft(value, this.draft)) this.draft = undefined;
    this.render();
    this.flushDraft();
  }
  get model(): KtcPackageIncludesPrimaryPanelModel | undefined { return this.current; }

  private enabled(id: string): boolean {
    return Boolean(this.current?.ready && this.current.actions.some((action) => action.id === id && action.enabled));
  }
  private emit(detail: KtcPackageIncludesPrimaryActionDetail): void {
    this.dispatchEvent(new CustomEvent(KTC_PACKAGE_INCLUDES_PRIMARY_ACTION, { detail, bubbles: true, composed: true }));
  }
  private flushDraft(): void {
    if (this.draft && !this.inFlight && this.enabled("updateDraft")) {
      this.inFlight = this.draft;
      this.inFlightRevision = this.current!.revision;
      this.emit({ actionId: "updateDraft", payload: this.inFlight });
    } else if (!this.draft && !this.inFlight && this.pendingPreview) {
      this.pendingPreview = false;
      if (this.enabled("preview")) this.emit({ actionId: "preview" });
    }
  }
  private requestPreview(): void {
    if (this.draft || this.inFlight) { this.pendingPreview = true; this.flushDraft(); return; }
    if (this.enabled("preview")) this.emit({ actionId: "preview" });
  }
  private render(): void {
    if (!this.packageInput) this.createContent();
    const model = this.current;
    const draft = this.draft ?? model;
    for (const [input, value, exists] of [
      [this.packageInput, draft?.packageDirectory ?? "", model?.packageDirectoryExists],
      [this.targetInput, draft?.targetDirectory ?? "", model?.targetDirectoryExists],
    ] as const) {
      if (input.value !== value) input.value = value;
      input.title = value;
      input.disabled = !this.enabled("updateDraft");
      input.setAttribute("aria-invalid", String(!exists));
    }
    for (const [id, button] of this.buttons) {
      button.disabled = !this.enabled(id) || (id === "preview" && Boolean(this.draft));
      const action = model?.actions.find((value) => value.id === id);
      button.title = button.disabled ? action?.disabledReason ?? "当前动作不可用" : button.textContent ?? "";
    }
    this.ignore.model = model ? { ...model.ignore, busy: model.busy || !model.ready } : { enabled: true, builtInEnabled: true, gitEnabled: true, customEnabled: false, busy: true };
    this.status.textContent = this.draft ? "目录已修改，旧预览已失效；正在同步草稿。" : model?.scanStatus ?? "正在连接右侧 View…";
    this.summary.replaceChildren();
    for (const item of model?.summary ?? []) {
      const label = document.createElement("dt"), value = document.createElement("dd");
      label.textContent = item.label; value.textContent = item.value; value.title = item.value;
      this.summary.append(label, value);
    }
  }
  private createContent(): void {
    ktcDefineIgnorePolicyBlock();
    const style = document.createElement("style"); style.textContent = STYLE;
    const section = document.createElement("section"); section.className = "preview-package-primary";
    section.setAttribute("aria-label", "头文件引用修正 Primary");
    const actions = document.createElement("div"); actions.className = "preview-package-actions";
    for (const [id, label] of [["preview", "重新预览"], ["reveal", "回到 View"], ["openEnvironment", "工程环境"]] as const) actions.append(this.button(id, label));
    const directories = document.createElement("section"); directories.className = "preview-package-directories";
    const heading = document.createElement("h3"); heading.textContent = "目录";
    const body = document.createElement("div"); body.className = "preview-package-directory-body";
    this.packageInput = this.input("Package 目录"); this.targetInput = this.input("工程目录");
    const packageRow = this.row("依赖", this.packageInput, "Package 目录：依赖头文件来源，可推导、选择或编辑。");
    packageRow.append(this.button("pickEnvironmentPackageDirectory", "推导"), this.button("pickPackageDirectory", "选择"));
    const targetRow = this.row("工程", this.targetInput, "工程目录：本次任务的扫描目标，临时编辑不改变全局目录。"); targetRow.classList.add("is-target");
    body.append(packageRow, targetRow); directories.append(heading, body);
    this.ignore = document.createElement("ktc-ignore-policy-block");
    this.status = document.createElement("p"); this.status.className = "preview-package-scan-status"; this.status.setAttribute("role", "status");
    this.summary = document.createElement("dl"); this.summary.className = "preview-companion-facts"; this.summary.setAttribute("aria-label", "预览摘要");
    const results = document.createElement("section"); results.className = "preview-package-results"; results.setAttribute("aria-label", "结果");
    const resultHeading = document.createElement("h3"); resultHeading.textContent = "结果";
    results.append(resultHeading, this.status, this.summary);
    section.append(actions, directories, this.ignore, results);
    this.root.append(style, section);
  }
  private button(id: Exclude<KtcPackageIncludesPrimaryActionDetail["actionId"], "updateDraft">, label: string): HTMLButtonElement {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    if (id === "preview") button.className = "is-primary";
    button.onclick = () => { if (!button.disabled) id === "preview" ? this.requestPreview() : this.emit({ actionId: id }); };
    this.buttons.set(id, button); return button;
  }
  private input(label: string): HTMLInputElement {
    const input = document.createElement("input"); input.type = "text"; input.spellcheck = false;
    input.maxLength = KTC_PACKAGE_INCLUDES_PATH_MAX_LENGTH; input.setAttribute("aria-label", label);
    input.oninput = () => {
      if (!this.enabled("updateDraft")) return;
      this.draft = { packageDirectory: this.packageInput.value, targetDirectory: this.targetInput.value };
      if (!ktcIsPackageIncludesDirectoryDraft(this.draft)) { this.draft = undefined; this.render(); return; }
      this.render(); this.flushDraft();
    };
    input.onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); this.requestPreview(); } };
    return input;
  }
  private row(label: string, input: HTMLInputElement, description: string): HTMLDivElement {
    const row = document.createElement("div"); row.className = "preview-package-directory-row";
    const title = document.createElement("span"); title.textContent = label; title.title = description; row.append(title, input); return row;
  }
}
export function ktcDefinePackageIncludesPrimary(): void {
  if (!customElements.get(KTC_PACKAGE_INCLUDES_PRIMARY_TAG)) customElements.define(KTC_PACKAGE_INCLUDES_PRIMARY_TAG, KtcPackageIncludesPrimary);
}
declare global { interface HTMLElementTagNameMap { "ktc-package-includes-primary": KtcPackageIncludesPrimary } }
