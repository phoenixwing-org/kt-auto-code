import { statSync } from "node:fs";
import { ktcCanAccessAutoBuildPathOnHost, ktcIsAbsoluteAutoBuildPath, ktcJoinAutoBuildPath, ktcResolveAutoBuildPath, type KtcAutoBuildProjectRow } from "./autoBuildProjectTable.js";

export interface KtcAutoBuildConfiguration {
  schemaVersion: 2;
  rootDirectory: string;
  thirdPartyDirectory: string;
  updateRoot?: boolean;
  updateThirdParty?: boolean;
  workingDirectory?: string;
  rootBranch: string;
  branch: string;
  cmakeBranch: string;
  projects: KtcAutoBuildProjectRow[];
  clean: boolean;
  buildExecutionMode?: "sequential" | "parallel";
  repositorySnapshot?: {
    capturedAt: string;
    repositories: Array<{ role: string; path: string; branch: string; commit: string; origin: string; hasChanges?: boolean; error?: string }>;
  };
}

export interface KtcAutoBuildRuntimeSelection {
  cmakeProjectPaths: string[];
  caaProjectPaths: string[];
  additionalRepositoryPaths: string[];
  linkCaaPaths: string[];
  updateRepositories: Array<{ path: string; branch: string }>;
}

function ktcIsHostDirectory(path: string, platform: NodeJS.Platform): boolean {
  if (!ktcCanAccessAutoBuildPathOnHost(path, platform)) return true;
  try { return statSync(path).isDirectory(); }
  catch { return false; }
}

function ktcIsHostFile(path: string, platform: NodeJS.Platform): boolean {
  if (!ktcCanAccessAutoBuildPathOnHost(path, platform)) return true;
  try { return statSync(path).isFile(); }
  catch { return false; }
}

export function ktcSelectAutoBuildProjects(configuration: KtcAutoBuildConfiguration): KtcAutoBuildRuntimeSelection {
  const selected = configuration.projects.filter((project) => project.enabled).map((project) => ({ project, path: ktcResolveAutoBuildPath(project.path, configuration.workingDirectory || "") }));
  return {
    cmakeProjectPaths: selected.filter(({ project }) => project.operations.cmake).map(({ path }) => path),
    caaProjectPaths: selected.filter(({ project }) => project.operations.caa).map(({ path }) => path),
    additionalRepositoryPaths: selected.filter(({ project }) => project.operations.update).map(({ path }) => path),
    linkCaaPaths: selected.filter(({ project }) => project.operations.linkCaa).map(({ path }) => path),
    updateRepositories: selected.filter(({ project }) => project.operations.update).map(({ project, path }) => ({ path, branch: project.branch || configuration.branch })),
  };
}

export type KtcAutoBuildTaskStatus = "waiting" | "in_progress" | "done" | "error";
export interface KtcAutoBuildTaskChild { id: string; name: string; commandSummary: string; detail?: string; status: KtcAutoBuildTaskStatus; }
export interface KtcAutoBuildTask { id: string; name: string; commandSummary: string; phase: "repository" | "link" | "export" | "cmake" | "caa"; path?: string; status: KtcAutoBuildTaskStatus; children?: KtcAutoBuildTaskChild[]; }

export function ktcPlanAutoBuildTasks(configuration: KtcAutoBuildConfiguration): KtcAutoBuildTask[] {
  const selected = ktcSelectAutoBuildProjects(configuration);
  return [
    { id: "repositories", name: "仓库预检与更新", commandSummary: `Invoke-AutoBuild.ps1 -SkipBuild${configuration.clean ? " -Clean" : ""}`, phase: "repository" as const, status: "waiting" as const, children: [
      { id: "repository-root", name: `ROOT_DIR · ${configuration.rootDirectory}`, commandSummary: configuration.updateRoot || configuration.clean ? "更新" : "跳过更新", status: "waiting" as const },
      { id: "repository-third", name: `ROOT_DIR_3rdParty · ${configuration.thirdPartyDirectory}`, commandSummary: configuration.updateThirdParty || configuration.clean ? "更新" : "跳过更新", status: "waiting" as const },
      ...configuration.projects.filter((project) => project.enabled && project.operations.update).map((project) => ({ id: `repository-${project.id}`, name: `${project.name} · ${project.path}`, commandSummary: `更新到 ${project.branch}`, status: "waiting" as const })),
    ] },
    ...selected.linkCaaPaths.map((path, index) => ({ id: `link-caa-${index}`, name: `链接 CAA · ${path}`, commandSummary: "linkCAA.ps1", phase: "link" as const, path, status: "waiting" as const })),
    ...selected.cmakeProjectPaths.filter((path) => ktcCanAccessAutoBuildPathOnHost(path, process.platform) && ktcIsHostFile(ktcJoinAutoBuildPath(path, "export.ps1"), process.platform)).map((path, index) => ({ id: `export-${index}`, name: `Export · ${path}`, commandSummary: "export.ps1", phase: "export" as const, path, status: "waiting" as const })),
    ...selected.cmakeProjectPaths.map((path, index) => ({ id: `cmake-${index}`, name: `CMake · ${path}`, commandSummary: "mk.ps1", phase: "cmake" as const, path, status: "waiting" as const })),
    ...selected.caaProjectPaths.map((path, index) => ({ id: `caa-${index}`, name: `CAA · ${path}`, commandSummary: "mk.ps1", phase: "caa" as const, path, status: "waiting" as const })),
  ];
}

function ps(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function psArray(values: readonly string[]): string {
  return `@(${values.map(ps).join(",")})`;
}

const psUtf8Preamble = "$ErrorActionPreference = 'Stop'; $utf8 = New-Object System.Text.UTF8Encoding $false; [Console]::InputEncoding = $utf8; [Console]::OutputEncoding = $utf8; $OutputEncoding = $utf8; $ProgressPreference = 'SilentlyContinue';";

export function ktcAutoBuildArguments(configuration: KtcAutoBuildConfiguration, script = "SCRIPT"): string[] {
  const selected = ktcSelectAutoBuildProjects(configuration);
  const invocation = [
    `& ${ps(script)}`,
    `-RootDirectory ${ps(configuration.rootDirectory)}`,
    `-ThirdPartyDirectory ${ps(configuration.thirdPartyDirectory)}`,
    `-RootBranch ${ps(configuration.rootBranch)}`,
    `-Branch ${ps(configuration.branch || "develop")}`,
    `-CmakeBranch ${ps(configuration.cmakeBranch || "master")}`,
    `-UpdateRoot:$${!!configuration.updateRoot}`,
    `-UpdateThirdParty:$${!!configuration.updateThirdParty}`,
    "-UpdateCmakeRepositories:$false",
    configuration.clean ? "-Clean -ForceClean" : "",
    selected.cmakeProjectPaths.length ? `-CmakeProjectPaths ${psArray(selected.cmakeProjectPaths)}` : "",
    selected.caaProjectPaths.length ? `-CaaProjectPaths ${psArray(selected.caaProjectPaths)}` : "",
    selected.updateRepositories.length ? `-RepositorySpecsJson ${ps(JSON.stringify(selected.updateRepositories))}` : "",
  ].filter(Boolean).join(" ");
  const command = `${psUtf8Preamble} try { ${invocation} } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command];
}

export function ktcAutoBuildRepositoryArguments(configuration: KtcAutoBuildConfiguration, script: string): string[] {
  const args = ktcAutoBuildArguments(configuration, script);
  return [...args.slice(0, -1), args.at(-1)!.replace(" } catch {", " -SkipBuild } catch {")];
}

export function ktcMkArguments(projectPath: string, _projectType: "CMake" | "CAA"): string[] {
  const normalized = ktcJoinAutoBuildPath(projectPath);
  const projectScript = ktcJoinAutoBuildPath(normalized, "mk.ps1");
  const invocation = `Push-Location -LiteralPath ${ps(normalized)}; try { & ${ps(projectScript)}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } } finally { Pop-Location }`;
  const command = `${psUtf8Preamble} try { ${invocation} } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command];
}

export function ktcExportArguments(projectPath: string): string[] {
  const normalized = ktcJoinAutoBuildPath(projectPath), script = ktcJoinAutoBuildPath(normalized, "export.ps1");
  const command = `${psUtf8Preamble} try { Push-Location -LiteralPath ${ps(normalized)}; try { & ${ps(script)}; if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE } } finally { Pop-Location } } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command];
}

export function ktcLinkCaaArguments(configuration: KtcAutoBuildConfiguration, workingDirectory = configuration.workingDirectory || ""): string[] {
  const source = ktcJoinAutoBuildPath(configuration.rootDirectory, "sample", "linkCAA.ps1");
  const target = ktcJoinAutoBuildPath(workingDirectory, "linkCAA.ps1");
  const command = `${psUtf8Preamble} try { Copy-Item -LiteralPath ${ps(source)} -Destination ${ps(target)} -Force; & ${ps(target)}; if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE } } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`;
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command];
}

export function ktcValidateAutoBuildConfiguration(configuration: KtcAutoBuildConfiguration, platform: NodeJS.Platform = process.platform): string[] {
  const errors: string[] = [];
  if (!configuration.rootDirectory.trim()) errors.push("ROOT_DIR 不能为空。");
  else if (!ktcIsAbsoluteAutoBuildPath(configuration.rootDirectory)) errors.push("ROOT_DIR 必须使用绝对路径。");
  else if (platform === "win32" && !ktcCanAccessAutoBuildPathOnHost(configuration.rootDirectory, platform)) errors.push("ROOT_DIR 必须使用 Windows 盘符或 UNC 共享根路径。");
  else if (!ktcIsHostDirectory(configuration.rootDirectory, platform)) errors.push(`ROOT_DIR 不存在或不是目录：${configuration.rootDirectory}`);
  if (!configuration.thirdPartyDirectory.trim()) errors.push("ROOT_DIR_3rdParty 不能为空。");
  else if (!ktcIsAbsoluteAutoBuildPath(configuration.thirdPartyDirectory)) errors.push("ROOT_DIR_3rdParty 必须使用绝对路径。");
  else if (platform === "win32" && !ktcCanAccessAutoBuildPathOnHost(configuration.thirdPartyDirectory, platform)) errors.push("ROOT_DIR_3rdParty 必须使用 Windows 盘符或 UNC 共享根路径。");
  else if (!ktcIsHostDirectory(configuration.thirdPartyDirectory, platform)) errors.push(`ROOT_DIR_3rdParty 不存在或不是目录：${configuration.thirdPartyDirectory}`);
  const workingDirectory = configuration.workingDirectory?.trim() || "";
  if (workingDirectory && !ktcIsAbsoluteAutoBuildPath(workingDirectory)) errors.push("工作目录必须使用绝对路径。");
  else if (workingDirectory && platform === "win32" && !ktcCanAccessAutoBuildPathOnHost(workingDirectory, platform)) errors.push("工作目录必须使用 Windows 盘符或 UNC 共享根路径。");
  else if (workingDirectory && !ktcIsHostDirectory(workingDirectory, platform)) errors.push(`工作目录不存在或不是目录：${workingDirectory}`);
  if (configuration.projects.some((project) => project.enabled && !project.path.trim())) errors.push("启用的项目路径不能为空。");
  if (!workingDirectory && configuration.projects.some((project) => project.enabled && !ktcIsAbsoluteAutoBuildPath(project.path))) errors.push("使用相对项目路径时必须填写绝对工作目录。");
  if (!configuration.rootBranch.trim()) errors.push("Root 分支必须单独指定，不会自动选择分支。");
  if (!configuration.branch.trim()) errors.push("其他仓库分支不能为空。");
  if (!configuration.cmakeBranch.trim()) errors.push("CMake 仓库分支不能为空。");
  let selected: KtcAutoBuildRuntimeSelection;
  try { selected = ktcSelectAutoBuildProjects(configuration); }
  catch (error) { errors.push(`项目路径无效：${error instanceof Error ? error.message : String(error)}`); return errors; }
  if (selected.linkCaaPaths.length) {
    if (!configuration.workingDirectory?.trim()) errors.push("运行 linkCAA.ps1 时工作目录不能为空。");
    if (ktcIsAbsoluteAutoBuildPath(configuration.rootDirectory)) {
      const linkSource = ktcJoinAutoBuildPath(configuration.rootDirectory, "sample", "linkCAA.ps1");
      if (!ktcIsHostFile(linkSource, platform)) errors.push(`未找到 linkCAA.ps1 示例文件：${linkSource}`);
    }
  }
  for (const path of [...selected.cmakeProjectPaths, ...selected.caaProjectPaths]) {
    if (platform === "win32" && !ktcCanAccessAutoBuildPathOnHost(path, platform)) errors.push(`项目目录必须使用 Windows 盘符或 UNC 共享根路径：${path}`);
    else if (!ktcIsHostDirectory(path, platform)) errors.push(`项目目录不存在或不是目录：${path}`);
  }
  for (const path of selected.additionalRepositoryPaths) {
    if (platform === "win32" && !ktcCanAccessAutoBuildPathOnHost(path, platform)) errors.push(`更新的库必须使用 Windows 盘符或 UNC 共享根路径：${path}`);
    else if (!ktcIsHostDirectory(path, platform)) errors.push(`更新的库不存在或不是目录：${path}`);
  }
  const buildPathKey = (path: string): string => platform === "win32" ? path.toLocaleLowerCase() : path;
  const buildPathKeys = new Set([...selected.cmakeProjectPaths, ...selected.caaProjectPaths].map(buildPathKey));
  for (const path of selected.linkCaaPaths) {
    if (buildPathKeys.has(buildPathKey(path))) continue;
    if (platform === "win32" && !ktcCanAccessAutoBuildPathOnHost(path, platform)) errors.push(`linkCAA 项目目录必须使用 Windows 盘符或 UNC 共享根路径：${path}`);
    else if (!ktcIsHostDirectory(path, platform)) errors.push(`linkCAA 项目目录不存在或不是目录：${path}`);
  }
  return errors;
}
