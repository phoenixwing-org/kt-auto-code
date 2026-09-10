import type {
  KtcCleanupDialogModel,
  KtcCleanupDialogPreviewState,
  KtcCleanupDialogTarget,
} from "../../core/autoBuildPrimaryContracts.js";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";
import {
  ktcCanAccessAutoBuildPathOnHost,
  ktcIsAutoBuildFilesystemRoot,
  ktcJoinAutoBuildPath,
  ktcResolveAutoBuildPath,
} from "./autoBuildProjectTable.js";
import {
  ktcAutoBuildRootEnabled,
  ktcAutoBuildThirdPartyEnabled,
  type KtcAutoBuildConfiguration,
} from "./autoBuildContracts.js";

export const KTC_AUTO_BUILD_CLEANUP_MODE_IDS = ["rules", "git-force", "cmake"] as const;
export type KtcAutoBuildCleanupModeId = typeof KTC_AUTO_BUILD_CLEANUP_MODE_IDS[number];

export interface KtcAutoBuildCleanupProjectionState {
  readonly selectedModeId?: KtcAutoBuildCleanupModeId;
  readonly selectedTargetIds?: readonly string[];
  readonly rulesYaml?: string;
  readonly preview?: {
    readonly state: KtcCleanupDialogPreviewState;
    readonly token?: string;
    readonly summary?: string;
    readonly message?: string;
    readonly items?: readonly string[];
  };
}

export interface KtcCreateAutoBuildCleanupViewModelInput {
  readonly configuration?: KtcAutoBuildConfiguration;
  readonly defaultWorkingDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly enabled: boolean;
  readonly disabledReason?: string;
  readonly state?: KtcAutoBuildCleanupProjectionState;
}

export function ktcCreateAutoBuildCleanupViewModel(
  input: KtcCreateAutoBuildCleanupViewModelInput,
): KtcCleanupDialogModel {
  const configuration = input.configuration;
  const selectedModeId = input.state?.selectedModeId ?? "rules";
  const selectedTargetIds = input.state?.selectedTargetIds
    ? new Set(input.state.selectedTargetIds)
    : undefined;
  const targets = configuration
    ? cleanupTargets(configuration, input.defaultWorkingDirectory, input.platform)
    : [];
  const selectedTargets = targets.map((target) => ({
    ...target,
    selected: selectedTargetIds
      ? selectedTargetIds.has(target.id)
      : !target.disabled && target.supportedModeIds?.includes(selectedModeId) === true,
  }));
  const availableForMode = selectedTargets.some((target) => !target.disabled
    && target.selected
    && target.supportedModeIds?.includes(selectedModeId));
  const preview = input.state?.preview;
  const enabled = input.enabled && !!configuration && availableForMode;
  const disabledReason = input.disabledReason
    || (!configuration ? "当前没有可清理的 AutoBuild 配置。" : "当前方式没有可用的清理目标。");

  return {
    title: "清理",
    description: "先冻结并核对实际命中，再执行所选清理；不会顺带处理预览后新增的内容。",
    modes: [
      {
        id: "rules",
        label: "规则清理",
        description: "按 YAML 规则清理 ROOT 或工作目录的直属构建产物。",
        risk: "normal",
        rulesVisible: true,
      },
      {
        id: "git-force",
        label: "Git 强制恢复",
        description: "对仓库顶层执行 reset --hard HEAD 与 clean -ffdx；未提交和未跟踪内容会丢失。",
        risk: "high",
        rulesVisible: false,
      },
      {
        id: "cmake",
        label: "CMake 清理",
        description: "删除项目 build 目录；共享工作目录的 build 只清空内容并保留目录。",
        risk: "normal",
        rulesVisible: false,
      },
    ],
    selectedModeId,
    modePresentation: "radio",
    collapsibleSections: true,
    actionsPlacement: "header",
    targets: selectedTargets,
    rulesVisible: selectedModeId === "rules",
    rulesLabel: "清理规则",
    rulesYaml: input.state?.rulesYaml
      ?? configuration?.rootCleanupYaml
      ?? KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML,
    preview: {
      state: preview?.state ?? "idle",
      ...(preview?.token ? { token: preview.token } : {}),
      ...(preview?.summary ? { summary: preview.summary } : {}),
      ...(preview?.message ? { message: preview.message } : {}),
      items: preview?.items ?? [],
    },
    previewEnabled: enabled,
    ...(enabled ? {} : { previewDisabledReason: disabledReason }),
    executeEnabled: enabled && preview?.state === "ready" && !!preview.token,
    ...(enabled && preview?.state === "ready" && preview.token
      ? {}
      : { executeDisabledReason: "请先完成预览并保持配置与目标不变。" }),
    previewLabel: "预览",
    executeLabel: "清理",
    cancelLabel: "取消",
    highRiskConfirmationLabel: "我已核对预览，确认丢弃所选仓库的未提交、未跟踪及忽略内容。",
  };
}

function cleanupTargets(
  configuration: KtcAutoBuildConfiguration,
  defaultWorkingDirectory: string,
  platform: NodeJS.Platform,
): KtcCleanupDialogTarget[] {
  const workingDirectory = configuration.workingDirectory?.trim() || defaultWorkingDirectory.trim();
  const result: KtcCleanupDialogTarget[] = [];
  const seen = new Set<string>();
  const add = (
    id: string,
    label: string,
    path: string,
    supportedModeIds: readonly KtcAutoBuildCleanupModeId[],
    description?: string,
  ): void => {
    const normalizedPath = path.trim();
    const pathKey = `${supportedModeIds.join(",")}:${normalizedPath.toLocaleLowerCase()}`;
    if (!normalizedPath || seen.has(pathKey)) return;
    seen.add(pathKey);
    const accessible = ktcCanAccessAutoBuildPathOnHost(normalizedPath, platform);
    const filesystemRoot = ktcIsAutoBuildFilesystemRoot(normalizedPath);
    result.push({
      id,
      label,
      path: normalizedPath,
      description,
      selected: false,
      disabled: !accessible || filesystemRoot,
      ...(!accessible
        ? { disabledReason: "当前 Host 不能访问此路径。" }
        : filesystemRoot ? { disabledReason: "文件系统根目录不能作为清理目标。" } : {}),
      supportedModeIds,
    });
  };

  if (ktcAutoBuildRootEnabled(configuration)) {
    add("rules:root", "ROOT_DIR", configuration.rootDirectory, ["rules"]);
    add("git:root", "ROOT_DIR", configuration.rootDirectory, ["git-force"]);
  }
  if (workingDirectory) {
    add("rules:working", "工作目录", workingDirectory, ["rules"]);
  }
  if (ktcAutoBuildThirdPartyEnabled(configuration)) {
    add("git:third-party", "ROOT_DIR_3rdParty", configuration.thirdPartyDirectory, ["git-force"]);
  }

  for (const project of configuration.projects.filter(({ enabled }) => enabled)) {
    let projectPath = "";
    try { projectPath = ktcResolveAutoBuildPath(project.path, workingDirectory); }
    catch { projectPath = project.path.trim(); }
    if (project.operations.update) {
      add(`git:project:${project.id}`, project.name, projectPath, ["git-force"], "项目仓库");
    }
    if (project.operations.cmake) {
      let buildPath = "";
      try { buildPath = ktcJoinAutoBuildPath(projectPath, "build"); }
      catch { buildPath = projectPath; }
      add(`cmake:project:${project.id}`, `${project.name} / build`, buildPath, ["cmake"], "删除整个 build 目录");
    }
  }
  if (workingDirectory) {
    let sharedBuild = "";
    try { sharedBuild = ktcJoinAutoBuildPath(workingDirectory, "build"); }
    catch { sharedBuild = workingDirectory; }
    add("cmake:shared", "工作目录 / build", sharedBuild, ["cmake"], "保留 build 目录，只清空其中内容");
  }
  return result;
}
