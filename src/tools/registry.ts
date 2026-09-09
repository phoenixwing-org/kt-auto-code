import type { KtTool, KtcNavigationDescriptor } from "./types.js";
import {
  KTC_TOOL_REGISTRATION_BY_ID,
  ktcRequireToolRegistration,
} from "./toolRegistrationCatalog.js";

const tools: KtTool[] = [];
const navigationDescriptors: KtcNavigationDescriptor[] = [];
const catalogApplied = new WeakSet<KtTool>();

export function registerTool(tool: KtTool): void {
  if (getTool(tool.id) || getNavigationDescriptor(tool.id)) {
    throw new Error(`Duplicate KT Auto Code tool id: ${tool.id}`);
  }
  applyCatalogDisplayMetadata(tool);
  tools.push(tool);
}

/** Production composition-root gate: every built-in Tool must be declared in the versioned catalog. */
export function registerBuiltInTool(tool: KtTool): void {
  ktcRequireToolRegistration(tool.id);
  registerTool(tool);
}

export function registerNavigationDescriptor(descriptor: KtcNavigationDescriptor): void {
  if (getTool(descriptor.id) || getNavigationDescriptor(descriptor.id)) {
    throw new Error(`Duplicate KT Auto Code navigation id: ${descriptor.id}`);
  }
  const metadata = ktcRequireToolRegistration(descriptor.id);
  navigationDescriptors.push(Object.freeze({
    ...descriptor,
    title: metadata.title,
    shortTitle: metadata.shortTitle,
    description: metadata.description,
  }));
}

export function getTools(): readonly KtTool[] {
  return tools;
}

export function getTool(id: string): KtTool | undefined {
  return tools.find((t) => t.id === id);
}

export function getNavigationDescriptors(): readonly KtcNavigationDescriptor[] {
  return navigationDescriptors;
}

export function getNavigationDescriptor(id: string): KtcNavigationDescriptor | undefined {
  return navigationDescriptors.find((descriptor) => descriptor.id === id);
}

/** Clears one deactivated Extension Host catalog without weakening duplicate checks during activation. */
export function clearRegisteredTools(): void {
  tools.length = 0;
  navigationDescriptors.length = 0;
}

/**
 * Makes the versioned registration catalog authoritative for every formal
 * KtTool and for the ToolSummary consumed by Primary surfaces. Asset-backed
 * icons and all behavioral callbacks remain owned by the tool implementation.
 */
function applyCatalogDisplayMetadata(tool: KtTool): void {
  const metadata = KTC_TOOL_REGISTRATION_BY_ID[tool.id];
  if (!metadata) return;
  if (catalogApplied.has(tool)) return;

  const mutableTool = tool as KtTool & {
    title: string;
    shortTitle?: string;
    description: string;
    getPanelModel: KtTool["getPanelModel"];
  };
  const originalGetPanelModel = tool.getPanelModel;
  mutableTool.title = metadata.title;
  mutableTool.shortTitle = metadata.shortTitle;
  mutableTool.description = metadata.description;
  mutableTool.getPanelModel = function getCatalogPanelModel() {
    const model = originalGetPanelModel.call(this);
    return {
      ...model,
      summary: {
        ...model.summary,
        id: metadata.toolId,
        title: metadata.title,
        shortTitle: metadata.shortTitle,
        description: metadata.description,
        icon: model.summary.icon ?? this.icon,
      },
    };
  };
  catalogApplied.add(tool);
}
