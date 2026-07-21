export type KtcCadDetailToolId =
  | "cadFilename"
  | "cadScan"
  | "cadRead"
  | "cadQuery"
  | "cadDiagnostics";

export interface KtcCadDetailTool {
  readonly id: KtcCadDetailToolId;
  readonly title: string;
  readonly summary: string;
  readonly requirement: "none" | "desk-provider" | "optional-desk-provider" | "workspace-database";
}

export const KTC_CAD_DETAIL_TOOLS: readonly KtcCadDetailTool[] = Object.freeze([
  {
    id: "cadFilename",
    title: "CAD 文件名语义",
    summary: "分析当前 FCStd 文件名中的文档类型、零件号与名称。",
    requirement: "none",
  },
  {
    id: "cadScan",
    title: "检索工作区 FCStd",
    summary: "扫描 FCStd，并用 TypeScript 创建或更新 SQLite 文件索引。",
    requirement: "none",
  },
  {
    id: "cadRead",
    title: "读取 FCStd 内容",
    summary: "TS 轻量读取直接可用；Desk Tools 可选提供深度对象分析。",
    requirement: "optional-desk-provider",
  },
  {
    id: "cadQuery",
    title: "查询 BOM 与引用",
    summary: "只读查询 TS 轻量索引生成的基础 BOM 与引用。",
    requirement: "workspace-database",
  },
  {
    id: "cadDiagnostics",
    title: "CAD 能力诊断",
    summary: "汇总 Shell、TypeScript 能力、数据库与本机程序状态。",
    requirement: "none",
  },
]);

export function ktcGetCadDetailTool(toolId: string): KtcCadDetailTool {
  return KTC_CAD_DETAIL_TOOLS.find((tool) => tool.id === toolId) ?? KTC_CAD_DETAIL_TOOLS[0]!;
}
