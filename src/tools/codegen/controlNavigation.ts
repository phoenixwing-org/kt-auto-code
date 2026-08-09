import type { KtCodegenPlan, KtCodegenMarkerRegion } from "@phoenix-wing/kt-codegen";

export interface KtcCodegenControlLocation {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly region?: KtCodegenMarkerRegion;
}

/** 只解析当前预检计划中精确存在的命中位置，不信任 Webview 自报路径。 */
export function ktcFindCodegenControlRegion(
  plan: KtCodegenPlan | undefined,
  path: unknown,
  line: unknown,
): KtCodegenMarkerRegion | undefined {
  if (!plan || typeof path !== "string" || !Number.isInteger(line) || Number(line) < 0) {
    return undefined;
  }
  return plan.markerRegions.find((region) => region.path === path && region.start.line === line);
}

/** 命中区域和结构化诊断共用同一条不信任 Webview 路径的导航边界。 */
export function ktcFindCodegenControlLocation(
  plan: KtCodegenPlan | undefined,
  path: unknown,
  line: unknown,
): KtcCodegenControlLocation | undefined {
  if (!plan || typeof path !== "string" || !Number.isInteger(line) || Number(line) < 0) {
    return undefined;
  }
  const region = ktcFindCodegenControlRegion(plan, path, line);
  if (region) {
    return { path: region.path, line: region.start.line, column: region.start.column, region };
  }
  const diagnostic = plan.diagnostics.find((item) => (
    item.path?.file === path && item.path.row === line
  ));
  if (!diagnostic) return undefined;
  return {
    path,
    line: Number(line),
    column: Math.max(0, diagnostic.path?.column ?? 0),
  };
}
