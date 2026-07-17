import { describe, expect, it } from "vitest";
import {
  KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT,
  ktcAssertCodegenDiscoveryComplete,
} from "./workspaceDiscoveryPolicy.js";

describe("Codegen workspace discovery policy", () => {
  it("接受单根上限以内的 JSON 与 CSV", () => {
    expect(() => ktcAssertCodegenDiscoveryComplete(
      "/workspace",
      KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT,
      KTC_CODEGEN_DISCOVERY_FILE_LIMIT_PER_ROOT,
    )).not.toThrow();
  });

  it("任一类型超限时提供手工打开退路，不返回截断列表", () => {
    expect(() => ktcAssertCodegenDiscoveryComplete("/workspace", 301, 2))
      .toThrow(/打开 JSON/);
    expect(() => ktcAssertCodegenDiscoveryComplete("/workspace", 2, 301))
      .toThrow(/CSV 301/);
  });
});
