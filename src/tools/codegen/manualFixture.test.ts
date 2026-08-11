import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { KtCodegenController } from "@phoenix-wing/kt-codegen";

const fixtureRoot = new URL("../../../tests/fixtures/codegen-manual-workspace/", import.meta.url);
const LEGACY_PANEL_CSV = `NameSuffix,ID,Name,ParamString,DataType,TCKind,DefaultValue,CATAttrInOut,IsList,IsOnTree,Component,Count,IsParamDlg,Unit,Author,CreateDate,Notes
Item,1,Legacy Enabled,LegacyEnabled,bool,Boolean,true,In,0,1,QCheckBox,1,1,,Manual QA,2026-07-16,CSV conversion input
Item,2,Legacy Title,LegacyTitle,CATUnicodeString,String,,InOut,0,1,QLineEdit,1,1,,Manual QA,2026-07-16,CSV conversion input
$NamePrefix,PNX,the prefix
$NameMiddle,LegacyPanel,the middle name
$NameSpace,PNX,the namespace
$AppendFunction,push_back,the append function name
`;

function text(path: string): string {
  return readFileSync(new URL(path, fixtureRoot), "utf8");
}

describe("Codegen manual QA fixture", () => {
  it("提供根目录、嵌套目录两份有效 JSON 和一份负样例", () => {
    const root = new KtCodegenController();
    const nested = new KtCodegenController();
    const empty = new KtCodegenController();
    expect(root.readJson(text("PNXWidgetParam.json")).ok).toBe(true);
    expect(nested.readJson(text("config/KtCourseGuardParam.json")).ok).toBe(true);
    expect(empty.readJson(text("config/EmptyParam.json")).ok).toBe(true);
    expect(`${root.param.namePrefix}${root.param.nameMiddle}`).toBe("PNXWidget");
    expect(`${nested.param.namePrefix}${nested.param.nameMiddle}`).toBe("KtCourseGuard");
    expect(root.param.items).toHaveLength(3);
    expect(nested.param.items).toHaveLength(2);
    expect(empty.param.items).toHaveLength(0);

    const negative = new KtCodegenController();
    expect(negative.readJson(text("data/not-codegen.json")).ok).toBe(false);
  });

  it("旧 CSV 可规范化成第三份 JSON", () => {
    const controller = new KtCodegenController();
    const read = controller.readCsv(LEGACY_PANEL_CSV);
    expect(read.ok).toBe(true);
    expect(controller.param.namePrefix).toBe("PNX");
    expect(controller.param.nameMiddle).toBe("LegacyPanel");
    expect(controller.param.items).toHaveLength(2);
    expect(controller.writeJson().ok).toBe(true);
  });

  it("同名冲突 CSV 与 JSON 都有效但规范化内容不同", () => {
    const json = new KtCodegenController();
    const csv = new KtCodegenController();
    expect(json.readJson(text("legacy/PNXConflictParam.json")).ok).toBe(true);
    expect(csv.readCsv(text("legacy/PNXConflictParam.csv")).ok).toBe(true);
    expect(json.writeJson().value).not.toBe(csv.writeJson().value);
    expect(json.param.items[0]?.defaultValue).toBe("7");
    expect(csv.param.items[0]?.defaultValue).toBe("99");
  });

  it("候选源码包含与两份 JSON 对应的成对控制标记", () => {
    const widget = text("src/PNXWidget.cpp");
    const guard = text("src/KtCourseGuard.cpp");
    expect(widget.match(/START KEVIN CAA WIZARD SECTION/g)).toHaveLength(2);
    expect(widget.match(/END KEVIN CAA WIZARD SECTION/g)).toHaveLength(2);
    expect(widget).toContain("PNXWidgetItem PARAM DECLARATION");
    expect(guard.match(/START KEVIN CAA WIZARD SECTION/g)).toHaveLength(1);
    expect(guard.match(/END KEVIN CAA WIZARD SECTION/g)).toHaveLength(1);
    expect(guard).toContain("KtCourseGuardItem PARAM DECLARATION");
  });

  it("一键启动脚本始终复制模板，不直接打开并修改 tracked fixture", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const launcher = readFileSync(new URL("../../../scripts/launch-extension-host.mjs", import.meta.url), "utf8");
    const verifier = readFileSync(new URL("../../../scripts/verify-codegen-fixture.mjs", import.meta.url), "utf8");
    expect(packageJson.scripts["ext:launch:codegen"]).toContain("--codegen-fixture");
    expect(packageJson.scripts["ext:prepare:codegen"]).toContain("--prepare-only");
    expect(packageJson.scripts["ext:verify:codegen"]).toContain("verify-codegen-fixture.mjs");
    expect(packageJson.scripts["ext:report:codegen"]).toContain("record-codegen-checkpoint.mjs");
    expect(launcher).toContain("mkdtempSync");
    expect(launcher).toContain("cpSync(fixtureTemplatePath, workspacePath");
    expect(launcher).toContain("CODEGEN_BULK_SOURCE_COUNT = 1200");
    expect(launcher).toContain("NoCodegenMarker");
    expect(launcher).toContain("writeCodegenFixtureBaseline");
    expect(launcher).toContain("writeCodegenFixtureQaReport");
    expect(launcher).toContain("ext:report:codegen");
    expect(launcher).not.toMatch(/args\.push\(fixtureTemplatePath\)/);
    expect(verifier).toContain("界面确认后记录");
    expect(verifier).toContain("ext:report:codegen");
    expect(verifier).toContain("--checkpoint-c");
  });

  it("当前评分反映真实 Apply，旧轮次评分明确标成历史快照", () => {
    const current = readFileSync(
      new URL("../../../docs/codegen-plan/Codegen第四轮可验收性评分.md", import.meta.url),
      "utf8",
    );
    expect(current).toContain("当前权威评分");
    expect(current).toContain("73 files / 364 tests");
    expect(current).toContain("当前真实 Apply");
    expect(current).not.toContain("当前按钮只输出 dry-run 日志");

    for (const name of [
      "Codegen执行评分.md",
      "Codegen第二轮执行评分.md",
      "Codegen第三轮可靠性评分.md",
    ]) {
      const historical = readFileSync(
        new URL(`../../../docs/codegen-plan/${name}`, import.meta.url),
        "utf8",
      );
      expect(historical).toContain("历史阶段快照");
    }
  });
});
