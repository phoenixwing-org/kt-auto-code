import { describe, expect, it } from "vitest";
import {
  ktcCodegenApplySummary,
  ktcCodegenCandidateScanSummary,
  ktcCodegenPreflightSummary,
} from "./operationSummary.js";

describe("Codegen operation summaries", () => {
  it("候选扫描摘要只保留根、扫描、命中和耗时", () => {
    expect(ktcCodegenCandidateScanSummary({
      rootCount: 1,
      indexedFileCount: 46,
      candidateCount: 14,
      elapsed: "87 ms",
    })).toBe("候选扫描完成：1 个工作区根，扫描 46 个源码文件，命中 14 个控制符候选；耗时 87 ms。");
  });

  it("预检摘要区分缓存并统一扫描、命中、产物、诊断和耗时口径", () => {
    expect(ktcCodegenPreflightSummary({
      reused: true,
      indexedFileCount: 46,
      candidateFileCount: 14,
      regionCount: 14,
      artifactCount: 14,
      diagnosticCount: 0,
      elapsed: "1.23 s",
    })).toBe("复用缓存：扫描 46 个源码文件，候选 14 个，命中 14 个区域，生成 14 个产物，0 条诊断；耗时 1.23 s。");
  });

  it("Apply 摘要覆盖成功、无需写入和回执失败", () => {
    expect(ktcCodegenApplySummary({
      fileCount: 2,
      regionCount: 9,
      receiptFailed: false,
      elapsed: "240 ms",
    })).toBe("Apply 完成：已修改 2 个文件、9 个区域；回执已保存；耗时 240 ms。");
    expect(ktcCodegenApplySummary({
      fileCount: 0,
      regionCount: 0,
      receiptFailed: false,
      elapsed: "12 ms",
    })).toContain("没有需要写入的变化；耗时 12 ms");
    expect(ktcCodegenApplySummary({
      fileCount: 1,
      regionCount: 3,
      receiptFailed: true,
      elapsed: "80 ms",
    })).toContain("回执缓存失败，请查看 Problems；耗时 80 ms");
  });
});
