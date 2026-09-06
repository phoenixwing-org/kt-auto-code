import { KTC_CODE_ASSISTANT_NAVIGATION } from "../../src/tools/codeAssistant/navigation.js";
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
import type { KtcRightViewShell } from "../../src/ui/KtcRightViewShell.js";
import "../../src/ui/KtcRightViewShellEntry.js";
import {
  KTC_SYSTEM_OUTPUT_BLOCK_ACTION,
  type KtcSystemOutputBlock,
  type KtcSystemOutputBlockActionDetail,
} from "../../src/ui/KtcSystemOutputBlock.js";
import "../../src/ui/KtcSystemOutputBlockEntry.js";
import {
  findLatestMruItem,
  removeMruItem,
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
  PREVIEW_TOOL_CATALOG_BY_ID,
  resolvePreviewTool,
  type PreviewToolDescriptor,
} from "./previewToolCatalog.js";
import {
  resolvePreviewToolRoute,
  type PreviewOpenItemKind,
} from "./previewToolRouting.js";
import {
  normalizePreviewCompanionModel,
  type PreviewCompanionModel,
} from "./previewCompanionModel.js";

type PrimaryWidth = Exclude<PreviewPrimaryWidth, "custom">;
type PreviewItemKind = PreviewOpenItemKind;
type UtilityToolId = "ignoreSettings" | "environmentSettings";

interface PreviewOpenItem extends PreviewToolDescriptor {
  readonly id: string;
  readonly kind: PreviewItemKind;
}

const GROUP_COPY: Readonly<Record<string, { readonly title: string; readonly detail: string }>> = Object.freeze({
  git: { title: "Git", detail: "仓库、分支与提交操作复用同一个 Current Tool Block。" },
  run: { title: "Run", detail: "运行配置和状态放在 Current Tool Block；长日志进入右侧 Editor。" },
  replace: { title: "搜索替换", detail: "简单替换留在 Primary，复杂项目改名进入右侧 Editor。" },
  codegen: { title: "自动代码", detail: "这里仅验证 Primary 外壳，不连接生成器或文件系统。" },
  ignoreSettings: { title: "Ignore 管理", detail: "插件内置、Git 与 Phoenix 自定义规则都在当前工具 Block 中管理。" },
  environmentSettings: { title: "设置", detail: "工作区策略与本机工具配置在当前工具 Block 中分层展示。" },
});

const RIGHT_COMPANION_MODELS: Readonly<Record<string, PreviewCompanionModel>> = Object.freeze({
  packageIncludes: normalizePreviewCompanionModel({
    status: { label: "等待扫描", tone: "idle" },
    facts: [
      { id: "scope", label: "范围", value: "当前目录" },
      { id: "write", label: "写入", value: "先预览 Diff" },
    ],
    actions: [{ actionId: "revealRight", label: "定位 Right View", enabled: true }],
  }),
  projectRename: normalizePreviewCompanionModel({
    status: { label: "分析前", tone: "idle" },
    facts: [
      { id: "project", label: "项目", value: "phoenix-open-issue" },
      { id: "write", label: "写入", value: "需确认 Diff" },
    ],
    actions: [{ actionId: "revealRight", label: "定位 Right View", enabled: true }],
  }),
  codegen: normalizePreviewCompanionModel({
    status: { label: "等待配置", tone: "idle" },
    facts: [
      { id: "module", label: "模块", value: "Phoenix Web" },
      { id: "output", label: "输出", value: "Right View" },
    ],
    actions: [{ actionId: "revealRight", label: "定位 Right View", enabled: true }],
  }),
});

const AUTO_BUILD_PROJECTS = Object.freeze([
  Object.freeze({
    id: "ktcore",
    title: "KtCore",
    buildKinds: "更新 · CMake",
    probeStatus: "干净",
  }),
  Object.freeze({
    id: "bom",
    title: "PNXBomAnalysisWsp",
    buildKinds: "更新 · CAA · linkCAA",
    probeStatus: "有修改",
  }),
]);

type PreviewBuildStatusTone = "idle" | "progress" | "success" | "warning";

interface PreviewAutoBuildState {
  readonly selectedProjectId: string;
  readonly status: string;
  readonly tone: PreviewBuildStatusTone;
  readonly rootScriptStatus: string;
  readonly cleanupStatus: string;
  readonly environmentExpanded: boolean;
  readonly maintenanceExpanded: boolean;
}

const INITIAL_PREVIEW_OUTPUT_LINES = Object.freeze([
  "#01 [系统] Phoenix Webview Preview 已连接",
  "#02 [模块] 编译工具原型已注册：Primary + Right",
  "#03 [配置] auto-build.local.json · 启用项目 2 / 2 · 顺序执行",
  "#04 [环境] macOS 检查模式 · 实际 CAA 构建目标为 Windows",
  "#05 [提示] 按钮反馈会追加到这里；不会调用真实业务。",
]);

const RIBBON_ITEMS = Object.freeze([
  { kind: "group", ribbonId: "codeAssistant", title: "代码辅助", icon: "file-check" },
  { kind: "tool", ribbonId: "git", toolId: "git", title: "Git", icon: "git" },
  { kind: "tool", ribbonId: "run", toolId: "run", title: "Run", icon: "play" },
  { kind: "tool", ribbonId: "replace", toolId: "projectRename", title: "替换", icon: "search" },
  { kind: "tool", ribbonId: "codegen", toolId: "codegen", title: "自动代码", icon: "sliders" },
]);

const previewStateStore = createPreviewStateStore();
const initialPreviewState = previewStateStore.load();

const root = document.documentElement;
const workbench = required<HTMLElement>("#preview-workbench");
const primaryHost = required<HTMLElement>(".preview-primary");
const editorHost = required<HTMLElement>(".preview-editor");
const splitter = required<HTMLElement>("#preview-splitter");
const directoryRow = required<HTMLElement>("[data-directory-row]");
const directoryName = required<HTMLElement>("[data-directory-name]");
const directoryToggle = required<HTMLButtonElement>("[data-action='toggle-directory']");
const outputToggle = required<HTMLButtonElement>("[data-action='toggle-output']");
const directoryHeaderIcon = required<SVGUseElement>("[data-directory-header-icon]");
const toolbarStrip = required<HTMLElement>("[data-toolbar-strip]");
const ribbonToggle = required<HTMLButtonElement>("[data-action='toggle-ribbon']");
const currentTool = required<HTMLElement>("[data-current-tool]");
const currentToolTitle = required<HTMLElement>("[data-current-tool-title]");
const currentToolIcon = required<SVGUseElement>("[data-current-tool-icon]");
const codeAssistantMenu = required<HTMLElement>("[data-code-assistant-menu]");
const codeAssistantSurface = required<HTMLElement>("[data-code-assistant-surface]");
const groupPlaceholder = required<HTMLElement>("[data-group-placeholder]");
const primaryContent = required<HTMLElement>("[data-primary-content]");
const navigator = required<KtcToolNavigator>("#preview-tool-navigator");
const openItemsBar = required<KtcOpenItemsBar>("#preview-open-items-bar");
const editorTabsHost = required<HTMLElement>("[data-editor-tabs]");
const editorEmpty = required<HTMLElement>("[data-editor-empty]");
const systemOutput = required<KtcSystemOutputBlock>("#preview-system-output");
const ribbonMoreButton = required<HTMLButtonElement>("[data-action='ribbon-more']");
const ribbonMenu = required<HTMLElement>("[data-ribbon-menu]");

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
let autoBuildState = defaultAutoBuildState();
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
  setPrimaryVisibility(!primaryVisible);
});
required<HTMLButtonElement>("[data-action='cycle-directory']").addEventListener("click", () => {
  directoryIndex = (directoryIndex + 1) % directoryChoices.length;
  renderDirectoryVisibility();
  persistPreviewState();
});
required<HTMLButtonElement>("[data-action='choose-directory']").addEventListener("click", () => {
  directoryIndex = (directoryIndex + 1) % directoryChoices.length;
  renderDirectoryVisibility();
  persistPreviewState();
});
directoryToggle.addEventListener("click", () => {
  directoryVisible = !directoryVisible;
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
systemOutput.addEventListener(KTC_SYSTEM_OUTPUT_BLOCK_ACTION, (event) => {
  const detail = (event as CustomEvent<KtcSystemOutputBlockActionDetail>).detail;
  if (detail.kind === "close") setOutputVisibility(false);
});
outputToggle.addEventListener("click", () => setOutputVisibility(!outputVisible));

ribbonToggle.addEventListener("click", () => {
  ribbonExpanded = !ribbonExpanded;
  renderRibbon();
  persistPreviewState();
});
document.querySelectorAll<HTMLButtonElement>("[data-ribbon-id]").forEach((button) => {
  button.addEventListener("click", () => activateRibbonItem(
    button.dataset.ribbonId ?? "",
    button.dataset.nodeKind === "group" ? undefined : button.dataset.toolId,
  ));
});
required<HTMLButtonElement>("[data-action='close-current']").addEventListener("click", closeCurrentPrimaryTool);
navigator.addEventListener("ktc-tool-navigator-action", (event) => {
  const detail = (event as CustomEvent<KtcToolNavigatorActionDetail>).detail;
  if (detail.kind === "activate") {
    activeNavigatorToolId = detail.toolId;
    activateTool(detail.toolId);
  } else if (detail.kind === "setShowLabels") {
    navigatorShowLabels = detail.showLabels;
  }
  renderNavigator();
  codeAssistantMenu.hidden = activeGroupId !== "codeAssistant" || !navigatorExpanded;
  persistPreviewState();
});

openItemsBar.addEventListener("ktc-open-items-bar-action", (event) => {
  const detail = (event as CustomEvent<KtcOpenItemsBarActionDetail>).detail;
  if (detail.kind === "activate") {
    const item = openItems.find((candidate) => candidate.id === detail.itemId);
    if (item) activateOpenItem(item);
  } else if (detail.kind === "close") {
    closeItem(detail.itemId);
    queueMicrotask(() => openItemsBar.focusActiveItem());
  } else if (detail.kind === "closeOthers") {
    closeOtherItems(detail.itemId);
    queueMicrotask(() => openItemsBar.focusActiveItem());
  }
});
document.addEventListener("pointerdown", (event) => {
  if (!ribbonMenu.hidden
    && !ribbonMenu.contains(event.target as Node)
    && !ribbonMoreButton.contains(event.target as Node)) hideRibbonMenu();
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
ribbonMoreButton.addEventListener("click", () => {
  if (ribbonMenu.hidden) showRibbonMenu();
  else hideRibbonMenu(true);
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
  toolbarStrip.classList.toggle("is-compact", !ribbonExpanded);
  ribbonToggle.setAttribute("aria-expanded", String(ribbonExpanded));
  ribbonToggle.title = ribbonExpanded ? "收起工具栏" : "展开工具栏";
  document.querySelectorAll<HTMLButtonElement>("[data-ribbon-id]").forEach((button) => {
    const active = button.dataset.ribbonId === activeGroupId;
    const label = button.getAttribute("aria-label") ?? "工具";
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.nodeKind === "group") {
      button.setAttribute("aria-expanded", String(active && navigatorExpanded));
    }
    button.title = active ? `${label} · 当前显示` : label;
    if (active && button.dataset.ribbonId === "codeAssistant") {
      button.title = `${label} · 二级目录${navigatorExpanded ? "已展开" : "已收起"}，再次点击切换`;
    } else if (button.dataset.nodeKind === "group") {
      button.title = `${label} · 有下级工具`;
    }
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
    const navigatorToolId = isOpenTool(activeNavigatorToolId)
      ? activeNavigatorToolId
      : latestOpenNavigatorToolId();
    activeNavigatorToolId = navigatorToolId;
    if (navigatorToolId) {
      activateTool(navigatorToolId);
      return;
    }
    activeSurfaceToolId = "";
  } else {
    activeSurfaceToolId = "";
  }
  renderRibbon();
  renderSurface();
  persistPreviewState();
}

function renderSurface(): void {
  const title = currentSurfaceTitle();
  const surfaceMeta = PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId];
  const surfaceGroupId = surfaceMeta?.groupId ?? activeGroupId;
  currentTool.setAttribute("aria-label", `当前工具：${title}`);
  currentToolTitle.textContent = title;
  currentToolIcon.setAttribute("href", `#preview-icon-${currentSurfaceIcon()}`);
  codeAssistantMenu.hidden = activeGroupId !== "codeAssistant" || !navigatorExpanded;
  if (activeGroupId === "codeAssistant") renderNavigator();
  codeAssistantSurface.hidden = surfaceGroupId !== "codeAssistant" || !surfaceMeta;
  groupPlaceholder.hidden = surfaceGroupId === "codeAssistant" && Boolean(surfaceMeta);
  if (surfaceGroupId === "codeAssistant" && surfaceMeta) {
    renderPrimaryContent();
  } else {
    renderGroupPlaceholder();
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
  return PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId]?.title
    ?? GROUP_COPY[activeGroupId]?.title
    ?? "当前工具";
}

function currentSurfaceIcon(): string {
  const toolIcon = PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId]?.icon;
  if (toolIcon === "shield") return "exclude";
  if (toolIcon) return toolIcon;
  return RIBBON_ITEMS.find((item) => item.ribbonId === activeGroupId)?.icon ?? "layout";
}

function renderNavigator(): void {
  navigator.model = {
    presentation: "compact",
    title: "功能目录",
    nodes: KTC_CODE_ASSISTANT_NAVIGATION,
    showLabels: navigatorShowLabels,
    activeToolId: activeNavigatorToolId,
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
  } else if (resolvePreviewToolRoute(meta).primaryKind === "companion") {
    const model = companionModel(toolId);
    title.textContent = meta.title;
    const badge = document.createElement("span");
    badge.className = "preview-surface-badge";
    badge.dataset.tone = model.status.tone;
    badge.textContent = `Right View · ${model.status.label}`;
    heading.append(title, badge);
    detail.textContent = meta.description;
    main.append(heading, detail);
    if (model.facts.length > 0) main.append(renderRightCompanionFacts(model));
    main.append(renderRightCompanionActions(toolId, model));
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

function companionModel(toolId: string): PreviewCompanionModel {
  return RIGHT_COMPANION_MODELS[toolId] ?? normalizePreviewCompanionModel({
    status: { label: "已打开", tone: "idle" },
    facts: [],
    actions: [{ actionId: "revealRight", label: "定位 Right View", enabled: true }],
  });
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
    button.disabled = !enabled;
    button.addEventListener("click", () => dispatchCompanionAction(toolId, actionId));
    actions.append(button);
  });
  return actions;
}

function dispatchCompanionAction(toolId: string, actionId: string): void {
  if (actionId === "revealRight") openEditor(toolId);
}

function createAutoBuildPrimary(meta: PreviewToolDescriptor): HTMLElement {
  const section = document.createElement("section");
  section.className = "preview-auto-build-primary";
  section.setAttribute("aria-label", "编译工具 Primary 控制");

  const heading = document.createElement("div");
  heading.className = "preview-primary-section-heading";
  const title = document.createElement("strong");
  title.textContent = "运行概览";
  const status = document.createElement("span");
  status.className = "preview-surface-badge";
  status.dataset.tone = autoBuildState.tone;
  status.textContent = autoBuildState.status;
  heading.append(title, status);

  const metrics = document.createElement("div");
  metrics.className = "preview-primary-metrics";
  const taskProgress = autoBuildState.tone === "progress"
    ? "1 / 4"
    : autoBuildState.tone === "success" ? "4 / 4" : "0 / 4";
  ([
    ["启用项目", "2 / 2"],
    ["任务", taskProgress],
    ["失败", "0"],
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
  actions.className = "preview-primary-actions preview-auto-build-actions";
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.textContent = "详细配置";
  reveal.dataset.previewOutput = "handled";
  reveal.addEventListener("click", () => {
    recordPreviewOutput("[编译工具] 已定位 Right View 详细配置");
    openEditor(meta.toolId);
  });
  const output = document.createElement("button");
  output.type = "button";
  output.textContent = "展开输出";
  output.dataset.previewOutput = "handled";
  output.addEventListener("click", () => dispatchAutoBuildIntent("openOutput"));
  const preflight = document.createElement("button");
  preflight.type = "button";
  preflight.textContent = "预检";
  preflight.dataset.previewOutput = "handled";
  preflight.addEventListener("click", () => dispatchAutoBuildIntent("preflight"));
  const run = document.createElement("button");
  run.type = "button";
  run.className = "is-primary";
  run.textContent = autoBuildState.tone === "progress" ? "停止" : "运行";
  run.title = "原型只更新共享快照；不启动真实进程";
  run.dataset.previewOutput = "handled";
  run.addEventListener("click", () => dispatchAutoBuildIntent("toggleRun"));
  actions.append(reveal, output, preflight, run);

  const configBar = document.createElement("section");
  configBar.className = "preview-primary-config-bar";
  configBar.setAttribute("aria-label", "当前配置");
  const configLabel = document.createElement("strong");
  configLabel.textContent = "当前配置";
  const configName = document.createElement("span");
  configName.textContent = "auto-build.local.json";
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
  configBar.append(configLabel, configName, openConfig, saveConfig);

  const projectsTitle = document.createElement("strong");
  projectsTitle.className = "preview-primary-subheading";
  projectsTitle.textContent = "项目摘要";

  const targets = document.createElement("div");
  targets.className = "preview-primary-build-targets";
  targets.setAttribute("aria-label", "编译项目摘要");
  AUTO_BUILD_PROJECTS.forEach((project) => {
    const selected = project.id === autoBuildState.selectedProjectId;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `preview-primary-build-target${selected ? " is-selected" : ""}`;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", `查看${project.title}摘要`);
    button.dataset.previewOutput = "handled";
    button.append(previewIcon(meta.icon));
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = project.title;
    const buildKinds = document.createElement("small");
    buildKinds.textContent = project.buildKinds;
    copy.append(name, buildKinds);
    const probe = document.createElement("small");
    probe.className = "preview-primary-project-status";
    probe.textContent = project.probeStatus;
    button.append(copy, probe);
    button.addEventListener("click", () => dispatchAutoBuildIntent("selectProject", project.id));
    targets.append(button);
  });

  const environment = document.createElement("details");
  environment.className = "preview-primary-fold preview-primary-environment";
  environment.open = autoBuildState.environmentExpanded;
  const environmentSummary = document.createElement("summary");
  environmentSummary.append(document.createTextNode("工程环境"));
  const environmentHint = document.createElement("span");
  environmentHint.textContent = "macOS（检查）";
  environmentSummary.append(environmentHint);
  const facts = document.createElement("dl");
  facts.className = "preview-companion-facts preview-auto-build-facts";
  [
    ["工作目录", "当前目录 / projects"],
    ["执行模式", "顺序：CMake → CAA"],
    ["平台", "macOS（检查）→ Windows 执行"],
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
    autoBuildState = Object.freeze({ ...autoBuildState, environmentExpanded: environment.open });
  });

  const maintenance = document.createElement("details");
  maintenance.className = "preview-primary-fold preview-primary-maintenance";
  maintenance.open = autoBuildState.maintenanceExpanded;
  const maintenanceSummary = document.createElement("summary");
  maintenanceSummary.append(document.createTextNode("维护与清理"));
  const maintenanceHint = document.createElement("span");
  maintenanceHint.textContent = "低频 · 默认折叠";
  maintenanceSummary.append(maintenanceHint);
  const maintenanceBody = document.createElement("div");
  maintenanceBody.className = "preview-primary-maintenance-body";
  const scriptRow = document.createElement("div");
  scriptRow.className = "preview-primary-maintenance-row";
  const scriptCopy = document.createElement("span");
  scriptCopy.append(strongText("Root 编排脚本"), smallText(autoBuildState.rootScriptStatus));
  const sync = document.createElement("button");
  sync.type = "button";
  sync.textContent = "同步";
  sync.dataset.previewOutput = "handled";
  sync.addEventListener("click", () => dispatchAutoBuildIntent("syncScript"));
  scriptRow.append(scriptCopy, sync);
  const cleanupRow = document.createElement("div");
  cleanupRow.className = "preview-primary-maintenance-row";
  const cleanupCopy = document.createElement("span");
  cleanupCopy.append(strongText("手动清理 Root"), smallText(`高风险 · ${autoBuildState.cleanupStatus}`));
  const cleanup = document.createElement("button");
  cleanup.type = "button";
  cleanup.textContent = autoBuildState.cleanupStatus === "尚未生成" ? "生成预览" : "重新生成";
  cleanup.dataset.previewOutput = "handled";
  cleanup.addEventListener("click", () => dispatchAutoBuildIntent("previewCleanup"));
  cleanupRow.append(cleanupCopy, cleanup);
  const cleanupNote = document.createElement("p");
  cleanupNote.textContent = "这里只生成匹配清单；真正删除必须显示 Root、数量并再次确认。";
  maintenanceBody.append(scriptRow, cleanupRow, cleanupNote);
  maintenance.append(maintenanceSummary, maintenanceBody);
  maintenance.addEventListener("toggle", () => {
    if (maintenance.open === autoBuildState.maintenanceExpanded) return;
    autoBuildState = Object.freeze({ ...autoBuildState, maintenanceExpanded: maintenance.open });
  });

  section.append(heading, metrics, actions, configBar, projectsTitle, targets, environment, maintenance);
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

function currentAutoBuildProject(): (typeof AUTO_BUILD_PROJECTS)[number] {
  return AUTO_BUILD_PROJECTS.find(({ id }) => id === autoBuildState.selectedProjectId) ?? AUTO_BUILD_PROJECTS[0]!;
}

type PreviewAutoBuildAction = "selectProject" | "preflight" | "toggleRun" | "openScript" | "openOutput" | "openConfig" | "saveConfig" | "syncScript" | "previewCleanup";

function dispatchAutoBuildIntent(actionId: PreviewAutoBuildAction, projectId?: string): void {
  const project = projectId
    ? AUTO_BUILD_PROJECTS.find((candidate) => candidate.id === projectId) ?? currentAutoBuildProject()
    : currentAutoBuildProject();
  if (actionId === "selectProject") {
    autoBuildState = Object.freeze({
      ...autoBuildState,
      selectedProjectId: project.id,
    });
    recordPreviewOutput(`[编译工具] 查看项目摘要：${project.title} · ${project.buildKinds}`);
  } else if (actionId === "preflight") {
    autoBuildState = Object.freeze({
      ...autoBuildState,
      status: "预检通过",
      tone: "success",
    });
    recordPreviewOutput("[编译工具] 预检通过：2 个项目，CMake 1 个，CAA 1 个，失败 0 个");
  } else if (actionId === "toggleRun" && autoBuildState.tone === "progress") {
    autoBuildState = Object.freeze({
      ...autoBuildState,
      status: "已停止",
      tone: "warning",
    });
    recordPreviewOutput("[编译工具] 已请求停止全部任务");
  } else if (actionId === "toggleRun") {
    autoBuildState = Object.freeze({
      ...autoBuildState,
      status: "运行中",
      tone: "progress",
    });
    recordPreviewOutput("[编译工具] 模拟启动：仓库门禁 → CMake → CAA（顺序执行）");
  } else if (actionId === "openScript") {
    autoBuildState = Object.freeze({
      ...autoBuildState,
      status: "脚本已定位",
      tone: "success",
    });
    recordPreviewOutput("[编译工具] 打开脚本管理（模拟）：构建 / 检出 / 版本归档");
  } else if (actionId === "openOutput") {
    setOutputVisibility(true);
    recordPreviewOutput("[编译工具] 已展开框架级输出");
  } else if (actionId === "openConfig") {
    recordPreviewOutput("[编译工具] 打开 Auto Build JSON（模拟）");
  } else if (actionId === "saveConfig") {
    recordPreviewOutput("[编译工具] 保存当前配置（模拟，未写盘）");
  } else if (actionId === "syncScript") {
    autoBuildState = Object.freeze({
      ...autoBuildState,
      rootScriptStatus: "脚本已同步",
    });
    recordPreviewOutput("[编译工具] 已模拟同步 Root 编排脚本");
  } else if (actionId === "previewCleanup") {
    autoBuildState = Object.freeze({
      ...autoBuildState,
      cleanupStatus: "预览 12 项",
    });
    recordPreviewOutput("[编译工具] 已生成 Root 清理预览：12 项；尚未删除任何文件");
  }
  if (activeSurfaceToolId === "autoBuild") renderPrimaryContent();
  renderAutoBuildRight();
}

function renderAutoBuildRight(): void {
  document.querySelectorAll<HTMLElement>("[data-auto-build-status]").forEach((element) => {
    element.textContent = autoBuildState.status;
    element.dataset.tone = autoBuildState.tone;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-auto-build-action='toggleRun']").forEach((button) => {
    button.textContent = autoBuildState.tone === "progress" ? "停止" : "运行";
  });
  document.querySelectorAll<HTMLElement>("[data-auto-build-task-status]").forEach((element) => {
    element.textContent = autoBuildState.tone === "progress" ? "进行中" : "等待";
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

function renderGroupPlaceholder(): void {
  groupPlaceholder.replaceChildren();
  const copy = GROUP_COPY[activeGroupId] ?? { title: activeGroupId, detail: "未接入原型。" };
  const title = document.createElement("h2");
  title.textContent = copy.title;
  const detail = document.createElement("p");
  detail.textContent = copy.detail;
  if (copy.title !== currentSurfaceTitle()) groupPlaceholder.append(title);
  groupPlaceholder.append(detail);
  if (activeGroupId === "ignoreSettings" || activeGroupId === "environmentSettings") {
    renderPrimaryUtility(activeGroupId);
    return;
  }
  if (PREVIEW_TOOL_CATALOG_BY_ID[activeSurfaceToolId]) {
    groupPlaceholder.replaceChildren(createToolSummary(activeSurfaceToolId));
  }
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
  groupPlaceholder.append(options, actions);
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

function closeCurrentPrimaryTool(): void {
  const current = openItems.find((candidate) => candidate.toolId === activeSurfaceToolId);
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

function defaultAutoBuildState(): PreviewAutoBuildState {
  return Object.freeze({
    selectedProjectId: "ktcore",
    status: "等待预检",
    tone: "idle",
    rootScriptStatus: "脚本一致",
    cleanupStatus: "尚未生成",
    environmentExpanded: true,
    maintenanceExpanded: false,
  });
}

function defaultUtilitySelections(): Record<UtilityToolId, boolean[]> {
  return {
    ignoreSettings: [true, true, true],
    environmentSettings: [true, true, false],
  };
}

function resetVolatilePreviewState(): void {
  autoBuildState = defaultAutoBuildState();
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
  directoryName.textContent = directoryChoices[directoryIndex] ?? directoryChoices[0]!;
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

function showRibbonMenu(): void {
  ribbonMenu.replaceChildren();
  RIBBON_ITEMS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", String(item.ribbonId === activeGroupId));
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
  ribbonMoreButton.setAttribute("aria-expanded", "true");
  const trigger = ribbonMoreButton.getBoundingClientRect();
  const menuWidth = 200;
  const menuHeight = Math.min(240, RIBBON_ITEMS.length * 30 + 38);
  ribbonMenu.style.left = `${Math.max(4, Math.min(window.innerWidth - menuWidth - 4, trigger.right - menuWidth))}px`;
  ribbonMenu.style.top = `${Math.max(4, Math.min(window.innerHeight - menuHeight - 4, trigger.bottom + 4))}px`;
  ribbonMenu.querySelector<HTMLButtonElement>("button")?.focus();
}

function hideRibbonMenu(restoreFocus = false): void {
  if (ribbonMenu.hidden) return;
  ribbonMenu.hidden = true;
  ribbonMoreButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) ribbonMoreButton.focus();
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
