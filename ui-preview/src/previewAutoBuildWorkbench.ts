import { addPreviewAutoBuildSampleDirectories, removePreviewAutoBuildDisabledProjects, updatePreviewAutoBuildConfiguration, updatePreviewAutoBuildRepository, type PreviewAutoBuildConfigurationPatch, type PreviewAutoBuildRepositoryPatch } from "./previewAutoBuildDraft.js";
import { createPreviewAutoBuildDialogs, button, checkbox, input, label, select, type PreviewAutoBuildDialogHost } from "./previewAutoBuildDialogs.js";
import type { PreviewBuildProbeStatus } from "./previewAutoBuildSession.js";

export function createPreviewAutoBuildWorkbench(host: PreviewAutoBuildDialogHost) {
  const dialogs = createPreviewAutoBuildDialogs(host);
  const probeScenarios = new Map<string, PreviewBuildProbeStatus>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let taskTimer: ReturnType<typeof setTimeout> | undefined;
  let renderIdentity: unknown;
  const style = document.createElement("style"); style.dataset.autoBuildWorkbenchStyle = "";
  style.textContent = STYLES; document.head.append(style);

  const edit = (change: ReturnType<typeof updatePreviewAutoBuildRepository>) => host.dispatch({ type: "edit", change });
  document.querySelectorAll<HTMLInputElement>("[data-auto-build-config-field]").forEach((field) => {
    field.addEventListener("change", () => {
      if (field.readOnly) return;
      const key = field.dataset.autoBuildConfigField as keyof PreviewAutoBuildConfigurationPatch;
      edit(updatePreviewAutoBuildConfiguration(host.state().session.draft, { [key]: field.value }));
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-auto-build-project-tool]").forEach((field) => {
    field.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation(); if (host.state().session.running) return;
      switch (field.dataset.autoBuildProjectTool) {
        case "import": dialogs.openImport(); break;
        case "selectDirectories": dialogs.chooseDirectories(); break;
        case "removeDisabled": edit(removePreviewAutoBuildDisabledProjects(host.state().session.draft)); break;
        case "discover": {
          const draft = host.state().session.draft;
          const change = addPreviewAutoBuildSampleDirectories(draft, [
            ...draft.repositories.filter((row) => row.kind === "项目").map((row) => ({ path: row.path, origin: row.originTitle, buildKinds: row.buildKinds })),
            { path: `${draft.configuration.workingDirectory}/DiscoveredSample`, origin: "https://example.invalid/preview/discovered.git", buildKinds: ["cmake"] as const },
          ]);
          edit(change);
          for (const row of host.state().session.draft.repositories) probe(row.id);
          break;
        }
      }
    });
  });
  function probe(repositoryId: string) {
    if (host.state().session.running) return;
    host.dispatch({ type: "probe", repositoryId });
    const session = host.state().session;
    const request = session.pendingProbes.find((item) => item.repositoryId === repositoryId);
    if (!request) return;
    const row = session.draft.repositories.find((item) => item.id === repositoryId)!;
    const scenario = probeScenarios.get(repositoryId) ?? (row.status.includes("有修改") ? "dirty" : row.name.includes("NotGit") ? "not-git" : "clean");
    const timer = setTimeout(() => { timers.delete(timer); host.dispatch({ type: "probeResult", request, status: scenario }); }, 650);
    timers.add(timer);
  }
  function render() {
    const { session } = host.state();
    document.querySelectorAll<HTMLElement>("[data-auto-build-config-draft]").forEach((element) => { element.textContent = `${session.draft.configuration.currentConfigName} · revision ${session.draft.revision} · ${session.message}`; });
    document.querySelectorAll<HTMLInputElement>("[data-auto-build-config-field]").forEach((field) => {
      const value = session.draft.configuration[field.dataset.autoBuildConfigField as keyof typeof session.draft.configuration];
      if (typeof value === "string" && document.activeElement !== field) field.value = value;
      field.disabled = session.running;
    });
    document.querySelectorAll<HTMLButtonElement>("[data-auto-build-project-tool]").forEach((button) => { button.disabled = session.running; });
    // Preserve the table DOM while typing; only a new session snapshot needs a projection.
    if (renderIdentity !== session) { renderRepositories(); renderTasks(); renderIdentity = session; }
    if (session.running && !taskTimer) {
      const epoch = session.epoch;
      taskTimer = setTimeout(() => { taskTimer = undefined; host.dispatch({ type: "advance", epoch }); }, 900);
    } else if (!session.running && taskTimer) { clearTimeout(taskTimer); taskTimer = undefined; }
  }
  function renderRepositories() {
    const body = document.querySelector<HTMLTableSectionElement>("[data-auto-build-project-rows]"); if (!body) return;
    const scroll = body.closest<HTMLElement>(".preview-build-table-scroll") ?? body.parentElement?.parentElement;
    const left = scroll?.scrollLeft ?? 0;
    const active = document.activeElement as HTMLInputElement | null;
    const focus = active?.dataset.autoBuildFocus;
    const selection = active?.type === "text" ? [active.selectionStart, active.selectionEnd] as const : undefined;
    const { session } = host.state();
    body.replaceChildren(...session.draft.repositories.map((repository) => {
      const row = document.createElement("tr"); row.dataset.repositoryId = repository.id;
      const patch = (value: PreviewAutoBuildRepositoryPatch) => edit(updatePreviewAutoBuildRepository(host.state().session.draft, repository.id, value));
      const enabled = checkbox(`启用 ${repository.name}`, repository.enabled, (enabled) => patch({ enabled })); enabled.lastChild?.remove();
      const branch = input(`${repository.name} 分支`, repository.branch); branch.dataset.autoBuildFocus = `${repository.id}:branch`; branch.addEventListener("change", () => patch({ branch: branch.value }));
      const path = input(`${repository.name} 路径`, repository.path); path.readOnly = repository.kind === "Root"; path.dataset.autoBuildFocus = `${repository.id}:path`; path.addEventListener("change", () => patch({ path: path.value }));
      const repositoryInfo = document.createElement("div"); repositoryInfo.append(label("strong", repository.name), path);
      const build = document.createElement("div"); build.className = "preview-build-options";
      for (const operation of repository.operations) build.append(checkbox(operation.label, operation.enabled, (enabled) => {
        if (operation.id === "update") patch({ update: enabled });
        else if (operation.id === "link-caa") patch({ linkCaa: enabled });
        else if (operation.id === "cmake" || operation.id === "caa") patch({ buildKinds: enabled ? [...repository.buildKinds, operation.id] : repository.buildKinds.filter((kind) => kind !== operation.id) });
      }));
      const pending = session.pendingProbes.some((item) => item.repositoryId === repository.id);
      const result = session.probes.find((item) => item.repositoryId === repository.id);
      const status = label("span", pending ? "探测中（可取消）" : result?.message ?? repository.status);
      const actions = document.createElement("div"); actions.className = "preview-auto-build-row-actions";
      actions.append(button(pending ? "取消" : "探测", () => pending ? host.dispatch({ type: "cancelProbe", repositoryId: repository.id }) : probe(repository.id), `probe:${repository.id}`));
      const scenario = select(`${repository.name} 探测场景`, [["clean", "干净"], ["dirty", "未提交"], ["missing", "缺失"], ["not-git", "非 Git"], ["invalid", "无效路径"]]);
      scenario.value = probeScenarios.get(repository.id) ?? (repository.status.includes("有修改") ? "dirty" : "clean");
      scenario.addEventListener("change", () => { probeScenarios.set(repository.id, scenario.value as PreviewBuildProbeStatus); });
      const more = document.createElement("details"); more.append(label("summary", "更多 / 模拟场景"), scenario);
      more.append(button("仅更新", () => {
        if (result && result.status !== "clean") { host.log(`[编译工具] ${result.message}；未更新或自动 stash。`); status.textContent = `${result.message}；更新已阻断`; return; }
        host.dispatch({ type: "start", taskId: `${repository.id}:repository` });
      }, `update:${repository.id}`));
      if (repository.kind === "项目") {
        actions.append(button("运行", () => host.dispatch({ type: "start", repositoryId: repository.id }), `run:${repository.id}`));
        more.append(button("上移", () => host.dispatch({ type: "move", repositoryId: repository.id, offset: -1 })), button("下移", () => host.dispatch({ type: "move", repositoryId: repository.id, offset: 1 })), button("移除", () => host.dispatch({ type: "remove", repositoryId: repository.id }), `remove:${repository.id}`));
      }
      actions.append(more);
      const cells: (Node | string)[] = [enabled, repository.kind, branch, repositoryInfo, repository.commit || "—", repository.originTitle || "—", status, build, actions];
      cells.forEach((content, index) => { const cell = document.createElement("td"); if (index >= 4 && index <= 6) cell.dataset.autoBuildProbeColumn = ""; if (typeof content === "string") { cell.textContent = content; cell.title = content; } else cell.append(content); row.append(cell); });
      row.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select").forEach((field) => { field.disabled = session.running; });
      return row;
    }));
    if (scroll) scroll.scrollLeft = left;
    if (focus) {
      const restored = Array.from(body.querySelectorAll<HTMLInputElement>("[data-auto-build-focus]")).find((field) => field.dataset.autoBuildFocus === focus);
      restored?.focus({ preventScroll: true }); if (restored && selection && selection[0] !== null && selection[1] !== null) restored.setSelectionRange(selection[0], selection[1]);
    }
  }
  function renderTasks() {
    const list = document.querySelector<HTMLElement>("[data-auto-build-task-list]"); if (!list) return;
    const { session } = host.state();
    const toolbar = document.createElement("div"); toolbar.className = "preview-auto-build-task-controls";
    toolbar.append(label("small", "内存模拟 · 逐行结果保留；CAA/导出不是跨平台执行承诺。"), button("推进一步", () => host.dispatch({ type: "advance", epoch: host.state().session.epoch }), "advance-task"));
    list.replaceChildren(toolbar, ...session.tasks.map((task, index) => {
      const row = document.createElement("div"); row.dataset.taskId = task.id;
      const status = label("em", ({ waiting: "等待", running: "运行中", success: "成功", failed: "失败", skipped: "跳过", cancelled: "取消" })[task.status]);
      status.dataset.tone = task.status === "failed" ? "error" : task.status === "success" ? "success" : task.status === "running" ? "progress" : "idle";
      const outcome = select(`${task.name} 模拟结果`, [["success", "模拟成功"], ["failed", "模拟失败"], ["skipped", "模拟跳过"]]); outcome.value = task.outcome; outcome.disabled = task.status === "running";
      outcome.addEventListener("change", () => host.dispatch({ type: "outcome", taskId: task.id, outcome: outcome.value as typeof task.outcome }));
      const retry = button(task.status === "waiting" ? "运行此项" : "重试此项", () => host.dispatch({ type: "start", taskId: task.id }), `retry:${task.id}`); retry.disabled = session.running;
      const controls = document.createElement("span"); controls.append(outcome, retry);
      row.append(label("span", String(index + 1)), label("strong", task.name), label("small", task.message), status, controls); return row;
    }));
  }
  function reset() { dialogs.close(); for (const timer of timers) clearTimeout(timer); timers.clear(); if (taskTimer) clearTimeout(taskTimer); taskTimer = undefined; probeScenarios.clear(); renderIdentity = undefined; }
  return { render, reset, dialogs, probe };
}

const STYLES = `
.preview-auto-build-dialog{padding:0;width:min(900px,94vw);max-height:88vh;color:var(--vscode-foreground);background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);}
.preview-auto-build-dialog::backdrop{background:#0008}.preview-auto-build-dialog>header,.preview-auto-build-dialog>footer{display:flex;gap:8px;padding:10px;align-items:center;background:var(--vscode-sideBar-background);}
.preview-auto-build-dialog>header{justify-content:space-between}.preview-auto-build-dialog>footer{justify-content:flex-end}.preview-auto-build-dialog-body{overflow:auto;max-height:65vh;padding:12px;display:grid;gap:10px;}
.preview-auto-build-dialog textarea{width:100%;box-sizing:border-box;resize:vertical;font-family:var(--vscode-editor-font-family,monospace)}
.preview-auto-build-dialog input,.preview-auto-build-dialog select,.preview-auto-build-dialog textarea{color:var(--vscode-input-foreground,var(--vscode-foreground));background:var(--vscode-input-background,var(--vscode-editor-background));border:1px solid var(--vscode-input-border,var(--vscode-panel-border));padding:5px;}
.preview-auto-build-dialog option{color:var(--vscode-dropdown-foreground,var(--vscode-foreground));background:var(--vscode-dropdown-background,var(--vscode-editor-background));}
.preview-auto-build-dialog [role=tablist]{display:flex;gap:8px}.preview-auto-build-dialog [role=tab][aria-selected=true]{outline:1px solid var(--vscode-focusBorder)}
.preview-auto-build-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto}.preview-auto-build-import-targets>label{display:grid;gap:4px;padding:8px 0;}
[data-auto-build-project-rows] td:nth-child(4)>div{display:grid;gap:4px}[data-auto-build-project-rows] td:nth-child(4) input{min-width:220px;width:100%;box-sizing:border-box;}
.preview-auto-build-row-actions{display:flex;gap:3px;flex-wrap:wrap}.preview-auto-build-row-actions details{font-size:11px}.preview-auto-build-row-actions details[open]{min-width:160px;}
[data-auto-build-task-list]>div:not(.preview-auto-build-task-controls){grid-template-columns:24px minmax(160px,1fr) minmax(180px,1fr) 60px auto;}
.preview-auto-build-task-controls{display:flex!important;gap:8px;flex-wrap:wrap;align-items:center}.preview-auto-build-task-controls small{flex:1}
`;
