import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  KtCodegenController,
  type KtCodegenPlan,
} from "@phoenix-wing/kt-codegen";
import { ktcDecodeCodegenSource } from "./sourceCodec.js";
import {
  ktcNormalizeCodegenGeneratedEol,
  ktcProjectCodegenApply,
} from "./sourceApply.js";

function plan(fingerprint = "sha256:before"): KtCodegenPlan {
  return {
    kind: "kt.codegen.plan",
    schemaVersion: 1,
    phase: "preview",
    targets: [],
    blockKeys: ["PARAM DECLARATION"],
    markerRegions: [{
      id: "r1",
      path: "/workspace/a.cpp",
      sourceFingerprint: fingerprint,
      classId: "PNXA",
      nameSuffix: "A",
      blockKey: "PARAM DECLARATION",
      start: { line: 1 },
      replaceStartOffset: 2,
      replaceEndOffset: 5,
    }],
    artifacts: [{
      id: "a1",
      regionId: "r1",
      target: "cpp.parameter",
      blockKey: "PARAM DECLARATION",
      classId: "PNXA",
      content: "NEW",
      sourceParameters: [],
    }],
    diagnostics: [],
    hasChanges: true,
    canApply: true,
  } as unknown as KtCodegenPlan;
}

describe("Codegen source Apply projection", () => {
  it("指纹一致时按区域生成整文件结果", () => {
    expect(ktcProjectCodegenApply(plan(), [{
      path: "/workspace/a.cpp",
      text: "01old567",
      fingerprint: "sha256:before",
    }])).toEqual({
      changes: [{
        path: "/workspace/a.cpp",
        before: "01old567",
        after: "01NEW567",
        regionCount: 1,
        regions: [{
          id: "r1",
          artifactId: "a1",
          blockKey: "PARAM DECLARATION",
          classId: "PNXA",
          nameSuffix: "A",
          line: 1,
        }],
      }],
      diagnostics: [],
    });
  });

  it("预检后源码变化时不产生任何部分修改", () => {
    const result = ktcProjectCodegenApply(plan(), [{
      path: "/workspace/a.cpp",
      text: "changed",
      fingerprint: "sha256:changed",
    }]);
    expect(result.changes).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe("apply.source-changed");
  });

  it("与 Desk Tools 一致地按目标源码换行改写 Wing Artifact", () => {
    const base = plan();
    const crlfPlan: KtCodegenPlan = {
      ...base,
      artifacts: [{ ...base.artifacts[0]!, content: "START\nNEW\nEND\n" }],
      markerRegions: [{
        ...base.markerRegions[0]!,
        replaceStartOffset: 3,
        replaceEndOffset: 8,
      }],
    };
    const source = "A\r\nold\r\nZ\r\n";

    const result = ktcProjectCodegenApply(crlfPlan, [{
      path: "/workspace/a.cpp",
      text: source,
      fingerprint: "sha256:before",
    }]);

    expect(result.diagnostics).toEqual([]);
    expect(result.changes[0]?.after).toBe("A\r\nSTART\r\nNEW\r\nEND\r\nZ\r\n");
    expect(result.changes[0]?.after).not.toMatch(/(^|[^\r])\n/);
    expect(ktcNormalizeCodegenGeneratedEol("a\r\nb\rc\n", "lf")).toBe("a\nb\nc\n");
  });

  it("用真实 fixture Plan 替换完整 Kevin 区域并保留 Start/End", () => {
    const fixture = new URL("../../../../tests/fixtures/codegen-manual-workspace/", import.meta.url);
    const controller = new KtCodegenController();
    expect(controller.readJson(readFileSync(new URL("PNXWidgetParam.json", fixture), "utf8")).ok).toBe(true);
    const decoded = ktcDecodeCodegenSource(readFileSync(new URL("src/PNXWidget.cpp", fixture)))!;
    const path = "/workspace/src/PNXWidget.cpp";
    const realPlan = controller.analyze({
      targets: ["cpp.parameter", "qt.dialog"],
      blockKeys: ["PARAM DECLARATION", "QT UPDATE DIALOG"],
      snapshot: { files: [{ path, ...decoded }] },
    });
    expect(realPlan.canApply).toBe(true);

    const result = ktcProjectCodegenApply(realPlan, [{
      path,
      text: decoded.text,
      fingerprint: decoded.fingerprint,
    }]);
    expect(result.diagnostics).toEqual([]);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.after).not.toContain("oldWidgetCount");
    expect(result.changes[0]?.after.match(/START KEVIN CAA WIZARD SECTION/g)).toHaveLength(2);
    expect(result.changes[0]?.after.match(/END KEVIN CAA WIZARD SECTION/g)).toHaveLength(2);
  });

  it("真实 CRLF fixture Apply 后可再次预检且不会重复改写", () => {
    const fixture = new URL("../../../../tests/fixtures/codegen-manual-workspace/", import.meta.url);
    const controller = new KtCodegenController();
    expect(controller.readJson(readFileSync(new URL("PNXWidgetParam.json", fixture), "utf8")).ok).toBe(true);
    const originalText = readFileSync(new URL("src/PNXWidget.cpp", fixture), "utf8")
      .replace(/\r?\n/g, "\r\n");
    const decoded = ktcDecodeCodegenSource(Buffer.from(originalText, "utf8"))!;
    const path = "/workspace/src/PNXWidget.cpp";
    const request = {
      targets: ["cpp.parameter", "qt.dialog"],
      blockKeys: ["PARAM DECLARATION", "QT UPDATE DIALOG"],
    } as const;
    const firstPlan = controller.analyze({
      ...request,
      snapshot: { files: [{ path, ...decoded }] },
    });
    const first = ktcProjectCodegenApply(firstPlan, [{ path, ...decoded }]);

    expect(first.diagnostics).toEqual([]);
    expect(first.changes).toHaveLength(1);
    const after = first.changes[0]!.after;
    expect(after).not.toMatch(/(^|[^\r])\n/);
    expect(after.match(/START KEVIN CAA WIZARD SECTION/g)).toHaveLength(2);
    expect(after.match(/END KEVIN CAA WIZARD SECTION/g)).toHaveLength(2);

    const afterDecoded = ktcDecodeCodegenSource(Buffer.from(after, "utf8"))!;
    const secondPlan = controller.analyze({
      ...request,
      snapshot: { files: [{ path, ...afterDecoded }] },
    });
    const second = ktcProjectCodegenApply(secondPlan, [{ path, ...afterDecoded }]);
    expect(second.diagnostics).toEqual([]);
    expect(second.changes).toEqual([]);
  });
});
