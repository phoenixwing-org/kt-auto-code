import { describe, expect, it } from "vitest";
import {
  KT_CODEGEN_LEGACY_BLOCKS,
  KtCodegenController,
  KtCodegenItem,
  KtCodegenParam,
  type KtCodegenPlan,
} from "@phoenix-wing/kt-codegen";
import {
  ktcCodegenControlTemplateClipboardText,
  ktcCodegenControlTemplateLogLines,
  ktcCodegenControlTemplates,
  ktcCodegenControlTemplatesForOutput,
  ktcCodegenMissingControlTemplates,
} from "./controlTemplates.js";

function createParam(): KtCodegenParam {
  return new KtCodegenParam({
    namePrefix: "CAT",
    nameMiddle: "Demo",
    items: [
      new KtCodegenItem({ nameSuffix: "Base" }),
      new KtCodegenItem({ nameSuffix: "Base" }),
      new KtCodegenItem({ nameSuffix: "Feature" }),
    ],
  });
}

describe("Codegen control templates", () => {
  it("按 32 个 legacy block × 去重 classId 生成 Wing 原文", () => {
    const templates = ktcCodegenControlTemplates(createParam());
    expect(templates).toHaveLength(KT_CODEGEN_LEGACY_BLOCKS.length * 2);
    expect(templates[0]).toMatchObject({
      blockKey: KT_CODEGEN_LEGACY_BLOCKS[0]!.key,
      classId: "CATDemoBase",
    });
    expect(templates[0]!.start).toBe(
      `// START KEVIN CAA WIZARD SECTION CATDemoBase ${KT_CODEGEN_LEGACY_BLOCKS[0]!.key}`,
    );
    expect(templates[0]!.end).toBe(
      `// END KEVIN CAA WIZARD SECTION CATDemoBase ${KT_CODEGEN_LEGACY_BLOCKS[0]!.key}`,
    );
  });

  it("单项输出不泄漏其他 block，日志保持稳定摘要", () => {
    const key = KT_CODEGEN_LEGACY_BLOCKS[4]!.key;
    const templates = ktcCodegenControlTemplates(createParam(), [key]);
    const lines = ktcCodegenControlTemplateLogLines("Demo.json", "block", templates);
    expect(templates).toHaveLength(2);
    expect(new Set(templates.map((item) => item.blockKey))).toEqual(new Set([key]));
    expect(lines[0]).toContain("scope=block；blocks=1；classes=2；templates=2");
    expect(lines.join("\n")).toContain(`CATDemoFeature ${key}`);
  });

  it("缺失模板只排除预检已命中的 block × classId，无 artifact 仍可输出", () => {
    const key = KT_CODEGEN_LEGACY_BLOCKS[0]!.key;
    const plan = {
      markerRegions: [{ blockKey: key, classId: "CATDemoBase" }],
      artifacts: [],
    } as unknown as KtCodegenPlan;
    const templates = ktcCodegenMissingControlTemplates(createParam(), [key], plan);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.classId).toBe("CATDemoFeature");
    expect(templates[0]!.start).toContain("START KEVIN CAA WIZARD SECTION");
  });

  it("没有参数行时返回可解释的空输出，不伪造 classId", () => {
    const templates = ktcCodegenControlTemplates(new KtCodegenParam());
    expect(templates).toEqual([]);
    expect(ktcCodegenControlTemplateLogLines("Empty.json", "all", templates)).toEqual([
      "[Codegen][ControlTemplates][info] template.empty：当前参数表没有可输出的 classId；json=Empty.json",
    ]);
  });

  it("已打开 JSON session 时输出 Wing Renderer 的真实控制块，无 session 时只输出空框架", () => {
    const controller = new KtCodegenController();
    controller.param.namePrefix = "PNX";
    controller.param.nameMiddle = "1";
    controller.param.items.push(new KtCodegenItem({
      nameSuffix: "CombinedCurve",
      id: 1,
      name: "Curve",
      paramString: "curve",
      dataType: "CATBaseUnknown",
    }));
    const key = "PARAM DECLARATION" as const;

    const sessionTemplates = ktcCodegenControlTemplatesForOutput(
      controller.param,
      [key],
      controller,
    );
    const sessionLog = ktcCodegenControlTemplateLogLines("PNX1Param.json", "block", sessionTemplates).join("\n");
    expect(sessionLog).toContain("# 11 PARAM define · PARAM DECLARATION · PNX1CombinedCurve");
    expect(sessionLog).toContain("// START KEVIN CAA WIZARD SECTION PNX1CombinedCurve PARAM DECLARATION");
    expect(sessionLog).toContain("CATBaseUnknown curve;");
    expect(sessionLog).toContain("// END KEVIN CAA WIZARD SECTION PNX1CombinedCurve PARAM DECLARATION");

    const unopenedTemplates = ktcCodegenControlTemplatesForOutput(controller.param, [key]);
    const unopenedLog = ktcCodegenControlTemplateLogLines("PNX1Param.json", "block", unopenedTemplates).join("\n");
    expect(unopenedLog).toContain(
      "// START KEVIN CAA WIZARD SECTION PNX1CombinedCurve PARAM DECLARATION\n"
      + "\n// clang-format off\n\n#error \"Run KT Auto Code Apply to generate this block\"\n\n// clang-format on\n"
      + "// END KEVIN CAA WIZARD SECTION PNX1CombinedCurve PARAM DECLARATION",
    );
    expect(unopenedLog).not.toContain("CATBaseUnknown curve;");
    expect(unopenedLog).toContain("#error \"Run KT Auto Code Apply to generate this block\"");
    const unopenedClipboard = ktcCodegenControlTemplateClipboardText(unopenedTemplates);
    expect(unopenedClipboard).toContain("#error \"Run KT Auto Code Apply to generate this block\"");
    expect(unopenedClipboard).not.toContain("[Codegen]");

    const clipboard = ktcCodegenControlTemplateClipboardText(sessionTemplates);
    expect(clipboard).toContain("CATBaseUnknown curve;");
    expect(clipboard).not.toContain("[Codegen]");
    expect(clipboard).not.toContain("# 11");
  });

  it("全部输出让 32 个 legacy block 都由当前 session Renderer 生成", () => {
    const controller = new KtCodegenController();
    controller.param.namePrefix = "PNX";
    controller.param.nameMiddle = "1";
    controller.param.items.push(new KtCodegenItem({
      nameSuffix: "CombinedCurve",
      id: 1,
      name: "Curve",
      paramString: "curve",
      dataType: "CATBaseUnknown",
    }));

    const templates = ktcCodegenControlTemplatesForOutput(
      controller.param,
      KT_CODEGEN_LEGACY_BLOCKS.map((block) => block.key),
      controller,
    );
    expect(templates).toHaveLength(32);
    expect(templates.every((template) => Boolean(template.content))).toBe(true);
    expect(new Set(templates.map((template) => template.blockKey))).toEqual(
      new Set(KT_CODEGEN_LEGACY_BLOCKS.map((block) => block.key)),
    );
    expect(ktcCodegenControlTemplateClipboardText(templates)).not.toContain(
      "Run KT Auto Code Apply to generate this block",
    );
  });
});
