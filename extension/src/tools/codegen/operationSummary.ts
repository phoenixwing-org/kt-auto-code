export function ktcCodegenCandidateScanSummary(input: {
  readonly rootCount: number;
  readonly indexedFileCount: number;
  readonly candidateCount: number;
  readonly elapsed: string;
}): string {
  return `候选扫描完成：${input.rootCount} 个工作区根，扫描 ${input.indexedFileCount} 个源码文件，命中 ${input.candidateCount} 个控制符候选；耗时 ${input.elapsed}。`;
}

export function ktcCodegenPreflightSummary(input: {
  readonly reused: boolean;
  readonly indexedFileCount: number;
  readonly candidateFileCount: number;
  readonly regionCount: number;
  readonly artifactCount: number;
  readonly diagnosticCount: number;
  readonly elapsed: string;
}): string {
  return `${input.reused ? "复用缓存" : "生成新计划"}：扫描 ${input.indexedFileCount} 个源码文件，候选 ${input.candidateFileCount} 个，命中 ${input.regionCount} 个区域，生成 ${input.artifactCount} 个产物，${input.diagnosticCount} 条诊断；耗时 ${input.elapsed}。`;
}

export function ktcCodegenApplySummary(input: {
  readonly fileCount: number;
  readonly regionCount: number;
  readonly receiptFailed: boolean;
  readonly preflightErrorCount?: number;
  readonly elapsed: string;
}): string {
  const errors = input.preflightErrorCount ?? 0;
  const prefix = errors ? "Apply 部分完成" : "Apply 完成";
  const errorSummary = errors ? `；${errors} 条预检错误对应内容未写入，请查看 Problems` : "";
  if (!input.fileCount) {
    return `${prefix}：安全区域的生成结果与源码一致，没有需要写入的变化${errorSummary}；耗时 ${input.elapsed}。`;
  }
  if (input.receiptFailed) {
    return `${prefix}：已修改 ${input.fileCount} 个文件、${input.regionCount} 个区域${errorSummary}；回执缓存失败，请查看 Problems；耗时 ${input.elapsed}。`;
  }
  return `${prefix}：已修改 ${input.fileCount} 个文件、${input.regionCount} 个区域${errorSummary}；回执已保存；耗时 ${input.elapsed}。`;
}
