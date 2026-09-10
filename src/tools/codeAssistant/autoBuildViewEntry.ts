import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";
import type { KtcAutoBuildConfiguration } from "./autoBuildContracts.js";
import type { KtcAutoBuildConfigurationRequest } from "./autoBuildDraftContracts.js";
import type { KtcAutoBuildProjectRow } from "./autoBuildProjectTable.js";
import { ktcMountAutoBuildCleanupView } from "./autoBuildCleanupView.js";

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const autoBuildVsCode = acquireVsCodeApi();
(window as unknown as { acquireVsCodeApi: typeof acquireVsCodeApi }).acquireVsCodeApi = () => autoBuildVsCode;
const autoBuildDocumentId = crypto.randomUUID();

interface AutoBuildRightShellElement extends HTMLElement {
  model: { readonly title: string; readonly contextPath?: string; readonly scrollMode: "vertical" };
}

const rightShell = document.getElementById("autoBuildRightShell") as AutoBuildRightShellElement | null;
const rightShellTitle = ktcRequireToolRegistration("autoBuild").title;
const syncRightShellContext = (contextPath = ""): void => {
  if (!rightShell) return;
  rightShell.model = {
    title: rightShellTitle,
    contextPath,
    scrollMode: "vertical",
  };
};
syncRightShellContext();

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("pnw-collapsible-block").forEach((legacy) => {
    const details = document.createElement("details"); details.className = "auto-build-block"; details.open = true;
    const summary = document.createElement("summary"); summary.textContent = legacy.getAttribute("title") || "";
    const body = document.createElement("div"); body.className = "auto-build-block-body"; while (legacy.firstChild) body.append(legacy.firstChild);
    details.append(summary, body); legacy.replaceWith(details);
  });
  const createBlock = (title: string) => { const details = document.createElement("details"); details.className = "auto-build-block"; details.open = true; const summary = document.createElement("summary"); summary.textContent = title; const body = document.createElement("div"); body.className = "auto-build-block-body"; details.append(summary, body); return { details, body }; };
  const setBlockHeader = (block: Element, title: string, tail?: HTMLElement) => {
    const summary = block.querySelector<HTMLElement>(":scope > summary");
    if (!summary) return;
    const heading = document.createElement("strong"); heading.className = "auto-build-block-heading"; heading.textContent = title;
    summary.replaceChildren(heading);
    if (tail) summary.append(tail);
  };
  const guardSummaryControls = (controls: HTMLElement) => {
    controls.addEventListener("click", (event) => {
      event.stopPropagation();
      if ((event.target as Element | null)?.closest("button")) event.preventDefault();
    });
    controls.addEventListener("keydown", (event) => event.stopPropagation());
  };
  let repositorySnapshot: NonNullable<KtcAutoBuildConfiguration["repositorySnapshot"]> | undefined;
  let probeColumnsVisible = true;
  let rootEnabled = true;
  let thirdPartyEnabled = true;
  let rootCleanupYaml = KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML;
  let cmakeBuildTypes: ("Debug" | "Release")[] = ["Debug", "Release"];
  type ProjectRow = KtcAutoBuildProjectRow;
  let projects: ProjectRow[] = [];
  let publishDraft = (_configuration?: KtcAutoBuildConfiguration): number => 0;
  let scheduleDraftPublication = (): void => undefined;
  type DraftScopedProjectRequest = {
    readonly type: "pickProjectDirectories" | "discoverProjectDirectories" | "probeProject" | "updateProject" | "runProject" | "runTask";
    readonly projectId?: string;
    readonly taskId?: string;
  };
  let postProjectRequest = (_request: DraftScopedProjectRequest): void => undefined;
  const style = document.createElement("style");
  style.textContent = ".auto-build-block{display:block;margin:0 0 9px;border:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));border-radius:4px;background:var(--vscode-editor-background)}.auto-build-block[hidden]{display:none}.auto-build-block>summary{display:flex;min-height:29px;align-items:center;gap:5px;padding:3px 7px;box-sizing:border-box;border-bottom:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));color:var(--vscode-foreground);background:var(--vscode-sideBarSectionHeader-background,transparent);font-weight:600;cursor:pointer;list-style:none;flex-wrap:wrap}.auto-build-block>summary::-webkit-details-marker{display:none}.auto-build-block>summary::before{width:14px;content:'›';font-size:18px;line-height:1;transform:rotate(0deg)}.auto-build-block[open]>summary::before{transform:rotate(90deg)}.auto-build-block:not([open])>summary{border-bottom:0}.auto-build-block-heading{flex:none}.auto-build-block-summary-controls{display:flex;min-width:0;margin-left:auto;align-items:center;gap:6px;flex-wrap:wrap;color:var(--vscode-foreground);font-size:11px;font-weight:400}.auto-build-block-summary-controls label{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.auto-build-block-summary-controls input[type=checkbox]{width:14px;height:14px;margin:0}.auto-build-block-summary-status{min-width:0;margin-left:auto;overflow:hidden;color:var(--vscode-descriptionForeground);font-size:11px;font-weight:400;text-overflow:ellipsis;white-space:nowrap}.auto-build-block-body{padding:8px}.header-actions{display:flex;min-width:0;align-items:center;gap:7px;overflow-x:auto;scrollbar-width:none}.header-actions::-webkit-scrollbar{display:none}.header-actions>button{flex:none}.header-actions button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}.project-version{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-kind{white-space:nowrap}.project-build-options,.project-operations{display:flex;gap:5px;align-items:center;flex-wrap:nowrap}.project-build-options label{display:inline-flex;gap:3px;align-items:center;white-space:nowrap}.project-action-button{display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;flex:none;padding:0;border:1px solid transparent;border-radius:3px;color:var(--vscode-foreground);background:transparent}.project-action-button svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.project-action-button:hover{border-color:var(--vscode-panel-border);background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}@media(max-width:640px){.header-actions,.auto-build-block-summary-controls{gap:4px}}";
  document.head.append(style);
  const projectTableStyle = document.createElement("style");
  projectTableStyle.textContent = "#projectRows{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto;contain:inline-size}.project-table{width:100%;min-width:1140px;border-spacing:0;border-collapse:separate;table-layout:fixed}.project-table[data-probe-columns-visible=false]{min-width:820px}.project-table[data-probe-columns-visible=false] [data-project-probe-column]{display:none}.project-table th,.project-table td{height:36px;box-sizing:border-box;padding:4px 7px;overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.project-table th{color:var(--vscode-descriptionForeground);font-size:11px;font-weight:500}.project-table input:not([type=checkbox]){min-width:0;width:100%;box-sizing:border-box}.project-table .project-col-enabled{width:48px}.project-table .project-col-kind{width:78px}.project-table .project-col-branch{width:90px}.project-table .project-col-repository{width:220px}.project-table .project-col-commit{width:105px}.project-table .project-col-origin{width:185px}.project-table .project-col-status{width:75px}.project-table .project-col-build{width:245px}.project-table .project-col-actions{width:123px}.project-table th:last-child,.project-table td:last-child{position:sticky;right:0;z-index:2;border-left:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background);box-shadow:-5px 0 7px -7px var(--vscode-foreground)}.project-table th:last-child{z-index:3}";
  document.head.append(projectTableStyle);
  const treeStyle = document.createElement("style");
  treeStyle.textContent = ".task-tree>summary{position:relative;padding-left:18px;cursor:pointer;list-style:none}.task-tree>summary::-webkit-details-marker{display:none}.task-tree>summary::before{content:'›';position:absolute;left:3px;top:50%;font-size:19px;line-height:1;transform:translateY(-50%);transform-origin:center;transition:transform .1s ease}.task-tree[open]>summary::before{transform:translateY(-50%) rotate(90deg)}";
  document.head.append(treeStyle);
  const optionStyle = document.createElement("style"); optionStyle.textContent = ".parallel-option{display:grid;grid-template-columns:22px auto 1fr;align-items:center;gap:7px;margin:7px 0;padding:8px 10px;border:1px solid var(--vscode-focusBorder);background:var(--vscode-editor-inactiveSelectionBackground)}.parallel-option strong{font-size:13px}.parallel-option small{color:var(--vscode-descriptionForeground)}"; document.head.append(optionStyle);
  const scriptStyle = document.createElement("style");
  scriptStyle.textContent = "body.vscode-light .script-window,body.vscode-high-contrast-light .script-window{color-scheme:light}body.vscode-dark .script-window,body.vscode-high-contrast .script-window{color-scheme:dark}.script-window{position:fixed;z-index:20;left:80px;top:70px;width:min(560px,calc(100vw - 32px));box-sizing:border-box;overflow:hidden;color:var(--vscode-foreground);border:1px solid var(--vscode-widget-border,var(--vscode-contrastBorder,var(--vscode-panel-border)));border-radius:3px;box-shadow:0 8px 28px var(--vscode-widget-shadow,rgba(0,0,0,.35));background:var(--vscode-editorWidget-background,var(--vscode-editor-background))}.script-window *{box-sizing:border-box}.script-window[hidden],.script-options[hidden]{display:none!important}.script-window-header{display:flex;min-height:36px;align-items:center;justify-content:space-between;padding:5px 7px 5px 10px;color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground));cursor:move;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-sideBarSectionHeader-background,var(--vscode-editorWidget-background,var(--vscode-editor-background)));font-weight:600}.script-window-header #closeScriptWindow{display:grid;width:26px;height:26px;min-height:0;place-items:center;padding:0;color:var(--vscode-icon-foreground,var(--vscode-foreground));border-color:transparent;background:transparent;font-size:18px;line-height:1}.script-window-header #closeScriptWindow:hover:not(:disabled){color:var(--vscode-toolbar-hoverForeground,var(--vscode-foreground));background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}.script-window-body{display:grid;gap:12px;padding:12px;color:var(--vscode-foreground);background:var(--vscode-editorWidget-background,var(--vscode-editor-background))}.script-output{display:grid;gap:5px;color:var(--vscode-foreground)}.script-output-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.script-window input[type=text]{min-width:0;width:100%;min-height:28px;padding:3px 7px;color:var(--vscode-input-foreground);caret-color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-contrastBorder,var(--vscode-panel-border)));border-radius:2px;background:var(--vscode-input-background)}.script-window-note{color:var(--vscode-descriptionForeground)}.script-options{display:flex;align-items:center;gap:16px;flex-wrap:wrap;color:var(--vscode-foreground)}.script-options label{display:inline-flex;align-items:center;gap:6px;color:var(--vscode-foreground);white-space:nowrap}.script-options input[type=checkbox],.script-options input[type=radio]{width:16px;height:16px;margin:0;flex:none;accent-color:var(--vscode-focusBorder)}.script-tabs{display:flex;color:var(--vscode-tab-inactiveForeground,var(--vscode-descriptionForeground));border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editorWidget-background,var(--vscode-editor-background))}.script-tab{min-height:38px;padding:4px 14px;color:var(--vscode-tab-inactiveForeground,var(--vscode-descriptionForeground));cursor:pointer;border:0;border-right:1px solid var(--vscode-tab-border,var(--vscode-panel-border));border-bottom:2px solid transparent;background:var(--vscode-tab-inactiveBackground,var(--vscode-editorWidget-background,var(--vscode-editor-background)))}.script-tab:hover:not([aria-selected=true]){color:var(--vscode-foreground);background:var(--vscode-list-hoverBackground,var(--vscode-toolbar-hoverBackground))}.script-tab[aria-selected=true]{color:var(--vscode-tab-activeForeground,var(--vscode-foreground));border-bottom-color:var(--vscode-focusBorder);background:var(--vscode-tab-activeBackground,var(--vscode-editor-background));font-weight:600}.script-window button:not(.script-tab){min-height:28px;padding:3px 10px;color:var(--vscode-button-secondaryForeground,var(--vscode-foreground));cursor:pointer;border:1px solid var(--vscode-button-border,var(--vscode-contrastBorder,transparent));border-radius:2px;background:var(--vscode-button-secondaryBackground,var(--vscode-editor-background));font:inherit}.script-window button:not(.script-tab):hover:not(:disabled){background:var(--vscode-button-secondaryHoverBackground,var(--vscode-toolbar-hoverBackground))}.script-window #confirmWriteScript{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}.script-window #confirmWriteScript:hover:not(:disabled){background:var(--vscode-button-hoverBackground)}.script-window button:disabled{color:var(--vscode-disabledForeground,var(--vscode-descriptionForeground));cursor:not-allowed;opacity:.55}.script-window :focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:1px}";
  document.head.append(scriptStyle);
  const actions = document.getElementById("autoBuildHeaderActions");
  const preflightButton = document.getElementById("preflight") as HTMLButtonElement | null;
  const startButton = document.getElementById("start") as HTMLButtonElement | null;
  const stopButton = document.getElementById("stop") as HTMLButtonElement | null;
  let executionBusy = false;
  const runToggle = document.createElement("button"); runToggle.id = "autoBuildRunToggle"; runToggle.className = "primary"; runToggle.textContent = "运行"; runToggle.title = "运行全部任务"; runToggle.setAttribute("aria-label", "运行全部任务");
  if (actions && preflightButton) {
    preflightButton.textContent = "预检";
    actions.replaceChildren(preflightButton, runToggle);
  }
  const syncExecutionControls = (busy: boolean) => {
    executionBusy = busy;
    if (preflightButton) preflightButton.disabled = busy;
    if (startButton) startButton.disabled = busy;
    // Stop must remain available while either Right or Primary waits for a configuration snapshot.
    if (stopButton) stopButton.disabled = !busy;
    runToggle.textContent = busy ? "停止" : "运行";
    runToggle.title = busy ? "停止当前请求或任务" : "运行全部任务";
    runToggle.setAttribute("aria-label", runToggle.title);
    document.querySelectorAll<HTMLButtonElement>('button[data-row-action="runProject"],button[data-row-action="updateProject"],button[data-task-id]').forEach((button) => { button.disabled = busy; });
  };
  runToggle.addEventListener("click", () => {
    if (stopButton && !stopButton.disabled) stopButton.click();
    else startButton?.click();
  });
  const status = document.getElementById("status");
  const executionBlock = status?.closest<HTMLElement>(".auto-build-block");
  const rootInput = document.getElementById("root") as HTMLInputElement | null;
  const rootRow = rootInput?.closest(".repo");
  if (rootInput && rootRow) {
    const rootBlock = rootRow.closest(".auto-build-block");
    rootRow.querySelector("strong")!.textContent = "当前 ROOT_DIR";
    rootInput.readOnly = true; rootInput.title = "从当前工程环境探测，只读"; rootInput.style.opacity = "0.82";
    const workingRow = document.createElement("div");
    workingRow.className = "repo";
    workingRow.innerHTML = '<strong>工作目录</strong><input id="workingDirectory" title="从 Primary 当前目录带入，可编辑"><span></span>';
    rootRow.parentElement?.insertBefore(workingRow, rootRow.nextSibling);
    const rootUpdates = document.createElement("span"); rootUpdates.className = "auto-build-block-summary-controls"; rootUpdates.innerHTML = '<label><input id="updateRoot" type="checkbox">更新 ROOT_DIR</label><label><input id="updateThirdParty" type="checkbox">更新 3rdParty</label>'; guardSummaryControls(rootUpdates);
    if (rootBlock) setBlockHeader(rootBlock, "构建配置", rootUpdates);
  }
  const buildBlock = document.getElementById("cmake")?.closest(".auto-build-block");
  const updateParallelBuildDisplay = (checked: boolean) => { const input = document.getElementById("parallelBuild") as HTMLInputElement | null, hint = document.getElementById("parallelBuildHint"); if (input) input.checked = checked; if (hint) hint.textContent = checked ? "已勾选：CMake + CAA 同时启动" : "未勾选：顺序执行 CMake → CAA"; };
  let projectRows: HTMLDivElement | undefined;
  if (buildBlock) {
    buildBlock.querySelectorAll("label.build").forEach((item) => { (item as HTMLElement).style.display = "none"; });
    const mode = document.createElement("label");
    mode.className = "parallel-option";
    mode.innerHTML = '<input id="parallelBuild" type="checkbox"><strong>并行编译</strong><small id="parallelBuildHint">未勾选：顺序执行 CMake → CAA</small>';
    mode.style.display = "none";
    mode.querySelector("input")?.addEventListener("change", (event) => updateParallelBuildDisplay((event.currentTarget as HTMLInputElement).checked));
    const tools = document.createElement("span"); tools.className = "auto-build-block-summary-controls"; tools.innerHTML = '<button id="pickProjects">选择目录…</button><button id="discoverProjects">探测当前目录</button><button id="removeDisabledProjects">移除未启用项</button><label><input id="projectProbeColumns" type="checkbox" checked>探测列</label>'; guardSummaryControls(tools);
    setBlockHeader(buildBlock, "项目与仓库", tools);
    projectRows = document.createElement("div"); projectRows.id = "projectRows";
    buildBlock.querySelector(":scope > .auto-build-block-body")?.append(mode, projectRows);
  }
  const normalizeDisplayPath = (value: string) => value.trim().replace(/\\/gu, "/").replace(/\/+$/u, "").toLocaleLowerCase();
  const findSnapshotByRole = (role: "ROOT_DIR" | "ROOT_DIR_3rdParty") => repositorySnapshot?.repositories.find((item) => item.role === role);
  const findSnapshotForProject = (project: ProjectRow) => {
    const projectKey = normalizeDisplayPath(project.path);
    if (!projectKey) return undefined;
    return repositorySnapshot?.repositories.find((item) => {
      const repositoryKey = normalizeDisplayPath(item.path);
      return repositoryKey === projectKey || repositoryKey.endsWith(`/${projectKey}`);
    });
  };
  const renderProjects = () => {
    if (!projectRows) return;
    const previousScrollLeft = projectRows.scrollLeft;
    const activeControl = projectRows.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
    const activeProjectId = activeControl?.dataset.projectId;
    const activeProjectField = activeControl?.dataset.projectField;
    const activeSelection = activeControl instanceof HTMLInputElement
      ? { start: activeControl.selectionStart, end: activeControl.selectionEnd }
      : undefined;
    const table = document.createElement("table"); table.className = "project-table"; table.dataset.probeColumnsVisible = String(probeColumnsVisible);
    const columns = document.createElement("colgroup"); columns.innerHTML = '<col class="project-col-enabled"><col class="project-col-kind"><col class="project-col-branch"><col class="project-col-repository"><col class="project-col-commit" data-project-probe-column><col class="project-col-origin" data-project-probe-column><col class="project-col-status" data-project-probe-column><col class="project-col-build"><col class="project-col-actions">';
    const head = document.createElement("thead"); const header = document.createElement("tr");
    for (const [label, probeColumn] of [["启用", false], ["类型", false], ["分支", false], ["仓库 / 目录", false], ["Commit", true], ["Origin", true], ["状态", true], ["构建", false], ["操作", false]] as const) { const cell = document.createElement("th"); cell.textContent = label; if (probeColumn) cell.dataset.projectProbeColumn = ""; header.append(cell); }
    head.append(header); const tableBody = document.createElement("tbody");
    const cell = (content: Node, probeColumn = false) => { const value = document.createElement("td"); if (probeColumn) value.dataset.projectProbeColumn = ""; value.append(content); return value; };
    const text = (value: string, className = "") => { const element = document.createElement("span"); element.textContent = value; element.title = value; element.className = className; return element; };
    const snapshotCells = (probe: { commit?: string; origin?: string; branch?: string; hasChanges?: boolean; error?: string } | undefined, fallbackStatus = "未探测") => {
      const commit = text(probe?.commit?.slice(0, 12) || "—", "project-version"); commit.title = probe?.commit || "";
      const origin = text(probe?.origin || "—", "project-version");
      const statusText = probe?.error ? "错误" : probe ? probe.hasChanges ? "有修改" : "干净" : fallbackStatus;
      const state = text(statusText); state.title = probe?.error || statusText;
      return [cell(commit, true), cell(origin, true), cell(state, true)] as const;
    };
    const fixedRepositories: Array<{ kind: "Root" | "3rdParty"; pathId: "root" | "third"; branchId: "rootBranch" | "branch"; updateId: "updateRoot" | "updateThirdParty"; role: "ROOT_DIR" | "ROOT_DIR_3rdParty" }> = [
      { kind: "Root", pathId: "root", branchId: "rootBranch", updateId: "updateRoot", role: "ROOT_DIR" },
      { kind: "3rdParty", pathId: "third", branchId: "branch", updateId: "updateThirdParty", role: "ROOT_DIR_3rdParty" },
    ];
    for (const repository of fixedRepositories) {
      const row = document.createElement("tr");
      row.dataset.projectId = repository.role;
      const pathSource = document.getElementById(repository.pathId) as HTMLInputElement;
      const branchSource = document.getElementById(repository.branchId) as HTMLInputElement;
      const updateSource = document.getElementById(repository.updateId) as HTMLInputElement;
      const isEnabled = repository.role === "ROOT_DIR" ? rootEnabled : thirdPartyEnabled;
      updateSource.disabled = !isEnabled;
      const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = isEnabled; enabled.dataset.projectId = repository.role; enabled.dataset.projectField = "enabled"; enabled.title = `启用或停用 ${repository.kind} 的仓库更新、探测和清理`; enabled.setAttribute("aria-label", `启用 ${repository.kind}`); enabled.onchange = () => { if (repository.role === "ROOT_DIR") rootEnabled = enabled.checked; else thirdPartyEnabled = enabled.checked; renderProjects(); scheduleDraftPublication(); };
      const kind = text(repository.kind, "project-kind");
      const branch = document.createElement("input"); branch.value = branchSource.value; branch.dataset.projectId = repository.role; branch.dataset.projectField = "branch"; branch.setAttribute("aria-label", `${repository.kind} 分支`); branch.oninput = () => { branchSource.value = branch.value.trim(); branchSource.dispatchEvent(new Event("input", { bubbles: true })); };
      const path = text(pathSource.value || "—", "project-version");
      const buildOptions = document.createElement("span"); buildOptions.className = "project-build-options";
      const updateLabel = document.createElement("label"), update = document.createElement("input"); update.type = "checkbox"; update.checked = updateSource.checked; update.disabled = !isEnabled; update.dataset.projectId = repository.role; update.dataset.projectField = "update"; update.onchange = () => { updateSource.checked = update.checked; updateSource.dispatchEvent(new Event("change", { bubbles: true })); }; updateLabel.append(update, "更新"); buildOptions.append(updateLabel);
      row.append(cell(enabled), cell(kind), cell(branch), cell(path), ...snapshotCells(findSnapshotByRole(repository.role)), cell(buildOptions), cell(document.createElement("span")));
      tableBody.append(row);
    }
    const projectBody = projects.map((project) => {
      const row = document.createElement("tr");
      row.dataset.projectId = project.id;
      const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = project.enabled; enabled.dataset.projectId = project.id; enabled.dataset.projectField = "enabled"; enabled.onchange = () => { project.enabled = enabled.checked; };
      const path = document.createElement("input"); path.value = project.path; path.title = project.path; path.dataset.projectId = project.id; path.dataset.projectField = "path"; path.setAttribute("aria-label", `仓库：${project.name}`); path.oninput = () => { project.path = path.value.trim(); };
      const branch = document.createElement("input"); branch.value = project.branch; branch.dataset.projectId = project.id; branch.dataset.projectField = "branch"; branch.oninput = () => { project.branch = branch.value.trim(); };
      const projectSnapshot = findSnapshotForProject(project);
      const commitValue = project.probe?.commit || projectSnapshot?.commit || "";
      const originValue = project.probe?.origin || projectSnapshot?.origin || "";
      const commit = text(commitValue.slice(0, 12) || "—", "project-version"); commit.title = commitValue;
      const origin = text(originValue || "—", "project-version"); origin.title = originValue;
      const states: Record<string, string> = { clean: "干净", modified: "有修改", invalid: "无效", "not-git": "非 Git", "script-mismatch": "脚本不一致", unknown: "未探测" };
      const stateValue = project.probe ? states[project.probe.status] || project.probe.status : projectSnapshot?.error ? "错误" : projectSnapshot ? projectSnapshot.hasChanges ? "有修改" : "干净" : "未探测";
      const state = text(stateValue); state.title = project.probe?.message || projectSnapshot?.error || stateValue;
      const buildOptions = document.createElement("span"); buildOptions.className = "project-build-options";
      for (const [key, label] of [["update", "更新"], ["cmake", "CMake"], ["caa", "CAA"], ["linkCaa", "linkCAA"]] as const) { const option = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox"; input.checked = project.operations[key]; input.dataset.projectId = project.id; input.dataset.projectField = key; input.onchange = () => { project.operations[key] = input.checked; }; option.append(input, label); buildOptions.append(option); }
      const operations = document.createElement("span"); operations.className = "project-operations";
      const actionIcons = { probeProject: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4"></circle><path d="m10 10 3 3"></path></svg>', updateProject: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 7a5 5 0 1 0-1 4M13 3v4H9"></path></svg>', runProject: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5 12 8l-7 4.5z"></path></svg>', removeProject: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"></path></svg>' } as const;
      for (const [label, action] of [["探测", "probeProject"], ["更新", "updateProject"], ["运行", "runProject"], ["移除", "removeProject"]] as const) { const button = document.createElement("button"); button.className = "project-action-button"; button.dataset.rowAction = action; button.dataset.projectId = project.id; button.dataset.projectField = action; button.innerHTML = actionIcons[action]; button.title = action === "updateProject" ? `更新 Git 到 ${project.branch}（仅此仓库，不编译）` : label; button.disabled = (action === "runProject" || action === "updateProject") && executionBusy; button.setAttribute("aria-label", `${label} ${project.name}`); button.onclick = () => { if (action === "removeProject") { projects = projects.filter((item) => item.id !== project.id); renderProjects(); scheduleDraftPublication(); } else postProjectRequest({ type: action, projectId: project.id }); }; operations.append(button); }
      row.append(cell(enabled), cell(text("项目", "project-kind")), cell(branch), cell(path), cell(commit, true), cell(origin, true), cell(state, true), cell(buildOptions), cell(operations)); return row;
    });
    tableBody.append(...projectBody); table.append(columns, head, tableBody); projectRows.replaceChildren(table);
    projectRows.scrollLeft = previousScrollLeft;
    if (activeProjectId && activeProjectField) {
      const nextControl = projectRows.querySelector<HTMLElement>(`[data-project-id="${CSS.escape(activeProjectId)}"][data-project-field="${CSS.escape(activeProjectField)}"]`);
      nextControl?.focus({ preventScroll: true });
      if (nextControl instanceof HTMLInputElement && activeSelection && activeSelection.start !== null && activeSelection.end !== null) {
        nextControl.setSelectionRange(activeSelection.start, activeSelection.end);
      }
    }
  };
  document.getElementById("projectProbeColumns")?.addEventListener("change", (event) => { event.stopPropagation(); probeColumnsVisible = (event.currentTarget as HTMLInputElement).checked; const table = projectRows?.querySelector<HTMLTableElement>(".project-table"); if (table) table.dataset.probeColumnsVisible = String(probeColumnsVisible); });
  for (const id of ["updateRoot", "updateThirdParty"]) document.getElementById(id)?.addEventListener("change", renderProjects);
  const readConfiguration = (): KtcAutoBuildConfiguration => ({
    schemaVersion: 2,
    rootDirectory: (document.getElementById("root") as HTMLInputElement).value.trim(),
    thirdPartyDirectory: (document.getElementById("third") as HTMLInputElement).value.trim(),
    rootEnabled,
    thirdPartyEnabled,
    updateRoot: (document.getElementById("updateRoot") as HTMLInputElement).checked,
    updateThirdParty: (document.getElementById("updateThirdParty") as HTMLInputElement).checked,
    workingDirectory: (document.getElementById("workingDirectory") as HTMLInputElement).value.trim(),
    rootBranch: (document.getElementById("rootBranch") as HTMLInputElement).value.trim(),
    branch: (document.getElementById("branch") as HTMLInputElement).value.trim(),
    cmakeBranch: (document.getElementById("cmakeBranch") as HTMLInputElement).value.trim(),
    projects,
    buildExecutionMode: (document.getElementById("parallelBuild") as HTMLInputElement).checked ? "parallel" : "sequential",
    clean: false,
    rootCleanupYaml,
    cmakeBuildTypes,
    repositorySnapshot,
  });
  let draftRevision = 0;
  let draftPublicationScheduled = false;
  publishDraft = (configuration = readConfiguration()) => {
    draftRevision += 1;
    autoBuildVsCode.postMessage({
      type: "draftChanged",
      documentId: autoBuildDocumentId,
      draftRevision,
      configuration,
    });
    return draftRevision;
  };
  scheduleDraftPublication = () => {
    if (draftPublicationScheduled) return;
    draftPublicationScheduled = true;
    queueMicrotask(() => {
      draftPublicationScheduled = false;
      publishDraft();
    });
  };
  postProjectRequest = (request) => {
    const configuration = readConfiguration();
    const currentDraftRevision = publishDraft(configuration);
    autoBuildVsCode.postMessage({ ...request, documentId: autoBuildDocumentId, draftRevision: currentDraftRevision, configuration });
  };
  const autoBuildMain = document.getElementById("autoBuildMain");
  autoBuildMain?.addEventListener("input", (event) => {
    if ((event.target as HTMLElement | null)?.id === "workingDirectory") {
      syncRightShellContext((event.target as HTMLInputElement).value.trim());
    }
    scheduleDraftPublication();
  });
  autoBuildMain?.addEventListener("change", scheduleDraftPublication);
  document.getElementById("pickProjects")?.addEventListener("click", () => postProjectRequest({ type: "pickProjectDirectories" }));
  document.getElementById("discoverProjects")?.addEventListener("click", () => postProjectRequest({ type: "discoverProjectDirectories" }));
  document.getElementById("removeDisabledProjects")?.addEventListener("click", () => { projects = projects.filter((project) => project.enabled); renderProjects(); scheduleDraftPublication(); });
  for (const type of ["preflight", "start"] as const) document.getElementById(type)?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    const configuration = readConfiguration();
    const currentDraftRevision = publishDraft(configuration);
    autoBuildVsCode.postMessage({ type, documentId: autoBuildDocumentId, draftRevision: currentDraftRevision, configuration });
  }, { capture: true });
  const taskBlock = createBlock("任务列表"), block = taskBlock.details;
  const rows = document.createElement("div");
  rows.textContent = "尚未生成任务。";
  taskBlock.body.append(rows);
  if (status) { status.className = "auto-build-block-summary-status"; setBlockHeader(block, "任务列表", status); }
  executionBlock?.parentElement?.insertBefore(block, executionBlock);
  if (executionBlock) executionBlock.hidden = true;
  const scriptWindow = document.createElement("section"); scriptWindow.className = "script-window"; scriptWindow.hidden = true;
  scriptWindow.innerHTML = '<header class="script-window-header"><span>脚本</span><button id="closeScriptWindow" title="关闭">×</button></header><div class="script-tabs" role="tablist"><button class="script-tab" id="buildScriptTab" role="tab" aria-selected="true">构建脚本</button><button class="script-tab" id="checkoutScriptTab" role="tab" aria-selected="false">仓库检出</button><button class="script-tab" id="manifestScriptTab" role="tab" aria-selected="false">版本归档</button></div><div class="script-window-body"><label class="script-output" id="scriptOutputDirectory">输出目录<span class="script-output-row"><input id="scriptTargetDirectory" type="text"><button id="pickScriptTargetDirectory">选择…</button></span></label><div id="checkoutScriptOptions" class="script-options" hidden><label><input id="checkoutIncludeRoots" type="checkbox">包含 Root、3rdParty</label><label><input id="checkoutIncludeBranch" type="checkbox" checked>指定当前分支</label><label><input id="checkoutIncludeCommit" type="checkbox">固定 Commit</label></div><div id="manifestScriptOptions" class="script-options" hidden><label><input name="manifestTarget" value="working" type="radio" checked>当前工作目录</label><label><input name="manifestTarget" value="root" type="radio">ROOT_DIR</label><label><input name="manifestMode" value="overwrite" type="radio" checked>覆盖保存</label><label><input name="manifestMode" value="merge" type="radio">追加记录</label></div><div id="scriptKindNote" class="script-window-note"></div><div class="actions"><button id="confirmWriteScript">写入</button><button id="cancelWriteScript">取消</button></div></div>';
  document.body.append(scriptWindow);
  const scriptTarget = document.getElementById("scriptTargetDirectory") as HTMLInputElement, scriptNote = document.getElementById("scriptKindNote")!, buildTab = document.getElementById("buildScriptTab")!, checkoutTab = document.getElementById("checkoutScriptTab")!, manifestTab = document.getElementById("manifestScriptTab")!;
  let selectedScriptKind: "build" | "checkout" | "manifest" = "build";
  const selectScriptTab = (kind: "build" | "checkout" | "manifest") => { selectedScriptKind = kind; buildTab.setAttribute("aria-selected", String(kind === "build")); checkoutTab.setAttribute("aria-selected", String(kind === "checkout")); manifestTab.setAttribute("aria-selected", String(kind === "manifest")); (document.getElementById("checkoutScriptOptions") as HTMLElement).hidden = kind !== "checkout"; (document.getElementById("manifestScriptOptions") as HTMLElement).hidden = kind !== "manifest"; (document.getElementById("scriptOutputDirectory") as HTMLElement).hidden = kind === "manifest"; scriptNote.textContent = kind === "checkout" ? "默认仅克隆项目表仓库；各仓库独立执行，最后统计结果。Root、3rdParty 需单独勾选。" : kind === "manifest" ? "输出一个 BUILD_MANIFEST.json；记录 Root、3rdParty 和本次勾选编译的项目，并按 Git 地址稳定排序。" : "输出 Windows Invoke-AutoBuild.local.ps1；CMake 配置仍按项目 mk.ps1 执行，不消费界面的 Debug/Release 选择。"; };
  const openScriptManager = () => { scriptTarget.value = (document.getElementById("workingDirectory") as HTMLInputElement).value.trim(); selectScriptTab(selectedScriptKind); scriptWindow.hidden = false; scriptWindow.style.left = `${Math.max(16, (window.innerWidth - scriptWindow.offsetWidth) / 2)}px`; scriptWindow.style.top = "70px"; scriptTarget.focus(); };
  buildTab.addEventListener("click", () => selectScriptTab("build"));
  checkoutTab.addEventListener("click", () => selectScriptTab("checkout"));
  manifestTab.addEventListener("click", () => selectScriptTab("manifest"));
  for (const id of ["closeScriptWindow", "cancelWriteScript"]) document.getElementById(id)?.addEventListener("click", () => { scriptWindow.hidden = true; });
  document.getElementById("confirmWriteScript")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "writeScript", scriptKind: selectedScriptKind, targetDirectory: scriptTarget.value, manifestMode: (document.querySelector('input[name="manifestMode"]:checked') as HTMLInputElement)?.value || "overwrite", manifestTarget: (document.querySelector('input[name="manifestTarget"]:checked') as HTMLInputElement)?.value || "working", checkoutOptions: { includeRoots: (document.getElementById("checkoutIncludeRoots") as HTMLInputElement).checked, includeBranch: (document.getElementById("checkoutIncludeBranch") as HTMLInputElement).checked, includeCommit: (document.getElementById("checkoutIncludeCommit") as HTMLInputElement).checked }, configuration: readConfiguration() }));
  document.getElementById("pickScriptTargetDirectory")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "pickScriptTargetDirectory", targetDirectory: scriptTarget.value }));
  const scriptHeader = scriptWindow.querySelector<HTMLElement>(".script-window-header")!; let drag: { x: number; y: number; left: number; top: number } | undefined;
  scriptHeader.addEventListener("pointerdown", (event) => { if ((event.target as HTMLElement).closest("button")) return; const bounds = scriptWindow.getBoundingClientRect(); drag = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top }; scriptHeader.setPointerCapture(event.pointerId); });
  scriptHeader.addEventListener("pointermove", (event) => { if (!drag) return; scriptWindow.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, drag.left + event.clientX - drag.x))}px`; scriptWindow.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, drag.top + event.clientY - drag.y))}px`; });
  scriptHeader.addEventListener("pointerup", () => { drag = undefined; });
  const isCurrentDraftResponse = (message: { documentId?: string; draftRevision?: number }): boolean => {
    if (message.documentId === undefined && message.draftRevision === undefined) return true;
    return message.documentId === autoBuildDocumentId && message.draftRevision === draftRevision;
  };
  const mergeProjectProbes = (incomingProjects: ProjectRow[]): void => {
    const incomingById = new Map(incomingProjects.map((project) => [project.id, project]));
    projects = projects.map((project) => {
      const incoming = incomingById.get(project.id);
      return incoming?.probe ? { ...project, probe: incoming.probe } : project;
    });
  };
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.data?.type === "openScriptManager") { openScriptManager(); return; }
    if (event.data?.type === "requestConfiguration") {
      const request = event.data as KtcAutoBuildConfigurationRequest;
      if (request.documentId !== autoBuildDocumentId) return;
      autoBuildVsCode.postMessage({
        type: "configurationSnapshot",
        requestId: request.requestId,
        documentId: autoBuildDocumentId,
        draftRevision,
        configuration: readConfiguration(),
      });
      return;
    }
    if (event.data?.type === "configuration") {
      const statusHint = document.getElementById("status");
      if (event.data.platform && event.data.platform !== "win32") {
        const platformName = event.data.platform === "darwin" ? "macOS" : event.data.platform;
        if (statusHint?.textContent === "空闲") statusHint.textContent = `${platformName} ：Git / CMake 原生运行；export.ps1、linkCAA 和 CAA 暂跳过，日志说明原因。`;
      }
      const configuration = event.data.configuration || {};
      const rootDirectory = typeof configuration.rootDirectory === "string"
        ? configuration.rootDirectory
        : event.data.detectedRootDirectory || "";
      (document.getElementById("root") as HTMLInputElement).value = rootDirectory;
      (document.getElementById("third") as HTMLInputElement).value = configuration.thirdPartyDirectory || "";
      (document.getElementById("rootBranch") as HTMLInputElement).value = configuration.rootBranch || "develop";
      (document.getElementById("branch") as HTMLInputElement).value = configuration.branch || "develop";
      (document.getElementById("cmakeBranch") as HTMLInputElement).value = configuration.cmakeBranch || "master";
      (document.getElementById("workingDirectory") as HTMLInputElement).value = configuration.workingDirectory || "";
      syncRightShellContext(configuration.workingDirectory || "");
      rootEnabled = configuration.rootEnabled !== false;
      thirdPartyEnabled = configuration.thirdPartyEnabled !== false;
      rootCleanupYaml = typeof configuration.rootCleanupYaml === "string"
        ? configuration.rootCleanupYaml
        : KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML;
      (document.getElementById("updateRoot") as HTMLInputElement).checked = !!configuration.updateRoot;
      (document.getElementById("updateThirdParty") as HTMLInputElement).checked = !!configuration.updateThirdParty;
      repositorySnapshot = configuration.repositorySnapshot;
      projects = configuration.projects || []; renderProjects();
      cmakeBuildTypes = configuration.cmakeBuildTypes ?? ["Debug", "Release"];
      updateParallelBuildDisplay(configuration.buildExecutionMode === "parallel");
      scheduleDraftPublication();
    }
    if (event.data?.type === "projectProbe") {
      if (!isCurrentDraftResponse(event.data)) return;
      projects = projects.map((project) => project.id === event.data.projectId && event.data.probe
        ? { ...project, probe: event.data.probe }
        : project);
      renderProjects();
    }
    if (event.data?.type === "projects") {
      if (!isCurrentDraftResponse(event.data)) return;
      if (event.data.mode === "replace") {
        projects = event.data.projects || [];
        renderProjects();
        scheduleDraftPublication();
      } else {
        mergeProjectProbes(event.data.projects || []);
        renderProjects();
      }
    }
    if (event.data?.type === "repositorySnapshot") { if (!isCurrentDraftResponse(event.data)) return; repositorySnapshot = event.data.snapshot; renderProjects(); }
    if (event.data?.type === "workingDirectory") { (document.getElementById("workingDirectory") as HTMLInputElement).value = event.data.value || ""; syncRightShellContext(event.data.value || ""); scheduleDraftPublication(); }
    if (event.data?.type === "buildExecutionMode") { updateParallelBuildDisplay(event.data.value === "parallel"); scheduleDraftPublication(); }
    if (event.data?.type === "cmakeBuildTypes") {
      cmakeBuildTypes = event.data.value;
      scheduleDraftPublication();
    }
    if (event.data?.type === "rootCleanupYaml") {
      rootCleanupYaml = typeof event.data.value === "string"
        ? event.data.value.slice(0, 4_096)
        : KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML;
      scheduleDraftPublication();
    }
    if (event.data?.type === "scriptWritten") scriptWindow.hidden = true;
    if (event.data?.type === "scriptTargetDirectory") scriptTarget.value = event.data.value || "";
    if (event.data?.type === "status") syncExecutionControls(event.data.status === "in_progress");
    if (event.data?.type !== "tasks") return;
    const scrollX = window.scrollX, scrollY = window.scrollY;
    const expandedTasks = new Map(Array.from(rows.querySelectorAll<HTMLDetailsElement>("details[data-task-id]")).map((item) => [item.dataset.taskId || "", item.open]));
    const focusedTaskId = (document.activeElement as HTMLElement | null)?.dataset.taskId;
    rows.replaceChildren(...event.data.tasks.map((task: { id: string; name: string; commandSummary: string; status: string; children?: Array<{ name: string; commandSummary: string; detail?: string; status: string }> }, taskIndex: number) => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:minmax(160px,1fr) minmax(180px,2fr) 72px 58px;gap:8px;padding:5px;border-bottom:1px solid var(--vscode-panel-border)";
      const name = document.createElement("span"), command = document.createElement("code"), state = document.createElement("span"), run = document.createElement("button");
      const statusText: Record<string, string> = { waiting: "等待", in_progress: "进行中", done: "完成", error: "失败", skipped: "已跳过", cancelled: "已取消" };
      name.textContent = `${taskIndex + 1}. ${task.name}`; command.textContent = task.commandSummary; command.title = task.commandSummary; state.textContent = statusText[task.status] || task.status;
      run.textContent = "运行"; run.title = `单独运行：${task.name}`; run.disabled = executionBusy || task.status === "in_progress";
      run.dataset.taskId = task.id;
      run.onclick = (event) => { event.preventDefault(); event.stopPropagation(); postProjectRequest({ type: "runTask", taskId: task.id }); };
      row.append(name, command, state, run);
      if (!task.children?.length) return row;
      const tree = document.createElement("details"); tree.className = "task-tree"; tree.dataset.taskId = task.id; tree.open = expandedTasks.get(task.id) ?? true;
      const summary = document.createElement("summary"); summary.append(row); tree.append(summary);
      task.children.forEach((child, childIndex) => { const childRow = document.createElement("div"); childRow.style.cssText = "display:grid;grid-template-columns:minmax(220px,2fr) 110px minmax(120px,1fr) 72px;gap:8px;padding:4px 5px 4px 24px;border-bottom:1px solid var(--vscode-panel-border)"; for (const value of [`${taskIndex + 1}.${childIndex + 1} ${child.name}`, child.commandSummary, child.detail || "", statusText[child.status] || child.status]) { const cell = document.createElement("span"); cell.textContent = value; cell.title = value; cell.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap"; childRow.append(cell); } tree.append(childRow); });
      return tree;
    }));
    requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
      if (focusedTaskId) rows.querySelector<HTMLElement>(`button[data-task-id="${CSS.escape(focusedTaskId)}"]`)?.focus({ preventScroll: true });
    });
  });
  ktcMountAutoBuildCleanupView({ postMessage: (message) => autoBuildVsCode.postMessage(message) });
  autoBuildVsCode.postMessage({ type: "ready", documentId: autoBuildDocumentId });
});
