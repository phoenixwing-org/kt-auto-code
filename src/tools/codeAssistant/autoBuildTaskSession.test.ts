import { describe, expect, it } from "vitest";
import type { KtcAutoBuildTask } from "./autoBuildContracts.js";
import {
  ktcAutoBuildTaskSessionKey,
  ktcReconcileAutoBuildTaskPlan,
  ktcUpsertAutoBuildSessionTasks,
} from "./autoBuildTaskSession.js";

const task = (
  id: string,
  path: string,
  status: KtcAutoBuildTask["status"] = "waiting",
  phase: KtcAutoBuildTask["phase"] = "cmake",
): KtcAutoBuildTask => ({ id, path, phase, status, name: `${phase} ${path}`, commandSummary: "mk.ps1" });

describe("AutoBuild session task coordination", () => {
  it("uses phase and normalized path instead of planner index as identity", () => {
    expect(ktcAutoBuildTaskSessionKey(task("cmake-0", "E:\\Work\\One\\")))
      .toBe(ktcAutoBuildTaskSessionKey(task("cmake-9", "e:/work/one")));
  });

  it("keeps case-sensitive POSIX task paths distinct and preserves filesystem roots", () => {
    expect(ktcAutoBuildTaskSessionKey(task("cmake-0", "/work/One")))
      .not.toBe(ktcAutoBuildTaskSessionKey(task("cmake-1", "/work/one")));
    expect(ktcAutoBuildTaskSessionKey(task("cmake-root", "/"))).toBe("cmake:/");
  });

  it("preflight reconciliation preserves failed and completed outcomes", () => {
    const result = ktcReconcileAutoBuildTaskPlan(
      [task("cmake-0", "/work/one", "error"), task("cmake-1", "/work/two", "done")],
      [task("cmake-0", "/work/one"), task("cmake-1", "/work/two"), task("cmake-2", "/work/three")],
    );
    expect(result.map(({ status }) => status)).toEqual(["error", "done", "waiting"]);
  });

  it("incremental runs replace the same row, retain unrelated results and avoid id collisions", () => {
    const first = ktcUpsertAutoBuildSessionTasks(
      [task("cmake-0", "/work/one", "error")],
      [task("cmake-0", "/work/two")],
    );
    expect(first.map(({ id, path, status }) => ({ id, path, status }))).toEqual([
      { id: "cmake-0", path: "/work/one", status: "error" },
      { id: "cmake-0-2", path: "/work/two", status: "waiting" },
    ]);
    const rerun = ktcUpsertAutoBuildSessionTasks(first, [task("cmake-0", "/work/two")]);
    expect(rerun).toHaveLength(2);
    expect(rerun[0]).toMatchObject({ path: "/work/one", status: "error" });
    expect(rerun[1]).toMatchObject({ id: "cmake-0-2", path: "/work/two", status: "waiting" });
  });
});
