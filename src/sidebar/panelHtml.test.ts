import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPanelHtml, ktcGitPanelModel, ktcSearchReplaceButtonState } from "./panelHtml.js";
import { ktcNextReorderSelection } from "./reorderMembersPanelState.js";

describe("sidebar panel HTML", () => {
  it("Git 状态尚未到达时也渲染空状态按钮，并只请求一次刷新", () => {
    expect(ktcGitPanelModel(undefined, true)).toMatchObject({
      projects: [],
      statusText: "当前工作区未发现 Git 仓库。",
      workspaceFolderCount: 1,
      workspaceRepositoryCount: 0,
      discovery: { status: "idle" },
    });

    const source = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    expect(source).toContain("els.gitPanel.model = gitPanelModel(ts, workspaceAvailable)");
    expect(source).toContain("let gitRefreshRequested = false");
    expect(source).toContain("else if (!running && !gitRefreshRequested)");
    expect(source).toContain('action: "refresh"');
    expect(source).toContain("if (git) renderGit(ts, running)");
  });

  it("与 Desk Tools 共用自动代码名称和 Operation 图标语义", () => {
    const source = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    const icon = readFileSync(new URL("../../media/tools/codegen.svg", import.meta.url), "utf8");

    expect(source).toContain('codegen: "自动代码"');
    expect(source).not.toContain('codegen: "生成"');
    expect(icon).toContain('viewBox="0 0 1024 1024"');
    expect(icon).toContain("M389.44 768a96.064 96.064");
    expect(icon).not.toContain("M4 3h16");
  });

  it("使用统一关联规则对话框而不是多套 Quick Pick 消息", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getPanelHtml>[1];
    const html = getPanelHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);

    expect(html).toContain('<ktc-associated-rule-picker id="rule-picker"></ktc-associated-rule-picker>');
    expect(html).toContain("test-webview:/extension/dist/associated-rule-picker.js");
    expect(html).toContain('"ktc-associated-rule-picker-action"');
    expect(html).toContain("els.rulePicker.openPicker(picker)");
    expect(html).not.toContain('id="rule-picker-list"');
    expect(html).toContain('type: "requestAssociatedRuleCandidates"');
    expect(html).toContain('type: "appendAssociatedRules"');
    expect(html).toContain('id="btn-pick-working-directory"');
    expect(html).not.toContain('>将结果文件加入工作集</button>');
    expect(html).not.toContain('把本次命中的文件作为精确规则加入已有工作集');
    expect(html).toContain('id="replace-profile-name"');
    expect(html).toContain('label,');
    expect(html).not.toContain('id="workspace-file-scope-select"');
    expect(html).not.toContain('type: "selectWorkspaceFileScope"');
    expect(html).not.toContain('type: "openWorkspaceWorksets"');
    expect(html).toContain("const toolScrollPositions = new Map();");
    expect(html).toContain("toolScrollPositions.set(state.activeToolId, els.primaryBody.scrollTop)");
    expect(html).toContain("requestAnimationFrame(() => { els.primaryBody.scrollTop = top; })");
    expect(html).toContain("const activeToolChanged = switchActiveTool(msg.activeToolId)");
    expect(html).not.toContain('state.replace.scope = ""');
    expect(html).toContain('<select id="replace-scope"');
    expect(html.indexOf('id="replace-scope"')).toBeLessThan(html.indexOf('id="replace-search"'));
    expect(html).toContain('type: "pickWorkingDirectory"');
    expect(html).toContain('type: "selectWorkingDirectory"');
    expect(html).toContain('type: "setPluginIgnoreEnabled"');
    expect(html).toContain('id="working-context"');
    expect(html).toContain('class="working-context-label">目录</span>');
    expect(html).toContain('class="working-context-context-icon" viewBox="0 0 24 24" aria-hidden="true"');
    expect(html).toContain('id="btn-open-settings"');
    expect(html).toContain('toolId: "environmentSettings"');
    expect(html).toContain('id="plugin-ignore-enabled"');
    expect(html).toContain('<summary><svg class="ignore-manager-chevron"');
    expect(html).toContain('<span>Ignore 管理</span></summary>');
    expect(html).toContain('class="settings-section-chevron"');
    expect(html).toContain('.settings-section[open] .settings-section-chevron { transform: rotate(0deg); }');
    expect(html).toContain('<span>工程环境</span></summary>');
    expect(html).toContain('id="plugin-settings-tree" open');
    expect(html).toContain('<span>插件设置</span><span class="settings-section-count">5 项</span>');
    expect(html).toContain('role="tree" aria-label="插件设置功能"');
    expect(html).toContain('id="plugin-setting-values" aria-label="CAA 插件设置当前值"');
    expect(html).toContain('item.label + " · " + item.value + " · " + item.source');
    expect(html).toContain('role="treeitem" title="打开 KT Auto Code 的 VS Code 设置"');
    expect(html.indexOf('class="ignore-manager-status"')).toBeGreaterThan(html.indexOf('id="ignore-manager"'));
    expect(html.indexOf('id="plugin-ignore-enabled"')).toBeGreaterThan(html.indexOf('class="ignore-manager-status"'));
    expect(html.indexOf('id="ignore-manager"')).toBeGreaterThan(html.indexOf('id="environment-block"'));
    expect(html).toContain('.ignore-manager[open] .ignore-manager-chevron { transform: rotate(0deg); }');
    expect(html).not.toContain('id="replace-ignored"');
    expect(html).toContain('"最近 · " + directory');
    expect(html).toContain('"外部 · " + directory');
    expect(html).not.toContain('type: "chooseCaaRules"');
    expect(html).not.toContain('type: "chooseAssociatedRule"');
    expect(html).toContain('body.detail-block #tabs');
    expect(html).toContain('id="module-block"');
    expect(html).toContain('id="welcome-panel"');
    expect(html).toContain('id="welcome-products"');
    expect(html).toContain('class="welcome-brand-name">PHOENIX</h2>');
    expect(html).toContain('data-welcome-action="openRepository">Gitee 主页</button>');
    expect(html).toContain('data-welcome-action="openInstallGuide">安装说明</button>');
    expect(html).toContain('data-welcome-action="openQuickStart">快速开始</button>');
    expect(html).toContain('data-welcome-action="openSettings">插件设置</button>');
    expect(html).toContain('data-welcome-action="openDiagnostics">运行诊断</button>');
    expect(html).toContain('const label = repository.groupLabel || "当前工作区"');
    expect(html).toContain('group = document.createElement("optgroup")');
    expect(html).toContain("group.appendChild(option)");
    expect(html).toContain('body.welcome-mode #primary-body > :not(#welcome-panel)');
    expect(html).toContain('state.presentation === "detailBlock" && (state.openToolIds || []).length === 0');
    expect(html).toContain('if (welcomeMode) {\n        els.title.textContent = "插件概览";');
    expect(html).toContain('state.extensionInstallations = msg.extensionInstallations || []');
    expect(html).toContain('extension.moduleId === "cad" ? "CAD" : "CODE"');
    expect(html).toContain('grid-template-columns: 46px minmax(0, 1fr) auto');
    expect(html).toContain('width: 46px; height: 28px');
    expect(html).toContain('type: "welcomeAction"');
    expect(html).toContain('action: "installExtension"');
    expect(html).toContain('type: "moduleBlockAction"');
    expect(html).toContain('msg.type === "moduleBlock"');
    expect(html).toContain('body.external-module-block');
    expect(html).not.toContain('id="module-filters"');
    expect(html).not.toContain('id="module-code"');
    expect(html).not.toContain('id="module-cad"');
    expect(html).toContain('msg.type === "modules"');
    expect(html).toContain('(item.moduleId || "code") === moduleId');
    expect(html).toContain('type: "runModuleTool"');
    expect(html).toContain('t.shortTitle || shortTitles[t.id] || t.title');
    expect(html).toContain('<ktc-reorder-members-panel id="reorder-members-panel"></ktc-reorder-members-panel>');
    expect(html).toContain('id="btn-code-assistant-reorder-members"');
    expect(html).toContain('id="code-assistant-reorder-actions"');
    expect(html).toContain('id="code-assistant-reorder-results"');
    expect(html).toContain("test-webview:/extension/dist/reorder-members-panel.js");
    expect(html).toContain('els.reorderMembersPanel.model = {');
    expect(html).toContain('"pnw-code-reorder-members-action"');
    expect(html).toContain('type: "reorderAction"');
    expect(html).toContain('type: "reorderSelection"');
    expect(html).toContain('type: "run", toolId: "reorderMembers", action: detail.action');
    expect(html).not.toContain('id="btn-reorder-apply"');
    expect(html).not.toContain("function createReorderGroup");
    expect(html).not.toContain("function renderReorderResults");
    expect(html).toContain('className = "tab" + (isOpen ? " open" : "") + (isActive ? " active" : "")');
    expect(html).toContain('已打开，当前隐藏');
    expect(html).toContain('.tab.open:not(.active)');
    expect(html).toContain('msg.type === "openTools"');
    expect(html).not.toContain('body.detail-block #results');
    expect(html).toContain('renderEncodingResults(ts, !!state.showEncDetails)');
    expect(html).toContain('id="encoding-default-target"');
    expect(html).toContain('id="btn-encoding-settings"');
    expect(html).toContain('id="target-overrides"');
    expect(html).toContain('type: "setEncodingDefaultTarget"');
    expect(html).toContain('type: "openEncodingSettings"');
    expect(html).toContain('"项目覆盖：" + overrides.join(" · ")');
    expect(html).toContain('"所有文件均符合当前项目编码目标。"');
    expect(html).toContain('renderHeaderResults(ts, !!state.showDetails)');
    expect(html).toContain('<ktc-rename-results-panel id="rename-results-panel" hidden>');
    expect(html).toContain("test-webview:/extension/dist/rename-results-panel.js");
    expect(html).toContain('syncRenameResultsPanel(ts)');
    expect(html).toContain('"pnw-code-rename-results-action"');
    expect(html).not.toContain('renderCodeRenameResults(ts)');
    expect(html).toContain('renderIgnoreResults(ts)');
    expect(html).toContain('<ktc-uuid-results-panel id="uuid-results-panel" hidden>');
    expect(html).toContain("test-webview:/extension/dist/uuid-results-panel.js");
    expect(html).toContain('syncUuidResultsPanel(ts)');
    expect(html).toContain('"pnw-code-uuid-results-action"');
    expect(html).not.toContain('renderUuidResults(ts)');
    expect(html).toContain('renderCaaResults(ts)');
    expect(html).toContain('renderEnvironment(ts)');
    expect(html).toContain('id="environment-block"');
    expect(html).toContain('className = "environment-row-body"');
    expect(html).toContain('className = "environment-icon-button environment-save-button"');
    expect(html).toContain('actions.prepend(clear)');
    expect(html).toContain('actions.append(save)');
    expect(html).toContain('M6.35 12.2 2.6 8.45');
    expect(html).toContain('action: "pick", key: item.key, value: value.value');
    expect(html).toContain('.environment-save-button, .environment-row:hover .environment-icon-button');
    expect(html).toContain('<ktc-codegen-primary-panel id="codegen-panel" hidden>');
    expect(html).toContain('document.body.classList.toggle("codegen-tool", codegen)');
    expect(html).toContain('body.codegen-tool .wrap { padding-inline: 0; }');
    expect(html).toContain('body.codegen-tool .meta { margin: 4px 5px 5px; }');
    expect(html).toContain("test-webview:/extension/dist/codegen-primary-panel.js");
    expect(html).toContain('els.codegenPanel.model = model');
    expect(html).toContain('els.codegenPanel.hidden = !codegen');
    expect(html).toContain('"kt-codegen-primary-action"');
    expect(html).toContain('message.uri = detail.id');
    expect(html).toContain('message.reportId = detail.id');
    expect(html).toContain('type, toolId: "codegen", uri');
    expect(html).toContain('postCodegenControl("codegenControlSelection"');
    expect(html).not.toContain('postCodegenControl("codegenControlDisplay"');
    expect(html).toContain('postCodegenControl("codegenControlOutput"');
    expect(html).not.toContain('id="codegen-list"');
    expect(html).not.toContain('id="codegen-prefix"');
    expect(html).not.toContain("for (const entry of documents)");
    expect(html).not.toContain('className = "codegen-row"');
    expect(html).toContain('<ktc-run-primary-panel id="run-panel" hidden>');
    expect(html).toContain("test-webview:/extension/dist/ktc-run-primary-panel.js");
    expect(html).toContain('const model = ts.run');
    expect(html).toContain('els.runPanel.model = model ? Object.assign({}, model, { running: !!running }) : undefined');
    expect(html).toContain('els.runPanel.hidden = !run');
    expect(html).toContain('"ktc-run-primary-action"');
    expect(html).toContain('type: "runAction", toolId: "run"');
    expect(html).toContain('<ktc-git-primary-panel id="git-panel" hidden>');
    expect(html).toContain("test-webview:/extension/dist/ktc-git-primary-panel.js");
    expect(html).toContain('els.gitPanel.model = gitPanelModel(ts, workspaceAvailable)');
    expect(html).toContain('els.gitPanel.hidden = !git');
    expect(html).toContain('"ktc-git-primary-action"');
    expect(html).toContain('type: "gitAction", toolId: "git"');
    expect(html).toContain('id="git-repository-select"');
    expect(html).toContain('id="git-repository-add"');
    expect(html).toContain('id="git-repository-refresh"');
    expect(html).toContain('id="git-repository-remove"');
    expect(html).toContain('els.workspaceMeta.hidden = !git');
    expect(html).toContain('els.workspaceContextLabel.textContent = "仓库："');
    expect(html).toContain('els.workspace.hidden = true');
    expect(html).toContain('const gitRepositoryOptionLabels =');
    expect(html).toContain('const labelsByRepositoryId = new Map(projects.map((project, index) => [');
    expect(html).toContain('option.textContent = labelsByRepositoryId.get(repository.id) || repository.name');
    expect(html).toContain('selected ? "Git 仓库：" + selected.name + " · " + selected.id : "Git 仓库"');
    expect(html).toContain('action: "selectRepository", repositoryId');
    expect(html).toContain('action: "addRepository"');
    expect(html).toContain('action: "removeRepository", repositoryId');
    expect(html).toContain('els.gitRepositorySelect.disabled = running || projects.length <= 1');
    expect(html).toContain('action: "pick"');
    expect(html).toContain('action: "set"');
    expect(html).toContain('action: "clear"');
    expect(html).toContain('id="btn-apply-ignore-recommendations"');
    expect(html).toContain('type: "uuidAction"');
    expect(html).toContain('id="uuid-options"');
    expect(html).toContain('id="uuid-strategy"');
    expect(html).toContain('uuidStrategy: isUuidTool() ? state.uuidStrategy : undefined');
    expect(html).toContain('type: "caaDialogAction"');
    expect(html).toContain('id="btn-caa-check-connection"');
    expect(html).toContain('action: "checkConnection"');
    expect(html).toContain('ts.caaDeskConnection');
    expect(html).toContain('type: "codeRenameAction"');
    expect(html).toContain('mark.result-hit');
    expect(html).toContain('.ktc-compact-label { display: block;');
    expect(html).toContain('main.className = "compact-file-main ktc-compact-label"');
    expect(html).not.toContain('.compact-file-name { flex:');
    expect(html).toContain('body.ribbon-only .wrap > :not(#ribbon-shell)');
    expect(html).toContain('className = "module-group"');
    expect(html).toContain('className = "module-group-label"');
    expect(html).toContain('(moduleTools[0].moduleTitle || moduleId).toUpperCase()');
    expect(html).toContain('.module-group-tools { display: contents;');
    expect(html).toContain('item.id !== "ignoreSettings"');
    expect(html).toContain('type: "toggleRibbonToolPin"');
    expect(html).toContain('type: "resetCodeRibbonLayout"');
    expect(html).toContain('type: "moveRibbonTool"');
    expect(html).toContain('btn.draggable = pinned.has(t.id)');
    expect(html).toContain('.module-more-menu {\n      position: fixed;');
    expect(html).toContain('function placeModuleMoreMenu(summary, menu)');
    expect(html).toContain('window.innerWidth - margin * 2');
    expect(html).toContain('Math.min(280, Math.max(0, window.innerWidth - margin * 2))');
    expect(html).toContain('placeModuleMoreMenu(els.btnRibbonCustomize, moreMenu);');
    expect(html).toContain('document.createElement("ktc-ribbon-customization-menu")');
    expect(html).toContain('"ktc-ribbon-customization-menu-action"');
    expect(html).toContain('visibleModuleIds: state.moduleState.visible || ["code"]');
    expect(html).toContain('document.body.appendChild(more)');
    expect(html).toContain('customization.focusFirst()');
    expect(html).toContain('document.querySelectorAll(".module-more[open]")');
    expect(html).toContain('className = "module-more module-more-global"');
    expect(html).toContain('openModuleMenuId = more.open ? "all" : ""');
    expect(html).toContain('if (openModuleMenuId === "all")');
    expect(html).toContain('msg.type === "openRibbonCustomization"');
    expect(html).toContain('id="ribbon-shell"');
    expect(html).toContain('id="working-context-shell"');
    expect(html).toContain('id="primary-shell"');
    expect(html).toContain('id="btn-toggle-ribbon-block"');
    expect(html).toContain('id="btn-toggle-primary-block"');
    expect(html).not.toContain('id="btn-toggle-working-context"');
    expect(html.match(/<svg class="shell-block-chevron" viewBox="0 0 16 16" aria-hidden="true">/gu)).toHaveLength(2);
    expect(html.match(/M7\.976 10\.072l4\.357-4\.357\.62\.618L7\.976 11\.31 3 6\.333l\.62-\.618 4\.356 4\.357z/gu)).toHaveLength(9);
    expect(html).toContain('.shell-block.collapsed .shell-block-chevron { transform: rotate(-90deg); }');
    expect(html).toContain('.shell-block-header { display: flex; min-height: 24px; align-items: center; gap: 2px; padding: 0 4px;');
    expect(html).toContain('font-size: var(--vscode-font-size); font-weight: 600;');
    expect(html).toContain('#ribbon-body { padding: 6px 14px 4px; }');
    expect(html).toContain('#ribbon-body .tabs { margin: 0; border-bottom: 0; padding-bottom: 0; }');
    expect(html).not.toContain('class="shell-block-chevron">⌄</span>');
    expect(html).toContain('id="btn-ribbon-customize"');
    expect(html).toContain('id="btn-ribbon-density"');
    expect(html).toContain('id="code-assistant-block"');
    expect(html).toContain('id="code-assistant-tree-section"');
    expect(html).toContain('<span>功能目录</span>');
    expect(html).toContain('/* 当前工具统一采用满宽紧凑内容边界；每个功能在自身行内保留必要内边距。 */');
    expect(html).toContain('.code-assistant-block { margin: -8px 0 0; }');
    expect(html).toContain('底部不得负边距，避免当前功能操作区与 Tree 最后一行重叠。');
    expect(html).toContain('.code-assistant-tree-section { margin: 0 0 4px; padding: 0; border: 1px solid');
    expect(html).toContain('.code-assistant-tree-section[open] > summary { border-bottom: 1px solid');
    expect(html).toContain('class="code-assistant-tree-section-count">（6）</span>');
    expect(html).toContain('class="code-assistant-tree-count">（3）</span>');
    expect(html).toContain('class="code-assistant-tree-count">（2）</span>');
    expect(html).toContain('class="code-assistant-tree-count">（1）</span>');
    expect(html).toContain('els.primaryBody.insertBefore(els.codeAssistantBlock, els.primaryBody.firstElementChild)');
    expect(html).toContain('"代码辅助 / " + tool.title');
    expect(html).toContain('id="btn-code-assistant-package-includes"');
    expect(html).toContain('class="code-assistant-tree-group"');
    expect(html).toContain('C++ 整理');
    expect(html).toContain('文件工具');
    expect(html).toContain('CAA');
    expect(html).toContain('头文件引用修正');
    expect(html).toContain('class="code-assistant-tree-chevron" viewBox="0 0 16 16"');
    expect(html).toContain('button.classList.toggle("selected", button.dataset.codeAssistantFeature === state.codeAssistantFeature)');
    expect(html).toContain('function collapseCodeAssistantDirectory()');
    expect(html).toContain('state.codeAssistantTreeUiState.treeExpanded = false');
    expect(html).toContain('selectCodeAssistantFeature("encodingFix", { type: "selectTool", toolId: "encodingFix" })');
    expect(html).not.toContain('code-assistant-tree-group-count');
    expect(html).toContain('if (state.ribbonBlockCollapsed) {');
    expect(html).toContain('type: "toggleRibbonDensity"');
    expect(html).toContain('id="btn-close-tool"');
    expect(html).toContain('state.ribbonBlockCollapsed = !state.ribbonBlockCollapsed');
    expect(html).not.toContain('state.workingContextCollapsed = !state.workingContextCollapsed');
    expect(html).toContain('state.primaryBlockCollapsed = !state.primaryBlockCollapsed');
    expect(html).toContain('if (initialized && activeToolChanged) state.primaryBlockCollapsed = false');
    expect(html).toContain('let initialized = false;');
    expect(html).toContain('#primary-body { min-height: 0; flex: 1 1 auto; padding-inline: 0; overflow-x: hidden; overflow-y: auto; }');
    expect(html).toContain('type: "closeToolBlock"');
    expect(html).toContain('min-height: 50px;');
    expect(html).not.toContain('id="replace-validation"');
    expect(html).toContain('.replace-block { margin: 2px 0 6px; }');
    expect(html).toContain('.replace-query-shell { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 3px 5px; }');
    expect(html).toContain('id="replace-preview-tooltip"');
    expect(html).toContain('id="replace-apply-tooltip"');
    expect(html).toContain('<input id="replace-preserve-case" type="checkbox" />同时匹配全大写');
    expect(html).toContain('state.replace.preserveCase = !!state.replace.preserveCase');
    expect(html).toContain('preserveCase: els.preserveCase.checked');
    expect(html).toContain('preserveCase: state.replace.preserveCase');
    expect(html).toContain('preserveCase: !!profile.options.preserveCase');
    expect(html).toContain('els.replaceText, els.replaceFile, els.replaceDir, els.preserveCase');
    expect(html).not.toContain('自动匹配大小写（待测试开放）');
    expect(html).toContain('els.replacePreviewTooltip.title = searchReason');
    expect(html).toContain('body.task-running button.action:disabled { cursor: progress; }');
    expect(html).toContain('button.action:disabled { opacity: 0.5; cursor: not-allowed; }');
    expect(html).toContain('body.vscode-high-contrast,');
    expect(html).toContain('--ktc-ui-border: var(--vscode-contrastBorder, var(--vscode-focusBorder));');
    expect(html).toContain('--ktc-ui-active-border: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder));');
    expect(html).toContain('border: 1px solid var(--ktc-ui-border, var(--vscode-button-border, transparent));');
    expect(html).toContain('.tab:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); border-color: var(--ktc-ui-active-border');

    const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script!)).not.toThrow();

    const uuidTool = readFileSync(new URL("../tools/uuidReplace/index.ts", import.meta.url), "utf8");
    expect(uuidTool).not.toContain("showQuickPick");
    expect(uuidTool).not.toContain("chooseStrategy");
    const profileController = readFileSync(new URL("../searchReplaceProfileController.ts", import.meta.url), "utf8");
    expect(profileController).not.toContain("showInputBox");
    expect(profileController).not.toContain("showWarningMessage");
    const encodingCommands = readFileSync(new URL("../tools/encodingFix/commands.ts", import.meta.url), "utf8");
    expect(encodingCommands).not.toContain("是否查看预检结果");
    const encodingOptions = readFileSync(new URL("../tools/encodingFix/options.ts", import.meta.url), "utf8");
    expect(encodingOptions).toContain("vscode.ConfigurationTarget.WorkspaceFolder");
    expect(encodingOptions).toContain('"workbench.action.openWorkspaceSettings"');
    expect(encodingOptions).toContain('config.update("defaultTarget", value, targetScope)');
    const sidebarProvider = readFileSync(new URL("./sidebarViewProvider.ts", import.meta.url), "utf8");
    expect(sidebarProvider).toContain("invalidateEncodingFixResults()");
    expect(sidebarProvider).toContain('message: "项目编码目标已更新，请重新预检。"');
  });

  it("只把 Codegen Host 状态投影给 Primary 页面组件", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getPanelHtml>[1];
    const html = getPanelHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);
    const body = html.match(
      /function renderCodegen\(ts, running\) \{([\s\S]*?)\n    \}\n\n    function render\(\)/,
    )?.[1];
    expect(body).toBeTruthy();

    const els = { codegenPanel: { model: undefined as unknown } };
    const renderCodegen = new Function(
      "els",
      `return function renderCodegen(ts, running) {${body!}\n};`,
    )(els) as (state: Record<string, unknown>, running: boolean) => void;

    const codegen = {
      kind: "kt.codegen.primary-ui-model",
      schemaVersion: 1,
      documents: [],
      candidates: [],
      reports: [],
      reportInvalidCount: 0,
      operation: "discovery",
      running: false,
      capabilities: {
        openJson: true,
        importCsv: true,
        applyAll: true,
        scanCandidates: true,
        openReportDirectory: false,
      },
    };
    renderCodegen({ codegen }, true);

    expect(els.codegenPanel.model).toEqual({ ...codegen, running: true });

    renderCodegen({}, true);
    expect(els.codegenPanel.model).toBeUndefined();
  });

  it("搜索不要求替换内容，替换必须填写目标内容", () => {
    const base = { running: false, search: "", replace: "", text: true, file: false, dir: false, extraRules: [] };
    expect(ktcSearchReplaceButtonState({ ...base, action: "search" })).toEqual({
      disabled: true,
      busy: false,
      message: "请输入搜索内容，或添加一条已启用的关联规则。",
    });
    expect(ktcSearchReplaceButtonState({ ...base, action: "search", search: "Old", file: true })).toEqual({ disabled: false, busy: false, message: "" });
    expect(ktcSearchReplaceButtonState({ ...base, action: "replace", search: "Old" })).toEqual({
      disabled: true,
      busy: false,
      message: "请输入替换内容后再替换。",
    });
    expect(ktcSearchReplaceButtonState({ ...base, action: "replace", search: "Old", replace: "New" })).toEqual({ disabled: false, busy: false, message: "" });
    expect(ktcSearchReplaceButtonState({ ...base, action: "search", running: true })).toEqual({ disabled: true, busy: true, message: "" });

    const source = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    expect(source).toContain('id="btn-replace-toggle"');
    expect(source).toContain('>搜索</button>');
    expect(source).toContain('class="replace-query-row replace-only"');
    expect(source).toContain('<div id="replace-details">');
    expect(source).not.toContain('<div class="replace-only" id="replace-details">');
    expect(source).toContain('state.replace.collapsed = !state.replace.collapsed');
    expect(source).toContain('els.compactTools.hidden = !caaDialog');
    expect(source).not.toContain('els.compactTools.hidden = !(rename || uuid || caaDialog)');
  });

  it("只贡献一个自动高度 View，并在内部提供三个 VS Code 风格 Block", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      contributes: {
        viewsContainers?: { activitybar?: Array<{ id: string }> };
        views: Record<string, Array<{ id: string; initialSize?: number; when?: string }>>;
        commands: Array<{ command: string; title: string; category?: string; icon?: string }>;
        submenus: Array<{ id: string; label: string; icon?: string }>;
        menus: Record<string, Array<{ command?: string; submenu?: string; group?: string; when?: string }>>;
        configuration: { properties: Record<string, unknown> };
      };
    };
    expect(manifest.contributes.views["kt-auto-code"]?.map((view) => view.id)).toEqual(["ktAutoCode.modulePanel"]);
    expect(manifest.contributes.views["kt-auto-code"]?.map((view) => view.initialSize)).toEqual([undefined]);
    expect(manifest.contributes.viewsContainers?.activitybar).toHaveLength(1);
    expect(manifest.contributes.viewsContainers?.activitybar?.[0]?.id).toBe("kt-auto-code");
    expect(manifest.contributes.views["kt-auto-code"]?.[0]?.when).toBeUndefined();
    expect(manifest.contributes.menus["view/item/context"]).toBeUndefined();
    expect(manifest.contributes.commands.filter((command) => [
      "ktAutoCode.codegen.open",
      "ktAutoCode.codegen.importCsv",
      "ktAutoCode.codegen.applyAll",
      "ktAutoCode.codegen.refresh",
      "ktAutoCode.codegen.scanCandidates",
      "ktAutoCode.codegen.diagnostics",
    ].includes(command.command))).toEqual([
      { command: "ktAutoCode.codegen.open", title: "打开 JSON…", category: "KT Auto Code", icon: "$(folder-opened)" },
      { command: "ktAutoCode.codegen.importCsv", title: "导入 CSV…", category: "KT Auto Code", icon: "$(file-symlink-file)" },
      { command: "ktAutoCode.codegen.applyAll", title: "全部应用", category: "KT Auto Code", icon: "$(check-all)" },
      { command: "ktAutoCode.codegen.refresh", title: "刷新列表", category: "KT Auto Code", icon: "$(refresh)" },
      { command: "ktAutoCode.codegen.scanCandidates", title: "扫描候选源码", category: "KT Auto Code", icon: "$(search)" },
      { command: "ktAutoCode.codegen.diagnostics", title: "复制运行诊断", category: "KT Auto Code", icon: "$(pulse)" },
    ]);
    expect(manifest.contributes.submenus).toContainEqual({
      id: "ktAutoCode.modulePanel.more",
      label: "更多",
      icon: "$(ellipsis)",
    });
    expect(manifest.contributes.menus["view/title"]).not.toContainEqual(expect.objectContaining({
      command: "ktAutoCode.ribbon.customize",
    }));
    expect(manifest.contributes.menus["view/title"]).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "ktAutoCode.module.code.show" }),
      expect.objectContaining({ command: "ktAutoCode.module.code.hide" }),
      expect.objectContaining({ command: "ktAutoCode.sidebar.toggleStyle" }),
    ]));
    expect(manifest.contributes.menus["view/title"]).toContainEqual({
      submenu: "ktAutoCode.modulePanel.more",
      when: "view == ktAutoCode.modulePanel && ktAutoCode.modulePanel.activeTool == codegen",
      group: "navigation@8",
    });
    expect(manifest.contributes.menus["view/title"]).not.toContainEqual(expect.objectContaining({
      command: "ktAutoCode.modulePanel.close",
    }));
    expect(manifest.contributes.menus["ktAutoCode.modulePanel.more"]).toEqual([
      { command: "ktAutoCode.codegen.open", group: "navigation@1" },
      { command: "ktAutoCode.codegen.importCsv", group: "navigation@2" },
      { command: "ktAutoCode.codegen.applyAll", group: "navigation@3" },
      { command: "ktAutoCode.codegen.refresh", group: "navigation@4" },
      { command: "ktAutoCode.codegen.scanCandidates", group: "navigation@5" },
      { command: "ktAutoCode.codegen.diagnostics", group: "navigation@6" },
    ]);
    expect(Object.keys(manifest.contributes.configuration.properties)).not.toEqual(expect.arrayContaining([
      "ktAutoCode.environment.rootDir",
      "ktAutoCode.environment.rootDir3rdParty",
      "ktAutoCode.environment.rootDirCore",
      "ktAutoCode.environment.mkVersion",
    ]));
    expect(manifest.contributes.configuration.properties["ktAutoCode.encodingFix.defaultTarget"]).toMatchObject({
      type: "string",
      enum: ["utf8", "gbk"],
      default: "utf8",
      scope: "resource",
    });
    for (const key of ["headerTarget", "sourceTarget", "markdownTarget"]) {
      expect(manifest.contributes.configuration.properties[`ktAutoCode.encodingFix.${key}`]).toMatchObject({
        type: "string",
        enum: ["inherit", "ascii", "utf8", "gbk"],
        default: "inherit",
        scope: "resource",
      });
    }
  });

  it("新扫描全选 pending，同一缓存更新保留用户取消选择", () => {
    const rows = (states: Array<[string, "pending" | "applied"]>) => states.map(([uri, state]) => ({
      uri,
      relativePath: `${uri}.cpp`,
      kind: "source" as const,
      encoding: "UTF-8",
      changed: true,
      state,
      warnings: [],
    }));
    const first = ktcNextReorderSelection({ selectedUris: [], revision: undefined }, {
      reorderRevision: 1,
      reorderResults: rows([["one", "pending"], ["two", "pending"]]),
    });
    expect(first.selectedUris).toEqual(["one", "two"]);
    const sameRevision = ktcNextReorderSelection({ selectedUris: ["one"], revision: first.revision }, {
      reorderRevision: 1,
      reorderResults: rows([["one", "applied"], ["two", "pending"]]),
      reorderSelectedUris: [],
    });
    expect(sameRevision.selectedUris).toEqual([]);
    const newScan = ktcNextReorderSelection(sameRevision, {
      reorderRevision: 2,
      reorderResults: rows([["two", "pending"]]),
    });
    expect(newScan.selectedUris).toEqual(["two"]);
  });
});
