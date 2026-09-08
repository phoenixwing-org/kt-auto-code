import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ktcEditorCompanionStatusText,
  getPanelHtml,
  ktcCodeAssistantFeatureBlock,
  ktcGitPanelModel,
  ktcResolveGroupMruToolId,
  ktcSearchReplaceButtonState,
  ktcSimpleRenameRules,
} from "./panelHtml.js";
import { ktcNextReorderSelection } from "./reorderMembersPanelState.js";
import { ktcRequireToolRegistration } from "../tools/toolRegistrationCatalog.js";
import { KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS } from "../core/editorPrimaryCompanionContracts.js";

function panelElementAncestors(html: string, targetId: string): string[] | undefined {
  const start = html.indexOf('<div class="wrap">');
  const end = html.indexOf("<script nonce=", start);
  const fragment = html.slice(start, end);
  const stack: Array<{ tag: string; marker: string }> = [];
  const tags = /<(\/)?([a-z][\w-]*)([^>]*)>/giu;
  const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  let match: RegExpExecArray | null;
  while ((match = tags.exec(fragment))) {
    const [, closing, rawTag, attributes] = match;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const openIndex = stack.map((entry) => entry.tag).lastIndexOf(tag);
      if (openIndex >= 0) stack.length = openIndex;
      continue;
    }
    const id = /\sid="([^"]+)"/u.exec(attributes)?.[1];
    if (id === targetId) return stack.map((entry) => entry.marker);
    const firstClass = /\sclass="([^"]+)"/u.exec(attributes)?.[1]?.split(/\s+/u)[0];
    const marker = id ? `#${id}` : firstClass ? `.${firstClass}` : tag;
    if (!voidTags.has(tag) && !/\/\s*$/u.test(attributes)) stack.push({ tag, marker });
  }
  return undefined;
}

describe("sidebar panel HTML", () => {
  it("由统一契约判定三个 Editor Primary companion", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getPanelHtml>[1];
    const html = getPanelHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);

    expect(KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS).toEqual([
      "projectRename",
      "packageIncludes",
      "autoBuild",
    ]);
    expect(html).toContain(
      `const editorPrimaryCompanionToolIds = new Set(${JSON.stringify(KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS)});`,
    );
    expect(html).toContain("return editorPrimaryCompanionToolIds.has(state.activeToolId);");
    expect(html).not.toContain('state.activeToolId === "projectRename" || state.activeToolId === "autoBuild"');
  });

  it("Current Tool Header 关闭后把焦点恢复到 active Open Item，无打开项时回到 Welcome body", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getPanelHtml>[1];
    const html = getPanelHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);

    const currentToolCloseStart = html.indexOf(
      'els.currentToolRegion.addEventListener("ktc-current-tool-region-action"',
    );
    const currentToolCloseEnd = html.indexOf(
      'els.openItemsBar.addEventListener("ktc-open-items-bar-action"',
      currentToolCloseStart,
    );
    const currentToolCloseHandler = html.slice(currentToolCloseStart, currentToolCloseEnd);
    expect(currentToolCloseStart).toBeGreaterThan(-1);
    expect(currentToolCloseEnd).toBeGreaterThan(currentToolCloseStart);
    const focusRequestIndex = currentToolCloseHandler.indexOf("focusOpenItemsRequested = true;");
    const closeMessageIndex = currentToolCloseHandler.indexOf(
      'vscode.postMessage({ type: "closeToolBlock", toolId: detail.itemId })',
    );
    expect(focusRequestIndex).toBeGreaterThan(-1);
    expect(closeMessageIndex).toBeGreaterThan(focusRequestIndex);

    expect(html).toContain('activeId: activeOpenTool?.id || ""');
    expect(html).toContain('{ itemId: "", title: "KT Auto Code", icon: "layout" }');
    expect(html).toContain('if (!els.openItemsBar.focusActiveItem()) els.currentToolRegion.focusContent()');
  });

  it("disposed companion 优先保留 Host 安全提示，仅在空消息时回退", () => {
    expect(ktcEditorCompanionStatusText({
      lifecycle: "disposed",
      message: "任务关闭时仍在写盘，已阻止继续操作。",
      ready: false,
    })).toBe("任务关闭时仍在写盘，已阻止继续操作。");
    expect(ktcEditorCompanionStatusText({
      lifecycle: "disposed",
      message: "",
      ready: false,
    })).toBe("右侧 View 已关闭；可从原入口启动新的任务。");
    expect(ktcEditorCompanionStatusText({
      lifecycle: "active",
      message: "",
      ready: true,
    })).toBe("任务已连接。");
  });

  it("代码辅助内部功能统一由同一 Block 外壳生成", () => {
    expect(ktcCodeAssistantFeatureBlock({
      id: "feature",
      title: "功能操作",
      closeId: "close",
      closeTitle: "关闭",
      closeAriaLabel: "关闭功能",
      body: "<button>执行</button>",
    })).toContain('<details class="code-assistant-feature" id="feature" open>');
    expect(ktcCodeAssistantFeatureBlock({
      id: "feature",
      title: "功能操作",
      closeId: "close",
      closeTitle: "关闭",
      closeAriaLabel: "关闭功能",
      body: "<button>执行</button>",
    })).toContain('id="close"');
  });

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

    expect(ktcRequireToolRegistration("codegen").shortTitle).toBe("自动代码");
    expect(source).not.toContain('codegen: "自动代码"');
    expect(source).not.toContain('codegen: "生成"');
    expect(icon).toContain('viewBox="0 0 1024 1024"');
    expect(icon).toContain("M389.44 768a96.064 96.064");
    expect(icon).not.toContain("M4 3h16");
  });

  it("Primary 保留简单变形，并把复杂规则入口交给项目改名", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getPanelHtml>[1];
    const html = getPanelHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);

    expect(html).not.toContain('<ktc-associated-rule-picker id="rule-picker"></ktc-associated-rule-picker>');
    expect(html).not.toContain("test-webview:/extension/dist/associated-rule-picker.js");
    expect(html).not.toContain('"ktc-associated-rule-picker-action"');
    expect(html).not.toContain("els.rulePicker.openPicker(picker)");
    expect(html).not.toContain('id="rule-picker-list"');
    expect(html).not.toContain('type: "requestAssociatedRuleCandidates"');
    expect(html).not.toContain('type: "appendAssociatedRules"');
    expect(html).toContain('<ktc-directory-bar id="working-context-shell" slot="directory"></ktc-directory-bar>');
    expect(html).not.toContain('>将结果文件加入工作集</button>');
    expect(html).not.toContain('把本次命中的文件作为精确规则加入已有工作集');
    expect(html).not.toContain('id="replace-profile-name"');
    expect(html).not.toContain('id="replace-source-prefix"');
    expect(html).not.toContain('id="replace-target-prefix"');
    expect(html).not.toContain('id="replace-preserve-case"');
    expect(html).toContain('<pnw-combo id="replace-history"></pnw-combo>');
    expect(html).not.toContain('id="btn-delete-replace-history"');
    expect(html).not.toContain('id="btn-clear-replace-history"');
    expect(html).toContain("pnw-combo-action");
    expect(html).toContain("clearLabel: \"全部清空\"");
    expect(html).toContain('type: "deleteRenameHistoryPair"');
    expect(html).toContain('type: "clearRenameHistoryPairs"');
    expect(html).toContain("var(--vscode-dropdown-background");
    expect(html).not.toContain('id="replace-variant-mode"');
    expect(html).toContain('id="btn-replace-variants"');
    expect(html).toContain('id="replace-variant-block"');
    expect(html).toContain('id="replace-variant-list"');
    expect(html).toContain('search.className = "replace-variant-input"');
    expect(html).toContain('replace.className = "replace-variant-input"');
    expect(html).toContain('up.textContent = "↑"');
    expect(html).toContain('remove.textContent = "×"');
    expect(html).toContain('class="replace-variant-toggle" id="btn-project-rename-analysis"');
    expect(html.indexOf('id="btn-project-rename-analysis"')).toBeGreaterThan(html.indexOf('id="replace-block"'));
    expect(html).toContain('>项目改名</button>');
    expect(html).toContain('id="editor-companion-block"');
    expect(html).toContain('id="project-rename-primary"');
    expect(html).toContain('<pnw-combo id="project-rename-primary-scheme"></pnw-combo>');
    expect(html).not.toContain('id="project-rename-primary-delete-scheme"');
    expect(html).not.toContain('id="project-rename-primary-clear-schemes"');
    expect(html).toContain('model.rootName + " @ " + model.rootParent');
    expect(html).not.toContain('<div class="project-rename-primary-directory"><strong>分析目录</strong>');
    expect(html).toContain('postProjectRenamePrimaryAction(model, "deleteScheme", detail.itemId)');
    expect(html).toContain('postProjectRenamePrimaryAction(model, "clearSchemes")');
    expect(html).toContain("dist/pnw-combo.js");
    expect(html).toContain('id="auto-build-primary-panel"');
    expect(html).toContain("ktc-auto-build-primary-panel.js");
    expect(html).toContain('function renderEditorCompanion(ts)');
    expect(html).toContain('function renderAutoBuildPrimary(ts)');
    expect(html).toContain('companion?.primary?.kind === "autoBuild"');
    expect(html).toContain('"ktc-auto-build-primary-action"');
    expect(html).toContain("event.detail.value.slice(0, 4096)");
    expect(html).toContain('els.editorCompanionStatus.textContent = editorCompanionStatusText(model)');
    expect(html).toContain('type: "editorCompanionAction"');
    expect(html).toContain('panelId: model.panelId');
    expect(html).toContain('sessionId: model.sessionId');
    expect(html).toContain('revision: model.revision');
    expect(html).toContain('button.disabled = closed || !model.ready || !action.enabled');
    expect(html).not.toContain('id="workspace-file-scope-select"');
    expect(html).not.toContain('type: "selectWorkspaceFileScope"');
    expect(html).not.toContain('type: "openWorkspaceWorksets"');
    expect(html).toContain("const toolScrollPositions = new Map();");
    expect(html).toContain("toolScrollPositions.set(state.activeToolId, els.currentToolRegion.contentScrollTop)");
    expect(html).toContain("requestAnimationFrame(() => { els.currentToolRegion.contentScrollTop = top; })");
    expect(html).toContain("const activeToolChanged = switchActiveTool(msg.activeToolId)");
    expect(html).not.toContain('state.replace.scope = ""');
    expect(html).not.toContain('<select id="replace-scope"');
    expect(html).toContain('type: "pickWorkingDirectory"');
    expect(html).toContain('type: "showWorkingDirectoryQuickPick"');
    expect(html).not.toContain('type: "selectWorkingDirectory"');
    expect(html).not.toContain('id="working-context"');
    expect(html).not.toContain('id="btn-pick-working-directory"');
    expect(html).not.toContain('working-context-context-icon');
    expect(html).not.toContain('id="btn-open-settings"');
    expect(html).toContain('toolId: "environmentSettings"');
    expect(html).toContain('<ktc-ignore-primary-panel id="ignore-panel" hidden>');
    expect(html).toContain('test-webview:/extension/dist/ktc-ignore-primary-panel.js');
    expect(html).toContain('"ktc-ignore-primary-action"');
    expect(html).toContain('els.ignorePanel.model = {');
    expect(html).toContain('type: "openIgnoreTarget", target: detail.target');
    expect(html).toContain('type: "dedupeIgnoreTarget", target: detail.target');
    expect(html).toContain('type: "saveIgnoreTarget", target: detail.target');
    expect(html).toContain('type: "applyIgnoreRules"');
    expect(html).toContain('type: "applyIgnoreRecommendations"');
    expect(html).not.toContain('id="ignore-manager"');
    expect(html).not.toContain('id="plugin-ignore-enabled"');
    expect(html).toContain('class="settings-section-chevron"');
    expect(html).toContain('.settings-section[open] .settings-section-chevron { transform: rotate(0deg); }');
    expect(html).toContain('<span>工程环境</span></summary>');
    expect(html).toContain('id="plugin-settings-tree" open');
    expect(html).toContain('<span>插件设置</span><span class="settings-section-count">5 项</span>');
    expect(html).toContain('role="tree" aria-label="插件设置功能"');
    expect(html).toContain('id="plugin-setting-values" aria-label="CAA 插件设置当前值"');
    expect(html).toContain('item.label + " · " + item.value + " · " + item.source');
    expect(html).toContain('role="treeitem" title="打开 KT Auto Code 的 VS Code 设置"');
    expect(html.indexOf('id="ignore-panel"')).toBeLessThan(html.indexOf('id="environment-block"'));
    expect(html).not.toContain('id="replace-ignored"');
    expect(html).not.toContain('"最近 · " + directory');
    expect(html).not.toContain('"外部 · " + directory');
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
    expect(html).toContain('const welcomeMode = (state.openToolIds || []).length === 0');
    expect(html).toContain('{ itemId: "", title: "KT Auto Code", icon: "layout" }');
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
    expect(html).toContain('t.shortTitle || t.title');
    expect(html).not.toContain('const shortTitles =');
    expect(html).toContain('<ktc-reorder-members-panel id="reorder-members-panel"></ktc-reorder-members-panel>');
    expect(html).toContain('<ktc-tool-navigator id="code-assistant-navigator" slot="group-content" hidden></ktc-tool-navigator>');
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
    expect(html).toContain('syncIgnorePrimaryPanel(state.toolStates.ignoreSettings || { status: "idle" })');
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
    expect(html).not.toContain('id="btn-apply-ignore-recommendations"');
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
    expect(html).not.toContain('body.ribbon-only #tool-area-shell > :not(#ribbon-shell)');
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
    expect(html).toContain('placeModuleMoreMenu(els.ribbonShell, moreMenu);');
    expect(html).toContain('document.createElement("ktc-ribbon-customization-menu")');
    expect(html).toContain('"ktc-ribbon-customization-menu-action"');
    expect(html).toContain('visibleModuleIds: state.moduleState.visible || ["code"]');
    expect(html).toContain('document.body.appendChild(more)');
    expect(html).toContain('customization.focusFirst()');
    expect(html).toContain('document.querySelectorAll(".module-more[open]")');
    expect(html).toContain('className = "module-more module-more-global"');
    expect(html).toContain('openModuleMenuId = more.open ? "all" : ""');
    expect(html).toContain('const shouldOpen = openModuleMenuId === "all"');
    expect(html).toContain('msg.type === "openRibbonCustomization"');
    expect(html).toContain('id="ribbon-shell"');
    expect(html).toContain('id="working-context-shell"');
    expect(html).toContain('id="primary-shell"');
    expect(html).not.toContain('id="btn-toggle-ribbon-mode"');
    expect(html).not.toContain('id="btn-toggle-ribbon-block"');
    expect(html).not.toContain('id="btn-toggle-primary-block"');
    expect(html).not.toContain('id="btn-toggle-working-context"');
    expect(html).not.toContain('class="shell-block-chevron"');
    expect(html).toContain('id="replace-ignore-summary"');
    expect(html).toContain('id="replace-ignore-builtin" type="checkbox" checked');
    expect(html).toContain('id="replace-ignore-git" type="checkbox" checked');
    expect(html).toContain('id="replace-ignore-custom-enabled" type="checkbox"');
    expect(html).toContain('id="btn-toggle-replace-ignore"');
    expect(html).toContain('id="btn-manage-replace-ignore"');
    expect(html).toContain('type: "setIgnoreEnabled"');
    expect(html).toContain('type: "selectTool", toolId: "ignoreSettings"');
    expect(html).toContain('type: "setIgnoreSourceEnabled", source: "builtIn"');
    expect(html).toContain('停用后仍保留不可关闭的安全排除；规则正文统一在 Ignore 管理中修改。');
    expect(html).not.toContain('id="replace-ignore-custom-patterns"');
    expect(html).not.toContain('type: "savePrimaryCustomIgnore", patterns');
    expect(html).not.toContain('.shell-block.collapsed .shell-block-chevron');
    expect(html).toContain('flex-wrap: var(--ktc-ribbon-wrap, wrap);');
    expect(html).toContain('width: var(--ktc-ribbon-item-width, 68px);');
    expect(html).toContain('min-width: var(--ktc-ribbon-item-min-width, 46px);');
    expect(html).toContain('height: var(--ktc-ribbon-item-height, 58px);');
    expect(html).toContain('display: var(--ktc-ribbon-label-display, block);');
    expect(html).not.toContain('.tabs.compact .module-group-label');
    expect(html).toContain('group.setAttribute("role", "group")');
    expect(html).toContain('group.setAttribute("aria-label", (moduleTools[0].moduleTitle || moduleId) + " 模块")');
    expect(html).toContain('icon.className = "tool-icon-fallback"');
    expect(html).toContain('Array.from(String(t.shortTitle || t.title || "?").trim())[0] || "?"');
    expect(html).toContain('icon.setAttribute("aria-hidden", "true")');
    expect(html).not.toContain('aria-controls="ribbon-body"');
    expect(html).not.toContain('setAttribute("aria-expanded", compact ? "false" : "true")');
    expect(html).not.toContain('class="shell-block-chevron">⌄</span>');
    expect(html).not.toContain('id="btn-ribbon-customize"');
    expect(html).not.toContain('id="btn-ribbon-ignore"');
    expect(html).not.toContain('id="btn-ribbon-density"');
    expect(html.match(/id="btn-ribbon-customize"/gu) ?? []).toHaveLength(0);
    expect(html).toContain('els.ignorePanel.hidden = !ignore');
    expect(html).toContain('els.environmentBlock.hidden = !environment');
    expect(html).not.toContain('els.btnRibbonIgnore.onclick');
    expect(html).toContain('id="code-assistant-block"');
    expect(html).toContain('id="code-assistant-navigator"');
    expect(html).toContain("test-webview:/extension/dist/ktc-tool-navigator.js");
    expect(html).toContain('const codeAssistantNavigation = [{"kind":"group"');
    expect(html).toContain('.code-assistant-block { margin: 0; }');
    expect(html).toContain('ktc-tool-navigator { display: block; min-width: 0; }');
    expect(html).toContain('"toolId":"autoBuild"');
    expect(html).toContain('"description":"CAA / MSVC 批量构建"');
    expect(html).toContain('type: "openCodeAssistantFeature", feature: toolId');
    expect(html).toContain('els.primaryBody.insertBefore(els.codeAssistantBlock, els.primaryBody.firstElementChild)');
    expect(html).toContain('? { itemId: activeOpenTool.id, title: activeOpenTool.title, icon: semanticToolIcon(activeOpenTool.id) }');
    expect(html).not.toContain('"代码辅助 / " + tool.title');
    expect(html).not.toContain('"代码辅助 · " + tool.title');
    expect(html).toContain('const item = state.tools.find((candidate) => candidate.id === toolId)');
    expect(html).toContain('shortTitle: item.shortTitle || item.title');
    expect(html).toContain('"toolId":"packageIncludes"');
    expect(html).toContain('"id":"cpp-organize"');
    expect(html).toContain('C++ 整理');
    expect(html).toContain('文件工具');
    expect(html).toContain('CAA');
    expect(html).toContain('头文件引用修正');
    expect(html).toContain('presentation: "compact"');
    expect(html).toContain('showLabels: treeUi.showLabels !== false');
    expect(html).not.toContain('mode: treeUi.navigatorMode === "grid" ? "grid" : "outline"');
    expect(html).toContain('activeToolId: (state.openToolIds || []).includes(state.activeToolId) ? state.activeToolId : ""');
    expect(html).toContain('"ktc-tool-navigator-action"');
    expect(html).toContain('detail.kind === "setMode"');
    expect(html).not.toContain('detail.kind === "setGroupExpanded"');
    expect(html).not.toContain('function collapseCodeAssistantDirectory()');
    expect(html).not.toContain('state.codeAssistantTreeUiState.treeExpanded = false');
    expect(html).toContain('vscode.postMessage({ type: "selectTool", toolId, source: "menu" })');
    expect(html).toContain('toolId: currentContentToolId()');
    expect(html).not.toContain('type: "closeCodeAssistantFeature"');
    expect(html).toContain('id="code-assistant-generic-actions"');
    expect(html).toContain('id="btn-code-assistant-generic-close"');
    expect(html).not.toContain('state.codeAssistantFeature = "packageIncludes"');
    expect(html).not.toContain('if (!treeUi.reorderActionsExpanded && !treeUi.reorderResultsExpanded)');
    expect(html).not.toContain('els.codeAssistantGenericActions.open = true');
    expect(html).not.toContain('code-assistant-tree-group-count');
    expect(html).toContain('pendingRibbonCollapseMigration = saved.ribbonBlockCollapsed === true');
    expect(html).toContain('type: "setRibbonStyle", style: state.sidebarStyle');
    expect(html).toContain('type: "setRibbonStyle", style: "compact"');
    expect(html).not.toContain('id="btn-close-tool"');
    expect(html).not.toContain('state.ribbonBlockCollapsed = !state.ribbonBlockCollapsed');
    expect(html).toContain('state.sidebarStyle = detail.mode === "compact" ? "compact" : "ribbon"');
    expect(html).not.toContain('setAttribute("aria-label", "仅显示工具图标")');
    expect(html).not.toContain('state.workingContextCollapsed = !state.workingContextCollapsed');
    expect(html).not.toContain('toolSurfaceCollapsed');
    expect(html).not.toContain('primaryBlockCollapsed');
    expect(html).not.toContain('resolveToolSurfaceIntent');
    expect(html).toContain('msg.type === "revealToolSurface"');
    expect(html).toContain('let initialized = false;');
    expect(html).toContain('#primary-body { width: 100%; min-width: 0; min-height: 100%; padding: 0 0 8px; overflow: visible; }');
    expect(html).toContain('#primary-body > .welcome-panel { padding: 8px 10px 10px; }');
    expect(html).not.toContain('body.welcome-mode #primary-body { padding-right: 0; }');
    expect(html).toContain('type: "closeToolBlock", toolId: detail.itemId');
    expect(html).toContain('min-height: 50px;');
    expect(html).not.toContain('id="replace-validation"');
    expect(html).toContain('.replace-block { margin: 2px 0 6px; }');
    expect(html).toContain('.replace-query-shell { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 3px 5px; }');
    expect(html).toContain('id="replace-preview-tooltip"');
    expect(html).toContain('id="replace-apply-tooltip"');
    expect(html).not.toContain('<input id="replace-preserve-case" type="checkbox" />同时匹配全大写');
    expect(html).not.toContain('preserveCase: els.preserveCase.checked');
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

  it("Primary 由 Directory、Toolbar、Current Tool、Open Items 四个一级组件按序组成", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getPanelHtml>[1];
    const html = getPanelHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);

    expect(panelElementAncestors(html, "primary-shell")).toEqual([".wrap"]);
    expect(panelElementAncestors(html, "working-context-shell")).toEqual([".wrap", "#primary-shell"]);
    expect(panelElementAncestors(html, "ribbon-shell")).toEqual([".wrap", "#primary-shell"]);
    expect(panelElementAncestors(html, "code-assistant-navigator")).toEqual([".wrap", "#primary-shell", "#ribbon-shell"]);
    expect(panelElementAncestors(html, "current-tool-region")).toEqual([".wrap", "#primary-shell"]);
    expect(panelElementAncestors(html, "primary-body")).toEqual([".wrap", "#primary-shell", "#current-tool-region"]);
    expect(panelElementAncestors(html, "open-items-bar")).toEqual([".wrap", "#primary-shell"]);
    expect(panelElementAncestors(html, "tool-area-shell")).toBeUndefined();

    const directoryIndex = html.indexOf('<ktc-directory-bar id="working-context-shell" slot="directory"');
    const toolbarIndex = html.indexOf('<ktc-toolbar-strip id="ribbon-shell" slot="toolbar"');
    const currentIndex = html.indexOf('<ktc-current-tool-region id="current-tool-region" slot="current"');
    const openItemsIndex = html.indexOf('<ktc-open-items-bar id="open-items-bar" slot="open-items"');
    expect(directoryIndex).toBeGreaterThan(-1);
    expect(toolbarIndex).toBeGreaterThan(directoryIndex);
    expect(currentIndex).toBeGreaterThan(toolbarIndex);
    expect(openItemsIndex).toBeGreaterThan(currentIndex);
    expect(html.match(/<ktc-primary-shell id="primary-shell">/gu)).toHaveLength(1);
    expect(html.match(/<div class="tabs ribbon" id="tabs" slot="ribbon"/gu)).toHaveLength(1);

    for (const scriptName of [
      "ktc-primary-shell",
      "ktc-directory-bar",
      "ktc-toolbar-strip",
      "ktc-current-tool-region",
      "ktc-open-items-bar",
    ]) {
      expect(html).toContain(`test-webview:/extension/dist/${scriptName}.js`);
    }

    expect(html).toContain('els.workingContextShell.model = {');
    expect(html).toContain('els.workingContextShell.addEventListener("ktc-directory-bar-action"');
    expect(html).toContain('detail.kind === "select") vscode.postMessage({ type: "showWorkingDirectoryQuickPick" }');
    expect(html).toContain('detail.kind === "choose") vscode.postMessage({ type: "pickWorkingDirectory" }');
    expect(html).not.toContain('id="btn-pick-working-directory"');
    expect(html).not.toContain('type: "selectWorkingDirectory"');

    expect(html).toContain('mode: state.sidebarStyle === "compact" ? "compact" : "expanded"');
    expect(html).toContain('groupContentVisible,');
    expect(html).toContain('overflowOpen: openModuleMenuId === "all"');
    expect(html).toContain('els.ribbonShell.addEventListener("ktc-toolbar-strip-action"');
    expect(html).toContain('detail.kind === "setMode"');
    expect(html).toContain('detail.kind !== "setOverflowOpen"');
    expect(html).not.toContain('id="btn-toggle-ribbon-mode"');
    expect(html).not.toContain('id="btn-ribbon-customize"');
    expect(html).not.toContain('--ktc-toolbar-compact-module-min-width:');
    expect(html).not.toContain('--ktc-toolbar-compact-module-writing-mode:');
    expect(html).not.toContain('--ktc-toolbar-compact-module-font-size:');
    expect(html).not.toContain('--ktc-toolbar-compact-module-letter-spacing:');

    expect(html).toContain('presentation: "compact"');
    expect(html).toContain('showLabels: treeUi.showLabels !== false');
    expect(html).toContain('state.codeAssistantTreeUiState.showLabels = detail.showLabels !== false');
    expect(html).toContain('detail.kind !== "setShowLabels"');
    expect(html).not.toContain('mode: treeUi.navigatorMode === "grid" ? "grid" : "outline"');

    expect(html).toContain('? { itemId: activeOpenTool.id, title: activeOpenTool.title, icon: semanticToolIcon(activeOpenTool.id) }');
    expect(html).toContain('els.currentToolRegion.addEventListener("ktc-current-tool-region-action"');
    expect(html).toContain('vscode.postMessage({ type: "closeToolBlock", toolId: detail.itemId })');
    expect(html).not.toContain('toolSurfaceCollapsed');
    expect(html).not.toContain('resolveToolSurfaceIntent');
    expect(html).not.toContain('id="btn-toggle-primary-block"');

    expect(html).toContain('const openItemsModel = {');
    expect(html).toContain('if (nextOpenItemsModelSignature !== openItemsModelSignature) {');
    expect(html).toContain('const openItemsHadFocus = Boolean(els.openItemsBar.shadowRoot?.activeElement)');
    expect(html).toContain('els.openItemsBar.model = openItemsModel');
    expect(html).toContain('if (!els.openItemsBar.focusActiveItem()) els.currentToolRegion.focusContent()');
    expect(html).toContain('els.openItemsBar.addEventListener("ktc-open-items-bar-action"');
    expect(html).toContain('type: "activateOpenTool", toolId: detail.itemId');
    expect(html).toContain('type: "closeToolBlock", toolId: detail.itemId');
    expect(html).toContain('type: "closeOtherToolBlocks", toolId: detail.itemId');
    expect(html).toContain('const ribbonOverflowTrigger = els.ribbonShell.shadowRoot?.querySelector(\'[part="overflow"]\')');
    expect(html).toContain('!menu.contains(event.target) && !togglingRibbonOverflow');
    expect(html).toContain('--ktc-open-items-bar-height: 27px;');
    expect(html).toContain('--ktc-open-items-more-width: 26px;');
    expect(html).toContain('--ktc-open-items-close-width: 19px;');
    expect(html).toContain('--ktc-open-items-track-gap: 0;');
    expect(html).toContain('--ktc-open-items-activate-padding: 0 3px 0 6px;');

    expect(html).toContain('body {\n      width: 100%;\n      min-width: 0;\n      max-width: 100%;\n      overflow: hidden;');
    expect(html).toContain('.wrap { display: flex; width: 100%; min-width: 0; max-width: 100%; height: 100vh; flex-direction: column; padding: 0; overflow: hidden; }');
    expect(html).toContain('#primary-body { width: 100%; min-width: 0; min-height: 100%; padding: 0 0 8px; overflow: visible; }');
    expect(html).toContain('toolScrollPositions.set(state.activeToolId, els.currentToolRegion.contentScrollTop)');
    expect(html).toContain('els.currentToolRegion.contentScrollTop = top');
    expect(html).not.toContain('els.primaryBody.scrollTop');

    const primaryShellSource = readFileSync(new URL("../ui/KtcPrimaryShell.ts", import.meta.url), "utf8");
    const toolbarSource = readFileSync(new URL("../ui/KtcToolbarStrip.ts", import.meta.url), "utf8");
    const navigatorSource = readFileSync(new URL("../ui/KtcToolNavigator.ts", import.meta.url), "utf8");
    const currentToolSource = readFileSync(new URL("../ui/KtcCurrentToolRegion.ts", import.meta.url), "utf8");
    expect(primaryShellSource).toContain('grid-template-rows:auto auto minmax(0,1fr) auto; gap:0;');
    expect(toolbarSource).toContain('.toolbar.mode-compact');
    expect(toolbarSource.match(/overflow\.setAttribute\("part", "overflow"\)/gu)).toHaveLength(1);
    const compactNavigator = navigatorSource.match(/private renderCompact\(\): HTMLElement \{([\s\S]*?)\n  \}\n\n  private appendCompactTools/)?.[1];
    expect(compactNavigator).toBeTruthy();
    expect(compactNavigator).not.toContain('renderLegacyHeader');
    expect(currentToolSource).toContain('overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain;');
  });

  it("Welcome 和可选模块早退前始终刷新固定 Directory 投影", () => {
    const source = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    const renderStart = source.indexOf("    function render() {");
    const renderEnd = source.indexOf("    function escapeHtml", renderStart);
    const renderBody = source.slice(renderStart, renderEnd);
    const directoryRender = renderBody.indexOf("renderWorkingContext();");
    const welcomeReturn = renderBody.indexOf("if (welcomeMode) {");
    const externalModuleReturn = renderBody.indexOf("if (externalModuleBlock) {");

    expect(renderStart).toBeGreaterThan(-1);
    expect(renderEnd).toBeGreaterThan(renderStart);
    expect(directoryRender).toBeGreaterThan(-1);
    expect(directoryRender).toBeLessThan(welcomeReturn);
    expect(directoryRender).toBeLessThan(externalModuleReturn);
    expect(renderBody.match(/renderWorkingContext\(\);/gu)).toHaveLength(1);
  });

  it("代码辅助子工具活动时保留未固定的 Group 父按钮", () => {
    const source = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    const visibleToolsStart = source.indexOf("const visibleTools = moduleTools.filter((tool) => (");
    const visibleToolsEnd = source.indexOf("const group = document.createElement", visibleToolsStart);
    const visibleToolsProjection = source.slice(visibleToolsStart, visibleToolsEnd);

    expect(visibleToolsStart).toBeGreaterThan(-1);
    expect(visibleToolsEnd).toBeGreaterThan(visibleToolsStart);
    expect(source).toContain("collectCodeAssistantToolIds(codeAssistantNavigation);");
    expect(source).toContain("resolveGroupMruToolId(state.openToolIds || [], codeAssistantToolIds)");
    expect(source).toContain("state.codeAssistantTreeUiState?.treeExpanded !== false");
    expect(visibleToolsProjection).toContain('tool.kind === "group" && (codeAssistantGroupActive || codeAssistantGroupHasOpenTool)');
    expect(visibleToolsProjection).toContain("pinned.has(tool.id)");
    expect(visibleToolsProjection).toContain("tool.id === state.activeToolId");
  });

  it("Group MRU 只从已打开叶子 id 解析，不生成 Group 逻辑项", () => {
    const groupToolIds = new Set(["autoBuild", "encodingFix", "reorderMembers"]);
    expect(ktcResolveGroupMruToolId(
      ["projectRename", "encodingFix", "codeAssistant", "autoBuild"],
      groupToolIds,
    )).toBe("autoBuild");
    expect(ktcResolveGroupMruToolId(["projectRename", "codeAssistant"], groupToolIds)).toBeUndefined();
  });

  it("无关状态刷新不会重建 Toolbar 投影或打断已打开菜单焦点", () => {
    const source = readFileSync(new URL("./panelHtml.ts", import.meta.url), "utf8");
    const renderStart = source.indexOf("    function render() {");
    const renderEnd = source.indexOf("    function escapeHtml", renderStart);
    const renderBody = source.slice(renderStart, renderEnd);
    const toolbarShellSync = renderBody.indexOf("renderToolbarStrip();");
    const signatureGuard = renderBody.indexOf("if (nextToolbarProjectionSignature !== toolbarProjectionSignature) {");
    const tabsReset = renderBody.indexOf('els.tabs.innerHTML = "";');
    const overflowSync = renderBody.indexOf("syncToolbarOverflowMenu();");
    const toolbarProjectionStart = renderBody.indexOf("const toolbarProjection = {");
    const toolbarProjectionEnd = renderBody.indexOf("const nextToolbarProjectionSignature", toolbarProjectionStart);
    const toolbarProjection = renderBody.slice(toolbarProjectionStart, toolbarProjectionEnd);

    expect(source).toContain('let toolbarProjectionSignature = "";');
    expect(renderBody).toContain("const toolbarProjection = {");
    expect(renderBody).toContain("const nextToolbarProjectionSignature = JSON.stringify(toolbarProjection);");
    expect(toolbarProjection).not.toContain("toolStates");
    expect(toolbarProjection).not.toContain("workingContext");
    expect(toolbarShellSync).toBeGreaterThan(-1);
    expect(toolbarShellSync).toBeLessThan(signatureGuard);
    expect(signatureGuard).toBeGreaterThan(-1);
    expect(tabsReset).toBeGreaterThan(signatureGuard);
    expect(overflowSync).toBeGreaterThan(tabsReset);
    expect(renderBody.match(/els\.tabs\.innerHTML = "";/gu)).toHaveLength(1);
    expect(source).toContain('const more = document.querySelector(".module-more-global");');
    expect(source).toContain("if (more.open !== shouldOpen) more.open = shouldOpen;");
    expect(source).toContain("if (customization) customization.focusFirst();");
  });

  it("代码辅助 Primary 叶子直接使用 activeToolId，并由 Current Tool 组件按稳定 itemId 关闭", () => {
    const extensionUri = {
      path: "/extension",
      with(change: { path: string }) { return { ...this, ...change }; },
    } as unknown as Parameters<typeof getPanelHtml>[1];
    const html = getPanelHtml({
      cspSource: "test-webview",
      asWebviewUri(uri: { path: string }) { return `test-webview:${uri.path}`; },
    } as unknown as Parameters<typeof getPanelHtml>[0], extensionUri);

    expect(html).toContain('function currentContentToolId() {\n      return state.activeToolId;\n    }');
    expect(html).toContain('function isReorderMembersTool() {\n      return state.activeToolId === "reorderMembers";\n    }');
    for (const toolId of ["reorderMembers", "headerAscii", "encodingFix", "uuidReplace", "caaDialog"]) {
      expect(html).toContain(`"toolId":"${toolId}"`);
    }
    expect(html).toContain('function activateCodeAssistantNavigatorTool(toolId)');
    expect(html).toContain('vscode.postMessage({ type: "selectTool", toolId, source: "menu" })');

    expect(html).toContain('const openTool = (tool, source) => {');
    expect(html).toContain('vscode.postMessage({ type: "selectTool", toolId: tool.id, source })');
    expect(html).toContain('btn.onclick = () => openTool(t, "ribbon")');
    expect(html).toContain('openTool(selected, "menu")');

    expect(html).toContain('els.codeAssistantBlock.hidden = !reorder');
    expect(html).toContain('els.codeAssistantNavigator.hidden = !groupContentVisible');
    expect(html).toContain('els.codeAssistantNavigator.model = {');
    expect(html).toContain('els.codeAssistantReorderActions.hidden = !reorder');
    expect(html).toContain('els.codeAssistantReorderResults.hidden = !reorder');
    expect(html).toContain('if (reorder) renderCodeAssistantArea(reorderState, running)');
    expect(html).toContain('const genericActionFeature = enc || header || uuid || caaDialog');
    expect(html).toContain('els.codeAssistantGenericActions.hidden = !genericActionFeature');
    expect(html).toContain('els.generalActions.hidden = !genericActionFeature');

    expect(html).toContain('els.btnCodeAssistantReorderClose.hidden = true');
    expect(html).toContain('els.btnCodeAssistantGenericClose.hidden = true');
    expect(html).not.toContain('type: "closeCodeAssistantFeature"');
    expect(html.match(/vscode\.postMessage\(\{ type: "closeToolBlock" \}\)/gu) ?? []).toHaveLength(0);
    expect(html.match(/vscode\.postMessage\(\{ type: "closeToolBlock", toolId: detail\.itemId \}\)/gu)).toHaveLength(2);
    expect(html).toContain('toolId === "packageIncludes" || toolId === "autoBuild"');
    expect(html).toContain('type: "openCodeAssistantFeature", feature: toolId');
    expect(html).not.toContain('state.codeAssistantFeature = "packageIncludes"');
    expect(html).not.toContain('state.codeAssistantFeature = "autoBuild"');
    expect(html).toContain('if (tool.kind === "group") {');
    expect(html).toContain('state.codeAssistantTreeUiState.treeExpanded = !isCodeAssistantGroupActive()');
    expect(html).toContain('vscode.postMessage({ type: "activateOpenTool", toolId: groupMruToolId })');

    // Legacy Host snapshots are accepted, but no render predicate reads this field.
    expect(html.match(/state\.codeAssistantFeature = msg\.codeAssistantFeature \|\| ""/gu)).toHaveLength(2);
    expect(html.match(/state\.codeAssistantFeature/gu)).toHaveLength(2);
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
    const base = { running: false, search: "", replace: "", text: true, file: false, dir: false };
    expect(ktcSearchReplaceButtonState({ ...base, action: "search" })).toEqual({
      disabled: true,
      busy: false,
      message: "请输入搜索内容。",
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
    const codeRenameTool = readFileSync(new URL("../tools/codeRename/index.ts", import.meta.url), "utf8");
    expect(source).toContain('id="btn-replace-toggle"');
    expect(source).toContain('id="btn-project-rename-analysis"');
    expect(source).toContain('type: "openProjectRenameAnalysis"');
    expect(codeRenameTool).toContain('executeCommand("ktAutoCode.projectRenameAnalysis.open", {');
    expect(codeRenameTool).toContain('ktcResolveSearchReplaceLocation(getWorkspaceRoot(), message.scope)');
    expect(codeRenameTool).not.toContain('ktcResolveSearchReplaceLocation(ctx.workspaceRoot, message.scope)');
    expect(codeRenameTool).toContain('sourceName: message.sourceName');
    expect(codeRenameTool).toContain('targetName: message.targetName');
    expect(source).toContain('>搜索</button>');
    expect(source).toContain('class="replace-query-row replace-only"');
    expect(source).toContain('<div id="replace-details">');
    expect(source).not.toContain('<div class="replace-only" id="replace-details">');
    expect(source).toContain('state.replace.collapsed = !state.replace.collapsed');
    expect(source).toContain('els.compactTools.hidden = !caaDialog');
    expect(source).not.toContain('els.compactTools.hidden = !(rename || uuid || caaDialog)');
  });

  it("Primary 常用变形显式派生大驼峰、小写、全大写、空格和 Web 分隔符", () => {
    expect(ktcSimpleRenameRules("PhoenixOpenIssue", "PhoenixIssue")).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "大驼峰", search: "PhoenixOpenIssue", replace: "PhoenixIssue" }),
      expect.objectContaining({ label: "小写", search: "phoenixopenissue", replace: "phoenixissue" }),
      expect.objectContaining({ label: "全大写", search: "PHOENIXOPENISSUE", replace: "PHOENIXISSUE" }),
      expect.objectContaining({ label: "空格", search: "phoenix open issue", replace: "phoenix issue" }),
      expect.objectContaining({ label: "短横线", search: "phoenix-open-issue", replace: "phoenix-issue" }),
      expect.objectContaining({ label: "下划线", search: "phoenix_open_issue", replace: "phoenix_issue" }),
    ]));
  });

  it("只贡献一个自动高度 View，并在内部提供目录与工具区域两段外壳", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      contributes: {
        viewsContainers?: { activitybar?: Array<{ id: string; title?: string }> };
        views: Record<string, Array<{ id: string; name?: string; type?: string; initialSize?: number; when?: string }>>;
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
    expect(manifest.contributes.viewsContainers?.activitybar?.[0]?.title).toBe("KT Auto Code");
    expect(manifest.contributes.views["kt-auto-code"]?.[0]).toMatchObject({
      id: "ktAutoCode.modulePanel",
      name: "KT Auto Code",
      type: "webview",
    });
    expect(manifest.contributes.views["kt-auto-code"]?.[0]?.when).toBeUndefined();
    expect(manifest.contributes.menus["view/item/context"]).toBeUndefined();
    expect(manifest.contributes.commands.find((command) => command.command === "ktAutoCode.codeAssistant.autoBuild")?.title).toBe("KT Auto Code：编译工具（Windows PowerShell 5.1）");
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
    expect(manifest.contributes.submenus).toBeUndefined();
    expect(manifest.contributes.menus["view/title"]).not.toContainEqual(expect.objectContaining({
      command: "ktAutoCode.ribbon.customize",
    }));
    expect(manifest.contributes.menus["view/title"]).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ command: "ktAutoCode.module.code.show" }),
      expect.objectContaining({ command: "ktAutoCode.module.code.hide" }),
      expect.objectContaining({ command: "ktAutoCode.sidebar.toggleStyle" }),
    ]));
    expect(manifest.contributes.menus["view/title"]).toEqual([
      {
        command: "ktAutoCode.directory.hide",
        when: "view == ktAutoCode.modulePanel && ktAutoCode.modulePanel.directoryVisible",
        group: "navigation@5",
      },
      {
        command: "ktAutoCode.directory.show",
        when: "view == ktAutoCode.modulePanel && !ktAutoCode.modulePanel.directoryVisible",
        group: "navigation@5",
      },
      {
        command: "ktAutoCode.ignore.openAdvanced",
        when: "view == ktAutoCode.modulePanel",
        group: "navigation@10",
      },
      {
        command: "ktAutoCode.environment.open",
        when: "view == ktAutoCode.modulePanel",
        group: "navigation@20",
      },
    ]);
    expect(manifest.contributes.menus["view/title"]).not.toContainEqual(expect.objectContaining({
      command: "ktAutoCode.searchReplace.preview",
    }));
    expect(manifest.contributes.menus["view/title"]).not.toContainEqual(expect.objectContaining({
      command: "ktAutoCode.modulePanel.close",
    }));
    expect(manifest.contributes.menus["ktAutoCode.modulePanel.more"]).toBeUndefined();
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
    expect(manifest.contributes.configuration.properties["ktAutoCode.sidebar.blockExpansionMode"]).toMatchObject({
      enumDescriptions: [
        "结果 Accordion 排他展开：仅保留最近激活的结果视图",
        "结果 Accordion 可同时保持多个结果视图展开",
      ],
      description: "仅控制结果 Accordion 参与视图之间的展开协调，不影响 Primary 的两区 Shell、Ribbon 或单个 Tool Surface 结构。",
    });
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
