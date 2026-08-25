import { describe, expect, it, vi } from "vitest";
import { KtcReadGitCommitBody } from "./KtcGitCommitBodyService.js";

describe("Git commit body service", () => {
  it("reads one explicit OID without scanning repository history", async () => {
    const oid = "a".repeat(40);
    const run = vi.fn(async () => ({ stdout: "正文第一行\n\n- 列表\n" }));
    await expect(KtcReadGitCommitBody("/repo", oid, run)).resolves.toBe("正文第一行\n\n- 列表");
    expect(run).toHaveBeenCalledWith([
      "show", "--no-color", "--no-show-signature", "--no-patch", "--format=%b", oid,
    ], "/repo");
  });

  it("rejects an invalid OID before invoking Git", async () => {
    const run = vi.fn(async () => ({ stdout: "" }));
    await expect(KtcReadGitCommitBody("/repo", "HEAD", run)).rejects.toThrow("OID 无效");
    expect(run).not.toHaveBeenCalled();
  });
});
