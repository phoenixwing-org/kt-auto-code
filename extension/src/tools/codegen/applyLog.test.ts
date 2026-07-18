import { describe, expect, it } from "vitest";
import type { KtCodegenPlan } from "@phoenix-wing/kt-codegen";
import {
  ktcCodegenAppliedFileLog,
  ktcCodegenApplyDiagnosticLog,
  ktcCodegenApplyPlanLogs,
  ktcCodegenApplyReceiptLog,
} from "./applyLog.js";

function plan(): KtCodegenPlan {
  return {
    kind: "kt.codegen.plan",
    schemaVersion: 1,
    phase: "preview",
    targets: [
      { target: "cpp.parameter", rendererId: "cpp", status: "ready", artifactCount: 1 },
      { target: "qt.parameter", rendererId: "qt", status: "ready", artifactCount: 0 },
      { target: "qt.dialog", rendererId: "qt", status: "scaffold", artifactCount: 0 },
    ],
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
  it("抑制 ready 且零产物 Target，保留非零或异常 Target 和命中摘要", () => {
    const logs = ktcCodegenApplyPlanLogs(plan());
    expect(logs).toContainEqual(expect.stringContaining("[Target] cpp.parameter；status=ready"));
    expect(logs).toContainEqual(expect.stringContaining("[Target] qt.dialog；status=scaffold；artifacts=0"));
    expect(logs).toContainEqual(expect.stringContaining("[Marker] 已找到 1 个已选控制符，共 1 个区域"));
    expect(logs.join("\n")).not.toContain("marker.not-found");
    expect(logs.join("\n")).not.toContain("QT UPDATE DIALOG");
    expect(logs.join("\n")).not.toContain("[Target] qt.parameter");
    expect(ktcCodegenApplyPlanLogs(plan(), "Preflight")[0]).toContain("[Codegen][Preflight]");
  });

  it("诊断日志带稳定 code、文件和从1开始的行号", () => {
    expect(ktcCodegenApplyDiagnosticLog(plan().diagnostics[0]!)).toBe(
      "[Codegen][Apply][error] marker.missing-end：Start marker has no matching End marker.；file=/workspace/b.cpp:9",
    );
  });

  it("真实写入日志按文件聚合，不暴露绝对路径、字节范围或区域身份", () => {
    expect(ktcCodegenAppliedFileLog("/workspace/src/a.cpp", 3)).toBe(
      "[Codegen][Apply][File] a.cpp；已写入 3 个区域",
    );
    expect(ktcCodegenAppliedFileLog("C:\\workspace\\src\\b.cpp", 1)).toBe(
      "[Codegen][Apply][File] b.cpp；已写入 1 个区域",
    );
  });

  it("回执日志只报告保存结果和计数，结构化明细留在回执文件", () => {
    expect(ktcCodegenApplyReceiptLog(2, 9)).toBe(
      "[Codegen][Apply][Receipt] 回执已保存；2 个文件，9 个区域",
    );
  });
});
