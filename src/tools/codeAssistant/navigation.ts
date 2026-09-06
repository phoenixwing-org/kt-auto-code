import type { KtcToolNavigatorNode } from "../../ui/KtcToolNavigatorModel.js";

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
        kind: "tool",
        id: "auto-build",
        toolId: "autoBuild",
        label: "编译工具",
        description: "CAA / MSVC 批量构建",
        icon: "build",
      },
      {
        kind: "tool",
        id: "package-includes",
        toolId: "packageIncludes",
        label: "头文件引用修正",
        description: "平铺 include → <KtCore/...>",
        icon: "file",
      },
      {
        kind: "tool",
        id: "reorder-members",
        toolId: "reorderMembers",
        label: "C++ 成员排序",
        description: "扫描、预览并确认写回",
        icon: "sort",
      },
      {
        kind: "tool",
        id: "header-ascii",
        toolId: "headerAscii",
        label: "头文件 ASCII 修正",
        description: "预检并修正问题字节",
        icon: "file",
      },
    ],
  },
  {
    kind: "group",
    id: "file-tools",
    label: "文件工具",
    children: [
      {
        kind: "tool",
        id: "encoding-fix",
        toolId: "encodingFix",
        label: "编码修正",
        description: "检查并无损转换项目编码",
        icon: "file",
      },
      {
        kind: "tool",
        id: "uuid-replace",
        toolId: "uuidReplace",
        label: "UUID 替换",
        description: "扫描映射并确认写入",
        icon: "uuid",
      },
    ],
  },
  {
    kind: "group",
    id: "caa",
    label: "CAA",
    children: [
      {
        kind: "tool",
        id: "caa-dialog",
        toolId: "caaDialog",
        label: "CAA UI",
        description: "扫描 CATDlg 并连接 Desk Tools",
        icon: "file",
      },
    ],
  },
]);
