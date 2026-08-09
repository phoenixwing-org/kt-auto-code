import { describe, expect, it } from "vitest";
import { KtcSelectRunDisplayTargets, KtcSelectRunExecutionProvider } from "./KtcRunDisplayTargets.js";
import type { KtcPnwRunTarget } from "./KtcRunWingAdapter.js";

function KtcTarget(id: string, action: string, sourceKind: string): KtcPnwRunTarget {
  return {
    id,
    projectId: "caa",
    label: action === "caa-build" ? "MK" : "Run",
    action,
    sourceKind,
    platforms: ["win32"],
    cwd: "C:/workspace/caa",
    args: [],
    envKeys: ["CAA_MK_VERSION"],
    problemMatchers: action === "caa-build" ? ["$pnwCaaMsCompile"] : [],
    matcherFidelity: "generated",
    risk: "build",
    priority: sourceKind === "bundled" ? 10 : 100,
  };
}

describe("Run display target selection", () => {
  it("保留推荐 Task，同时让 CAA 内置组固定出现 MK 和 Run", () => {
    const taskMk = KtcTarget("task-mk", "caa-build", "native-task");
    const taskRun = KtcTarget("task-run", "caa-run", "native-task");
    const builtInMk = KtcTarget("builtin-mk", "caa-build", "bundled");
    const builtInRun = KtcTarget("builtin-run", "caa-run", "bundled");
    const selected = KtcSelectRunDisplayTargets([], [
      { projectId: "caa", action: "caa-build", recommended: taskMk, alternatives: [builtInMk] },
      { projectId: "caa", action: "caa-run", recommended: taskRun, alternatives: [builtInRun] },
    ]);

    expect(selected.map((item) => item.target.id)).toEqual([
      "task-mk", "builtin-mk", "task-run", "builtin-run",
    ]);
    expect(selected.filter((item) => item.target.sourceKind === "bundled").map((item) => item.target.action)).toEqual([
      "caa-build", "caa-run",
    ]);
  });

  it("推荐来源已经是内置时不重复", () => {
    const builtInMk = KtcTarget("builtin-mk", "caa-build", "bundled");
    const selected = KtcSelectRunDisplayTargets([], [
      { projectId: "caa", action: "caa-build", recommended: builtInMk, alternatives: [] },
    ]);
    expect(selected.map((item) => item.target.id)).toEqual(["builtin-mk"]);
  });

  it("关联工程只改变 MK 的执行 provider，不改变列表中的 Task 身份", () => {
    const taskMk = KtcTarget("task-mk", "caa-build", "native-task");
    const builtInMk = KtcTarget("builtin-mk", "caa-build", "bundled");
    const row = { target: taskMk, alternatives: [builtInMk] };

    const selected = KtcSelectRunExecutionProvider(row, { requireBundledCaaBuild: true });

    expect(row.target).toBe(taskMk);
    expect(selected.target).toBe(builtInMk);
    expect(selected.alternatives.map((item) => item.id)).toEqual(["task-mk"]);
  });

  it("未关联工程或所选行本来就是内置 MK 时保持原 provider", () => {
    const taskMk = KtcTarget("task-mk", "caa-build", "native-task");
    const builtInMk = KtcTarget("builtin-mk", "caa-build", "bundled");

    expect(KtcSelectRunExecutionProvider(
      { target: taskMk, alternatives: [builtInMk] },
      { requireBundledCaaBuild: false },
    ).target).toBe(taskMk);
    expect(KtcSelectRunExecutionProvider(
      { target: builtInMk, alternatives: [taskMk] },
      { requireBundledCaaBuild: true },
    ).target).toBe(builtInMk);
  });

  it("需要关联工程但没有 bundled provider 时明确报错", () => {
    const taskMk = KtcTarget("task-mk", "caa-build", "native-task");
    expect(() => KtcSelectRunExecutionProvider(
      { target: taskMk, alternatives: [] },
      { requireBundledCaaBuild: true },
    )).toThrow("需要内置 CAA MK runner");
  });
});
