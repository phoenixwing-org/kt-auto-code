import { afterEach, describe, expect, it } from "vitest";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CODEGEN_QA_REPORT_RELATIVE,
  formatCodegenFixtureQaSummary,
  readCodegenFixtureQaReport,
  recordCodegenManualCheckpoint,
  recordCodegenFixtureVerification,
  writeCodegenFixtureBaseline,
  writeCodegenFixtureQaReport,
  verifyCodegenFixture,
} from "../../../../scripts/codegen-fixture-qa.mjs";
import { KtCodegenController, KtCodegenItem } from "@phoenix-wing/kt-codegen";
import { ktcDecodeCodegenSource, ktcEncodeCodegenSource } from "./sourceCodec.js";
import { ktcProjectCodegenApply } from "./sourceApply.js";
import {
  ktcCodegenReceiptWorkspacePath,
  ktcCreateCodegenApplyReceipt,
  ktcSerializeCodegenApplyReceipt,
} from "./applyReceipt.js";
import { ktcCodegenFingerprint } from "./documentService.js";

const fixtureRoot = new URL("../../../../tests/fixtures/codegen-manual-workspace/", import.meta.url);
const temporaryRoots: string[] = [];
const LEGACY_PANEL_CSV = `NameSuffix,ID,Name,ParamString,DataType,TCKind,DefaultValue,CATAttrInOut,IsList,IsOnTree,Component,Count,IsParamDlg,Unit,Author,CreateDate,Notes
Item,1,Legacy Enabled,LegacyEnabled,bool,Boolean,true,In,0,1,QCheckBox,1,1,,Manual QA,2026-07-16,CSV conversion input
Item,2,Legacy Title,LegacyTitle,CATUnicodeString,String,,InOut,0,1,QLineEdit,1,1,,Manual QA,2026-07-16,CSV conversion input
$NamePrefix,PNX,the prefix
$NameMiddle,LegacyPanel,the middle name
$NameSpace,PNX,the namespace
$AppendFunction,push_back,the append function name
`;

function unappliedWidgetText(): string {
  return [
    "namespace PNX {", "",
    "// START KEVIN CAA WIZARD SECTION PNXWidgetItem PARAM DECLARATION",
    "int oldWidgetCount;",
    "// END KEVIN CAA WIZARD SECTION PNXWidgetItem PARAM DECLARATION", "",
    "// START KEVIN CAA WIZARD SECTION PNXWidgetItem QT UPDATE DIALOG",
    "void updateOldWidgetDialog();",
    "// END KEVIN CAA WIZARD SECTION PNXWidgetItem QT UPDATE DIALOG", "",
    "} // namespace PNX", "",
  ].join("\n");
}

function temporaryFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "kt-codegen-qa-verifier-"));
  temporaryRoots.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  writeCodegenFixtureBaseline(root);
  writeCodegenFixtureQaReport(root, "0.4.0-test");
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Codegen manual fixture verifier", () => {
  it("基线能检出控制符源码的字节变化", () => {
    const root = temporaryFixture();
    expect(verifyCodegenFixture(root).ok).toBe(true);
    appendFileSync(join(root, "src/PNXWidget.cpp"), "// unexpected apply\n");
    const report = verifyCodegenFixture(root);
    expect(report.ok).toBe(false);
    expect(report.checks.find((item) => item.id === "source-safety")?.message)
      .toContain("src/PNXWidget.cpp");
  });

  it("Checkpoint A 校验安全转换和冲突保留", () => {
    const root = temporaryFixture();
    const csvPath = join(root, "legacy/PNXLegacyPanelParam.csv");
    writeFileSync(csvPath, LEGACY_PANEL_CSV);
    rmSync(join(root, "legacy/PNXLegacyPanelParam.json"), { force: true });
    const controller = new KtCodegenController();
    expect(controller.readCsv(readFileSync(csvPath, "utf8")).ok).toBe(true);
    writeFileSync(join(root, "legacy/PNXLegacyPanelParam.json"), controller.writeJson().value!);
    unlinkSync(join(root, "legacy/PNXLegacyPanelParam.csv"));
    expect(verifyCodegenFixture(root, "a").ok).toBe(true);
    unlinkSync(join(root, "legacy/PNXConflictParam.csv"));
    expect(verifyCodegenFixture(root, "a").ok).toBe(false);
  });

  it("Checkpoint C 校验真实写盘、保序和四格格式", () => {
    const root = temporaryFixture();
    const widgetPath = join(root, "PNXWidgetParam.json");
    const widget = new KtCodegenController();
    expect(widget.readJson(readFileSync(widgetPath, "utf8")).ok).toBe(true);
    widget.param.nameSpace = "SavedNamespace";
    writeFileSync(widgetPath, widget.writeJson().value!);

    const emptyPath = join(root, "config/EmptyParam.json");
    const empty = new KtCodegenController();
    expect(empty.readJson(readFileSync(emptyPath, "utf8")).ok).toBe(true);
    empty.param.items.push(new KtCodegenItem({
      nameSuffix: "Item",
      id: 1,
      name: "First Item",
      paramString: "FirstItem",
      dataType: "int",
    }));
    writeFileSync(emptyPath, empty.writeJson().value!);

    const verification = verifyCodegenFixture(root, "c");
    expect(verification.ok, JSON.stringify(verification.checks, null, 2)).toBe(true);
    expect(verification.checks.find((item) => item.id === "json-layout")?.message)
      .toContain("4 空格");
    recordCodegenFixtureVerification(root, verification);
    expect(readCodegenFixtureQaReport(root).checkpoints.find((item: { id: string }) => item.id === "C"))
      .toMatchObject({ status: "pending", verifierPassed: true });

    const value = JSON.parse(readFileSync(widgetPath, "utf8"));
    writeFileSync(widgetPath, `${JSON.stringify(value, null, 2)}\n`);
    expect(verifyCodegenFixture(root, "c").checks.find((item) => item.id === "json-layout")?.ok)
      .toBe(false);
  });

  it("Checkpoint E 要求 Marker/Preflight Cache 和可复核的真实 Apply Receipt", () => {
    const root = temporaryFixture();
    const cache = join(root, ".phoenix/cache/codegen");
    mkdirSync(join(cache, "preflight-v1"), { recursive: true });
    writeFileSync(join(cache, "marker-index-v1.json"), JSON.stringify({ kind: "kt.codegen.marker-index" }));
    const preflightPath = join(cache, "preflight-v1/test.json");
    writeFileSync(preflightPath, JSON.stringify({ kind: "kt.codegen.preflight-cache" }));
    const source = join(root, "src/PNXWidget.cpp");
    writeFileSync(source, unappliedWidgetText());
    writeCodegenFixtureBaseline(root);
    const param = new KtCodegenController();
    expect(param.readJson(readFileSync(join(root, "PNXWidgetParam.json"), "utf8")).ok).toBe(true);
    const before = readFileSync(source);
    const decoded = ktcDecodeCodegenSource(before)!;
    const plan = param.analyze({
      targets: ["cpp.parameter", "qt.dialog"],
      blockKeys: ["PARAM DECLARATION", "QT UPDATE DIALOG"],
      snapshot: { files: [{ path: source, ...decoded }] },
    });
    const apply = ktcProjectCodegenApply(plan, [{
      path: source,
      text: decoded.text,
      fingerprint: decoded.fingerprint,
    }]);
    expect(apply.diagnostics).toEqual([]);
    const after = ktcEncodeCodegenSource(apply.changes[0]!.after, decoded.encoding);
    writeFileSync(source, after);
    const receipt = ktcCreateCodegenApplyReceipt({
      createdAt: "2026-07-17T10:00:00.000Z",
      documentPath: "PNXWidgetParam.json",
      preflightCachePath: ktcCodegenReceiptWorkspacePath(root, preflightPath)!,
      preflightCreatedAt: "2026-07-17T09:59:00.000Z",
      files: [{
        path: ktcCodegenReceiptWorkspacePath(root, source)!,
        beforeFingerprint: decoded.fingerprint,
        afterFingerprint: ktcCodegenFingerprint(after),
        encoding: decoded.encoding,
        eol: decoded.eol,
        beforeBytes: before.byteLength,
        afterBytes: after.byteLength,
        regionCount: apply.changes[0]!.regionCount,
        regions: apply.changes[0]!.regions,
      }],
    });
    mkdirSync(join(cache, "apply-receipt-v1"), { recursive: true });
    writeFileSync(join(cache, "apply-receipt-v1/test.json"), ktcSerializeCodegenApplyReceipt(receipt));
    const verification = verifyCodegenFixture(root, "e");
    expect(verification.ok, JSON.stringify(verification.checks, null, 2)).toBe(true);
    expect(verification.checks.find((item) => item.id === "apply-receipt")?.message)
      .toContain("当前源码字节验证");
    recordCodegenFixtureVerification(root, verification);
    const report = JSON.parse(readFileSync(join(root, CODEGEN_QA_REPORT_RELATIVE), "utf8")) as {
      status: string;
      extensionVersion: string;
      sourceSafetyPassed: boolean;
      checkpoints: Array<{ id: string; status: string; verifierPassed?: boolean }>;
    };
    expect(report.sourceSafetyPassed).toBe(true);
    expect(report.extensionVersion).toBe("0.4.0-test");
    expect(report.checkpoints.find((item) => item.id === "E"))
      .toMatchObject({ status: "pending", verifierPassed: true });
    expect(report.status).toBe("pending");

    appendFileSync(source, "// receipt tampered after Apply\n");
    const tampered = verifyCodegenFixture(root, "e");
    expect(tampered.ok).toBe(false);
    expect(tampered.checks.find((item) => item.id === "apply-receipt")?.message)
      .toContain("当前字节与 Apply 回执不符");
  });

  it("人工报告不允许绕过 A/C/E verifier、A 诊断确认和 F 主题记录", () => {
    const root = temporaryFixture();
    expect(() => recordCodegenManualCheckpoint(root, {
      id: "A", status: "passed", diagnosticsCopied: true,
    })).toThrow(/机器验证尚未通过/);
    expect(() => recordCodegenManualCheckpoint(root, {
      id: "C", status: "passed",
    })).toThrow(/机器验证尚未通过/);

    recordCodegenFixtureVerification(root, {
      ok: true,
      checkpoint: "a",
      checks: [
        { id: "source-count", ok: true, message: "ok" },
        { id: "source-safety", ok: true, message: "ok" },
      ],
    });
    expect(() => recordCodegenManualCheckpoint(root, {
      id: "A", status: "passed",
    })).toThrow(/复制诊断/);
    expect(() => recordCodegenManualCheckpoint(root, {
      id: "F", status: "passed",
    })).toThrow(/深色和浅色主题/);
    expect(() => recordCodegenManualCheckpoint(root, {
      id: "B", status: "skipped",
    })).toThrow(/必测项/);
  });

  it("按 Checkpoint 续填报告，只在 A–F 全部人工通过后完成", () => {
    const root = temporaryFixture();
    for (const checkpoint of ["A", "C", "E"] as const) {
      recordCodegenFixtureVerification(root, {
        ok: true,
        checkpoint: checkpoint.toLowerCase(),
        checks: [
          { id: "source-count", ok: true, message: "ok" },
          { id: "source-safety", ok: true, message: "ok" },
        ],
      });
    }
    recordCodegenManualCheckpoint(root, {
      id: "A",
      status: "passed",
      diagnosticsCopied: true,
      vscodeVersion: "1.108.0",
      notes: "首次发现正常",
    });
    for (const id of ["B", "C", "D", "E"] as const) {
      recordCodegenManualCheckpoint(root, { id, status: "passed" });
    }
    let report = recordCodegenManualCheckpoint(root, {
      id: "F",
      status: "passed",
      themes: { dark: "Dark+", light: "Light+", highContrast: "HC Black" },
    });
    expect(report).toMatchObject({
      status: "passed",
      vscodeVersion: "1.108.0",
      diagnosticsCopied: true,
      themes: { dark: "Dark+", light: "Light+", highContrast: "HC Black" },
    });
    expect(report.completedAt).not.toBe("");
    expect(report.checkpoints.find((item: { id: string }) => item.id === "A"))
      .toMatchObject({ status: "passed", verifierPassed: true, notes: "首次发现正常" });
    expect(formatCodegenFixtureQaSummary(report)).toContain("6/6 必测项通过");

    report = recordCodegenFixtureVerification(root, {
      ok: false,
      checkpoint: "e",
      checks: [{ id: "source-safety", ok: false, message: "changed" }],
    });
    expect(report.status).toBe("failed");
    expect(report.completedAt).toBe("");
    expect(formatCodegenFixtureQaSummary(report)).toContain("下一项：Checkpoint E");
    report = recordCodegenFixtureVerification(root, {
      ok: true,
      checkpoint: "e",
      checks: [{ id: "source-safety", ok: true, message: "ok" }],
    });
    expect(report.status).toBe("passed");

    report = recordCodegenManualCheckpoint(root, {
      id: "C", status: "failed", notes: "保存结果待复查",
    });
    expect(report.status).toBe("failed");
    expect(report.completedAt).toBe("");
    expect(formatCodegenFixtureQaSummary(readCodegenFixtureQaReport(root)))
      .toContain("下一项：Checkpoint C");
  });
});
