import { ktcCreatePrimaryActionBar } from "./KtcPrimaryActionBar.js";
import { KTC_REORDER_MEMBERS_PANEL_ACTION, ktcDefineReorderMembersPanel, type KtcReorderMembersPanelActionDetail } from "../sidebar/reorderMembersPanel.js";
import type { KtcReorderMembersPanelModel } from "../sidebar/reorderMembersPanelState.js";
import { KTC_UUID_RESULTS_ACTION, ktcDefineUuidResultsPanel, type KtcUuidResultsActionDetail, type KtcUuidResultsPanelModel } from "../sidebar/uuidResultsPanel.js";

export const KTC_SELECTION_PRIMARY_ACTION = "ktc-selection-primary-action";
export type KtcSelectionToolId = "reorderMembers" | "uuidReplace";
export type KtcSelectionUuidStrategy = "map_per_value" | "fresh_per_hit";
export type KtcSelectionRowAction = "open" | "preview" | "apply" | "cancel" | "gitDiff" | "revert";
export interface KtcSelectionPrimaryModel {
  readonly toolId: KtcSelectionToolId;
  readonly directory: string;
  readonly running: boolean;
  readonly message: string;
  readonly scanEnabled: boolean;
  readonly uuidStrategy?: KtcSelectionUuidStrategy;
  readonly reorder?: KtcReorderMembersPanelModel;
  readonly uuid?: KtcUuidResultsPanelModel;
  readonly scanTitle?: string;
  readonly applyTitle?: string;
}
export type KtcSelectionPrimaryAction = { readonly toolId: KtcSelectionToolId } & (
  | { readonly kind: "scan"; readonly uuidStrategy?: KtcSelectionUuidStrategy }
  | { readonly kind: "setStrategy"; readonly strategy: KtcSelectionUuidStrategy }
  | { readonly kind: "selection"; readonly uris: readonly string[] }
  | { readonly kind: "action"; readonly action: KtcSelectionRowAction; readonly uris: readonly string[] }
);

const STYLE = `
:host{display:block;min-width:0;max-width:100%;color:var(--vscode-foreground,var(--text));font:inherit}
:host([hidden]),[hidden]{display:none!important}
.selection-tool-status{margin:0;padding:6px 8px;overflow-wrap:anywhere;color:var(--vscode-descriptionForeground,var(--muted));border-bottom:1px solid var(--vscode-panel-border,var(--border))}
.selection-tool-strategy{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px;padding:6px 8px}
select{min-width:0;width:100%;font:inherit;color:var(--vscode-dropdown-foreground,var(--text));background:var(--vscode-dropdown-background,var(--input-bg));border:1px solid var(--vscode-dropdown-border,var(--border));padding:3px 4px}
select:focus-visible{outline:1px solid var(--vscode-focusBorder,var(--accent))}
.selection-tool-hint{grid-column:1/-1;margin:0;color:var(--vscode-descriptionForeground,var(--muted));font-size:11px;overflow-wrap:anywhere}
.selection-tool-hint[data-warning="true"]{color:var(--vscode-editorWarning-foreground,var(--text))}
`;

/** Presentation only. Wing owns result DOM; the consumer owns plans, confirmation and I/O. */
export class KtcSelectionPrimary extends HTMLElement {
  private readonly root = this.attachShadow({ mode: "open" });
  private value?: KtcSelectionPrimaryModel;
  private readonly bar = ktcCreatePrimaryActionBar({ label: "选择操作", actions: [] }, (id) => {
    const model = this.value;
    if (!model || model.running) return;
    if (id === "scan" && model.scanEnabled) this.emit({ toolId: model.toolId, kind: "scan", ...(model.toolId === "uuidReplace" ? { uuidStrategy: model.uuidStrategy ?? "map_per_value" } : {}) });
    else if (id === "apply" && this.canApply()) {
      const uris = this.selectedPending();
      if (uris.length) this.emit({ toolId: model.toolId, kind: "action", action: "apply", uris });
    }
  });
  private readonly strategy = document.createElement("select");
  private readonly field = document.createElement("label");
  private readonly hint = document.createElement("p");
  private readonly status = document.createElement("p");
  private readonly reorder = (() => { ktcDefineReorderMembersPanel(); return document.createElement("ktc-reorder-members-panel"); })();
  private readonly uuid = (() => { ktcDefineUuidResultsPanel(); return document.createElement("ktc-uuid-results-panel"); })();

  constructor() {
    super();
    this.strategy.setAttribute("aria-label", "UUID 生成策略");
    for (const [value, text] of [["map_per_value", "同值同替换（推荐）"], ["fresh_per_hit", "每处独立新值"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = text; this.strategy.append(option);
    }
    this.strategy.onchange = () => {
      const model = this.value;
      if (!model || model.toolId !== "uuidReplace" || model.running) { this.strategy.value = model?.uuidStrategy ?? "map_per_value"; return; }
      const strategy = this.strategy.value === "fresh_per_hit" ? "fresh_per_hit" : "map_per_value";
      if (strategy !== (model.uuidStrategy ?? "map_per_value")) this.emit({ toolId: model.toolId, kind: "setStrategy", strategy });
    };
    this.hint.className = "selection-tool-hint";
    this.field.className = "selection-tool-strategy";
    this.field.append(document.createTextNode("生成策略"), this.strategy, this.hint);
    this.status.className = "selection-tool-status";
    this.status.setAttribute("role", "status"); this.status.setAttribute("aria-live", "polite");
    this.reorder.addEventListener(KTC_REORDER_MEMBERS_PANEL_ACTION, (event) => {
      event.stopPropagation();
      if (this.value?.toolId !== "reorderMembers") return;
      const detail = (event as CustomEvent<KtcReorderMembersPanelActionDetail>).detail;
      if (detail.kind === "reorderSelection") this.emit({ toolId: "reorderMembers", kind: "selection", uris: [...detail.uris] });
      else if (detail.kind === "reorderAction") this.emit({ toolId: "reorderMembers", kind: "action", action: detail.action, uris: [...detail.uris] });
      else if (detail.action === "preview" && this.value.scanEnabled) this.emit({ toolId: "reorderMembers", kind: "scan" });
    });
    this.uuid.addEventListener(KTC_UUID_RESULTS_ACTION, (event) => {
      event.stopPropagation();
      if (this.value?.toolId !== "uuidReplace") return;
      const detail = (event as CustomEvent<KtcUuidResultsActionDetail>).detail;
      if (detail.scope !== "file") return;
      if (detail.kind === "selection") this.emit({ toolId: "uuidReplace", kind: "selection", uris: [...detail.ids] });
      else this.emit({ toolId: "uuidReplace", kind: "action", action: detail.action, uris: [...detail.ids] });
    });
    const style = document.createElement("style"); style.textContent = STYLE;
    this.root.append(this.bar, this.field, this.status, this.reorder, this.uuid, style);
  }

  get model(): KtcSelectionPrimaryModel | undefined { return this.value; }
  set model(model: KtcSelectionPrimaryModel | undefined) { this.value = model; this.render(); }
  connectedCallback(): void { this.render(); }

  private emit(detail: KtcSelectionPrimaryAction): void {
    if (!this.value || this.value.running || detail.toolId !== this.value.toolId) return;
    const capabilities = this.value.toolId === "reorderMembers" ? this.value.reorder?.capabilities : this.value.uuid?.capabilities;
    if (detail.kind === "selection" && capabilities?.selection === false) return;
    if (detail.kind === "action" && capabilities?.[detail.action as keyof typeof capabilities] === false) return;
    this.dispatchEvent(new CustomEvent(KTC_SELECTION_PRIMARY_ACTION, { detail, bubbles: true, composed: true }));
  }

  private selectedPending(): string[] {
    const model = this.value;
    if (!model) return [];
    const rows = model.toolId === "reorderMembers" ? model.reorder?.reorderResults : model.uuid?.files;
    const selected = model.toolId === "reorderMembers"
      ? model.reorder?.reorderSelectedUris ?? rows?.filter(row => row.state === "pending").map(row => row.uri) ?? []
      : model.uuid?.selectedIds ?? [];
    return [...new Set(selected)].filter(uri => rows?.some(row => row.uri === uri && row.state === "pending"));
  }

  private canApply(): boolean {
    const model = this.value;
    return Boolean(model && (model.toolId === "reorderMembers" ? model.reorder?.capabilities?.apply !== false : model.uuid?.capabilities?.apply !== false));
  }

  private render(): void {
    const model = this.value;
    const reorder = model?.toolId === "reorderMembers";
    const label = reorder ? "成员排序" : "UUID 替换";
    const selected = this.selectedPending();
    const applyLabel = reorder ? "应用所选" : "替换所选";
    const running = Boolean(model?.running);
    this.bar.model = { label: `${label}操作`, actions: [
      { id: "scan", label: reorder ? "扫描排序" : "扫描 UUID", enabled: Boolean(model?.scanEnabled) && !running,
        title: running ? "正在处理，请稍候" : model?.scanTitle ?? (model?.directory ? "扫描当前工作目录" : "请先选择工作目录") },
      { id: "apply", label: selected.length ? `${applyLabel}（${selected.length}）` : applyLabel, enabled: !running && this.canApply() && selected.length > 0, primary: true,
        title: running ? "正在处理，请稍候" : selected.length ? model?.applyTitle ?? "确认后应用所选文件" : "请先扫描并勾选待处理文件" },
    ] };
    this.setAttribute("aria-busy", String(running));
    this.field.hidden = !model || reorder;
    this.status.textContent = model?.message ?? ""; this.status.title = model?.directory ?? "";
    this.strategy.value = model?.uuidStrategy ?? "map_per_value"; this.strategy.disabled = running;
    this.hint.textContent = model?.uuidStrategy === "fresh_per_hit"
      ? "每个命中生成不同 UUID，可能打破原有引用关系；仅在确认每处都应拥有独立身份时使用。"
      : "相同旧 UUID 在所有文件中替换为同一个新 UUID；策略在扫描时固定。";
    this.hint.dataset.warning = String(model?.uuidStrategy === "fresh_per_hit");
    this.reorder.hidden = !model || !reorder; this.uuid.hidden = !model || reorder;
    if (reorder) this.reorder.model = { ...model?.reorder, presentation: "results", status: running ? "running" : model?.reorder?.status ?? "idle", message: "" };
    else if (model) this.uuid.model = { ...model.uuid, presentation: "files", running };
  }
}

export function ktcDefineSelectionPrimary(): void {
  if (!customElements.get("ktc-selection-primary")) customElements.define("ktc-selection-primary", KtcSelectionPrimary);
}
declare global { interface HTMLElementTagNameMap { "ktc-selection-primary": KtcSelectionPrimary } }
