import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../../../", import.meta.url);

function json<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, root), "utf8")) as T;
}

describe("Codegen objective acceptance coverage", () => {
  const coverage = json<{
    kind: string;
    schemaVersion: number;
    objectiveStatus: string;
    automaticScore: number;
    automaticThreshold: number;
    requirements: Array<{
      id: string;
      automatedStatus: "proved" | "partial";
      evidence: string[];
      manualCheckpoint: string;
      manualStatus: string;
    }>;
    completionGate: {
      automatic: { status: string; score: number };
      manual: { status: string; requiredCheckpoints: string[]; reportTemplate: string };
      applyBoundary: string;
    };
  }>("doc/codegen-plan/CodegenAcceptanceCoverage.json");

  it("覆盖目标的全部稳定 requirement id，且每项证据文件存在", () => {
    const expected = [
      "repeatable-fixture", "runtime-diagnostics", "phased-checklist",
      "discover-without-open", "json-multi-view", "whole-table-save-revert",
      "external-conflict", "safe-csv-conversion", "candidate-scan-cancel",
      "preflight-control-preview", "theme-and-narrow-layout", "safe-source-apply",
      "scored-exit-gate",
    ];
    expect(coverage.requirements.map((item) => item.id).sort()).toEqual(expected.sort());
    for (const requirement of coverage.requirements) {
      expect(requirement.evidence.length, requirement.id).toBeGreaterThan(0);
      for (const path of requirement.evidence) {
        expect(existsSync(new URL(path, root)), `${requirement.id}: ${path}`).toBe(true);
      }
    }
  });

  it("自动分数通过门槛，人工 A-D 已确认但 E-F 仍保留 TODO", () => {
    expect(coverage.kind).toBe("kt.codegen.acceptance-coverage");
    expect(coverage.schemaVersion).toBe(1);
    expect(coverage.automaticScore).toBeGreaterThanOrEqual(coverage.automaticThreshold);
    expect(coverage.completionGate.automatic.status).toBe("passed");
    expect(coverage.completionGate.automatic.score).toBe(coverage.automaticScore);
    expect(coverage.completionGate.manual).toMatchObject({
      status: "partial",
      requiredCheckpoints: ["A", "B", "C", "D", "E", "F"],
      userConfirmedCheckpoints: ["A", "B", "C", "D"],
      todoCheckpoints: ["E", "F"],
    });
    expect(coverage.objectiveStatus).toBe("manual-partial-todo");
    expect(coverage.completionGate.applyBoundary).toBe("fingerprint-checked-write-with-verifiable-receipt");
  });

  it("人工回报模板包含必选 A-F，并把 G 标成可选", () => {
    const report = json<{
      kind: string;
      status: string;
      checkpoints: Array<{ id: string; status: string }>;
    }>(coverage.completionGate.manual.reportTemplate);
    expect(report.kind).toBe("kt.codegen.manual-qa-report");
    expect(report.status).toBe("pending");
    expect(report.checkpoints.filter((item) => item.id !== "G").map((item) => item.id))
      .toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(report.checkpoints.find((item) => item.id === "G")?.status).toBe("skipped");
  });
});
