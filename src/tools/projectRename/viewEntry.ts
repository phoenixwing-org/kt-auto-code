import type {
  KtcProjectRenameResultPage,
  KtcProjectRenameResultRow,
  KtcProjectRenameRule,
  KtcProjectRenameViewOutboundMessage,
  KtcProjectRenameViewState,
} from "./contracts.js";
import { ktcProjectRenameVariantStyleLabel } from "./nameVariants.js";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
let currentReportId: number | undefined;
let nextOffset: number | undefined;
let renderedRows = 0;
let customRuleSequence = 0;
let latestState: KtcProjectRenameViewState | undefined;
let reportDirty = false;

const sourceInput = ktcRequiredElement<HTMLInputElement>("source-name");
const targetInput = ktcRequiredElement<HTMLInputElement>("target-name");
const rulesElement = ktcRequiredElement<HTMLDivElement>("rules");
const resultsElement = ktcRequiredElement<HTMLTableSectionElement>("results");
const noticeElement = ktcRequiredElement<HTMLDivElement>("notice");
const rootElement = ktcRequiredElement<HTMLElement>("root");
const progressElement = ktcRequiredElement<HTMLElement>("progress");
const cancelButton = ktcRequiredElement<HTMLButtonElement>("cancel");
const analyzeButton = ktcRequiredElement<HTMLButtonElement>("analyze");
const applyButton = ktcRequiredElement<HTMLButtonElement>("apply");
const finishButton = ktcRequiredElement<HTMLButtonElement>("finish");
const loadMoreButton = ktcRequiredElement<HTMLButtonElement>("load-more");
const chooseRootButton = ktcRequiredElement<HTMLButtonElement>("choose-root");
const deriveButton = ktcRequiredElement<HTMLButtonElement>("derive");
const addRuleButton = ktcRequiredElement<HTMLButtonElement>("add-rule");
const rulesCountElement = ktcRequiredElement<HTMLElement>("rules-count");
const relatedCandidatesPanel = ktcRequiredElement<HTMLElement>("related-candidates-panel");
const relatedCandidatesElement = ktcRequiredElement<HTMLElement>("related-candidates");
const rootRenameButton = ktcRequiredElement<HTMLButtonElement>("rename-root");

document.querySelectorAll<HTMLElement>("[data-section-action]").forEach((control) => {
  control.addEventListener("click", (event) => event.stopPropagation());
  control.addEventListener("dblclick", (event) => event.stopPropagation());
});

chooseRootButton.addEventListener("click", () => vscode.postMessage({ type: "chooseRoot" }));
deriveButton.addEventListener("click", () => vscode.postMessage({
  type: "derive",
  sourceName: sourceInput.value,
  targetName: targetInput.value,
}));
addRuleButton.addEventListener("click", () => {
  const rules = [...ktcReadRules(), {
    id: `custom-${Date.now()}-${customRuleSequence += 1}`,
    style: "custom" as const,
    search: "",
    replace: "",
    enabled: true,
  }];
  ktcRenderRules(rules, false);
  ktcMarkReportDirty();
});
analyzeButton.addEventListener("click", () => vscode.postMessage({
  type: "analyze",
  sourceName: sourceInput.value,
  targetName: targetInput.value,
  rules: ktcReadRules(),
}));
cancelButton.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
applyButton.addEventListener("click", () => {
  if (currentReportId === undefined || reportDirty) return;
  vscode.postMessage({ type: "apply", reportId: currentReportId });
});
finishButton.addEventListener("click", () => vscode.postMessage({ type: "finish" }));
rootRenameButton.addEventListener("click", () => {
  if (currentReportId === undefined) return;
  vscode.postMessage({ type: "renameRoot", reportId: currentReportId });
});
loadMoreButton.addEventListener("click", () => {
  if (currentReportId === undefined || nextOffset === undefined) return;
  loadMoreButton.disabled = true;
  vscode.postMessage({ type: "loadMore", reportId: currentReportId, offset: nextOffset });
});
rulesElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.action !== "remove") return;
  target.closest(".rule")?.remove();
  ktcMarkReportDirty();
});
document.addEventListener("input", (event) => {
  const target = event.target;
  if (target === sourceInput || target === targetInput || target instanceof HTMLElement && rulesElement.contains(target)) {
    ktcMarkReportDirty();
  }
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && rulesElement.contains(target)) ktcMarkReportDirty();
});
relatedCandidatesElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || target.dataset.action !== "add-related") return;
  const search = target.dataset.search ?? "";
  const replace = target.dataset.replace ?? "";
  if (!search || !replace) return;
  const current = ktcReadRules();
  if (!current.some((rule) => rule.search === search && rule.replace === replace)) {
    ktcRenderRules([...current, {
      id: `custom-related-${Date.now()}-${customRuleSequence += 1}`,
      style: "custom",
      search,
      replace,
      enabled: false,
    }], false);
    ktcMarkReportDirty();
  }
  target.disabled = true;
  target.textContent = "已加入（未启用）";
});
resultsElement.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.dataset.action !== "open") return;
  const rowId = target.dataset.rowId;
  if (!rowId || currentReportId === undefined) return;
  vscode.postMessage({ type: "open", reportId: currentReportId, rowId });
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data as KtcProjectRenameViewOutboundMessage;
  if (!message || typeof message !== "object") return;
  if (message.type === "state") ktcRenderState(message.state);
  if (message.type === "page") ktcAppendPage(message.page);
});

vscode.postMessage({ type: "ready" });

function ktcRenderState(state: KtcProjectRenameViewState): void {
  latestState = state;
  reportDirty = false;
  sourceInput.value = state.sourceName;
  targetInput.value = state.targetName;
  rootElement.textContent = state.root ?? "未选择";
  rootElement.title = state.root
    ? `${state.root}\n分析目录已绑定；如需更换，请关闭此 View 后重新打开新任务。`
    : "尚未选择分析目录";
  noticeElement.textContent = state.message;
  noticeElement.className = `notice${state.status === "error" ? " error" : state.status === "running" || state.status === "applying" ? " running" : ""}`;
  const busy = state.status === "running" || state.status === "applying";
  sourceInput.disabled = busy;
  targetInput.disabled = busy;
  chooseRootButton.hidden = !!state.root;
  chooseRootButton.disabled = busy;
  chooseRootButton.title = state.root
    ? "当前任务已绑定目录；关闭此 View 后可从搜索替换为另一目录新建任务"
    : "为当前分析任务选择目录";
  deriveButton.disabled = busy;
  addRuleButton.disabled = busy;
  analyzeButton.disabled = busy || !state.root;
  analyzeButton.textContent = state.report ? "重新分析" : "分析";
  cancelButton.hidden = state.status !== "running";
  progressElement.textContent = state.progress
    ? `已扫描 ${state.progress.scannedFiles} 个文件，发现 ${state.progress.matchedItems} 项命中`
    : "";
  ktcRenderRules(state.rules, busy);
  ktcRenderCompletion(state.completion);
  finishButton.disabled = busy || !state.completion?.canFinish;
  finishButton.title = state.completion?.canFinish
    ? state.completion.message
    : "达到目标或本次冻结计划全部完成后才能结束任务";
  if (!state.report) {
    relatedCandidatesPanel.hidden = true;
    relatedCandidatesElement.replaceChildren();
    ktcRequiredElement("summary-section").hidden = true;
    ktcRequiredElement("results-section").hidden = true;
    currentReportId = undefined;
    nextOffset = undefined;
    renderedRows = 0;
    resultsElement.replaceChildren();
    applyButton.disabled = true;
    applyButton.title = "请先完成分析";
    return;
  }
  currentReportId = state.report.reportId;
  ktcRenderRelatedCandidates(state.report.relatedCandidates, state.rules);
  ktcRenderSummary(state.report, busy);
  const applyBlockedReason = ktcApplyBlockedReason(state);
  applyButton.disabled = !!applyBlockedReason;
  applyButton.title = applyBlockedReason ?? "写盘执行当前冻结报告中的全部精确改名";
  resultsElement.replaceChildren();
  renderedRows = 0;
  ktcAppendPage(state.report.page);
}

function ktcMarkReportDirty(): void {
  if (!latestState?.report) return;
  reportDirty = true;
  applyButton.disabled = true;
  applyButton.title = "名称或规则已变化；请先重新分析，再执行改名";
}

function ktcApplyBlockedReason(state: KtcProjectRenameViewState): string | undefined {
  if (state.status === "running" || state.status === "applying") return "当前任务仍在运行";
  if (!state.report) return "请先完成分析";
  if (state.report.stats.truncated) return "报告已截断；缩小范围并重新分析后才能执行";
  if (state.report.summary.errors > 0) return "报告存在冲突或错误，不能执行";
  if (state.report.page.totalRows === 0) return "当前报告没有可执行项";
  if (reportDirty) return "名称或规则已变化；请先重新分析";
  return undefined;
}

function ktcRenderCompletion(completion: KtcProjectRenameViewState["completion"]): void {
  const panel = ktcRequiredElement("completion");
  panel.hidden = !completion;
  if (!completion) return;
  const target = ktcRequiredElement("completion-target");
  target.textContent = completion.targetReached ? "✓ 目标已达到" : "目标未达到";
  target.className = `gate${completion.targetReached ? " passed" : ""}`;
  const plan = ktcRequiredElement("completion-plan");
  plan.textContent = completion.allPlannedApplied
    ? `✓ 计划 ${completion.appliedItems}/${completion.plannedItems}`
    : `计划 ${completion.appliedItems}/${completion.plannedItems}`;
  plan.className = `gate${completion.allPlannedApplied ? " passed" : ""}`;
  ktcRequiredElement("completion-remaining").textContent = `剩余 ${completion.remainingItems} 项`;
  ktcRequiredElement("completion-message").textContent = completion.message;
}

function ktcRenderRelatedCandidates(
  candidates: NonNullable<KtcProjectRenameViewState["report"]>["relatedCandidates"],
  rules: readonly KtcProjectRenameRule[],
): void {
  relatedCandidatesPanel.hidden = candidates.length === 0;
  relatedCandidatesElement.replaceChildren(...candidates.map((candidate) => {
    const row = document.createElement("div");
    row.className = "related-candidate";
    row.title = candidate.reason;
    const search = document.createElement("code");
    search.textContent = candidate.search;
    const arrow = document.createElement("span");
    arrow.className = "muted";
    arrow.textContent = "→";
    const replace = document.createElement("code");
    replace.textContent = candidate.replace;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = `${candidate.occurrences} 次 · ${candidate.matchedItems} 项`;
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "加入规则（默认关闭）";
    add.dataset.action = "add-related";
    add.dataset.search = candidate.search;
    add.dataset.replace = candidate.replace;
    const existing = rules.find((rule) => rule.search === candidate.search && rule.replace === candidate.replace);
    if (existing) {
      add.disabled = true;
      add.textContent = existing.enabled ? "已启用" : "已加入（未启用）";
    }
    row.append(search, arrow, replace, count, add);
    return row;
  }));
}

function ktcRenderRules(rules: readonly KtcProjectRenameRule[], disabled: boolean): void {
  rulesCountElement.textContent = `${rules.filter((rule) => rule.enabled).length} 条启用`;
  rulesElement.replaceChildren(...rules.map((rule) => {
    const row = document.createElement("div");
    row.className = "rule";
    row.dataset.ruleId = rule.id;
    row.dataset.style = rule.style;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = rule.enabled;
    checkbox.disabled = disabled;
    checkbox.dataset.role = "enabled";
    const style = document.createElement("span");
    style.className = "style";
    style.textContent = rule.style === "custom" ? "显式规则" : ktcProjectRenameVariantStyleLabel(rule.style);
    const search = ktcTextInput("search", rule.search, disabled);
    const arrow = document.createElement("span");
    arrow.className = "arrow muted";
    arrow.textContent = "→";
    const replace = ktcTextInput("replace", rule.replace, disabled);
    const remove = document.createElement("button");
    remove.className = "icon";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "删除规则";
    remove.dataset.action = "remove";
    remove.disabled = disabled || rule.style !== "custom";
    row.append(checkbox, style, search, arrow, replace, remove);
    return row;
  }));
}

function ktcTextInput(role: "search" | "replace", value: string, disabled: boolean): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 256;
  input.value = value;
  input.disabled = disabled;
  input.dataset.role = role;
  return input;
}

function ktcReadRules(): readonly KtcProjectRenameRule[] {
  return Array.from(rulesElement.querySelectorAll<HTMLElement>(".rule")).map((row) => ({
    id: row.dataset.ruleId ?? "",
    style: (row.dataset.style ?? "custom") as KtcProjectRenameRule["style"],
    search: row.querySelector<HTMLInputElement>('[data-role="search"]')?.value ?? "",
    replace: row.querySelector<HTMLInputElement>('[data-role="replace"]')?.value ?? "",
    enabled: row.querySelector<HTMLInputElement>('[data-role="enabled"]')?.checked ?? false,
  }));
}

function ktcRenderSummary(report: NonNullable<KtcProjectRenameViewState["report"]>, running: boolean): void {
  const values: readonly [string, number, string?][] = [
    ["内容文件", report.summary.textFiles],
    ["文件名", report.summary.files],
    ["目录名", report.summary.directories],
    ["高风险", report.riskSummary.high, "risk-high"],
    ["中风险", report.riskSummary.medium, "risk-medium"],
    ["低风险", report.riskSummary.low, "risk-low"],
  ];
  const summary = ktcRequiredElement("summary");
  summary.replaceChildren(...values.map(([label, value, className]) => {
    const metric = document.createElement("div");
    metric.className = "metric";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    if (className) strong.className = className;
    const caption = document.createElement("span");
    caption.textContent = label;
    metric.append(strong, caption);
    return metric;
  }));
  const suggestion = ktcRequiredElement("root-suggestion");
  const suggestionText = ktcRequiredElement("root-suggestion-text");
  const renameReason = ktcRequiredElement("root-rename-reason");
  suggestion.hidden = !report.rootSuggestion;
  suggestionText.textContent = report.rootSuggestion
    ? `仓库根目录建议：${report.rootSuggestion.currentName} → ${report.rootSuggestion.suggestedName}${report.rootSuggestion.canRename ? "" : "（仅提示）"}`
    : "";
  rootRenameButton.hidden = !report.rootSuggestion?.canRename;
  rootRenameButton.disabled = running;
  renameReason.textContent = report.rootSuggestion?.renameReason ?? "";
  ktcRequiredElement("summary-section").hidden = false;
  ktcRequiredElement("results-section").hidden = false;
}

function ktcAppendPage(page: KtcProjectRenameResultPage): void {
  if (currentReportId !== page.reportId) return;
  const fragment = document.createDocumentFragment();
  for (const row of page.rows) fragment.append(ktcResultRow(row));
  resultsElement.append(fragment);
  renderedRows += page.rows.length;
  nextOffset = page.nextOffset;
  loadMoreButton.hidden = nextOffset === undefined;
  loadMoreButton.disabled = false;
  loadMoreButton.textContent = nextOffset === undefined ? "已全部加载" : `加载更多（${renderedRows}/${page.totalRows}）`;
  ktcRequiredElement("result-count").textContent = `已显示 ${renderedRows} / ${page.totalRows}`;
}

function ktcResultRow(row: KtcProjectRenameResultRow): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const risk = document.createElement("td");
  const riskBadge = document.createElement("span");
  riskBadge.className = `badge risk-${row.risk}`;
  riskBadge.textContent = row.risk === "high" ? "高" : row.risk === "medium" ? "中" : "低";
  riskBadge.title = row.riskReason;
  risk.append(riskBadge);
  const category = document.createElement("td");
  category.textContent = `${row.categoryLabel} · ${row.levelLabel}`;
  const location = document.createElement("td");
  const source = document.createElement("div");
  source.textContent = row.sourceName;
  const path = document.createElement("div");
  path.className = "path";
  path.textContent = row.sourceAddress;
  const preview = document.createElement("div");
  preview.className = "preview";
  preview.textContent = row.level === "text"
    ? `${row.targetOrPositionLabel}${row.replacementPreview ? ` · ${row.replacementPreview}` : ""}`
    : `→ ${row.targetOrPositionLabel}${row.detail ? ` · ${row.detail}` : ""}`;
  location.append(source, path, preview);
  const count = document.createElement("td");
  count.className = "col-count";
  count.textContent = String(row.occurrences);
  const action = document.createElement("td");
  const open = document.createElement("button");
  open.className = "icon";
  open.type = "button";
  open.textContent = "打开";
  open.dataset.action = "open";
  open.dataset.rowId = row.id;
  action.append(open);
  tr.append(risk, category, location, count, action);
  return tr;
}

function ktcRequiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`项目改名分析 View 缺少节点：${id}`);
  return element as T;
}
