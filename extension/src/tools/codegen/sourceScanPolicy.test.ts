import { describe, expect, it } from "vitest";
import {
  KTC_CODEGEN_SOURCE_FILE_LIMIT,
  ktcAssertCodegenSourceScanComplete,
} from "./sourceScanPolicy.js";

describe("Codegen source scan policy", () => {
  it("允许空工作区和精确上限", () => {
    expect(() => ktcAssertCodegenSourceScanComplete(0)).not.toThrow();
    expect(() => ktcAssertCodegenSourceScanComplete(KTC_CODEGEN_SOURCE_FILE_LIMIT)).not.toThrow();
  });

  it("超过上限时拒绝生成不完整索引", () => {
    expect(() => ktcAssertCodegenSourceScanComplete(KTC_CODEGEN_SOURCE_FILE_LIMIT + 1))
      .toThrow(/工作集或 Ignore/);
  });
});
