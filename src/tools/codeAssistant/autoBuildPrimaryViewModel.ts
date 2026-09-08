import type { KtcAutoBuildPrimaryViewModel } from "../../core/autoBuildPrimaryContracts.js";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";
import type { KtcAutoBuildConfiguration, KtcAutoBuildTask } from "./autoBuildContracts.js";

export type KtcAutoBuildScriptStatus = "same" | "different" | "missing" | "unavailable" | "foreign";

export interface KtcAutoBuildScriptStatusSnapshot {
  readonly status: KtcAutoBuildScriptStatus;
  readonly source: string;
  readonly target: string;
}

export interface KtcCreateAutoBuildPrimaryViewModelInput {
  readonly configuration?: KtcAutoBuildConfiguration;
  readonly tasks: readonly KtcAutoBuildTask[];
  readonly currentPath: string;
  readonly recentPaths?: readonly string[];
  /** Host-owned dirty signal; omitted callers retain the safe saved/unsaved fallback. */
  readonly dirty?: boolean;
  readonly workingDirectoryMismatch?: boolean;
  readonly workingDirectoryBaseline?: string;
  readonly defaultWorkingDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly scriptStatus?: KtcAutoBuildScriptStatusSnapshot;
  readonly repositoryCleanupStatus?: string;
  readonly rootCleanupStatus?: string;
}

function platformLabels(platform: NodeJS.Platform): { short: string; execution: string } {
  if (platform === "win32") return { short: "Windows", execution: "Windows · 本机执行" };
  const name = platform === "darwin" ? "macOS" : platform === "linux" ? "Linux" : platform;
  return { short: `${name}（检查）`, execution: `${name}（检查）→ Windows 执行` };
}

function scriptLabels(status?: KtcAutoBuildScriptStatusSnapshot): { label: string; detail: string } {
  if (!status) return { label: "正在检查", detail: "" };
  const labels: Readonly<Record<KtcAutoBuildScriptStatus, string>> = {
    same: "脚本一致",
    different: "脚本不一致",
    missing: "ROOT 中缺少同步文件",
    unavailable: "未探测到 Root",
    foreign: "当前系统不可同步",
  };
  return {
    label: labels[status.status],
    detail: [status.source, status.target].filter(Boolean).join(" → "),
  };
}

export function ktcCreateAutoBuildPrimaryViewModel(
  input: KtcCreateAutoBuildPrimaryViewModelInput,
): KtcAutoBuildPrimaryViewModel {
  const projects = input.configuration?.projects ?? [];
  const enabledProjects = projects.filter(({ enabled }) => enabled);
  const completedTasks = input.tasks.filter(({ status }) => status === "done").length;
  const failedTasks = input.tasks.filter(({ status }) => status === "error").length;
  const platform = platformLabels(input.platform);
  const script = scriptLabels(input.scriptStatus);
  const configName = input.currentPath
    ? input.currentPath.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1) || input.currentPath
    : "未保存";
  const dirty = input.dirty ?? !input.currentPath;
  const statusLabel = input.currentPath
    ? dirty ? "有未保存修改" : "已保存"
    : "尚未写盘";
  const workingDirectory = input.configuration?.workingDirectory?.trim()
    || input.defaultWorkingDirectory
    || "未设置";
  return {
    metrics: [
      { label: "启用项目", value: `${enabledProjects.length} / ${projects.length}` },
      { label: "任务", value: `${completedTasks} / ${input.tasks.length}` },
      { label: "失败", value: String(failedTasks) },
    ],
    configuration: {
      name: configName,
      fullPath: input.currentPath,
      dirty,
      statusLabel,
      workingDirectoryMismatch: !!input.workingDirectoryMismatch,
      workingDirectoryMismatchMessage: input.workingDirectoryMismatch
        ? `工作目录已从 ${input.workingDirectoryBaseline || "未设置"} 改为 ${workingDirectory}。请选择新建配置或明确保留项目后再执行。`
        : "",
      recent: (input.recentPaths ?? []).map((fullPath, index) => ({
        actionId: `selectRecent${index}`,
        name: fullPath.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1) || fullPath,
        fullPath,
        selected: fullPath === input.currentPath,
      })),
    },
    parallelBuild: input.configuration?.buildExecutionMode === "parallel",
    environmentLabel: platform.short,
    environment: [
      { label: "工作目录", value: workingDirectory },
      {
        label: "执行模式",
        value: input.configuration?.buildExecutionMode === "parallel" ? "并行构建" : "顺序：CMake → CAA",
      },
      { label: "平台", value: platform.execution },
    ],
    maintenance: {
      scriptStatus: script.label,
      scriptDetail: script.detail,
      repositoryCleanupStatus: input.repositoryCleanupStatus ?? "仅手动触发",
      rootCleanupStatus: input.rootCleanupStatus ?? "待确认规则",
      rootCleanupYaml: input.configuration?.rootCleanupYaml ?? KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
    },
  };
}
