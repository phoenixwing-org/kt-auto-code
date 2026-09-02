import type {
  KtcProjectRenameResultPage,
  KtcProjectRenameResultRow,
  KtcProjectRenameRule,
  KtcProjectRenameViewOutboundMessage,
  KtcProjectRenameViewState,
} from "./contracts.js";
import type {
  KtcAssociatedRulePicker,
  KtcAssociatedRulePickerActionDetail,
} from "../../sidebar/associatedRulePicker.js";
import { ktcProjectRenameVariantStyleLabel } from "./nameVariants.js";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
let currentReportId: number | undefined;
let nextOffset: number | undefined;
let renderedRows = 0;
let customRuleSequence = 0;
let latestState: KtcProjectRenameViewState | undefined;
let reportDirty = false;
let selectedHistoryValue = "";

const sourceInput = ktcRequiredElement<HTMLInputElement>("source-name");
const targetInput = ktcRequiredElement<HTMLInputElement>("target-name");
const sourcePrefixInput = ktcRequiredElement<HTMLInputElement>("source-prefix");
const targetPrefixInput = ktcRequiredElement<HTMLInputElement>("target-prefix");
const profileSelect = ktcRequiredElement<HTMLSelectElement>("profile");
const historySelect = ktcRequiredElement<HTMLSelectElement>("rename-history");
const deleteHistoryButton = ktcRequiredElement<HTMLButtonElement>("delete-history");
const clearHistoryButton = ktcRequiredElement<HTMLButtonElement>("clear-history");
const profileNameInput = ktcRequiredElement<HTMLInputElement>("profile-name");
const profileErrorElement = ktcRequiredElement<HTMLElement>("profile-error");
const profileCountElement = ktcRequiredElement<HTMLElement>("profile-count");
const profilePanel = ktcRequiredElement<HTMLDetailsElement>("profile-panel");
const rulesElement = ktcRequiredElement<HTMLDivElement>("rules");
const resultsElement = ktcRequiredElement<HTMLTableSectionElement>("results");
const noticeElement = ktcRequiredElement<HTMLDivElement>("notice");
const rootElement = ktcRequiredElement<HTMLElement>("root");
const progressElement = ktcRequiredElement<HTMLElement>("progress");
const cancelButton = ktcRequiredElement<HTMLButtonElement>("cancel");
const analyzeButton = ktcRequiredElement<HTMLButtonElement>("analyze");
const applyButton = ktcRequiredElement<HTMLButtonElement>("apply");
const previewDiffButton = ktcRequiredElement<HTMLButtonElement>("preview-diff");
const finishButton = ktcRequiredElement<HTMLButtonElement>("finish");
const gitChangesButton = ktcRequiredElement<HTMLButtonElement>("git-changes");
const loadMoreButton = ktcRequiredElement<HTMLButtonElement>("load-more");
const chooseRootButton = ktcRequiredElement<HTMLButtonElement>("choose-root");
const deriveButton = ktcRequiredElement<HTMLButtonElement>("derive");
const toggleRulesButton = ktcRequiredElement<HTMLButtonElement>("toggle-rules");
const addRuleButton = ktcRequiredElement<HTMLButtonElement>("add-rule");
const commonRulesButton = ktcRequiredElement<HTMLButtonElement>("common-rules");
const caaRulesButton = ktcRequiredElement<HTMLButtonElement>("caa-rules");
const saveProfileButton = ktcRequiredElement<HTMLButtonElement>("save-profile");
const rulePicker = ktcRequiredElement<KtcAssociatedRulePicker>("rule-picker");
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
  sourcePrefix: sourcePrefixInput.value,
  targetPrefix: targetPrefixInput.value,
}));
toggleRulesButton.addEventListener("click", () => {
  const rows = Array.from(rulesElement.querySelectorAll<HTMLElement>(".rule"));
  const checkboxes = rows.flatMap((row) => {
    const checkbox = row.querySelector<HTMLInputElement>('[data-role="enabled"]');
    return checkbox && !checkbox.disabled ? [{ row, checkbox }] : [];
  });
  const shouldEnable = !checkboxes.some(({ checkbox }) => checkbox.checked);
  for (const { row, checkbox } of checkboxes) {
    if (!shouldEnable) {
      checkbox.checked = false;
      continue;
    }
    const search = row.querySelector<HTMLInputElement>('[data-role="search"]')?.value.trim() ?? "";
    const replace = row.querySelector<HTMLInputElement>('[data-role="replace"]')?.value.trim() ?? "";
    checkbox.checked = search !== "" && replace !== "" && search !== replace;
  }
  ktcUpdateRuleToggleButton(false);
  ktcMarkReportDirty();
});
addRuleButton.addEventListener("click", () => ktcRequestRulePicker("custom"));
commonRulesButton.addEventListener("click", () => ktcRequestRulePicker("common"));
caaRulesButton.addEventListener("click", () => ktcRequestRulePicker("caa"));
analyzeButton.addEventListener("click", () => vscode.postMessage({
  type: "analyze",
  sourceName: sourceInput.value,
  targetName: targetInput.value,
  sourcePrefix: sourcePrefixInput.value,
  targetPrefix: targetPrefixInput.value,
  rules: ktcReadRules(),
}));
cancelButton.addEventListener("click", () => vscode.postMessage({ type: "cancel" }));
applyButton.addEventListener("click", () => {
  if (currentReportId === undefined || reportDirty) return;
  vscode.postMessage({ type: "apply", reportId: currentReportId });
});
previewDiffButton.addEventListener("click", () => {
  if (currentReportId === undefined || reportDirty) return;
  vscode.postMessage({ type: "previewFirstDiff", reportId: currentReportId });
});
finishButton.addEventListener("click", () => vscode.postMessage({ type: "finish" }));
gitChangesButton.addEventListener("click", () => vscode.postMessage({ type: "openGitChanges" }));
profileSelect.addEventListener("change", () => {
  if (profileSelect.value) vscode.postMessage({ type: "loadProfile", id: profileSelect.value });
});
historySelect.addEventListener("change", () => {
  const value = historySelect.value;
  selectedHistoryValue = value;
  ktcUpdateHistoryButtons();
  if (value.startsWith("project:")) {
    vscode.postMessage({ type: "loadProjectHistory", id: value.slice("project:".length) });
    return;
  }
  if (!value.startsWith("pair:") || !latestState) return;
  const index = Number(value.slice("pair:".length));
  const pair = Number.isSafeInteger(index) ? latestState.renameHistory[index] : undefined;
  if (!pair) return;
  vscode.postMessage({
    type: "derive",
    sourceName: pair.source,
    targetName: pair.target,
    sourcePrefix: "",
    targetPrefix: "",
  });
});
deleteHistoryButton.addEventListener("click", () => {
  const value = selectedHistoryValue;
  if (!value || !latestState) return;
  if (value.startsWith("project:")) {
    selectedHistoryValue = "";
    vscode.postMessage({ type: "deleteHistory", entry: { kind: "project", id: value.slice("project:".length) } });
    return;
  }
  if (!value.startsWith("pair:")) return;
  const index = Number(value.slice("pair:".length));
  const pair = Number.isSafeInteger(index) ? latestState.renameHistory[index] : undefined;
  if (!pair) return;
  selectedHistoryValue = "";
  vscode.postMessage({ type: "deleteHistory", entry: { kind: "pair", source: pair.source, target: pair.target } });
});
clearHistoryButton.addEventListener("click", () => {
  selectedHistoryValue = "";
  vscode.postMessage({ type: "clearHistory" });
});
profileNameInput.addEventListener("input", () => ktcUpdateProfileSaveButton());
saveProfileButton.addEventListener("click", () => vscode.postMessage({
  type: "saveProfile",
  label: profileNameInput.value,
  sourceName: sourceInput.value,
  targetName: targetInput.value,
  sourcePrefix: sourcePrefixInput.value,
  targetPrefix: targetPrefixInput.value,
  rules: ktcReadRules(),
}));
rulePicker.addEventListener("ktc-associated-rule-picker-action", (event: Event) => {
  const detail = (event as CustomEvent<KtcAssociatedRulePickerActionDetail>).detail;
  if (detail?.kind !== "confirm") return;
  const current = ktcReadRules();
  const searches = new Set(current.map((rule) => rule.search).filter(Boolean));
  const additions: KtcProjectRenameRule[] = [];
  for (const rule of detail.rules) {
    if (!rule.search.trim() || searches.has(rule.search)) continue;
    searches.add(rule.search);
    additions.push({
      id: rule.id || `custom-${Date.now()}-${customRuleSequence += 1}`,
      style: "custom",
      search: rule.search,
      replace: rule.replace,
      enabled: rule.enabled !== false,
      ...(rule.parentId ? { parentId: rule.parentId } : {}),
      ...(rule.relationKind ? { relationKind: rule.relationKind } : {}),
      ...(rule.source ? { source: rule.source } : {}),
    });
  }
  if (additions.length === 0) return;
  ktcRenderRules([...current, ...additions], false);
  ktcMarkReportDirty();
});
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
  ktcUpdateRuleToggleButton(false);
  ktcMarkReportDirty();
});
document.addEventListener("input", (event) => {
  const target = event.target;
  const ruleInput = target instanceof HTMLElement && rulesElement.contains(target);
  if (target === sourceInput
    || target === targetInput
    || target === sourcePrefixInput
    || target === targetPrefixInput
    || ruleInput) {
    ktcMarkReportDirty();
  }
  if (ruleInput) ktcUpdateRuleToggleButton(false);
  if (target === sourceInput || target === targetInput) ktcUpdateProfileSaveButton();
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLElement && rulesElement.contains(target)) {
    ktcUpdateRuleToggleButton(false);
    ktcMarkReportDirty();
  }
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
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  if (action !== "open" && action !== "diff") return;
  const rowId = target.dataset.rowId;
  if (!rowId || currentReportId === undefined) return;
  vscode.postMessage({
    type: action === "diff" ? "previewDiff" : "open",
    reportId: currentReportId,
    rowId,
  });
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = event.data as KtcProjectRenameViewOutboundMessage;
  if (!message || typeof message !== "object") return;
  if (message.type === "state") ktcRenderState(message.state);
  if (message.type === "page") ktcAppendPage(message.page);
  if (message.type === "rulePicker") rulePicker.openPicker(message.picker);
});

vscode.postMessage({ type: "ready" });

function ktcRequestRulePicker(mode: "custom" | "common" | "caa"): void {
  vscode.postMessage({
    type: "requestRulePicker",
    mode,
    sourceName: sourceInput.value,
    targetName: targetInput.value,
    sourcePrefix: sourcePrefixInput.value,
    targetPrefix: targetPrefixInput.value,
    rules: ktcReadRules(),
  });
}

function ktcRenderProfiles(state: KtcProjectRenameViewState): void {
  const historyPlaceholder = document.createElement("option");
  historyPlaceholder.value = "";
  historyPlaceholder.textContent = "最近输入 / 项目方案…";
  const projectGroup = document.createElement("optgroup");
  projectGroup.label = "当前项目方案";
  projectGroup.append(...state.projectHistory.map((entry) => {
    const option = document.createElement("option");
    option.value = `project:${entry.id}`;
    option.textContent = `${entry.sourceName} → ${entry.targetName} · ${entry.rules.length} 条规则`;
    option.title = `恢复名称、前缀与多变体规则 · ${entry.updatedAt}`;
    return option;
  }));
  const pairGroup = document.createElement("optgroup");
  pairGroup.label = "用户最近输入";
  pairGroup.append(...state.renameHistory.map((entry, index) => {
    const option = document.createElement("option");
    option.value = `pair:${index}`;
    option.textContent = `${entry.source} → ${entry.target}`;
    option.title = entry.updatedAt;
    return option;
  }));
  historySelect.replaceChildren(
    historyPlaceholder,
    ...(state.projectHistory.length ? [projectGroup] : []),
    ...(state.renameHistory.length ? [pairGroup] : []),
  );
  historySelect.value = Array.from(historySelect.options).some((option) => option.value === selectedHistoryValue)
    ? selectedHistoryValue
    : "";
  if (!historySelect.value) selectedHistoryValue = "";
  historySelect.title = "本机最近使用记录；项目方案按当前分析目录隔离，不写入仓库";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.profileError ? "项目规则档案不可用" : "项目规则档案…";
  const options = state.profiles.map((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    option.title = `更新于 ${profile.updatedAt}`;
    return option;
  });
  profileSelect.replaceChildren(placeholder, ...options);
  profileSelect.value = state.selectedProfileId
    && state.profiles.some((profile) => profile.id === state.selectedProfileId)
    ? state.selectedProfileId
    : "";
  profileSelect.title = state.profileError || "载入当前项目 .phoenix/search-replace.json 中的共享规则档案；这不是本机最近历史";
  profileCountElement.textContent = state.profileError ? "档案不可用" : `${state.profiles.length} 个共享档案`;
  profileNameInput.value = state.profileLabel;
  profileErrorElement.hidden = !state.profileError;
  profileErrorElement.textContent = state.profileError ?? "";
  if (state.profileError) profilePanel.open = true;
}

function ktcUpdateHistoryButtons(): void {
  const busy = latestState?.status === "running" || latestState?.status === "applying";
  const count = (latestState?.renameHistory.length ?? 0) + (latestState?.projectHistory.length ?? 0);
  deleteHistoryButton.disabled = busy || !selectedHistoryValue;
  clearHistoryButton.disabled = busy || count === 0;
}

function ktcUpdateProfileSaveButton(): void {
  const busy = latestState?.status === "running" || latestState?.status === "applying";
  saveProfileButton.disabled = busy
    || !latestState?.root
    || !!latestState.profileError
    || !profileNameInput.value.trim()
    || !sourceInput.value.trim()
    || !targetInput.value.trim();
  saveProfileButton.title = latestState?.profileError
    || (saveProfileButton.disabled ? "填写项目档案名称、原项目名和目标项目名后保存" : "保存到当前项目 .phoenix/search-replace.json；同名档案会更新");
}

function ktcRenderState(state: KtcProjectRenameViewState): void {
  latestState = state;
  reportDirty = false;
  sourceInput.value = state.sourceName;
  targetInput.value = state.targetName;
  sourcePrefixInput.value = state.sourcePrefix;
  targetPrefixInput.value = state.targetPrefix;
  ktcRenderProfiles(state);
  rootElement.textContent = state.root ?? "未选择";
  rootElement.title = state.root
    ? `${state.root}\n分析目录已绑定；如需更换，请关闭此 View 后重新打开新任务。`
    : "尚未选择分析目录";
  noticeElement.textContent = state.message;
  noticeElement.className = `notice${state.status === "error" ? " error" : state.status === "running" || state.status === "applying" ? " running" : " quiet"}`;
  const busy = state.status === "running" || state.status === "applying";
  sourceInput.disabled = busy;
  targetInput.disabled = busy;
  sourcePrefixInput.disabled = busy;
  targetPrefixInput.disabled = busy;
  chooseRootButton.hidden = !!state.root;
  chooseRootButton.disabled = busy;
  chooseRootButton.title = state.root
    ? "当前任务已绑定目录；关闭此 View 后可从搜索替换为另一目录新建任务"
    : "为当前分析任务选择目录";
  deriveButton.disabled = busy;
  toggleRulesButton.disabled = busy;
  addRuleButton.disabled = busy;
  commonRulesButton.disabled = busy;
  caaRulesButton.disabled = busy;
  profileSelect.disabled = busy || !!state.profileError || state.profiles.length === 0;
  historySelect.disabled = busy || state.renameHistory.length + state.projectHistory.length === 0;
  ktcUpdateHistoryButtons();
  profileNameInput.disabled = busy;
  ktcUpdateProfileSaveButton();
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
  gitChangesButton.disabled = busy || !state.gitCompareAvailable || !state.completion || state.completion.appliedItems === 0;
  gitChangesButton.title = gitChangesButton.disabled
    ? "执行改名后可在 VS Code 源代码管理中逐文件对比"
    : "打开 VS Code 源代码管理，用内置 Git diff 验收写盘结果";
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
    previewDiffButton.disabled = true;
    previewDiffButton.title = "请先完成包含文本命中的分析";
    return;
  }
  currentReportId = state.report.reportId;
  ktcRenderRelatedCandidates(state.report.relatedCandidates, state.rules);
  ktcRenderSummary(state.report, busy);
  const applyBlockedReason = ktcApplyBlockedReason(state);
  applyButton.disabled = !!applyBlockedReason;
  applyButton.title = applyBlockedReason ?? "写盘执行当前冻结报告中的全部精确改名";
  previewDiffButton.disabled = busy || reportDirty || state.report.summary.textFiles === 0;
  previewDiffButton.title = previewDiffButton.disabled
    ? "当前冻结报告没有可预览的文本差异，或名称/规则已变化"
    : "不写磁盘；用 VS Code 原生 Diff Editor 比较冻结原文与计划文本";
  resultsElement.replaceChildren();
  renderedRows = 0;
  ktcAppendPage(state.report.page);
}

function ktcMarkReportDirty(): void {
  if (!latestState?.report) return;
  reportDirty = true;
  applyButton.disabled = true;
  applyButton.title = "名称或规则已变化；请先重新分析，再执行改名";
  previewDiffButton.disabled = true;
  previewDiffButton.title = "名称或规则已变化；请先重新分析，再预览差异";
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
    if (rule.parentId) row.dataset.parentId = rule.parentId;
    if (rule.relationKind) row.dataset.relationKind = rule.relationKind;
    if (rule.source) row.dataset.source = rule.source;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = rule.enabled;
    checkbox.disabled = disabled;
    checkbox.dataset.role = "enabled";
    const style = document.createElement("span");
    style.className = "style";
    style.textContent = rule.style === "custom"
      ? ktcCustomRuleLabel(rule.relationKind)
      : ktcProjectRenameVariantStyleLabel(rule.style);
    const search = ktcTextInput("search", rule.search, disabled);
    const arrow = document.createElement("span");
    arrow.className = "arrow muted";
    arrow.textContent = "→";
    const replace = ktcTextInput("replace", rule.replace, disabled);
    const tail = rule.style === "custom" ? document.createElement("button") : document.createElement("span");
    if (tail instanceof HTMLButtonElement) {
      tail.className = "icon";
      tail.type = "button";
      tail.textContent = "×";
      tail.title = "删除自定义规则";
      tail.dataset.action = "remove";
      tail.disabled = disabled;
    } else {
      tail.setAttribute("aria-hidden", "true");
    }
    row.append(checkbox, style, search, arrow, replace, tail);
    return row;
  }));
  ktcUpdateRuleToggleButton(disabled);
}

function ktcUpdateRuleToggleButton(disabled: boolean): void {
  const rows = Array.from(rulesElement.querySelectorAll<HTMLElement>(".rule"));
  const checkboxes = rows.flatMap((row) => {
    const checkbox = row.querySelector<HTMLInputElement>('[data-role="enabled"]');
    return checkbox ? [{ row, checkbox }] : [];
  });
  const anyEnabled = checkboxes.some(({ checkbox }) => checkbox.checked);
  const hasEligibleRule = checkboxes.some(({ row }) => {
    const search = row.querySelector<HTMLInputElement>('[data-role="search"]')?.value.trim() ?? "";
    const replace = row.querySelector<HTMLInputElement>('[data-role="replace"]')?.value.trim() ?? "";
    return search !== "" && replace !== "" && search !== replace;
  });
  toggleRulesButton.textContent = anyEnabled ? "全不选" : "全选";
  toggleRulesButton.title = anyEnabled ? "取消勾选全部规则" : "勾选全部有效规则";
  toggleRulesButton.setAttribute("aria-label", toggleRulesButton.title);
  toggleRulesButton.disabled = disabled || (!anyEnabled && !hasEligibleRule);
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
    ...(row.dataset.parentId ? { parentId: row.dataset.parentId } : {}),
    ...(row.dataset.relationKind
      ? { relationKind: row.dataset.relationKind as KtcProjectRenameRule["relationKind"] }
      : {}),
    ...(row.dataset.source === "generated" || row.dataset.source === "user"
      ? { source: row.dataset.source }
      : {}),
  }));
}

function ktcCustomRuleLabel(relationKind: KtcProjectRenameRule["relationKind"]): string {
  if (relationKind === "spaced") return "空格写法";
  if (relationKind === "prefix") return "前缀规则";
  if (relationKind === "caa-i") return "CAA I 末词段";
  if (relationKind === "caa-e") return "CAA E 末词段";
  if (relationKind === "caa-i-full") return "CAA I 完整名";
  if (relationKind === "caa-e-full") return "CAA E 完整名";
  return "自定义规则";
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
  category.title = `${row.categoryLabel} · ${row.levelLabel}`;
  const source = document.createElement("td");
  source.className = "source-label";
  const sourceName = document.createElement("span");
  sourceName.textContent = row.sourceName;
  const separator = document.createTextNode(" · ");
  const path = document.createElement("span");
  path.className = "path";
  path.textContent = row.sourceAddress;
  source.title = `${row.sourceName} · ${row.sourceAddress}`;
  source.append(sourceName, separator, path);
  const target = document.createElement("td");
  target.textContent = row.level === "text"
    ? `${row.targetOrPositionLabel}${row.replacementPreview ? ` · ${row.replacementPreview}` : ""}`
    : `→ ${row.targetOrPositionLabel}${row.detail ? ` · ${row.detail}` : ""}`;
  target.title = target.textContent;
  const count = document.createElement("td");
  count.className = "col-count";
  count.textContent = String(row.occurrences);
  const action = document.createElement("td");
  action.className = "col-action";
  const actions = document.createElement("div");
  actions.className = "row-actions";
  if (row.level === "text") {
    const diff = document.createElement("button");
    diff.className = "icon";
    diff.type = "button";
    diff.textContent = "对比";
    diff.title = "写盘前：比较冻结原文与计划文本";
    diff.dataset.action = "diff";
    diff.dataset.rowId = row.id;
    actions.append(diff);
  }
  const open = document.createElement("button");
  open.className = "icon";
  open.type = "button";
  open.textContent = "打开";
  open.dataset.action = "open";
  open.dataset.rowId = row.id;
  actions.append(open);
  action.append(actions);
  tr.append(risk, category, source, target, count, action);
  return tr;
}

function ktcRequiredElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`项目改名分析 View 缺少节点：${id}`);
  return element as T;
}
