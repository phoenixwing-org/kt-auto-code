import {
  ktCodegenInspectApplyPlan,
  type KtCodegenApplyRegionChange,
  type KtCodegenDiagnostic,
  type KtCodegenPlan,
} from "@phoenix-wing/kt-codegen";

export type KtcCodegenPlanLogStage = "Apply" | "Preflight";

function prefix(stage: KtcCodegenPlanLogStage): string {
  return `[Codegen][${stage}]`;
}

/** 真实提交成功后，为单个 Wing 区域生成可定位的审计日志。 */
export function ktcCodegenAppliedRegionLog(
  path: string,
  region: KtCodegenApplyRegionChange,
): string {
  return `[Codegen][Apply][Region] 已写入 ${path}:${region.line + 1}`
    + `；block=${region.blockKey}；class=${region.classId}`
    + `；region=${region.id}；artifact=${region.artifactId}`;
}

/** 把 Wing 结构化诊断转换成 VS Code Output 可搜索的一行。 */
export function ktcCodegenApplyDiagnosticLog(
  diagnostic: KtCodegenDiagnostic,
  stage: KtcCodegenPlanLogStage = "Apply",
): string {
  const path = diagnostic.path;
  const location = path?.file
    ? `；file=${path.file}${path.row === undefined ? "" : `:${path.row + 1}`}`
    : path?.field
      ? `；field=${path.field}`
      : "";
  return `${prefix(stage)}[${diagnostic.severity}] ${diagnostic.code}：${diagnostic.message}${location}`;
}

/**
 * 输出计划审计信息。即使 Wing 没有产生 error，也会明确列出未命中的控制符，
 * 便于判断“Apply 没改文件”究竟是缺 Marker、没有 Artifact，还是内容相同。
 */
export function ktcCodegenApplyPlanLogs(
  plan: KtCodegenPlan,
  stage: KtcCodegenPlanLogStage = "Apply",
): string[] {
  const summary = ktCodegenInspectApplyPlan(plan);
  const logPrefix = prefix(stage);
  const lines = [
    `${logPrefix} blocks=${summary.blocks.length}；regions=${summary.regionCount}；artifacts=${summary.artifactCount}；diagnostics=${summary.diagnosticCount}；canApply=${summary.canApply}`,
  ];
  for (const target of summary.targets) {
    lines.push(`${logPrefix}[Target] ${target.target}；status=${target.status}；artifacts=${target.artifactCount}`);
  }
  for (const block of summary.blocks.filter((item) => item.regionCount > 0)) {
    lines.push(
      `${logPrefix}[Marker] ${block.blockKey}；regions=${block.regionCount}；artifacts=${block.artifactCount}；files=${block.paths.join("、") || "无"}`,
    );
  }
  if (summary.missingBlockKeys.length) {
    lines.push(
      `${logPrefix}[warning] marker.not-found：未找到 ${summary.missingBlockKeys.length} 个已选控制符：${summary.missingBlockKeys.join("、")}`,
    );
  }
  if (summary.blocksWithoutArtifacts.length) {
    lines.push(
      `${logPrefix}[warning] apply.marker-without-artifact：${summary.blocksWithoutArtifacts.length} 个控制符已有区域但没有生成产物：${summary.blocksWithoutArtifacts.join("、")}`,
    );
  }
  lines.push(...plan.diagnostics.map((diagnostic) => ktcCodegenApplyDiagnosticLog(diagnostic, stage)));
  return lines;
}
