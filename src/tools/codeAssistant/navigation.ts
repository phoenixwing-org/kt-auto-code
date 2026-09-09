import type {
  KtcToolNavigatorNode,
  KtcToolNavigatorToolNode,
} from "../../ui/KtcToolNavigatorModel.js";
import { ktcRequireToolRegistration } from "../toolRegistrationCatalog.js";

/** Shared semantic icon identifiers for every Code Assistant leaf projection. */
export const KTC_CODE_ASSISTANT_TOOL_ICONS = Object.freeze({
  autoBuild: codeAssistantTool("autoBuild", "auto-build").icon,
  packageIncludes: codeAssistantTool("packageIncludes", "package-includes").icon,
  reorderMembers: codeAssistantTool("reorderMembers", "reorder-members").icon,
  headerAscii: codeAssistantTool("headerAscii", "header-ascii").icon,
  encodingFix: codeAssistantTool("encodingFix", "encoding-fix").icon,
  uuidReplace: codeAssistantTool("uuidReplace", "uuid-replace").icon,
  caaDialog: codeAssistantTool("caaDialog", "caa-dialog").icon,
} as const);

/**
 * Code Assistant is the first consumer of the framework-level Tool Navigator.
 * Navigation contains no executable action: every leaf only references the
 * existing tool activation runtime by toolId.
 */
export const KTC_CODE_ASSISTANT_NAVIGATION: readonly KtcToolNavigatorNode[] = Object.freeze([
  {
    kind: "group",
    id: "cpp-organize",
    label: "C++ 整理",
    children: [
      {
        ...codeAssistantTool("autoBuild", "auto-build"),
      },
      {
        ...codeAssistantTool("packageIncludes", "package-includes"),
      },
      {
        ...codeAssistantTool("reorderMembers", "reorder-members"),
      },
      {
        ...codeAssistantTool("headerAscii", "header-ascii"),
      },
    ],
  },
  {
    kind: "group",
    id: "file-tools",
    label: "文件工具",
    children: [
      {
        ...codeAssistantTool("encodingFix", "encoding-fix"),
      },
      {
        ...codeAssistantTool("uuidReplace", "uuid-replace"),
      },
    ],
  },
  {
    kind: "group",
    id: "caa",
    label: "CAA",
    children: [
      {
        ...codeAssistantTool("caaDialog", "caa-dialog"),
      },
    ],
  },
]);

function codeAssistantTool(toolId: string, id: string): KtcToolNavigatorToolNode {
  const metadata = ktcRequireToolRegistration(toolId);
  if (metadata.groupId !== "codeAssistant") {
    throw new Error(`工具 ${toolId} 不属于 codeAssistant：${metadata.groupId}`);
  }
  if (!isToolNavigatorIcon(metadata.icon)) {
    throw new Error(`工具 ${toolId} 的 Navigator 图标无效：${metadata.icon}`);
  }
  return Object.freeze({
    kind: "tool",
    id,
    toolId: metadata.toolId,
    label: metadata.title,
    description: metadata.description,
    icon: metadata.icon,
  });
}

function isToolNavigatorIcon(icon: string): icon is NonNullable<KtcToolNavigatorToolNode["icon"]> {
  return icon === "build" || icon === "file" || icon === "sort" || icon === "uuid";
}
