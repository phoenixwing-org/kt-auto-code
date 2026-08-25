import { describe, expect, it } from "vitest";
import { KtcReadLocalGitBranchLines, KtcSwitchToLocalGitBranch } from "./KtcGitBranchService.js";

const oid = (character: string) => character.repeat(40);

describe("Git local branch service", () => {
  it("reads first-parent histories without parsing display graph data", async () => {
    const calls: readonly (readonly string[])[] = [];
    const run = async (args: readonly string[]) => {
      (calls as (readonly string[])[]).push(args);
      if (args[0] === "for-each-ref") return { stdout: `develop\0${oid("a")}\0topic\0${oid("b")}\0` };
      if (args.at(-1) === oid("a")) return { stdout: `${oid("a")}\n${oid("c")}\n` };
      return { stdout: `${oid("b")}\n${oid("c")}\n` };
    };
    await expect(KtcReadLocalGitBranchLines("/repo", run)).resolves.toEqual([
      { name: "develop", firstParentOids: [oid("a"), oid("c")] },
      { name: "topic", firstParentOids: [oid("b"), oid("c")] },
    ]);
    expect(calls).toHaveLength(3);
  });

  it("uses git switch with an argument vector and rejects unsafe names", async () => {
    const calls: (readonly string[])[] = [];
    await KtcSwitchToLocalGitBranch("/repo", "topic/fix", async (args) => {
      calls.push(args);
      return { stdout: "" };
    });
    expect(calls).toEqual([["switch", "--quiet", "topic/fix"]]);
    await expect(KtcSwitchToLocalGitBranch("/repo", "--orphan", async () => ({ stdout: "" }))).rejects.toThrow("无效");
  });
});
