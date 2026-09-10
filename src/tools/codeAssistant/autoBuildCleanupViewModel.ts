import type {
  KtcCleanupDialogModel,
  KtcCleanupDialogPreviewState,
  KtcCleanupDialogTarget,
} from "../../core/autoBuildPrimaryContracts.js";
import { KTC_DEFAULT_ROOT_CLEANUP_PATTERNS_YAML } from "../../core/rootCleanupPatterns.js";
import { ktcAutoBuildCleanupDirectory, ktcAutoBuildCleanupTitle, ktcSelectCurrentDirectoryCleanupTargets } from "../../core/autoBuildCleanupScope.js";
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
  const selectedTargets = selectedTargetIds
    ? targets.map((target) => ({ ...target, selected: selectedTargetIds.has(target.id) }))
    : ktcSelectCurrentDirectoryCleanupTargets(targets, selectedModeId);
  const availableForMode = selectedTargets.some((target) => !target.disabled
    && target.selected
    && target.supportedModeIds?.includes(selectedModeId));
  const preview = input.state?.preview;
  const enabled = input.enabled && !!configuration && availableForMode;
  const disabledReason = (!input.enabled ? input.disabledReason : undefined)
    || (!configuration ? "当前没有可清理的 AutoBuild 配置。" : "当前方式没有可用的清理目标。");

  return {
    title: ktcAutoBuildCleanupTitle(ktcAutoBuildCleanupDirectory(configuration?.workingDirectory, input.defaultWorkingDirectory)),
    description: "默认只清理当前目录；ROOT、3rdParty 和其他项目需手动勾选。先预览核对，再执行清理。",
    modes: [
      {
        id: "rules",
        label: "规则清理",
        description: "按 YAML 规则清理当前目录的直属构建产物，不删除当前目录本身。",
        risk: "normal",
        rulesVisible: true,
      },
      {
        id: "git-force",
        label: "Git 强制恢复",
        description: "仅当当前目录就是 Git 仓库根目录时可用，不自动转到上级仓库；reset --hard HEAD 与 clean -ffdx 会丢弃未提交和未跟踪内容。",
        risk: "high",
        rulesVisible: false,
      },
      {
        id: "cmake",
        label: "CMake 清理",
        description: "默认清空当前目录下的 build 并保留目录；其他项目的 build 需手动勾选。",
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
  const workingDirectory = ktcAutoBuildCleanupDirectory(configuration.workingDirectory, defaultWorkingDirectory);
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

  if (workingDirectory) {
    add("rules:working", "当前目录", workingDirectory, ["rules"]);
    add("git:working", "当前目录", workingDirectory, ["git-force"], "必须是仓库根目录，不扩大到上级仓库");
    let sharedBuild = "";
    try { sharedBuild = ktcJoinAutoBuildPath(workingDirectory, "build"); }
    catch { /* Never substitute the working directory itself for its build child. */ }
    add("cmake:shared", "当前目录 / build", sharedBuild, ["cmake"], "保留 build 目录，只清空其中内容");
  }
  if (ktcAutoBuildRootEnabled(configuration)) {
    add("rules:root", "ROOT_DIR（附加）", configuration.rootDirectory, ["rules"]);
    add("git:root", "ROOT_DIR（附加）", configuration.rootDirectory, ["git-force"]);
  }
  if (ktcAutoBuildThirdPartyEnabled(configuration)) {
    add("git:third-party", "ROOT_DIR_3rdParty（附加）", configuration.thirdPartyDirectory, ["git-force"]);
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
  return result;
}
