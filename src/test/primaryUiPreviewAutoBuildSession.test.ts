import { describe, expect, it } from "vitest";
import { createPreviewAutoBuildSession, isPreviewAutoBuildDirty, reducePreviewAutoBuildSession, type PreviewAutoBuildSession } from "../../ui-preview/src/previewAutoBuildSession.js";
import { updatePreviewAutoBuildConfiguration, updatePreviewAutoBuildExecution, updatePreviewAutoBuildRepository } from "../../ui-preview/src/previewAutoBuildDraft.js";

function finish(session: PreviewAutoBuildSession): PreviewAutoBuildSession {
  let current = session;
  for (let count = 0; count < 100 && current.running; count += 1) current = reducePreviewAutoBuildSession(current, { type: "advance", epoch: current.epoch });
  expect(current.running).toBe(false); return current;
}
function edit(session: PreviewAutoBuildSession, id: string, branch: string) {
  return reducePreviewAutoBuildSession(session, { type: "edit", change: updatePreviewAutoBuildRepository(session.draft, id, { branch }) });
}
describe("AutoBuild Preview session and checkpoint", () => {
  it("新开未自动选 MRU，保存 checkpoint 后编辑成为 dirty，打开恢复完整项目与执行选项", () => {
    let state = createPreviewAutoBuildSession();
    expect(state.checkpoint).toBeUndefined(); expect(isPreviewAutoBuildDirty(state)).toBe(true);
    state = reducePreviewAutoBuildSession(state, { type: "edit", change: updatePreviewAutoBuildExecution(state.draft, { parallelBuild: true, cmakeBuildTypes: ["Release"] }) });
    state = reducePreviewAutoBuildSession(state, { type: "save", name: "profile.json" });
    expect(isPreviewAutoBuildDirty(state)).toBe(false);
    const saved = state.draft;
    state = edit(state, "ktcore", "changed"); expect(isPreviewAutoBuildDirty(state)).toBe(true);
    state = reducePreviewAutoBuildSession(state, { type: "open", name: "profile.json", decision: "discard" });
    expect(state.draft.repositories).toEqual(saved.repositories);
    expect(state.draft.execution).toEqual({ parallelBuild: true, cmakeBuildTypes: ["Release"] });
    expect(isPreviewAutoBuildDirty(state)).toBe(false);
  });
  it("关闭的保存/不保存/取消有独立结果，取消不落表，重开不是上次 MRU", () => {
    const initial = edit(createPreviewAutoBuildSession(), "ktcore", "draft-change");
    const cancelled = reducePreviewAutoBuildSession(initial, { type: "close", decision: "cancel" });
    expect(cancelled.draft).toBe(initial.draft);
    const discarded = reducePreviewAutoBuildSession(initial, { type: "close", decision: "discard" });
    expect(discarded.checkpoint).toBeUndefined(); expect(discarded.draft.configuration.currentConfigName).toBe("未保存");
    const saved = reducePreviewAutoBuildSession(initial, { type: "close", decision: "save", name: "kept.json" });
    expect(saved.saved.find((item) => item.name === "kept.json")?.draft.repositories[2].branch).toBe("draft-change");
    expect(saved.checkpoint).toBeUndefined();
  });
  it("同名配置保存后继续打开不会重载保存前的旧 checkpoint", () => {
    let state = reducePreviewAutoBuildSession(createPreviewAutoBuildSession(), { type: "save", name: "same.json" });
    state = edit(state, "ktcore", "keep-latest");
    state = reducePreviewAutoBuildSession(state, { type: "open", name: "same.json", decision: "save" });
    expect(state.draft.repositories[2].branch).toBe("keep-latest");
    expect(isPreviewAutoBuildDirty(state)).toBe(false);
  });
  it("目录不一致必须先选新建空项目或保留项目，错误选择不丢草稿", () => {
    let state = reducePreviewAutoBuildSession(createPreviewAutoBuildSession(), { type: "save", name: "old.json" });
    state = reducePreviewAutoBuildSession(state, { type: "edit", change: updatePreviewAutoBuildConfiguration(state.draft, { workingDirectory: "/workspace/Other" }) });
    const rejected = reducePreviewAutoBuildSession(state, { type: "open", name: "old.json", decision: "discard" });
    expect(rejected.draft).toBe(state.draft); expect(rejected.message).toContain("不一致");
    const fresh = reducePreviewAutoBuildSession(state, { type: "open", name: "old.json", decision: "discard", mismatch: "new" });
    expect(fresh.draft.repositories.map((row) => row.kind)).toEqual(["Root", "3rdParty"]);
    const kept = reducePreviewAutoBuildSession(state, { type: "open", name: "old.json", decision: "discard", mismatch: "keep" });
    expect(kept.draft.repositories).toHaveLength(4); expect(kept.probes).toEqual([]);
  });
  it("探测请求按 token/epoch/revision 隔离，取消、编辑、关闭后的迟到结果无效", () => {
    const started = reducePreviewAutoBuildSession(createPreviewAutoBuildSession(), { type: "probe", repositoryId: "ktcore" });
    const request = started.pendingProbes[0];
    const cancelled = reducePreviewAutoBuildSession(started, { type: "cancelProbe", repositoryId: "ktcore" });
    expect(reducePreviewAutoBuildSession(cancelled, { type: "probeResult", request, status: "clean" })).toBe(cancelled);
    const edited = edit(started, "ktcore", "new");
    expect(reducePreviewAutoBuildSession(edited, { type: "probeResult", request, status: "clean" })).toBe(edited);
    const closed = reducePreviewAutoBuildSession(started, { type: "close", decision: "discard" });
    expect(reducePreviewAutoBuildSession(closed, { type: "probeResult", request, status: "clean" })).toBe(closed);
    expect(reducePreviewAutoBuildSession(started, { type: "probeResult", request, status: "not-git" }).probes[0].status).toBe("not-git");
  });
  it("空项目/dirty/非 Git 场景不会显示预检成功", () => {
    let state = createPreviewAutoBuildSession();
    for (const row of state.draft.repositories.filter((row) => row.kind === "项目")) state = reducePreviewAutoBuildSession(state, { type: "remove", repositoryId: row.id });
    expect(reducePreviewAutoBuildSession(state, { type: "preflight" }).message).toContain("没有启用项目");
    state = reducePreviewAutoBuildSession(createPreviewAutoBuildSession(), { type: "probe", repositoryId: "ktcore" });
    state = reducePreviewAutoBuildSession(state, { type: "probeResult", request: state.pendingProbes[0], status: "dirty" });
    expect(reducePreviewAutoBuildSession(state, { type: "preflight" }).preflightRevision).toBeUndefined();
  });
  it("固定仓库不可移除，稳定 ID 上下移动不依赖 DOM 顺序", () => {
    const initial = createPreviewAutoBuildSession();
    expect(reducePreviewAutoBuildSession(initial, { type: "remove", repositoryId: "root" }).draft).toBe(initial.draft);
    const moved = reducePreviewAutoBuildSession(initial, { type: "move", repositoryId: "bom", offset: -1 });
    expect(moved.draft.repositories.map((row) => row.id)).toEqual(["root", "third-party", "bom", "ktcore"]);
    expect(reducePreviewAutoBuildSession(moved, { type: "move", repositoryId: "bom", offset: -1 })).toBe(moved);
  });
});
describe("AutoBuild Preview task results", () => {
  it("按实际计划推进等待/运行/成功，并且成功计数不是固定第一行", () => {
    const initial = createPreviewAutoBuildSession();
    const started = reducePreviewAutoBuildSession(initial, { type: "start" });
    expect(started.tasks.filter((task) => task.status === "running")).toHaveLength(1);
    const done = finish(started);
    expect(done.tasks.every((task) => task.status === "success")).toBe(true);
    expect(done.message).toContain(`成功 ${done.tasks.length}`);
  });
  it("Root 失败只阻断 CMake 依赖，CAA 独立项目仍成功，单行重试保留另一行结果", () => {
    let state = createPreviewAutoBuildSession();
    state = reducePreviewAutoBuildSession(state, { type: "outcome", taskId: "root:repository", outcome: "failed" });
    state = finish(reducePreviewAutoBuildSession(state, { type: "start" }));
    expect(state.tasks.find((task) => task.id === "ktcore:cmake")?.status).toBe("skipped");
    expect(state.tasks.find((task) => task.id === "bom:caa")?.status).toBe("success");
    const unrelated = state.tasks.find((task) => task.id === "bom:caa");
    state = reducePreviewAutoBuildSession(state, { type: "outcome", taskId: "root:repository", outcome: "success" });
    state = finish(reducePreviewAutoBuildSession(state, { type: "start", taskId: "ktcore:cmake" }));
    expect(state.tasks.find((task) => task.id === "ktcore:cmake")?.status).toBe("success");
    expect(state.tasks.find((task) => task.id === "bom:caa")).toBe(unrelated);
  });
  it("导出失败只阻断对应构建，显式跳过有真实状态", () => {
    let state = createPreviewAutoBuildSession();
    state = reducePreviewAutoBuildSession(state, { type: "outcome", taskId: "ktcore:export", outcome: "failed" });
    state = reducePreviewAutoBuildSession(state, { type: "outcome", taskId: "bom:link", outcome: "skipped" });
    const done = finish(reducePreviewAutoBuildSession(state, { type: "start" }));
    expect(done.tasks.find((task) => task.id === "ktcore:cmake")?.status).toBe("skipped");
    expect(done.tasks.find((task) => task.id === "bom:link")?.status).toBe("skipped");
    expect(done.tasks.find((task) => task.id === "bom:caa")?.status).toBe("skipped");
  });
  it("停止保留已完成结果、取消后续调度，旧 epoch 与运行期编辑被拒绝", () => {
    let state = reducePreviewAutoBuildSession(createPreviewAutoBuildSession(), { type: "start" });
    const oldEpoch = state.epoch;
    const unchanged = edit(state, "ktcore", "should-not-apply"); expect(unchanged.draft).toBe(state.draft);
    state = reducePreviewAutoBuildSession(state, { type: "advance", epoch: oldEpoch });
    state = reducePreviewAutoBuildSession(state, { type: "stop" });
    expect(state.tasks[0].status).toBe("success"); expect(state.tasks.some((task) => task.status === "cancelled")).toBe(true);
    expect(reducePreviewAutoBuildSession(state, { type: "advance", epoch: oldEpoch })).toBe(state);
  });
  it("并行模式只启动依赖已满足的任务，不将运行数误报完成数", () => {
    let state = createPreviewAutoBuildSession();
    state = reducePreviewAutoBuildSession(state, { type: "edit", change: updatePreviewAutoBuildExecution(state.draft, { parallelBuild: true, cmakeBuildTypes: ["Debug"] }) });
    state = reducePreviewAutoBuildSession(state, { type: "start" });
    expect(state.tasks.filter((task) => task.status === "running").length).toBeGreaterThan(1);
    expect(state.tasks.filter((task) => task.status === "success")).toHaveLength(0);
    expect(finish(state).tasks.every((task) => task.status === "success")).toBe(true);
  });
  it("改项目只清该项目及依赖结果，预检与执行请求总是失效", () => {
    let state = finish(reducePreviewAutoBuildSession(createPreviewAutoBuildSession(), { type: "start" }));
    const unrelated = state.tasks.find((task) => task.id === "bom:caa");
    state = reducePreviewAutoBuildSession(state, { type: "preflight" });
    const changed = edit(state, "ktcore", "other");
    expect(changed.preflightRevision).toBeUndefined(); expect(changed.epoch).toBeGreaterThan(state.epoch);
    expect(changed.tasks.find((task) => task.id === "ktcore:cmake")?.status).toBe("waiting");
    expect(changed.tasks.find((task) => task.id === "bom:caa")).toBe(unrelated);
  });
});
