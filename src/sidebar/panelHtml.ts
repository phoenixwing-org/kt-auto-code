import type * as vscode from "vscode";
import type {
  ToolSummary,
  ToolUiState,
  WebviewOutboundMessage,
} from "../tools/types.js";
import { ktcGitRepositoryOptionLabels, type KtcGitViewModel } from "../core/git/KtcGitModel.js";
import { ktcCreateWebviewSecurity } from "../webviewSupport.js";
import { KtcCompactManagerLabelStyle } from "../ui/KtcCompactManagerLabel.js";

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
 * Shared inner Block for Code Assistant leaves. Keep collapse, close semantics
 * and accessibility identical so a newly added feature cannot silently drift
 * back to the legacy unframed action row.
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
    body.ribbon-only .wrap > :not(#ribbon-shell) { display: none; }
    body.ribbon-only .tabs { margin-bottom: 0; border-bottom: 0; padding: 1px 0 2px; }
    body.detail-block #tabs { display: flex; }
    body.detail-block .desc { display: none; }
    body.detail-block .meta { margin: 0 0 8px; }
    body.external-module-block #primary-body > :not(#module-block) { display: none !important; }
    body.welcome-mode #primary-body > :not(#welcome-panel) { display: none !important; }
    .wrap { display: flex; width: 100%; min-width: 0; max-width: 100%; height: 100vh; flex-direction: column; padding: 0; overflow: hidden; }
    .wrap > * { min-width: 0; max-width: 100%; }
    .shell-block { width: 100%; min-width: 0; flex: 0 0 auto; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border)); }
    .shell-block-header { display: flex; min-height: 24px; align-items: center; gap: 2px; padding: 0 4px; border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border)); color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground)); background: var(--vscode-sideBarSectionHeader-background); }
    .shell-block-toggle { display: flex; min-width: 0; flex: 1 1 auto; align-items: center; gap: 2px; height: 23px; padding: 0; border: 0; color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: var(--vscode-font-size); font-weight: 600; text-align: left; }
    .shell-block-chevron { width: 16px; height: 16px; flex: 0 0 16px; color: currentColor; transform: rotate(0deg); transform-origin: center; transition: transform .1s ease; }
    .shell-block-chevron path { fill: currentColor; }
    .shell-block.collapsed .shell-block-chevron { transform: rotate(-90deg); }
    .shell-block.collapsed > .shell-block-body { display: none; }
    .shell-block-action { display: grid; width: 24px; height: 22px; flex: 0 0 24px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 3px; color: var(--vscode-foreground); background: transparent; cursor: pointer; font-size: 16px; }
    .shell-block-action:hover { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-toolbar-hoverBackground); }
    .ribbon-header-controls { display: flex; min-width: 0; flex: 0 1 auto; align-items: center; gap: 1px; }
    .ribbon-header-density svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-width: 1.4; }
    .shell-block-body { min-width: 0; padding: 8px 14px 10px; }
    #ribbon-body { padding: 6px 14px 4px; }
    #ribbon-body .tabs { margin: 0; border-bottom: 0; padding-bottom: 0; }
    #primary-shell { display: flex; min-height: 24px; flex: 1 1 auto; flex-direction: column; overflow: hidden; }
    #primary-shell.collapsed { flex: 0 0 auto; }
    /* 当前工具统一采用满宽紧凑内容边界；每个功能在自身行内保留必要内边距。 */
    #primary-body { min-height: 0; flex: 1 1 auto; padding-inline: 0; overflow-x: hidden; overflow-y: auto; }
    .primary-block-header-title { min-width: 0; flex: 1 1 auto; overflow: hidden; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .primary-header-context-action { min-width: 0; height: 21px; max-width: 92px; overflow: hidden; padding: 0 7px; border: 1px solid var(--vscode-button-secondaryBackground, var(--vscode-panel-border)); border-radius: 9px; color: var(--vscode-textLink-foreground); background: var(--vscode-button-secondaryBackground, transparent); cursor: pointer; font: inherit; font-size: 10px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .primary-header-context-action:hover { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); }
    .primary-header-context-action:disabled { opacity: .45; cursor: default; }
    ktc-codegen-primary-panel,
    ktc-git-primary-panel,
    ktc-run-primary-panel { display: block; width: 100%; min-width: 0; max-width: 100%; overflow-x: hidden; }
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
    /* 固定的一行目录上下文：不再承载低频 Ignore 表单。 */
    #working-context-shell .shell-block-header { min-height: 34px; padding: 2px 4px; gap: 2px; }
    .working-context-context-icon { width: 16px; height: 16px; flex: 0 0 16px; color: var(--vscode-descriptionForeground); fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
    .working-context-label { flex: 0 0 auto; font-size: var(--vscode-font-size); font-weight: 600; }
    .working-context { min-width: 0; flex: 1 1 auto; margin: 0; padding: 0; }
    .working-context-main { display: grid; grid-template-columns: minmax(0, 1fr) 30px 30px; gap: 5px; }
    .working-context select { min-width: 0; height: 30px; padding: 3px 7px; border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border)); border-radius: 2px; color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); }
    .working-context-settings { font-size: 17px; line-height: 1; }
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
    .ignore-manager { width: 100%; margin: 0; }
    .ignore-manager > summary { display: flex; width: 100%; min-height: 28px; align-items: center; gap: 2px; padding: 0 5px; color: var(--vscode-foreground); cursor: pointer; font-size: var(--vscode-font-size); font-weight: 600; list-style: none; }
    .ignore-manager > summary::-webkit-details-marker { display: none; }
    .ignore-manager-chevron { width: 16px; height: 16px; flex: 0 0 16px; transform: rotate(-90deg); transform-origin: center; transition: transform .1s ease; }
    .ignore-manager-chevron path { fill: currentColor; }
    .ignore-manager[open] .ignore-manager-chevron { transform: rotate(0deg); }
    .ignore-manager-body { padding: 5px 8px 8px; }
    .ignore-manager-status { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-bottom: 7px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .ignore-manager-status label { display: inline-flex; align-items: center; gap: 4px; margin: 0; cursor: pointer; }
    .ignore-manager-status input { margin: 0; }
    .ignore-recommendations { margin-top: 7px; }
    .tabs.ribbon {
      display: flex;
      flex-wrap: wrap;
      justify-content: start;
      align-items: stretch;
      gap: 5px;
      padding: 0;
    }
    .module-group,
    .module-group-tools { display: contents; }
    .module-group-label { display: flex; flex: 0 0 16px; align-items: center; justify-content: center; width: 16px; min-height: 50px; margin-right: 2px; border-right: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); font-size: 8px; font-weight: 600; letter-spacing: .5px; line-height: 1; text-orientation: upright; writing-mode: vertical-rl; }
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
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      min-height: 50px;
      padding: 3px 2px 2px;
      gap: 2px;
      border-radius: 2px;
      line-height: 1.1;
      text-align: center;
      width: 54px;
    }
    .tabs.ribbon .tab[draggable="true"] { cursor: grab; }
    .tabs.ribbon .tab.dragging { opacity: .45; }
    .tabs.ribbon .tab.drag-target { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
    .tabs.ribbon .tab > span:last-child {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-size: 11px;
      line-height: 1.15;
    }
    .tabs.ribbon .tab.active {
      color: var(--vscode-list-activeSelectionForeground);
      background: var(--vscode-list-activeSelectionBackground);
      border-color: var(--vscode-focusBorder);
    }
    .tabs.ribbon .tool-icon { width: 22px; height: 22px; flex-basis: 22px; }
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
    .tabs.compact {
      display: flex;
      flex-wrap: wrap;
      justify-content: start;
      align-items: start;
      gap: 2px;
    }
    .tabs.compact .module-group-label { flex-basis: 14px; width: 14px; min-height: 32px; font-size: 7px; }
    .tabs.compact .module-more > summary { width: 28px; min-height: 38px; }
    .tabs.compact .tab {
      width: 42px;
      height: 38px;
      justify-content: center;
      padding: 5px;
    }
    .tabs.compact .tab > span:last-child { display: none; }
    .tabs.compact .tool-icon { width: 24px; height: 24px; flex: 0 0 24px; }
    .tab:disabled { opacity: 0.45; cursor: default; }
    .tool-icon {
      width: 15px;
      height: 15px;
      flex: 0 0 15px;
      background: currentColor;
      mask: var(--tool-icon) center / contain no-repeat;
      -webkit-mask: var(--tool-icon) center / contain no-repeat;
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
    .replace-helpers { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px; margin-top: 6px; }
    .replace-history-control { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) 23px auto; gap: 3px; }
    .replace-history-control select {
      width: 100%;
      min-width: 0;
      height: 26px;
      padding: 2px 6px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      outline: 0;
      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      background: var(--vscode-dropdown-background, var(--vscode-input-background));
    }
    .replace-history-control select:focus { border-color: var(--vscode-focusBorder); }
    .replace-history-action {
      min-width: 23px;
      height: 26px;
      padding: 0 5px;
      border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-foreground);
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      white-space: nowrap;
    }
    .replace-history-action:hover:not(:disabled) { border-color: var(--ktc-ui-active-border, var(--vscode-focusBorder)); background: var(--vscode-toolbar-hoverBackground); }
    .replace-history-action:disabled { color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground)); opacity: .5; cursor: default; }
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
    @media (max-width: 320px) {
      body .preset-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      body .preset-row select { grid-column: 1 / -1; }
    }
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
    #ignore-block { margin: 0; }
    #ignore-block .scope-hint { margin: 0 0 10px; font-size: 12px; }
    #ignore-block .actions { margin: 0; gap: 6px; }
    #ignore-block .ignore-primary .action { flex: 1 1 0; }
    .preset-row { display: grid; grid-template-columns: minmax(72px, 1fr) auto auto; gap: 6px; margin-bottom: 8px; }
    .preset-row select {
      min-width: 0;
      height: 28px;
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 2px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
    }
    .preset-row .action { padding-inline: 10px; }
    .actions {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
    }
    /* 只抵消第三 Block 顶部的通用留白；底部不得负边距，避免当前功能操作区与 Tree 最后一行重叠。 */
    .code-assistant-block { margin: -8px 0 0; }
    .code-assistant-tree-section { margin: 0 0 4px; padding: 0; border: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
    .code-assistant-tree-section > summary { display: flex; min-height: 23px; align-items: center; gap: 2px; padding: 0 3px; color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground)); background: var(--vscode-sideBarSectionHeader-background, var(--vscode-sideBar-background)); cursor: pointer; font-size: var(--vscode-font-size); font-weight: 600; list-style: none; }
    .code-assistant-tree-section > summary::-webkit-details-marker { display: none; }
    .code-assistant-tree-section > summary:hover { background: var(--vscode-list-hoverBackground); }
    .code-assistant-tree-section[open] > summary { border-bottom: 1px solid var(--ktc-ui-border, var(--vscode-panel-border)); }
    .code-assistant-tree-section-count { margin-left: auto; padding-right: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; font-variant-numeric: tabular-nums; }
    .code-assistant-tree { margin: 0; padding: 0; }
    .code-assistant-tree-group { margin: 0; }
    .code-assistant-tree-group > summary { display: flex; min-height: 21px; align-items: center; gap: 2px; padding: 0 2px; color: var(--vscode-foreground); cursor: pointer; font-size: var(--vscode-font-size); font-weight: 400; list-style: none; }
    .code-assistant-tree-group > summary::-webkit-details-marker { display: none; }
    .code-assistant-tree-chevron { width: 16px; height: 16px; flex: 0 0 16px; color: currentColor; transform: rotate(-90deg); transform-origin: center; transition: transform .1s ease; }
    .code-assistant-tree-chevron path { fill: currentColor; }
    .code-assistant-tree-group[open] > summary .code-assistant-tree-chevron { transform: rotate(0deg); }
    .code-assistant-tree-group > summary:hover { background: var(--vscode-list-hoverBackground); }
    .code-assistant-tree-count { margin-left: auto; padding-right: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; font-variant-numeric: tabular-nums; }
    .code-assistant-tree-icon { width: 16px; height: 16px; flex: 0 0 16px; color: var(--vscode-descriptionForeground); }
    .code-assistant-tree-icon path { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.2; }
    .code-assistant-tree-children { margin: 0; padding: 0; }
    .code-assistant-tree button { display: flex; width: 100%; min-height: 21px; align-items: center; gap: 2px; padding: 0 2px 0 7px; border: 0; color: var(--vscode-foreground); background: transparent; cursor: pointer; font: inherit; font-size: var(--vscode-font-size); text-align: left; }
    .code-assistant-tree button:hover { background: var(--vscode-list-hoverBackground); }
    .code-assistant-tree button.selected { color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground)); box-shadow: inset 2px 0 0 var(--vscode-focusBorder); }
    .code-assistant-tree button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground)); }
    .code-assistant-tree-copy { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .code-assistant-tree-copy strong { font-weight: 400; }
    .code-assistant-tree-copy span { display: none; }
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
    #header-options label + .hint { display: block; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="shell-block" id="ribbon-shell">
      <header class="shell-block-header">
        <button class="shell-block-toggle" id="btn-toggle-ribbon-block" type="button" aria-expanded="true" aria-controls="ribbon-body"><svg class="shell-block-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg><span>工具栏</span></button>
        <div class="ribbon-header-controls" id="ribbon-header-controls">
          <button class="shell-block-action ribbon-header-density" id="btn-ribbon-density" type="button"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12M5 2v4M10 6v4M7 10v4"/></svg></button>
        </div>
        <button class="shell-block-action" id="btn-ribbon-customize" type="button" title="自定义工具栏" aria-label="自定义工具栏">…</button>
      </header>
      <div class="shell-block-body" id="ribbon-body"><div class="tabs" id="tabs"></div></div>
    </section>
    <section class="shell-block" id="working-context-shell">
      <header class="shell-block-header" aria-label="目录">
        <svg class="working-context-context-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.82 1.2A2 2 0 0 0 12.1 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/><path d="M2 10h20"/></svg>
        <span class="working-context-label">目录</span>
        <section class="working-context" id="working-context" aria-label="目录">
          <div class="working-context-main">
        <select id="replace-scope" aria-label="目录" title="头文件、编码、搜索替换等文件工具都以此目录为准"></select>
        <button class="folder-button" id="btn-pick-working-directory" type="button" title="选择工作目录" aria-label="选择工作目录">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.82 1.2A2 2 0 0 0 12.1 6H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2Z"/><path d="M2 10h20"/></svg>
        </button>
        <button class="folder-button working-context-settings" id="btn-open-settings" type="button" title="打开设置" aria-label="打开设置">⚙</button>
          </div>
        </section>
      </header>
    </section>
    <section class="shell-block" id="primary-shell">
      <header class="shell-block-header">
        <button class="shell-block-toggle" id="btn-toggle-primary-block" type="button" aria-expanded="true" aria-controls="primary-body"><svg class="shell-block-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg><span class="primary-block-header-title" id="tool-title">当前工具</span></button>
        <button class="primary-header-context-action" id="btn-project-rename-analysis" type="button" title="把当前目录、名称和启用的常用变形带入项目改名 View" aria-label="打开项目改名并带入当前名称与规则" hidden>项目改名</button>
        <button class="shell-block-action" id="btn-close-tool" type="button" title="关闭当前工具" aria-label="关闭当前工具">×</button>
      </header>
      <div class="shell-block-body" id="primary-body">
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
    <p class="meta" id="workspace-meta">
      <span id="workspace-context-label">工作区：</span>
      <strong id="workspace-label">—</strong>
      <select id="git-repository-select" aria-label="Git 仓库" hidden></select>
      <button class="git-repository-action" id="git-repository-add" type="button" title="添加 Git 仓库" aria-label="添加 Git 仓库" hidden>＋</button>
      <button class="git-repository-action" id="git-repository-refresh" type="button" title="刷新仓库摘要" aria-label="刷新仓库摘要" hidden>↻</button>
      <button class="git-repository-action" id="git-repository-remove" type="button" title="从我的仓库移除" aria-label="从我的仓库移除" hidden>−</button>
    </p>
    <section class="code-assistant-block" id="code-assistant-block" hidden aria-label="代码辅助功能">
      <details class="code-assistant-tree-section" id="code-assistant-tree-section" open>
        <summary><svg class="code-assistant-tree-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg><span>功能目录</span><span class="code-assistant-tree-section-count">（6）</span></summary>
      <div class="code-assistant-tree" aria-label="代码辅助功能树">
        <details class="code-assistant-tree-group" id="code-assistant-cpp-group" open>
          <summary>
            <svg class="code-assistant-tree-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg>
            <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h8M4 6h8M4 9h8M4 12h8M3 3h.1M3 6h.1M3 9h.1M3 12h.1"/></svg>
            <span>C++ 整理</span><span class="code-assistant-tree-count">（3）</span>
          </summary>
          <div class="code-assistant-tree-children">
            <button id="btn-code-assistant-package-includes" data-code-assistant-feature="packageIncludes" type="button" aria-label="打开头文件引用修正">
              <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h6l3 3v6H3zM9 3.5v3h3M5 9h5M5 11h4"/></svg>
              <span class="code-assistant-tree-copy"><strong>头文件引用修正</strong><span>平铺 include → &lt;KtCore/...&gt;</span></span>
            </button>
            <button id="btn-code-assistant-reorder-members" data-code-assistant-feature="reorderMembers" type="button" aria-label="打开 C++ 成员排序">
              <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h7M3 8h10M3 12h5M11 2v10M9 4l2-2 2 2M13 10l-2 2-2-2"/></svg>
              <span class="code-assistant-tree-copy"><strong>C++ 成员排序</strong><span>扫描、预览并确认写回</span></span>
            </button>
            <button id="btn-code-assistant-header-ascii" data-code-assistant-feature="headerAscii" type="button" aria-label="打开头文件 ASCII 修正">
              <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h6l3 3v6H3zM9 3.5v3h3M5 9h5M5 11h4"/></svg>
              <span class="code-assistant-tree-copy"><strong>头文件 ASCII 修正</strong><span>预检并修正头文件问题字节</span></span>
            </button>
          </div>
        </details>
        <details class="code-assistant-tree-group" id="code-assistant-file-tools-group" open>
          <summary>
            <svg class="code-assistant-tree-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg>
            <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h6l3 3v6H3zM9 3.5v3h3M5 9h5M5 11h4"/></svg>
            <span>文件工具</span><span class="code-assistant-tree-count">（2）</span>
          </summary>
          <div class="code-assistant-tree-children">
            <button id="btn-code-assistant-encoding-fix" data-code-assistant-feature="encodingFix" type="button" aria-label="打开编码修正">
              <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h6l3 3v6H3zM9 3.5v3h3M5 9h5M5 11h4"/></svg>
              <span class="code-assistant-tree-copy"><strong>编码修正</strong><span>检查并无损转换项目编码</span></span>
            </button>
            <button id="btn-code-assistant-uuid-replace" data-code-assistant-feature="uuidReplace" type="button" aria-label="打开 UUID 替换">
              <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5l2-2 2 2-2 2zM9 3l2-2 2 2-2 2zM9 11l2-2 2 2-2 2zM3 11l2-2 2 2-2 2z"/></svg>
              <span class="code-assistant-tree-copy"><strong>UUID 替换</strong><span>扫描映射并确认写入</span></span>
            </button>
          </div>
        </details>
        <details class="code-assistant-tree-group" id="code-assistant-caa-group" open>
          <summary>
            <svg class="code-assistant-tree-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg>
            <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3h8M4 6h8M4 9h8M4 12h8M3 3h.1M3 6h.1M3 9h.1M3 12h.1"/></svg>
            <span>CAA</span><span class="code-assistant-tree-count">（1）</span>
          </summary>
          <div class="code-assistant-tree-children">
            <button id="btn-code-assistant-caa-dialog" data-code-assistant-feature="caaDialog" type="button" aria-label="打开 CAA UI">
              <svg class="code-assistant-tree-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h6l3 3v6H3zM9 3.5v3h3M5 9h5M5 11h4"/></svg>
              <span class="code-assistant-tree-copy"><strong>CAA UI</strong><span>扫描 CATDlg 并连接 Desk Tools</span></span>
            </button>
          </div>
        </details>
      </div>
      </details>
      <p class="code-assistant-empty" id="code-assistant-empty">从上方功能 Tree 选择一项开始。</p>
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
    <section class="settings-block" id="environment-block" hidden aria-label="设置">
      <details class="settings-section ignore-manager" id="ignore-manager" open>
        <summary><svg class="ignore-manager-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.976 10.072l4.357-4.357.62.618L7.976 11.31 3 6.333l.62-.618 4.356 4.357z"/></svg><span>Ignore 管理</span></summary>
        <div class="ignore-manager-body scope-block" id="ignore-block">
          <div class="ignore-manager-status">
            <span id="git-ignore-status">Git Ignore · 自动</span>
            <label title="叠加当前目录的 .phoenix/.ignore"><input id="plugin-ignore-enabled" type="checkbox" />插件 Ignore</label>
          </div>
          <div class="actions ignore-primary">
            <button class="action secondary" id="btn-analyze-ignore" type="button">分析当前目录</button>
            <button class="action" id="btn-apply-ignore-recommendations" type="button" hidden>追加所选推荐</button>
          </div>
          <p class="scope-hint" id="ignore-status">—</p>
          <div class="preset-row">
            <select id="ignore-preset" aria-label="Ignore 预设"><option value="caa">CAA</option><option value="cpp">C++</option><option value="web">Web</option></select>
            <button class="action" id="btn-append-preset" type="button">追加</button>
            <button class="action secondary" id="btn-remove-preset" type="button">去除</button>
          </div>
          <div class="actions">
            <button class="action secondary" id="btn-open-ignore" type="button">编辑规则</button>
            <button class="action" id="btn-sync-ignore" type="button">从 .gitignore 追加</button>
          </div>
          <div class="ignore-recommendations" id="ignore-recommendations"></div>
        </div>
      </details>
      <details class="settings-section" open>
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
        <div class="replace-history-control"><select id="replace-history" aria-label="最近改名记录" title="本机最近 50 组源名称与目标名称"><option value="">最近改名…</option></select><button class="replace-history-action" id="btn-delete-replace-history" type="button" title="删除所选最近记录" aria-label="删除所选最近改名记录" disabled>×</button><button class="replace-history-action" id="btn-clear-replace-history" type="button" title="清空本机最近改名记录" disabled>清空</button></div>
        <button class="replace-variant-toggle" id="btn-replace-variants" type="button" aria-expanded="false" aria-controls="replace-variant-block">常用变形</button>
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
    </section>
  </div>
  <script nonce="${nonce}" src="${codegenPrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${runPrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${gitPrimaryPanelUri}"></script>
  <script nonce="${nonce}" src="${reorderMembersPanelUri}"></script>
  <script nonce="${nonce}" src="${uuidResultsPanelUri}"></script>
  <script nonce="${nonce}" src="${renameResultsPanelUri}"></script>
  <script nonce="${nonce}" src="${ribbonCustomizationMenuUri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const saved = vscode.getState() || {};
    const savedReplace = saved.replace || {};
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
      ribbonBlockCollapsed: !!saved.ribbonBlockCollapsed,
      primaryBlockCollapsed: !!saved.primaryBlockCollapsed,
      sidebarStyle: "ribbon",
      presentation: "ribbon",
      recentWorkingDirectories: { workspace: [], external: [], options: [] },
      moduleState: { installed: ["code"], enabled: ["code"], visible: ["code"], known: ["code"], active: "code" },
      moduleBlock: null,
      codeAssistantFeature: "",
      codeAssistantTreeUiState: {
        treeExpanded: true,
        cppOrganizeExpanded: true,
        fileToolsExpanded: true,
        caaExpanded: true,
        reorderActionsExpanded: true,
        reorderResultsExpanded: true,
      },
      extensionInstallations: [],
      ribbonLayout: { pinnedToolIds: [], toolOrder: [] },
      workingContext: { selectedDirectory: "", label: "未打开目录", pluginIgnoreEnabled: true, gitIgnoreExists: false },
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
    let gitRefreshRequested = false;

    function persistUiState() {
      vscode.setState({
        showDetails: state.showDetails,
        showEncDetails: state.showEncDetails,
        uuidStrategy: state.uuidStrategy,
        ribbonBlockCollapsed: state.ribbonBlockCollapsed,
        primaryBlockCollapsed: state.primaryBlockCollapsed,
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
      const anchor = summary.getBoundingClientRect();
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
      if (state.activeToolId) toolScrollPositions.set(state.activeToolId, els.primaryBody.scrollTop);
      state.activeToolId = next;
      return true;
    }

    function restoreActiveToolScroll(changed) {
      if (!changed) return;
      const top = toolScrollPositions.get(state.activeToolId) || 0;
      requestAnimationFrame(() => { els.primaryBody.scrollTop = top; });
    }

    const els = {
      ribbonShell: document.getElementById("ribbon-shell"),
      primaryShell: document.getElementById("primary-shell"),
      btnToggleRibbonBlock: document.getElementById("btn-toggle-ribbon-block"),
      btnTogglePrimaryBlock: document.getElementById("btn-toggle-primary-block"),
      btnRibbonDensity: document.getElementById("btn-ribbon-density"),
      btnRibbonCustomize: document.getElementById("btn-ribbon-customize"),
      btnCloseTool: document.getElementById("btn-close-tool"),
      primaryBody: document.getElementById("primary-body"),
      tabs: document.getElementById("tabs"),
      moduleBlock: document.getElementById("module-block"),
      welcomePanel: document.getElementById("welcome-panel"),
      welcomeProducts: document.getElementById("welcome-products"),
      title: document.getElementById("tool-title"),
      desc: document.getElementById("tool-desc"),
      replaceBlock: document.getElementById("replace-block"),
      codeAssistantBlock: document.getElementById("code-assistant-block"),
      codeAssistantTreeSection: document.getElementById("code-assistant-tree-section"),
      codeAssistantCppGroup: document.getElementById("code-assistant-cpp-group"),
      codeAssistantFileToolsGroup: document.getElementById("code-assistant-file-tools-group"),
      codeAssistantCaaGroup: document.getElementById("code-assistant-caa-group"),
      btnCodeAssistantPackageIncludes: document.getElementById("btn-code-assistant-package-includes"),
      btnCodeAssistantReorderMembers: document.getElementById("btn-code-assistant-reorder-members"),
      btnCodeAssistantHeaderAscii: document.getElementById("btn-code-assistant-header-ascii"),
      btnCodeAssistantEncodingFix: document.getElementById("btn-code-assistant-encoding-fix"),
      btnCodeAssistantUuidReplace: document.getElementById("btn-code-assistant-uuid-replace"),
      btnCodeAssistantCaaDialog: document.getElementById("btn-code-assistant-caa-dialog"),
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
      btnDeleteReplaceHistory: document.getElementById("btn-delete-replace-history"),
      btnClearReplaceHistory: document.getElementById("btn-clear-replace-history"),
      btnReplaceVariants: document.getElementById("btn-replace-variants"),
      replaceVariantBlock: document.getElementById("replace-variant-block"),
      replaceVariantList: document.getElementById("replace-variant-list"),
      replaceText: document.getElementById("replace-text"),
      replaceFile: document.getElementById("replace-file"),
      replaceDir: document.getElementById("replace-dir"),
      replaceScope: document.getElementById("replace-scope"),
      workingContext: document.getElementById("working-context"),
      gitIgnoreStatus: document.getElementById("git-ignore-status"),
      pluginIgnoreEnabled: document.getElementById("plugin-ignore-enabled"),
      ignoreRecommendations: document.getElementById("ignore-recommendations"),
      btnPickWorkingDirectory: document.getElementById("btn-pick-working-directory"),
      btnOpenSettings: document.getElementById("btn-open-settings"),
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
      ignoreBlock: document.getElementById("ignore-block"),
      scopeBlock: document.getElementById("scope-block"),
      scopeHeaders: document.getElementById("scope-headers"),
      scopeSource: document.getElementById("scope-source"),
      scopeMd: document.getElementById("scope-md"),
      scopeMdWrap: document.getElementById("scope-md-wrap"),
      ignoreStatus: document.getElementById("ignore-status"),
      ignorePreset: document.getElementById("ignore-preset"),
      btnAppendPreset: document.getElementById("btn-append-preset"),
      btnRemovePreset: document.getElementById("btn-remove-preset"),
      btnOpenIgnore: document.getElementById("btn-open-ignore"),
      btnSyncIgnore: document.getElementById("btn-sync-ignore"),
      btnAnalyzeIgnore: document.getElementById("btn-analyze-ignore"),
      btnApplyIgnoreRecommendations: document.getElementById("btn-apply-ignore-recommendations"),
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
      return isCodeAssistantTool() && state.codeAssistantFeature
        ? state.codeAssistantFeature
        : state.activeToolId;
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

    function isCodeAssistantTool() {
      return state.activeToolId === "codeAssistant";
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

    function isCodeAssistantReorderFeature() {
      return isCodeAssistantTool() && state.codeAssistantFeature === "reorderMembers";
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

    function renderIgnoreResults(ts) {
      const target = els.ignoreRecommendations;
      target.innerHTML = "";
      const report = ts.ignoreRecommendations;
      const selected = new Set(ts.ignoreSelectedGroupIds || []);
      els.btnApplyIgnoreRecommendations.hidden = !report;
      els.btnApplyIgnoreRecommendations.disabled = ts.status === "running" || selected.size === 0;
      els.btnApplyIgnoreRecommendations.textContent = selected.size ? "追加所选推荐（" + selected.size + "）" : "追加所选推荐";
      if (!report) return;
      if (!report.recommendations.length) {
        const empty = document.createElement("p");
        empty.className = "scope-hint";
        empty.textContent = "没有可追加的推荐规则。";
        target.appendChild(empty);
        return;
      }
      for (const group of report.recommendations) {
        const selectable = group.suggestedRules.length > 0;
        const headerRow = document.createElement("div");
        headerRow.className = "compact-subtext";
        headerRow.textContent = group.description;
        const rules = document.createElement("div");
        rules.className = "compact-rules";
        const parts = [];
        if (group.suggestedRules.length) parts.push("建议：" + group.suggestedRules.map((rule) => rule.value).join("，"));
        if (group.existingRules.length) parts.push("已有 " + group.existingRules.length + " 条");
        if (group.blockedRules.length) parts.push("有跟踪文件，阻止 " + group.blockedRules.length + " 条");
        rules.textContent = parts.join(" · ");
        const wrapper = document.createElement("div");
        wrapper.append(headerRow, rules);
        const checkbox = selectable ? {
          checked: selected.has(group.groupId), disabled: ts.status === "running", label: "选择 " + group.title,
          onChange: (checked) => {
            if (checked) selected.add(group.groupId); else selected.delete(group.groupId);
            vscode.postMessage({ type: "ignoreSelection", toolId: "ignoreSettings", groupIds: [...selected] });
            ts.ignoreSelectedGroupIds = [...selected];
            renderIgnoreResults(ts);
          },
        } : undefined;
        target.appendChild(createCompactGroup(group.title, group.confidence + (group.reviewRequired ? " · 需复核" : ""), [wrapper], checkbox));
      }
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
      if (isCodeAssistantTool() && state.codeAssistantFeature === "packageIncludes") {
        return { title: "头文件引用修正", description: "在右侧 View 预览并写入 CMake Package include 修正。" };
      }
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

    const searchReplaceButtonState = ${ktcSearchReplaceButtonState.toString()};
    const simpleRenameRules = ${ktcSimpleRenameRules.toString()};
    function renderIgnoreConfig() {
      const cfg = state.ignoreConfig;
      if (!cfg) {
        els.ignoreStatus.textContent = "未打开工作区";
        els.btnOpenIgnore.disabled = true;
        els.btnSyncIgnore.disabled = true;
        els.btnAppendPreset.disabled = true;
        els.btnRemovePreset.disabled = true;
        els.btnAnalyzeIgnore.disabled = true;
        return;
      }
      const dirty = cfg.statusText.includes("未保存") ? " · 未保存" : "";
      els.ignoreStatus.textContent = cfg.relativePath + " · " + cfg.patternCount + " 条" + dirty;
      els.btnOpenIgnore.disabled = false;
      els.btnSyncIgnore.disabled = !cfg.gitIgnoreExists;
      els.btnAppendPreset.disabled = false;
      els.btnRemovePreset.disabled = false;
      els.btnAnalyzeIgnore.disabled = false;
    }

    function renderWorkingContext() {
      const context = state.workingContext || {};
      els.gitIgnoreStatus.textContent = context.gitIgnoreExists ? "Git Ignore · 生效" : "Git Ignore · 无规则";
      els.pluginIgnoreEnabled.checked = context.pluginIgnoreEnabled !== false;
      renderRecentWorkingDirectories();
    }

    function renderRecentWorkingDirectories() {
      const selected = state.workingContext.selectedDirectory || "";
      els.replaceScope.innerHTML = "";
      const seen = new Set();
      const appendOption = (directory, label) => {
        if (seen.has(directory)) return;
        seen.add(directory);
        const option = document.createElement("option");
        option.value = directory;
        option.textContent = label;
        option.title = directory || "当前目录";
        els.replaceScope.appendChild(option);
      };
      for (const option of state.recentWorkingDirectories.options || []) {
        appendOption(option.value, option.label);
      }
      for (const directory of state.recentWorkingDirectories.workspace || []) {
        appendOption(directory, "最近 · " + directory);
      }
      for (const directory of state.recentWorkingDirectories.external || []) {
        appendOption(directory, "外部 · " + directory);
      }
      if (!seen.has(selected)) appendOption(selected, selected || "当前目录");
      els.replaceScope.value = selected;
      els.replaceScope.title = selected || "当前目录";
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

    function renderRibbonHeaderControls() {
      const nextDensity = state.sidebarStyle === "compact" ? "图标与文字" : "仅图标";
      els.btnRibbonDensity.title = "切换为" + nextDensity;
      els.btnRibbonDensity.setAttribute("aria-label", els.btnRibbonDensity.title);
    }

    function renderCodeAssistantReorder(reorderState, running) {
      const treeUi = state.codeAssistantTreeUiState;
      els.codeAssistantTreeSection.open = !!treeUi.treeExpanded;
      els.codeAssistantCppGroup.open = !!treeUi.cppOrganizeExpanded;
      els.codeAssistantFileToolsGroup.open = !!treeUi.fileToolsExpanded;
      els.codeAssistantCaaGroup.open = !!treeUi.caaExpanded;
      els.codeAssistantReorderActions.open = !!treeUi.reorderActionsExpanded;
      els.codeAssistantReorderResults.open = !!treeUi.reorderResultsExpanded;
      const active = isCodeAssistantReorderFeature();
      for (const button of els.codeAssistantBlock.querySelectorAll("[data-code-assistant-feature]")) {
        button.classList.toggle("selected", button.dataset.codeAssistantFeature === state.codeAssistantFeature);
      }
      const genericFeature = ["headerAscii", "encodingFix", "uuidReplace", "caaDialog"].includes(state.codeAssistantFeature);
      els.codeAssistantEmpty.hidden = active || genericFeature;
      els.codeAssistantReorderActions.hidden = !active;
      els.codeAssistantReorderResults.hidden = !active;
      if (!active) return;
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
      document.body.classList.toggle("ribbon-only", state.presentation === "ribbon");
      document.body.classList.toggle("detail-block", state.presentation === "detailBlock");
      const welcomeMode = state.presentation === "detailBlock" && (state.openToolIds || []).length === 0;
      els.ribbonShell.classList.toggle("collapsed", !!state.ribbonBlockCollapsed);
      els.primaryShell.classList.toggle("collapsed", !!state.primaryBlockCollapsed);
      els.btnToggleRibbonBlock.setAttribute("aria-expanded", state.ribbonBlockCollapsed ? "false" : "true");
      els.btnTogglePrimaryBlock.setAttribute("aria-expanded", state.primaryBlockCollapsed ? "false" : "true");
      renderRibbonHeaderControls();
      els.btnCloseTool.hidden = welcomeMode;
      document.body.classList.toggle("welcome-mode", welcomeMode);
      els.welcomePanel.hidden = !welcomeMode;
      const tool = activeTool();
      if (welcomeMode) {
        els.title.textContent = "插件概览";
        els.desc.textContent = "";
      } else if (tool) {
        els.title.textContent = isCodeAssistantTool() && state.codeAssistantFeature
          ? "代码辅助 / " + tool.title
          : tool.title;
        els.desc.textContent = tool.description;
      } else {
        els.title.textContent = "插件概览";
        els.desc.textContent = "";
      }
      els.btnProjectRenameAnalysis.hidden = welcomeMode || tool?.id !== "codeRename";
      els.tabs.innerHTML = "";
      for (const staleMenu of document.querySelectorAll(".module-more-global")) staleMenu.remove();
      els.tabs.className = "tabs " + state.sidebarStyle;
      els.tabs.title = (state.openToolIds || []).length
        ? "已打开 " + state.openToolIds.length + " 个工具 Block"
        : "没有打开的工具 Block";
      const visibleModules = state.moduleState.visible || ["code"];
      const pinned = new Set(state.ribbonLayout.pinnedToolIds || []);
      const shortTitles = { headerAscii: "头文件", encodingFix: "编码", ignoreSettings: "忽略", codeRename: "替换", codegen: "自动代码", reorderMembers: "排序", codeAssistant: "代码辅助", uuidReplace: "UUID", caaDialog: "CAA UI", git: "Git", run: "Run", environmentSettings: "设置" };
      const customizationTools = orderedTools(state.tools.filter((item) => (
        (state.moduleState.installed || ["code"]).includes(item.moduleId || "code")
        && item.ribbonVisible !== false
        && item.id !== "environmentSettings"
        && item.id !== "ignoreSettings"
      )));
      const openTool = (tool) => {
        state.primaryBlockCollapsed = false;
        persistUiState();
        render();
        const isModuleTool = (tool.moduleId || "code") !== "code" && !!tool.command;
        if (isModuleTool) vscode.postMessage({ type: "runModuleTool", moduleId: tool.moduleId, command: tool.command });
        else vscode.postMessage({ type: "selectTool", toolId: tool.id });
      };
      for (const moduleId of visibleModules) {
        const moduleTools = orderedTools(state.tools.filter((item) => (
          (item.moduleId || "code") === moduleId
          && item.ribbonVisible !== false
          && item.id !== "environmentSettings"
          && item.id !== "ignoreSettings"
        )));
        if (!moduleTools.length) continue;
        const visibleTools = moduleTools.filter((tool) => pinned.has(tool.id) || tool.id === state.activeToolId);
        const group = document.createElement("div");
        group.className = "module-group";
        group.dataset.moduleId = moduleId;
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
          const isActive = isOpen && isActiveModule && t.id === state.activeToolId;
          btn.className = "tab" + (isOpen ? " open" : "") + (isActive ? " active" : "");
          btn.type = "button";
          btn.setAttribute("aria-pressed", isActive ? "true" : "false");
          if (t.icon && t.icon.includes(":")) {
            const icon = document.createElement("span");
            icon.className = "tool-icon";
            icon.style.setProperty("--tool-icon", 'url("' + t.icon.replace(/"/g, "") + '")');
            btn.appendChild(icon);
          }
          const label = document.createElement("span");
          label.textContent = t.shortTitle || shortTitles[t.id] || t.title;
          btn.appendChild(label);
          const openState = isActive
            ? " · 当前显示"
            : (isOpen ? " · 已打开，当前隐藏" : "");
          const countState = isOpen ? " · 共打开 " + state.openToolIds.length + " 个" : "";
          btn.title = t.title + openState + countState;
          btn.dataset.tooltip = t.title + openState + countState;
          btn.setAttribute("aria-label", t.title + openState);
          btn.onclick = () => openTool(t);
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
          if (more.open) requestAnimationFrame(() => {
            placeModuleMoreMenu(els.btnRibbonCustomize, moreMenu);
            if (focusRibbonMenuRequested) {
              focusRibbonMenuRequested = false;
              customization.focusFirst();
            }
          });
        };
        const customization = document.createElement("ktc-ribbon-customization-menu");
        customization.model = {
          tools: customizationTools.map((item) => ({
            id: item.id,
            title: item.title,
            shortTitle: item.shortTitle || shortTitles[item.id] || item.title,
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
            openTool(selected);
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
        if (openModuleMenuId === "all") {
          more.open = true;
          requestAnimationFrame(() => {
            placeModuleMoreMenu(els.btnRibbonCustomize, moreMenu);
            if (focusRibbonMenuRequested) {
              focusRibbonMenuRequested = false;
              customization.focusFirst();
            }
          });
        }
      }
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
      const codeAssistant = isCodeAssistantTool();
      const reorderState = state.toolStates.reorderMembers || { status: "idle" };
      const reorderFeature = isCodeAssistantReorderFeature();
      const running = (reorderFeature ? reorderState : ts).status === "running";
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
      els.btnProjectRenameAnalysis.disabled = running;
      const codeAssistantGenericFeature = codeAssistant && (enc || header || uuid || caaDialog);
      const codeAssistantTreeOnly = codeAssistant && !codeAssistantGenericFeature;
      renderGitRepositoryContext(ts, running, git);
      document.body.classList.toggle("codegen-tool", codegen);
      document.body.classList.toggle("run-tool", run);
      document.body.classList.toggle("git-tool", git);
      // 代码辅助目录是当前工具 Block 的第一项，不能夹在说明或通用按钮之后。
      els.desc.hidden = ignore || codeAssistant;
      els.replaceBlock.hidden = !rename;
      els.codeAssistantBlock.hidden = !codeAssistant;
      if (codeAssistant) els.primaryBody.insertBefore(els.codeAssistantBlock, els.primaryBody.firstElementChild);
      els.codegenPanel.hidden = !codegen;
      els.runPanel.hidden = !run;
      els.gitPanel.hidden = !git;
      els.uuidResultsPanel.hidden = !uuid;
      els.renameResultsPanel.hidden = !rename;
      els.environmentBlock.hidden = !environment;
      const genericActionFeature = enc || header || uuid || caaDialog;
      els.codeAssistantGenericActions.hidden = !genericActionFeature;
      els.codeAssistantGenericTitle.textContent = enc
        ? "编码操作"
        : header
          ? "头文件操作"
          : uuid
            ? "UUID 操作"
            : "CAA UI 操作";
      els.btnCodeAssistantGenericClose.hidden = !codeAssistantGenericFeature;
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
      els.btnApplyIgnoreRecommendations.hidden = true;
      els.btnScan.disabled = running;
      els.btnFix.disabled = running;
      els.btnScan.textContent = rename ? "打开" : (ignore ? "打开规则" : (uuid ? "扫描 UUID" : (caaDialog ? "扫描 CATDlg" : "预检")));
      els.btnFix.textContent = enc ? "按目标转换" : (ignore ? "从 .gitignore 同步" : (uuid ? "替换所选" : (caaDialog ? "Desk Tools 设置" : "修复")));
      els.btnFix.style.display = rename ? "none" : "inline-block";

      els.targetHint.hidden = !enc;
      if (enc) renderEncodingTargetSettings(running);
      els.scopeBlock.hidden = rename || codeAssistantTreeOnly || codegen || run || git || ignore || uuid || caaDialog || environment;

      if (codegen) renderCodegen(ts, running);
      if (run) renderRun(ts, running);
      if (git) renderGit(ts, running);

      if (codeAssistant) renderCodeAssistantReorder(reorderState, running);
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

      renderIgnoreConfig();
      renderWorkingContext();
      renderIgnoreResults(state.toolStates.ignoreSettings || { status: "idle" });

      els.optionsPanel.hidden = rename || codeAssistantTreeOnly || codegen || run || git || ignore || uuid || caaDialog || environment;
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
      els.status.hidden = codeAssistantTreeOnly || codegen || run || git;
      els.resultsTitle.hidden = codeAssistantTreeOnly || codegen || run || git || rename || uuid || environment;
      els.results.hidden = codeAssistantTreeOnly || codegen || run || git || rename || uuid || environment;
      els.results.innerHTML = "";
      els.resultsTitle.textContent = header ? "问题文件" : (enc ? "编码结果" : (rename ? "替换结果" : (ignore ? "推荐规则" : (uuid ? "UUID 结果" : (caaDialog ? "CATDlg 文件" : "结果")))));

      if (environment) {
        renderEnvironment(ts);
        els.empty.style.display = "none";
      } else if (codegen) {
        els.empty.style.display = "none";
      } else if (codeAssistantTreeOnly) {
        els.empty.style.display = "none";
      } else if (run) {
        els.empty.style.display = "none";
      } else if (git) {
        els.empty.style.display = "none";
      } else if (header) {
        renderHeaderResults(ts, !!state.showDetails);
      } else if (enc) {
        renderEncodingResults(ts, !!state.showEncDetails);
      } else if (rename) {
        els.empty.style.display = "none";
      } else if (ignore) {
        renderIgnoreResults(ts);
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
    function collapseCodeAssistantDirectory() {
      state.codeAssistantTreeUiState.treeExpanded = false;
      els.codeAssistantTreeSection.open = false;
      persistCodeAssistantTreeUiState();
    }
    function selectCodeAssistantFeature(feature, message) {
      state.codeAssistantFeature = feature;
      if (feature === "reorderMembers") {
        const treeUi = state.codeAssistantTreeUiState;
        if (!treeUi.reorderActionsExpanded && !treeUi.reorderResultsExpanded) {
          treeUi.reorderActionsExpanded = true;
          els.codeAssistantReorderActions.open = true;
          persistCodeAssistantTreeUiState();
        }
      } else {
        // Generic leaves own one inner Block. Re-selecting a feature must not
        // leave the user with a collapsed tree and no visible operation area.
        els.codeAssistantGenericActions.open = true;
      }
      collapseCodeAssistantDirectory();
      vscode.postMessage(message);
    }
    els.btnCodeAssistantPackageIncludes.onclick = () => {
      // Editor View features do not own a Primary inner Block. Keep the tree
      // expanded so opening the View never leaves an apparently empty Primary.
      state.codeAssistantFeature = "packageIncludes";
      vscode.postMessage({ type: "openCodeAssistantFeature", feature: "packageIncludes" });
    };
    els.btnCodeAssistantReorderMembers.onclick = () => {
      selectCodeAssistantFeature("reorderMembers", { type: "selectTool", toolId: "reorderMembers" });
    };
    els.btnCodeAssistantHeaderAscii.onclick = () => selectCodeAssistantFeature("headerAscii", { type: "selectTool", toolId: "headerAscii" });
    els.btnCodeAssistantEncodingFix.onclick = () => selectCodeAssistantFeature("encodingFix", { type: "selectTool", toolId: "encodingFix" });
    els.btnCodeAssistantUuidReplace.onclick = () => selectCodeAssistantFeature("uuidReplace", { type: "selectTool", toolId: "uuidReplace" });
    els.btnCodeAssistantCaaDialog.onclick = () => selectCodeAssistantFeature("caaDialog", { type: "selectTool", toolId: "caaDialog" });
    els.btnCodeAssistantReorderClose.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({ type: "closeCodeAssistantFeature", toolId: "reorderMembers" });
    };
    els.btnCodeAssistantGenericClose.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      vscode.postMessage({ type: "closeCodeAssistantFeature", toolId: currentContentToolId() });
    };
    function persistCodeAssistantTreeUiState() {
      if (!initialized) return;
      vscode.postMessage({ type: "setCodeAssistantTreeUiState", state: state.codeAssistantTreeUiState });
    }
    els.codeAssistantTreeSection.ontoggle = () => {
      state.codeAssistantTreeUiState.treeExpanded = els.codeAssistantTreeSection.open;
      persistCodeAssistantTreeUiState();
    };
    els.codeAssistantCppGroup.ontoggle = () => {
      state.codeAssistantTreeUiState.cppOrganizeExpanded = els.codeAssistantCppGroup.open;
      persistCodeAssistantTreeUiState();
    };
    els.codeAssistantFileToolsGroup.ontoggle = () => {
      state.codeAssistantTreeUiState.fileToolsExpanded = els.codeAssistantFileToolsGroup.open;
      persistCodeAssistantTreeUiState();
    };
    els.codeAssistantCaaGroup.ontoggle = () => {
      state.codeAssistantTreeUiState.caaExpanded = els.codeAssistantCaaGroup.open;
      persistCodeAssistantTreeUiState();
    };
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
        scope: els.replaceScope.value,
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
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = history.length ? "最近改名…" : "暂无最近记录";
      const options = history.map((entry, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = entry.source + " → " + entry.target;
        option.title = entry.updatedAt || option.textContent;
        return option;
      });
      els.replaceHistory.replaceChildren(placeholder, ...options);
      const selectedIndex = history.findIndex((entry) => renameHistoryKey(entry) === selectedRenameHistoryKey);
      els.replaceHistory.value = selectedIndex >= 0 ? String(selectedIndex) : "";
      if (selectedIndex < 0) selectedRenameHistoryKey = "";
      els.replaceHistory.disabled = running || history.length === 0;
      els.btnDeleteReplaceHistory.disabled = running || selectedIndex < 0;
      els.btnClearReplaceHistory.disabled = running || history.length === 0;
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
          pluginIgnoreEnabled: state.workingContext.pluginIgnoreEnabled !== false,
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
      });
    };
    els.replaceToggle.onclick = () => {
      state.replace.collapsed = !state.replace.collapsed;
      saveReplaceState();
      render();
    };
    els.replaceHistory.onchange = () => {
      const index = Number(els.replaceHistory.value);
      const entry = Number.isSafeInteger(index) ? toolState().renameHistory?.[index] : undefined;
      if (!entry) return;
      selectedRenameHistoryKey = renameHistoryKey(entry);
      els.replaceSearch.value = entry.source;
      els.replaceWith.value = entry.target;
      saveReplaceState();
      render();
    };
    els.btnDeleteReplaceHistory.onclick = () => {
      const entry = (toolState().renameHistory || []).find((candidate) => renameHistoryKey(candidate) === selectedRenameHistoryKey);
      if (!entry) return;
      selectedRenameHistoryKey = "";
      vscode.postMessage({
        type: "deleteRenameHistoryPair",
        toolId: "codeRename",
        source: entry.source,
        target: entry.target,
      });
    };
    els.btnClearReplaceHistory.onclick = () => {
      selectedRenameHistoryKey = "";
      vscode.postMessage({ type: "clearRenameHistoryPairs", toolId: "codeRename" });
    };
    els.btnReplaceVariants.onclick = () => {
      state.replace.variantMode = state.replace.variantMode === "common" ? "exact" : "common";
      if (state.replace.variantMode === "common") refreshSimpleRenameRules(true);
      saveReplaceState();
      render();
    };
    els.defaultEncoding.onchange = saveReplaceState;
    els.btnPickWorkingDirectory.onclick = () => vscode.postMessage({ type: "pickWorkingDirectory" });
    els.btnOpenSettings.onclick = () => vscode.postMessage({ type: "selectTool", toolId: "environmentSettings" });
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
    els.replaceScope.onchange = () => {
      els.replaceScope.title = els.replaceScope.value || "当前目录";
      vscode.postMessage({ type: "selectWorkingDirectory", directory: els.replaceScope.value });
    };
    els.pluginIgnoreEnabled.onchange = () => vscode.postMessage({
      type: "setPluginIgnoreEnabled", enabled: els.pluginIgnoreEnabled.checked,
    });
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
    els.btnOpenIgnore.onclick = () => vscode.postMessage({ type: "openIgnoreFile" });
    els.btnSyncIgnore.onclick = () => vscode.postMessage({ type: "syncIgnoreFromGit" });
    els.btnAnalyzeIgnore.onclick = () => vscode.postMessage({ type: "analyzeIgnore" });
    els.btnApplyIgnoreRecommendations.onclick = () => vscode.postMessage({
      type: "applyIgnoreRecommendations",
      groupIds: state.toolStates.ignoreSettings?.ignoreSelectedGroupIds || [],
    });
    els.btnAppendPreset.onclick = () => vscode.postMessage({
      type: "applyIgnorePreset", presetId: els.ignorePreset.value, action: "append",
    });
    els.btnRemovePreset.onclick = () => vscode.postMessage({
      type: "applyIgnorePreset", presetId: els.ignorePreset.value, action: "remove",
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
    els.btnToggleRibbonBlock.onclick = () => {
      state.ribbonBlockCollapsed = !state.ribbonBlockCollapsed;
      persistUiState();
      render();
    };
    els.btnTogglePrimaryBlock.onclick = () => {
      state.primaryBlockCollapsed = !state.primaryBlockCollapsed;
      persistUiState();
      render();
    };
    els.btnRibbonDensity.onclick = () => {
      if (state.ribbonBlockCollapsed) {
        state.ribbonBlockCollapsed = false;
        persistUiState();
        render();
      }
      vscode.postMessage({ type: "toggleRibbonDensity" });
    };
    els.btnRibbonCustomize.onclick = () => {
      openModuleMenuId = "all";
      focusRibbonMenuRequested = true;
      render();
    };
    els.btnCloseTool.onclick = () => vscode.postMessage({ type: "closeToolBlock" });
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
      for (const menu of document.querySelectorAll(".module-more[open]")) {
        if (!menu.contains(event.target)) {
          openModuleMenuId = "";
          menu.open = false;
        }
      }
    });
    window.addEventListener("resize", () => {
      openModuleMenuId = "";
      for (const menu of document.querySelectorAll(".module-more[open]")) menu.open = false;
    });

    window.addEventListener("message", (e) => {
      const msg = e.data;
      if (msg.type === "init") {
        const activeToolChanged = switchActiveTool(msg.activeToolId);
        if (initialized && activeToolChanged) state.primaryBlockCollapsed = false;
        state.tools = msg.tools;
        state.openToolIds = msg.openToolIds || [];
        state.codeAssistantFeature = msg.codeAssistantFeature || "";
        state.codeAssistantTreeUiState = msg.codeAssistantTreeUiState || state.codeAssistantTreeUiState;
        state.toolOptions = msg.toolOptions || {};
        state.scope = msg.scope || state.scope;
        state.ignoreConfig = msg.ignoreConfig || null;
        state.sidebarStyle = msg.sidebarStyle || "ribbon";
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
        if (activeToolChanged) state.primaryBlockCollapsed = false;
        state.openToolIds = msg.openToolIds || [];
        state.codeAssistantFeature = msg.codeAssistantFeature || "";
        render();
        restoreActiveToolScroll(activeToolChanged);
      } else if (msg.type === "modules") {
        state.moduleState = msg.moduleState || state.moduleState;
        render();
      } else if (msg.type === "moduleBlock") {
        state.moduleBlock = msg.content || null;
        render();
      } else if (msg.type === "requestSearchReplacePreview") {
        const activeToolChanged = switchActiveTool("codeRename");
        state.primaryBlockCollapsed = false;
        render();
        restoreActiveToolScroll(activeToolChanged);
        runSearchReplace("preview");
      } else if (msg.type === "recentWorkingDirectories") {
        state.recentWorkingDirectories = msg.directories || { workspace: [], external: [], options: [] };
        renderRecentWorkingDirectories();
        if (typeof msg.selected === "string") {
          state.workingContext.selectedDirectory = msg.selected;
          state.replace.scope = msg.selected;
          renderRecentWorkingDirectories();
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
