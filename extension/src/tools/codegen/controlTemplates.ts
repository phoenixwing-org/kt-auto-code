import {
  KT_CODEGEN_BLOCK_PRESENTATIONS,
  KT_CODEGEN_LEGACY_BLOCKS,
  type KtCodegenController,
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
  /** 当前已打开 JSON session 经 Wing Renderer 生成的完整控制块（含 Start/End）。 */
  readonly content?: string;
}

/** 首次布点时可直接粘贴的空控制块，空行与现有 CAA 源码保持一致。 */
export function ktcCodegenEmptyControlTemplateContent(
  template: Pick<KtcCodegenControlTemplate, "start" | "end">,
): string {
  return [
    template.start,
    "",
    "// clang-format off",
    "",
    "#error \"Run KT Auto Code Apply to generate this block\"",
    "",
    "// clang-format on",
    template.end,
  ].join("\n");
}

/** 剪贴板只包含可粘贴源码，不包含 Output 协议摘要和人类可读标题。 */
export function ktcCodegenControlTemplateClipboardText(
  templates: readonly KtcCodegenControlTemplate[],
): string {
  return templates
    .map((template) => template.content?.trimEnd() ?? ktcCodegenEmptyControlTemplateContent(template))
    .join("\n\n");
}

/**
 * 日志输出规则：有当前 JSON Controller 时用真实 Param 生成 artifact；没有打开
 * session/controller 时退化为只有 Start/End 的空框架，不能伪造业务代码。
 */
export function ktcCodegenControlTemplatesForOutput(
  param: KtCodegenParam,
  blockKeys: readonly KtCodegenBlockKey[],
  controller?: Pick<KtCodegenController, "analyze">,
): readonly KtcCodegenControlTemplate[] {
  const templates = ktcCodegenControlTemplates(param, blockKeys);
  if (!controller || !templates.length) return templates;

  const requested = new Set(blockKeys);
  const targets = [...new Set(KT_CODEGEN_LEGACY_BLOCKS
    .filter((block) => requested.has(block.key))
    .map((block) => block.target))];
  const path = "__kt_auto_code_control_templates__.cpp";
  const text = templates
    .flatMap((template) => [template.start, template.end, ""])
    .join("\n");
  const plan = controller.analyze({
    targets,
    blockKeys,
    snapshot: {
      files: [{
        path,
        text,
        fingerprint: "kt.codegen.control-template.session",
        encoding: "utf8",
        eol: "lf",
      }],
    },
  });
  const artifacts = new Map(
    plan.artifacts.map((artifact) => [`${artifact.blockKey}\u0000${artifact.classId}`, artifact]),
  );
  return templates.map((template) => {
    const artifact = artifacts.get(`${template.blockKey}\u0000${template.classId}`);
    return artifact ? { ...template, content: artifact.content } : template;
  });
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
  scope: "all" | "visible" | "block",
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
    lines.push(`# ${template.legacyId} ${template.title} · ${template.blockKey} · ${template.classId}`);
    if (template.content) lines.push(template.content.trimEnd());
    else lines.push(ktcCodegenEmptyControlTemplateContent(template));
    lines.push("");
  }
  return lines;
}
