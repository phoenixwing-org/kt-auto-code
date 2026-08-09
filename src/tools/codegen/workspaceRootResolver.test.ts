import { describe, expect, it } from "vitest";
import { ktcResolveCodegenWorkspaceRoot } from "./workspaceRootResolver.js";

describe("Codegen workspace root resolver", () => {
  it("为多根工作区文档选择实际包含它的根", () => {
    expect(ktcResolveCodegenWorkspaceRoot(
      "/workspace/b/config/PartParam.json",
      ["/workspace/a", "/workspace/b"],
      "/workspace/a",
    )).toBe("/workspace/b");
  });

  it("嵌套根存在时选择最深根，避免缓存写到父工程", () => {
    expect(ktcResolveCodegenWorkspaceRoot(
      "/workspace/packages/caa/PartParam.json",
      ["/workspace", "/workspace/packages/caa"],
    )).toBe("/workspace/packages/caa");
  });

  it("工作区外手工打开的 JSON 使用显式主根回退", () => {
    expect(ktcResolveCodegenWorkspaceRoot(
      "/external/PartParam.json",
      ["/workspace/a", "/workspace/b"],
      "/workspace/a",
    )).toBe("/workspace/a");
  });
});
