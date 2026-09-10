import {
  PREVIEW_AUTO_BUILD_SAMPLE,
  type PreviewAutoBuildSample,
} from "./previewAutoBuildSample.js";
import { createPreviewAutoBuildSession, reducePreviewAutoBuildSession, type PreviewAutoBuildSession, type PreviewBuildSessionIntent } from "./previewAutoBuildSession.js";
import { updatePreviewAutoBuildExecution, updatePreviewAutoBuildRepository } from "./previewAutoBuildDraft.js";

export type PreviewBuildStatusTone = "idle" | "progress" | "success" | "warning";

export type PreviewAutoBuildPhase = "idle" | "preflightPassed" | "running" | "stopped";

export interface PreviewAutoBuildState {
  readonly session: PreviewAutoBuildSession;
  readonly phase: PreviewAutoBuildPhase;
  readonly status: string;
  readonly tone: PreviewBuildStatusTone;
  readonly parallelBuild: boolean;
  readonly cmakeBuildTypes: readonly ("Debug" | "Release")[];
  readonly currentConfigName: string;
  readonly probeColumnsVisible: boolean;
  readonly updateRootDirectory: boolean;
  readonly updateThirdParty: boolean;
  readonly rootEnabled: boolean;
  readonly thirdPartyEnabled: boolean;
  readonly cleanupPatternsYaml: string;
  readonly rootScriptStatus: string;
  readonly repositoryCleanupStatus: string;
  readonly cleanupStatus: string;
  readonly environmentExpanded: boolean;
  readonly maintenanceExpanded: boolean;
}

export type PreviewAutoBuildExecutionActionId = "openScript" | "preflight" | "start" | "stop";

export interface PreviewAutoBuildExecutionAction {
  readonly actionId: PreviewAutoBuildExecutionActionId;
  readonly label: string;
  readonly primary: boolean;
  readonly disabled: boolean;
}

export interface PreviewAutoBuildDerivedState {
  readonly executionActions: readonly PreviewAutoBuildExecutionAction[];
  readonly enabledProjectMetric: string;
  readonly taskProgress: string;
  readonly failedTaskMetric: string;
  readonly parallelDisabled: boolean;
  readonly recentConfigDisabled: boolean;
  readonly maintenanceActionsDisabled: boolean;
  readonly configurationOptionsDisabled: boolean;
  readonly environmentExecutionMode: string;
  readonly rightModeLabel: string;
  readonly rightRunLabel: string;
  readonly rightTaskStatus: string;
  readonly cleanupPreviewDisabled: boolean;
  readonly cleanupActionLabel: string;
}

export type PreviewAutoBuildIntent =
  | { readonly type: "session"; readonly action: PreviewBuildSessionIntent }
  | { readonly type: "preflight" }
  | { readonly type: "start" }
  | { readonly type: "stop" }
  | { readonly type: "toggleRun" }
  | { readonly type: "setParallel"; readonly enabled: boolean }
  | { readonly type: "setCmakeBuildTypes"; readonly selected: readonly ("Debug" | "Release")[] }
  | { readonly type: "selectRecent"; readonly name: string }
  | { readonly type: "setProbeColumnsVisible"; readonly visible: boolean }
  | { readonly type: "setRepositoryUpdate"; readonly target: "root" | "thirdParty"; readonly enabled: boolean }
  | { readonly type: "setRepositoryEnabled"; readonly target: "root" | "thirdParty"; readonly enabled: boolean }
  | { readonly type: "openScript" }
  | { readonly type: "openCleanup" }
  | { readonly type: "saveConfig" }
  | { readonly type: "syncScript" }
  | { readonly type: "cleanRepositories" }
  | { readonly type: "setCleanupPatternsYaml"; readonly value: string }
  | { readonly type: "cleanRoot" }
  | { readonly type: "setEnvironmentExpanded"; readonly expanded: boolean }
  | { readonly type: "setMaintenanceExpanded"; readonly expanded: boolean };

export interface PreviewAutoBuildTransition {
  readonly state: PreviewAutoBuildState;
  readonly output?: string;
}

export function createDefaultPreviewAutoBuildState(
  sample: PreviewAutoBuildSample = PREVIEW_AUTO_BUILD_SAMPLE,
): PreviewAutoBuildState {
  return Object.freeze({
    session: createPreviewAutoBuildSession(sample),
    phase: sample.initial.phase,
    status: sample.initial.status,
    tone: sample.initial.tone,
    parallelBuild: sample.initial.parallelBuild,
    cmakeBuildTypes: ["Debug", "Release"] as const,
    currentConfigName: sample.configuration.currentConfigName,
    probeColumnsVisible: sample.initial.probeColumnsVisible,
    updateRootDirectory: sample.configuration.updateRootDirectory,
    updateThirdParty: sample.configuration.updateThirdParty,
    rootEnabled: sample.repositories.find(({ kind }) => kind === "Root")?.enabled !== false,
    thirdPartyEnabled: sample.repositories.find(({ kind }) => kind === "3rdParty")?.enabled !== false,
    cleanupPatternsYaml: sample.maintenance.rootCleanupPatternsYaml,
    rootScriptStatus: sample.maintenance.rootScriptStatus,
    repositoryCleanupStatus: sample.maintenance.repositoryCleanupStatus,
    cleanupStatus: sample.maintenance.rootCleanupStatus,
    environmentExpanded: sample.primaryBlocks.environmentExpanded,
    maintenanceExpanded: sample.primaryBlocks.maintenanceExpanded,
  });
}

export function derivePreviewAutoBuildState(
  state: PreviewAutoBuildState,
  sample: PreviewAutoBuildSample = PREVIEW_AUTO_BUILD_SAMPLE,
): PreviewAutoBuildDerivedState {
  const running = state.phase === "running";
  const projects = state.session.draft.repositories.filter(({ kind }) => kind === "项目");
  const enabledProjects = projects.filter(({ enabled }) => enabled).length;
  return Object.freeze({
    executionActions: Object.freeze([
      Object.freeze({ actionId: "openScript", label: "脚本", primary: false, disabled: false }),
      Object.freeze({ actionId: "preflight", label: "预检配置", primary: false, disabled: running }),
      Object.freeze({ actionId: "start", label: "启动", primary: true, disabled: running }),
      Object.freeze({ actionId: "stop", label: "停止", primary: false, disabled: !running }),
    ]),
    enabledProjectMetric: `${enabledProjects} / ${projects.length}`,
    // A ready/preflight snapshot is not a completed build.
    taskProgress: `${state.session.tasks.filter((task) => !["waiting", "running"].includes(task.status)).length} / ${state.session.tasks.length}`,
    failedTaskMetric: String(state.session.tasks.filter((task) => task.status === "failed").length),
    parallelDisabled: running,
    recentConfigDisabled: running,
    maintenanceActionsDisabled: running,
    configurationOptionsDisabled: running,
    environmentExecutionMode: state.parallelBuild
      ? sample.environment.parallelExecution
      : sample.environment.sequentialExecution,
    rightModeLabel: `${enabledProjects} 个启用 · ${state.parallelBuild ? "并行执行" : "顺序执行"}`,
    rightRunLabel: running ? "停止" : "运行",
    rightTaskStatus: running ? "进行中" : "等待",
    cleanupPreviewDisabled: running || !state.cleanupPatternsYaml.trim(),
    cleanupActionLabel: "清理",
  });
}

export function reducePreviewAutoBuildState(
  state: PreviewAutoBuildState,
  intent: PreviewAutoBuildIntent,
  sample: PreviewAutoBuildSample = PREVIEW_AUTO_BUILD_SAMPLE,
): PreviewAutoBuildTransition {
  switch (intent.type) {
    case "session": return withSession(state, reducePreviewAutoBuildSession(state.session, intent.action));
    case "setCmakeBuildTypes": {
      if (state.phase === "running") return unchanged(state);
      const selected = (["Debug", "Release"] as const).filter((type) => intent.selected.includes(type));
      const session = reducePreviewAutoBuildSession(state.session, { type: "edit", change: updatePreviewAutoBuildExecution(state.session.draft, { parallelBuild: state.parallelBuild, cmakeBuildTypes: selected }) });
      return changed(state, { session, cmakeBuildTypes: selected, phase: "idle", status: "编译选项已变更，请重新预检", tone: "idle" }, `[编译工具] CMake 配置：${selected.join(" + ") || "未选择（无法启动）"}（模拟）`);
    }
    case "preflight": {
      if (state.phase === "running") return unchanged(state);
      const projects = state.session.draft.repositories.filter(({ kind, enabled }) => kind === "项目" && enabled);
      const cmakeProjects = projects.filter(({ operations }) => operations.some(({ id, enabled }) => id === "cmake" && enabled)).length;
      const caaProjects = projects.filter(({ operations }) => operations.some(({ id, enabled }) => id === "caa" && enabled)).length;
      if (cmakeProjects && !state.cmakeBuildTypes.length) return changed(state, { status: "请选择 Debug 或 Release", tone: "warning" }, "[编译工具] 预检未通过：至少选择一种 CMake 编译配置");
      const session = reducePreviewAutoBuildSession(state.session, { type: "preflight" });
      if (session.preflightRevision === undefined) return withSession(state, session);
      return changed(state, { session, phase: "preflightPassed", status: "预检通过", tone: "success" },
        `[编译工具] 预检通过：${projects.length} 个项目，CMake ${cmakeProjects} 个，CAA ${caaProjects} 个，失败 0 个`);
    }
    case "start": {
      if (state.phase === "running") return unchanged(state);
      if (!state.cmakeBuildTypes.length) return changed(state, { status: "请选择 Debug 或 Release", tone: "warning" }, "[编译工具] 未启动：至少选择一种 CMake 编译配置");
      if (!state.session.draft.repositories.some((row) => row.kind === "项目" && row.enabled)) return changed(state, { status: "没有启用项目", tone: "warning" });
      const session = reducePreviewAutoBuildSession(state.session, { type: "start" });
      return changed(state, { session, phase: "running", status: "运行中", tone: "progress" },
        `[编译工具] 模拟启动：${sample.tasks[0]!.name} → ${state.parallelBuild ? "CMake + CAA（并行执行）" : "CMake → CAA（顺序执行）"}`);
    }
    case "stop": {
      if (state.phase !== "running") return unchanged(state);
      return changed(state, { session: reducePreviewAutoBuildSession(state.session, { type: "stop" }), phase: "stopped", status: "已停止", tone: "warning" },
        "[编译工具] 已请求停止全部任务");
    }
    case "toggleRun":
      return reducePreviewAutoBuildState(state, { type: state.phase === "running" ? "stop" : "start" }, sample);
    case "setParallel": {
      if (state.phase === "running" || intent.enabled === state.parallelBuild) return unchanged(state);
      const session = reducePreviewAutoBuildSession(state.session, { type: "edit", change: updatePreviewAutoBuildExecution(state.session.draft, { parallelBuild: intent.enabled, cmakeBuildTypes: state.cmakeBuildTypes }) });
      return changed(state, { session, parallelBuild: intent.enabled, phase: "idle", status: "执行模式已变更，请重新预检", tone: "idle" },
        `[编译工具] 执行模式：${intent.enabled ? "并行编译" : "顺序编译"}`);
    }
    case "selectRecent": {
      if (state.phase === "running") return unchanged(state);
      const name = intent.name.trim().slice(0, 256);
      if (!name || !state.session.saved.some((item) => item.name === name)) return unchanged(state);
      return withSession(state, reducePreviewAutoBuildSession(state.session, { type: "open", name, decision: "discard" }));
    }
    case "setProbeColumnsVisible": {
      if (intent.visible === state.probeColumnsVisible) return unchanged(state);
      return changed(state, { probeColumnsVisible: intent.visible },
        `[编译工具] ${intent.visible ? "显示" : "隐藏"} Commit / Origin / 状态探测列`);
    }
    case "setRepositoryUpdate": {
      if (state.phase === "running") return unchanged(state);
      const key = intent.target === "root" ? "updateRootDirectory" : "updateThirdParty";
      if (state[key] === intent.enabled) return unchanged(state);
      const label = intent.target === "root" ? "ROOT_DIR" : "3rdParty";
      const row = state.session.draft.repositories.find((item) => item.kind === (intent.target === "root" ? "Root" : "3rdParty"));
      const session = row ? reducePreviewAutoBuildSession(state.session, { type: "edit", change: updatePreviewAutoBuildRepository(state.session.draft, row.id, { update: intent.enabled }) }) : state.session;
      return changed(state, { session, [key]: intent.enabled, phase: "idle" },
        `[编译工具] ${intent.enabled ? "启用" : "停用"}更新 ${label}`);
    }
    case "setRepositoryEnabled": {
      if (state.phase === "running") return unchanged(state);
      const key = intent.target === "root" ? "rootEnabled" : "thirdPartyEnabled";
      if (state[key] === intent.enabled) return unchanged(state);
      const label = intent.target === "root" ? "ROOT_DIR" : "3rdParty";
      const row = state.session.draft.repositories.find((item) => item.kind === (intent.target === "root" ? "Root" : "3rdParty"));
      const session = row ? reducePreviewAutoBuildSession(state.session, { type: "edit", change: updatePreviewAutoBuildRepository(state.session.draft, row.id, { enabled: intent.enabled }) }) : state.session;
      return changed(state, { session, [key]: intent.enabled, phase: "idle" },
        `[编译工具] ${intent.enabled ? "启用" : "停用"}仓库 ${label}`);
    }
    case "openScript": {
      const output = "[编译工具] 打开脚本管理（模拟）：构建 / 检出 / 版本归档";
      if (state.phase === "running") return unchanged(state, output);
      return changed(state, { status: "脚本已定位", tone: "success" }, output);
    }
    case "openCleanup":
      if (state.phase === "running") return unchanged(state);
      return unchanged(state, "[编译工具] 打开统一清理对话框（模拟）");
    case "saveConfig":
      if (state.phase === "running") return unchanged(state);
      return withSession(state, reducePreviewAutoBuildSession(state.session, { type: "save" }));
    case "syncScript":
      if (state.phase === "running") return unchanged(state);
      return changed(state, { rootScriptStatus: "脚本已同步" },
        "[编译工具] 已模拟同步 ROOT/tools 与 ROOT/sample 脚本");
    case "cleanRepositories":
      if (state.phase === "running") return unchanged(state);
      return changed(state, { repositoryCleanupStatus: "已模拟" },
        "[编译工具] 已手动触发仓库清理（模拟）；未执行真实命令");
    case "setCleanupPatternsYaml": {
      if (state.phase === "running") return unchanged(state);
      const cleanupPatternsYaml = intent.value.slice(0, 4_096);
      if (cleanupPatternsYaml === state.cleanupPatternsYaml) return unchanged(state);
      return changed(state, { cleanupPatternsYaml, cleanupStatus: sample.maintenance.rootCleanupStatus });
    }
    case "cleanRoot": {
      const patternsYaml = state.cleanupPatternsYaml.trim();
      if (state.phase === "running" || !patternsYaml) return unchanged(state);
      const count = sample.maintenance.rootCleanupPreviewCount;
      return changed(state, { cleanupStatus: `已模拟清理 ${count} 项` },
        `[编译工具] 已模拟 Root 清理：直属目录/文件规则 · ${count} 项；未删除真实文件`);
    }
    case "setEnvironmentExpanded":
      return intent.expanded === state.environmentExpanded
        ? unchanged(state)
        : changed(state, { environmentExpanded: intent.expanded });
    case "setMaintenanceExpanded":
      return intent.expanded === state.maintenanceExpanded
        ? unchanged(state)
        : changed(state, { maintenanceExpanded: intent.expanded });
  }
}

function withSession(state: PreviewAutoBuildState, session: PreviewAutoBuildSession): PreviewAutoBuildTransition {
  if (session === state.session) return unchanged(state);
  return changed(state, { session, currentConfigName: session.draft.configuration.currentConfigName,
    parallelBuild: session.draft.execution.parallelBuild, cmakeBuildTypes: session.draft.execution.cmakeBuildTypes,
    rootEnabled: session.draft.repositories.find((row) => row.kind === "Root")?.enabled !== false,
    thirdPartyEnabled: session.draft.repositories.find((row) => row.kind === "3rdParty")?.enabled !== false,
    updateRootDirectory: session.draft.configuration.updateRootDirectory, updateThirdParty: session.draft.configuration.updateThirdParty,
    phase: session.running ? "running" : session.preflightRevision !== undefined ? "preflightPassed" : "idle",
    status: session.message, tone: session.running ? "progress" : session.tasks.some((task) => task.status === "failed") ? "warning" : "idle",
  }, `[编译工具] ${session.message}`);
}

function changed(
  state: PreviewAutoBuildState,
  patch: Partial<PreviewAutoBuildState>,
  output?: string,
): PreviewAutoBuildTransition {
  return Object.freeze({ state: Object.freeze({ ...state, ...patch }), ...(output ? { output } : {}) });
}

function unchanged(state: PreviewAutoBuildState, output?: string): PreviewAutoBuildTransition {
  return Object.freeze({ state, ...(output ? { output } : {}) });
}
