import { describe, expect, it } from "vitest";
import {
  KtcParseGitWorktreeChanges,
  KtcStashGitWorktree,
  type KtcGitCommandRunner,
} from "./KtcGitStashService.js";

describe("Git 合并前暂存", () => {
  it("按 porcelain 状态区分暂存、修改与未跟踪文件", () => {
    expect(KtcParseGitWorktreeChanges("M  staged.cpp\0 M modified.cpp\0?? new.cpp\0R  renamed.cpp\0old.cpp\0"))
      .toEqual({ staged: 2, modified: 1, untracked: 1, total: 4 });
  });

  it("暂存包含未跟踪文件、保持 ignored 文件不在命令中，并复查工作区已清空", async () => {
    const calls: string[][] = [];
    const runner: KtcGitCommandRunner = async (args) => {
      calls.push([...args]);
      if (args[0] === "status") {
        return calls.filter((call) => call[0] === "status").length === 1
          ? { stdout: " M modified.cpp\0?? new.cpp\0" }
          : { stdout: "" };
      }
      if (args[0] === "rev-parse") return { stdout: "a".repeat(40) + "\n" };
      return { stdout: "" };
    };
    await expect(KtcStashGitWorktree("/repo", "kt-auto-code: test", runner)).resolves.toMatchObject({
      stashOid: "a".repeat(40),
      changes: { modified: 1, untracked: 1, total: 2 },
    });
    expect(calls).toContainEqual(["stash", "push", "--include-untracked", "--message", "kt-auto-code: test"]);
  });
});
