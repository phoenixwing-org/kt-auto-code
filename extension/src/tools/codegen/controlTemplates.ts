import {
  KT_CODEGEN_BLOCK_PRESENTATIONS,
  KT_CODEGEN_LEGACY_BLOCKS,
  KtCodegenMarker,
  type KtCodegenBlockKey,
  type KtCodegenParam,
  type KtCodegenPlan,
} from "@phoenix-wing/kt-codegen";

export interface KtcCodegenControlTemplate {
  readonly blockKey: KtCodegenBlockKey;
  readonly legacyId: number;
  readonly title: string;
  readonly classId: string;
  readonly nameSuffix: string;
  readonly start: string;
  readonly end: string;
}

const PRESENTATION_BY_KEY = new Map(
  KT_CODEGEN_BLOCK_PRESENTATIONS.map((item) => [item.key, item]),
);

/** 由 Wing Marker 为指定 block × 当前 Param 唯一 classId 生成稳定模板。 */
export function ktcCodegenControlTemplates(
  param: KtCodegenParam,
  blockKeys: readonly KtCodegenBlockKey[] = KT_CODEGEN_LEGACY_BLOCKS.map((block) => block.key),
): readonly KtcCodegenControlTemplate[] {
  const requested = new Set(blockKeys);
  const marker = new KtCodegenMarker();
  const classes: { classId: string; nameSuffix: string }[] = [];
  const seenClasses = new Set<string>();
  for (const item of param.items) {
    const classId = marker.createClassId(param, item.nameSuffix);
    if (seenClasses.has(classId)) continue;
    seenClasses.add(classId);
    classes.push({ classId, nameSuffix: item.nameSuffix });
  }

  return KT_CODEGEN_LEGACY_BLOCKS
    .filter((block) => requested.has(block.key))
    .flatMap((block) => classes.map(({ classId, nameSuffix }) => ({
      blockKey: block.key,
      legacyId: block.legacyId,
      title: PRESENTATION_BY_KEY.get(block.key)?.title ?? block.key,
      classId,
      nameSuffix,
      start: marker.createStart(param, nameSuffix, block.key),
      end: marker.createEnd(param, nameSuffix, block.key),
    })));
}

/** 只保留当前预检中没有成对命中的已选 block × classId。 */
export function ktcCodegenMissingControlTemplates(
  param: KtCodegenParam,
  blockKeys: readonly KtCodegenBlockKey[],
  plan: KtCodegenPlan | undefined,
): readonly KtcCodegenControlTemplate[] {
  if (!plan) return [];
  const matched = new Set(plan.markerRegions.map((region) => `${region.blockKey}\u0000${region.classId}`));
  return ktcCodegenControlTemplates(param, blockKeys)
    .filter((template) => !matched.has(`${template.blockKey}\u0000${template.classId}`));
}

/** Output Channel 使用的无副作用文本格式；返回逐行数组便于宿主直接 appendLine。 */
export function ktcCodegenControlTemplateLogLines(
  fileName: string,
  scope: "all" | "block",
  templates: readonly KtcCodegenControlTemplate[],
): readonly string[] {
  if (!templates.length) {
    return [`[Codegen][ControlTemplates][info] template.empty：当前参数表没有可输出的 classId；json=${fileName}`];
  }
  const blockCount = new Set(templates.map((template) => template.blockKey)).size;
  const classCount = new Set(templates.map((template) => template.classId)).size;
  const lines = [
    `[Codegen][ControlTemplates] scope=${scope}；blocks=${blockCount}；classes=${classCount}；templates=${templates.length}；json=${fileName}`,
  ];
  for (const template of templates) {
    lines.push(
      `# ${template.legacyId} ${template.title} · ${template.blockKey} · ${template.classId}`,
      template.start,
      template.end,
      "",
    );
  }
  return lines;
}
