import { createPreviewAutoBuildDraft, type PreviewAutoBuildDraft, type PreviewAutoBuildDraftChange } from "./previewAutoBuildDraft.js";
import { PREVIEW_AUTO_BUILD_SAMPLE, type PreviewAutoBuildSample } from "./previewAutoBuildSample.js";

export type PreviewBuildTaskStatus = "waiting" | "running" | "success" | "failed" | "skipped" | "cancelled";
export type PreviewBuildProbeStatus = "clean" | "dirty" | "missing" | "not-git" | "invalid";
export interface PreviewBuildTask {
  readonly id: string; readonly repositoryId: string; readonly name: string;
  readonly phase: "repository" | "link" | "export" | "cmake" | "caa";
  readonly dependencies: readonly string[]; readonly status: PreviewBuildTaskStatus;
  readonly message: string; readonly outcome: "success" | "failed" | "skipped";
}
export interface PreviewBuildProbe {
  readonly repositoryId: string; readonly status: PreviewBuildProbeStatus; readonly message: string;
}
export interface PreviewBuildProbeRequest { readonly token: number; readonly epoch: number; readonly repositoryId: string; readonly revision: number; }
export interface PreviewBuildCheckpoint { readonly name: string; readonly draft: PreviewAutoBuildDraft; }
export interface PreviewAutoBuildSession {
  readonly draft: PreviewAutoBuildDraft; readonly checkpoint: PreviewBuildCheckpoint | undefined;
  readonly saved: readonly PreviewBuildCheckpoint[]; readonly epoch: number; readonly sequence: number;
  readonly pendingProbes: readonly PreviewBuildProbeRequest[]; readonly probes: readonly PreviewBuildProbe[];
  readonly tasks: readonly PreviewBuildTask[]; readonly scope: readonly string[]; readonly running: boolean;
  readonly preflightRevision: number | undefined; readonly message: string;
}
export type PreviewBuildSessionIntent =
  | { type: "edit"; change: PreviewAutoBuildDraftChange }
  | { type: "save"; name?: string }
  | { type: "close"; decision: "save" | "discard" | "cancel"; name?: string }
  | { type: "open"; name: string; decision: "save" | "discard" | "cancel"; mismatch?: "new" | "keep"; workingDirectory?: string }
  | { type: "probe"; repositoryId: string }
  | { type: "probeResult"; request: PreviewBuildProbeRequest; status: PreviewBuildProbeStatus }
  | { type: "cancelProbe"; repositoryId: string }
  | { type: "remove"; repositoryId: string }
  | { type: "move"; repositoryId: string; offset: -1 | 1 }
  | { type: "preflight" }
  | { type: "start"; taskId?: string; repositoryId?: string }
  | { type: "outcome"; taskId: string; outcome: PreviewBuildTask["outcome"] }
  | { type: "advance"; epoch: number }
  | { type: "stop" };

export function createPreviewAutoBuildSession(sample: PreviewAutoBuildSample = PREVIEW_AUTO_BUILD_SAMPLE): PreviewAutoBuildSession {
  const draft = createPreviewAutoBuildDraft(sample);
  const saved = sample.configuration.recentConfigs.map((name) => Object.freeze({ name, draft: copyDraft(draft, draft.repositories, { currentConfigName: name }) }));
  return freeze({ draft, checkpoint: undefined, saved, epoch: 0, sequence: 0, pendingProbes: [], probes: [], tasks: planTasks(draft), scope: [], running: false, preflightRevision: undefined, message: "内存样例 · 未保存；未访问真实 Git 或文件系统" });
}

export function isPreviewAutoBuildDirty(session: PreviewAutoBuildSession): boolean {
  return !session.checkpoint || fingerprint(session.draft) !== fingerprint(session.checkpoint.draft);
}

export function reducePreviewAutoBuildSession(session: PreviewAutoBuildSession, intent: PreviewBuildSessionIntent): PreviewAutoBuildSession {
  if (session.running && !["advance", "stop", "outcome"].includes(intent.type)) return note(session, "运行中，配置和仓库操作已锁定（模拟）。");
  switch (intent.type) {
    case "edit": {
      if (intent.change.errors.length) return note(session, intent.change.errors.join("；"));
      if (intent.change.draft === session.draft) return note(session, intent.change.warnings.join("；") || "草稿未改变。");
      return replaceDraft(session, intent.change.draft, `草稿已更新（模拟）：新增 ${intent.change.summary.added} · 更新 ${intent.change.summary.updated} · 移除 ${intent.change.summary.removed} · 忽略 ${intent.change.summary.ignored}${intent.change.warnings.length ? `；${intent.change.warnings.join("；")}` : ""}`);
    }
    case "save": {
      const name = (intent.name ?? session.checkpoint?.name ?? "auto-build.local.json").trim();
      if (!/^[^\\/:\u0000-\u001f]{1,120}\.json$/u.test(name)) return note(session, "请输入不含目录的 .json 配置名称。");
      const draft = copyDraft(session.draft, session.draft.repositories, { currentConfigName: name });
      const checkpoint = Object.freeze({ name, draft });
      return freeze({ ...session, draft, checkpoint, saved: [checkpoint, ...session.saved.filter((item) => item.name !== name)].slice(0, 12), epoch: session.epoch + 1, pendingProbes: [], preflightRevision: undefined, message: `已保存内存 checkpoint：${name}（模拟，未写盘）` });
    }
    case "close": {
      if (intent.decision === "cancel") return note(session, "已取消关闭；草稿保持不变。");
      let current = session;
      if (intent.decision === "save") {
        current = reducePreviewAutoBuildSession(session, { type: "save", name: intent.name });
        if (isPreviewAutoBuildDirty(current)) return current;
      }
      const fresh = createPreviewAutoBuildSession();
      const draft = copyDraft(fresh.draft, fresh.draft.repositories, { workingDirectory: session.draft.configuration.workingDirectory });
      return freeze({ ...fresh, draft, saved: current.saved, epoch: current.epoch + 1, tasks: planTasks(draft), message: "配置已关闭；新草稿未自动载入最近配置（模拟）。" });
    }
    case "open": {
      if (intent.decision === "cancel") return note(session, "已取消打开；草稿保持不变。");
      const target = session.saved.find((item) => item.name === intent.name);
      if (!target) return note(session, "找不到该内存配置。");
      const workingDirectory = intent.workingDirectory ?? session.draft.configuration.workingDirectory;
      const mismatch = target.draft.configuration.workingDirectory !== workingDirectory;
      if (mismatch && !intent.mismatch) return note(session, "配置工作目录不一致：请选择新建空项目或保留配置项目。");
      let current = session;
      if (intent.decision === "save") {
        current = reducePreviewAutoBuildSession(session, { type: "save" });
        if (isPreviewAutoBuildDirty(current)) return current;
      }
      const selected = current.saved.find((item) => item.name === target.name) ?? target;
      const draft = copyDraft(selected.draft, mismatch && intent.mismatch === "new" ? selected.draft.repositories.filter((row) => row.kind !== "项目") : selected.draft.repositories, mismatch ? { workingDirectory } : {});
      return freeze({ ...replaceDraft(current, draft, `已打开 ${target.name}${mismatch ? intent.mismatch === "new" ? "；新建空项目" : "；保留项目，需重新探测" : ""}（模拟）。`), checkpoint: selected, probes: [], tasks: planTasks(draft) });
    }
    case "remove": {
      const row = session.draft.repositories.find((item) => item.id === intent.repositoryId);
      if (!row || row.kind !== "项目") return note(session, "Root / 3rdParty 不能移除。");
      return replaceDraft(session, copyDraft(session.draft, session.draft.repositories.filter((item) => item.id !== row.id)), `已移除样例项目 ${row.name}；未删除文件。`);
    }
    case "move": {
      const rows = [...session.draft.repositories];
      const index = rows.findIndex((item) => item.id === intent.repositoryId);
      const other = index + intent.offset;
      if (rows[index]?.kind !== "项目" || rows[other]?.kind !== "项目") return session;
      [rows[index], rows[other]] = [rows[other], rows[index]];
      return replaceDraft(session, copyDraft(session.draft, rows), "已调整内存项目顺序。");
    }
    case "probe": {
      if (!session.draft.repositories.some((row) => row.id === intent.repositoryId)) return session;
      const request = Object.freeze({ token: session.sequence + 1, epoch: session.epoch, revision: session.draft.revision, repositoryId: intent.repositoryId });
      return freeze({ ...session, sequence: request.token, pendingProbes: [...session.pendingProbes.filter((item) => item.repositoryId !== intent.repositoryId), request], message: "正在探测样例；可取消，不访问真实目录。" });
    }
    case "probeResult": {
      if (intent.request.epoch !== session.epoch || intent.request.revision !== session.draft.revision || !session.pendingProbes.some((item) => item.token === intent.request.token && item.repositoryId === intent.request.repositoryId)) return session;
      const message = ({ clean: "干净（模拟）", dirty: "有未提交改动；保留现场，不自动更新", missing: "目录不存在；需检出（仅计划）", "not-git": "不是 Git 仓库", invalid: "路径无效" })[intent.status];
      return freeze({ ...session, pendingProbes: session.pendingProbes.filter((item) => item.token !== intent.request.token), probes: [...session.probes.filter((item) => item.repositoryId !== intent.request.repositoryId), Object.freeze({ repositoryId: intent.request.repositoryId, status: intent.status, message })], preflightRevision: undefined, message });
    }
    case "cancelProbe": return freeze({ ...session, pendingProbes: session.pendingProbes.filter((item) => item.repositoryId !== intent.repositoryId), message: "已取消该行探测；迟到结果不会落入草稿。" });
    case "preflight": {
      const enabled = session.draft.repositories.filter((row) => row.kind === "项目" && row.enabled);
      const invalid = session.probes.filter((probe) => probe.status !== "clean" && enabled.some((row) => row.id === probe.repositoryId));
      const valid = enabled.length > 0 && enabled.some((row) => row.buildKinds.length || row.operations.some((operation) => operation.id === "update" && operation.enabled)) && invalid.length === 0;
      return freeze({ ...session, preflightRevision: valid ? session.draft.revision : undefined, message: valid ? `预检通过：${enabled.length} 个启用项目（内存模拟）` : `预检未通过：${!enabled.length ? "没有启用项目" : invalid.length ? `${invalid.length} 个项目被探测状态阻断` : "未选择更新或构建操作"}。` });
    }
    case "outcome": return freeze({ ...session, tasks: session.tasks.map((task) => task.id === intent.taskId && task.status !== "running" ? Object.freeze({ ...task, outcome: intent.outcome }) : task) });
    case "start": {
      let tasks = session.tasks;
      const selected = intent.taskId ? tasks.filter((task) => task.id === intent.taskId) : intent.repositoryId ? tasks.filter((task) => task.repositoryId === intent.repositoryId) : tasks;
      if (!selected.length) return note(session, "没有可运行任务；请启用项目并选择操作。");
      const scope = new Set(selected.map((task) => task.id));
      const addDependencies = (task: PreviewBuildTask) => task.dependencies.forEach((id) => { const dependency = tasks.find((item) => item.id === id); if (dependency && !scope.has(id) && dependency.status !== "success") { scope.add(id); addDependencies(dependency); } });
      selected.forEach(addDependencies);
      tasks = tasks.map((task) => scope.has(task.id) ? Object.freeze({ ...task, status: "waiting" as const, message: "等待（模拟）" }) : task);
      return schedule(freeze({ ...session, tasks, scope: [...scope], epoch: session.epoch + 1, pendingProbes: [], running: true, message: "运行内存任务（模拟；无真实进程）" }));
    }
    case "advance": {
      if (!session.running || intent.epoch !== session.epoch) return session;
      const tasks = session.tasks.map((task) => {
        if (task.status !== "running") return task;
        const probe = session.probes.find((item) => item.repositoryId === task.repositoryId);
        const status = task.phase === "repository" && probe && probe.status !== "clean" ? "failed" : task.outcome;
        return Object.freeze({ ...task, status, message: status === "failed" ? probe?.message ?? "模拟失败；可单行重试" : status === "skipped" ? "按模拟场景跳过" : "模拟成功；未执行真实命令" });
      });
      return schedule(freeze({ ...session, tasks }));
    }
    case "stop": return freeze({ ...session, running: false, epoch: session.epoch + 1, scope: [], tasks: session.tasks.map((task) => task.status === "running" || task.status === "waiting" && session.scope.includes(task.id) ? Object.freeze({ ...task, status: "cancelled" as const, message: "已取消；不再调度" }) : task), message: "已停止模拟任务；保留已完成结果。" });
  }
}

function schedule(session: PreviewAutoBuildSession): PreviewAutoBuildSession {
  const tasks = [...session.tasks];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    if (!session.scope.includes(task.id) || task.status !== "waiting") continue;
    const dependencies = task.dependencies.map((id) => tasks.find((item) => item.id === id)).filter((item) => !!item);
    if (dependencies.some((item) => ["failed", "skipped", "cancelled"].includes(item.status))) tasks[index] = Object.freeze({ ...task, status: "skipped", message: "依赖失败/跳过/取消，仅阻断此依赖链" });
    else if (dependencies.every((item) => item.status === "success")) {
      tasks[index] = Object.freeze({ ...task, status: "running", message: "运行中（模拟）" });
      if (!session.draft.execution.parallelBuild) return freeze({ ...session, tasks, running: true });
    }
  }
  const remaining = tasks.some((task) => session.scope.includes(task.id) && (task.status === "waiting" || task.status === "running"));
  return freeze({ ...session, tasks, running: remaining, message: remaining ? "等待依赖（模拟）" : `模拟任务结束：成功 ${tasks.filter((task) => task.status === "success").length} · 失败 ${tasks.filter((task) => task.status === "failed").length} · 跳过 ${tasks.filter((task) => task.status === "skipped").length} · 取消 ${tasks.filter((task) => task.status === "cancelled").length}` });
}
function planTasks(draft: PreviewAutoBuildDraft): readonly PreviewBuildTask[] {
  const rows = draft.repositories.filter((row) => row.enabled);
  const tasks: PreviewBuildTask[] = [];
  const add = (repositoryId: string, phase: PreviewBuildTask["phase"], name: string, dependencies: readonly string[]) => tasks.push(Object.freeze({ id: `${repositoryId}:${phase}`, repositoryId, phase, name, dependencies: Object.freeze([...dependencies]), status: "waiting", message: "等待（模拟）", outcome: "success" }));
  for (const row of rows) add(row.id, "repository", `${row.name} · ${row.operations.some((operation) => operation.id === "update" && operation.enabled) ? "更新计划" : "仓库门禁"}`, []);
  for (const row of rows.filter((item) => item.kind === "项目")) {
    const dependency = [`${row.id}:repository`];
    if (row.operations.some((operation) => operation.id === "link-caa" && operation.enabled)) add(row.id, "link", `${row.name} · linkCAA`, dependency);
    for (const kind of row.buildKinds) {
      const fixed = rows.find((item) => item.kind === (kind === "cmake" ? "Root" : "3rdParty"));
      const prerequisites = [...dependency, ...(fixed ? [`${fixed.id}:repository`] : [])];
      if (kind === "cmake") { add(row.id, "export", `${row.name} · 导出参数`, prerequisites); prerequisites.push(`${row.id}:export`); }
      if (kind === "caa" && tasks.some((item) => item.id === `${row.id}:link`)) prerequisites.push(`${row.id}:link`);
      add(row.id, kind, `${row.name} · ${kind === "cmake" ? "CMake" : "CAA（Windows provider 模拟）"}`, prerequisites);
    }
  }
  return Object.freeze(tasks);
}
function replaceDraft(session: PreviewAutoBuildSession, draft: PreviewAutoBuildDraft, message: string): PreviewAutoBuildSession {
  const sameRow = (id: string) => JSON.stringify(session.draft.repositories.find((row) => row.id === id)) === JSON.stringify(draft.repositories.find((row) => row.id === id));
  const contextSame = session.draft.configuration.workingDirectory === draft.configuration.workingDirectory;
  const plan = planTasks(draft);
  const invalid = new Set(plan.filter((task) => !contextSame || JSON.stringify(session.draft.execution) !== JSON.stringify(draft.execution) || !sameRow(task.repositoryId)).map((task) => task.id));
  for (const task of plan) if (task.dependencies.some((id) => invalid.has(id))) invalid.add(task.id);
  const tasks = plan.map((task) => !invalid.has(task.id) ? session.tasks.find((old) => old.id === task.id) ?? task : task);
  return freeze({ ...session, draft, epoch: session.epoch + 1, pendingProbes: [], preflightRevision: undefined, probes: contextSame ? session.probes.filter((probe) => sameRow(probe.repositoryId)) : [], tasks, scope: [], running: false, message });
}
function copyDraft(draft: PreviewAutoBuildDraft, repositories: PreviewAutoBuildDraft["repositories"], configuration: Partial<PreviewAutoBuildDraft["configuration"]> = {}): PreviewAutoBuildDraft {
  return Object.freeze({ revision: draft.revision + 1, execution: draft.execution, configuration: Object.freeze({ ...draft.configuration, ...configuration }), repositories: Object.freeze([...repositories]) });
}
function fingerprint(draft: PreviewAutoBuildDraft) { return JSON.stringify({ configuration: draft.configuration, repositories: draft.repositories, execution: draft.execution }); }
function note(session: PreviewAutoBuildSession, message: string) { return freeze({ ...session, message }); }
function freeze(session: PreviewAutoBuildSession): PreviewAutoBuildSession { return Object.freeze({ ...session, saved: Object.freeze([...session.saved]), probes: Object.freeze([...session.probes]), pendingProbes: Object.freeze([...session.pendingProbes]), tasks: Object.freeze([...session.tasks]), scope: Object.freeze([...session.scope]) }); }
