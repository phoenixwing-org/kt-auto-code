export const KTC_CODEGEN_SOURCE_FILE_LIMIT = 5000;

/**
 * 源码检索不把业务上限传给 findFiles；先取得可取消的完整结果并应用
 * scope/Ignore，再在这里 fail closed，防止 Preflight/Apply 基于截断集合。
 */
export function ktcAssertCodegenSourceScanComplete(foundCount: number): void {
  if (foundCount <= KTC_CODEGEN_SOURCE_FILE_LIMIT) return;
  throw new Error(
    `Codegen 源码超过 ${KTC_CODEGEN_SOURCE_FILE_LIMIT} 个；请通过工作集或 Ignore 缩小范围后重新扫描。`,
  );
}
