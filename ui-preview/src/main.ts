import { KTC_CODE_ASSISTANT_NAVIGATION } from "../../src/tools/codeAssistant/navigation.js";
import {
  PNW_COMBO_ACTION,
  type PnwComboActionDetail,
  type PnwComboElement,
} from "../../src/ui/PnwComboWingAdapter.js";
import "../../src/ui/PnwComboEntry.js";
import {
  ktCodegenDefinePrimaryPanelElement,
  type KtCodegenPrimaryActionDetail,
  type KtCodegenPrimaryPanel,
} from "@phoenix-wing/kt-codegen/ui";
import {
  type KtcToolNavigator,
  type KtcToolNavigatorActionDetail,
} from "../../src/ui/KtcToolNavigator.js";
import "../../src/ui/KtcToolNavigatorEntry.js";
import {
  type KtcOpenItemsBar,
  type KtcOpenItemsBarActionDetail,
} from "../../src/ui/KtcOpenItemsBar.js";
import "../../src/ui/KtcOpenItemsBarEntry.js";
import {
  KTC_CURRENT_TOOL_REGION_ACTION,
  type KtcCurrentToolRegion,
  type KtcCurrentToolRegionActionDetail,
} from "../../src/ui/KtcCurrentToolRegion.js";
import "../../src/ui/KtcCurrentToolRegionEntry.js";
import {
  KTC_DIRECTORY_BAR_ACTION,
  type KtcDirectoryBar,
  type KtcDirectoryBarActionDetail,
} from "../../src/ui/KtcDirectoryBar.js";
import "../../src/ui/KtcDirectoryBarEntry.js";
import "../../src/ui/KtcPrimaryShellEntry.js";
import {
  KTC_TOOLBAR_STRIP_ACTION,
  type KtcToolbarStrip,
  type KtcToolbarStripActionDetail,
} from "../../src/ui/KtcToolbarStrip.js";
import "../../src/ui/KtcToolbarStripEntry.js";
import type { KtcRightViewShell } from "../../src/ui/KtcRightViewShell.js";
import "../../src/ui/KtcRightViewShellEntry.js";
import {
  KTC_SYSTEM_OUTPUT_BLOCK_ACTION,
  type KtcSystemOutputBlock,
  type KtcSystemOutputBlockActionDetail,
} from "../../src/ui/KtcSystemOutputBlock.js";
import "../../src/ui/KtcSystemOutputBlockEntry.js";
import {
  KTC_RENAME_RESULTS_ACTION,
  ktcDefineRenameResultsPanel,
  type KtcRenameResultsPanel,
} from "../../src/sidebar/renameResultsPanel.js";
import {
  describePrimaryVisibilityAction,
  findLatestMruItem,
  removeMruItem,
  resolvePreviewGroupNavigation,
  resolvePreviewHostVisibility,
  touchMruItem,
} from "./previewState.js";
import {
  createPreviewStateStore,
  type PreviewPersistedState,
  type PreviewPrimaryWidth,
  type PreviewTheme,
} from "./previewStateStore.js";
import {
  PREVIEW_RIBBON_ITEMS,
  PREVIEW_TOOL_CATALOG_BY_ID,
  resolvePreviewTool,
  type PreviewToolDescriptor,
} from "./previewToolCatalog.js";
import {
  resolvePreviewToolRoute,
  type PreviewOpenItemKind,
} from "./previewToolRouting.js";
import {
  type PreviewCompanionModel,
} from "./previewCompanionModel.js";
import { PREVIEW_RIGHT_PRIMARY_SAMPLE } from "./previewRightPrimarySample.js";
import {
  createDefaultPreviewAutoBuildState,
  derivePreviewAutoBuildState,
  reducePreviewAutoBuildState,
  type PreviewAutoBuildIntent,
  type PreviewAutoBuildTransition,
} from "./previewAutoBuildState.js";
import { PREVIEW_AUTO_BUILD_SAMPLE } from "./previewAutoBuildSample.js";
import packageManifest from "../../package.json";

type PrimaryWidth = Exclude<PreviewPrimaryWidth, "custom">;
type PreviewItemKind = PreviewOpenItemKind;
type UtilityToolId = "ignoreSettings" | "environmentSettings";

interface PreviewOpenItem extends PreviewToolDescriptor {
  readonly id: string;
  readonly kind: PreviewItemKind;
}

const RIGHT_COMPANION_MODELS: Readonly<Record<string, PreviewCompanionModel>> =
  PREVIEW_RIGHT_PRIMARY_SAMPLE.companions;

ktCodegenDefinePrimaryPanelElement();
ktcDefineRenameResultsPanel();

const INITIAL_AUTO_BUILD_STATE = createDefaultPreviewAutoBuildState();
const INITIAL_AUTO_BUILD_VIEW = derivePreviewAutoBuildState(INITIAL_AUTO_BUILD_STATE);
const INITIAL_PREVIEW_OUTPUT_LINES = Object.freeze([
  "#01 [系统] Phoenix Webview Preview 已连接",
  "#02 [模块] 编译工具原型已注册：Primary + Right",
  `#03 [配置] ${INITIAL_AUTO_BUILD_STATE.currentConfigName} · 启用项目 ${INITIAL_AUTO_BUILD_VIEW.enabledProjectMetric} · ${INITIAL_AUTO_BUILD_STATE.parallelBuild ? "并行执行" : "顺序执行"}`,
  `#04 [环境] ${PREVIEW_AUTO_BUILD_SAMPLE.environment.platform}`,
  "#05 [提示] 按钮反馈会追加到这里；不会调用真实业务。",
]);

const previewStateStore = createPreviewStateStore();
const initialPreviewState = previewStateStore.load();

const root = document.documentElement;
const workbench = required<HTMLElement>("#preview-workbench");
const primaryHost = required<HTMLElement>(".preview-primary");
const editorHost = required<HTMLElement>(".preview-editor");
const splitter = required<HTMLElement>("#preview-splitter");
const directoryRow = required<KtcDirectoryBar>("[data-directory-row]");
const directoryToggle = required<HTMLButtonElement>("[data-action='toggle-directory']");
const outputToggle = required<HTMLButtonElement>("[data-action='toggle-output']");
const directoryHeaderIcon = required<SVGUseElement>("[data-directory-header-icon]");
const toolbarStrip = required<KtcToolbarStrip>("[data-toolbar-strip]");
const ribbonHost = required<HTMLElement>("[data-preview-ribbon]");
const currentTool = required<KtcCurrentToolRegion>("[data-current-tool]");
const codeAssistantSurface = required<HTMLElement>("[data-code-assistant-surface]");
const standaloneSurface = required<HTMLElement>("[data-standalone-surface]");
const primaryContent = required<HTMLElement>("[data-primary-content]");
const navigator = required<KtcToolNavigator>("#preview-tool-navigator");
const openItemsBar = required<KtcOpenItemsBar>("#preview-open-items-bar");
const editorTabsHost = required<HTMLElement>("[data-editor-tabs]");
const editorEmpty = required<HTMLElement>("[data-editor-empty]");
const systemOutput = required<KtcSystemOutputBlock>("#preview-system-output");
const ribbonMenu = required<HTMLElement>("[data-ribbon-menu]");

renderAutoBuildSampleRows();
renderRibbonItems();

document.querySelectorAll<KtcRightViewShell>("ktc-right-view-shell[data-editor-panel]").forEach((shell) => {
  const panelId = shell.dataset.editorPanel ?? "";
  const descriptor = Object.values(PREVIEW_TOOL_CATALOG_BY_ID).find((candidate) => (
    resolvePreviewToolRoute(candidate).rightPanelId === panelId
  ));
  shell.model = {
    title: descriptor?.title ?? "Right View",
    scrollMode: "vertical",
  };
});

let previewTheme: PreviewTheme = initialPreviewState.theme;
let primaryWidth: PreviewPrimaryWidth = initialPreviewState.primaryWidth;
let customPrimaryWidth = initialPreviewState.customPrimaryWidth;
let primaryVisible = initialPreviewState.primaryVisible;
let activeGroupId = initialPreviewState.activeGroupId;
let directoryVisible = initialPreviewState.directoryVisible;
let ribbonExpanded = initialPreviewState.ribbonExpanded;
let navigatorExpanded = initialPreviewState.navigatorExpanded;
let navigatorShowLabels = initialPreviewState.navigatorShowLabels;
let activeNavigatorToolId = initialPreviewState.activeNavigatorToolId;
let activeSurfaceToolId = initialPreviewState.activeToolId;
let activeEditorId: string | undefined = initialPreviewState.activeEditorId ?? undefined;
let activeItemId = initialPreviewState.activeItemId;
let openItems: PreviewOpenItem[] = initialPreviewState.openToolIds.map(previewItem);
let mruItemIds = [...initialPreviewState.mruItemIds];
let surfaceMruToolIds = [...initialPreviewState.surfaceMruToolIds];
let autoBuildState = INITIAL_AUTO_BUILD_STATE;
let outputVisible = initialPreviewState.outputVisible;
let previewOutputSequence = INITIAL_PREVIEW_OUTPUT_LINES.length;
let previewOutputLines: readonly string[] = INITIAL_PREVIEW_OUTPUT_LINES;

let utilitySelections = defaultUtilitySelections();

const directoryChoices = [
  "PNXCaaStudy/PNXBomAnalysisWsp",
  "phoenix-open-issue",
  "外部 · /workspace/sample-web-app",
];
let directoryIndex = initialPreviewState.directoryIndex;

document.querySelectorAll<HTMLButtonElement>("[data-theme-option]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeOption as PreviewTheme));
});
document.querySelectorAll<HTMLButtonElement>("[data-width-option]").forEach((button) => {
  button.addEventListener("click", () => setPrimaryWidth(button.dataset.widthOption as PrimaryWidth));
});
required<HTMLButtonElement>("[data-action='toggle-primary']").addEventListener("click", () => {
  const nextVisible = !primaryVisible;
  recordPreviewOutput(`[界面] ${describePrimaryVisibilityAction(nextVisible)}`);
  setPrimaryVisibility(nextVisible);
});
directoryRow.addEventListener(KTC_DIRECTORY_BAR_ACTION, (event) => {
  const detail = (event as CustomEvent<KtcDirectoryBarActionDetail>).detail;
  if (detail.kind !== "select" && detail.kind !== "choose") return;
  directoryIndex = (directoryIndex + 1) % directoryChoices.length;
  const directory = directoryChoices[directoryIndex] ?? directoryChoices[0]!;
  recordPreviewOutput(`[界面] ${detail.kind === "select" ? "切换目录" : "选择目录（模拟）"}：${directory}`);
  renderDirectoryVisibility();
  persistPreviewState();
});
directoryToggle.addEventListener("click", () => {
  const nextVisible = !directoryVisible;
  recordPreviewOutput(`[界面] ${nextVisible ? "显示目录" : "隐藏目录"}`);
  directoryVisible = nextVisible;
  renderDirectoryVisibility();
  persistPreviewState();
});
required<HTMLButtonElement>("[data-action='open-ignore']").addEventListener("click", () => activateTool("ignoreSettings"));
required<HTMLButtonElement>("[data-action='open-settings']").addEventListener("click", () => activateTool("environmentSettings"));
document.querySelectorAll<HTMLButtonElement>("[data-auto-build-action]").forEach((button) => {
  const actionId = button.dataset.autoBuildAction;
  if (actionId === "toggleRun" || actionId === "openScript" || actionId === "preflight") {
    button.addEventListener("click", () => dispatchAutoBuildIntent(actionId));
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-auto-build-project-tool]").forEach((button) => {
  button.addEventListener("click", (event) => {
    // Header actions must not activate the enclosing <summary> disclosure.
    event.preventDefault();
    event.stopPropagation();
    const label = button.dataset.autoBuildProjectTool?.trim();
    if (label === "导入…") {
      openAutoBuildManifestImportDialog();
      return;
    }
    if (label) recordPreviewOutput(`[编译工具] ${label}（模拟）`);
  });
});
document.querySelectorAll<HTMLInputElement>("[data-auto-build-probe-columns]").forEach((input) => {
  input.closest("label")?.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("change", () => dispatchAutoBuildIntent("setProbeColumnsVisible", input.checked));
});
(["root", "thirdParty"] as const).forEach((target) => {
  const selector = target === "root" ? "[data-auto-build-update-root]" : "[data-auto-build-update-third-party]";
  document.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
    input.closest("label")?.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("change", () => dispatchAutoBuildRepositoryUpdate(target, input.checked));
  });
});
systemOutput.addEventListener(KTC_SYSTEM_OUTPUT_BLOCK_ACTION, (event) => {
  const detail = (event as CustomEvent<KtcSystemOutputBlockActionDetail>).detail;
  if (detail.kind === "close") setOutputVisibility(false);
});
outputToggle.addEventListener("click", () => setOutputVisibility(!outputVisible));

toolbarStrip.addEventListener(KTC_TOOLBAR_STRIP_ACTION, (event) => {
  const detail = (event as CustomEvent<KtcToolbarStripActionDetail>).detail;
  if (detail.kind === "setMode") {
    ribbonExpanded = detail.mode === "expanded";
    recordPreviewOutput(`[界面] 工具栏切换为${ribbonExpanded ? "图标和文字" : "仅图标"}`);
    renderRibbon();
    persistPreviewState();
  } else if (detail.kind === "setOverflowOpen") {
    recordPreviewOutput(`[界面] ${detail.open ? "打开" : "关闭"}全部工具与自定义`);
    if (detail.open) showRibbonMenu();
    else hideRibbonMenu();
  }
});
document.querySelectorAll<HTMLButtonElement>("[data-ribbon-id]").forEach((button) => {
  button.addEventListener("click", () => activateRibbonItem(
    button.dataset.ribbonId ?? "",
    button.dataset.nodeKind === "group" ? undefined : button.dataset.toolId,
  ));
});
currentTool.addEventListener(KTC_CURRENT_TOOL_REGION_ACTION, (event) => {
  const detail = (event as CustomEvent<KtcCurrentToolRegionActionDetail>).detail;
  if (detail.kind === "close") closeCurrentPrimaryTool(detail.itemId || undefined);
});
navigator.addEventListener("ktc-tool-navigator-action", (event) => {
  const detail = (event as CustomEvent<KtcToolNavigatorActionDetail>).detail;
  if (detail.kind === "activate") {
    activeNavigatorToolId = detail.toolId;
    activateTool(detail.toolId);
  } else if (detail.kind === "setShowLabels") {
    navigatorShowLabels = detail.showLabels;
  }
  renderNavigator();
  renderRibbon();
  persistPreviewState();
});

openItemsBar.addEventListener("ktc-open-items-bar-action", (event) => {
  const detail = (event as CustomEvent<KtcOpenItemsBarActionDetail>).detail;
  if (detail.kind === "activate") {
    const item = openItems.find((candidate) => candidate.id === detail.itemId);
    if (item) {
      activateOpenItem(item);
      queueMicrotask(restoreOpenItemsFocus);
    }
  } else if (detail.kind === "close") {
    closeItem(detail.itemId);
    queueMicrotask(restoreOpenItemsFocus);
  } else if (detail.kind === "closeOthers") {
    closeOtherItems(detail.itemId);
    queueMicrotask(restoreOpenItemsFocus);
  }
});
document.addEventListener("pointerdown", (event) => {
  const path = event.composedPath();
  if (!ribbonMenu.hidden
    && !ribbonMenu.contains(event.target as Node)
    && !path.includes(toolbarStrip)) hideRibbonMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideRibbonMenu(true);
  }
});
ribbonMenu.addEventListener("keydown", (event) => {
  const buttons = Array.from(ribbonMenu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  if (buttons.length === 0) return;
  const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let nextIndex = -1;
  if (event.key === "ArrowDown") nextIndex = (Math.max(currentIndex, -1) + 1) % buttons.length;
  if (event.key === "ArrowUp") nextIndex = (currentIndex <= 0 ? buttons.length : currentIndex) - 1;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = buttons.length - 1;
  if (nextIndex < 0) return;
  event.preventDefault();
  buttons[nextIndex]?.focus();
});
required<HTMLButtonElement>("[data-action='reset-preview']").addEventListener("click", () => {
  resetVolatilePreviewState();
  restorePreviewState(previewStateStore.reset());
});
document.addEventListener("click", (event) => {
  const path = event.composedPath();
  if (path.includes(systemOutput)) return;
  const button = path.find((candidate): candidate is HTMLButtonElement => (
    candidate instanceof HTMLButtonElement
    && candidate.type === "button"
  ));
  if (!button || button.dataset.previewOutput === "handled" || button.disabled) return;
  if (button.getRootNode() === toolbarStrip.shadowRoot || button.getRootNode() === directoryRow.shadowRoot) return;
  const label = [button.getAttribute("aria-label"), button.title, button.textContent]
    .map((candidate) => candidate?.replace(/\s+/gu, " ").trim() ?? "")
    .find(Boolean);
  if (!label) return;
  recordPreviewOutput(`[界面] ${label.slice(0, 80)}`);
});

let resizing = false;
splitter.addEventListener("pointerdown", (event) => {
  resizing = true;
  splitter.setPointerCapture(event.pointerId);
});
splitter.addEventListener("pointermove", (event) => {
  if (!resizing) return;
  setCustomPrimaryWidth(event.clientX - workbench.getBoundingClientRect().left);
});
splitter.addEventListener("pointerup", (event) => {
  endResize(event.pointerId);
});
splitter.addEventListener("pointercancel", (event) => endResize(event.pointerId));
splitter.addEventListener("lostpointercapture", () => { resizing = false; });
splitter.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const primary = document.querySelector<HTMLElement>(".preview-primary");
  const delta = event.key === "ArrowLeft" ? -20 : 20;
  setCustomPrimaryWidth((primary?.getBoundingClientRect().width ?? 420) + delta);
});

function endResize(pointerId: number): void {
  resizing = false;
  if (splitter.hasPointerCapture(pointerId)) splitter.releasePointerCapture(pointerId);
}

function setTheme(theme: PreviewTheme, persist = true): void {
  previewTheme = theme;
  root.dataset.previewTheme = theme;
  document.querySelectorAll<HTMLButtonElement>("[data-theme-option]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeOption === theme));
  });
  if (persist) persistPreviewState();
}

function setPrimaryWidth(width: PrimaryWidth, persist = true): void {
  primaryWidth = width;
  customPrimaryWidth = null;
  root.dataset.primaryWidth = width;
  root.style.removeProperty("--preview-primary-width");
  updateSplitterAria({ narrow: 340, standard: 420, wide: 560 }[width]);
  document.querySelectorAll<HTMLButtonElement>("[data-width-option]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.widthOption === width));
  });
  if (persist) persistPreviewState();
}

function setCustomPrimaryWidth(width: number, persist = true): void {
  primaryWidth = "custom";
  customPrimaryWidth = Math.max(300, Math.min(620, Math.round(width)));
  root.dataset.primaryWidth = "custom";
  root.style.setProperty("--preview-primary-width", `${customPrimaryWidth}px`);
  updateSplitterAria(customPrimaryWidth);
  document.querySelectorAll<HTMLButtonElement>("[data-width-option]").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
  });
  if (persist) persistPreviewState();
}

function updateSplitterAria(width: number): void {
  splitter.setAttribute("aria-valuemin", "300");
  splitter.setAttribute("aria-valuemax", "620");
  splitter.setAttribute("aria-valuenow", String(width));
  splitter.setAttribute("aria-valuetext", `Primary 宽度 ${width} 像素`);
}

function setPrimaryVisibility(visible: boolean, persist = true): void {
  hideRibbonMenu();
  primaryVisible = visible;
  const visibility = resolvePreviewHostVisibility(visible);
  root.dataset.primaryVisible = String(visible);
  workbench.dataset.primaryVisible = String(visible);
  primaryHost.hidden = !visibility.primary;
  editorHost.hidden = !visibility.editor;
  splitter.hidden = !visibility.splitter;
  const button = required<HTMLButtonElement>("[data-action='toggle-primary']");
  button.setAttribute("aria-pressed", String(visible));
  const label = visible ? "隐藏 Primary" : "显示 Primary";
  button.setAttribute("aria-label", label);
  button.title = label;
  if (persist) persistPreviewState();
}

function renderRibbon(): void {
  toolbarStrip.model = {
    mode: ribbonExpanded ? "expanded" : "compact",
    groupContentVisible: activeGroupId === "codeAssistant" && navigatorExpanded,
    overflowOpen: !ribbonMenu.hidden,
  };
  document.querySelectorAll<HTMLButtonElement>("[data-ribbon-id]").forEach((button) => {
    const active = button.dataset.ribbonId === activeGroupId;
    const item = PREVIEW_RIBBON_ITEMS.find(({ ribbonId }) => ribbonId === button.dataset.ribbonId);
    if (!item) return;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.nodeKind === "group") {
      button.setAttribute("aria-expanded", String(active && navigatorExpanded));
    }
    button.title = `${item.title} · ${item.description}${active ? " · 当前显示" : ""}`;
    if (active && button.dataset.ribbonId === "codeAssistant") {
      button.title = `${item.title} · ${item.description} · 二级目录${navigatorExpanded ? "已展开" : "已收起"}，再次点击切换`;
    } else if (button.dataset.nodeKind === "group") {
      button.title = `${item.title} · ${item.description} · 有下级工具`;
    }
  });
}

function renderRibbonItems(): void {
  PREVIEW_RIBBON_ITEMS.forEach((item) => {
    const button = document.createElement("button");
    button.className = "preview-ribbon-item";
    button.type = "button";
    button.dataset.ribbonId = item.ribbonId;
    button.dataset.nodeKind = item.kind;
    if (item.kind === "tool") button.dataset.toolId = item.toolId;
    button.setAttribute("aria-label", item.title);
    button.setAttribute("aria-description", item.description);
    button.setAttribute("aria-pressed", "false");
    button.append(previewIcon(item.icon));
    const label = document.createElement("span");
    label.textContent = item.shortTitle;
    button.append(label);
    if (item.kind === "group") {
      button.setAttribute("aria-expanded", "false");
      const chevron = previewIcon("chevron-down");
      chevron.classList.add("preview-ribbon-group-chevron");
      button.append(chevron);
    }
    ribbonHost.append(button);
  });
}

function activateRibbonItem(ribbonId: string, toolId?: string): void {
  if (toolId) {
    hideRibbonMenu();
    navigatorExpanded = false;
    activateTool(toolId);
    return;
  }
  activateGroup(ribbonId);
}

function activateGroup(groupId: string): void {
  if (!groupId) return;
  hideRibbonMenu();
  const repeatedCodeAssistant = activeGroupId === groupId && groupId === "codeAssistant";
  if (repeatedCodeAssistant) navigatorExpanded = !navigatorExpanded;
  activeGroupId = groupId;
  if (!repeatedCodeAssistant && groupId === "codeAssistant") navigatorExpanded = true;
  if (groupId !== "codeAssistant") navigatorExpanded = false;
  if (groupId === "codeAssistant") {
    const resolution = resolvePreviewGroupNavigation(
      activeSurfaceToolId,
      isOpenTool(activeNavigatorToolId) ? activeNavigatorToolId : "",
      latestOpenNavigatorToolId(),
    );
    activeNavigatorToolId = resolution.activateToolId;
    activeSurfaceToolId = resolution.surfaceToolId;
    if (resolution.activateToolId) {
      activateTool(resolution.activateToolId);
      return;
    }
  }
  renderRibbon();
  renderSurface();
  persistPreviewState();
}

function renderSurface(): void {
  const title = currentSurfaceTitle();
  const surfaceMeta = PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId];
  currentTool.model = {
    itemId: surfaceMeta && isOpenTool(surfaceMeta.toolId) ? `tool:${surfaceMeta.toolId}` : "",
    title,
    icon: currentSurfaceIcon(),
  };
  if (activeGroupId === "codeAssistant") renderNavigator();
  const showCodeAssistantSurface = surfaceMeta?.groupId === "codeAssistant";
  codeAssistantSurface.hidden = !showCodeAssistantSurface;
  standaloneSurface.hidden = showCodeAssistantSurface;
  if (showCodeAssistantSurface) {
    renderPrimaryContent();
  } else {
    renderStandaloneSurface();
  }
  renderHeaderActions();
}

function renderHeaderActions(): void {
  ([
    { actionId: "ignore", toolId: "ignoreSettings" },
    { actionId: "settings", toolId: "environmentSettings" },
  ] as const).forEach(({ actionId, toolId }) => {
    const button = required<HTMLButtonElement>(`[data-action='open-${actionId}']`);
    button.setAttribute("aria-pressed", String(activeSurfaceToolId === toolId));
  });
}

function currentSurfaceTitle(): string {
  return PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId]?.title ?? "KT Auto Code";
}

function currentSurfaceIcon(): string {
  return PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId]?.icon ?? "layout";
}

function renderNavigator(): void {
  navigator.model = {
    presentation: "compact",
    title: "功能目录",
    nodes: KTC_CODE_ASSISTANT_NAVIGATION,
    showLabels: navigatorShowLabels,
    activeToolId: isOpenTool(activeNavigatorToolId) ? activeNavigatorToolId : "",
  };
}

function activateTool(toolId: string): void {
  const meta = PREVIEW_TOOL_CATALOG_BY_ID[toolId];
  if (!meta) return;
  applyToolToSurface(toolId);
  addOpenItem(toolId);
  activeItemId = previewItem(toolId).id;
  touchMru(activeItemId);
  if (resolvePreviewToolRoute(meta).rightPanelId) activeEditorId = toolId;
  renderAll();
}

function renderPrimaryContent(): void {
  primaryContent.replaceChildren();
  primaryContent.append(createToolSummary(activeSurfaceToolId));
}

function createToolSummary(toolId: string): HTMLElement {
  const meta = PREVIEW_TOOL_CATALOG_BY_ID[toolId];
  if (meta?.toolId === "autoBuild") return createAutoBuildPrimary(meta);
  if (meta?.toolId === "codegen") return createCodegenPrimary(meta);
  if (meta?.toolId === "codeRename") return createSearchReplacePrimary(meta);
  if (meta && resolvePreviewToolRoute(meta).primaryKind === "companion") {
    return createEditorCompanionPrimary(meta, companionModel(toolId));
  }
  const summary = document.createElement("div");
  summary.className = "preview-tool-summary";
  const main = document.createElement("div");
  main.className = "preview-tool-summary-main";
  const heading = document.createElement("div");
  heading.className = "preview-tool-summary-heading";
  const title = document.createElement("strong");
  const detail = document.createElement("p");
  const action = document.createElement("button");
  action.type = "button";
  if (!meta) {
    title.textContent = "选择具体工具";
    detail.textContent = "Primary 工具在这里展开；Right View 工具在右侧打开并保留当前目录。";
    action.textContent = "等待选择";
    action.disabled = true;
  } else {
    title.textContent = meta.title;
    detail.textContent = `${meta.description}；原型未接入扫描或写盘。`;
    action.textContent = "Primary 操作占位";
    action.disabled = true;
  }
  if (!heading.children.length) heading.append(title);
  if (!main.children.length) main.append(heading, detail);
  if (!action.textContent && !action.disabled) action.remove();
  else main.append(action);
  summary.append(previewIcon(meta?.icon ?? "layout"), main);
  return summary;
}

function createEditorCompanionPrimary(
  meta: PreviewToolDescriptor,
  model: PreviewCompanionModel,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "preview-editor-companion-primary";
  section.setAttribute("aria-label", `${meta.title} Primary 摘要`);
  const status = document.createElement("p");
  status.className = "preview-editor-companion-status";
  status.dataset.tone = model.status.tone;
  status.textContent = model.status.label;
  const isProjectRename = meta.toolId === "projectRename";
  const remainingModel = isProjectRename
    ? {
      ...model,
      facts: model.facts.filter(({ id }) => id !== "root"),
      actions: model.actions.filter(({ actionId }) => actionId !== "chooseRoot"),
    }
    : model;
  if (isProjectRename) {
    section.append(renderProjectRenameDirectory(model));
    section.append(renderProjectRenameActions(remainingModel));
    section.append(renderProjectRenameOverview());
    section.append(renderProjectRenameProfiles());
    section.append(status);
  } else {
    section.append(status);
  }
  if (remainingModel.facts.length > 0) section.append(renderRightCompanionFacts(remainingModel));
  if (!isProjectRename) section.append(renderRightCompanionActions(meta.toolId, remainingModel));
  return section;
}

function renderProjectRenameDirectory(model: PreviewCompanionModel): HTMLElement {
  const fact = model.facts.find(({ id }) => id === "root");
  const action = model.actions.find(({ actionId }) => actionId === "chooseRoot");
  if (!fact || !action) throw new Error("项目改名 Primary 样例缺少分析目录或选择目录动作");
  const row = document.createElement("div");
  row.className = "preview-companion-directory";
  const value = document.createElement("span");
  value.textContent = projectRenameDirectoryLabel(fact.value);
  value.title = fact.value;
  value.setAttribute("aria-label", fact.value);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action.label;
  button.disabled = !action.enabled;
  button.addEventListener("click", () => dispatchCompanionAction("projectRename", action.actionId));
  row.append(value, button);
  return row;
}

function projectRenameDirectoryLabel(root: string): string {
  const normalized = root.replace(/[\\/]+$/u, "");
  const separator = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separator < 0) return normalized;
  const name = normalized.slice(separator + 1);
  const parent = normalized.slice(0, separator);
  return name && parent ? `${name} @ ${parent}` : normalized;
}

function renderProjectRenameProfiles(): HTMLElement {
  const profiles = PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameProfiles;
  const history = PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameHistory;
  const block = document.createElement("details");
  block.className = "preview-companion-profile";
  block.open = true;
  const summary = document.createElement("summary");
  const title = document.createElement("strong");
  title.textContent = "项目档案";
  const count = document.createElement("span");
  count.textContent = `${history.items.length + profiles.items.length} 个方案`;
  summary.append(title, count);
  const body = document.createElement("div");
  body.className = "preview-companion-profile-body";
  const profileLabel = document.createElement("label");
  profileLabel.append(document.createTextNode("选择方案"));
  const combo = document.createElement("pnw-combo") as PnwComboElement;
  combo.model = {
    ariaLabel: "选择改名方案",
    placeholder: "选择改名方案…",
    emptyText: "暂无可用方案",
    items: [
      ...history.items.map((item) => ({ ...item, removable: true })),
      ...profiles.items.map((item) => ({
        ...item,
        group: "共享档案",
        removable: false,
        removeDisabledReason: "共享档案不能在此删除",
      })),
    ],
    selectedId: profiles.selectedId || history.selectedId,
    disabled: false,
    clearEnabled: history.items.length > 0,
    clearLabel: "全部清空",
    clearDisabledReason: "当前没有可清空的本机方案",
  };
  combo.addEventListener(PNW_COMBO_ACTION, (event) => {
    const detail = (event as CustomEvent<PnwComboActionDetail>).detail;
    if (detail.kind === "select") recordPreviewOutput(`[项目改名] 已载入方案 ${detail.itemId}（模拟）`);
    else if (detail.kind === "remove") recordPreviewOutput(`[项目改名] 已删除方案 ${detail.itemId}（模拟）`);
    else recordPreviewOutput("[项目改名] 已请求清空本机方案确认（模拟）");
  });
  profileLabel.append(combo);
  const nameLabel = document.createElement("label");
  nameLabel.append(document.createTextNode("项目档案名称"));
  const saveRow = document.createElement("span");
  saveRow.className = "preview-companion-profile-save";
  const input = document.createElement("input");
  input.value = profiles.profileName;
  input.placeholder = "例如：Phoenix 产品改名";
  input.setAttribute("aria-label", "项目档案名称");
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "保存";
  save.addEventListener("click", () => recordPreviewOutput("[项目改名] 已保存项目档案（模拟）"));
  saveRow.append(input, save);
  nameLabel.append(saveRow);
  body.append(profileLabel, nameLabel);
  block.append(summary, body);
  return block;
}

function renderProjectRenameActions(model: PreviewCompanionModel): HTMLDivElement {
  const actions = renderRightCompanionActions("projectRename", model);
  const suggestion = PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameRootSuggestion;
  const rename = document.createElement("button");
  rename.type = "button";
  rename.textContent = "改根目录…";
  rename.title = `重命名根目录：${suggestion.source} → ${suggestion.target}`;
  rename.setAttribute("aria-label", "重命名根目录");
  rename.disabled = !suggestion.enabled;
  rename.addEventListener("click", () => recordPreviewOutput("[项目改名] 已请求重命名根目录确认（模拟）"));
  actions.append(rename);
  return actions;
}

function renderProjectRenameOverview(): HTMLElement {
  const block = document.createElement("details");
  block.className = "preview-companion-overview";
  block.open = true;
  const summary = document.createElement("summary");
  const title = document.createElement("strong");
  title.textContent = "总览";
  const note = document.createElement("span");
  note.textContent = "风险与范围";
  summary.append(title, note);
  const metrics = document.createElement("div");
  metrics.className = "preview-companion-overview-metrics";
  for (const item of PREVIEW_RIGHT_PRIMARY_SAMPLE.projectRenameOverview) {
    const metric = document.createElement("span");
    const value = document.createElement("strong");
    value.textContent = item.value;
    const label = document.createElement("small");
    label.textContent = item.label;
    metric.append(value, label);
    metrics.append(metric);
  }
  block.append(summary, metrics);
  return block;
}

function companionModel(toolId: string): PreviewCompanionModel {
  const model = RIGHT_COMPANION_MODELS[toolId];
  if (!model) throw new Error(`缺少 ${toolId} 的 Primary companion 样例`);
  return model;
}

function renderRightCompanionFacts(model: PreviewCompanionModel): HTMLDListElement {
  const facts = document.createElement("dl");
  facts.className = "preview-companion-facts";
  model.facts.forEach(({ label, value }) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    facts.append(term, description);
  });
  return facts;
}

function renderRightCompanionActions(toolId: string, model: PreviewCompanionModel): HTMLDivElement {
  const actions = document.createElement("div");
  actions.className = "preview-tool-summary-actions";
  model.actions.forEach(({ actionId, label, enabled }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (toolId === "projectRename") {
      const accessibleLabels: Readonly<Record<string, string>> = {
        reveal: "回到项目改名 View",
        cancel: "取消分析",
        openGitChanges: "打开 Git 对比",
      };
      const accessibleLabel = accessibleLabels[actionId];
      if (accessibleLabel) {
        button.title = accessibleLabel;
        button.setAttribute("aria-label", accessibleLabel);
      }
    }
    button.disabled = !enabled;
    button.addEventListener("click", () => dispatchCompanionAction(toolId, actionId));
    actions.append(button);
  });
  return actions;
}

function dispatchCompanionAction(toolId: string, actionId: string): void {
  if (actionId === "reveal" || actionId === "preview") {
    openEditor(toolId);
    recordPreviewOutput(`[${PREVIEW_TOOL_CATALOG_BY_ID[toolId]?.title ?? toolId}] ${actionId === "preview" ? "重新预览" : "回到 View"}（模拟）`);
  }
  else if (actionId === "openEnvironment") {
    recordPreviewOutput(`[${PREVIEW_TOOL_CATALOG_BY_ID[toolId]?.title ?? toolId}] 已打开工程环境（模拟）`);
    activateTool("environmentSettings");
  } else if (actionId === "openGitChanges") {
    recordPreviewOutput("[项目改名] 已打开 Git 对比（模拟）");
  } else if (actionId === "chooseRoot") {
    recordPreviewOutput("[项目改名] 已打开分析目录选择（模拟）");
  }
}

function createCodegenPrimary(meta: PreviewToolDescriptor): HTMLElement {
  const section = document.createElement("section");
  section.className = "preview-codegen-primary";
  section.setAttribute("aria-label", `${meta.title} Primary 控制`);
  const panel = document.createElement("kt-codegen-primary-panel") as KtCodegenPrimaryPanel;
  panel.model = PREVIEW_RIGHT_PRIMARY_SAMPLE.codegen;
  requestAnimationFrame(() => applyPreviewCodegenActionLabels(panel));
  panel.addEventListener("kt-codegen-primary-action", (event) => {
    const detail = (event as CustomEvent<KtCodegenPrimaryActionDetail>).detail;
    if (detail.action === "openDocument" || detail.action === "openCandidate") openEditor(meta.toolId);
    recordPreviewOutput(`[${meta.title}] ${detail.action}（模拟）`);
  });
  section.append(panel);
  return section;
}

function applyPreviewCodegenActionLabels(panel: KtCodegenPrimaryPanel): void {
  const labels = new Map([
    ["打开一份 Codegen JSON", "打开"],
    ["导入或打开 CSV Codegen 配置", "导入"],
    ["全部应用", "应用"],
    ["刷新配置", "刷新"],
    ["取消刷新", "取消"],
    ["扫描控制符源码候选", "扫描"],
    ["取消扫描", "取消"],
  ]);
  for (const button of Array.from(panel.shadowRoot?.querySelectorAll<HTMLButtonElement>(".pnw-codegen-actions button") ?? [])) {
    const label = labels.get(button.title);
    if (!label) continue;
    button.textContent = label;
    button.setAttribute("aria-label", button.title);
    button.style.width = "auto";
    button.style.minWidth = "44px";
    button.style.paddingInline = "8px";
    button.style.fontSize = "12px";
  }
}

function createSearchReplacePrimary(meta: PreviewToolDescriptor): HTMLElement {
  const section = document.createElement("section");
  section.className = "preview-search-replace-primary";
  section.setAttribute("aria-label", `${meta.title} Primary 控制`);

  const query = document.createElement("section");
  query.className = "preview-search-replace-query";
  const queryToggle = document.createElement("button");
  queryToggle.type = "button";
  queryToggle.className = "preview-search-replace-query-toggle";
  queryToggle.textContent = "⌄";
  queryToggle.title = "收起替换行";
  queryToggle.setAttribute("aria-label", "收起替换行");
  queryToggle.setAttribute("aria-expanded", "true");

  const search = document.createElement("input");
  search.value = "PhoenixOpenIssue";
  search.placeholder = "搜索";
  search.setAttribute("aria-label", "搜索内容");
  const replacement = document.createElement("input");
  replacement.value = "PhoenixIssue";
  replacement.placeholder = "替换";
  replacement.setAttribute("aria-label", "替换内容");

  const searchAction = document.createElement("button");
  searchAction.type = "button";
  searchAction.textContent = "搜索";
  searchAction.setAttribute("aria-label", "搜索当前目录");
  const replaceAction = document.createElement("button");
  replaceAction.type = "button";
  replaceAction.className = "is-primary";
  replaceAction.textContent = "替换";
  replaceAction.setAttribute("aria-label", "执行搜索替换");
  const searchRow = document.createElement("div");
  searchRow.className = "preview-search-replace-query-row";
  searchRow.append(search, searchAction);
  const replaceRow = document.createElement("div");
  replaceRow.className = "preview-search-replace-query-row preview-search-replace-only";
  replaceRow.append(replacement, replaceAction);
  query.append(queryToggle, searchRow, replaceRow);

  const details = document.createElement("div");
  details.className = "preview-search-replace-details";

  const helpers = document.createElement("div");
  helpers.className = "preview-search-replace-helpers";
  const historyControl = document.createElement("div");
  historyControl.className = "preview-search-replace-history";
  const historyEntries = [
    ["PhoenixOpenIssue", "PhoenixIssue"],
    ["PNXBomAnalysis", "PNXAnalysis"],
  ] as const;
  const history = document.createElement("pnw-combo") as PnwComboElement;
  history.model = {
    ariaLabel: "最近改名记录",
    placeholder: "最近改名…",
    emptyText: "暂无最近记录",
    items: historyEntries.map(([source, target], index) => ({
      id: String(index),
      label: `${source} → ${target}`,
      removable: true,
    })),
    disabled: false,
    clearEnabled: historyEntries.length > 0,
    clearLabel: "全部清空",
  };
  history.addEventListener(PNW_COMBO_ACTION, (event) => {
    const detail = (event as CustomEvent<PnwComboActionDetail>).detail;
    const index = Number(detail.kind === "clear" ? Number.NaN : detail.itemId);
    const entry = Number.isSafeInteger(index) ? historyEntries[index] : undefined;
    if (detail.kind === "select" && entry) {
      search.value = entry[0];
      replacement.value = entry[1];
      history.model = { ...history.model, selectedId: detail.itemId };
      recordPreviewOutput(`[搜索替换] 已载入最近改名 ${detail.itemId}（模拟）`);
    } else if (detail.kind === "remove") {
      recordPreviewOutput(`[搜索替换] 已删除最近改名 ${detail.itemId}（模拟）`);
    } else if (detail.kind === "clear") {
      recordPreviewOutput("[搜索替换] 已请求清空最近改名确认（模拟）");
    }
  });
  historyControl.append(history);

  const variantsToggle = document.createElement("button");
  variantsToggle.type = "button";
  variantsToggle.textContent = "常用变形";
  variantsToggle.setAttribute("aria-expanded", "false");
  const projectRename = document.createElement("button");
  projectRename.type = "button";
  projectRename.className = "preview-search-replace-project";
  projectRename.textContent = "项目改名";
  projectRename.title = "把当前目录、名称和启用的常用变形带入项目改名 View";
  projectRename.addEventListener("click", () => activateTool("projectRename"));
  helpers.append(historyControl, variantsToggle, projectRename);

  const variants = document.createElement("section");
  variants.className = "preview-search-replace-variants";
  variants.hidden = true;
  const variantsHeader = document.createElement("div");
  variantsHeader.textContent = "勾选并编辑本次使用的显式规则；从上到下显示优先级";
  const variantList = document.createElement("div");
  variantList.className = "preview-search-replace-variant-list";
  const variantRows = [
    ["Display", "Phoenix Open Issue", "Phoenix Issue"],
    ["kebab", "phoenix-open-issue", "phoenix-issue"],
    ["Pascal", "PhoenixOpenIssue", "PhoenixIssue"],
  ] as const;
  variantList.append(...variantRows.map(([label, source, target], index) => {
    const row = document.createElement("div");
    row.className = "preview-search-replace-variant-row";
    row.title = `${label} 变形`;
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = true;
    enabled.setAttribute("aria-label", `启用${label}变形`);
    const sourceInput = document.createElement("input");
    sourceInput.value = source;
    sourceInput.setAttribute("aria-label", `${label}源名称`);
    const targetInput = document.createElement("input");
    targetInput.value = target;
    targetInput.setAttribute("aria-label", `${label}目标名称`);
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = "上移";
    up.disabled = index === 0;
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = "下移";
    down.disabled = index === variantRows.length - 1;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "删除";
    remove.addEventListener("click", () => row.remove());
    row.append(enabled, sourceInput, targetInput, up, down, remove);
    return row;
  }));
  variants.append(variantsHeader, variantList);

  const targets = document.createElement("div");
  targets.className = "preview-search-replace-targets";
  for (const [label, checked] of [["文本", true], ["文件名", false], ["文件夹名", false]] as const) {
    const item = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    item.append(input, document.createTextNode(label));
    targets.append(item);
  }
  const encodingLabel = document.createElement("label");
  encodingLabel.title = "仅原文件为 ASCII 且目标含非 ASCII 字符时使用";
  encodingLabel.append(document.createTextNode("默认编码"));
  const encoding = document.createElement("select");
  encoding.setAttribute("aria-label", "ASCII 文件目标默认编码");
  for (const [value, label] of [["utf8", "UTF-8"], ["gbk", "GBK（本地）"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    encoding.append(option);
  }
  encodingLabel.append(encoding);
  targets.append(encodingLabel);

  const ignore = document.createElement("section");
  ignore.className = "preview-search-replace-ignore";
  const ignoreHeader = document.createElement("div");
  const ignoreTitle = document.createElement("strong");
  ignoreTitle.textContent = "忽略";
  const ignoreState = document.createElement("span");
  ignoreState.textContent = "已启用";
  const toggleIgnore = document.createElement("button");
  toggleIgnore.type = "button";
  toggleIgnore.textContent = "停用";
  const modifyIgnore = document.createElement("button");
  modifyIgnore.type = "button";
  modifyIgnore.textContent = "修改";
  modifyIgnore.addEventListener("click", () => activateTool("ignoreSettings"));
  ignoreHeader.append(ignoreTitle, ignoreState, toggleIgnore, modifyIgnore);
  const ignoreSources = document.createElement("div");
  ignoreSources.className = "preview-search-replace-ignore-sources";
  for (const [label, checked] of [["插件", true], ["Git", true], ["自定义", false]] as const) {
    const item = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    item.append(input, document.createTextNode(label));
    ignoreSources.append(item);
  }
  toggleIgnore.addEventListener("click", () => {
    const enabled = toggleIgnore.textContent === "停用";
    toggleIgnore.textContent = enabled ? "启用" : "停用";
    ignoreState.textContent = enabled ? "已停用" : "已启用";
    ignoreSources.querySelectorAll<HTMLInputElement>("input").forEach((input) => { input.disabled = enabled; });
  });
  const ignoreHint = document.createElement("p");
  ignoreHint.textContent = "停用后仍保留不可关闭的安全排除；规则正文统一在 Ignore 管理中修改。";
  ignore.append(ignoreHeader, ignoreSources, ignoreHint);

  const results = document.createElement("ktc-rename-results-panel") as KtcRenameResultsPanel;
  results.model = {
    rows: [],
    emptyMessage: "填写规则后点击“搜索”。",
    capabilities: { open: true },
  };
  const renderResults = (applied: boolean): void => {
    results.model = {
      applied,
      title: applied ? "已替换" : "搜索结果",
      summary: "7 处替换 · 0 错误",
      capabilities: { open: true },
      rows: [
        {
          id: "text:src/config/project.ts", level: "text", levelLabel: "文本",
          relativePath: "src/config/project.ts", sourceName: "project.ts", sourceAddress: "src/config",
          targetOrPositionLabel: "L12, L48", originalPath: "/workspace/src/config/project.ts",
          plannedPath: "/workspace/src/config/project.ts", openPath: "/workspace/src/config/project.ts",
          openLine: 12, occurrences: 4, encodingLabel: "UTF-8", status: applied ? "applied" : "preview",
          statusLabel: applied ? "已替换" : "预览", statusTone: applied ? "success" : "neutral",
          sourceHighlightTerms: [search.value], editorHighlightTerms: [applied ? replacement.value : search.value],
        },
        {
          id: "file:PhoenixOpenIssue.ts", level: "file", levelLabel: "文件",
          relativePath: "src/PhoenixOpenIssue.ts", sourceName: "PhoenixOpenIssue.ts", sourceAddress: "src",
          targetOrPositionLabel: "PhoenixIssue.ts", originalPath: "/workspace/src/PhoenixOpenIssue.ts",
          plannedPath: "/workspace/src/PhoenixIssue.ts", openPath: applied ? "/workspace/src/PhoenixIssue.ts" : "/workspace/src/PhoenixOpenIssue.ts",
          occurrences: 1, encodingLabel: "", status: applied ? "applied" : "preview",
          statusLabel: applied ? "已替换" : "预览", statusTone: applied ? "success" : "neutral",
          sourceHighlightTerms: [search.value], editorHighlightTerms: [applied ? replacement.value : search.value],
        },
      ],
    };
  };
  searchAction.addEventListener("click", () => {
    renderResults(false);
    recordPreviewOutput(`[${meta.title}] 搜索（模拟）`);
  });
  replaceAction.addEventListener("click", () => {
    renderResults(true);
    recordPreviewOutput(`[${meta.title}] 替换（模拟）`);
  });
  results.addEventListener(KTC_RENAME_RESULTS_ACTION, () => {
    recordPreviewOutput(`[${meta.title}] 打开结果（模拟）`);
  });
  queryToggle.addEventListener("click", () => {
    const expanded = queryToggle.getAttribute("aria-expanded") === "true";
    queryToggle.setAttribute("aria-expanded", String(!expanded));
    queryToggle.textContent = expanded ? "›" : "⌄";
    queryToggle.title = expanded ? "展开替换行" : "收起替换行";
    queryToggle.setAttribute("aria-label", queryToggle.title);
    replaceRow.hidden = expanded;
    details.hidden = expanded;
  });
  variantsToggle.addEventListener("click", () => {
    variants.hidden = !variants.hidden;
    variantsToggle.setAttribute("aria-expanded", String(!variants.hidden));
  });
  details.append(helpers, variants, targets, ignore);
  section.append(query, details, results);
  return section;
}

function renderAutoBuildSampleRows(): void {
  const configuration = PREVIEW_AUTO_BUILD_SAMPLE.configuration;
  document.querySelectorAll<HTMLElement>("[data-auto-build-config-draft]").forEach((element) => {
    element.textContent = configuration.draftLabel;
  });
  document.querySelectorAll<HTMLInputElement>("[data-auto-build-config-field]").forEach((input) => {
    const key = input.dataset.autoBuildConfigField as keyof typeof configuration | undefined;
    if (!key) return;
    const value = configuration[key];
    if (typeof value === "string") input.value = value;
  });

  const repositoryRows = document.querySelector<HTMLTableSectionElement>("[data-auto-build-project-rows]");
  if (repositoryRows) {
    repositoryRows.replaceChildren(...PREVIEW_AUTO_BUILD_SAMPLE.repositories.map((repository) => {
      const row = document.createElement("tr");

      const enabledCell = document.createElement("td");
      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = repository.enabled;
      enabled.disabled = repository.kind === "项目";
      enabled.title = repository.kind === "项目" ? "项目行仍由完整样例快照驱动" : `启用或停用 ${repository.kind} 的仓库操作`;
      enabled.setAttribute("aria-label", `启用 ${repository.name}`);
      if (repository.kind !== "项目") {
        const target = repository.kind === "Root" ? "root" : "thirdParty";
        enabled.dataset.autoBuildRepositoryEnabled = target;
        enabled.addEventListener("change", () => {
          commitAutoBuildTransition(reducePreviewAutoBuildState(autoBuildState, {
            type: "setRepositoryEnabled",
            target,
            enabled: enabled.checked,
          }));
        });
      }
      enabledCell.append(enabled);

      const kindCell = document.createElement("td");
      const kind = document.createElement("strong");
      kind.textContent = repository.kind;
      kindCell.append(kind);

      const branchCell = document.createElement("td");
      const branch = document.createElement("input");
      branch.value = repository.branch;
      branch.readOnly = true;
      branch.setAttribute("aria-label", `${repository.name} 分支`);
      branchCell.append(branch);

      const repositoryCell = document.createElement("td");
      const repositoryName = document.createElement("span");
      repositoryName.textContent = repository.kind === "项目" ? repository.name : repository.path;
      repositoryName.title = repository.path;
      repositoryCell.append(repositoryName);

      const commitCell = document.createElement("td");
      commitCell.dataset.autoBuildProbeColumn = "";
      const commit = document.createElement("code");
      commit.textContent = repository.commit;
      commitCell.append(commit);

      const originCell = document.createElement("td");
      originCell.dataset.autoBuildProbeColumn = "";
      const origin = document.createElement("span");
      origin.textContent = repository.origin;
      origin.title = repository.originTitle;
      originCell.append(origin);

      const statusCell = document.createElement("td");
      statusCell.dataset.autoBuildProbeColumn = "";
      statusCell.textContent = repository.status;

      const buildCell = document.createElement("td");
      const operations = document.createElement("span");
      operations.className = "preview-build-options";
      repository.operations.forEach((operation) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = operation.enabled;
        if (operation.id === "update" && repository.kind === "Root") {
          checkbox.dataset.autoBuildUpdateRoot = "";
        } else if (operation.id === "update" && repository.kind === "3rdParty") {
          checkbox.dataset.autoBuildUpdateThirdParty = "";
        } else {
          checkbox.disabled = true;
          checkbox.title = "完整样例快照由 JSON 驱动";
        }
        label.append(checkbox, document.createTextNode(operation.label));
        operations.append(label);
      });
      buildCell.append(operations);

      const actionCell = document.createElement("td");
      const probe = createAutoBuildProjectAction("probe", repository.name);
      actionCell.append(probe);
      if (repository.runnable) {
        const run = createAutoBuildProjectAction("run", repository.name);
        actionCell.append(run);
      }

      row.append(enabledCell, kindCell, branchCell, repositoryCell, commitCell, originCell, statusCell, buildCell, actionCell);
      return row;
    }));
  }

  const taskList = document.querySelector<HTMLElement>("[data-auto-build-task-list]");
  if (taskList) {
    taskList.replaceChildren(...PREVIEW_AUTO_BUILD_SAMPLE.tasks.map((task, index) => {
      const row = document.createElement("div");
      const sequence = document.createElement("span");
      sequence.textContent = String(index + 1);
      const name = document.createElement("strong");
      name.textContent = task.name;
      const detail = document.createElement("small");
      detail.textContent = task.detail;
      const status = document.createElement("em");
      status.dataset.autoBuildTaskStatus = "";
      status.dataset.tone = task.tone;
      status.textContent = task.status;
      row.append(sequence, name, detail, status);
      return row;
    }));
  }
}

function createAutoBuildProjectAction(
  action: "probe" | "run",
  repositoryName: string,
): HTMLButtonElement {
  const label = action === "probe" ? "探测" : "运行";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `preview-project-action-button${action === "run" ? " is-run" : ""}`;
  button.title = label;
  button.setAttribute("aria-label", `${label} ${repositoryName}`);
  button.dataset.previewOutput = "handled";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  if (action === "probe") {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "7");
    circle.setAttribute("cy", "7");
    circle.setAttribute("r", "4");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m10 10 3 3");
    svg.append(circle, path);
  } else {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 3.5 12 8l-7 4.5z");
    svg.append(path);
  }
  button.append(svg);
  button.addEventListener("click", () => {
    recordPreviewOutput(`[编译工具] ${label} ${repositoryName}（模拟）`);
  });
  return button;
}

function createAutoBuildPrimary(meta: PreviewToolDescriptor): HTMLElement {
  const viewState = derivePreviewAutoBuildState(autoBuildState);
  const section = document.createElement("section");
  section.className = "preview-auto-build-primary";
  section.setAttribute("aria-label", "编译工具 Primary 控制");

  const heading = document.createElement("div");
  heading.className = "preview-primary-section-heading";
  const title = document.createElement("strong");
  title.textContent = "执行";
  const status = document.createElement("span");
  status.className = "preview-surface-badge";
  status.dataset.tone = autoBuildState.tone;
  status.textContent = autoBuildState.status;
  heading.append(title, status);

  const metrics = document.createElement("div");
  metrics.className = "preview-primary-metrics";
  ([
    ["启用项目", viewState.enabledProjectMetric],
    ["任务", viewState.taskProgress],
    ["失败", viewState.failedTaskMetric],
  ] as const).forEach(([label, value]) => {
    const metric = document.createElement("span");
    const metricValue = document.createElement("strong");
    metricValue.textContent = value;
    const metricLabel = document.createElement("small");
    metricLabel.textContent = label;
    metric.append(metricValue, metricLabel);
    metrics.append(metric);
  });

  const actions = document.createElement("div");
  actions.className = "preview-primary-actions preview-auto-build-actions preview-auto-build-execution-actions";
  viewState.executionActions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.disabled = action.disabled;
    if (action.primary) button.className = "is-primary";
    if (action.actionId === "start") button.title = "原型只更新共享快照；不启动真实进程";
    button.dataset.previewOutput = "handled";
    button.addEventListener("click", () => dispatchAutoBuildIntent(action.actionId));
    actions.append(button);
  });

  const executionOptions = document.createElement("div");
  executionOptions.className = "preview-auto-build-execution-options";
  const parallel = document.createElement("label");
  const parallelInput = document.createElement("input");
  parallelInput.type = "checkbox";
  parallelInput.checked = autoBuildState.parallelBuild;
  parallelInput.disabled = viewState.parallelDisabled;
  parallelInput.addEventListener("change", () => dispatchAutoBuildIntent("setParallel", parallelInput.checked));
  parallel.append(parallelInput, document.createTextNode("并行编译"));
  executionOptions.append(parallel);

  const statusLine = document.createElement("div");
  statusLine.className = "preview-auto-build-status-line";
  const statusText = document.createElement("span");
  statusText.textContent = autoBuildState.status;
  const output = document.createElement("button");
  output.type = "button";
  output.textContent = "Output";
  output.dataset.previewOutput = "handled";
  output.addEventListener("click", () => dispatchAutoBuildIntent("openOutput"));
  statusLine.append(statusText, output);

  const configBar = document.createElement("section");
  configBar.className = "preview-primary-config-bar";
  configBar.setAttribute("aria-label", "当前配置");
  const configLabel = document.createElement("strong");
  configLabel.textContent = "当前配置";
  const configName = document.createElement("span");
  configName.textContent = autoBuildState.currentConfigName;
  const openConfig = document.createElement("button");
  openConfig.type = "button";
  openConfig.textContent = "打开";
  openConfig.dataset.previewOutput = "handled";
  openConfig.addEventListener("click", () => dispatchAutoBuildIntent("openConfig"));
  const saveConfig = document.createElement("button");
  saveConfig.type = "button";
  saveConfig.textContent = "保存";
  saveConfig.dataset.previewOutput = "handled";
  saveConfig.addEventListener("click", () => dispatchAutoBuildIntent("saveConfig"));
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.textContent = "详细配置";
  reveal.dataset.previewOutput = "handled";
  reveal.addEventListener("click", () => {
    recordPreviewOutput("[编译工具] 已定位 Right View 详细配置");
    openEditor(meta.toolId);
  });
  configBar.append(configLabel, configName, openConfig, saveConfig, reveal);

  const recentConfig = document.createElement("div");
  recentConfig.className = "preview-primary-recent-config";
  const recentSelect = document.createElement("select");
  recentSelect.setAttribute("aria-label", "最近配置");
  recentSelect.disabled = viewState.recentConfigDisabled;
  recentSelect.append(new Option("最近配置…", ""));
  PREVIEW_AUTO_BUILD_SAMPLE.configuration.recentConfigs.forEach((name) => recentSelect.append(new Option(name, name)));
  recentSelect.addEventListener("change", () => {
    if (!recentSelect.value) return;
    dispatchAutoBuildIntent("selectRecent", recentSelect.value);
  });
  recentConfig.append(recentSelect);

  const environment = document.createElement("details");
  environment.className = "preview-primary-fold preview-primary-environment";
  environment.open = autoBuildState.environmentExpanded;
  const environmentSummary = document.createElement("summary");
  environmentSummary.append(document.createTextNode("工程环境"));
  const environmentHint = document.createElement("span");
  environmentHint.textContent = PREVIEW_AUTO_BUILD_SAMPLE.environment.hint;
  environmentSummary.append(environmentHint);
  const facts = document.createElement("dl");
  facts.className = "preview-companion-facts preview-auto-build-facts";
  [
    ["工作目录", PREVIEW_AUTO_BUILD_SAMPLE.configuration.workingDirectory],
    ["执行模式", viewState.environmentExecutionMode],
    ["平台", PREVIEW_AUTO_BUILD_SAMPLE.environment.platform],
  ].forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    facts.append(term, description);
  });
  environment.append(environmentSummary, facts);
  environment.addEventListener("toggle", () => {
    if (environment.open === autoBuildState.environmentExpanded) return;
    autoBuildState = reducePreviewAutoBuildState(autoBuildState, {
      type: "setEnvironmentExpanded",
      expanded: environment.open,
    }).state;
  });

  const maintenance = document.createElement("details");
  maintenance.className = "preview-primary-fold preview-primary-maintenance";
  maintenance.open = autoBuildState.maintenanceExpanded;
  const maintenanceSummary = document.createElement("summary");
  maintenanceSummary.append(document.createTextNode("维护"));
  const maintenanceHint = document.createElement("span");
  maintenanceHint.textContent = "低频";
  maintenanceSummary.append(maintenanceHint);
  const maintenanceBody = document.createElement("div");
  maintenanceBody.className = "preview-primary-maintenance-body";
  const scriptRow = document.createElement("div");
  scriptRow.className = "preview-primary-maintenance-row";
  const scriptCopy = document.createElement("span");
  scriptCopy.append(
    strongText("脚本"),
    smallText(`ROOT/tools 与 ROOT/sample 同步 · ${autoBuildState.rootScriptStatus}`),
  );
  const sync = document.createElement("button");
  sync.type = "button";
  sync.textContent = "同步";
  sync.disabled = viewState.maintenanceActionsDisabled;
  sync.dataset.previewOutput = "handled";
  sync.addEventListener("click", () => dispatchAutoBuildIntent("syncScript"));
  scriptRow.append(scriptCopy, sync);
  maintenanceBody.append(scriptRow);
  maintenance.append(maintenanceSummary, maintenanceBody);
  maintenance.addEventListener("toggle", () => {
    if (maintenance.open === autoBuildState.maintenanceExpanded) return;
    autoBuildState = reducePreviewAutoBuildState(autoBuildState, {
      type: "setMaintenanceExpanded",
      expanded: maintenance.open,
    }).state;
  });

  const configRegion = document.createElement("div");
  configRegion.className = "preview-primary-config-region";
  configRegion.append(configBar, recentConfig);
  section.append(configRegion, heading, actions, executionOptions, statusLine, metrics, maintenance, environment);
  return section;
}

function strongText(value: string): HTMLElement {
  const element = document.createElement("strong");
  element.textContent = value;
  return element;
}

function smallText(value: string): HTMLElement {
  const element = document.createElement("small");
  element.textContent = value;
  return element;
}

type PreviewAutoBuildAction = Exclude<
  PreviewAutoBuildIntent["type"],
  "setCleanupPatternsYaml"
    | "setEnvironmentExpanded"
    | "setMaintenanceExpanded"
    | "setRepositoryEnabled"
    | "setRepositoryUpdate"
> | "openOutput" | "openConfig";

function dispatchAutoBuildIntent(actionId: PreviewAutoBuildAction, value?: string | boolean): void {
  if (actionId === "openOutput") {
    setOutputVisibility(true);
    recordPreviewOutput("[编译工具] 已展开框架级输出");
    return;
  }
  if (actionId === "openConfig") {
    recordPreviewOutput("[编译工具] 打开 Auto Build JSON（模拟）");
    return;
  }
  if (actionId === "openCleanup") {
    commitAutoBuildTransition(reducePreviewAutoBuildState(autoBuildState, { type: "openCleanup" }));
    openAutoBuildCleanupDialog();
    return;
  }

  let transition: PreviewAutoBuildTransition;
  if (actionId === "setParallel") {
    if (typeof value !== "boolean") return;
    transition = reducePreviewAutoBuildState(autoBuildState, { type: "setParallel", enabled: value });
  } else if (actionId === "setProbeColumnsVisible") {
    if (typeof value !== "boolean") return;
    transition = reducePreviewAutoBuildState(autoBuildState, { type: "setProbeColumnsVisible", visible: value });
  } else if (actionId === "selectRecent") {
    if (typeof value !== "string") return;
    transition = reducePreviewAutoBuildState(autoBuildState, { type: "selectRecent", name: value });
  } else {
    transition = reducePreviewAutoBuildState(autoBuildState, { type: actionId });
  }

  commitAutoBuildTransition(transition);
}

function openAutoBuildCleanupDialog(): void {
  document.querySelector(".preview-cleanup-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "preview-cleanup-dialog";
  dialog.setAttribute("aria-label", "清理");
  const shell = document.createElement("section");
  shell.className = "preview-cleanup-dialog-shell";
  const header = document.createElement("header");
  const heading = document.createElement("strong");
  heading.textContent = "清理";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "关闭清理对话框");
  close.addEventListener("click", () => dialog.close());
  header.append(heading, close);

  const content = document.createElement("div");
  content.className = "preview-cleanup-dialog-content";
  const intro = document.createElement("p");
  intro.textContent = "选择方式和目标；预览只冻结本次清单，确认后才执行。";
  const modeField = document.createElement("label");
  modeField.className = "preview-cleanup-field";
  modeField.append(strongText("清理方式"));
  const mode = document.createElement("select");
  mode.setAttribute("aria-label", "清理方式");
  mode.append(
    new Option("规则产物", "rules"),
    new Option("Git 强制恢复 · 高风险", "git-force"),
    new Option("CMake 产物", "cmake"),
  );
  modeField.append(mode);
  const targetsField = document.createElement("section");
  targetsField.className = "preview-cleanup-field";
  const targetsHeading = strongText("清理目标");
  const targets = document.createElement("div");
  targets.className = "preview-cleanup-targets";
  targetsField.append(targetsHeading, targets);
  const rulesField = document.createElement("label");
  rulesField.className = "preview-cleanup-field";
  rulesField.append(strongText("清理规则"));
  const rules = document.createElement("textarea");
  rules.maxLength = 4_096;
  rules.spellcheck = false;
  rules.value = autoBuildState.cleanupPatternsYaml;
  rules.setAttribute("aria-label", "清理 YAML 规则");
  rulesField.append(rules);
  const previewField = document.createElement("section");
  previewField.className = "preview-cleanup-field";
  const previewHeading = strongText("预览结果");
  const previewResult = document.createElement("div");
  previewResult.className = "preview-cleanup-result";
  previewResult.textContent = "先选择清理方式和目标，再预览实际改动。";
  previewField.append(previewHeading, previewResult);
  const confirmation = document.createElement("label");
  confirmation.className = "preview-cleanup-confirm";
  confirmation.hidden = true;
  const confirmationInput = document.createElement("input");
  confirmationInput.type = "checkbox";
  const confirmationText = document.createElement("span");
  confirmationText.textContent = "我已核对预览，确认放弃未提交改动和未跟踪文件。";
  confirmation.append(confirmationInput, confirmationText);
  content.append(intro, modeField, targetsField, rulesField, previewField, confirmation);

  const footer = document.createElement("footer");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  cancel.addEventListener("click", () => dialog.close());
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "预览";
  const execute = document.createElement("button");
  execute.type = "button";
  execute.className = "is-primary";
  execute.textContent = "清理";
  execute.disabled = true;
  footer.append(cancel, preview, execute);
  shell.append(header, content, footer);
  dialog.append(shell);
  document.body.append(dialog);

  const invalidatePreview = (): void => {
    previewResult.replaceChildren(document.createTextNode("选择已变化，请重新预览。"));
    confirmationInput.checked = false;
    execute.disabled = true;
  };
  const renderTargets = (): void => {
    targets.replaceChildren();
    const candidates = mode.value === "rules"
      ? [
        ["ROOT_DIR", PREVIEW_AUTO_BUILD_SAMPLE.configuration.rootDirectory],
        ["工作目录", PREVIEW_AUTO_BUILD_SAMPLE.configuration.workingDirectory],
      ]
      : mode.value === "git-force"
        ? PREVIEW_AUTO_BUILD_SAMPLE.repositories.map(({ name, path }) => [name, path])
        : PREVIEW_AUTO_BUILD_SAMPLE.repositories
          .filter(({ operations }) => operations.some(({ id, enabled }) => id === "cmake" && enabled))
          .map(({ name, path }) => [name, `${path}/build`]);
    candidates.forEach(([label, targetPath], index) => {
      const target = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = index === 0;
      checkbox.dataset.cleanupPath = targetPath;
      checkbox.addEventListener("change", invalidatePreview);
      const copy = document.createElement("span");
      copy.append(strongText(label), smallText(targetPath));
      target.append(checkbox, copy);
      targets.append(target);
    });
    rulesField.hidden = mode.value !== "rules";
    confirmation.hidden = mode.value !== "git-force";
    execute.textContent = mode.value === "git-force" ? "强制清理" : "清理";
    invalidatePreview();
  };
  mode.addEventListener("change", renderTargets);
  rules.addEventListener("input", () => {
    autoBuildState = reducePreviewAutoBuildState(autoBuildState, {
      type: "setCleanupPatternsYaml",
      value: rules.value,
    }).state;
    invalidatePreview();
  });
  confirmationInput.addEventListener("change", () => {
    execute.disabled = !confirmationInput.checked;
  });
  preview.addEventListener("click", () => {
    const selected = Array.from(targets.querySelectorAll<HTMLInputElement>("input:checked"))
      .map((input) => input.dataset.cleanupPath ?? "")
      .filter(Boolean);
    previewResult.replaceChildren();
    if (!selected.length) {
      previewResult.textContent = "至少选择一个清理目标。";
      return;
    }
    const summary = document.createElement("strong");
    const list = document.createElement("ol");
    const entries = mode.value === "rules"
      ? selected.flatMap((targetPath) => [`${targetPath}/objects`, `${targetPath}/build`, `${targetPath}/module.obj`])
      : mode.value === "git-force"
        ? selected.map((targetPath) => `${targetPath} · reset --hard HEAD + clean -ffdx`)
        : selected;
    summary.textContent = `${entries.length} 个待处理项`;
    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry;
      list.append(item);
    });
    previewResult.append(summary, list);
    confirmationInput.checked = false;
    execute.disabled = mode.value === "git-force";
    recordPreviewOutput(`[编译工具] 清理预览：${entries.length} 项（模拟）`);
  });
  execute.addEventListener("click", () => {
    if (mode.value === "rules") {
      commitAutoBuildTransition(reducePreviewAutoBuildState(autoBuildState, { type: "cleanRoot" }));
    } else if (mode.value === "git-force") {
      commitAutoBuildTransition(reducePreviewAutoBuildState(autoBuildState, { type: "cleanRepositories" }));
    } else {
      recordPreviewOutput("[编译工具] 已模拟清理 CMake 产物；未删除真实文件");
    }
    previewResult.textContent = "模拟清理完成；正式端会逐项输出结果。";
    execute.disabled = true;
  });
  renderTargets();
  previewResult.textContent = "先选择清理方式和目标，再预览实际改动。";
  dialog.showModal();
}

function openAutoBuildManifestImportDialog(): void {
  document.querySelector(".preview-manifest-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "preview-cleanup-dialog preview-manifest-dialog";
  dialog.setAttribute("aria-label", "导入仓库清单");
  const shell = document.createElement("section");
  shell.className = "preview-cleanup-dialog-shell";
  const header = document.createElement("header");
  const heading = document.createElement("strong");
  heading.textContent = "导入仓库";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "关闭导入仓库清单对话框");
  close.addEventListener("click", () => dialog.close());
  header.append(heading, close);

  const content = document.createElement("div");
  content.className = "preview-cleanup-dialog-content";
  const intro = document.createElement("p");
  intro.textContent = "选择一个 JSON；只合并仓库来源和构建类型。";
  const sourceField = document.createElement("section");
  sourceField.className = "preview-cleanup-field";
  sourceField.append(strongText("来源 JSON"));
  const sourceRow = document.createElement("div");
  sourceRow.className = "preview-manifest-source";
  const sourceName = document.createElement("span");
  sourceName.textContent = "BUILD_MANIFEST.json";
  const choose = document.createElement("button");
  choose.type = "button";
  choose.textContent = "选择…";
  choose.title = "支持 BUILD_MANIFEST.json 与含可验证 Git Origin 的 AutoBuild 配置";
  sourceRow.append(sourceName, choose);
  const sourceNote = smallText("支持 BUILD_MANIFEST.json 或含 Git Origin 的 AutoBuild 配置。");
  sourceField.append(sourceRow, sourceNote);
  const summary = document.createElement("div");
  summary.className = "preview-manifest-result";
  summary.append(
    strongText("已识别 3 个仓库"),
    smallText("新增 2 · 更新 1；另有 1 条缺少 Git 地址，将忽略。"),
  );
  content.append(intro, sourceField, summary);

  const footer = document.createElement("footer");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取消";
  cancel.addEventListener("click", () => dialog.close());
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "is-primary";
  confirm.textContent = "导入";
  confirm.addEventListener("click", () => {
    recordPreviewOutput("[编译工具] 已模拟导入仓库清单：新增 2、更新 1、忽略 1；尚未检出或更新");
    dialog.close();
  });
  footer.append(cancel, confirm);
  shell.append(header, content, footer);
  dialog.append(shell);
  document.body.append(dialog);
  choose.addEventListener("click", () => recordPreviewOutput("[编译工具] 选择仓库清单 JSON（模拟）"));
  dialog.showModal();
}

function dispatchAutoBuildRepositoryUpdate(target: "root" | "thirdParty", enabled: boolean): void {
  commitAutoBuildTransition(reducePreviewAutoBuildState(autoBuildState, {
    type: "setRepositoryUpdate",
    target,
    enabled,
  }));
}

function commitAutoBuildTransition(transition: PreviewAutoBuildTransition): void {
  autoBuildState = transition.state;
  if (transition.output) recordPreviewOutput(transition.output);
  if (activeSurfaceToolId === "autoBuild") renderPrimaryContent();
  renderAutoBuildRight();
}

function renderAutoBuildRight(): void {
  const viewState = derivePreviewAutoBuildState(autoBuildState);
  document.querySelectorAll<HTMLElement>("[data-auto-build-status]").forEach((element) => {
    element.textContent = autoBuildState.status;
    element.dataset.tone = autoBuildState.tone;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-auto-build-action='toggleRun']").forEach((button) => {
    button.textContent = viewState.rightRunLabel;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-auto-build-action='preflight']").forEach((button) => {
    button.disabled = autoBuildState.phase === "running";
  });
  document.querySelectorAll<HTMLElement>("[data-auto-build-task-status]").forEach((element, index) => {
    const running = autoBuildState.phase === "running" && index === 0;
    element.textContent = running
      ? viewState.rightTaskStatus
      : (PREVIEW_AUTO_BUILD_SAMPLE.tasks[index]?.status ?? viewState.rightTaskStatus);
    element.dataset.tone = running ? "progress" : (PREVIEW_AUTO_BUILD_SAMPLE.tasks[index]?.tone ?? "idle");
  });
  document.querySelectorAll<HTMLElement>("[data-auto-build-mode]").forEach((element) => {
    element.textContent = viewState.rightModeLabel;
  });
  document.querySelectorAll<HTMLInputElement>("[data-auto-build-probe-columns]").forEach((input) => {
    input.checked = autoBuildState.probeColumnsVisible;
  });
  document.querySelectorAll<HTMLInputElement>("[data-auto-build-update-root]").forEach((input) => {
    input.checked = autoBuildState.updateRootDirectory;
    input.disabled = viewState.configurationOptionsDisabled || !autoBuildState.rootEnabled;
  });
  document.querySelectorAll<HTMLInputElement>("[data-auto-build-update-third-party]").forEach((input) => {
    input.checked = autoBuildState.updateThirdParty;
    input.disabled = viewState.configurationOptionsDisabled || !autoBuildState.thirdPartyEnabled;
  });
  document.querySelectorAll<HTMLInputElement>("[data-auto-build-repository-enabled]").forEach((input) => {
    input.checked = input.dataset.autoBuildRepositoryEnabled === "root"
      ? autoBuildState.rootEnabled
      : autoBuildState.thirdPartyEnabled;
    input.disabled = viewState.configurationOptionsDisabled;
  });
  document.querySelectorAll<HTMLElement>("[data-auto-build-project-table]").forEach((table) => {
    table.dataset.probeColumnsVisible = String(autoBuildState.probeColumnsVisible);
  });
}

function recordPreviewOutput(message: string): void {
  const line = message.replace(/[\r\n]+/gu, " ").trim().slice(0, 300);
  if (!line) return;
  previewOutputSequence += 1;
  previewOutputLines = Object.freeze([
    ...previewOutputLines,
    `#${String(previewOutputSequence).padStart(2, "0")} ${line}`,
  ].slice(-80));
  renderSystemOutput();
}

function renderSystemOutput(): void {
  systemOutput.hidden = !outputVisible;
  systemOutput.model = {
    title: "输出",
    lines: previewOutputLines,
  };
  outputToggle.setAttribute("aria-pressed", String(outputVisible));
  const label = outputVisible ? "隐藏输出" : "显示输出";
  outputToggle.setAttribute("aria-label", label);
  outputToggle.title = label;
}

function setOutputVisibility(visible: boolean, persist = true): void {
  outputVisible = visible;
  renderSystemOutput();
  if (persist) persistPreviewState();
}

function renderStandaloneSurface(): void {
  standaloneSurface.replaceChildren();
  const metadata = PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId];
  if (!metadata) {
    standaloneSurface.append(createWelcomeSurface());
    return;
  }
  if (metadata.toolId === "ignoreSettings" || metadata.toolId === "environmentSettings") {
    const description = document.createElement("p");
    description.textContent = metadata.description;
    standaloneSurface.append(description);
    renderPrimaryUtility(metadata.toolId);
    return;
  }
  standaloneSurface.append(createToolSummary(metadata.toolId));
}

function createWelcomeSurface(): HTMLElement {
  const welcome = document.createElement("section");
  welcome.className = "preview-welcome-panel";
  welcome.setAttribute("aria-label", "KT Auto Code 欢迎");

  const brand = document.createElement("header");
  brand.className = "preview-welcome-brand";
  const mark = document.createElement("div");
  mark.className = "preview-welcome-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "P";
  const brandCopy = document.createElement("div");
  brandCopy.className = "preview-welcome-brand-copy";
  const brandName = document.createElement("h2");
  brandName.className = "preview-welcome-brand-name";
  brandName.textContent = "PHOENIX";
  const product = document.createElement("div");
  product.className = "preview-welcome-brand-product";
  product.textContent = "KT Auto Code";
  brandCopy.append(brandName, product);
  brand.append(mark, brandCopy);

  const intro = document.createElement("p");
  intro.className = "preview-welcome-intro";
  intro.textContent = "从上方工具栏选择功能，对应的 Block 会在这里打开。";
  const sectionTitle = document.createElement("h3");
  sectionTitle.className = "preview-welcome-section-title";
  sectionTitle.textContent = "插件状态";
  const products = document.createElement("div");
  products.className = "preview-welcome-products";
  products.append(
    createWelcomeProduct("CODE", "KT Auto Code", `版本 ${packageManifest.version}`, true),
    createWelcomeProduct("CAD", "KT Auto CAD", "可选 CAD 模块", false),
  );

  const footer = document.createElement("footer");
  footer.className = "preview-welcome-footer";
  footer.setAttribute("aria-label", "常用链接");
  ["Gitee 主页", "安装说明", "快速开始", "插件设置", "运行诊断"].forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preview-welcome-link";
    button.textContent = label;
    button.addEventListener("click", () => recordPreviewOutput(`[欢迎] ${label}（模拟）`));
    footer.append(button);
  });
  welcome.append(brand, intro, sectionTitle, products, footer);
  return welcome;
}

function createWelcomeProduct(
  moduleId: "CODE" | "CAD",
  titleText: string,
  metaText: string,
  installed: boolean,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "preview-welcome-product";
  const icon = document.createElement("div");
  icon.className = "preview-welcome-product-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = moduleId;
  const main = document.createElement("div");
  main.className = "preview-welcome-product-main";
  const title = document.createElement("div");
  title.className = "preview-welcome-product-title";
  title.textContent = titleText;
  const meta = document.createElement("div");
  meta.className = "preview-welcome-product-meta";
  meta.textContent = metaText;
  main.append(title, meta);
  const actions = document.createElement("div");
  actions.className = "preview-welcome-product-status";
  const status = document.createElement("span");
  status.className = `preview-welcome-status${installed ? "" : " is-missing"}`;
  status.textContent = installed ? "已安装" : "未安装";
  actions.append(status);
  if (!installed) {
    const install = document.createElement("button");
    install.type = "button";
    install.className = "preview-welcome-install";
    install.textContent = "安装";
    install.addEventListener("click", () => recordPreviewOutput(`[欢迎] 安装 ${titleText}（模拟）`));
    actions.append(install);
  }
  row.append(icon, main, actions);
  return row;
}

function renderPrimaryUtility(toolId: UtilityToolId): void {
  const optionLabels = toolId === "ignoreSettings"
    ? ["插件内置 Ignore", "Git .gitignore", "Phoenix .ignore"]
    : ["工作区设置", "本机工具配置", "开发辅助"];
  const options = document.createElement("fieldset");
  options.className = "preview-primary-options";
  const legend = document.createElement("legend");
  legend.textContent = toolId === "ignoreSettings" ? "当前扫描来源" : "设置范围";
  options.append(legend);
  optionLabels.forEach((labelText, index) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = utilitySelections[toolId][index] ?? false;
    checkbox.addEventListener("change", () => {
      utilitySelections[toolId][index] = checkbox.checked;
    });
    label.append(checkbox, document.createTextNode(labelText));
    options.append(label);
  });
  const actions = document.createElement("div");
  actions.className = "preview-primary-actions";
  const secondary = document.createElement("button");
  secondary.type = "button";
  secondary.textContent = toolId === "ignoreSettings" ? "查看有效规则" : "打开设置 JSON";
  secondary.title = "原型不调用真实命令";
  const primary = document.createElement("button");
  primary.type = "button";
  primary.className = "is-primary";
  primary.textContent = toolId === "ignoreSettings" ? "分析当前目录" : "应用预览设置";
  primary.title = "原型不调用真实命令";
  actions.append(secondary, primary);
  standaloneSurface.append(options, actions);
}

function openEditor(toolId: string): void {
  const meta = PREVIEW_TOOL_CATALOG_BY_ID[toolId];
  if (!meta || !resolvePreviewToolRoute(meta).rightPanelId) return;
  activateTool(toolId);
}

function addOpenItem(toolId: string): void {
  const item = previewItem(toolId);
  if (!openItems.some((candidate) => candidate.id === item.id)) openItems = [...openItems, item];
}

function closeItem(itemId: string): void {
  const closing = openItems.find((candidate) => candidate.id === itemId);
  if (!closing) return;
  const closingActiveSurface = activeSurfaceToolId === closing.toolId;
  openItems = openItems.filter((candidate) => candidate.id !== itemId);
  mruItemIds = removeMruItem(mruItemIds, itemId);
  surfaceMruToolIds = surfaceMruToolIds.filter((candidate) => candidate !== closing.toolId);
  if (activeNavigatorToolId === closing.toolId) activeNavigatorToolId = latestOpenNavigatorToolId();
  if (closing.kind === "right" && activeEditorId === closing.toolId) {
    activeEditorId = latestOpenItem("right")?.toolId;
  }
  if (activeItemId === itemId) {
    const fallback = latestOpenItem();
    activeItemId = fallback?.id ?? "";
  }
  if (closingActiveSurface) {
    const fallback = latestSurfaceItem()
      ?? openItems.find((candidate) => candidate.id === activeItemId)
      ?? latestOpenItem();
    if (fallback) applyToolToSurface(fallback.toolId, false);
    else clearSurface();
  }
  renderAll();
}

function closeOtherItems(itemId: string): void {
  const keep = openItems.find((candidate) => candidate.id === itemId);
  if (!keep) return;
  openItems = [keep];
  mruItemIds = [keep.id];
  surfaceMruToolIds = [keep.toolId];
  activeItemId = keep.id;
  activeEditorId = keep.kind === "right" ? keep.toolId : undefined;
  applyToolToSurface(keep.toolId);
  renderAll();
}

function closeCurrentPrimaryTool(itemId?: string): void {
  const current = itemId
    ? openItems.find((candidate) => candidate.id === itemId)
    : openItems.find((candidate) => candidate.toolId === activeSurfaceToolId);
  if (itemId && !current) return;
  if (!current) {
    clearSurface();
    renderSurface();
    persistPreviewState();
    return;
  }
  closeItem(current.id);
}

function activateOpenItem(item: PreviewOpenItem): void {
  activateTool(item.toolId);
}

function applyToolToSurface(toolId: string, updateMru = true): void {
  const meta = PREVIEW_TOOL_CATALOG_BY_ID[toolId];
  if (!meta) return;
  if (updateMru) {
    surfaceMruToolIds = [...surfaceMruToolIds.filter((candidate) => candidate !== toolId), toolId];
  }
  activeSurfaceToolId = toolId;
  activeGroupId = meta.groupId;
  if (meta.groupId === "codeAssistant") activeNavigatorToolId = toolId;
}

function clearSurface(): void {
  activeSurfaceToolId = "";
  activeNavigatorToolId = "";
  activeGroupId = "codeAssistant";
}

function touchMru(itemId: string): void {
  mruItemIds = touchMruItem(mruItemIds, itemId);
}

function latestOpenItem(kind?: PreviewItemKind): PreviewOpenItem | undefined {
  return findLatestMruItem(openItems, mruItemIds, (item) => !kind || item.kind === kind);
}

function latestSurfaceItem(): PreviewOpenItem | undefined {
  for (let index = surfaceMruToolIds.length - 1; index >= 0; index -= 1) {
    const item = openItems.find((candidate) => candidate.toolId === surfaceMruToolIds[index]);
    if (item) return item;
  }
  return undefined;
}

function latestOpenNavigatorToolId(): string {
  for (let index = surfaceMruToolIds.length - 1; index >= 0; index -= 1) {
    const toolId = surfaceMruToolIds[index]!;
    if (isOpenTool(toolId) && PREVIEW_TOOL_CATALOG_BY_ID[toolId]?.groupId === "codeAssistant") return toolId;
  }
  return "";
}

function isOpenTool(toolId: string): boolean {
  return Boolean(toolId) && openItems.some((candidate) => candidate.toolId === toolId);
}

function defaultUtilitySelections(): Record<UtilityToolId, boolean[]> {
  return {
    ignoreSettings: [true, true, true],
    environmentSettings: [true, true, false],
  };
}

function resetVolatilePreviewState(): void {
  autoBuildState = createDefaultPreviewAutoBuildState();
  utilitySelections = defaultUtilitySelections();
  previewOutputSequence = INITIAL_PREVIEW_OUTPUT_LINES.length;
  previewOutputLines = INITIAL_PREVIEW_OUTPUT_LINES;
}

function renderAll(persist = true): void {
  renderDirectoryVisibility();
  renderRibbon();
  renderSurface();
  renderEditor();
  renderAutoBuildRight();
  renderSystemOutput();
  renderOpenItems();
  if (persist) persistPreviewState();
}

function renderDirectoryVisibility(): void {
  directoryRow.hidden = !directoryVisible;
  directoryRow.model = {
    label: "目录",
    value: directoryChoices[directoryIndex] ?? directoryChoices[0]!,
  };
  directoryToggle.setAttribute("aria-pressed", String(directoryVisible));
  directoryToggle.title = directoryVisible ? "隐藏目录" : "显示目录";
  directoryHeaderIcon.setAttribute("href", directoryVisible ? "#preview-icon-folder-opened" : "#preview-icon-folder");
}

function persistPreviewState(): void {
  previewStateStore.save({
    theme: previewTheme,
    primaryWidth,
    customPrimaryWidth,
    primaryVisible,
    directoryVisible,
    directoryIndex,
    ribbonExpanded,
    navigatorExpanded,
    navigatorShowLabels,
    activeGroupId,
    activeToolId: activeSurfaceToolId,
    activeNavigatorToolId,
    activeEditorId: activeEditorId ?? null,
    activeItemId,
    openToolIds: openItems.map((item) => item.toolId),
    mruItemIds,
    surfaceMruToolIds,
    outputVisible,
  });
}

function restorePreviewState(state: PreviewPersistedState): void {
  previewTheme = state.theme;
  primaryWidth = state.primaryWidth;
  customPrimaryWidth = state.customPrimaryWidth;
  primaryVisible = state.primaryVisible;
  directoryVisible = state.directoryVisible;
  directoryIndex = state.directoryIndex;
  ribbonExpanded = state.ribbonExpanded;
  navigatorExpanded = state.navigatorExpanded;
  navigatorShowLabels = state.navigatorShowLabels;
  activeGroupId = state.activeGroupId;
  activeSurfaceToolId = state.activeToolId;
  activeNavigatorToolId = state.activeNavigatorToolId;
  activeEditorId = state.activeEditorId ?? undefined;
  activeItemId = state.activeItemId;
  openItems = state.openToolIds.map(previewItem);
  mruItemIds = [...state.mruItemIds];
  surfaceMruToolIds = [...state.surfaceMruToolIds];
  outputVisible = state.outputVisible;

  setTheme(previewTheme, false);
  if (primaryWidth === "custom" && customPrimaryWidth !== null) {
    setCustomPrimaryWidth(customPrimaryWidth, false);
  } else {
    setPrimaryWidth(primaryWidth === "custom" ? "standard" : primaryWidth, false);
  }
  setPrimaryVisibility(primaryVisible, false);
  renderAll(false);
}

function renderOpenItems(): void {
  openItemsBar.model = {
    items: openItems.map((item) => ({
      id: item.id,
      title: item.title,
      shortTitle: item.shortTitle,
      icon: item.icon,
    })),
    activeId: activeItemId,
    overflowLabel: "全部打开项",
  };
}

function restoreOpenItemsFocus(): void {
  if (openItemsBar.focusActiveItem()) return;
  const activeRibbonButton = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-ribbon-id]"))
    .find((button) => button.dataset.ribbonId === activeGroupId);
  if (activeRibbonButton) activeRibbonButton.focus();
  else toolbarStrip.focusOverflowTrigger();
}

function showRibbonMenu(): void {
  ribbonMenu.replaceChildren();
  PREVIEW_RIBBON_ITEMS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", String(item.ribbonId === activeGroupId));
    button.setAttribute("aria-label", item.title);
    button.title = item.description;
    button.append(previewIcon(item.icon), document.createTextNode(item.title));
    button.addEventListener("click", () => {
      activateRibbonItem(item.ribbonId, item.kind === "tool" ? item.toolId : undefined);
      hideRibbonMenu();
    });
    ribbonMenu.append(button);
  });
  const customize = document.createElement("button");
  customize.type = "button";
  customize.setAttribute("role", "menuitem");
  customize.textContent = "自定义工具栏…";
  customize.title = "原型暂不保存排序或隐藏项";
  ribbonMenu.append(customize);
  ribbonMenu.hidden = false;
  renderRibbon();
  const trigger = toolbarStrip.getOverflowAnchorRect();
  const menuWidth = 200;
  const menuHeight = Math.min(240, PREVIEW_RIBBON_ITEMS.length * 30 + 38);
  ribbonMenu.style.left = `${Math.max(4, Math.min(window.innerWidth - menuWidth - 4, trigger.right - menuWidth))}px`;
  ribbonMenu.style.top = `${Math.max(4, Math.min(window.innerHeight - menuHeight - 4, trigger.bottom + 4))}px`;
  ribbonMenu.querySelector<HTMLButtonElement>("button")?.focus();
}

function hideRibbonMenu(restoreFocus = false): void {
  if (ribbonMenu.hidden) return;
  ribbonMenu.hidden = true;
  renderRibbon();
  if (restoreFocus) toolbarStrip.focusOverflowTrigger();
}

function renderEditor(): void {
  const editorItems = openItems.filter((item) => item.kind === "right");
  const activeEditorTool = activeEditorId ? PREVIEW_TOOL_CATALOG_BY_ID[activeEditorId] : undefined;
  const activeRightPanelId = activeEditorTool
    ? resolvePreviewToolRoute(activeEditorTool).rightPanelId
    : null;
  editorTabsHost.replaceChildren();
  editorItems.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = `preview-editor-tab${item.toolId === activeEditorId ? " is-active" : ""}`;
    const activate = document.createElement("button");
    activate.type = "button";
    activate.className = "preview-editor-tab-activate";
    activate.setAttribute("aria-label", `打开${item.title}标签`);
    activate.append(previewIcon(item.icon));
    const label = document.createElement("span");
    label.textContent = item.title;
    activate.append(label);
    activate.addEventListener("click", () => openEditor(item.toolId));
    wrapper.append(activate, closeButton(`关闭${item.title}标签`, () => closeItem(item.id)));
    editorTabsHost.append(wrapper);
  });
  let visible = false;
  document.querySelectorAll<HTMLElement>("[data-editor-panel]").forEach((panel) => {
    const show = panel.dataset.editorPanel === activeRightPanelId
      && editorItems.some((item) => item.toolId === activeEditorId);
    panel.hidden = !show;
    visible ||= show;
  });
  editorEmpty.hidden = visible;
}

function closeButton(label: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preview-tab-close";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(previewIcon("close"));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    action();
  });
  return button;
}

function previewItem(toolId: string): PreviewOpenItem {
  const meta = resolvePreviewTool(toolId);
  if (!meta) throw new Error(`Unknown preview tool: ${toolId}`);
  return { ...meta, id: `tool:${toolId}`, kind: resolvePreviewToolRoute(meta).openItemKind };
}

function previewIcon(name: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#preview-icon-${name}`);
  svg.append(use);
  return svg;
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Primary preview is missing ${selector}`);
  return element;
}

restorePreviewState(initialPreviewState);
