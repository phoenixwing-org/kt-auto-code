import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

interface MatrixItem {
  readonly feature: string;
  readonly source: string;
  readonly status: string;
  readonly note?: string;
}

interface MigrationMatrix {
  readonly kind: string;
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly sourceRoots: Record<string, string>;
  readonly statusSemantics: Record<string, readonly string[]>;
  readonly sources: readonly string[];
  readonly acceptance: {
    readonly coverageFile: string;
    readonly manualStatus: string;
    readonly requiredCheckpoints: readonly string[];
    readonly checkpointFeatures: Record<string, readonly string[]>;
  };
  readonly items: readonly MatrixItem[];
}

function matrix(): MigrationMatrix {
  return JSON.parse(readFileSync(
    new URL("../../../doc/codegen-plan/CodegenQtVbMigrationMatrix.json", import.meta.url),
    "utf8",
  )) as MigrationMatrix;
}

describe("Codegen Qt/VB migration matrix", () => {
  it("区分两个原始工程根，并为每份来源声明 qt/vb 别名", () => {
    const value = matrix();
    expect(value.kind).toBe("kt.codegen.qt-vb-migration-matrix");
    expect(value.schemaVersion).toBe(1);
    expect(value.sourceRoots.qt).toContain("KtdAutoCodeModules/KtdAutoCode");
    expect(value.sourceRoots.vb).toContain("KtdAutoCodeModules/KtAutoCode");
    expect(value.sources.every((source) => /^(qt|vb):/.test(source))).toBe(true);
    expect(value.sources.some((source) => source.endsWith("FormCAAWspGuide.vb"))).toBe(true);
  });

  it("状态受控、Feature 唯一，未完成项只保留明确延期的 Hot Exit 与 Apply All", () => {
    const value = matrix();
    const allowed = new Set(Object.values(value.statusSemantics).flat());
    expect(new Set(value.items.map((item) => item.feature)).size).toBe(value.items.length);
    expect(value.items.every((item) => allowed.has(item.status))).toBe(true);
    expect(value.items.filter((item) => ["partial", "deferred"].includes(item.status)))
      .toEqual([
        expect.objectContaining({ feature: "关闭脏文档确认/Hot Exit", status: "partial" }),
        expect.objectContaining({ feature: "Apply All", status: "deferred" }),
      ]);
    expect(value.items.filter((item) => ["partial", "deferred", "intentionally-not-migrated"].includes(item.status))
      .every((item) => Boolean(item.note))).toBe(true);
  });

  it("A–F 映射只引用真实 Feature，并覆盖当前布局、保存、候选、控制符、Apply 和主题", () => {
    const value = matrix();
    expect(value.acceptance.manualStatus).toBe("pending");
    expect(value.acceptance.requiredCheckpoints).toEqual(["A", "B", "C", "D", "E", "F"]);
    const features = new Set(value.items.map((item) => item.feature));
    const mapped = Object.values(value.acceptance.checkpointFeatures).flat();
    expect(mapped.every((feature) => features.has(feature))).toBe(true);
    for (const feature of [
      "单 Block + 当前编辑区 JSON 标签",
      "Save/Revert/revision",
      "发现、候选扫描和预检取消/进度",
      "32控制符标题/控制词/调用说明",
      "真实源码替换",
      "深色/浅色主题与窄窗口",
    ]) expect(mapped).toContain(feature);
    expect(value.acceptance.coverageFile).toBe("doc/codegen-plan/CodegenAcceptanceCoverage.json");
  });
});
