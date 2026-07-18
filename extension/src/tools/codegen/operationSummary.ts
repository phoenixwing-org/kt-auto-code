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
  readonly elapsed: string;
}): string {
  if (!input.fileCount) {
    return `Apply 完成：生成结果与源码一致，没有需要写入的变化；耗时 ${input.elapsed}。`;
  }
  if (input.receiptFailed) {
    return `Apply 完成：已修改 ${input.fileCount} 个文件、${input.regionCount} 个区域；回执缓存失败，请查看 Problems；耗时 ${input.elapsed}。`;
  }
  return `Apply 完成：已修改 ${input.fileCount} 个文件、${input.regionCount} 个区域；回执已保存；耗时 ${input.elapsed}。`;
}
