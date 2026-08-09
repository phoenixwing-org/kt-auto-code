import { describe, expect, it } from "vitest";
import {
  ktcFormatCodegenDuration,
  ktcStartCodegenOperationTimer,
} from "./operationTimer.js";

describe("Codegen operation timer", () => {
  it("用注入时钟稳定计算从动作开始到完成的耗时", () => {
    let now = 1_000;
    const timer = ktcStartCodegenOperationTimer(() => now);
    now = 2_234.4;

    expect(timer.elapsedMilliseconds()).toBe(1_234);
    expect(timer.elapsedText()).toBe("1.23 s");
  });

  it("短耗时保留毫秒，长耗时使用紧凑秒数，并收敛异常时间", () => {
    expect(ktcFormatCodegenDuration(86.6)).toBe("87 ms");
    expect(ktcFormatCodegenDuration(12_345)).toBe("12.3 s");
    expect(ktcFormatCodegenDuration(Number.NaN)).toBe("0 ms");

    let now = 2_000;
    const timer = ktcStartCodegenOperationTimer(() => now);
    now = 1_500;
    expect(timer.elapsedMilliseconds()).toBe(0);
  });
});
