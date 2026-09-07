import {
  KTC_CODE_ASSISTANT_NAVIGATION,
  KTC_CODE_ASSISTANT_TOOL_ICONS,
} from "../../src/tools/codeAssistant/navigation.js";
import type { KtcToolNavigatorNode } from "../../src/ui/KtcToolNavigatorModel.js";

export type PreviewPrimarySurface =
  | { readonly kind: "full" }
  | { readonly kind: "companion" };

export interface PreviewRightSurface {
  readonly panelId: string;
}

export type PreviewToolSurfaces =
  | {
      readonly primary: { readonly kind: "full" };
      readonly right?: PreviewRightSurface;
    }
  | {
      readonly primary: { readonly kind: "companion" };
      readonly right: PreviewRightSurface;
    };

export type PreviewToolInstancePolicy =
  | { readonly kind: "single" }
  | { readonly kind: "multiple" };

export interface PreviewToolDescriptor {
  readonly toolId: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly description: string;
  readonly icon: string;
  readonly groupId: string;
  readonly instancePolicy: PreviewToolInstancePolicy;
  readonly surfaces: PreviewToolSurfaces;
}

export interface PreviewToolNavigationGroup {
  readonly kind: "group";
  readonly groupId: string;
  readonly children: readonly PreviewToolNavigationNode[];
}

export interface PreviewToolNavigationLeaf {
  readonly kind: "tool";
  readonly toolId: string;
}

/**
 * The prototype navigation tree deliberately owns no display copy or hosting
 * decision. Groups navigate and leaves reference one catalog toolId.
 */
export type PreviewToolNavigationNode = PreviewToolNavigationGroup | PreviewToolNavigationLeaf;

export interface PreviewToolCatalogValidationResult {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly toolCount: number;
}

export type PreviewToolCatalogIndex = Readonly<Record<string, PreviewToolDescriptor>>;

const RAW_PREVIEW_TOOL_CATALOG: readonly unknown[] = [
  {
    toolId: "ignoreSettings",
    title: "Ignore 管理",
    shortTitle: "Ignore",
    description: "统一检查插件、Git 与 Phoenix 忽略",
    icon: "exclude",
    groupId: "ignoreSettings",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "environmentSettings",
    title: "设置",
    shortTitle: "设置",
    description: "工作区策略与本机工具配置",
    icon: "settings",
    groupId: "environmentSettings",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "git",
    title: "Git",
    shortTitle: "Git",
    description: "仓库、分支与提交操作",
    icon: "git",
    groupId: "git",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "run",
    title: "Run",
    shortTitle: "Run",
    description: "运行配置与状态",
    icon: "play",
    groupId: "run",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "reorderMembers",
    title: "C++ 成员排序",
    shortTitle: "成员排序",
    description: "Primary 内的紧凑操作与结果",
    icon: KTC_CODE_ASSISTANT_TOOL_ICONS.reorderMembers,
    groupId: "codeAssistant",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "headerAscii",
    title: "头文件 ASCII 修正",
    shortTitle: "ASCII 修正",
    description: "Primary 内预检问题字节",
    icon: KTC_CODE_ASSISTANT_TOOL_ICONS.headerAscii,
    groupId: "codeAssistant",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "encodingFix",
    title: "编码修正",
    shortTitle: "编码修正",
    description: "Primary 内检查项目编码",
    icon: KTC_CODE_ASSISTANT_TOOL_ICONS.encodingFix,
    groupId: "codeAssistant",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "uuidReplace",
    title: "UUID 替换",
    shortTitle: "UUID",
    description: "Primary 内扫描映射并确认",
    icon: KTC_CODE_ASSISTANT_TOOL_ICONS.uuidReplace,
    groupId: "codeAssistant",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "caaDialog",
    title: "CAA UI",
    shortTitle: "CAA UI",
    description: "Primary 摘要与 Desk Tools 联动",
    icon: KTC_CODE_ASSISTANT_TOOL_ICONS.caaDialog,
    groupId: "codeAssistant",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" } },
  },
  {
    toolId: "projectRename",
    title: "项目改名",
    shortTitle: "项目改名",
    description: "复杂项目分析与写盘前 Diff",
    icon: "search",
    groupId: "replace",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "companion" }, right: { panelId: "projectRename" } },
  },
  {
    toolId: "packageIncludes",
    title: "头文件引用修正",
    shortTitle: "头文件修正",
    description: "在 Right UI 中预览 include 修正",
    icon: KTC_CODE_ASSISTANT_TOOL_ICONS.packageIncludes,
    groupId: "codeAssistant",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "companion" }, right: { panelId: "packageIncludes" } },
  },
  {
    toolId: "autoBuild",
    title: "编译工具",
    shortTitle: "编译",
    description: "Primary 选择目标与运行；Right UI 配置环境并查看长日志",
    icon: KTC_CODE_ASSISTANT_TOOL_ICONS.autoBuild,
    groupId: "codeAssistant",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "full" }, right: { panelId: "autoBuild" } },
  },
  {
    toolId: "codegen",
    title: "自动代码",
    shortTitle: "自动代码",
    description: "在 Right UI 中配置生成并由 Primary 显示摘要",
    icon: "sliders",
    groupId: "codegen",
    instancePolicy: { kind: "single" },
    surfaces: { primary: { kind: "companion" }, right: { panelId: "codegen" } },
  },
];

/**
 * Converts the current Code Assistant tree into the prototype's deliberately
 * small navigation contract. Labels, descriptions, icons and surface ownership
 * remain single-sourced in the catalog.
 */
export function toPreviewToolNavigation(
  nodes: readonly KtcToolNavigatorNode[],
): readonly PreviewToolNavigationNode[] {
  return Object.freeze(nodes.map((node): PreviewToolNavigationNode => {
    if (node.kind === "tool") {
      return Object.freeze({ kind: "tool", toolId: node.toolId });
    }
    return Object.freeze({
      kind: "group",
      groupId: node.id,
      children: toPreviewToolNavigation(node.children),
    });
  }));
}

export function previewToolIdsFromNavigation(
  nodes: readonly PreviewToolNavigationNode[],
): readonly string[] {
  return nodes.flatMap((node) => (
    node.kind === "tool" ? [node.toolId] : previewToolIdsFromNavigation(node.children)
  ));
}

/**
 * Validates an arbitrary value at the prototype boundary. Passing navigation
 * also checks that every leaf resolves to exactly one catalog entry.
 */
export function validatePreviewToolCatalog(
  value: unknown,
  navigation: readonly PreviewToolNavigationNode[] = [],
): PreviewToolCatalogValidationResult {
  const issues: string[] = [];
  if (!Array.isArray(value)) {
    return { valid: false, issues: ["tool catalog must be an array"], toolCount: 0 };
  }

  const toolIds = new Set<string>();
  const rightPanelIds = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const context = `tool catalog #${index + 1}`;
    if (!isRecord(candidate)) {
      issues.push(`${context}: descriptor must be an object`);
      continue;
    }

    const toolId = requiredNonEmptyString(candidate, "toolId", context, issues);
    requiredNonEmptyString(candidate, "title", context, issues);
    requiredNonEmptyString(candidate, "shortTitle", context, issues);
    requiredNonEmptyString(candidate, "description", context, issues);
    requiredNonEmptyString(candidate, "icon", context, issues);
    requiredNonEmptyString(candidate, "groupId", context, issues);
    validateInstancePolicy(candidate.instancePolicy, context, issues);
    const rightPanelId = validateSurfaces(candidate.surfaces, context, issues);
    if (toolId) {
      if (toolIds.has(toolId)) issues.push(`${context}: duplicate toolId ${toolId}`);
      else toolIds.add(toolId);
    }
    if (rightPanelId) {
      if (rightPanelIds.has(rightPanelId)) {
        issues.push(`${context}: duplicate right panelId ${rightPanelId}`);
      } else {
        rightPanelIds.add(rightPanelId);
      }
    }
  }

  const navigationToolIds = new Set<string>();
  for (const toolId of previewToolIdsFromNavigation(navigation)) {
    if (navigationToolIds.has(toolId)) issues.push(`navigation: duplicate toolId ${toolId}`);
    else navigationToolIds.add(toolId);
    if (!toolIds.has(toolId)) issues.push(`navigation: missing catalog entry for ${toolId}`);
  }

  return { valid: issues.length === 0, issues, toolCount: value.length };
}

export function parsePreviewToolCatalog(
  value: unknown,
  navigation: readonly PreviewToolNavigationNode[] = [],
): readonly PreviewToolDescriptor[] {
  const validation = validatePreviewToolCatalog(value, navigation);
  if (!validation.valid) throw new Error(validation.issues.join("\n"));

  return Object.freeze((value as readonly PreviewToolDescriptor[]).map((descriptor) => Object.freeze({
    toolId: descriptor.toolId,
    title: descriptor.title,
    shortTitle: descriptor.shortTitle,
    description: descriptor.description,
    icon: descriptor.icon,
    groupId: descriptor.groupId,
    instancePolicy: Object.freeze({ kind: descriptor.instancePolicy.kind }),
    surfaces: freezeSurfaces(descriptor.surfaces),
  })));
}

export const PREVIEW_TOOL_NAVIGATION = toPreviewToolNavigation(KTC_CODE_ASSISTANT_NAVIGATION);

export const PREVIEW_TOOL_CATALOG = parsePreviewToolCatalog(
  RAW_PREVIEW_TOOL_CATALOG,
  PREVIEW_TOOL_NAVIGATION,
);

/** Direct lookup projection for renderers; registrations remain an ordered list. */
export const PREVIEW_TOOL_CATALOG_BY_ID: PreviewToolCatalogIndex = Object.freeze(
  Object.fromEntries(PREVIEW_TOOL_CATALOG.map((descriptor) => [descriptor.toolId, descriptor])),
);

export function resolvePreviewTool(
  toolId: string,
  catalog: readonly PreviewToolDescriptor[] = PREVIEW_TOOL_CATALOG,
): PreviewToolDescriptor | undefined {
  if (catalog === PREVIEW_TOOL_CATALOG) return PREVIEW_TOOL_CATALOG_BY_ID[toolId];
  return catalog.find((descriptor) => descriptor.toolId === toolId);
}

function validateInstancePolicy(
  value: unknown,
  context: string,
  issues: string[],
): void {
  if (!isRecord(value)) {
    issues.push(`${context}: instancePolicy must be an object`);
    return;
  }
  if (value.kind !== "single" && value.kind !== "multiple") {
    issues.push(`${context}: instancePolicy kind must be single or multiple`);
  }
}

function validateSurfaces(
  value: unknown,
  context: string,
  issues: string[],
): string | undefined {
  if (!isRecord(value)) {
    issues.push(`${context}: surfaces must be an object`);
    return undefined;
  }

  const hasPrimary = value.primary !== undefined;
  const hasRight = value.right !== undefined;
  if (!hasPrimary) {
    issues.push(`${context}: primary surface is required`);
  }

  let primaryKind: unknown;
  if (hasPrimary) {
    if (!isRecord(value.primary)) {
      issues.push(`${context} primary surface: must be an object`);
    } else {
      primaryKind = value.primary.kind;
      if (primaryKind !== "full" && primaryKind !== "companion") {
        issues.push(`${context} primary surface: kind must be full or companion`);
      }
    }
  }

  let rightPanelId: string | undefined;
  if (hasRight) {
    if (!isRecord(value.right)) {
      issues.push(`${context} right surface: must be an object`);
    } else {
      rightPanelId = requiredNonEmptyString(
        value.right,
        "panelId",
        `${context} right surface`,
        issues,
      );
    }
  }

  if (primaryKind === "companion" && !hasRight) {
    issues.push(`${context}: companion primary surface requires a right surface`);
  }

  return rightPanelId;
}

function freezeSurfaces(surfaces: PreviewToolSurfaces): PreviewToolSurfaces {
  if (surfaces.primary.kind === "full") {
    const right = surfaces.right;
    return Object.freeze({
      primary: Object.freeze({ kind: "full" as const }),
      ...(right ? { right: Object.freeze({ panelId: right.panelId }) } : {}),
    });
  }
  const right = surfaces.right;
  if (!right) throw new Error("companion primary surface requires a right surface");
  return Object.freeze({
    primary: Object.freeze({ kind: "companion" as const }),
    right: Object.freeze({ panelId: right.panelId }),
  });
}

function requiredNonEmptyString(
  value: Record<string, unknown>,
  key: string,
  context: string,
  issues: string[],
): string | undefined {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    issues.push(`${context}: ${key} must be a non-empty string`);
    return;
  }
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
