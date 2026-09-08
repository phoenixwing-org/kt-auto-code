import type * as vscode from "vscode";
import type {
  ToolSummary,
  ToolUiState,
  WebviewOutboundMessage,
} from "../tools/types.js";
import {
  KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS,
  type KtcEditorPrimaryCompanionSnapshot,
} from "../core/editorPrimaryCompanionContracts.js";
import { ktcGitRepositoryOptionLabels, type KtcGitViewModel } from "../core/git/KtcGitModel.js";
import { ktcCreateWebviewSecurity } from "../webviewSupport.js";
import { KtcCompactManagerLabelStyle } from "../ui/KtcCompactManagerLabel.js";
import { KTC_CODE_ASSISTANT_NAVIGATION } from "../tools/codeAssistant/navigation.js";

export function ktcSearchReplaceButtonState(input: {
  readonly action: "search" | "replace";
  readonly running: boolean;
  readonly search: string;
  readonly replace: string;
  readonly text: boolean;
  readonly file: boolean;
  readonly dir: boolean;
}): { disabled: boolean; busy: boolean; message: string } {
  if (input.running) return { disabled: true, busy: true, message: "" };
  if (!input.text && !input.file && !input.dir) {
    return { disabled: true, busy: false, message: "请至少选择文本、文件名或文件夹名中的一项。" };
  }
  if (input.search.length === 0) {
    return { disabled: true, busy: false, message: "请输入搜索内容。" };
  }
  if (input.action === "replace" && input.replace.length === 0) {
    return { disabled: true, busy: false, message: "请输入替换内容后再替换。" };
  }
  return { disabled: false, busy: false, message: "" };
}

export function ktcEditorCompanionStatusText(
  model: Pick<KtcEditorPrimaryCompanionSnapshot, "lifecycle" | "message" | "ready">,
): string {
  if (model.message) return model.message;
  if (model.lifecycle === "disposed") return "右侧 View 已关闭；可从原入口启动新的任务。";
  return model.ready ? "任务已连接。" : "右侧 View 正在初始化…";
}

/** Returns the most recently used open leaf belonging to one navigation Group. */
export function ktcResolveGroupMruToolId(
  openToolIds: readonly string[],
  groupToolIds: ReadonlySet<string>,
): string | undefined {
  for (let index = openToolIds.length - 1; index >= 0; index -= 1) {
    const toolId = openToolIds[index];
    if (toolId && groupToolIds.has(toolId)) return toolId;
  }
  return undefined;
}

/** Primary 的轻量常用变形；复杂前缀、CAA 规则与规则档案只在项目改名 View 中编辑。 */
export function ktcSimpleRenameRules(sourceName: string, targetName: string): readonly {
  id: string;
  label: string;
  search: string;
  replace: string;
  enabled: true;
}[] {
  const tokens = (value: string): string[] => value.trim()
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .split(/[\s._-]+/gu)
    .filter(Boolean)
    .map((token) => token.toLocaleLowerCase("en-US"));
  const source = tokens(sourceName);
  const target = tokens(targetName);
  if (source.length === 0 || target.length === 0) return [];
  const pascal = (items: readonly string[]) => items
    .map((token) => `${token.slice(0, 1).toLocaleUpperCase("en-US")}${token.slice(1)}`)
    .join("");
  const candidates = [
    { id: "simple-pascal", label: "大驼峰", search: pascal(source), replace: pascal(target) },
    { id: "simple-lower", label: "小写", search: source.join(""), replace: target.join("") },
    { id: "simple-upper", label: "全大写", search: source.join("").toLocaleUpperCase("en-US"), replace: target.join("").toLocaleUpperCase("en-US") },
    { id: "simple-space", label: "空格", search: source.join(" "), replace: target.join(" ") },
    { id: "simple-kebab", label: "短横线", search: source.join("-"), replace: target.join("-") },
    { id: "simple-snake", label: "下划线", search: source.join("_"), replace: target.join("_") },
  ];
  const seen = new Set<string>();
  return candidates.flatMap((rule) => {
    if (!rule.search || !rule.replace || rule.search === rule.replace || seen.has(rule.search)) return [];
    seen.add(rule.search);
    return [{ ...rule, enabled: true as const }];
  });
}

/**
 * The Git component must always receive a renderable model. A missing tool
 * state is a Host/Webview bootstrap condition, not a reason to leave the
 * component on its internal loading placeholder.
 */
export function ktcGitPanelModel(
  toolState: Pick<ToolUiState, "git"> | undefined,
  workspaceAvailable: boolean,
): KtcGitViewModel {
  return toolState?.git ?? {
    projects: [],
    statusText: "当前工作区未发现 Git 仓库。",
    recentCommitLimit: 1,
    workspaceFolderCount: workspaceAvailable ? 1 : 0,
    workspaceRepositoryCount: 0,
    discovery: { status: "idle", scannedDirectories: 0, foundRepositories: 0 },
  };
}

/**
 * Shared inner operation Block for Code Assistant leaves. The legacy close
 * control stays in this reusable markup, but direct Primary leaves hide it and
 * use the single Tool Surface floating close/MRU path.
 */
export function ktcCodeAssistantFeatureBlock(input: {
  readonly id: string;
  readonly titleId?: string;
  readonly title: string;
  readonly closeId: string;
  readonly closeTitle: string;
  readonly closeAriaLabel: string;
  readonly body: string;
  readonly hidden?: boolean;
}): string {
  const title = input.titleId
    ? `<span id="${input.titleId}">${input.title}</span>`
    : `<span>${input.title}</span>`;
  return `<details class="code-assistant-feature" id="${input.id}" open${input.hidden ? " hidden" : ""}>
        <summary>${title}<button class="code-assistant-feature-close" id="${input.closeId}" type="button" title="${input.closeTitle}" aria-label="${input.closeAriaLabel}">×</button></summary>
        ${input.body}
      </details>`;
}

export function getPanelHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const { nonce, csp } = ktcCreateWebviewSecurity(webview, { allowImages: true });
  const basePath = extensionUri.path.replace(/\/$/, "");
  const codegenPrimaryPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/codegen-primary-panel.js` }),
  );
  const runPrimaryPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-run-primary-panel.js` }),
  );
  const gitPrimaryPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-git-primary-panel.js` }),
  );
  const ignorePrimaryPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-ignore-primary-panel.js` }),
  );
  const autoBuildPrimaryPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-auto-build-primary-panel.js` }),
  );
  const reorderMembersPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/reorder-members-panel.js` }),
  );
  const uuidResultsPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/uuid-results-panel.js` }),
  );
  const renameResultsPanelUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/rename-results-panel.js` }),
  );
  const ribbonCustomizationMenuUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ribbon-customization-menu.js` }),
  );
  const toolNavigatorUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-tool-navigator.js` }),
  );
  const primaryShellUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-primary-shell.js` }),
  );
  const directoryBarUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-directory-bar.js` }),
  );
  const toolbarStripUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-toolbar-strip.js` }),
  );
  const currentToolRegionUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-current-tool-region.js` }),
  );
  const openItemsBarUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/ktc-open-items-bar.js` }),
  );
  const pnwComboUri = webview.asWebviewUri(
    extensionUri.with({ path: `${basePath}/dist/pnw-combo.js` }),
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KT Auto Code</title>
  <style>
    ${KtcCompactManagerLabelStyle}
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }
    html, body { height: 100%; }
    body {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0;
      margin: 0;
    }
    body.vscode-light,
    body.vscode-high-contrast-light { color-scheme: light; }
    body.vscode-dark,
    body.vscode-high-contrast { color-scheme: dark; }
    body.vscode-high-contrast,
    body.vscode-high-contrast-light {
      --ktc-ui-border: var(--vscode-contrastBorder, var(--vscode-focusBorder));
      --ktc-ui-active-border: var(--vscode-contrastActiveBorder, var(--vscode-focusBorder));
    }
    body.detail-block #tabs { display: flex; }
    body.detail-block .desc { display: none; }
    body.detail-block .meta { margin: 0 0 8px; }
    body.external-module-block #primary-body > :not(#module-block) { display: none !important; }
    body.welcome-mode #primary-body > :not(#welcome-panel) { display: none !important; }
    .wrap { display: flex; width: 100%; min-width: 0; max-width: 100%; height: 100vh; flex-direction: column; padding: 0; overflow: hidden; }
    .wrap > * { min-width: 0; max-width: 100%; }
    ktc-primary-shell,
    ktc-directory-bar,
    ktc-toolbar-strip,
    ktc-current-tool-region,
    ktc-open-items-bar { display: block; width: 100%; min-width: 0; }
    ktc-primary-shell { height: 100%; min-height: 0; flex: 1 1 auto; }
    ktc-current-tool-region { height: 100%; min-height: 0; }
    #open-items-bar {
      align-self: end;
      margin: 0;
      --ktc-open-items-bar-height: 27px;
      --ktc-open-items-more-width: 26px;
      --ktc-open-items-close-width: 19px;
      --ktc-open-items-track-gap: 0;
      --ktc-open-items-activate-gap: 4px;
      --ktc-open-items-activate-padding: 0 3px 0 6px;
    }
    /* Current Tool 的 Shadow Body 是唯一主纵向滚动边界；内部功能只保留满宽内容。 */
    #primary-body { width: 100%; min-width: 0; min-height: 100%; padding: 0 0 8px; overflow: visible; }
    #primary-body > .welcome-panel { padding: 8px 10px 10px; }
    ktc-codegen-primary-panel,
    ktc-git-primary-panel,
    ktc-run-primary-panel,
    ktc-auto-build-primary-panel { display: block; width: 100%; min-width: 0; max-width: 100%; overflow-x: hidden; }
    body.codegen-tool .wrap { padding-inline: 0; }
    body.run-tool .wrap { padding-inline: 0; }
    body.run-tool .meta { margin: 4px 5px 5px; }
    body.git-tool .wrap { padding-inline: 0; }
    body.git-tool .meta { margin: 4px 5px 5px; }
    .git-repository-action { display: inline-grid; width: 27px; height: 27px; flex: 0 0 27px; place-items: center; padding: 0; border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); border-radius: 3px; color: var(--vscode-foreground); background: var(--vscode-button-secondaryBackground, transparent); cursor: pointer; font-size: 17px; }
    .git-repository-action:hover { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); }
    .git-repository-action:disabled { opacity: .48; cursor: not-allowed; }
    .tabs {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 8px;
    }
    .settings-block { margin: 0; }
    .settings-section { width: 100%; margin: 0; border-block-end: 1px solid var(--vscode-panel-border); }
    .settings-section > summary { display: flex; width: 100%; min-height: 28px; align-items: center; gap: 2px; padding: 0 5px; color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground)); background: var(--vscode-sideBarSectionHeader-background, transparent); cursor: pointer; font-size: var(--vscode-font-size); font-weight: 600; list-style: none; }
    .settings-section > summary::-webkit-details-marker { display: none; }
    .settings-section-chevron { width: 16px; height: 16px; flex: 0 0 16px; color: currentColor; transform: rotate(-90deg); transform-origin: center; transition: transform .1s ease; }
    .settings-section-chevron path { fill: currentColor; }
    .settings-section[open] .settings-section-chevron { transform: rotate(0deg); }
    .settings-section-body { padding: 5px 8px 8px; }
    .settings-tree { padding: 2px 0 4px 21px; }
    .settings-tree-row { display: flex; width: 100%; min-height: 28px; align-items: center; gap: 6px; padding: 2px 8px; border: 0; color: var(--vscode-foreground); background: transparent; font: inherit; text-align: left; cursor: pointer; }
    .settings-tree-row:hover { background: var(--vscode-list-hoverBackground); }
    .settings-tree-row:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
    .settings-tree-row svg { width: 16px; height: 16px; flex: 0 0 16px; fill: currentColor; }
    .plugin-setting-values { display: grid; min-width: 0; }
    .plugin-setting-row { display: grid; grid-template-columns: minmax(110px, 0.8fr) minmax(0, 1.2fr); align-items: center; gap: 8px; min-height: 27px; padding: 2px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .plugin-setting-name, .plugin-setting-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .plugin-setting-name { font-weight: 600; }
    .plugin-setting-value { color: var(--vscode-descriptionForeground); }
    .settings-section-count { margin-left: auto; color: var(--vscode-descriptionForeground); font-weight: 400; }
    .tabs.ribbon {
      display: flex;
      width: 100%;
      min-width: 0;
      flex-wrap: var(--ktc-ribbon-wrap, wrap);
      justify-content: start;
      align-items: stretch;
      gap: 2px;
      margin: 0;
      padding: 5px 4px;
      overflow: hidden;
      border: 0;
    }
    .module-group,
    .module-group-tools { display: contents; }
    .module-group-label { display: flex; min-width: var(--ktc-ribbon-module-min-width, 18px); flex: 0 0 var(--ktc-ribbon-module-min-width, 18px); align-items: center; justify-content: center; min-height: var(--ktc-ribbon-item-height, 58px); border-right: 1px solid var(--vscode-focusBorder); color: var(--vscode-focusBorder); font-size: var(--ktc-ribbon-module-font-size, 10px); font-weight: 600; letter-spacing: var(--ktc-ribbon-module-letter-spacing, 1px); line-height: 1; writing-mode: var(--ktc-ribbon-module-writing-mode, vertical-rl); }
    .module-group-label.active { color: var(--vscode-textLink-foreground); border-right-color: var(--vscode-textLink-foreground); }
    .module-more { position: relative; flex: 0 0 auto; }
    .module-more > summary {
      display: grid;
      width: 30px;
      min-height: 50px;
      place-items: center;
      border: 1px solid var(--ktc-ui-border, transparent);
      border-radius: 3px;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
      font-size: 18px;
      list-style: none;
    }
    .module-more > summary::-webkit-details-marker { display: none; }
    .module-more > summary:hover,
    .module-more[open] > summary { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-toolbar-hoverBackground); }
    .module-more-global { width: 0; flex: 0 0 0; }
    .module-more-global > summary { display: none; }
    .module-more-menu {
      position: fixed;
      z-index: 100;
      top: 0;
      left: 0;
      width: min(280px, calc(100vw - 12px));
      max-height: min(420px, calc(100vh - 12px));
      overflow-y: auto;
      padding: 4px;
      border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border));
      border-radius: 4px;
      background: var(--vscode-menu-background, var(--vscode-dropdown-background));
      box-shadow: 0 3px 12px var(--vscode-widget-shadow, rgba(0, 0, 0, .35));
    }
    .tab {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border: 1px solid var(--ktc-ui-border, transparent);
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-size: 12px;
    }
    .tab:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, transparent)); }
    .tab[data-tooltip]::after {
      position: absolute;
      z-index: 20;
      top: calc(100% + 5px);
      left: 50%;
      width: max-content;
      max-width: min(240px, calc(100vw - 24px));
      padding: 4px 7px;
      border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border));
      border-radius: 3px;
      color: var(--vscode-editorHoverWidget-foreground, var(--vscode-foreground));
      background: var(--vscode-editorHoverWidget-background, var(--vscode-sideBar-background));
      box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, .25));
      content: attr(data-tooltip);
      font-size: 11px;
      line-height: 1.35;
      opacity: 0;
      pointer-events: none;
      transform: translateX(-50%);
      transition: opacity .1s ease;
      white-space: nowrap;
    }
    .tab[data-tooltip]:hover::after,
    .tab[data-tooltip]:focus-visible::after { opacity: 1; }
    .tab.active {
      background: var(--vscode-button-secondaryBackground);
      border-color: var(--vscode-button-border);
    }
    .tab.open:not(.active) {
      color: var(--vscode-textLink-foreground);
      background: var(--vscode-list-inactiveSelectionBackground, var(--vscode-button-secondaryBackground));
      box-shadow: inset 0 -2px var(--vscode-textLink-foreground);
    }
    .tabs.ribbon .tab {
      width: var(--ktc-ribbon-item-width, 68px);
      min-width: var(--ktc-ribbon-item-min-width, 46px);
      height: var(--ktc-ribbon-item-height, 58px);
      min-height: var(--ktc-ribbon-item-height, 58px);
      flex: 0 0 var(--ktc-ribbon-item-flex-basis, 68px);
      flex-direction: column;
      justify-content: center;
      padding: 4px 5px 3px;
      gap: 3px;
      overflow: hidden;
      border: 0;
      border-bottom: 2px solid transparent;
      border-radius: 3px 3px 0 0;
      line-height: 1.1;
      text-align: center;
    }
    .tabs.ribbon .tab[draggable="true"] { cursor: grab; }
    .tabs.ribbon .tab.dragging { opacity: .45; }
    .tabs.ribbon .tab.drag-target { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .tabs.ribbon .tab > .ribbon-tool-label {
      display: var(--ktc-ribbon-label-display, block);
      max-width: 100%;
      overflow: hidden;
      font-size: 11px;
      line-height: 1.15;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tabs.ribbon .tab[data-node-kind="group"] .ribbon-group-chevron {
      position: absolute;
      right: var(--ktc-ribbon-group-chevron-right, 3px);
      bottom: var(--ktc-ribbon-group-chevron-bottom, 3px);
      display: block;
      width: var(--ktc-ribbon-group-chevron-size, 9px);
      height: var(--ktc-ribbon-group-chevron-size, 9px);
      color: currentColor;
      transform: rotate(0deg);
    }
    .tabs.ribbon .tab[data-node-kind="group"][aria-expanded="false"] .ribbon-group-chevron { transform: rotate(-90deg); }
    .ribbon-group-chevron path { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
    .tabs.ribbon .tab.active {
      color: var(--vscode-list-activeSelectionForeground);
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .tabs.ribbon .tool-icon,
    .tabs.ribbon .tool-icon-fallback { width: var(--ktc-ribbon-icon-size, 22px); height: var(--ktc-ribbon-icon-size, 22px); flex-basis: var(--ktc-ribbon-icon-size, 22px); }
    .module-block { font-size: 12px; }
    .module-block .block-header { padding-bottom: 10px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-sideBarSectionHeader-border)); }
    .module-block .block-header-row { display: flex; align-items: flex-start; gap: 8px; }
    .module-block .block-header-main { flex: 1 1 auto; min-width: 0; }
    .module-block .block-header-actions { display: flex; flex: 0 0 auto; gap: 3px; }
    .module-block .block-header-action { min-width: 26px; height: 26px; padding: 0 6px; border: 1px solid var(--ktc-ui-border, transparent); border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; }
    .module-block .block-header-action:hover { background: var(--vscode-toolbar-hoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, transparent)); }
    .module-block h2 { margin: 0 0 5px; font-size: 14px; }
    .module-block h3 { margin: 0 0 6px; font-size: 12px; }
    .module-block p { margin: 0; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.5; }
    .module-block .state { display: inline-block; margin-bottom: 8px; padding: 2px 6px; border: 1px solid var(--ktc-ui-border, transparent); border-radius: 3px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); font-size: 11px; }
    .module-block .state.warning { color: var(--vscode-editorWarning-foreground); background: var(--vscode-inputValidation-warningBackground, var(--vscode-badge-background)); }
    .module-block .state.success { color: var(--vscode-testing-iconPassed, var(--vscode-badge-foreground)); }
    .module-block section { margin-top: 12px; padding: 10px; border: 1px solid var(--ktc-ui-border, var(--vscode-widget-border)); border-radius: 5px; background: var(--vscode-sideBarSectionHeader-background); }
    .module-block ul { margin: 7px 0 0; padding-left: 18px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.55; }
    .module-block .notice { margin-top: 12px; padding: 9px 10px; border-left: 3px solid var(--vscode-textLink-foreground); background: var(--vscode-textBlockQuote-background); }
    .module-block .notice strong { display: block; margin-bottom: 3px; font-size: 12px; }
    .module-block .notice.warning { border-left-color: var(--vscode-editorWarning-foreground); }
    .module-block .notice.success { border-left-color: var(--vscode-testing-iconPassed); }
    .module-block .notice-detail { margin-top: 5px; }
    .welcome-panel { display: flex; min-height: 100%; flex: 1 1 auto; flex-direction: column; }
    .welcome-brand { display: flex; align-items: center; gap: 10px; padding: 2px 0 15px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-sideBarSectionHeader-border)); }
    .welcome-mark { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border: 1px solid var(--ktc-ui-active-border, var(--vscode-focusBorder)); border-radius: 7px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font-size: 20px; font-weight: 700; }
    .welcome-brand-copy { min-width: 0; }
    .welcome-brand-name { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: .5px; }
    .welcome-brand-product { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .welcome-intro { margin: 14px 0 18px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.5; }
    .welcome-section-title { margin: 0; padding-bottom: 6px; color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground)); font-size: 11px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; }
    .welcome-products { border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
    .welcome-product { display: grid; min-width: 0; grid-template-columns: 46px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 9px 0; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
    .welcome-product-icon { display: grid; width: 46px; height: 28px; place-items: center; border: 1px solid var(--ktc-ui-border, var(--vscode-contrastBorder, var(--vscode-panel-border))); border-radius: 4px; color: var(--vscode-textLink-foreground); font-size: 10px; font-weight: 700; letter-spacing: .3px; white-space: nowrap; }
    .welcome-product-main { min-width: 0; }
    .welcome-product-title { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .welcome-product-meta { margin-top: 2px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .welcome-product-status { display: flex; align-items: center; gap: 6px; }
    .welcome-status { padding: 1px 5px; border: 1px solid var(--ktc-ui-border, var(--vscode-badge-background)); border-radius: 9px; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); font-size: 10px; white-space: nowrap; }
    .welcome-status.missing { color: var(--vscode-descriptionForeground); background: transparent; }
    .welcome-install { padding: 2px 7px; border: 1px solid var(--ktc-ui-border, var(--vscode-button-border, transparent)); border-radius: 3px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); cursor: pointer; font-size: 11px; }
    .welcome-install:hover { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-button-hoverBackground); }
    .welcome-footer { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: auto; padding-top: 18px; border-top: 1px solid var(--ktc-ui-border, var(--vscode-sideBarSectionHeader-border)); }
    .welcome-link { padding: 2px 0; border: 0; border-bottom: 1px solid transparent; color: var(--vscode-textLink-foreground); background: transparent; cursor: pointer; font: inherit; font-size: 11px; }
    .welcome-link:hover { border-bottom-color: currentColor; color: var(--vscode-textLink-activeForeground); }
    .tab:disabled { opacity: 0.45; cursor: default; }
    .tool-icon {
      width: 15px;
      height: 15px;
      flex: 0 0 15px;
      background: currentColor;
      mask: var(--tool-icon) center / contain no-repeat;
      -webkit-mask: var(--tool-icon) center / contain no-repeat;
    }
    .tool-icon-fallback {
      display: grid;
      width: 15px;
      height: 15px;
      flex: 0 0 15px;
      place-items: center;
      border: 1px solid currentColor;
      border-radius: 3px;
      font-size: 9px;
      font-weight: 700;
      line-height: 1;
    }
    h2 {
      font-size: 13px;
      font-weight: 600;
      margin: 0 0 6px;
    }
    .title-row { display: none; }
    .title-row h2 { margin-bottom: 6px; }
    .desc {
      font-size: 12px;
      line-height: 1.4;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 12px;
    }
    .replace-block { margin: 2px 0 6px; }
    .compact-tools { display: flex; justify-content: flex-end; gap: 8px; margin: -4px 0 8px; }
    .uuid-options {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 5px 8px;
      margin: -2px 0 8px;
      font-size: 12px;
    }
    .uuid-options select {
      min-width: 0;
      height: 28px;
      padding: 0 6px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    .uuid-options .hint { grid-column: 1 / -1; margin: 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .uuid-options .hint.warning { color: var(--vscode-editorWarning-foreground); }
    .caa-connection { display: flex; align-items: center; gap: 6px; margin: 2px 0 8px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .caa-connection.online { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
    .caa-connection.offline, .caa-connection.incompatible { color: var(--vscode-errorForeground); }
    .compact-results { margin-top: 4px; }
    .compact-group { border-top: 1px solid var(--vscode-panel-border); }
    .compact-group:first-child { border-top: 0; }
    .compact-group-header { display: flex; align-items: center; gap: 5px; min-height: 29px; font-weight: 600; }
    .compact-group-header .detail { margin-left: auto; font-weight: 400; }
    .compact-list { list-style: none; padding: 0 0 0 18px; margin: 0; }
    .compact-file-row { display: flex; align-items: center; gap: 5px; min-width: 0; min-height: 28px; padding: 2px 3px; }
    .compact-file-row:hover { background: var(--vscode-list-hoverBackground); }
    .compact-kind { flex: 0 0 22px; color: var(--vscode-symbolIcon-classForeground, var(--vscode-foreground)); font-weight: 600; font-size: 10px; text-align: center; }
    .compact-file-main { cursor: pointer; }
    .compact-inline { display: flex; flex: 0 0 auto; opacity: 0; }
    .compact-file-row:hover .compact-inline, .compact-inline:focus-within { opacity: 1; }
    .compact-icon { width: 24px; height: 24px; padding: 0; border: 1px solid var(--ktc-ui-border, transparent); border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; font-size: 15px; line-height: 22px; }
    .compact-icon:hover { background: var(--vscode-toolbar-hoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, transparent)); }
    .compact-state { flex: 0 0 auto; max-width: 86px; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .compact-state.error, .compact-state.blocked { color: var(--vscode-errorForeground); }
    .compact-state.applied, .compact-state.ok { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
    .compact-subtext { padding: 1px 4px 5px 49px; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.35; }
    .compact-rules { margin: 0; padding: 0 4px 6px 49px; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.45; }
    mark.result-hit { padding: 0 1px; color: inherit; background: var(--vscode-editor-findMatchBackground, rgba(234, 201, 58, .5)); outline: 1px solid var(--vscode-editor-findMatchBorder, transparent); border-radius: 1px; }
    .environment-block { margin: 0; }
    .environment-actions { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; margin-bottom: 9px; }
    .environment-values { border-top: 1px solid var(--vscode-panel-border); }
    .environment-row { display: grid; grid-template-columns: minmax(105px, 180px) minmax(72px, 1fr) auto; align-items: center; gap: 7px; min-height: 36px; padding: 4px 2px; border-bottom: 1px solid var(--vscode-panel-border); }
    .environment-row.environment-empty { display: block; min-height: 0; }
    .environment-row-head { display: flex; align-items: center; gap: 4px; min-width: 0; margin: 0; overflow: hidden; white-space: nowrap; }
    .environment-name { min-width: 0; overflow: hidden; font-family: var(--vscode-editor-font-family); font-weight: 600; text-overflow: ellipsis; }
    .environment-required { flex: 0 0 auto; color: var(--vscode-errorForeground); font-size: 12px; font-weight: 700; }
    .environment-source { flex: 0 0 auto; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .environment-source.ready { color: var(--vscode-testing-iconPassed, var(--vscode-descriptionForeground)); }
    .environment-value { display: block; width: 100%; min-width: 0; height: 28px; overflow: hidden; padding: 4px 6px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); outline: none; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font-family: var(--vscode-editor-font-family); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
    .environment-value:focus { border-color: var(--vscode-focusBorder); }
    .environment-value.missing { color: var(--vscode-descriptionForeground); font-style: italic; }
    .environment-row-body { display: contents; }
    .environment-row-actions { display: flex; justify-content: flex-end; gap: 2px; margin: 0; white-space: nowrap; }
    .environment-icon-button { display: none; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; }
    .environment-save-button, .environment-row:hover .environment-icon-button, .environment-row:focus-within .environment-icon-button { display: inline-flex; }
    .environment-icon-button:hover { background: var(--vscode-toolbar-hoverBackground); }
    .environment-icon-button:disabled { opacity: .35; cursor: default; }
    .environment-icon-button svg { width: 16px; height: 16px; fill: currentColor; }
    .environment-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.35; }
    .replace-fields { display: grid; gap: 5px; }
    .replace-fields input[type="text"], .replace-fields select, .replace-query-row input {
      width: 100%;
      height: 30px;
      padding: 4px 8px;
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 2px;
      outline: none;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      font-family: var(--vscode-editor-font-family);
    }
    .replace-fields input[type="text"]:focus, .replace-fields select:focus, .replace-query-row input:focus { border-color: var(--vscode-focusBorder); }
    .replace-query-shell { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 3px 5px; }
    .replace-query-toggle {
      grid-row: 1 / span 2;
      width: 26px;
      min-height: 26px;
      padding: 0;
      border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border));
      border-radius: 3px;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
      font-size: 17px;
    }
    .replace-query-toggle:hover { background: var(--vscode-toolbar-hoverBackground); border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); }
    .replace-query-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px; min-width: 0; }
    .replace-query-row input { min-width: 0; height: 26px; padding: 2px 7px; font-size: var(--vscode-font-size); }
    .replace-query-action { min-width: 50px; }
    .replace-query-action .action { min-height: 26px; padding: 2px 9px; }
    .replace-block.collapsed .replace-query-toggle { grid-row: 1; }
    .replace-block.collapsed .replace-only { display: none; }
    .replace-options { display: flex; flex-wrap: wrap; gap: 5px 12px; margin: 6px 0; }
    .replace-options label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
    .replace-ignore-summary { display: grid; gap: 5px; margin-top: 5px; padding: 5px 0 7px; border-top: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
    .replace-ignore-header { display: flex; min-width: 0; min-height: 26px; align-items: center; gap: 5px; }
    .replace-ignore-state { min-width: 0; color: var(--vscode-descriptionForeground); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .replace-ignore-header .action:first-of-type { margin-left: auto; }
    .replace-ignore-sources { display: flex; flex-wrap: wrap; gap: 5px 12px; }
    .replace-ignore-sources label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; }
    .replace-ignore-hint { margin: 0; color: var(--vscode-descriptionForeground); font-size: 10px; line-height: 1.35; }
    .replace-helpers { display: flex; min-width: 0; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
    .replace-history-control { display: block; min-width: 170px; flex: 1 1 190px; }
    .replace-history-control pnw-combo { width: 100%; }
    .replace-variant-toggle {
      min-height: 26px;
      padding: 2px 8px;
      border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      background: var(--vscode-button-secondaryBackground, transparent);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      white-space: nowrap;
    }
    .replace-variant-toggle:hover,
    .replace-variant-toggle[aria-expanded="true"] { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
    .replace-variant-toggle:disabled { opacity: .45; cursor: default; }
    #btn-project-rename-analysis {
      border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder));
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      font-weight: 650;
    }
    #btn-project-rename-analysis:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .replace-variant-block { margin-top: 5px; border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
    .replace-variant-block-header { padding: 3px 5px; border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); color: var(--vscode-descriptionForeground); background: var(--vscode-sideBarSectionHeader-background, transparent); font-size: 10px; }
    .replace-variant-list { padding: 2px 4px; }
    .replace-variant-row { display: grid; min-width: 0; grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr) 18px 18px 18px; align-items: center; gap: 3px; min-height: 27px; }
    .replace-variant-check { margin: 0; }
    .replace-variant-input { width: 100%; min-width: 0; height: 22px; padding: 1px 4px; border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; outline: 0; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font-family: var(--vscode-editor-font-family); font-size: 10px; }
    .replace-variant-input:focus { border-color: var(--vscode-focusBorder); }
    .replace-variant-action { display: inline-flex; width: 18px; height: 22px; align-items: center; justify-content: center; padding: 0; border: 1px solid transparent; border-radius: 2px; color: var(--vscode-descriptionForeground); background: transparent; cursor: pointer; font-size: 13px; }
    .replace-variant-action:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground); }
    .replace-variant-action:disabled { opacity: .3; cursor: default; }
    .replace-variant-empty { margin: 0; padding: 6px; color: var(--vscode-descriptionForeground); font-size: 10px; }
    .replace-scope { margin: 0 0 6px; }
    .working-directory { grid-template-columns: minmax(0, 1fr) 30px; }
    .working-directory input { min-width: 0; }
    .folder-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 1px solid var(--ktc-ui-border, var(--vscode-button-secondaryBackground, var(--vscode-panel-border)));
      border-radius: 2px;
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
      background: var(--vscode-button-secondaryBackground, transparent);
      cursor: pointer;
    }
    .folder-button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-panel-border))); }
    .folder-button svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .action-tooltip { display: block; min-width: 0; }
    .action-tooltip .action { width: 100%; height: 100%; }
    .text-button { border: 0; padding: 2px 0; color: var(--vscode-textLink-foreground); background: transparent; cursor: pointer; font-size: 11px; }
    .text-button:disabled { opacity: 0.45; cursor: default; }
    .scope-block {
      margin-bottom: 12px;
      font-size: 12px;
    }
    .scope-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .scope-block label {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      cursor: pointer;
      line-height: 1.4;
      margin-bottom: 4px;
    }
    .scope-block label.disabled {
      opacity: 0.55;
      cursor: default;
    }
    .scope-block input { margin-top: 2px; }
    .scope-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: 4px 0 0 0;
      line-height: 1.4;
    }
    .actions {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    .code-assistant-block { margin: 0; }
    ktc-tool-navigator { display: block; min-width: 0; }
    .code-assistant-feature { margin-top: 4px; border-top: 1px solid var(--vscode-panel-border); }
    .code-assistant-feature > summary { display: flex; min-height: 23px; align-items: center; gap: 2px; padding: 0 2px; cursor: pointer; color: var(--vscode-foreground); font-size: 12px; font-weight: 600; list-style: none; }
    .code-assistant-feature > summary::-webkit-details-marker { display: none; }
    .code-assistant-feature > summary::before { content: "›"; margin-right: 3px; font-size: 17px; }
    .code-assistant-feature[open] > summary::before { transform: rotate(90deg); }
    .code-assistant-feature-close { width: 22px; height: 22px; margin-left: auto; padding: 0; border: 1px solid transparent; border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; font: inherit; font-size: 18px; line-height: 1; }
    .code-assistant-feature-close:hover { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-toolbar-hoverBackground); }
    .code-assistant-feature-actions { display: flex; align-items: center; gap: 6px; padding: 1px 0 5px; }
    .code-assistant-feature-actions .action { margin: 0; }
    .code-assistant-feature-status { min-width: 0; margin: 0 0 5px; color: var(--vscode-descriptionForeground); font-size: 11px; line-height: 1.4; }
    .code-assistant-feature-result-count { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 11px; font-weight: 400; }
    .code-assistant-feature-results { padding: 0 0 4px; }
    .code-assistant-feature-results ktc-reorder-members-panel { display: block; width: 100%; min-width: 0; }
    .code-assistant-empty { margin: 5px 0 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
    #general-actions button { flex: 1 1 0; }
    button.action {
      min-height: 28px;
      padding: 4px 12px;
      border: 1px solid var(--ktc-ui-border, var(--vscode-button-border, transparent));
      border-radius: 2px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-size: 12px;
    }
    button.action:not(:disabled):hover { background: var(--vscode-button-hoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-button-border, transparent))); }
    button.action.secondary {
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
    }
    button.action.secondary:not(:disabled):hover { background: var(--vscode-button-secondaryHoverBackground); border-color: var(--ktc-ui-active-border, var(--ktc-ui-border, var(--vscode-button-border, transparent))); }
    button.action:disabled { opacity: 0.5; cursor: not-allowed; }
    body.task-running button.action:disabled { cursor: progress; }
    .status {
      font-size: 12px;
      margin: 2px 0 10px;
      padding: 6px 8px;
      min-height: 28px;
      border-left: 2px solid var(--vscode-panel-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-textBlockQuote-background);
    }
    .status:empty { display: none; }
    .status.error { color: var(--vscode-errorForeground); border-left-color: var(--vscode-errorForeground); }
    .meta { display: flex; min-width: 0; align-items: center; gap: 4px; margin: 10px 0 12px; font-size: 11px; color: var(--vscode-descriptionForeground); }
    .meta strong { color: var(--vscode-foreground); font-weight: 500; }
    .meta select { min-width: 0; max-width: 100%; flex: 1 1 auto; padding: 2px 4px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); }
    body.codegen-tool .meta { margin: 4px 5px 5px; }
    .workspace-file-scope {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 6px;
      margin: -4px 0 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .workspace-file-scope select {
      min-width: 0;
      height: 28px;
      padding: 0 6px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    .workspace-file-scope .scope-error { grid-column: 2 / -1; color: var(--vscode-errorForeground); }
    .results-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .results { list-style: none; padding: 0; margin: 0; }
    .results li {
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
    }
    .results li:hover { background: var(--vscode-list-hoverBackground); }
    .results .file { font-weight: 500; }
    .results .detail { color: var(--vscode-descriptionForeground); font-size: 11px; }
    .results .file-row { padding: 6px 8px; border-radius: 4px; cursor: pointer; }
    .results .file-row:hover { background: var(--vscode-list-hoverBackground); }
    .issue-details { list-style: none; padding: 0 0 4px 12px; margin: 0; }
    .issue-details li {
      padding: 3px 8px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
    }
    .issue-details li:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
    .issue-details .arrow { opacity: 0.7; margin: 0 4px; }
    .issue-details .to { color: var(--vscode-foreground); }
    .empty { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .options {
      margin-bottom: 12px;
      font-size: 12px;
    }
    .options label {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      cursor: pointer;
      line-height: 1.4;
    }
    .options input { margin-top: 2px; }
    .options .hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      margin-left: 20px;
    }
    .enc-row .status-ok { color: var(--vscode-testing-iconPassed); }
    .enc-row .status-warn { color: var(--vscode-editorWarning-foreground); }
    .enc-row .status-bad { color: var(--vscode-errorForeground); }
    .target-hint {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin: -6px 0 12px;
    }
    .target-setting-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .target-setting-row label { flex: 0 0 auto; }
    .target-setting-row select {
      min-width: 0;
      flex: 1 1 110px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border, transparent);
      padding: 2px 4px;
    }
    .target-overrides {
      margin: 5px 0 0;
      line-height: 1.4;
    }
    .editor-companion-block { display: grid; gap: 8px; padding: 8px 12px 12px; }
    .editor-companion-block[hidden] { display: none; }
    .editor-companion-status { margin: 0; color: var(--vscode-descriptionForeground); line-height: 1.45; }
    .editor-companion-status.running { color: var(--vscode-progressBar-background, var(--vscode-focusBorder)); }
    .editor-companion-status.error { color: var(--vscode-errorForeground); }
    .editor-companion-summary { display: grid; gap: 1px; border-block: 1px solid var(--vscode-panel-border); }
    .editor-companion-summary-row { display: grid; min-width: 0; grid-template-columns: max-content minmax(0, 1fr); gap: 8px; align-items: center; padding: 4px 2px; border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 55%, transparent); }
    .editor-companion-summary-row:last-child { border-bottom: 0; }
    .editor-companion-summary-label { color: var(--vscode-descriptionForeground); }
    .editor-companion-summary-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .editor-companion-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .editor-companion-actions button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    .editor-companion-actions button.danger { color: var(--vscode-errorForeground); }
    .project-rename-primary { display: grid; min-width: 0; gap: 0; }
    .project-rename-primary[hidden] { display: none; }
    .project-rename-primary-directory { display: grid; min-width: 0; min-height: 32px; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 7px; padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .project-rename-primary-directory span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .project-rename-primary-actions { display: flex; flex-wrap: wrap; gap: 5px; padding: 5px 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    .project-rename-primary details { border-bottom: 1px solid var(--vscode-panel-border); }
    .project-rename-primary details > summary { display: flex; min-height: 30px; align-items: center; gap: 6px; padding: 3px 8px; background: var(--vscode-sideBarSectionHeader-background); cursor: pointer; list-style: none; }
    .project-rename-primary details > summary::-webkit-details-marker { display: none; }
    .project-rename-primary details > summary::before { width: 12px; content: "›"; font-size: 17px; line-height: 1; }
    .project-rename-primary details[open] > summary::before { transform: rotate(90deg); }
    .project-rename-primary details > summary > span { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .project-rename-primary-overview { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border-top: 1px solid var(--vscode-panel-border); }
    .project-rename-primary-overview span { display: grid; min-width: 0; justify-items: center; gap: 1px; padding: 6px 3px; border-top: 1px solid var(--vscode-panel-border); border-left: 1px solid var(--vscode-panel-border); }
    .project-rename-primary-overview span:nth-child(-n+3) { border-top: 0; }
    .project-rename-primary-overview span:nth-child(3n+1) { border-left: 0; }
    .project-rename-primary-overview strong { font-size: 13px; }
    .project-rename-primary-overview small { overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .project-rename-primary-profile-body { display: grid; gap: 7px; padding: 7px 8px 8px; border-top: 1px solid var(--vscode-panel-border); }
    .project-rename-primary-profile-body label { display: grid; gap: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .project-rename-primary-profile-body input { min-width: 0; width: 100%; min-height: 28px; padding: 3px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border,var(--vscode-panel-border)); }
    .project-rename-primary-profile-save { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 5px; }
    .project-rename-primary-status { margin: 0; padding: 6px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
    .project-rename-primary-status.running { color: var(--vscode-progressBar-background,var(--vscode-focusBorder)); }
    .project-rename-primary-status.error { color: var(--vscode-errorForeground); }
    .project-rename-primary-summary { display: grid; grid-template-columns: max-content minmax(0,1fr); gap: 0 8px; padding: 2px 8px; }
    .project-rename-primary-summary dt,.project-rename-primary-summary dd { min-width: 0; min-height: 25px; margin: 0; padding-block: 4px; border-bottom: 1px solid color-mix(in srgb,var(--vscode-panel-border) 55%,transparent); }
    .project-rename-primary-summary dt { color: var(--vscode-descriptionForeground); }
    .project-rename-primary-summary dd { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #header-options label + .hint { display: block; }
  </style>
</head>
<body>
  <div class="wrap">
    <ktc-primary-shell id="primary-shell">
      <ktc-directory-bar id="working-context-shell" slot="directory"></ktc-directory-bar>
      <ktc-toolbar-strip id="ribbon-shell" slot="toolbar">
        <div class="tabs ribbon" id="tabs" slot="ribbon" aria-label="工具栏"></div>
        <ktc-tool-navigator id="code-assistant-navigator" slot="group-content" hidden></ktc-tool-navigator>
      </ktc-toolbar-strip>
      <ktc-current-tool-region id="current-tool-region" slot="current">
        <div id="primary-body">
    <div class="module-block" id="module-block" hidden></div>
    <section class="welcome-panel" id="welcome-panel" aria-label="KT Auto Code 欢迎" hidden>
      <header class="welcome-brand">
        <div class="welcome-mark" aria-hidden="true">P</div>
        <div class="welcome-brand-copy">
          <h2 class="welcome-brand-name">PHOENIX</h2>
          <div class="welcome-brand-product">KT Auto Code</div>
        </div>
      </header>
      <p class="welcome-intro">从上方工具栏选择功能，对应的 Block 会在这里打开。</p>
      <h3 class="welcome-section-title">插件状态</h3>
      <div class="welcome-products" id="welcome-products"></div>
      <footer class="welcome-footer" aria-label="常用链接">
        <button class="welcome-link" type="button" data-welcome-action="openRepository">Gitee 主页</button>
        <button class="welcome-link" type="button" data-welcome-action="openInstallGuide">安装说明</button>
        <button class="welcome-link" type="button" data-welcome-action="openQuickStart">快速开始</button>
        <button class="welcome-link" type="button" data-welcome-action="openSettings">插件设置</button>
        <button class="welcome-link" type="button" data-welcome-action="openDiagnostics">运行诊断</button>
      </footer>
    </section>
    <p class="desc" id="tool-desc"></p>
    <section class="editor-companion-block" id="editor-companion-block" aria-label="Editor View 任务摘要" hidden>
      <p class="editor-companion-status" id="editor-companion-status"></p>
      <div class="editor-companion-summary" id="editor-companion-summary"></div>
      <div class="editor-companion-actions" id="editor-companion-actions"></div>
    </section>
    <section class="project-rename-primary" id="project-rename-primary" aria-label="项目改名 Primary" hidden>
      <div class="project-rename-primary-directory"><span id="project-rename-primary-root"></span><button id="project-rename-primary-choose" type="button">选择目录…</button></div>
      <div class="project-rename-primary-actions" id="project-rename-primary-actions"></div>
      <details open><summary><strong>总览</strong><span>风险与范围</span></summary><div class="project-rename-primary-overview" id="project-rename-primary-overview"></div></details>
      <details open><summary><strong>项目档案</strong><span id="project-rename-primary-profile-count"></span></summary><div class="project-rename-primary-profile-body"><label>选择方案<pnw-combo id="project-rename-primary-scheme"></pnw-combo></label><label>项目档案名称<span class="project-rename-primary-profile-save"><input id="project-rename-primary-profile-name" maxlength="256" placeholder="例如：Phoenix 产品改名" /><button id="project-rename-primary-save" type="button">保存</button></span></label></div></details>
      <p class="project-rename-primary-status" id="project-rename-primary-status"></p>
      <dl class="project-rename-primary-summary" id="project-rename-primary-summary"></dl>
    </section>
    <ktc-auto-build-primary-panel id="auto-build-primary-panel" hidden></ktc-auto-build-primary-panel>
    <p class="meta" id="workspace-meta">
      <span id="workspace-context-label">工作区：</span>
      <strong id="workspace-label">—</strong>
      <select id="git-repository-select" aria-label="Git 仓库" hidden></select>
      <button class="git-repository-action" id="git-repository-add" type="button" title="添加 Git 仓库" aria-label="添加 Git 仓库" hidden>＋</button>
      <button class="git-repository-action" id="git-repository-refresh" type="button" title="刷新仓库摘要" aria-label="刷新仓库摘要" hidden>↻</button>
      <button class="git-repository-action" id="git-repository-remove" type="button" title="从我的仓库移除" aria-label="从我的仓库移除" hidden>−</button>
    </p>
    <section class="code-assistant-block" id="code-assistant-block" hidden aria-label="代码辅助功能">
      <p class="code-assistant-empty" id="code-assistant-empty">从上方功能目录选择一项开始。</p>
      ${ktcCodeAssistantFeatureBlock({
        id: "code-assistant-reorder-actions",
        title: "排序操作",
        closeId: "btn-code-assistant-reorder-close",
        closeTitle: "关闭成员排序，返回功能列表",
        closeAriaLabel: "关闭成员排序",
        hidden: true,
        body: `<div class="code-assistant-feature-actions">
          <button class="action secondary" id="btn-code-assistant-reorder-scan" type="button">扫描排序</button>
          <button class="action" id="btn-code-assistant-reorder-apply" type="button" disabled>应用所选</button>
        </div>
        <p class="code-assistant-feature-status" id="code-assistant-reorder-status"></p>`,
      })}
      <details class="code-assistant-feature" id="code-assistant-reorder-results" open hidden>
        <summary>预览结果 <span class="code-assistant-feature-result-count" id="code-assistant-reorder-result-count"></span></summary>
        <div class="code-assistant-feature-results">
          <ktc-reorder-members-panel id="reorder-members-panel"></ktc-reorder-members-panel>
        </div>
      </details>
    </section>
    ${ktcCodeAssistantFeatureBlock({
      id: "code-assistant-generic-actions",
      titleId: "code-assistant-generic-title",
      title: "功能操作",
      closeId: "btn-code-assistant-generic-close",
      closeTitle: "关闭当前功能，返回功能目录",
      closeAriaLabel: "关闭当前代码辅助功能",
      hidden: true,
      body: `<div class="code-assistant-feature-actions actions" id="general-actions">
        <button class="action secondary" id="btn-scan">预检</button>
        <button class="action" id="btn-fix">修复</button>
      </div>`,
    })}
    <ktc-codegen-primary-panel id="codegen-panel" hidden></ktc-codegen-primary-panel>
    <ktc-run-primary-panel id="run-panel" hidden></ktc-run-primary-panel>
    <ktc-git-primary-panel id="git-panel" hidden></ktc-git-primary-panel>
    <div class="uuid-options" id="uuid-options" hidden>
      <label for="uuid-strategy">生成策略</label>
      <select id="uuid-strategy" aria-label="UUID 生成策略">
        <option value="map_per_value">同值同替换（推荐）</option>
        <option value="fresh_per_hit">每处独立新值</option>
      </select>
      <p class="hint" id="uuid-strategy-hint">相同旧 UUID 在所有文件中替换为同一个新 UUID；策略在扫描时固定。</p>
    </div>
    <div class="compact-tools" id="compact-tools" hidden>
      <button class="text-button" id="btn-caa-check-connection" type="button" hidden>连接 Desk Tools</button>
    </div>
    <ktc-ignore-primary-panel id="ignore-panel" hidden></ktc-ignore-primary-panel>
    <section class="settings-block" id="environment-block" hidden aria-label="设置">
      <details class="settings-section" id="environment-settings-section" open>
        <summary><svg class="settings-section-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg><span>工程环境</span></summary>
        <div class="settings-section-body">
          <div class="environment-actions">
            <button class="action" id="btn-environment-refresh" type="button">刷新系统值</button>
            <button class="action secondary" id="btn-environment-system" type="button">系统环境变量</button>
          </div>
          <div class="environment-values" id="environment-values"></div>
          <div class="environment-footer"><span>修改当前用户环境；不会改机器级变量。其他应用需重启后继承新值。</span></div>
        </div>
      </details>
      <details class="settings-section" id="plugin-settings-tree" open>
        <summary><svg class="settings-section-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg><span>插件设置</span><span class="settings-section-count">5 项</span></summary>
        <div class="settings-tree" role="tree" aria-label="插件设置功能">
          <div class="plugin-setting-values" id="plugin-setting-values" aria-label="CAA 插件设置当前值"></div>
          <button class="settings-tree-row" id="btn-environment-plugin-settings" type="button" role="treeitem" title="打开 KT Auto Code 的 VS Code 设置">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.1 1.1l.4 1.6c.3.1.6.2.9.4l1.4-.9 1.1 1.1-.9 1.4c.2.3.3.6.4.9l1.6.4v1.6l-1.6.4c-.1.3-.2.6-.4.9l.9 1.4-1.1 1.1-1.4-.9c-.3.2-.6.3-.9.4l-.4 1.6H7.5l-.4-1.6c-.3-.1-.6-.2-.9-.4l-1.4.9-1.1-1.1.9-1.4a4 4 0 01-.4-.9l-1.6-.4V6.1l1.6-.4c.1-.3.2-.6.4-.9l-.9-1.4 1.1-1.1 1.4.9c.3-.2.6-.3.9-.4l.4-1.6h1.6zM8.3 5.5a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2z"/></svg>
            <span>VS Code 插件设置</span>
          </button>
        </div>
      </details>
    </section>
    <section class="replace-block" id="replace-block" hidden>
      <div class="replace-query-shell">
        <button class="replace-query-toggle" id="btn-replace-toggle" type="button" aria-expanded="true" aria-controls="replace-with-row" title="收起替换行">⌄</button>
        <div class="replace-query-row">
          <input id="replace-search" type="text" spellcheck="false" placeholder="搜索" aria-label="搜索内容" />
          <span class="action-tooltip replace-query-action" id="replace-preview-tooltip">
            <button class="action secondary" id="btn-replace-preview" type="button">搜索</button>
          </span>
        </div>
        <div class="replace-query-row replace-only" id="replace-with-row">
          <input id="replace-with" type="text" spellcheck="false" placeholder="替换" aria-label="替换内容" />
          <span class="action-tooltip replace-query-action" id="replace-apply-tooltip">
            <button class="action" id="btn-replace-apply" type="button">替换</button>
          </span>
        </div>
      </div>
      <div id="replace-details">
      <div class="replace-helpers">
        <div class="replace-history-control"><pnw-combo id="replace-history"></pnw-combo></div>
        <button class="replace-variant-toggle" id="btn-replace-variants" type="button" aria-expanded="false" aria-controls="replace-variant-block">常用变形</button>
        <button class="replace-variant-toggle" id="btn-project-rename-analysis" type="button" title="把当前目录、名称和启用的常用变形带入项目改名 View" aria-label="打开项目改名并带入当前名称与规则">项目改名</button>
      </div>
      <section class="replace-variant-block" id="replace-variant-block" aria-label="常用变形规则" hidden>
        <div class="replace-variant-block-header">勾选并编辑本次使用的显式规则；从上到下显示优先级</div>
        <div class="replace-variant-list" id="replace-variant-list"></div>
      </section>
      <div class="replace-options">
        <label><input id="replace-text" type="checkbox" checked />文本</label>
        <label><input id="replace-file" type="checkbox" />文件名</label>
        <label><input id="replace-dir" type="checkbox" />文件夹名</label>
        <label title="仅原文件为 ASCII 且目标含非 ASCII 字符时使用">
          默认编码
          <select id="replace-default-encoding" aria-label="ASCII 文件目标默认编码">
            <option value="utf8">UTF-8</option>
            <option value="gbk">GBK（本地）</option>
          </select>
        </label>
      </div>
      <section class="replace-ignore-summary" id="replace-ignore-summary" aria-label="Ignore 使用策略">
        <div class="replace-ignore-header"><strong>忽略</strong><span class="replace-ignore-state" id="replace-ignore-state">已启用</span><button class="action secondary" id="btn-toggle-replace-ignore" type="button" aria-pressed="true">停用</button><button class="action secondary" id="btn-manage-replace-ignore" type="button">修改</button></div>
        <div class="replace-ignore-sources" aria-label="Ignore 来源">
          <label title="Phoenix Auto 内置的 CAA、C++、Web 生成物和缓存目录"><input id="replace-ignore-builtin" type="checkbox" checked />插件</label>
          <label title="读取本次扫描根所在最近 Git 仓库根部的 .gitignore"><input id="replace-ignore-git" type="checkbox" checked />Git</label>
          <label title="读取本次扫描根的 .phoenix/.ignore"><input id="replace-ignore-custom-enabled" type="checkbox" />自定义</label>
        </div>
        <p class="replace-ignore-hint">停用后仍保留不可关闭的安全排除；规则正文统一在 Ignore 管理中修改。</p>
      </section>
      </div>
    </section>
    <ktc-uuid-results-panel id="uuid-results-panel" hidden></ktc-uuid-results-panel>
    <ktc-rename-results-panel id="rename-results-panel" hidden></ktc-rename-results-panel>
    <div class="scope-block" id="scope-block">
      <div class="scope-title">范围</div>
      <label>
        <input type="checkbox" id="scope-headers" />
        <span>头文件（.h / .hpp / …）</span>
      </label>
      <label>
        <input type="checkbox" id="scope-source" />
        <span>源文件（.cpp / .c / …）</span>
      </label>
      <label id="scope-md-wrap">
        <input type="checkbox" id="scope-md" />
        <span>.md 文档（仅编码修正）</span>
      </label>
    </div>
    <div class="target-hint" id="target-hint" hidden>
      <div class="target-setting-row">
        <label for="encoding-default-target">默认目标</label>
        <select id="encoding-default-target" aria-label="当前项目默认目标编码" title="保存到当前项目的 VS Code 工作区设置">
          <option value="utf8">UTF-8</option>
          <option value="gbk">GBK（本地）</option>
        </select>
        <button class="text-button" id="btn-encoding-settings" type="button" title="配置头文件、源文件和 Markdown 的项目级目标">更多设置…</button>
      </div>
      <p class="target-overrides" id="target-overrides"></p>
    </div>
    <div class="options" id="options-panel" hidden>
      <div id="header-options">
        <label>
          <input type="checkbox" id="opt-preserve-gbk" />
          <span>保留 GBK 中文注释</span>
        </label>
        <p class="hint" id="opt-hint">关闭时修正全部非 ASCII。</p>
        <label style="margin-top:8px">
          <input type="checkbox" id="opt-strip-bom" />
          <span>去除 BOM（含 UTF-8 BOM / UTF-16）→ UTF-8</span>
        </label>
        <p class="hint" id="opt-bom-hint">宽字节 BOM 文件将转为 UTF-8。</p>
      </div>
      <div id="encoding-options" hidden>
        <label>
          <input type="checkbox" id="opt-enc-details" />
          <span>显示详细（BOM 十六进制、检测说明）</span>
        </label>
      </div>
      <label style="margin-top:8px" id="opt-show-details-wrap">
        <input type="checkbox" id="opt-show-details" />
        <span id="opt-show-details-label">显示详细（原字符 → 修正为）</span>
      </label>
    </div>
    <p class="status" id="status"></p>
    <div class="results-title" id="results-title">预检结果</div>
    <div class="results compact-results" id="results"></div>
    <p class="empty" id="empty-hint">点击「预检」查看头文件中的问题字节。</p>
        </div>
      </ktc-current-tool-region>
      <ktc-open-items-bar id="open-items-bar" slot="open-items"></ktc-open-items-bar>
    </ktc-primary-shell>
  </div>
  <script nonce="${nonce}" src="${codegenPrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${runPrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${gitPrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${ignorePrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${autoBuildPrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${reorderMembersPanelUri}"></script>
  <script nonce="${nonce}" src="${uuidResultsPanelUri}"></script>
  <script nonce="${nonce}" src="${renameResultsPanelUri}"></script>
  <script nonce="${nonce}" src="${ribbonCustomizationMenuUri}"></script>
  <script nonce="${nonce}" src="${toolNavigatorUri}"></script>
  <script nonce="${nonce}" src="${primaryShellUri}"></script>
  <script nonce="${nonce}" src="${directoryBarUri}"></script>
  <script nonce="${nonce}" src="${toolbarStripUri}"></script>
  <script nonce="${nonce}" src="${currentToolRegionUri}"></script>
  <script nonce="${nonce}" src="${openItemsBarUri}"></script>
  <script nonce="${nonce}" src="${pnwComboUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const saved = vscode.getState() || {};
    const savedReplace = saved.replace || {};
    let pendingRibbonCollapseMigration = saved.ribbonBlockCollapsed === true;
    let state = {
      tools: [],
      activeToolId: "",
      openToolIds: [],
      toolStates: {},
      toolOptions: {},
      scope: { includeHeaders: true, includeSource: true, includeMarkdown: true },
      ignoreConfig: null,
      showDetails: !!saved.showDetails,
      showEncDetails: !!saved.showEncDetails,
      sidebarStyle: "ribbon",
      directoryVisible: true,
      presentation: "ribbon",
      recentWorkingDirectories: { workspace: [], external: [], options: [] },
      moduleState: { installed: ["code"], enabled: ["code"], visible: ["code"], known: ["code"], active: "code" },
      moduleBlock: null,
      codeAssistantFeature: "",
      codeAssistantTreeUiState: {
        navigatorMode: "outline",
        showLabels: true,
        treeExpanded: true,
        cppOrganizeExpanded: true,
        fileToolsExpanded: true,
        caaExpanded: true,
        reorderActionsExpanded: true,
        reorderResultsExpanded: true,
      },
      extensionInstallations: [],
      ribbonLayout: { pinnedToolIds: [], toolOrder: [] },
      workingContext: { selectedDirectory: "", label: "未打开目录", pluginIgnoreEnabled: false, ignoreEnabled: true, builtInIgnoreEnabled: true, gitIgnoreEnabled: true, customIgnoreEnabled: false, gitIgnoreExists: false },
      uuidStrategy: saved.uuidStrategy === "fresh_per_hit" ? "fresh_per_hit" : "map_per_value",
      replace: Object.assign({ search: "", with: "", text: true, file: false, dir: false, ignored: false, scope: "", collapsed: false, defaultEncoding: "utf8", variantMode: "exact", variantBasis: "", variantRules: [] }, savedReplace),
    };
    state.replace.defaultEncoding = state.replace.defaultEncoding === "gbk" ? "gbk" : "utf8";
    state.replace.variantMode = state.replace.variantMode === "common" ? "common" : "exact";
    state.replace.variantRules = Array.isArray(state.replace.variantRules) ? state.replace.variantRules : [];
    state.replace.variantBasis = typeof state.replace.variantBasis === "string" ? state.replace.variantBasis : "";
    const toolScrollPositions = new Map();
    let openModuleMenuId = "";
    let focusRibbonMenuRequested = false;
    let initialized = false;
    let selectedRenameHistoryKey = "";
    const gitPanelModel = ${ktcGitPanelModel.toString()};
    const gitRepositoryOptionLabels = ${ktcGitRepositoryOptionLabels.toString()};
    const codeAssistantNavigation = ${JSON.stringify(KTC_CODE_ASSISTANT_NAVIGATION)};
    const codeAssistantToolIds = new Set();
    const editorPrimaryCompanionToolIds = new Set(${JSON.stringify(KTC_EDITOR_PRIMARY_COMPANION_TOOL_IDS)});
    const resolveGroupMruToolId = ${ktcResolveGroupMruToolId.toString()};
    const collectCodeAssistantToolIds = (nodes) => {
      for (const node of nodes || []) {
        if (node.kind === "group") collectCodeAssistantToolIds(node.children);
        else if (node.toolId) codeAssistantToolIds.add(node.toolId);
      }
    };
    collectCodeAssistantToolIds(codeAssistantNavigation);
    let gitRefreshRequested = false;
    let focusOpenItemsRequested = false;
    let openItemsModelSignature = "";
    let toolbarProjectionSignature = "";

    function persistUiState() {
      vscode.setState({
        showDetails: state.showDetails,
        showEncDetails: state.showEncDetails,
        uuidStrategy: state.uuidStrategy,
        replace: state.replace,
      });
    }

    function orderedTools(tools) {
      const positions = new Map((state.ribbonLayout.toolOrder || []).map((id, index) => [id, index]));
      return [...tools].sort((left, right) => (
        (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      ));
    }

    function toggleToolPin(toolId) {
      vscode.postMessage({ type: "toggleRibbonToolPin", toolId });
    }

    function movePinnedTool(sourceId, targetId, after) {
      vscode.postMessage({
        type: "moveRibbonTool",
        toolId: sourceId,
        targetToolId: targetId,
        placement: after ? "after" : "before",
      });
    }

    function placeModuleMoreMenu(summary, menu) {
      const margin = 6;
      const gap = 3;
      const width = Math.min(280, Math.max(0, window.innerWidth - margin * 2));
      menu.style.width = width + "px";
      const anchor = typeof summary.getOverflowAnchorRect === "function"
        ? summary.getOverflowAnchorRect()
        : summary.getBoundingClientRect();
      const headerTriggered = anchor.width === 0 && anchor.height === 0;
      const left = headerTriggered
        ? window.innerWidth - width - margin
        : Math.max(margin, Math.min(anchor.right - width, window.innerWidth - width - margin));
      menu.style.left = left + "px";
      if (headerTriggered) {
        menu.style.maxHeight = Math.max(120, window.innerHeight - margin * 2) + "px";
        menu.style.top = margin + "px";
        return;
      }
      const below = Math.max(0, window.innerHeight - anchor.bottom - margin - gap);
      const above = Math.max(0, anchor.top - margin - gap);
      const available = Math.max(120, Math.max(below, above));
      menu.style.maxHeight = available + "px";
      const menuHeight = Math.min(menu.scrollHeight, available);
      menu.style.top = (below >= Math.min(menuHeight, 240)
        ? anchor.bottom + gap
        : Math.max(margin, anchor.top - menuHeight - gap)) + "px";
    }

    function switchActiveTool(nextToolId) {
      const next = nextToolId || state.activeToolId;
      if (!next || next === state.activeToolId) return false;
      if (state.activeToolId) toolScrollPositions.set(state.activeToolId, els.currentToolRegion.contentScrollTop);
      state.activeToolId = next;
      return true;
    }

    function restoreActiveToolScroll(changed) {
      if (!changed) return;
      const top = toolScrollPositions.get(state.activeToolId) || 0;
      requestAnimationFrame(() => { els.currentToolRegion.contentScrollTop = top; });
    }

    const els = {
      workingContextShell: document.getElementById("working-context-shell"),
      ribbonShell: document.getElementById("ribbon-shell"),
      currentToolRegion: document.getElementById("current-tool-region"),
      openItemsBar: document.getElementById("open-items-bar"),
      primaryBody: document.getElementById("primary-body"),
      tabs: document.getElementById("tabs"),
      moduleBlock: document.getElementById("module-block"),
      welcomePanel: document.getElementById("welcome-panel"),
      welcomeProducts: document.getElementById("welcome-products"),
      desc: document.getElementById("tool-desc"),
      editorCompanionBlock: document.getElementById("editor-companion-block"),
      editorCompanionStatus: document.getElementById("editor-companion-status"),
      editorCompanionSummary: document.getElementById("editor-companion-summary"),
      editorCompanionActions: document.getElementById("editor-companion-actions"),
      projectRenamePrimary: document.getElementById("project-rename-primary"),
      projectRenamePrimaryRoot: document.getElementById("project-rename-primary-root"),
      projectRenamePrimaryChoose: document.getElementById("project-rename-primary-choose"),
      projectRenamePrimaryActions: document.getElementById("project-rename-primary-actions"),
      projectRenamePrimaryOverview: document.getElementById("project-rename-primary-overview"),
      projectRenamePrimaryProfileCount: document.getElementById("project-rename-primary-profile-count"),
      projectRenamePrimaryScheme: document.getElementById("project-rename-primary-scheme"),
      projectRenamePrimaryProfileName: document.getElementById("project-rename-primary-profile-name"),
      projectRenamePrimarySave: document.getElementById("project-rename-primary-save"),
      projectRenamePrimaryStatus: document.getElementById("project-rename-primary-status"),
      projectRenamePrimarySummary: document.getElementById("project-rename-primary-summary"),
      autoBuildPrimaryPanel: document.getElementById("auto-build-primary-panel"),
      replaceBlock: document.getElementById("replace-block"),
      codeAssistantBlock: document.getElementById("code-assistant-block"),
      codeAssistantNavigator: document.getElementById("code-assistant-navigator"),
      codeAssistantEmpty: document.getElementById("code-assistant-empty"),
      codeAssistantReorderActions: document.getElementById("code-assistant-reorder-actions"),
      codeAssistantReorderResults: document.getElementById("code-assistant-reorder-results"),
      btnCodeAssistantReorderScan: document.getElementById("btn-code-assistant-reorder-scan"),
      btnCodeAssistantReorderApply: document.getElementById("btn-code-assistant-reorder-apply"),
      btnCodeAssistantReorderClose: document.getElementById("btn-code-assistant-reorder-close"),
      codeAssistantGenericActions: document.getElementById("code-assistant-generic-actions"),
      codeAssistantGenericTitle: document.getElementById("code-assistant-generic-title"),
      btnCodeAssistantGenericClose: document.getElementById("btn-code-assistant-generic-close"),
      codeAssistantReorderStatus: document.getElementById("code-assistant-reorder-status"),
      codeAssistantReorderResultCount: document.getElementById("code-assistant-reorder-result-count"),
      replaceToggle: document.getElementById("btn-replace-toggle"),
      reorderMembersPanel: document.getElementById("reorder-members-panel"),
      uuidResultsPanel: document.getElementById("uuid-results-panel"),
      renameResultsPanel: document.getElementById("rename-results-panel"),
      replaceSearch: document.getElementById("replace-search"),
      replaceWith: document.getElementById("replace-with"),
      replaceHistory: document.getElementById("replace-history"),
      btnReplaceVariants: document.getElementById("btn-replace-variants"),
      replaceVariantBlock: document.getElementById("replace-variant-block"),
      replaceVariantList: document.getElementById("replace-variant-list"),
      replaceText: document.getElementById("replace-text"),
      replaceFile: document.getElementById("replace-file"),
      replaceDir: document.getElementById("replace-dir"),
      replaceIgnoreSummary: document.getElementById("replace-ignore-summary"),
      replaceIgnoreState: document.getElementById("replace-ignore-state"),
      replaceIgnoreBuiltIn: document.getElementById("replace-ignore-builtin"),
      replaceIgnoreGit: document.getElementById("replace-ignore-git"),
      replaceIgnoreCustomEnabled: document.getElementById("replace-ignore-custom-enabled"),
      btnToggleReplaceIgnore: document.getElementById("btn-toggle-replace-ignore"),
      btnManageReplaceIgnore: document.getElementById("btn-manage-replace-ignore"),
      btnProjectRenameAnalysis: document.getElementById("btn-project-rename-analysis"),
      defaultEncoding: document.getElementById("replace-default-encoding"),
      replacePreview: document.getElementById("btn-replace-preview"),
      replaceApply: document.getElementById("btn-replace-apply"),
      replacePreviewTooltip: document.getElementById("replace-preview-tooltip"),
      replaceApplyTooltip: document.getElementById("replace-apply-tooltip"),
      generalActions: document.getElementById("general-actions"),
      codegenPanel: document.getElementById("codegen-panel"),
      runPanel: document.getElementById("run-panel"),
      gitPanel: document.getElementById("git-panel"),
      compactTools: document.getElementById("compact-tools"),
      uuidOptions: document.getElementById("uuid-options"),
      uuidStrategy: document.getElementById("uuid-strategy"),
      uuidStrategyHint: document.getElementById("uuid-strategy-hint"),
      btnCaaCheckConnection: document.getElementById("btn-caa-check-connection"),
      ignorePanel: document.getElementById("ignore-panel"),
      environmentBlock: document.getElementById("environment-block"),
      environmentValues: document.getElementById("environment-values"),
      pluginSettingValues: document.getElementById("plugin-setting-values"),
      btnEnvironmentRefresh: document.getElementById("btn-environment-refresh"),
      btnEnvironmentSystem: document.getElementById("btn-environment-system"),
      btnEnvironmentPluginSettings: document.getElementById("btn-environment-plugin-settings"),
      workspace: document.getElementById("workspace-label"),
      workspaceMeta: document.getElementById("workspace-meta"),
      workspaceContextLabel: document.getElementById("workspace-context-label"),
      gitRepositorySelect: document.getElementById("git-repository-select"),
      gitRepositoryAdd: document.getElementById("git-repository-add"),
      gitRepositoryRefresh: document.getElementById("git-repository-refresh"),
      gitRepositoryRemove: document.getElementById("git-repository-remove"),
      scopeBlock: document.getElementById("scope-block"),
      scopeHeaders: document.getElementById("scope-headers"),
      scopeSource: document.getElementById("scope-source"),
      scopeMd: document.getElementById("scope-md"),
      scopeMdWrap: document.getElementById("scope-md-wrap"),
      targetHint: document.getElementById("target-hint"),
      encodingDefaultTarget: document.getElementById("encoding-default-target"),
      btnEncodingSettings: document.getElementById("btn-encoding-settings"),
      targetOverrides: document.getElementById("target-overrides"),
      headerOptions: document.getElementById("header-options"),
      encodingOptions: document.getElementById("encoding-options"),
      encDetails: document.getElementById("opt-enc-details"),
      showDetailsWrap: document.getElementById("opt-show-details-wrap"),
      showDetailsLabel: document.getElementById("opt-show-details-label"),
      optionsPanel: document.getElementById("options-panel"),
      preserveGbk: document.getElementById("opt-preserve-gbk"),
      stripBom: document.getElementById("opt-strip-bom"),
      showDetails: document.getElementById("opt-show-details"),
      optHint: document.getElementById("opt-hint"),
      optBomHint: document.getElementById("opt-bom-hint"),
      status: document.getElementById("status"),
      results: document.getElementById("results"),
      resultsTitle: document.getElementById("results-title"),
      empty: document.getElementById("empty-hint"),
      btnScan: document.getElementById("btn-scan"),
      btnFix: document.getElementById("btn-fix"),
    };

    function toolOptions() {
      return state.toolOptions[currentContentToolId()] || {};
    }

    function currentContentToolId() {
      return state.activeToolId;
    }

    function isEncodingTool() {
      return currentContentToolId() === "encodingFix";
    }

    function isHeaderAsciiTool() {
      return currentContentToolId() === "headerAscii";
    }

    function isCodeRenameTool() {
      return state.activeToolId === "codeRename";
    }

    function isCodeAssistantGroupActive() {
      return state.codeAssistantTreeUiState?.treeExpanded !== false;
    }

    function codeAssistantGroupMruToolId() {
      return resolveGroupMruToolId(state.openToolIds || [], codeAssistantToolIds);
    }

    function semanticToolIcon(toolId) {
      return ({
        autoBuild: "build",
        packageIncludes: "file",
        reorderMembers: "sort",
        headerAscii: "file",
        encodingFix: "file",
        uuidReplace: "uuid",
        caaDialog: "file",
        codeAssistant: "layout",
        codeRename: "replace",
        projectRename: "replace",
        codegen: "sliders",
        git: "git",
        run: "play",
        ignoreSettings: "exclude",
        environmentSettings: "settings",
      })[toolId] || "tool";
    }

    function isCodegenTool() {
      return state.activeToolId === "codegen";
    }

    function isRunTool() {
      return state.activeToolId === "run";
    }

    function isGitTool() {
      return state.activeToolId === "git";
    }

    function isReorderMembersTool() {
      return state.activeToolId === "reorderMembers";
    }

    function isIgnoreTool() {
      return state.activeToolId === "ignoreSettings";
    }

    function isUuidTool() {
      return currentContentToolId() === "uuidReplace";
    }

    function isCaaDialogTool() {
      return currentContentToolId() === "caaDialog";
    }

    function isEnvironmentTool() {
      return state.activeToolId === "environmentSettings";
    }

    function isEditorCompanionTool() {
      return editorPrimaryCompanionToolIds.has(state.activeToolId);
    }

    function updateOptHint() {
      if (isEncodingTool()) {
        els.empty.textContent = "点击「预检」检查文件整体编码。";
        return;
      }
      const preserve = !!toolOptions().preserveGbk;
      els.optHint.textContent = preserve
        ? "已开启：仅修复弯引号等问题字节，GBK 中文保留。"
        : "默认关闭：扫描并清除所有非 ASCII（推荐）。";
      els.empty.textContent = preserve
        ? "点击「预检」检查弯引号等问题字节。"
        : "点击「预检」检查头文件中的非 ASCII 内容。";
    }

    function encodingTargetLabel(value) {
      if (value === "ascii") return "ASCII";
      if (value === "gbk") return "GBK";
      return "UTF-8";
    }

    function renderEncodingTargetSettings(running) {
      const options = toolOptions();
      els.encodingDefaultTarget.value = options.encodingDefaultTarget === "gbk" ? "gbk" : "utf8";
      els.encodingDefaultTarget.disabled = running;
      const overrides = [
        options.encodingHeaderTarget && options.encodingHeaderTarget !== "inherit"
          ? "头文件 " + encodingTargetLabel(options.encodingHeaderTarget)
          : "",
        options.encodingSourceTarget && options.encodingSourceTarget !== "inherit"
          ? "源文件 " + encodingTargetLabel(options.encodingSourceTarget)
          : "",
        options.encodingMarkdownTarget && options.encodingMarkdownTarget !== "inherit"
          ? "Markdown " + encodingTargetLabel(options.encodingMarkdownTarget)
          : "",
      ].filter(Boolean);
      els.targetOverrides.textContent = overrides.length
        ? "项目覆盖：" + overrides.join(" · ")
        : "头文件、源文件和 Markdown 均继承默认目标。";
    }

    function resultPathParts(value) {
      const normalized = String(value || "").replace(/\\\\/g, "/").replace(/^\\.\\//, "");
      const index = normalized.lastIndexOf("/");
      return index < 0
        ? { name: normalized, directory: "" }
        : { name: normalized.slice(index + 1), directory: normalized.slice(0, index) };
    }

    function resultKind(path, explicit) {
      if (explicit) return explicit;
      const lower = String(path || "").toLowerCase();
      if (/\\.(h|hpp|hh|hxx)$/.test(lower)) return "C";
      if (/\\.(c|cc|cpp|cxx)$/.test(lower)) return "C++";
      if (/\\.catdlg$/.test(lower)) return "<>";
      if (/\\.md$/.test(lower)) return "M";
      return "·";
    }

    function highlightRanges(label, terms, nonAscii) {
      const ranges = [];
      if (nonAscii) {
        for (let index = 0; index < label.length; index += 1) {
          if (label.charCodeAt(index) > 127) ranges.push([index, index + 1]);
        }
      }
      const haystack = label.toLocaleLowerCase();
      for (const raw of terms || []) {
        const term = String(raw || "");
        if (!term) continue;
        const needle = term.toLocaleLowerCase();
        let start = 0;
        while ((start = haystack.indexOf(needle, start)) >= 0) {
          ranges.push([start, start + term.length]);
          start += Math.max(1, term.length);
        }
      }
      ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
      const merged = [];
      for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push(range.slice());
      }
      return merged;
    }

    function appendHighlightedText(target, label, terms, nonAscii) {
      const ranges = highlightRanges(label, terms, nonAscii);
      let cursor = 0;
      for (const range of ranges) {
        if (range[0] > cursor) target.appendChild(document.createTextNode(label.slice(cursor, range[0])));
        const mark = document.createElement("mark");
        mark.className = "result-hit";
        mark.textContent = label.slice(range[0], range[1]);
        target.appendChild(mark);
        cursor = range[1];
      }
      if (cursor < label.length) target.appendChild(document.createTextNode(label.slice(cursor)));
    }

    function createCompactIcon(text, title, onClick) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "compact-icon";
      button.textContent = text;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.onclick = (event) => { event.stopPropagation(); onClick(); };
      return button;
    }

    function createCompactRow(config) {
      const item = document.createElement("div");
      item.className = "compact-file-row";
      if (config.checkbox) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = !!config.checkbox.checked;
        checkbox.disabled = !!config.checkbox.disabled;
        checkbox.setAttribute("aria-label", config.checkbox.label || ("选择 " + config.path));
        checkbox.onchange = () => config.checkbox.onChange(checkbox.checked);
        item.appendChild(checkbox);
      }
      const kind = document.createElement("span");
      kind.className = "compact-kind";
      kind.textContent = resultKind(config.path, config.kind);
      const parts = resultPathParts(config.path);
      const main = document.createElement("span");
      main.className = "compact-file-main ktc-compact-label";
      main.title = config.title || config.path;
      const name = document.createElement("span");
      name.className = "compact-file-name ktc-compact-label-primary";
      appendHighlightedText(name, config.name || parts.name, config.highlightTerms, config.highlightNonAscii);
      const directory = document.createElement("span");
      directory.className = "compact-file-dir ktc-compact-label-secondary";
      directory.textContent = config.directory === undefined ? parts.directory : config.directory;
      main.append(name, directory);
      if (config.onOpen) main.onclick = config.onOpen;
      const actions = document.createElement("span");
      actions.className = "compact-inline";
      for (const action of config.actions || []) actions.appendChild(createCompactIcon(action.text, action.title, action.onClick));
      const status = document.createElement("span");
      status.className = "compact-state " + (config.statusClass || "");
      status.textContent = config.status || "";
      status.title = config.statusTitle || config.status || "";
      item.append(kind, main, actions, status);
      return item;
    }

    function createCompactGroup(title, detail, rows, checkbox) {
      const group = document.createElement("section");
      group.className = "compact-group";
      const header = document.createElement("div");
      header.className = "compact-group-header";
      if (checkbox) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = !!checkbox.checked;
        input.indeterminate = !!checkbox.indeterminate;
        input.disabled = !!checkbox.disabled;
        input.setAttribute("aria-label", checkbox.label || ("选择 " + title));
        input.onchange = () => checkbox.onChange(input.checked);
        header.appendChild(input);
      }
      const label = document.createElement("span");
      label.textContent = title;
      const description = document.createElement("span");
      description.className = "detail";
      description.textContent = detail || "";
      header.append(label, description);
      const list = document.createElement("div");
      list.className = "compact-list";
      for (const row of rows) list.appendChild(row);
      group.append(header, list);
      return group;
    }

    function renderHeaderResults(ts, showDetailRows) {
      const items = ts.results || [];
      if (items.length === 0) {
        els.empty.style.display = ts.status === "done" ? "block" : (ts.status === "idle" ? "block" : "none");
        if (ts.status === "done" && ts.issueFiles === 0) {
          els.empty.textContent = toolOptions().preserveGbk
            ? "未发现弯引号等问题字节。"
            : "未发现非 ASCII 或问题字节。";
        }
        return;
      }
      els.empty.style.display = "none";
      for (const item of items) {
        const open = () => vscode.postMessage({ type: "openIssue", toolId: currentContentToolId(), file: item.fullPath, line: item.topLine });
        const row = createCompactRow({
          path: item.relativePath || item.file,
          highlightNonAscii: true,
          status: "L" + item.topLine + " ×" + item.issueCount,
          statusClass: "error",
          onOpen: open,
          actions: [{ text: "↗", title: "打开并定位", onClick: open }],
          title: item.fullPath,
        });
        const block = document.createElement("div");
        block.appendChild(row);

        if (showDetailRows && item.issues && item.issues.length) {
          const ul = document.createElement("ul");
          ul.className = "issue-details";
          for (const iss of item.issues) {
            const dli = document.createElement("li");
            dli.innerHTML = 'L' + iss.line + ':C' + iss.column + ' ' +
              escapeHtml(iss.fromLabel) + '<span class="arrow">→</span><span class="to">' +
              escapeHtml(iss.toLabel) + '</span>';
            dli.onclick = (e) => {
              e.stopPropagation();
              vscode.postMessage({
                type: "openIssue",
                toolId: currentContentToolId(),
                file: item.fullPath,
                line: iss.line,
              });
            };
            ul.appendChild(dli);
          }
          block.appendChild(ul);
        }
        els.results.appendChild(block);
      }
    }

    function renderEncodingResults(ts, showEncDetails) {
      const items = ts.encodingResults || [];
      if (items.length === 0) {
        els.empty.style.display = ts.status === "done" ? "block" : (ts.status === "idle" ? "block" : "none");
        if (ts.status === "done" && ts.issueFiles === 0) {
          els.empty.textContent = "所有文件均符合当前项目编码目标。";
        }
        return;
      }
      els.empty.style.display = "none";
      const rows = items.map((item) => {
        const open = () => vscode.postMessage({ type: "openEncodingFile", toolId: currentContentToolId(), file: item.fullPath });
        const row = createCompactRow({
          path: item.relativePath,
          status: item.suggestedAction === "—" ? "✓" : item.suggestedAction,
          statusClass: item.status === "ok" ? "ok" : (item.status === "unsupported" ? "" : "error"),
          statusTitle: item.detected + " → " + item.expected,
          onOpen: open,
          actions: [{ text: "↗", title: "打开文件", onClick: open }],
          title: item.fullPath + "\\n" + item.detected + " → " + item.expected,
        });

        if (showEncDetails && item.detail) {
          const det = document.createElement("div");
          det.className = "compact-subtext";
          det.textContent = item.detail;
          const wrapper = document.createElement("div");
          wrapper.append(row, det);
          return wrapper;
        }
        return row;
      });
      els.results.appendChild(createCompactGroup("文件", items.length + " 个", rows));
    }

    function syncRenameResultsPanel(ts) {
      const report = ts.codeRenameResults;
      const summary = report?.summary;
      els.renameResultsPanel.model = {
        rows: report?.rows || [],
        applied: !!report?.applied,
        running: ts.status === "running",
        summary: summary ? summary.replacements + " 处替换 · " + summary.errors + " 错误" : "",
        emptyMessage: report ? "没有匹配结果。" : "填写规则后点击“预览”。",
        capabilities: { open: true },
      };
    }

    function syncIgnorePrimaryPanel(ts) {
      const context = state.workingContext || {};
      els.ignorePanel.model = {
        config: state.ignoreConfig || undefined,
        recommendations: ts.ignoreRecommendations,
        sourceEnabled: {
          builtIn: context.builtInIgnoreEnabled !== false,
          git: context.gitIgnoreEnabled !== false,
          custom: context.customIgnoreEnabled === true,
        },
        running: ts.status === "running",
        message: ts.message || state.ignoreConfig?.statusText || "",
      };
    }

    function syncUuidResultsPanel(ts) {
      const rows = Array.isArray(ts.uuidResults)
        ? ts.uuidResults.filter((row) => row.state !== "cancelled")
        : [];
      const selectedPending = rows.filter((row) => row.state === "pending" && (ts.uuidSelectedUris || []).includes(row.uri));
      els.btnFix.disabled = ts.status === "running" || selectedPending.length === 0;
      els.btnFix.textContent = selectedPending.length ? "替换所选（" + selectedPending.length + "）" : "替换所选";
      els.uuidResultsPanel.model = {
        presentation: "files",
        running: ts.status === "running",
        files: rows,
        selectedIds: ts.uuidSelectedUris || [],
        emptyMessage: Array.isArray(ts.uuidResults) ? "没有 UUID 候选。" : "点击“扫描 UUID”生成固定映射。",
        capabilities: { selection: true, open: true, apply: true, cancel: true, gitDiff: true },
      };
    }
    function renderCaaResults(ts) {
      const connection = ts.caaDeskConnection || { status: "checking", text: "等待连接 Desk Tools…" };
      const connectionRow = document.createElement("div");
      connectionRow.className = "caa-connection " + connection.status;
      const connectionIcon = connection.status === "online" ? "●" : (connection.status === "checking" ? "◌" : (connection.status === "custom-command" ? "◆" : "○"));
      connectionRow.textContent = connectionIcon + " " + connection.text;
      if (connection.endpoint) connectionRow.title = connection.endpoint;
      els.results.appendChild(connectionRow);
      const rows = ts.caaDialogResults;
      if (!Array.isArray(rows)) { els.empty.style.display = "block"; els.empty.textContent = "点击“扫描 CATDlg”定位文件。"; return; }
      if (!rows.length) { els.empty.style.display = "block"; els.empty.textContent = "没有找到 .CATDlg 文件。"; return; }
      els.empty.style.display = "none";
      const items = rows.map((item) => {
        const open = () => vscode.postMessage({ type: "caaDialogAction", toolId: "caaDialog", action: "open", uri: item.uri });
        return createCompactRow({
          path: item.relativePath,
          status: item.selected ? "已交接" : "",
          statusClass: item.selected ? "applied" : "",
          onOpen: open,
          actions: [
            { text: "↗", title: "在 VS Code 中打开", onClick: open },
            { text: "□", title: "在 Desk Tools 中打开", onClick: () => vscode.postMessage({ type: "caaDialogAction", toolId: "caaDialog", action: "openExternal", uri: item.uri }) },
          ],
          title: item.relativePath,
        });
      });
      els.results.appendChild(createCompactGroup("CATDlg 文件 · " + rows.length + " 个", ts.caaSettingsText || "", items));
    }

    function renderEnvironment(ts) {
      els.environmentValues.innerHTML = "";
      els.pluginSettingValues.innerHTML = "";
      for (const item of ts.pluginSettingValues || []) {
        const row = document.createElement("div");
        row.className = "plugin-setting-row";
        row.title = item.label + " · " + item.value + " · " + item.source;
        const name = document.createElement("span");
        name.className = "plugin-setting-name";
        name.textContent = item.label;
        const value = document.createElement("span");
        value.className = "plugin-setting-value";
        value.textContent = item.value;
        row.append(name, value);
        els.pluginSettingValues.appendChild(row);
      }
      const values = ts.environmentValues || [];
      if (!values.length) {
        const empty = document.createElement("div");
        empty.className = "environment-row environment-empty";
        empty.textContent = ts.status === "running" ? "正在读取…" : "点击“刷新系统值”读取工程环境。";
        els.environmentValues.appendChild(empty);
        return;
      }
      for (const item of values) {
        const row = document.createElement("div");
        row.className = "environment-row";
        const head = document.createElement("div");
        head.className = "environment-row-head";
        const name = document.createElement("span");
        name.className = "environment-name";
        name.textContent = item.environmentVariable;
        name.title = item.environmentVariable;
        head.appendChild(name);
        if (item.required) {
          const required = document.createElement("span");
          required.className = "environment-required";
          required.textContent = "*";
          required.title = "必需";
          required.setAttribute("aria-label", "必需");
          head.appendChild(required);
        }
        const sourceLabel = item.value
          ? (item.pathExists === false ? "路径不存在" : item.source === "default" ? "默认" : "")
          : "未设定";
        const source = document.createElement("span");
        source.className = "environment-source" + (item.value && item.pathExists !== false ? " ready" : "");
        source.textContent = sourceLabel;
        source.title = item.value ? (item.source === "default" ? "使用默认值" : "来源：系统环境") : "未设定";
        if (sourceLabel) head.appendChild(source);
        head.title = item.environmentVariable + (item.required ? " · 必需" : "") + " · " + source.title;
        const value = document.createElement("input");
        value.type = "text";
        value.spellcheck = false;
        value.className = "environment-value" + (item.value ? "" : " missing");
        value.value = item.value || item.suggestedValue || "";
        value.placeholder = item.suggestedValue ? "建议值 " + item.suggestedValue : "输入目录或文件路径";
        value.title = item.value || "未设定";
        value.setAttribute("aria-label", item.environmentVariable);
        const actions = document.createElement("div");
        actions.className = "environment-row-actions";
        if (item.key !== "caaMkVersion" && item.key !== "sdkPrefix") {
          const pick = document.createElement("button");
          pick.type = "button";
          pick.className = "environment-icon-button environment-pick-button";
          pick.title = "选择目录";
          pick.setAttribute("aria-label", item.environmentVariable + "：选择目录");
          pick.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3h5l1.25 1.5h6.75v8.75H1.5V3zm1 1v8.25h11V5.5H7.28L6.03 4H2.5z"/></svg>';
          pick.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "pick", key: item.key, value: value.value });
          actions.appendChild(pick);
        }
        const save = document.createElement("button");
        save.type = "button";
        save.className = "environment-icon-button environment-save-button";
        save.title = item.value ? "保存变量" : "新建变量";
        save.setAttribute("aria-label", item.environmentVariable + "：" + save.title);
        save.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.35 12.2 2.6 8.45l.9-.9 2.85 2.85 6.15-6.15.9.9-7.05 7.05z"/></svg>';
        save.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "set", key: item.key, value: value.value });
        value.onkeydown = (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          save.click();
        };
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "environment-icon-button environment-clear-button";
        clear.title = "清除用户变量";
        clear.setAttribute("aria-label", item.environmentVariable + "：清除用户变量");
        clear.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2h4l.5 1H14v1h-1l-.75 9h-8.5L3 4H2V3h3.5L6 2zm-1.25 2l.67 8h5.16l.67-8h-6.5z"/></svg>';
        clear.disabled = !item.value;
        clear.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "clear", key: item.key });
        // 保存始终固定在最右侧；完整顺序为“删除 → 选择目录 → 保存”。
        // 悬停动作只从左侧展开，避免按钮换位造成连续点击时误操作。
        actions.prepend(clear);
        actions.append(save);
        const body = document.createElement("div");
        body.className = "environment-row-body";
        body.append(value, actions);
        row.append(head, body);
        els.environmentValues.appendChild(row);
      }
    }

    function activeTool() {
      return state.tools.find((t) => t.id === currentContentToolId());
    }

    function renderModuleBlock() {
      const content = state.moduleBlock;
      els.moduleBlock.innerHTML = "";
      if (!content) {
        const loading = document.createElement("p");
        loading.textContent = "模块界面正在载入…";
        els.moduleBlock.appendChild(loading);
        return;
      }
      const header = document.createElement("div");
      header.className = "block-header";
      const row = document.createElement("div");
      row.className = "block-header-row";
      const main = document.createElement("div");
      main.className = "block-header-main";
      if (content.status) {
        const status = document.createElement("span");
        status.className = "state " + (content.statusKind || "default");
        status.textContent = content.status;
        main.appendChild(status);
      }
      const title = document.createElement("h2");
      title.textContent = content.title || "模块工具";
      main.appendChild(title);
      if (content.description) {
        const description = document.createElement("p");
        description.textContent = content.description;
        main.appendChild(description);
      }
      row.appendChild(main);
      if ((content.headerActions || []).length) {
        const actions = document.createElement("div");
        actions.className = "block-header-actions";
        for (const action of content.headerActions) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "block-header-action";
          button.textContent = action.icon || action.title;
          button.title = action.title;
          button.setAttribute("aria-label", action.title);
          button.onclick = () => vscode.postMessage({ type: "moduleBlockAction", actionId: action.id });
          actions.appendChild(button);
        }
        row.appendChild(actions);
      }
      header.appendChild(row);
      const body = document.createElement("div");
      body.className = "module-block-body";
      body.innerHTML = content.html || "";
      els.moduleBlock.append(header, body);
    }

    function toolState() {
      return state.toolStates[currentContentToolId()] || { status: "idle" };
    }

    function renderEditorCompanion(ts) {
      const model = ts.editorCompanion;
      els.editorCompanionSummary.replaceChildren();
      els.editorCompanionActions.replaceChildren();
      if (!model) {
        els.editorCompanionStatus.textContent = "正在连接右侧 View…";
        els.editorCompanionStatus.className = "editor-companion-status";
        return;
      }
      const closed = model.lifecycle === "disposed";
      els.editorCompanionStatus.textContent = editorCompanionStatusText(model);
      els.editorCompanionStatus.className = "editor-companion-status " + (model.status || "idle");
      for (const item of model.summary || []) {
        const row = document.createElement("div");
        row.className = "editor-companion-summary-row";
        const label = document.createElement("span");
        label.className = "editor-companion-summary-label";
        label.textContent = item.label;
        const value = document.createElement("span");
        value.className = "editor-companion-summary-value";
        value.textContent = item.value;
        value.title = item.value;
        row.append(label, value);
        els.editorCompanionSummary.appendChild(row);
      }
      for (const action of model.actions || []) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        button.className = action.tone || "secondary";
        button.disabled = closed || !model.ready || !action.enabled;
        button.title = button.disabled ? (action.disabledReason || "当前动作不可用。") : action.label;
        button.setAttribute("aria-label", action.label);
        button.onclick = () => vscode.postMessage({
          type: "editorCompanionAction",
          panelId: model.panelId,
          toolId: model.toolId,
          sessionId: model.sessionId,
          revision: model.revision,
          actionId: action.id,
        });
        els.editorCompanionActions.appendChild(button);
      }
    }

    function postProjectRenamePrimaryAction(model, actionId, value) {
      if (!model || !actionId) return;
      vscode.postMessage({
        type: "editorCompanionAction",
        panelId: model.panelId,
        toolId: model.toolId,
        sessionId: model.sessionId,
        revision: model.revision,
        actionId,
        ...(typeof value === "string" ? { value: value.slice(0, 4096) } : {}),
      });
    }

    function renderProjectRenamePrimary(ts) {
      const companion = ts.editorCompanion;
      const model = companion?.primary?.kind === "projectRename"
        ? companion.primary.model
        : null;
      if (!companion || !model) return;
      const closed = companion.lifecycle === "disposed" || !companion.ready;
      const busy = companion.status === "running";
      const actions = new Map((companion.actions || []).map((action) => [action.id, action]));
      const choose = actions.get("chooseRoot");
      els.projectRenamePrimaryRoot.textContent = model.rootParent
        ? (model.rootName + " @ " + model.rootParent)
        : (model.rootName || model.root || "未选择分析目录");
      els.projectRenamePrimaryRoot.title = model.root || "未选择分析目录";
      els.projectRenamePrimaryRoot.setAttribute("aria-label", model.root || "未选择分析目录");
      els.projectRenamePrimaryChoose.disabled = closed || !choose?.enabled;
      els.projectRenamePrimaryChoose.title = els.projectRenamePrimaryChoose.disabled
        ? (choose?.disabledReason || "当前不可选择目录。")
        : "为项目改名选择分析目录";
      els.projectRenamePrimaryChoose.onclick = () => postProjectRenamePrimaryAction(companion, "chooseRoot");

      els.projectRenamePrimaryActions.replaceChildren();
      const actionTitles = {
        reveal: "回到项目改名 View",
        cancel: "取消分析",
        openGitChanges: "打开 Git 对比",
        renameRoot: model.rootRename
          ? "重命名根目录：" + model.rootRename.sourcePath + " → " + model.rootRename.targetPath
          : "当前没有根目录改名建议",
      };
      for (const actionId of ["reveal", "cancel", "openGitChanges", "renameRoot"]) {
        const action = actions.get(actionId);
        if (!action) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        button.disabled = closed || !action.enabled;
        button.title = button.disabled
          ? (action.disabledReason || "当前动作不可用。")
          : (actionTitles[actionId] || action.label);
        button.setAttribute("aria-label", actionTitles[actionId] || action.label);
        button.onclick = () => postProjectRenamePrimaryAction(companion, actionId);
        els.projectRenamePrimaryActions.appendChild(button);
      }

      const overview = model.overview || { items: 0, replacements: 0, lowRisk: 0, mediumRisk: 0, highRisk: 0, categories: 0 };
      els.projectRenamePrimaryOverview.replaceChildren();
      for (const [label, value] of [
        ["项目", overview.items], ["替换", overview.replacements], ["低风险", overview.lowRisk],
        ["中风险", overview.mediumRisk], ["高风险", overview.highRisk], ["分类", overview.categories],
      ]) {
        const metric = document.createElement("span");
        const strong = document.createElement("strong");
        strong.textContent = String(value);
        const small = document.createElement("small");
        small.textContent = label;
        metric.append(strong, small);
        els.projectRenamePrimaryOverview.appendChild(metric);
      }

      const loadScheme = actions.get("loadScheme");
      const deleteScheme = actions.get("deleteScheme");
      const clearSchemes = actions.get("clearSchemes");
      els.projectRenamePrimaryScheme.model = {
        ariaLabel: "选择改名方案",
        placeholder: "选择改名方案…",
        emptyText: "暂无可用方案",
        items: (model.schemeOptions || []).map((optionModel) => ({
          id: optionModel.id,
          label: optionModel.label,
          group: optionModel.group,
          title: optionModel.label,
          removable: optionModel.group !== "共享档案" && !!deleteScheme?.enabled,
          removeDisabledReason: optionModel.group === "共享档案"
            ? "共享档案不能在此删除"
            : (deleteScheme?.disabledReason || "当前本机方案不能删除"),
        })),
        selectedId: model.selectedSchemeId || "",
        disabled: closed || !loadScheme?.enabled,
        disabledReason: loadScheme?.disabledReason || "当前项目方案、本机最近输入与共享档案",
        clearEnabled: !closed && !!clearSchemes?.enabled,
        clearLabel: "全部清空",
        clearDisabledReason: clearSchemes?.disabledReason || "当前没有可清空的本机方案",
      };
      els.projectRenamePrimaryProfileCount.textContent = (model.schemeOptions || []).length + " 个方案";
      if (document.activeElement !== els.projectRenamePrimaryProfileName) {
        els.projectRenamePrimaryProfileName.value = model.profileName || "";
      }
      els.projectRenamePrimaryProfileName.disabled = closed || busy || !!model.profileError;
      els.projectRenamePrimaryProfileName.title = model.profileError || "保存到当前项目的共享规则档案";
      const save = actions.get("saveProfile");
      els.projectRenamePrimarySave.disabled = closed || !save?.enabled || !els.projectRenamePrimaryProfileName.value.trim();
      els.projectRenamePrimarySave.title = model.profileError || (save?.disabledReason || "保存当前改名规则档案");

      els.projectRenamePrimaryStatus.textContent = editorCompanionStatusText(companion);
      els.projectRenamePrimaryStatus.className = "project-rename-primary-status " + (companion.status || "idle");
      els.projectRenamePrimarySummary.replaceChildren();
      for (const item of (companion.summary || []).filter((entry) => entry.label !== "目录")) {
        const term = document.createElement("dt");
        term.textContent = item.label;
        const description = document.createElement("dd");
        description.textContent = item.value;
        description.title = item.value;
        els.projectRenamePrimarySummary.append(term, description);
      }
    }

    function renderAutoBuildPrimary(ts) {
      const companion = ts.editorCompanion;
      const projection = companion?.primary?.kind === "autoBuild"
        ? companion.primary.model
        : null;
      els.autoBuildPrimaryPanel.model = companion && projection
        ? Object.assign({}, projection, {
            status: companion.status,
            statusText: editorCompanionStatusText(companion),
            ready: companion.ready,
            actions: companion.actions || [],
          })
        : undefined;
    }

    const editorCompanionStatusText = ${ktcEditorCompanionStatusText.toString()};
    const searchReplaceButtonState = ${ktcSearchReplaceButtonState.toString()};
    const simpleRenameRules = ${ktcSimpleRenameRules.toString()};
    function renderWorkingContext() {
      renderReplaceIgnoreSummary();
      const context = state.workingContext || {};
      els.workingContextShell.model = {
        label: "目录",
        value: context.label || context.selectedDirectory || "未打开目录",
      };
    }

    function renderReplaceIgnoreSummary() {
      const context = state.workingContext || {};
      const config = state.ignoreConfig;
      const ignoreEnabled = context.ignoreEnabled !== false;
      els.replaceIgnoreBuiltIn.checked = context.builtInIgnoreEnabled !== false;
      els.replaceIgnoreGit.checked = context.gitIgnoreEnabled !== false;
      els.replaceIgnoreCustomEnabled.checked = context.customIgnoreEnabled === true;
      els.replaceIgnoreBuiltIn.disabled = !ignoreEnabled;
      els.replaceIgnoreGit.disabled = !ignoreEnabled;
      els.replaceIgnoreCustomEnabled.disabled = !ignoreEnabled;
      els.btnToggleReplaceIgnore.textContent = ignoreEnabled ? "停用" : "启用";
      els.btnToggleReplaceIgnore.setAttribute("aria-pressed", String(ignoreEnabled));
      els.btnToggleReplaceIgnore.title = ignoreEnabled ? "停用三个可选 Ignore 来源" : "恢复上次选择的 Ignore 来源";
      const customCount = config?.patternCount || 0;
      const selectedCount = [context.builtInIgnoreEnabled !== false, context.gitIgnoreEnabled !== false, context.customIgnoreEnabled === true].filter(Boolean).length;
      els.replaceIgnoreState.textContent = ignoreEnabled
        ? "已启用 · " + selectedCount + "/3 来源" + (context.customIgnoreEnabled === true ? " · 自定义 " + customCount : "")
        : "已停用 · 安全排除保留";
    }

    function renderCodegen(ts, running) {
      const model = ts.codegen;
      els.codegenPanel.model = model
        ? Object.assign({}, model, { running: !!running })
        : undefined;
    }

    function renderRun(ts, running) {
      const model = ts.run;
      els.runPanel.model = model ? Object.assign({}, model, { running: !!running }) : undefined;
    }

    function renderGit(ts, running) {
      const workspaceAvailable = els.workspace.textContent !== "（未打开工作区）";
      els.gitPanel.model = gitPanelModel(ts, workspaceAvailable);
      if (ts.git) {
        gitRefreshRequested = false;
      } else if (!running && !gitRefreshRequested) {
        gitRefreshRequested = true;
        queueMicrotask(() => vscode.postMessage({
          type: "gitAction",
          toolId: "git",
          action: "refresh",
        }));
      }
    }

    function renderGitRepositoryContext(ts, running, git) {
      els.workspaceMeta.hidden = !git;
      els.workspaceContextLabel.textContent = "仓库：";
      els.workspace.hidden = true;
      els.gitRepositorySelect.hidden = !git;
      els.gitRepositoryAdd.hidden = !git;
      els.gitRepositoryRefresh.hidden = !git;
      if (!git) {
        els.gitRepositoryRemove.hidden = true;
        els.workspaceMeta.title = "";
        return;
      }
      const model = ts.git;
      const projects = model?.projects || [];
      const repositoryLabels = gitRepositoryOptionLabels(projects.map((project) => project.repository));
      const labelsByRepositoryId = new Map(projects.map((project, index) => [
        project.repository.id,
        repositoryLabels[index] || project.repository.name,
      ]));
      els.gitRepositorySelect.innerHTML = "";
      if (!projects.length) {
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "未发现 Git 仓库";
        els.gitRepositorySelect.appendChild(empty);
      } else {
        const groups = new Map();
        for (const project of projects) {
          const repository = project.repository;
          const label = repository.groupLabel || "当前工作区";
          let group = groups.get(label);
          if (!group) {
            group = document.createElement("optgroup");
            group.label = label;
            groups.set(label, group);
            els.gitRepositorySelect.appendChild(group);
          }
          const option = document.createElement("option");
          option.value = repository.id;
          option.textContent = labelsByRepositoryId.get(repository.id) || repository.name;
          option.title = repository.name + " · " + repository.id;
          group.appendChild(option);
        }
      }
      els.gitRepositorySelect.value = model?.selectedRepositoryId || projects[0]?.repository.id || "";
      const selected = projects.find((project) => project.repository.id === els.gitRepositorySelect.value)?.repository;
      els.workspaceMeta.title = selected ? selected.name + " · " + selected.id : "当前工作区未发现 Git 仓库";
      els.gitRepositorySelect.setAttribute(
        "aria-label",
        selected ? "Git 仓库：" + selected.name + " · " + selected.id : "Git 仓库",
      );
      els.gitRepositorySelect.disabled = running || projects.length <= 1;
      els.gitRepositoryAdd.disabled = running;
      els.gitRepositoryRefresh.disabled = running;
      els.gitRepositoryRemove.hidden = !selected?.external;
      els.gitRepositoryRemove.disabled = running;
    }

    function renderWelcome() {
      els.welcomeProducts.replaceChildren();
      for (const extension of state.extensionInstallations || []) {
        const row = document.createElement("div");
        row.className = "welcome-product";

        const icon = document.createElement("div");
        icon.className = "welcome-product-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = extension.moduleId === "cad" ? "CAD" : "CODE";

        const main = document.createElement("div");
        main.className = "welcome-product-main";
        const title = document.createElement("div");
        title.className = "welcome-product-title";
        title.textContent = extension.title;
        const meta = document.createElement("div");
        meta.className = "welcome-product-meta";
        meta.textContent = extension.installed
          ? "版本 " + (extension.version || "未知")
          : (extension.moduleId === "cad" ? "可选 CAD 模块" : "基础 Code 模块");
        main.append(title, meta);

        const actions = document.createElement("div");
        actions.className = "welcome-product-status";
        const status = document.createElement("span");
        status.className = "welcome-status" + (extension.installed ? "" : " missing");
        status.textContent = extension.installed ? "已安装" : "未安装";
        actions.appendChild(status);
        if (!extension.installed) {
          const install = document.createElement("button");
          install.className = "welcome-install";
          install.type = "button";
          install.textContent = "安装";
          install.title = "安装 " + extension.title;
          install.onclick = () => vscode.postMessage({
            type: "welcomeAction",
            action: "installExtension",
            extensionId: extension.id,
          });
          actions.appendChild(install);
        }
        row.append(icon, main, actions);
        els.welcomeProducts.appendChild(row);
      }
    }

    function renderToolbarStrip() {
      const groupContentVisible = isCodeAssistantGroupActive();
      const treeUi = state.codeAssistantTreeUiState || {};
      els.codeAssistantNavigator.hidden = !groupContentVisible;
      els.codeAssistantNavigator.model = {
        presentation: "compact",
        title: "功能目录",
        nodes: codeAssistantNavigation,
        showLabels: treeUi.showLabels !== false,
        activeToolId: (state.openToolIds || []).includes(state.activeToolId) ? state.activeToolId : "",
      };
      els.ribbonShell.model = {
        mode: state.sidebarStyle === "compact" ? "compact" : "expanded",
        groupContentVisible,
        overflowOpen: openModuleMenuId === "all",
      };
    }

    function syncToolbarOverflowMenu() {
      const more = document.querySelector(".module-more-global");
      if (!more) return;
      const shouldOpen = openModuleMenuId === "all";
      if (more.open !== shouldOpen) more.open = shouldOpen;
      if (!shouldOpen) return;
      const moreMenu = more.querySelector(".module-more-menu");
      const customization = more.querySelector("ktc-ribbon-customization-menu");
      if (!moreMenu) return;
      requestAnimationFrame(() => {
        placeModuleMoreMenu(els.ribbonShell, moreMenu);
        if (focusRibbonMenuRequested) {
          focusRibbonMenuRequested = false;
          if (customization) customization.focusFirst();
        }
      });
    }

    function renderCodeAssistantArea(reorderState, running) {
      const treeUi = state.codeAssistantTreeUiState;
      const reorder = isReorderMembersTool();
      els.codeAssistantReorderActions.open = !!treeUi.reorderActionsExpanded;
      els.codeAssistantReorderResults.open = !!treeUi.reorderResultsExpanded;
      els.codeAssistantEmpty.hidden = reorder;
      els.codeAssistantReorderActions.hidden = !reorder;
      els.codeAssistantReorderResults.hidden = !reorder;
      els.btnCodeAssistantReorderClose.hidden = true;
      if (!reorder) return;
      const rows = reorderState.reorderResults || [];
      const pending = rows.filter((row) => row.state === "pending");
      const selected = new Set(reorderState.reorderSelectedUris || pending.map((row) => row.uri));
      const selectedPending = pending.filter((row) => selected.has(row.uri));
      els.btnCodeAssistantReorderScan.disabled = running;
      els.btnCodeAssistantReorderApply.disabled = running || selectedPending.length === 0;
      els.btnCodeAssistantReorderApply.textContent = selectedPending.length
        ? "应用所选（" + selectedPending.length + "）"
        : "应用所选";
      els.codeAssistantReorderStatus.textContent = reorderState.message
        || "扫描当前工作目录中的 C++ 头文件和源文件；写入前会再次确认文件没有变化。";
      els.codeAssistantReorderResultCount.textContent = rows.length
        ? "扫描 " + (reorderState.scanned || rows.length) + " · 可排序 " + pending.length
        : "尚未扫描";
      els.reorderMembersPanel.model = {
        presentation: "results",
        status: reorderState.status,
        message: reorderState.message,
        scanned: reorderState.scanned,
        reorderResults: reorderState.reorderResults,
        reorderRevision: reorderState.reorderRevision,
        reorderSelectedUris: reorderState.reorderSelectedUris,
      };
    }

    function render() {
      document.body.classList.toggle("detail-block", state.presentation === "detailBlock");
      const welcomeMode = (state.openToolIds || []).length === 0;
      els.workingContextShell.hidden = !state.directoryVisible;
      // Directory is a fixed shell region, so keep its projection current even
      // when Welcome or an optional-module Block returns before Code rendering.
      renderWorkingContext();
      document.body.classList.toggle("welcome-mode", welcomeMode);
      els.welcomePanel.hidden = !welcomeMode;
      const tool = activeTool();
      const activeOpenTool = !welcomeMode && (state.openToolIds || []).includes(state.activeToolId)
        ? tool
        : undefined;
      els.currentToolRegion.model = activeOpenTool
        ? { itemId: activeOpenTool.id, title: activeOpenTool.title, icon: semanticToolIcon(activeOpenTool.id) }
        : { itemId: "", title: "KT Auto Code", icon: "layout" };
      const openItemsModel = {
        items: (state.openToolIds || []).flatMap((toolId) => {
          const item = state.tools.find((candidate) => candidate.id === toolId);
          return item ? [{
            id: item.id,
            title: item.title,
            shortTitle: item.shortTitle || item.title,
            icon: semanticToolIcon(item.id),
          }] : [];
        }),
        activeId: activeOpenTool?.id || "",
        overflowLabel: "全部打开项",
      };
      const nextOpenItemsModelSignature = JSON.stringify(openItemsModel);
      if (nextOpenItemsModelSignature !== openItemsModelSignature) {
        const openItemsHadFocus = Boolean(els.openItemsBar.shadowRoot?.activeElement);
        openItemsModelSignature = nextOpenItemsModelSignature;
        els.openItemsBar.model = openItemsModel;
        if (openItemsHadFocus) focusOpenItemsRequested = true;
      }
      if (focusOpenItemsRequested) {
        focusOpenItemsRequested = false;
        queueMicrotask(() => {
          if (!els.openItemsBar.focusActiveItem()) els.currentToolRegion.focusContent();
        });
      }
      els.desc.textContent = activeOpenTool?.description || "";
      els.btnProjectRenameAnalysis.hidden = welcomeMode || tool?.id !== "codeRename";
      const toolbarProjection = {
        activeToolId: state.activeToolId,
        openToolIds: state.openToolIds || [],
        installedModuleIds: state.moduleState.installed || ["code"],
        visibleModuleIds: state.moduleState.visible || ["code"],
        activeModuleId: state.moduleState.active || "code",
        pinnedToolIds: state.ribbonLayout.pinnedToolIds || [],
        toolOrder: state.ribbonLayout.toolOrder || [],
        tools: state.tools.map((item) => ({
          id: item.id,
          title: item.title,
          shortTitle: item.shortTitle,
          icon: item.icon,
          moduleId: item.moduleId,
          moduleTitle: item.moduleTitle,
          kind: item.kind || "tool",
          ribbonVisible: item.ribbonVisible !== false,
          command: item.command,
        })),
      };
      const nextToolbarProjectionSignature = JSON.stringify(toolbarProjection);
      renderToolbarStrip();
      // Running progress and unrelated tool state must not replace the slotted
      // Ribbon or its external menu while a keyboard user is interacting with it.
      if (nextToolbarProjectionSignature !== toolbarProjectionSignature) {
        const toolbarMenuHadFocus = Boolean(document.querySelector(".module-more-global")?.contains(document.activeElement));
        if (toolbarMenuHadFocus && openModuleMenuId === "all") focusRibbonMenuRequested = true;
        toolbarProjectionSignature = nextToolbarProjectionSignature;
      els.tabs.innerHTML = "";
      for (const staleMenu of document.querySelectorAll(".module-more-global")) staleMenu.remove();
      els.tabs.className = "tabs ribbon";
      els.tabs.title = (state.openToolIds || []).length
        ? "已打开 " + state.openToolIds.length + " 个工具 Block"
        : "没有打开的工具 Block";
      const visibleModules = state.moduleState.visible || ["code"];
      const pinned = new Set(state.ribbonLayout.pinnedToolIds || []);
      const customizationTools = orderedTools(state.tools.filter((item) => (
        (state.moduleState.installed || ["code"]).includes(item.moduleId || "code")
        && item.ribbonVisible !== false
        && item.id !== "environmentSettings"
        && item.id !== "ignoreSettings"
      )));
      const openTool = (tool, source) => {
        if (tool.kind === "group") {
          state.codeAssistantTreeUiState.treeExpanded = !isCodeAssistantGroupActive();
          const groupMruToolId = codeAssistantGroupMruToolId();
          persistCodeAssistantTreeUiState();
          render();
          if (groupMruToolId) {
            vscode.postMessage({ type: "activateOpenTool", toolId: groupMruToolId });
          }
          return;
        }
        const isModuleTool = (tool.moduleId || "code") !== "code" && !!tool.command;
        if (isModuleTool) vscode.postMessage({ type: "runModuleTool", moduleId: tool.moduleId, command: tool.command });
        else vscode.postMessage({ type: "selectTool", toolId: tool.id, source });
      };
      for (const moduleId of visibleModules) {
        const moduleTools = orderedTools(state.tools.filter((item) => (
          (item.moduleId || "code") === moduleId
          && item.ribbonVisible !== false
          && item.id !== "environmentSettings"
          && item.id !== "ignoreSettings"
        )));
        if (!moduleTools.length) continue;
        const codeAssistantGroupActive = isCodeAssistantGroupActive();
        const codeAssistantGroupHasOpenTool = !!codeAssistantGroupMruToolId();
        const visibleTools = moduleTools.filter((tool) => (
          pinned.has(tool.id)
          || tool.id === state.activeToolId
          || (tool.kind === "group" && (codeAssistantGroupActive || codeAssistantGroupHasOpenTool))
        ));
        const group = document.createElement("div");
        group.className = "module-group";
        group.dataset.moduleId = moduleId;
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", (moduleTools[0].moduleTitle || moduleId) + " 模块");
        const groupLabel = document.createElement("div");
        groupLabel.className = "module-group-label" + (moduleId === state.moduleState.active ? " active" : "");
        groupLabel.textContent = (moduleTools[0].moduleTitle || moduleId).toUpperCase();
        groupLabel.title = (moduleTools[0].moduleTitle || moduleId) + " 模块";
        const groupTools = document.createElement("div");
        groupTools.className = "module-group-tools";
        for (const t of visibleTools) {
          const btn = document.createElement("button");
          const isOpen = (state.openToolIds || []).includes(t.id);
          const isActiveModule = (t.moduleId || "code") === state.moduleState.active;
          const hasGroupContent = t.kind === "group";
          const isGroupActive = hasGroupContent && isCodeAssistantGroupActive();
          const isActive = isGroupActive || (isOpen && isActiveModule && t.id === state.activeToolId);
          btn.className = "tab" + (isOpen ? " open" : "") + (isActive ? " active" : "");
          btn.type = "button";
          btn.setAttribute("aria-pressed", isActive ? "true" : "false");
          if (hasGroupContent) {
            btn.dataset.nodeKind = "group";
            btn.setAttribute("aria-expanded", String(isGroupActive));
            btn.setAttribute("aria-controls", "code-assistant-navigator");
          }
          const icon = document.createElement("span");
          icon.setAttribute("aria-hidden", "true");
          if (t.icon && t.icon.includes(":")) {
            icon.className = "tool-icon";
            icon.style.setProperty("--tool-icon", 'url("' + t.icon.replace(/"/g, "") + '")');
          } else {
            icon.className = "tool-icon-fallback";
            icon.textContent = Array.from(String(t.shortTitle || t.title || "?").trim())[0] || "?";
          }
          btn.appendChild(icon);
          const label = document.createElement("span");
          label.className = "ribbon-tool-label";
          label.textContent = t.shortTitle || t.title;
          btn.appendChild(label);
          if (hasGroupContent) {
            const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            chevron.classList.add("ribbon-group-chevron");
            chevron.setAttribute("viewBox", "0 0 16 16");
            chevron.setAttribute("aria-hidden", "true");
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", "M4 6l4 4 4-4");
            chevron.append(path);
            btn.appendChild(chevron);
          }
          const openState = hasGroupContent
            ? (isGroupActive ? " · 已展开" : " · 已收起")
            : (isActive ? " · 当前显示" : (isOpen ? " · 已打开，当前隐藏" : ""));
          const countState = !hasGroupContent && isOpen ? " · 共打开 " + state.openToolIds.length + " 个" : "";
          btn.title = t.title + openState + countState;
          btn.dataset.tooltip = t.title + openState + countState;
          btn.setAttribute("aria-label", t.title + openState);
          if (isActive && !hasGroupContent) {
            btn.setAttribute("aria-controls", "current-tool-region");
          }
          btn.onclick = () => openTool(t, "ribbon");
          btn.draggable = pinned.has(t.id);
          btn.dataset.toolId = t.id;
          btn.dataset.moduleId = moduleId;
          btn.ondragstart = (event) => {
            if (!pinned.has(t.id) || !event.dataTransfer) { event.preventDefault(); return; }
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", t.id);
            btn.classList.add("dragging");
          };
          btn.ondragend = () => btn.classList.remove("dragging");
          btn.ondragover = (event) => {
            const sourceId = event.dataTransfer?.getData("text/plain") || "";
            const source = state.tools.find((tool) => tool.id === sourceId);
            if (!source || sourceId === t.id || (source.moduleId || "code") !== moduleId || !pinned.has(t.id)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
            btn.classList.add("drag-target");
          };
          btn.ondragleave = () => btn.classList.remove("drag-target");
          btn.ondrop = (event) => {
            event.preventDefault();
            btn.classList.remove("drag-target");
            const sourceId = event.dataTransfer?.getData("text/plain") || "";
            const rect = btn.getBoundingClientRect();
            const after = Math.abs(event.clientY - (rect.top + rect.height / 2)) > rect.height / 2
              ? event.clientY > rect.top + rect.height / 2
              : event.clientX > rect.left + rect.width / 2;
            movePinnedTool(sourceId, t.id, after);
          };
          groupTools.appendChild(btn);
        }
        group.append(groupLabel, groupTools);
        els.tabs.appendChild(group);
      }
      if (customizationTools.length) {
        const more = document.createElement("details");
        more.className = "module-more module-more-global";
        const moreSummary = document.createElement("summary");
        moreSummary.textContent = "…";
        moreSummary.title = "全部工具与固定设置";
        moreSummary.setAttribute("aria-label", moreSummary.title);
        const moreMenu = document.createElement("div");
        moreMenu.className = "module-more-menu";
        more.ontoggle = () => {
          openModuleMenuId = more.open ? "all" : "";
          renderToolbarStrip();
        };
        const customization = document.createElement("ktc-ribbon-customization-menu");
        customization.model = {
          tools: customizationTools.map((item) => ({
            id: item.id,
            title: item.title,
            shortTitle: item.shortTitle || item.title,
            moduleId: item.moduleId || "code",
            moduleTitle: item.moduleTitle || item.moduleId || "Code",
          })),
          pinnedToolIds: state.ribbonLayout.pinnedToolIds || [],
          visibleModuleIds: state.moduleState.visible || ["code"],
        };
        customization.addEventListener("ktc-ribbon-customization-menu-action", (event) => {
          const detail = event.detail || {};
          if (detail.kind === "open") {
            const selected = state.tools.find((item) => item.id === detail.toolId);
            if (!selected) return;
            openModuleMenuId = "";
            more.open = false;
            openTool(selected, "menu");
          } else if (detail.kind === "togglePin") {
            toggleToolPin(detail.toolId);
          } else if (detail.kind === "toggleModule") {
            vscode.postMessage({ type: "toggleRibbonModule", moduleId: detail.moduleId });
          } else if (detail.kind === "resetCodeLayout") {
            vscode.postMessage({ type: "resetCodeRibbonLayout" });
          } else if (detail.kind === "move") {
            movePinnedTool(detail.sourceId, detail.targetId, detail.placement === "after");
          }
        });
        moreMenu.appendChild(customization);
        more.append(moreSummary, moreMenu);
        document.body.appendChild(more);
      }
      }
      syncToolbarOverflowMenu();
      if (welcomeMode) {
        document.body.classList.remove("external-module-block");
        els.moduleBlock.hidden = true;
        renderWelcome();
        return;
      }
      const externalModuleBlock = state.presentation === "detailBlock" && state.moduleState.active !== "code";
      document.body.classList.toggle("external-module-block", externalModuleBlock);
      els.moduleBlock.hidden = !externalModuleBlock;
      if (externalModuleBlock) {
        renderModuleBlock();
        return;
      }
      const ts = toolState();
      const reorderState = state.toolStates.reorderMembers || { status: "idle" };
      const reorder = isReorderMembersTool();
      const running = ts.status === "running";
      document.body.classList.toggle("task-running", running);
      const enc = isEncodingTool();
      const header = isHeaderAsciiTool();
      const rename = isCodeRenameTool();
      const codegen = isCodegenTool();
      const run = isRunTool();
      const git = isGitTool();
      const ignore = isIgnoreTool();
      const uuid = isUuidTool();
      const caaDialog = isCaaDialogTool();
      const environment = isEnvironmentTool();
      const editorCompanion = isEditorCompanionTool();
      const autoBuildPrimary = editorCompanion && currentContentToolId() === "autoBuild";
      const projectRenamePrimary = editorCompanion
        && currentContentToolId() === "projectRename"
        && ts.editorCompanion?.primary?.kind === "projectRename";
      const genericActionFeature = enc || header || uuid || caaDialog;
      els.btnProjectRenameAnalysis.disabled = running;
      renderGitRepositoryContext(ts, running, git);
      document.body.classList.toggle("codegen-tool", codegen);
      document.body.classList.toggle("run-tool", run);
      document.body.classList.toggle("git-tool", git);
      // 代码辅助目录与成员排序复用一个容器，但始终是两个直接 toolId 的投影。
      els.desc.hidden = ignore || reorder || genericActionFeature || editorCompanion;
      els.editorCompanionBlock.hidden = !editorCompanion || autoBuildPrimary || projectRenamePrimary;
      els.projectRenamePrimary.hidden = !projectRenamePrimary;
      els.autoBuildPrimaryPanel.hidden = !autoBuildPrimary;
      if (autoBuildPrimary) renderAutoBuildPrimary(ts);
      else if (projectRenamePrimary) renderProjectRenamePrimary(ts);
      else if (editorCompanion) renderEditorCompanion(ts);
      els.replaceBlock.hidden = !rename;
      els.codeAssistantBlock.hidden = !reorder;
      if (reorder) els.primaryBody.insertBefore(els.codeAssistantBlock, els.primaryBody.firstElementChild);
      els.codegenPanel.hidden = !codegen;
      els.runPanel.hidden = !run;
      els.gitPanel.hidden = !git;
      els.uuidResultsPanel.hidden = !uuid;
      els.renameResultsPanel.hidden = !rename;
      els.ignorePanel.hidden = !ignore;
      els.environmentBlock.hidden = !environment;
      els.codeAssistantGenericActions.hidden = !genericActionFeature;
      els.codeAssistantGenericTitle.textContent = enc
        ? "编码操作"
        : header
          ? "头文件操作"
          : uuid
            ? "UUID 操作"
            : "CAA UI 操作";
      els.btnCodeAssistantGenericClose.hidden = true;
      els.generalActions.hidden = !genericActionFeature;
      els.uuidOptions.hidden = !uuid;
      els.uuidStrategy.value = state.uuidStrategy;
      els.uuidStrategy.disabled = running;
      els.uuidStrategyHint.textContent = state.uuidStrategy === "fresh_per_hit"
        ? "每个命中生成不同 UUID，可能打破原有引用关系；仅在确认每处都应拥有独立身份时使用。"
        : "相同旧 UUID 在所有文件中替换为同一个新 UUID；策略在扫描时固定。";
      els.uuidStrategyHint.className = "hint" + (state.uuidStrategy === "fresh_per_hit" ? " warning" : "");
      els.compactTools.hidden = !caaDialog;
      els.btnCaaCheckConnection.hidden = !caaDialog;
      els.btnCaaCheckConnection.textContent = ts.caaDeskConnection?.status === "online" ? "重新检测" : "连接 Desk Tools";
      els.btnScan.disabled = running;
      els.btnFix.disabled = running;
      els.btnScan.textContent = rename ? "打开" : (ignore ? "打开规则" : (uuid ? "扫描 UUID" : (caaDialog ? "扫描 CATDlg" : "预检")));
      els.btnFix.textContent = enc ? "按目标转换" : (ignore ? "从 .gitignore 同步" : (uuid ? "替换所选" : (caaDialog ? "Desk Tools 设置" : "修复")));
      els.btnFix.style.display = rename ? "none" : "inline-block";

      els.targetHint.hidden = !enc;
      if (enc) renderEncodingTargetSettings(running);
      els.scopeBlock.hidden = rename || reorder || codegen || run || git || ignore || uuid || caaDialog || environment || editorCompanion;

      if (codegen) renderCodegen(ts, running);
      if (run) renderRun(ts, running);
      if (git) renderGit(ts, running);

      if (reorder) renderCodeAssistantArea(reorderState, running);
      if (uuid) syncUuidResultsPanel(ts);
      if (rename) syncRenameResultsPanel(ts);

      if (rename) {
        els.replaceSearch.value = state.replace.search;
        els.replaceWith.value = state.replace.with;
        els.replaceText.checked = state.replace.text;
        els.replaceFile.checked = state.replace.file;
        els.replaceDir.checked = state.replace.dir;
        els.replaceBlock.classList.toggle("collapsed", !!state.replace.collapsed);
        els.replaceToggle.textContent = state.replace.collapsed ? "›" : "⌄";
        els.replaceToggle.title = state.replace.collapsed ? "展开替换行" : "收起替换行";
        els.replaceToggle.setAttribute("aria-expanded", state.replace.collapsed ? "false" : "true");
        els.defaultEncoding.value = state.replace.defaultEncoding;
        renderRenameHelpers(ts, running);
        els.replacePreview.disabled = running;
        els.replaceApply.disabled = running;
        updateReplaceButtons();
      }

      els.scopeHeaders.checked = !!state.scope.includeHeaders;
      els.scopeSource.checked = !!state.scope.includeSource;
      els.scopeMd.checked = !!state.scope.includeMarkdown;
      els.scopeMdWrap.className = enc ? "" : "disabled";
      els.scopeMd.disabled = !enc;

      syncIgnorePrimaryPanel(state.toolStates.ignoreSettings || { status: "idle" });

      els.optionsPanel.hidden = rename || reorder || codegen || run || git || ignore || uuid || caaDialog || environment || editorCompanion;
      els.headerOptions.hidden = enc;
      els.encodingOptions.hidden = !enc;
      els.showDetailsWrap.hidden = !header;
      if (!enc) {
        els.preserveGbk.checked = !!toolOptions().preserveGbk;
        els.stripBom.checked = !!toolOptions().stripBom;
        els.showDetails.checked = !!state.showDetails;
        updateOptHint();
      } else {
        els.encDetails.checked = !!state.showEncDetails;
        updateOptHint();
      }

      els.status.textContent = ts.message || "";
      els.status.className = "status" + (ts.status === "error" ? " error" : "");
      els.status.hidden = reorder || codegen || run || git || ignore || editorCompanion;
      els.resultsTitle.hidden = reorder || codegen || run || git || rename || ignore || uuid || environment || editorCompanion;
      els.results.hidden = reorder || codegen || run || git || rename || ignore || uuid || environment || editorCompanion;
      els.results.innerHTML = "";
      els.resultsTitle.textContent = header ? "问题文件" : (enc ? "编码结果" : (rename ? "替换结果" : (ignore ? "推荐规则" : (uuid ? "UUID 结果" : (caaDialog ? "CATDlg 文件" : "结果")))));

      if (environment) {
        renderEnvironment(ts);
        els.empty.style.display = "none";
      } else if (codegen) {
        els.empty.style.display = "none";
      } else if (reorder) {
        els.empty.style.display = "none";
      } else if (run) {
        els.empty.style.display = "none";
      } else if (git) {
        els.empty.style.display = "none";
      } else if (editorCompanion) {
        els.empty.style.display = "none";
      } else if (header) {
        renderHeaderResults(ts, !!state.showDetails);
      } else if (enc) {
        renderEncodingResults(ts, !!state.showEncDetails);
      } else if (rename) {
        els.empty.style.display = "none";
      } else if (ignore) {
        els.empty.style.display = "none";
      } else if (uuid) {
        els.empty.style.display = "none";
      } else if (caaDialog) {
        renderCaaResults(ts);
      } else {
        els.empty.style.display = "block";
      }
    }

    function escapeHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    els.btnScan.onclick = () => {
      if (isIgnoreTool()) vscode.postMessage({ type: "openIgnoreFile" });
      else vscode.postMessage({
        type: "run",
        toolId: currentContentToolId(),
        action: isCodeRenameTool() ? "open" : "scan",
        uuidStrategy: isUuidTool() ? state.uuidStrategy : undefined,
      });
    };
    function activateCodeAssistantNavigatorTool(toolId) {
      if (toolId === "packageIncludes" || toolId === "autoBuild") {
        // Editor View features keep the navigator visible and reuse the existing
        // Host route; the component itself never owns an executable action.
        vscode.postMessage({ type: "openCodeAssistantFeature", feature: toolId });
        return;
      }
      vscode.postMessage({ type: "selectTool", toolId, source: "menu" });
    }
    function persistCodeAssistantTreeUiState() {
      if (!initialized) return;
      vscode.postMessage({ type: "setCodeAssistantTreeUiState", state: state.codeAssistantTreeUiState });
    }
    els.codeAssistantNavigator.addEventListener("ktc-tool-navigator-action", (event) => {
      const detail = event.detail || {};
      if (detail.kind === "activate") {
        activateCodeAssistantNavigatorTool(detail.toolId);
        return;
      }
      if (detail.kind !== "setShowLabels") return;
      state.codeAssistantTreeUiState.showLabels = detail.showLabels !== false;
      persistCodeAssistantTreeUiState();
      render();
    });
    els.workingContextShell.addEventListener("ktc-directory-bar-action", (event) => {
      const detail = event.detail || {};
      if (detail.kind === "select") vscode.postMessage({ type: "showWorkingDirectoryQuickPick" });
      else if (detail.kind === "choose") vscode.postMessage({ type: "pickWorkingDirectory" });
    });
    els.ribbonShell.addEventListener("ktc-toolbar-strip-action", (event) => {
      const detail = event.detail || {};
      if (detail.kind === "setMode") {
        state.sidebarStyle = detail.mode === "compact" ? "compact" : "ribbon";
        render();
        vscode.postMessage({ type: "setRibbonStyle", style: state.sidebarStyle });
        return;
      }
      if (detail.kind !== "setOverflowOpen") return;
      openModuleMenuId = detail.open ? "all" : "";
      focusRibbonMenuRequested = detail.open === true;
      render();
    });
    els.currentToolRegion.addEventListener("ktc-current-tool-region-action", (event) => {
      const detail = event.detail || {};
      if (detail.kind === "close" && detail.itemId) {
        focusOpenItemsRequested = true;
        vscode.postMessage({ type: "closeToolBlock", toolId: detail.itemId });
      }
    });
    els.openItemsBar.addEventListener("ktc-open-items-bar-action", (event) => {
      const detail = event.detail || {};
      if (!detail.itemId) return;
      focusOpenItemsRequested = true;
      if (detail.kind === "activate") {
        vscode.postMessage({ type: "activateOpenTool", toolId: detail.itemId });
      } else if (detail.kind === "close") {
        vscode.postMessage({ type: "closeToolBlock", toolId: detail.itemId });
      } else if (detail.kind === "closeOthers") {
        vscode.postMessage({ type: "closeOtherToolBlocks", toolId: detail.itemId });
      }
    });
    els.codeAssistantReorderActions.ontoggle = () => {
      state.codeAssistantTreeUiState.reorderActionsExpanded = els.codeAssistantReorderActions.open;
      persistCodeAssistantTreeUiState();
    };
    els.codeAssistantReorderResults.ontoggle = () => {
      state.codeAssistantTreeUiState.reorderResultsExpanded = els.codeAssistantReorderResults.open;
      persistCodeAssistantTreeUiState();
    };
    els.btnCodeAssistantReorderScan.onclick = () => vscode.postMessage({
      type: "run",
      toolId: "reorderMembers",
      action: "scan",
    });
    els.btnCodeAssistantReorderApply.onclick = () => {
      const reorderState = state.toolStates.reorderMembers || {};
      const pending = (reorderState.reorderResults || []).filter((row) => row.state === "pending");
      const selected = new Set(reorderState.reorderSelectedUris || pending.map((row) => row.uri));
      const uris = pending.filter((row) => selected.has(row.uri)).map((row) => row.uri);
      if (uris.length) vscode.postMessage({ type: "reorderAction", toolId: "reorderMembers", action: "apply", uris });
    };
    els.codegenPanel.addEventListener("kt-codegen-primary-action", (event) => {
      const detail = event.detail || {};
      const message = { type: "codegenAction", toolId: "codegen", action: detail.action };
      if (detail.action === "openDocument" || detail.action === "openCandidate" || detail.action === "updateMeta") {
        message.uri = detail.id;
      }
      if (detail.action === "openReport") message.reportId = detail.id;
      if (detail.action === "updateMeta") {
        message.field = detail.field;
        message.value = detail.value;
      }
      vscode.postMessage(message);
    });
    els.runPanel.addEventListener("ktc-run-primary-action", (event) => {
      vscode.postMessage(Object.assign({ type: "runAction", toolId: "run" }, event.detail));
    });
    els.gitPanel.addEventListener("ktc-git-primary-action", (event) => {
      vscode.postMessage(Object.assign({ type: "gitAction", toolId: "git" }, event.detail));
    });
    els.autoBuildPrimaryPanel.addEventListener("ktc-auto-build-primary-action", (event) => {
      const model = (state.toolStates.autoBuild || {}).editorCompanion;
      const actionId = event.detail?.actionId;
      if (!model || !actionId) return;
      const value = typeof event.detail?.value === "string"
        ? event.detail.value.slice(0, 4096)
        : undefined;
      vscode.postMessage({
        type: "editorCompanionAction",
        panelId: model.panelId,
        toolId: model.toolId,
        sessionId: model.sessionId,
        revision: model.revision,
        actionId,
        ...(value === undefined ? {} : { value }),
      });
    });
    els.projectRenamePrimaryScheme.addEventListener("pnw-combo-action", (event) => {
      const model = (state.toolStates.projectRename || {}).editorCompanion;
      if (!model) return;
      const detail = event.detail || {};
      if (detail.kind === "select" && detail.itemId) {
        postProjectRenamePrimaryAction(model, "loadScheme", detail.itemId);
      } else if (detail.kind === "remove" && detail.itemId) {
        postProjectRenamePrimaryAction(model, "deleteScheme", detail.itemId);
      } else if (detail.kind === "clear") {
        postProjectRenamePrimaryAction(model, "clearSchemes");
      }
    });
    els.projectRenamePrimaryProfileName.oninput = () => {
      const model = (state.toolStates.projectRename || {}).editorCompanion;
      const save = (model?.actions || []).find((action) => action.id === "saveProfile");
      els.projectRenamePrimarySave.disabled = !model?.ready || !save?.enabled
        || !els.projectRenamePrimaryProfileName.value.trim();
    };
    els.projectRenamePrimarySave.onclick = () => {
      const model = (state.toolStates.projectRename || {}).editorCompanion;
      const value = els.projectRenamePrimaryProfileName.value.trim();
      if (!model || !value) return;
      els.projectRenamePrimarySave.disabled = true;
      postProjectRenamePrimaryAction(model, "saveProfile", value);
    };
    els.gitRepositorySelect.onchange = () => {
      const repositoryId = els.gitRepositorySelect.value;
      if (!repositoryId) return;
      els.gitRepositorySelect.disabled = true;
      vscode.postMessage({ type: "gitAction", toolId: "git", action: "selectRepository", repositoryId });
    };
    els.gitRepositoryAdd.onclick = () => vscode.postMessage({ type: "gitAction", toolId: "git", action: "addRepository" });
    els.gitRepositoryRefresh.onclick = () => vscode.postMessage({ type: "gitAction", toolId: "git", action: "refresh" });
    els.gitRepositoryRemove.onclick = () => {
      const repositoryId = els.gitRepositorySelect.value;
      if (repositoryId) vscode.postMessage({ type: "gitAction", toolId: "git", action: "removeRepository", repositoryId });
    };
    function postCodegenControl(type, detail) {
      const model = els.codegenPanel.model;
      const uri = model && model.controls && model.controls.documentId;
      if (!uri) return;
      vscode.postMessage(Object.assign({ type, toolId: "codegen", uri }, detail));
    }
    els.codegenPanel.addEventListener("kt-codegen-control-selection-change", (event) => {
      postCodegenControl("codegenControlSelection", {
        blockKeys: [...event.detail.blockKeys],
        singleMode: !!event.detail.singleMode,
      });
    });
    els.codegenPanel.addEventListener("kt-codegen-control-output", (event) => {
      postCodegenControl("codegenControlOutput", {
        scope: event.detail.scope,
        blockKey: event.detail.blockKey,
        blockKeys: event.detail.blockKeys,
      });
    });
    els.reorderMembersPanel.addEventListener("pnw-code-reorder-members-action", (event) => {
      const detail = event.detail;
      if (detail.kind === "run") {
        vscode.postMessage({ type: "run", toolId: "reorderMembers", action: detail.action });
      } else if (detail.kind === "reorderSelection") {
        vscode.postMessage({ type: "reorderSelection", toolId: "reorderMembers", uris: [...detail.uris] });
      } else {
        vscode.postMessage({ type: "reorderAction", toolId: "reorderMembers", action: detail.action, uris: [...detail.uris] });
      }
    });
    els.uuidResultsPanel.addEventListener("pnw-code-uuid-results-action", (event) => {
      const detail = event.detail;
      if (detail.kind === "selection") {
        vscode.postMessage({ type: "uuidSelection", toolId: "uuidReplace", uris: [...detail.ids] });
      } else {
        vscode.postMessage({ type: "uuidAction", toolId: "uuidReplace", action: detail.action, uris: [...detail.ids] });
      }
    });
    els.renameResultsPanel.addEventListener("pnw-code-rename-results-action", (event) => {
      const detail = event.detail;
      if (detail?.kind === "open") {
        vscode.postMessage({ type: "codeRenameAction", toolId: "codeRename", action: "open", rowId: detail.id });
      }
    });
    els.btnFix.onclick = () => {
      if (isIgnoreTool()) vscode.postMessage({ type: "syncIgnoreFromGit" });
      else vscode.postMessage({
        type: "run",
        toolId: currentContentToolId(),
        action: isEncodingTool() ? "convert" : "fix",
      });
    };
    els.btnCaaCheckConnection.onclick = () => vscode.postMessage({ type: "run", toolId: "caaDialog", action: "checkConnection" });
    els.uuidStrategy.onchange = () => {
      state.uuidStrategy = els.uuidStrategy.value === "fresh_per_hit" ? "fresh_per_hit" : "map_per_value";
      persistUiState();
      render();
    };
    els.btnEnvironmentRefresh.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "refresh" });
    els.btnEnvironmentSystem.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "openSystemSettings" });
    els.btnEnvironmentPluginSettings.onclick = () => vscode.postMessage({ type: "environmentAction", toolId: "environmentSettings", action: "openPluginSettings" });
    function saveReplaceState() {
      state.replace = {
        search: els.replaceSearch.value,
        with: els.replaceWith.value,
        text: els.replaceText.checked,
        file: els.replaceFile.checked,
        dir: els.replaceDir.checked,
        ignored: false,
        scope: state.workingContext.selectedDirectory || "",
        collapsed: !!state.replace.collapsed,
        defaultEncoding: els.defaultEncoding.value === "gbk" ? "gbk" : "utf8",
        variantMode: state.replace.variantMode === "common" ? "common" : "exact",
        variantBasis: state.replace.variantBasis || "",
        variantRules: Array.isArray(state.replace.variantRules) ? state.replace.variantRules : [],
      };
      persistUiState();
      updateReplaceButtons();
    }

    function refreshSimpleRenameRules(force) {
      const source = els.replaceSearch.value;
      const target = els.replaceWith.value;
      const basis = source + String.fromCharCode(0) + target;
      if (!force && state.replace.variantBasis === basis) return;
      state.replace.variantBasis = basis;
      state.replace.variantRules = simpleRenameRules(source, target).map((rule) => ({ ...rule }));
    }

    function updateSimpleRenameRule(index, field, value) {
      const current = state.replace.variantRules[index];
      if (!current) return;
      state.replace.variantRules[index] = { ...current, [field]: value };
      saveReplaceState();
    }

    function moveSimpleRenameRule(index, offset) {
      const target = index + offset;
      if (target < 0 || target >= state.replace.variantRules.length) return;
      const rules = [...state.replace.variantRules];
      [rules[index], rules[target]] = [rules[target], rules[index]];
      state.replace.variantRules = rules;
      saveReplaceState();
      renderRenameHelpers(toolState(), toolState().status === "running");
    }

    function removeSimpleRenameRule(index) {
      state.replace.variantRules = state.replace.variantRules.filter((_, ruleIndex) => ruleIndex !== index);
      saveReplaceState();
      renderRenameHelpers(toolState(), toolState().status === "running");
    }
    function renameHistoryKey(entry) {
      return entry.source + String.fromCharCode(1) + entry.target;
    }
    function updateReplaceButtons() {
      const input = {
        running: toolState().status === "running",
        search: els.replaceSearch.value,
        replace: els.replaceWith.value,
        text: els.replaceText.checked,
        file: els.replaceFile.checked,
        dir: els.replaceDir.checked,
      };
      const searchValidation = searchReplaceButtonState({ ...input, action: "search" });
      const replaceValidation = searchReplaceButtonState({ ...input, action: "replace" });
      els.replacePreview.disabled = searchValidation.disabled;
      els.replaceApply.disabled = replaceValidation.disabled;
      const searchReason = searchValidation.message || (searchValidation.busy ? (toolState().message || "正在搜索…") : "");
      const replaceReason = replaceValidation.message || (replaceValidation.busy ? (toolState().message || "正在执行替换…") : "");
      els.replacePreviewTooltip.title = searchReason;
      els.replaceApplyTooltip.title = replaceReason;
      els.replacePreview.setAttribute("aria-label", searchReason ? "搜索：" + searchReason : "搜索当前目录");
      els.replaceApply.setAttribute("aria-label", replaceReason ? "替换：" + replaceReason : "执行搜索替换");
    }
    function renderRenameHelpers(ts, running) {
      const history = ts.renameHistory || [];
      const selectedIndex = history.findIndex((entry) => renameHistoryKey(entry) === selectedRenameHistoryKey);
      if (selectedIndex < 0) selectedRenameHistoryKey = "";
      els.replaceHistory.model = {
        ariaLabel: "最近改名记录",
        placeholder: history.length ? "最近改名…" : "暂无最近记录",
        emptyText: "暂无最近记录",
        items: history.map((entry, index) => ({
          id: String(index),
          label: entry.source + " → " + entry.target,
          title: entry.updatedAt || entry.source + " → " + entry.target,
          removable: !running,
          removeDisabledReason: "任务运行时不能删除最近记录",
        })),
        selectedId: selectedIndex >= 0 ? String(selectedIndex) : "",
        disabled: running || history.length === 0,
        disabledReason: running ? "任务运行时不能切换最近记录" : "暂无最近记录",
        clearEnabled: !running && history.length > 0,
        clearLabel: "全部清空",
        clearDisabledReason: running ? "任务运行时不能清空最近记录" : "暂无最近记录",
      };
      const common = state.replace.variantMode === "common";
      els.btnReplaceVariants.disabled = running;
      els.btnReplaceVariants.setAttribute("aria-expanded", common ? "true" : "false");
      els.replaceVariantBlock.hidden = !common;
      if (!common) {
        els.replaceVariantList.replaceChildren();
        return;
      }
      refreshSimpleRenameRules(false);
      const rows = state.replace.variantRules.map((rule, index) => {
        const row = document.createElement("div");
        row.className = "replace-variant-row";
        row.title = rule.label + "变形";
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.className = "replace-variant-check";
        enabled.checked = rule.enabled !== false;
        enabled.disabled = running;
        enabled.setAttribute("aria-label", "启用" + rule.label + "变形");
        enabled.onchange = () => updateSimpleRenameRule(index, "enabled", enabled.checked);
        const search = document.createElement("input");
        search.className = "replace-variant-input";
        search.type = "text";
        search.value = rule.search;
        search.disabled = running;
        search.setAttribute("aria-label", rule.label + "源名称");
        search.oninput = () => updateSimpleRenameRule(index, "search", search.value);
        search.onkeydown = stopTextInputEnter;
        const replace = document.createElement("input");
        replace.className = "replace-variant-input";
        replace.type = "text";
        replace.value = rule.replace;
        replace.disabled = running;
        replace.setAttribute("aria-label", rule.label + "目标名称");
        replace.oninput = () => updateSimpleRenameRule(index, "replace", replace.value);
        replace.onkeydown = stopTextInputEnter;
        const up = document.createElement("button");
        up.className = "replace-variant-action";
        up.type = "button";
        up.textContent = "↑";
        up.title = "上移";
        up.setAttribute("aria-label", "上移" + rule.label + "规则");
        up.disabled = running || index === 0;
        up.onclick = () => moveSimpleRenameRule(index, -1);
        const down = document.createElement("button");
        down.className = "replace-variant-action";
        down.type = "button";
        down.textContent = "↓";
        down.title = "下移";
        down.setAttribute("aria-label", "下移" + rule.label + "规则");
        down.disabled = running || index === state.replace.variantRules.length - 1;
        down.onclick = () => moveSimpleRenameRule(index, 1);
        const remove = document.createElement("button");
        remove.className = "replace-variant-action";
        remove.type = "button";
        remove.textContent = "×";
        remove.title = "删除";
        remove.setAttribute("aria-label", "删除" + rule.label + "规则");
        remove.disabled = running;
        remove.onclick = () => removeSimpleRenameRule(index);
        row.append(enabled, search, replace, up, down, remove);
        return row;
      });
      if (rows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "replace-variant-empty";
        empty.textContent = "请输入可拆分的源名称和目标名称。";
        rows.push(empty);
      }
      els.replaceVariantList.replaceChildren(...rows);
    }
    function runSearchReplace(action) {
      saveReplaceState();
      const levels = [];
      if (state.replace.text) levels.push("text");
      if (state.replace.file) levels.push("file");
      if (state.replace.dir) levels.push("dir");
      if (state.replace.variantMode === "common") refreshSimpleRenameRules(false);
      const simpleRules = state.replace.variantMode === "common"
        ? state.replace.variantRules.filter((rule) => rule.enabled !== false && rule.search && rule.replace)
        : [];
      const rules = [{ id: "primary", search: state.replace.search, replace: state.replace.with, enabled: true }, ...simpleRules]
        .filter((rule) => rule.search.length > 0);
      vscode.postMessage({
        type: "searchReplace",
        toolId: "codeRename",
        action,
        payload: {
          oldName: state.replace.search,
          newName: state.replace.with,
          rules,
          defaultEncoding: state.replace.defaultEncoding,
          levels,
          scope: state.workingContext.selectedDirectory || "",
          includeIgnored: false,
          pluginIgnoreEnabled: state.workingContext.customIgnoreEnabled === true,
          ignoreEnabled: state.workingContext.ignoreEnabled !== false,
          builtInIgnoreEnabled: state.workingContext.builtInIgnoreEnabled !== false,
          gitIgnoreEnabled: state.workingContext.gitIgnoreEnabled !== false,
          customIgnoreEnabled: state.workingContext.customIgnoreEnabled === true,
        },
      });
    }
    els.replacePreview.onclick = () => runSearchReplace("preview");
    els.replaceApply.onclick = () => runSearchReplace("apply");
    els.btnProjectRenameAnalysis.onclick = () => {
      saveReplaceState();
      if (state.replace.variantMode === "common") refreshSimpleRenameRules(false);
      const rules = state.replace.variantMode === "common"
        ? state.replace.variantRules.filter((rule) => rule.enabled !== false && rule.search && rule.replace)
        : [];
      vscode.postMessage({
        type: "openProjectRenameAnalysis",
        toolId: "codeRename",
        scope: state.workingContext.selectedDirectory || "",
        sourceName: state.replace.search,
        targetName: state.replace.with,
        rules,
        ignoreSources: {
          ignoreEnabled: state.workingContext.ignoreEnabled !== false,
          builtInIgnoreEnabled: state.workingContext.builtInIgnoreEnabled !== false,
          gitIgnoreEnabled: state.workingContext.gitIgnoreEnabled !== false,
          customIgnoreEnabled: state.workingContext.customIgnoreEnabled === true,
        },
      });
    };
    els.replaceToggle.onclick = () => {
      state.replace.collapsed = !state.replace.collapsed;
      saveReplaceState();
      render();
    };
    els.replaceHistory.addEventListener("pnw-combo-action", (event) => {
      const detail = event.detail || {};
      if (detail.kind === "clear") {
        selectedRenameHistoryKey = "";
        vscode.postMessage({ type: "clearRenameHistoryPairs", toolId: "codeRename" });
        return;
      }
      const index = Number(detail.itemId);
      const entry = Number.isSafeInteger(index) ? toolState().renameHistory?.[index] : undefined;
      if (!entry) return;
      if (detail.kind === "remove") {
        if (renameHistoryKey(entry) === selectedRenameHistoryKey) selectedRenameHistoryKey = "";
        vscode.postMessage({
          type: "deleteRenameHistoryPair",
          toolId: "codeRename",
          source: entry.source,
          target: entry.target,
        });
        return;
      }
      if (detail.kind !== "select") return;
      selectedRenameHistoryKey = renameHistoryKey(entry);
      els.replaceSearch.value = entry.source;
      els.replaceWith.value = entry.target;
      saveReplaceState();
      render();
    });
    els.btnReplaceVariants.onclick = () => {
      state.replace.variantMode = state.replace.variantMode === "common" ? "exact" : "common";
      if (state.replace.variantMode === "common") refreshSimpleRenameRules(true);
      saveReplaceState();
      render();
    };
    els.defaultEncoding.onchange = saveReplaceState;
    function stopTextInputEnter(event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
    }
    function onPrimaryRenameInput() {
      selectedRenameHistoryKey = "";
      refreshSimpleRenameRules(true);
      saveReplaceState();
      if (state.replace.variantMode === "common") renderRenameHelpers(toolState(), toolState().status === "running");
    }
    els.replaceSearch.oninput = onPrimaryRenameInput;
    els.replaceWith.oninput = onPrimaryRenameInput;
    els.replaceIgnoreBuiltIn.onchange = () => vscode.postMessage({
      type: "setIgnoreSourceEnabled", source: "builtIn", enabled: els.replaceIgnoreBuiltIn.checked,
    });
    els.replaceIgnoreGit.onchange = () => vscode.postMessage({
      type: "setIgnoreSourceEnabled", source: "git", enabled: els.replaceIgnoreGit.checked,
    });
    els.replaceIgnoreCustomEnabled.onchange = () => vscode.postMessage({
      type: "setIgnoreSourceEnabled", source: "custom", enabled: els.replaceIgnoreCustomEnabled.checked,
    });
    els.btnToggleReplaceIgnore.onclick = () => vscode.postMessage({
      type: "setIgnoreEnabled", enabled: state.workingContext.ignoreEnabled === false,
    });
    els.btnManageReplaceIgnore.onclick = () => vscode.postMessage({ type: "selectTool", toolId: "ignoreSettings" });
    for (const input of [els.replaceText, els.replaceFile, els.replaceDir]) {
      input.onchange = saveReplaceState;
    }
    for (const input of [els.replaceSearch, els.replaceWith]) {
      input.onkeydown = stopTextInputEnter;
    }
    els.scopeHeaders.onchange = () => vscode.postMessage({
      type: "setOption", toolId: "scope", key: "includeHeaders", value: els.scopeHeaders.checked,
    });
    els.scopeSource.onchange = () => vscode.postMessage({
      type: "setOption", toolId: "scope", key: "includeSource", value: els.scopeSource.checked,
    });
    els.scopeMd.onchange = () => vscode.postMessage({
      type: "setOption", toolId: "scope", key: "includeMarkdown", value: els.scopeMd.checked,
    });
    els.ignorePanel.addEventListener("ktc-ignore-primary-action", (event) => {
      const detail = event.detail || {};
      if (detail.action === "setSourceEnabled") {
        vscode.postMessage({
          type: "setIgnoreSourceEnabled",
          source: detail.source,
          enabled: detail.enabled,
        });
      } else if (detail.action === "openTarget") {
        vscode.postMessage({ type: "openIgnoreTarget", target: detail.target });
      } else if (detail.action === "dedupeTarget") {
        vscode.postMessage({ type: "dedupeIgnoreTarget", target: detail.target });
      } else if (detail.action === "saveTarget") {
        vscode.postMessage({ type: "saveIgnoreTarget", target: detail.target });
      } else if (detail.action === "analyze") {
        vscode.postMessage({ type: "analyzeIgnore" });
      } else if (detail.action === "applyRules") {
        vscode.postMessage(detail.scope === "recommendation"
          ? {
              type: "applyIgnoreRecommendations",
              target: detail.target,
              action: detail.operation,
              ruleValues: [...detail.rules],
            }
          : {
              type: "applyIgnoreRules",
              target: detail.target,
              action: detail.operation,
              rules: [...detail.rules],
            });
      }
    });
    els.preserveGbk.onchange = () => vscode.postMessage({
      type: "setOption",
      toolId: "headerAscii",
      key: "preserveGbk",
      value: els.preserveGbk.checked,
    });
    els.stripBom.onchange = () => vscode.postMessage({
      type: "setOption",
      toolId: "headerAscii",
      key: "stripBom",
      value: els.stripBom.checked,
    });
    els.encodingDefaultTarget.onchange = () => vscode.postMessage({
      type: "setEncodingDefaultTarget",
      toolId: "encodingFix",
      target: els.encodingDefaultTarget.value === "gbk" ? "gbk" : "utf8",
    });
    els.btnEncodingSettings.onclick = () => vscode.postMessage({
      type: "openEncodingSettings",
      toolId: "encodingFix",
    });
    els.showDetails.onchange = () => {
      state.showDetails = els.showDetails.checked;
      persistUiState();
      render();
    };
    els.encDetails.onchange = () => {
      state.showEncDetails = els.encDetails.checked;
      persistUiState();
      render();
    };
    for (const button of els.welcomePanel.querySelectorAll("[data-welcome-action]")) {
      button.addEventListener("click", () => vscode.postMessage({
        type: "welcomeAction",
        action: button.dataset.welcomeAction,
      }));
    }
    document.addEventListener("pointerdown", (event) => {
      let closedMenu = false;
      const eventPath = event.composedPath();
      const ribbonOverflowTrigger = els.ribbonShell.shadowRoot?.querySelector('[part="overflow"]');
      const togglingRibbonOverflow = Boolean(ribbonOverflowTrigger && eventPath.includes(ribbonOverflowTrigger));
      for (const menu of document.querySelectorAll(".module-more[open]")) {
        if (!menu.contains(event.target) && !togglingRibbonOverflow) {
          openModuleMenuId = "";
          menu.open = false;
          closedMenu = true;
        }
      }
      if (closedMenu) renderToolbarStrip();
    });
    window.addEventListener("resize", () => {
      openModuleMenuId = "";
      for (const menu of document.querySelectorAll(".module-more[open]")) menu.open = false;
      renderToolbarStrip();
    });

    window.addEventListener("message", (e) => {
      const msg = e.data;
      if (msg.type === "init") {
        const activeToolChanged = switchActiveTool(msg.activeToolId);
        state.tools = msg.tools;
        state.openToolIds = msg.openToolIds || [];
        state.codeAssistantFeature = msg.codeAssistantFeature || "";
        state.codeAssistantTreeUiState = msg.codeAssistantTreeUiState || state.codeAssistantTreeUiState;
        state.toolOptions = msg.toolOptions || {};
        state.scope = msg.scope || state.scope;
        state.ignoreConfig = msg.ignoreConfig || null;
        state.sidebarStyle = msg.sidebarStyle || "ribbon";
        state.directoryVisible = msg.directoryVisible !== false;
        if (pendingRibbonCollapseMigration) {
          pendingRibbonCollapseMigration = false;
          if (state.sidebarStyle === "ribbon") {
            state.sidebarStyle = "compact";
            vscode.postMessage({ type: "setRibbonStyle", style: "compact" });
          }
          persistUiState();
        }
        state.ribbonLayout = msg.ribbonLayout || state.ribbonLayout;
        state.workingContext = msg.workingContext || state.workingContext;
        state.presentation = msg.presentation === "detailBlock" ? "detailBlock" : "ribbon";
        state.recentWorkingDirectories = msg.recentWorkingDirectories || { workspace: [], external: [], options: [] };
        state.moduleState = msg.moduleState || state.moduleState;
        state.extensionInstallations = msg.extensionInstallations || [];
        els.workspace.textContent = msg.workspaceLabel;
        render();
        restoreActiveToolScroll(activeToolChanged);
        initialized = true;
      } else if (msg.type === "workspace") {
        els.workspace.textContent = msg.label;
      } else if (msg.type === "scope") {
        state.scope = msg.scope;
        render();
      } else if (msg.type === "ignoreConfig") {
        state.ignoreConfig = msg.ignoreConfig || null;
        render();
      } else if (msg.type === "options") {
        state.toolOptions[msg.toolId] = msg.options;
        render();
      } else if (msg.type === "sidebarStyle") {
        state.sidebarStyle = msg.style || "ribbon";
        render();
      } else if (msg.type === "directoryVisibility") {
        state.directoryVisible = msg.visible !== false;
        render();
      } else if (msg.type === "ribbonLayout") {
        state.ribbonLayout = msg.layout || state.ribbonLayout;
        render();
      } else if (msg.type === "openRibbonCustomization") {
        openModuleMenuId = "all";
        focusRibbonMenuRequested = true;
        render();
      } else if (msg.type === "workingContext") {
        state.workingContext = msg.context || state.workingContext;
        state.recentWorkingDirectories = msg.directories || state.recentWorkingDirectories;
        state.replace.scope = state.workingContext.selectedDirectory || "";
        render();
      } else if (msg.type === "openTools") {
        const activeToolChanged = switchActiveTool(msg.activeToolId);
        state.openToolIds = msg.openToolIds || [];
        state.codeAssistantFeature = msg.codeAssistantFeature || "";
        render();
        restoreActiveToolScroll(activeToolChanged);
      } else if (msg.type === "revealToolSurface") {
        // Compatibility-only message from pre-migration Hosts. Current Tool is
        // fixed open, so there is no local presentation state to restore.
      } else if (msg.type === "modules") {
        state.moduleState = msg.moduleState || state.moduleState;
        render();
      } else if (msg.type === "moduleBlock") {
        state.moduleBlock = msg.content || null;
        render();
      } else if (msg.type === "requestSearchReplacePreview") {
        const activeToolChanged = switchActiveTool("codeRename");
        render();
        restoreActiveToolScroll(activeToolChanged);
        runSearchReplace("preview");
      } else if (msg.type === "recentWorkingDirectories") {
        state.recentWorkingDirectories = msg.directories || { workspace: [], external: [], options: [] };
        renderWorkingContext();
        if (typeof msg.selected === "string") {
          state.workingContext.selectedDirectory = msg.selected;
          state.replace.scope = msg.selected;
          renderWorkingContext();
          saveReplaceState();
        }
      } else if (msg.type === "state") {
        state.toolStates[msg.toolId] = msg.state;
        if (msg.toolId === "uuidReplace" && msg.state.uuidStrategy) {
          state.uuidStrategy = msg.state.uuidStrategy;
          persistUiState();
        }
        render();
      }
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

export function postToWebview(
  webviewView: vscode.WebviewView | undefined,
  message: WebviewOutboundMessage,
): void {
  void webviewView?.webview.postMessage(message);
}
