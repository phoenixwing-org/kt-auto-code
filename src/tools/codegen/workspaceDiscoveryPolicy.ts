export const KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT = 300;

/** 单根发现不能以静默截断结果冒充完整 JSON/CSV 列表。 */
export function ktcAssertCodegenDiscoveryComplete(
  rootPath: string,
  jsonCount: number,
  csvCount: number,
): void {
  const limit = KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT;
  if (jsonCount <= limit && csvCount <= limit) return;
  const kinds = [
    jsonCount > limit ? `JSON ${jsonCount}+` : "",
    csvCount > limit ? `CSV ${csvCount}+` : "",
  ].filter(Boolean).join("、");
  throw new Error(
    `Codegen 自动发现超过单根上限 ${limit}（${rootPath}：${kinds}）；请缩小 Workspace Folder，或用“打开 JSON…”选择文件。`,
  );
}
