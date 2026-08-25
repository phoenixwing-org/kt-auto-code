export type KtcRunPlatform = "win32" | "darwin" | "linux";
export type KtcRunTargetGroupId = "cmake" | "tasks" | "custom" | "builtin";
export type KtcRunExecutionState =
  | "starting"
  | "running"
  | "stopping"
  | "succeeded"
  | "failed"
  | "ended-unknown"
  | "terminated";

export interface KtcRunTargetInput {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly action: string;
  readonly sourceKind: string;
  readonly sourceUri?: string;
  readonly relativePath: string;
  readonly platforms: readonly KtcRunPlatform[];
  readonly cwd: string;
  readonly program?: string;
  readonly args: readonly string[];
  readonly envKeys: readonly string[];
  readonly problemMatchers: readonly string[];
  readonly matcherFidelity: string;
  readonly risk: string;
  readonly disabledReason?: string;
}

export interface KtcRunProjectInput {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly kinds: readonly string[];
  readonly caaVersion?: string;
  readonly caaVersionSource?: string;
  readonly relatedProjectCount?: number;
  readonly relatedProjectSummary?: string;
  readonly targets: readonly KtcRunTargetInput[];
}

export interface KtcRunExecution {
  readonly runId: string;
  readonly targetId: string;
  readonly projectId: string;
  readonly label: string;
  readonly state: KtcRunExecutionState;
  readonly exitCode?: number;
}

export interface KtcRunTarget extends KtcRunTargetInput {
  readonly source: string;
  readonly platformLabel: string;
  readonly availability: "ready" | "other-platform" | "disabled" | "untrusted";
  readonly running?: KtcRunExecution;
}

export interface KtcRunGroup {
  readonly id: KtcRunTargetGroupId;
  readonly title: string;
  readonly targets: readonly KtcRunTarget[];
}

export interface KtcRunProject {
  readonly id: string;
  readonly name: string;
  readonly relativePath: string;
  readonly kindLabel: string;
  readonly caaVersion?: string;
  readonly caaVersionSource?: string;
  readonly relatedProjectCount: number;
  readonly relatedProjectSummary?: string;
  readonly groups: readonly KtcRunGroup[];
}

export interface KtcRunViewModel {
  readonly platform: KtcRunPlatform;
  readonly platformLabel: string;
  readonly trusted: boolean;
  readonly projects: readonly KtcRunProject[];
  readonly executions: readonly KtcRunExecution[];
  readonly statusText: string;
  readonly diagnostics: readonly string[];
  readonly incomplete: boolean;
}

export function KtcCreateRunModel(input: {
  readonly platform: string;
  readonly trusted: boolean;
  readonly projects: readonly KtcRunProjectInput[];
  readonly executions?: readonly KtcRunExecution[];
  readonly diagnostics?: readonly string[];
  readonly incomplete?: boolean;
}): KtcRunViewModel {
  const platform = KtcNormalizeRunPlatform(input.platform);
  const executions = input.executions ?? [];
  const runningByTarget = new Map(executions
    .filter((execution) => ["starting", "running", "stopping"].includes(execution.state))
    .map((execution) => [execution.targetId, execution]));
  const projects = input.projects.map((project) => KtcProject(project, platform, input.trusted, runningByTarget));
  const targetCount = projects.reduce(
    (count, project) => count + project.groups.reduce((subtotal, group) => subtotal + group.targets.length, 0),
    0,
  );
  return {
    platform,
    platformLabel: platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : "Linux",
    trusted: input.trusted,
    projects,
    executions,
    diagnostics: input.diagnostics ?? [],
    incomplete: input.incomplete === true,
    statusText: projects.length === 0
      ? "未发现可运行项目或目标。"
      : `已发现 ${projects.length} 个项目、${targetCount} 个目标${input.incomplete ? "（扫描已达上限）" : ""}。`,
  };
}

function KtcProject(
  project: KtcRunProjectInput,
  platform: KtcRunPlatform,
  trusted: boolean,
  runningByTarget: ReadonlyMap<string, KtcRunExecution>,
): KtcRunProject {
  const groups: KtcRunGroup[] = [
    { id: "cmake", title: "CMake", targets: [] },
    { id: "tasks", title: "Tasks", targets: [] },
    { id: "custom", title: "自定义", targets: [] },
    { id: "builtin", title: "内置", targets: [] },
  ];
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const target of project.targets) {
    const groupId = KtcGroupId(target);
    const group = byId.get(groupId)!;
    (group.targets as KtcRunTarget[]).push(KtcTarget(target, platform, trusted, runningByTarget.get(target.id)));
  }
  return {
    id: project.id,
    name: project.name,
    relativePath: project.relativePath,
    kindLabel: project.kinds.includes("caa") && project.kinds.includes("cmake-cpp")
      ? "CAA / CMake"
      : project.kinds.includes("caa") ? "CAA" : project.kinds.includes("cmake-cpp") ? "CMake C++" : "通用",
    ...(project.caaVersion ? { caaVersion: project.caaVersion } : {}),
    ...(project.caaVersionSource ? { caaVersionSource: project.caaVersionSource } : {}),
    relatedProjectCount: project.relatedProjectCount ?? 0,
    ...(project.relatedProjectSummary ? { relatedProjectSummary: project.relatedProjectSummary } : {}),
    groups,
  };
}

function KtcTarget(
  target: KtcRunTargetInput,
  platform: KtcRunPlatform,
  trusted: boolean,
  running?: KtcRunExecution,
): KtcRunTarget {
  const compatible = target.platforms.includes(platform);
  return {
    ...target,
    source: KtcRunSourceLabel(target.sourceKind),
    platformLabel: target.platforms.length === 3
      ? "全部"
      : target.platforms.map((value) => value === "win32" ? "Windows" : value === "darwin" ? "macOS" : "Linux").join(" / "),
    availability: !trusted ? "untrusted" : target.disabledReason ? "disabled" : compatible ? "ready" : "other-platform",
    ...(running ? { running } : {}),
  };
}

function KtcGroupId(target: KtcRunTargetInput): KtcRunTargetGroupId {
  if (target.action.startsWith("cmake-")) return "cmake";
  if (target.sourceKind === "native-task" || target.sourceKind === "imported-task") return "tasks";
  if (target.sourceKind === "bundled") return "builtin";
  return "custom";
}

function KtcRunSourceLabel(sourceKind: string): string {
  const labels: Record<string, string> = {
    "native-task": "原生 Task",
    "imported-task": "导入 Task",
    configured: "配置",
    "project-script": "脚本",
    bundled: "内置",
    executable: "程序",
  };
  return labels[sourceKind] ?? sourceKind;
}

function KtcNormalizeRunPlatform(platform: string): KtcRunPlatform {
  if (platform === "win32" || platform === "darwin") return platform;
  return "linux";
}
