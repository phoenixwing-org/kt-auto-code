/**
 * 插件兼容入口；并发复读和安全回滚事务由 Wing 共享实现。
 * VS Code 侧只提供宿主文件读写 Port。
 */
export {
  KtCodegenApplyConcurrentChangeError as KtcCodegenApplyConcurrentChangeError,
  ktCodegenCommitApplyWrites as ktcCommitCodegenApplyWrites,
  type KtCodegenApplyCommitResult as KtcCodegenApplyCommitResult,
  type KtCodegenApplyWrite as KtcCodegenApplyWrite,
  type KtCodegenApplyWritePort as KtcCodegenApplyWritePort,
} from "@phoenix-wing/kt-codegen";
