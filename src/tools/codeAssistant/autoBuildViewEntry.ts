declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const autoBuildVsCode = acquireVsCodeApi();
(window as unknown as { acquireVsCodeApi: typeof acquireVsCodeApi }).acquireVsCodeApi = () => autoBuildVsCode;

window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("pnw-collapsible-block").forEach((legacy) => {
    const details = document.createElement("details"); details.className = "auto-build-block"; details.open = true;
    const summary = document.createElement("summary"); summary.textContent = legacy.getAttribute("title") || "";
    const body = document.createElement("div"); body.className = "auto-build-block-body"; while (legacy.firstChild) body.append(legacy.firstChild);
    details.append(summary, body); legacy.replaceWith(details);
  });
  const createBlock = (title: string) => { const details = document.createElement("details"); details.className = "auto-build-block"; details.open = true; const summary = document.createElement("summary"); summary.textContent = title; const body = document.createElement("div"); body.className = "auto-build-block-body"; details.append(summary, body); return { details, body }; };
  let repositorySnapshot: { capturedAt: string; repositories: Array<{ role: string; path: string; branch: string; commit: string; origin: string; hasChanges?: boolean; error?: string }> } | undefined;
  type ProjectRow = { id: string; enabled: boolean; name: string; path: string; branch: string; operations: { update: boolean; cmake: boolean; caa: boolean; linkCaa: boolean }; probe?: { commit: string; origin: string; status: string; message?: string } };
  let projects: ProjectRow[] = [];
  const style = document.createElement("style");
  style.textContent = ".auto-build-block{display:block;margin:0 0 9px;border:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));border-radius:4px;background:var(--vscode-editor-background)}.auto-build-block>summary{display:flex;min-height:29px;align-items:center;gap:5px;padding:3px 7px;box-sizing:border-box;border-bottom:1px solid var(--vscode-panel-border,var(--vscode-contrastBorder));color:var(--vscode-foreground);background:var(--vscode-sideBarSectionHeader-background,transparent);font-weight:600;cursor:pointer;list-style:none}.auto-build-block>summary::-webkit-details-marker{display:none}.auto-build-block>summary::before{width:14px;content:'›';font-size:18px;line-height:1;transform:rotate(0deg)}.auto-build-block[open]>summary::before{transform:rotate(90deg)}.auto-build-block:not([open])>summary{border-bottom:0}.auto-build-block-body{padding:8px}.command-header{position:sticky;top:0;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-12px -12px 8px;padding:7px 12px;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.view-heading{display:flex;align-items:baseline;gap:8px;min-width:0}.view-heading strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.view-heading span{color:var(--vscode-descriptionForeground);font-size:12px;white-space:nowrap}.header-actions{display:flex;flex:none;gap:7px}.config-toolbar{margin-bottom:8px}.header-actions button.primary{color:var(--vscode-button-foreground);background:var(--vscode-button-background)}.project-table-shell{position:relative;width:100%;max-width:100%}#projectRows{width:100%;max-width:100%;overflow-x:auto}.project-table-row{display:grid;grid-template-columns:42px 90px minmax(160px,220px) 100px minmax(280px,1fr) 76px 290px 92px;gap:6px;align-items:center;width:max(100%,1210px);height:43px;box-sizing:border-box;padding:5px;border-bottom:1px solid var(--vscode-panel-border)}.project-table-row>input{min-width:0;width:100%;box-sizing:border-box}.project-action-rail{position:absolute;top:0;right:0;z-index:4;width:92px;background:var(--vscode-editor-background);box-shadow:-8px 0 8px -8px var(--vscode-widget-shadow)}.project-action-rail-cell{display:flex;align-items:center;height:43px;box-sizing:border-box;padding:5px;border-bottom:1px solid var(--vscode-panel-border)}.project-version{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-build-options,.project-operations{display:flex;gap:5px;align-items:center;flex-wrap:nowrap}.project-build-options label{display:inline-flex;gap:3px;align-items:center;white-space:nowrap}.project-action-button{display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center;flex:none;padding:0;border:1px solid transparent;border-radius:3px;color:var(--vscode-foreground);background:transparent}.project-action-button svg{display:block;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.project-action-button:hover{border-color:var(--vscode-panel-border);background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}@media(max-width:640px){.command-header{margin:-12px -12px 6px;padding:6px 8px}.view-heading span{display:none}.header-actions{gap:4px}}";
  document.head.append(style);
  const projectTableStyle = document.createElement("style");
  projectTableStyle.textContent = "#projectRows{display:block;width:100%;max-width:100%;min-width:0;overflow-x:auto;contain:inline-size}.project-table{width:100%;min-width:1200px;border-spacing:0;border-collapse:separate;table-layout:fixed}.project-table th,.project-table td{height:43px;box-sizing:border-box;padding:5px;text-align:left;vertical-align:middle;border-bottom:1px solid var(--vscode-panel-border);background:var(--vscode-editor-background)}.project-table th{font-weight:600}.project-table input{min-width:0;width:100%;box-sizing:border-box}.project-table .project-col-enabled{width:42px}.project-table .project-col-branch{width:90px}.project-table .project-col-repository{width:220px}.project-table .project-col-commit{width:100px}.project-table .project-col-status{width:76px}.project-table .project-col-build{width:290px}.project-table .project-col-actions{width:92px}.project-table th:last-child,.project-table td:last-child{position:sticky;right:0;z-index:2;background:var(--vscode-editor-background);box-shadow:-8px 0 8px -8px var(--vscode-widget-shadow)}.project-table th:last-child{z-index:3}";
  document.head.append(projectTableStyle);
  const treeStyle = document.createElement("style");
  treeStyle.textContent = ".task-tree>summary{position:relative;padding-left:18px;cursor:pointer;list-style:none}.task-tree>summary::-webkit-details-marker{display:none}.task-tree>summary::before{content:'›';position:absolute;left:3px;top:50%;font-size:19px;line-height:1;transform:translateY(-50%);transform-origin:center;transition:transform .1s ease}.task-tree[open]>summary::before{transform:translateY(-50%) rotate(90deg)}";
  document.head.append(treeStyle);
  const optionStyle = document.createElement("style"); optionStyle.textContent = ".parallel-option{display:grid;grid-template-columns:22px auto 1fr;align-items:center;gap:7px;margin:7px 0;padding:8px 10px;border:1px solid var(--vscode-focusBorder);background:var(--vscode-editor-inactiveSelectionBackground)}.parallel-option strong{font-size:13px}.parallel-option small{color:var(--vscode-descriptionForeground)}"; document.head.append(optionStyle);
  const scriptStyle = document.createElement("style");
  scriptStyle.textContent = ".script-window{position:fixed;z-index:20;left:80px;top:70px;width:min(560px,calc(100vw - 32px));box-sizing:border-box;border:1px solid var(--vscode-focusBorder);box-shadow:0 8px 28px rgba(0,0,0,.35);background:var(--vscode-editor-background)}.script-window[hidden],.script-options[hidden]{display:none!important}.script-window-header{display:flex;align-items:center;justify-content:space-between;padding:7px 9px;cursor:move;background:var(--vscode-sideBarSectionHeader-background);font-weight:600}.script-window-body{display:grid;gap:12px;padding:12px}.script-output{display:grid;gap:5px}.script-output-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.script-output-row input{min-width:0;width:100%;box-sizing:border-box}.script-window-note{color:var(--vscode-descriptionForeground)}.script-options{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.script-options label{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.script-options input[type=checkbox]{width:16px;height:16px;margin:0;flex:none}.script-tabs{display:flex;border-bottom:1px solid var(--vscode-panel-border)}.script-tab{border:0;border-bottom:2px solid transparent;background:transparent}.script-tab[aria-selected=true]{border-bottom-color:var(--vscode-focusBorder);color:var(--vscode-foreground);font-weight:600}";
  document.head.append(scriptStyle);
  const title = document.querySelector("body > h2");
  const toolbar = document.querySelector("body > .toolbar");
  if (title && toolbar) {
    const header = document.createElement("header");
    header.className = "command-header";
    header.innerHTML = '<div class="view-heading"><strong>编译工具</strong><span>Windows PowerShell 5.1 · CAA/MSVC</span></div>';
    const actions = document.createElement("div");
    actions.className = "header-actions";
    const scriptManager = document.createElement("button"); scriptManager.id = "scriptManager"; scriptManager.textContent = "脚本"; actions.append(scriptManager);
    for (const id of ["open", "save", "saveAs"]) {
      const button = document.getElementById(id);
      if (button) actions.append(button);
    }
    document.getElementById("save")?.classList.add("primary");
    header.append(actions);
    document.body.insertBefore(header, title);
    title.remove();
    toolbar.classList.add("config-toolbar");
  }
  const output = document.getElementById("output");
  output?.remove();
  const status = document.getElementById("status");
  const executionBlock = status?.closest(".auto-build-block"); if (executionBlock) executionBlock.querySelector(":scope > summary")!.textContent = "执行";
  const rootInput = document.getElementById("root") as HTMLInputElement | null;
  const rootRow = rootInput?.closest(".repo");
  if (rootInput && rootRow) {
    rootRow.querySelector("strong")!.textContent = "当前 ROOT_DIR";
    rootInput.readOnly = true; rootInput.title = "从当前工程环境探测，只读"; rootInput.style.opacity = "0.82";
    const workingRow = document.createElement("div");
    workingRow.className = "repo";
    workingRow.innerHTML = '<strong>工作目录</strong><input id="workingDirectory" title="从 Primary 当前目录带入，可编辑"><span></span>';
    rootRow.parentElement?.insertBefore(workingRow, rootRow.nextSibling);
    const rootUpdates = document.createElement("div"); rootUpdates.className = "actions"; rootUpdates.innerHTML = '<label class="clean"><input id="updateRoot" type="checkbox">更新 ROOT_DIR</label><label class="clean"><input id="updateThirdParty" type="checkbox">更新 ROOT_DIR_3rdParty</label>'; rootRow.parentElement?.append(rootUpdates);
    const scriptRow = document.createElement("div"); scriptRow.className = "repo"; scriptRow.innerHTML = '<strong>Root 编排脚本</strong><span id="rootScriptStatus">正在检查…</span><button id="syncRootScript">同步脚本</button>'; rootRow.parentElement?.append(scriptRow);
    document.getElementById("syncRootScript")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "syncRootScript" }));
  }
  const buildBlock = document.getElementById("cmake")?.closest(".auto-build-block");
  const updateParallelBuildDisplay = (checked: boolean) => { const input = document.getElementById("parallelBuild") as HTMLInputElement | null, hint = document.getElementById("parallelBuildHint"); if (input) input.checked = checked; if (hint) hint.textContent = checked ? "已勾选：CMake + CAA 同时启动" : "未勾选：顺序执行 CMake → CAA"; };
  let projectRows: HTMLDivElement | undefined;
  if (buildBlock) {
    buildBlock.querySelector(":scope > summary")!.textContent = "项目表";
    buildBlock.querySelectorAll("label.build").forEach((item) => { (item as HTMLElement).style.display = "none"; });
    const mode = document.createElement("label");
    mode.className = "parallel-option";
    mode.innerHTML = '<input id="parallelBuild" type="checkbox"><strong>并行编译</strong><small id="parallelBuildHint">未勾选：顺序执行 CMake → CAA</small>';
    mode.querySelector("input")?.addEventListener("change", (event) => updateParallelBuildDisplay((event.currentTarget as HTMLInputElement).checked));
    buildBlock.prepend(mode);
    const tools = document.createElement("div"); tools.className = "actions"; tools.innerHTML = '<button id="pickProjects">选择目录…</button><button id="discoverProjects">探测当前目录</button><button id="removeDisabledProjects">移除未启用项</button>';
    projectRows = document.createElement("div"); projectRows.id = "projectRows";
    buildBlock.append(tools, projectRows);
  }
  const renderProjects = () => {
    if (!projectRows) return;
    const table = document.createElement("table"); table.className = "project-table";
    const columns = document.createElement("colgroup"); columns.innerHTML = '<col class="project-col-enabled"><col class="project-col-branch"><col class="project-col-repository"><col class="project-col-commit"><col class="project-col-origin"><col class="project-col-status"><col class="project-col-build"><col class="project-col-actions">';
    const head = document.createElement("thead"); const header = document.createElement("tr");
    for (const label of ["启用", "分支", "仓库", "Commit", "Origin", "状态", "构建", "操作"]) { const cell = document.createElement("th"); cell.textContent = label; header.append(cell); }
    head.append(header); const tableBody = document.createElement("tbody");
    const body = projects.map((project) => {
      const row = document.createElement("tr");
      const cell = (content: Node) => { const value = document.createElement("td"); value.append(content); return value; };
      const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = project.enabled; enabled.onchange = () => { project.enabled = enabled.checked; };
      const path = document.createElement("input"); path.value = project.path; path.title = project.path; path.setAttribute("aria-label", `仓库：${project.name}`); path.onchange = () => { project.path = path.value.trim(); };
      const branch = document.createElement("input"); branch.value = project.branch; branch.onchange = () => { project.branch = branch.value.trim(); };
      const commit = document.createElement("span"); commit.className = "project-version"; commit.textContent = project.probe?.commit?.slice(0, 12) || "—"; commit.title = project.probe?.commit || "";
      const origin = document.createElement("span"); origin.className = "project-version"; origin.textContent = project.probe?.origin || "—"; origin.title = project.probe?.origin || "";
      const state = document.createElement("span"); const states: Record<string, string> = { clean: "干净", modified: "有修改", invalid: "无效", "not-git": "非 Git", "script-mismatch": "脚本不一致", unknown: "未探测" }; state.textContent = states[project.probe?.status || "unknown"] || project.probe?.status || "未探测"; state.title = project.probe?.message || state.textContent;
      const buildOptions = document.createElement("span"); buildOptions.className = "project-build-options";
      for (const [key, label] of [["update", "更新"], ["cmake", "CMake"], ["caa", "CAA"], ["linkCaa", "linkCAA"]] as const) { const option = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox"; input.checked = project.operations[key]; input.onchange = () => { project.operations[key] = input.checked; }; option.append(input, label); buildOptions.append(option); }
      const operations = document.createElement("span"); operations.className = "project-operations";
      const actionIcons = { probeProject: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4"></circle><path d="m10 10 3 3"></path></svg>', runProject: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5 12 8l-7 4.5z"></path></svg>', removeProject: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"></path></svg>' } as const;
      for (const [label, action] of [["探测", "probeProject"], ["运行", "runProject"], ["移除", "removeProject"]] as const) { const button = document.createElement("button"); button.className = "project-action-button"; button.dataset.rowAction = action; button.innerHTML = actionIcons[action]; button.title = label; button.setAttribute("aria-label", `${label} ${project.name}`); button.onclick = () => { if (action === "removeProject") { projects = projects.filter((item) => item.id !== project.id); renderProjects(); } else autoBuildVsCode.postMessage({ type: action, projectId: project.id, configuration: readConfiguration() }); }; operations.append(button); }
      row.append(cell(enabled), cell(branch), cell(path), cell(commit), cell(origin), cell(state), cell(buildOptions), cell(operations)); return row;
    });
    tableBody.append(...body); table.append(columns, head, tableBody); projectRows.replaceChildren(table);
  };
  const readConfiguration = () => ({
    schemaVersion: 2,
    rootDirectory: (document.getElementById("root") as HTMLInputElement).value.trim(),
    thirdPartyDirectory: (document.getElementById("third") as HTMLInputElement).value.trim(),
    updateRoot: (document.getElementById("updateRoot") as HTMLInputElement).checked,
    updateThirdParty: (document.getElementById("updateThirdParty") as HTMLInputElement).checked,
    workingDirectory: (document.getElementById("workingDirectory") as HTMLInputElement).value.trim(),
    rootBranch: (document.getElementById("rootBranch") as HTMLInputElement).value.trim(),
    branch: (document.getElementById("branch") as HTMLInputElement).value.trim(),
    cmakeBranch: (document.getElementById("cmakeBranch") as HTMLInputElement).value.trim(),
    projects,
    buildExecutionMode: (document.getElementById("parallelBuild") as HTMLInputElement).checked ? "parallel" : "sequential",
    clean: (document.getElementById("clean") as HTMLInputElement).checked,
    repositorySnapshot,
  });
  document.getElementById("pickProjects")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "pickProjectDirectories", configuration: readConfiguration() }));
  document.getElementById("discoverProjects")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "discoverProjectDirectories", configuration: readConfiguration() }));
  document.getElementById("removeDisabledProjects")?.addEventListener("click", () => { projects = projects.filter((project) => project.enabled); renderProjects(); });
  for (const type of ["preflight", "start", "save", "saveAs"] as const) document.getElementById(type)?.addEventListener("click", (event) => {
    event.stopImmediatePropagation();
    if (type === "preflight" || type === "start") {
      const statusElement = document.getElementById("status")!;
      statusElement.textContent = type === "start" ? "正在启动…" : "正在预检…";
      (document.getElementById("preflight") as HTMLButtonElement).disabled = true;
      (document.getElementById("start") as HTMLButtonElement).disabled = true;
      (document.getElementById("stop") as HTMLButtonElement).disabled = false;
    }
    autoBuildVsCode.postMessage({ type, configuration: readConfiguration() });
  }, { capture: true });
  const taskBlock = createBlock("任务列表"), block = taskBlock.details;
  const rows = document.createElement("div");
  rows.textContent = "尚未生成任务。";
  taskBlock.body.append(rows);
  executionBlock?.parentElement?.insertBefore(block, executionBlock);
  const createdProbeBlock = createBlock("库探测结果"), probeBlock = createdProbeBlock.details;
  const probeRows = document.createElement("div");
  probeRows.textContent = "点击“预检配置”后显示 Git 分支和版本。";
  createdProbeBlock.body.append(probeRows);
  block.parentElement?.insertBefore(probeBlock, block);
  const createdCleanupBlock = createBlock("手动清理 Root"), cleanupBlock = createdCleanupBlock.details;
  const cleanupRow = document.createElement("div"); cleanupRow.className = "repo"; cleanupRow.innerHTML = '<strong>文件名前缀</strong><input id="rootCleanupPrefix" placeholder="例如 CAA、Core，不区分大小写"><button id="cleanRootArtifacts">删除头文件 / DLL / LIB</button>';
  const cleanupNote = document.createElement("div"); cleanupNote.className = "status"; cleanupNote.textContent = "仅在点击后清理当前探测到的 ROOT_DIR；递归跳过 .git，不自动运行。";
  createdCleanupBlock.body.append(cleanupRow, cleanupNote); probeBlock.parentElement?.insertBefore(cleanupBlock, probeBlock);
  document.getElementById("cleanRootArtifacts")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "cleanRootArtifacts", prefix: (document.getElementById("rootCleanupPrefix") as HTMLInputElement).value }));
  const scriptWindow = document.createElement("section"); scriptWindow.className = "script-window"; scriptWindow.hidden = true;
  scriptWindow.innerHTML = '<header class="script-window-header"><span>脚本</span><button id="closeScriptWindow" title="关闭">×</button></header><div class="script-tabs" role="tablist"><button class="script-tab" id="buildScriptTab" role="tab" aria-selected="true">构建脚本</button><button class="script-tab" id="checkoutScriptTab" role="tab" aria-selected="false">仓库检出</button><button class="script-tab" id="manifestScriptTab" role="tab" aria-selected="false">版本归档</button></div><div class="script-window-body"><label class="script-output" id="scriptOutputDirectory">输出目录<span class="script-output-row"><input id="scriptTargetDirectory" type="text"><button id="pickScriptTargetDirectory">选择…</button></span></label><div id="checkoutScriptOptions" class="script-options" hidden><label><input id="checkoutIncludeRoots" type="checkbox">包含 Root、3rdParty</label><label><input id="checkoutIncludeBranch" type="checkbox" checked>指定当前分支</label><label><input id="checkoutIncludeCommit" type="checkbox">固定 Commit</label></div><div id="manifestScriptOptions" class="script-options" hidden><label><input name="manifestTarget" value="working" type="radio" checked>当前工作目录</label><label><input name="manifestTarget" value="root" type="radio">ROOT_DIR</label><label><input name="manifestMode" value="overwrite" type="radio" checked>覆盖保存</label><label><input name="manifestMode" value="merge" type="radio">追加记录</label></div><div id="scriptKindNote" class="script-window-note"></div><div class="actions"><button id="confirmWriteScript">写入</button><button id="cancelWriteScript">取消</button></div></div>';
  document.body.append(scriptWindow);
  const scriptTarget = document.getElementById("scriptTargetDirectory") as HTMLInputElement, scriptNote = document.getElementById("scriptKindNote")!, buildTab = document.getElementById("buildScriptTab")!, checkoutTab = document.getElementById("checkoutScriptTab")!, manifestTab = document.getElementById("manifestScriptTab")!;
  let selectedScriptKind: "build" | "checkout" | "manifest" = "build";
  const selectScriptTab = (kind: "build" | "checkout" | "manifest") => { selectedScriptKind = kind; buildTab.setAttribute("aria-selected", String(kind === "build")); checkoutTab.setAttribute("aria-selected", String(kind === "checkout")); manifestTab.setAttribute("aria-selected", String(kind === "manifest")); (document.getElementById("checkoutScriptOptions") as HTMLElement).hidden = kind !== "checkout"; (document.getElementById("manifestScriptOptions") as HTMLElement).hidden = kind !== "manifest"; (document.getElementById("scriptOutputDirectory") as HTMLElement).hidden = kind === "manifest"; scriptNote.textContent = kind === "checkout" ? "默认仅克隆项目表仓库；各仓库独立执行，最后统计结果。Root、3rdParty 需单独勾选。" : kind === "manifest" ? "输出一个 BUILD_MANIFEST.json；记录 Root、3rdParty 和本次勾选编译的项目，并按 Git 地址稳定排序。" : "按当前界面配置输出 Invoke-AutoBuild.local.ps1，可脱离 UI 运行。"; };
  const openScriptWindow = () => { scriptTarget.value = (document.getElementById("workingDirectory") as HTMLInputElement).value.trim(); selectScriptTab(selectedScriptKind); scriptWindow.hidden = false; scriptWindow.style.left = `${Math.max(16, (window.innerWidth - scriptWindow.offsetWidth) / 2)}px`; scriptWindow.style.top = "70px"; scriptTarget.focus(); };
  buildTab.addEventListener("click", () => selectScriptTab("build"));
  checkoutTab.addEventListener("click", () => selectScriptTab("checkout"));
  manifestTab.addEventListener("click", () => selectScriptTab("manifest"));
  document.getElementById("scriptManager")?.addEventListener("click", openScriptWindow);
  for (const id of ["closeScriptWindow", "cancelWriteScript"]) document.getElementById(id)?.addEventListener("click", () => { scriptWindow.hidden = true; });
  document.getElementById("confirmWriteScript")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "writeScript", scriptKind: selectedScriptKind, targetDirectory: scriptTarget.value, manifestMode: (document.querySelector('input[name="manifestMode"]:checked') as HTMLInputElement)?.value || "overwrite", manifestTarget: (document.querySelector('input[name="manifestTarget"]:checked') as HTMLInputElement)?.value || "working", checkoutOptions: { includeRoots: (document.getElementById("checkoutIncludeRoots") as HTMLInputElement).checked, includeBranch: (document.getElementById("checkoutIncludeBranch") as HTMLInputElement).checked, includeCommit: (document.getElementById("checkoutIncludeCommit") as HTMLInputElement).checked }, configuration: readConfiguration() }));
  document.getElementById("pickScriptTargetDirectory")?.addEventListener("click", () => autoBuildVsCode.postMessage({ type: "pickScriptTargetDirectory", targetDirectory: scriptTarget.value }));
  const scriptHeader = scriptWindow.querySelector<HTMLElement>(".script-window-header")!; let drag: { x: number; y: number; left: number; top: number } | undefined;
  scriptHeader.addEventListener("pointerdown", (event) => { if ((event.target as HTMLElement).closest("button")) return; const bounds = scriptWindow.getBoundingClientRect(); drag = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top }; scriptHeader.setPointerCapture(event.pointerId); });
  scriptHeader.addEventListener("pointermove", (event) => { if (!drag) return; scriptWindow.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, drag.left + event.clientX - drag.x))}px`; scriptWindow.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, drag.top + event.clientY - drag.y))}px`; });
  scriptHeader.addEventListener("pointerup", () => { drag = undefined; });
  const renderProbe = () => {
    if (!repositorySnapshot) { probeRows.textContent = "点击“预检配置”后显示 Git 分支和版本。"; return; }
    const head = document.createElement("div"); head.style.cssText = "display:grid;grid-template-columns:90px minmax(180px,2fr) 70px 110px 110px minmax(160px,2fr);gap:8px;padding:5px;color:var(--vscode-descriptionForeground);border-bottom:1px solid var(--vscode-panel-border)";
    for (const text of ["类型", "目录", "状态", "分支", "Commit", "Origin"]) { const cell = document.createElement("strong"); cell.textContent = text; head.append(cell); }
    const rows = repositorySnapshot.repositories.map((item) => { const row = document.createElement("div"); row.style.cssText = head.style.cssText; for (const value of [item.role, item.path, item.error ? "错误" : item.hasChanges ? "有修改" : "干净", item.error || item.branch, item.commit ? item.commit.slice(0, 12) : "—", item.origin || "—"]) { const cell = document.createElement("span"); cell.textContent = value; cell.title = value; cell.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap"; row.append(cell); } return row; });
    const captured = document.createElement("div"); captured.style.cssText = "padding:5px;color:var(--vscode-descriptionForeground)"; captured.textContent = `探测时间：${repositorySnapshot.capturedAt}`;
    probeRows.replaceChildren(captured, head, ...rows);
  };
  window.addEventListener("message", (event: MessageEvent) => {
    if (event.data?.type === "configuration") {
      const platformHint = document.querySelector<HTMLElement>(".view-heading span");
      const statusHint = document.getElementById("status");
      if (event.data.platform && event.data.platform !== "win32") {
        const platformName = event.data.platform === "darwin" ? "macOS" : event.data.platform;
        if (platformHint) { platformHint.textContent = `${platformName} 检查模式 · 目标 Windows PowerShell 5.1 / CAA-MSVC`; platformHint.title = "可编辑、探测、预检和生成 PS1；CAA 实际编译仅支持 Windows。"; }
        if (statusHint?.textContent === "空闲") statusHint.textContent = `${platformName} 检查模式：可编辑、探测、预检和生成脚本；运行仍会尝试现有链路，仅作盲开发检查，不能替代 Windows 实际构建。`;
      }
      const rootInput = document.getElementById("root") as HTMLInputElement | null;
      if (rootInput) rootInput.value = event.data.detectedRootDirectory || "";
      const configuration = event.data.configuration || {};
      repositorySnapshot = configuration.repositorySnapshot;
      (document.getElementById("workingDirectory") as HTMLInputElement).value = configuration.workingDirectory || "";
      (document.getElementById("updateRoot") as HTMLInputElement).checked = !!configuration.updateRoot;
      (document.getElementById("updateThirdParty") as HTMLInputElement).checked = !!configuration.updateThirdParty;
      projects = configuration.projects || []; renderProjects();
      updateParallelBuildDisplay(configuration.buildExecutionMode === "parallel");
      renderProbe();
    }
    if (event.data?.type === "projects") { projects = event.data.projects || []; renderProjects(); }
    if (event.data?.type === "scriptStatus") { const label = document.getElementById("rootScriptStatus"), button = document.getElementById("syncRootScript") as HTMLButtonElement | null; if (label) { const names: Record<string, string> = { same: "脚本一致", different: "脚本不一致", missing: "Root 中缺少脚本", unavailable: "未探测到 Root", foreign: "Windows Root（当前系统不可同步）" }; label.textContent = names[event.data.status] || event.data.status; label.title = `${event.data.source || ""}\n${event.data.target || ""}`; } if (button) button.disabled = event.data.status === "same" || event.data.status === "unavailable" || event.data.status === "foreign"; }
    if (event.data?.type === "repositorySnapshot") { repositorySnapshot = event.data.snapshot; renderProbe(); }
    if (event.data?.type === "workingDirectory") (document.getElementById("workingDirectory") as HTMLInputElement).value = event.data.value || "";
    if (event.data?.type === "scriptWritten") scriptWindow.hidden = true;
    if (event.data?.type === "scriptTargetDirectory") scriptTarget.value = event.data.value || "";
    if (event.data?.type !== "tasks") return;
    const scrollX = window.scrollX, scrollY = window.scrollY;
    const expandedTasks = new Map(Array.from(rows.querySelectorAll<HTMLDetailsElement>("details[data-task-id]")).map((item) => [item.dataset.taskId || "", item.open]));
    const focusedTaskId = (document.activeElement as HTMLElement | null)?.dataset.taskId;
    rows.replaceChildren(...event.data.tasks.map((task: { id: string; name: string; commandSummary: string; status: string; children?: Array<{ name: string; commandSummary: string; detail?: string; status: string }> }, taskIndex: number) => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:minmax(160px,1fr) minmax(180px,2fr) 72px 58px;gap:8px;padding:5px;border-bottom:1px solid var(--vscode-panel-border)";
      const name = document.createElement("span"), command = document.createElement("code"), state = document.createElement("span"), run = document.createElement("button");
      const statusText: Record<string, string> = { waiting: "等待", in_progress: "进行中", done: "完成", error: "失败" };
      name.textContent = `${taskIndex + 1}. ${task.name}`; command.textContent = task.commandSummary; command.title = task.commandSummary; state.textContent = statusText[task.status] || task.status;
      run.textContent = "运行"; run.title = `单独运行：${task.name}`; run.disabled = task.status === "in_progress";
      run.dataset.taskId = task.id;
      run.onclick = (event) => { event.preventDefault(); event.stopPropagation(); autoBuildVsCode.postMessage({ type: "runTask", taskId: task.id, configuration: readConfiguration() }); };
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
});
