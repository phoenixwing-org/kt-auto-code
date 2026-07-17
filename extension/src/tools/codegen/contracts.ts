import type { KtCodegenPlan } from "@phoenix-wing/kt-codegen";

export type KtcCodegenMetaField =
  | "namePrefix"
  | "nameMiddle"
  | "nameSpace"
  | "appendFunction";

/** 预检 Service 返回给 Document Model 的宿主无关快照。 */
export interface KtcCodegenPreflightResult {
  readonly plan: KtCodegenPlan;
  readonly reused: boolean;
  readonly createdAt: string;
  readonly markerIndexRevision: number;
  readonly indexedFileCount: number;
  readonly candidateFileCount: number;
  readonly cachePath: string;
}
