/**
 * 插件兼容入口；Apply 投影和换行算法由 Wing 共享实现。
 * 保留 ktc 名称，避免宿主层迁移影响既有调用方。
 */
export {
  ktCodegenNormalizeGeneratedEol as ktcNormalizeCodegenGeneratedEol,
  ktCodegenProjectApply as ktcProjectCodegenApply,
  type KtCodegenApplyChange as KtcCodegenApplyChange,
  type KtCodegenApplyProjection as KtcCodegenApplyProjection,
  type KtCodegenApplyRegionChange as KtcCodegenApplyRegionChange,
  type KtCodegenApplySource as KtcCodegenApplySource,
} from "@phoenix-wing/kt-codegen";
