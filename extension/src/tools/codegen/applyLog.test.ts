import { describe, expect, it } from "vitest";
import type { KtCodegenPlan } from "@phoenix-wing/kt-codegen";
import {
  ktcCodegenAppliedRegionLog,
  ktcCodegenApplyDiagnosticLog,
  ktcCodegenApplyPlanLogs,
} from "./applyLog.js";

function plan(): KtCodegenPlan {
  return {
    kind: "kt.codegen.plan",
    schemaVersion: 1,
    phase: "preview",
    targets: [{ target: "cpp.parameter", rendererId: "cpp", status: "ready", artifactCount: 1 }],
    blockKeys: ["PARAM DECLARATION", "QT UPDATE DIALOG"],
    markerRegions: [{
      id: "r1",
      path: "/workspace/a.cpp",
      sourceFingerprint: "sha256:a",
      blockKey: "PARAM DECLARATION",
      start: { line: 3 },
      replaceStartOffset: 0,
      replaceEndOffset: 0,
    }],
    artifacts: [{ id: "a1", regionId: "r1", content: "next" }],
    diagnostics: [{
      code: "marker.missing-end",
      severity: "error",
      message: "Start marker has no matching End marker.",
      path: { source: "source", file: "/workspace/b.cpp", row: 8, column: 0 },
    }],
    hasChanges: true,
    canApply: false,
  } as unknown as KtCodegenPlan;
}

describe("Codegen Apply Output log", () => {
  it("列出 Target 和命中摘要，不把未出现的已选控制符合成告警", () => {
    const logs = ktcCodegenApplyPlanLogs(plan());
    expect(logs).toContainEqual(expect.stringContaining("[Target] cpp.parameter；status=ready"));
    expect(logs).toContainEqual(expect.stringContaining("[Marker] 已找到 1 个已选控制符，共 1 个区域"));
    expect(logs.join("\n")).not.toContain("marker.not-found");
    expect(logs.join("\n")).not.toContain("QT UPDATE DIALOG");
    expect(ktcCodegenApplyPlanLogs(plan(), "Preflight")[0]).toContain("[Codegen][Preflight]");
  });

  it("诊断日志带稳定 code、文件和从1开始的行号", () => {
    expect(ktcCodegenApplyDiagnosticLog(plan().diagnostics[0]!)).toBe(
      "[Codegen][Apply][error] marker.missing-end：Start marker has no matching End marker.；file=/workspace/b.cpp:9",
    );
  });

  it("真实写入成功日志逐区域包含 block、行号和稳定身份", () => {
    expect(ktcCodegenAppliedRegionLog("/workspace/a.cpp", {
      id: "region-1",
      artifactId: "artifact-1",
      blockKey: "PARAM DECLARATION",
      classId: "PNXWidgetItem",
      nameSuffix: "Item",
      line: 7,
    })).toBe(
      "[Codegen][Apply][Region] 已写入 /workspace/a.cpp:8；block=PARAM DECLARATION；class=PNXWidgetItem；region=region-1；artifact=artifact-1",
    );
  });
});
