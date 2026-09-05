import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ktcAutoBuildArguments, ktcAutoBuildRepositoryArguments, ktcExportArguments, ktcLinkCaaArguments, ktcMkArguments, ktcPlanAutoBuildTasks, ktcValidateAutoBuildConfiguration, type KtcAutoBuildConfiguration } from "./autoBuildContracts.js";

const project = (path: string, operations: Partial<{ update: boolean; cmake: boolean; caa: boolean; linkCaa: boolean }>) => ({ id: path, enabled: true, name: path.split("/").at(-1)!, path, branch: "master", operations: { update: false, cmake: false, caa: false, linkCaa: false, ...operations } });

const created: string[] = [];
function directory(name: string): string {
  const value = join(tmpdir(), `ktc-auto-build-${process.pid}-${name}`);
  mkdirSync(value, { recursive: true }); created.push(value); return value;
}
afterEach(() => { for (const value of created.splice(0)) rmSync(value, { recursive: true, force: true }); });

describe("Auto Build View contract", () => {
  it("wires JSON round-trip, recent files, immediate button status and Wing blocks", () => {
    const source = readFileSync(new URL("./autoBuildViewController.ts", import.meta.url), "utf8");
    for (const marker of ["showOpenDialog", "showSaveDialog", "RECENT_KEY", "schemaVersion", "正在预检…", "正在启动…", "action received", "auto-build-view.js", '"scripts", "auto-build", "Invoke-AutoBuild.ps1"', "writeScript", "ktcCreateRepositoryCheckoutScript", "platform: process.platform", "运行仍会尝试现有链路", "Windows PowerShell 5.1 与 CAA/MSVC 实际构建", "ktcCanAccessAutoBuildPathOnHost", "ktcIsAutoBuildFilesystemRoot", "当前配置使用 Windows 路径，请选择本机 PS1 保存位置", "不是本机原生绝对路径，未执行同步", "不是本机绝对路径，未执行 Root 清理", "不允许在文件系统根目录执行 Root 清理", "不是本机原生绝对路径，未执行目录扫描", "不是本机原生绝对路径，未执行 Git 更新", "未访问 Windows 项目路径", "当前系统未访问该路径", "配置文件是 Windows 路径", "Windows 实际执行仅接受盘符绝对路径或 UNC 共享根路径", "已取消导出，未写入文件"]) expect(source).toContain(marker);
    const view = readFileSync(new URL("./autoBuildViewEntry.ts", import.meta.url), "utf8");
    for (const marker of ["document.createElement(\"details\")", "auto-build-block", "project-table-row", "pickProjectDirectories", "discoverProjectDirectories", "parallelBuild", "updateParallelBuildDisplay(configuration.buildExecutionMode === \"parallel\")", "cleanRootArtifacts", "syncRootScript", "probeProject", "runProject", "removeProject", "scriptManager", "构建脚本", "仓库检出", "script-window", "setPointerCapture", "Windows PowerShell 5.1", "macOS", "检查模式", "CAA 实际编译仅支持 Windows", "Windows Root（当前系统不可同步）"]) expect(view).toContain(marker);
    expect(view).not.toContain("写当前构建 PS1");
    expect(view).not.toContain("pnwDefineCollapsibleBlock");
    for (const marker of ["defaultUri", "cmake: hasCmake", "linkOut", "linkOut.ps1", "linkCaa: isCaa || hasLink || hasLinkOut", "`${phaseName}-${projectName}`"]) expect(source).toContain(marker);
  });

  it("does not treat normal Git stderr from repository jobs as an early-stop error", () => {
    const script = readFileSync(new URL("../../../scripts/auto-build/Invoke-AutoBuild.ps1", import.meta.url), "utf8");
    expect(script).toContain("Receive-Job -Wait -ErrorAction Continue");
    expect(script).toContain("function Test-IsFullyQualifiedWindowsPath");
    expect(script).toContain("$pathSeparators = [char[]]@([System.IO.Path]::DirectorySeparatorChar");
    expect(script).toContain("必须使用带盘符或 UNC 共享根的绝对路径");
    expect(script).toContain("(Resolve-Path -LiteralPath $Path).ProviderPath");
    expect(script).toContain("拒绝清理文件系统根目录");
    expect(script).toContain("$resolvedCaaProjectPaths = @($CaaProjectPaths");
    expect(script).toContain('Invoke-BuildPhase "CAA" $resolvedCaaProjectPaths');
    expect(script.indexOf("$resolvedCaaProjectPaths = @($CaaProjectPaths")).toBeLessThan(script.indexOf("$repositoryPlans = @("));
  });

  it("fails closed on cleanup reparse points and missing background-job results", () => {
    const script = readFileSync(new URL("../../../scripts/auto-build/Invoke-AutoBuild.ps1", import.meta.url), "utf8");
    for (const marker of [
      "function Get-FirstReparsePointInPathChain",
      "function Get-FirstReparsePointInTree",
      "System.Collections.Generic.Stack[string]",
      "发现 reparse point 后绝不把它压栈",
      "$SkipGitDirectory -and $isRootDirectory",
      "Assert-CleanupPathHasNoReparsePoint $cleanRepository \"Git 清理仓库\" -CheckTree -SkipGitDirectory",
      "Assert-CleanupPathHasNoReparsePoint $cleanTarget.Path \"CMake 构建目录\" -CheckTree",
      "KtcAutoBuildResult = $true",
      "KtcAutoBuildRepositoryResult = $true",
      "预期恰好 1 个结果",
      "后台任务终态为",
      "Remove-Job -Force -ErrorAction SilentlyContinue",
    ]) expect(script).toContain(marker);
    const treeScanner = script.slice(script.indexOf("function Get-FirstReparsePointInTree"), script.indexOf("function Assert-CleanupPathHasNoReparsePoint"));
    expect(treeScanner).not.toContain("Get-ChildItem -Recurse");
    expect(script.indexOf("Assert-CleanupPathHasNoReparsePoint $cleanRepository")).toBeLessThan(script.indexOf("$repositoryPlans = @("));
    expect(script.indexOf("foreach ($cleanTarget in $cmakeCleanTargets)")).toBeLessThan(script.indexOf("$repositoryPlans = @("));
    expect(script.indexOf("Assert-CleanupPathHasNoReparsePoint $RepositoryPath \"Git 清理仓库\" -CheckTree -SkipGitDirectory")).toBeLessThan(script.indexOf('Invoke-GitCommand $RepositoryPath @("reset", "--hard", "HEAD")'));
  });

  it("requires an explicit Root branch and validates every selected directory", () => {
    const root = directory("root"), third = directory("third");
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: root, thirdPartyDirectory: third, rootBranch: "", branch: "develop", cmakeBranch: "master", projects: [], clean: false };
    expect(ktcValidateAutoBuildConfiguration(configuration)).toContain("Root 分支必须单独指定，不会自动选择分支。");
  });

  it("passes both roots explicitly and limits Clean to the script's dedicated switch", () => {
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/3rdParty", workingDirectory: "E:/out", rootBranch: "develop", branch: "master", cmakeBranch: "develop", projects: [project("cpp", { cmake: true }), project("caa", { caa: true })], clean: true };
    const args = ktcAutoBuildArguments(configuration, "E:/Tools/Invoke-AutoBuild.ps1");
    expect(args.slice(0, 4)).toEqual(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]);
    const command = args[4];
    expect(command).toContain("$ErrorActionPreference = 'Stop'");
    expect(command).toContain("& 'E:/Tools/Invoke-AutoBuild.ps1'");
    expect(command).toContain("-RootDirectory 'E:/Root'");
    expect(command).toContain("-ThirdPartyDirectory 'E:/3rdParty'");
    expect(command).toContain("-RootBranch 'develop'");
    expect(command).toContain("-Branch 'master'");
    expect(command).toContain("-CmakeBranch 'develop'");
    expect(command).toContain("-UpdateCmakeRepositories:$false");
    expect(command).toContain("-Clean -ForceClean");
    expect(command).toContain("-CmakeProjectPaths @('E:\\out\\cpp')");
    expect(command).toContain("-CaaProjectPaths @('E:\\out\\caa')");
  });

  it("passes each update row branch through structured repository specs", () => {
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/3rdParty", workingDirectory: "E:/out", rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [project("custom", { update: true })], clean: false };
    configuration.projects[0]!.branch = "feature/demo";
    expect(ktcAutoBuildArguments(configuration).at(-1)).toContain('RepositorySpecsJson');
    expect(ktcAutoBuildArguments(configuration).at(-1)).toContain('feature/demo');
    expect(ktcAutoBuildArguments(configuration).at(-1)).not.toContain('AdditionalRepositoryPaths');
  });

  it("keeps Root and 3rdParty visible while honoring their independent update choices", () => {
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/3rdParty", updateRoot: false, updateThirdParty: true, rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [], clean: false };
    const command = ktcAutoBuildRepositoryArguments(configuration, "E:/tools/Invoke-AutoBuild.ps1").at(-1)!;
    expect(command).toContain("-UpdateRoot:$false");
    expect(command).toContain("-UpdateThirdParty:$true");
    expect(ktcPlanAutoBuildTasks(configuration)[0]!.children?.map((child) => child.commandSummary)).toEqual(["跳过更新", "更新"]);
  });

  it("plans one guarded repository stage followed by observable CMake and CAA tasks", () => {
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/3rdParty", workingDirectory: "E:/out", rootBranch: "develop", branch: "develop", cmakeBranch: "master", projects: [project("a", { cmake: true }), project("b", { cmake: true }), project("caa", { caa: true })], clean: false };
    const tasks = ktcPlanAutoBuildTasks(configuration);
    expect(tasks.map((task) => task.phase)).toEqual(["repository", "cmake", "cmake", "caa"]);
    expect(tasks.filter((task) => task.phase === "cmake" || task.phase === "caa").every((task) => task.commandSummary === "mk.ps1")).toBe(true);
    expect(tasks.every((task) => task.status === "waiting")).toBe(true);
    const repositoryCommand = ktcAutoBuildRepositoryArguments(configuration, "E:/tools/Invoke-AutoBuild.ps1").at(-1)!;
    expect(repositoryCommand).toContain("-SkipBuild");
    expect(repositoryCommand).toContain("-CmakeProjectPaths @('E:\\out\\a','E:\\out\\b')");
    expect(repositoryCommand).toContain("-CaaProjectPaths @('E:\\out\\caa')");
  });

  it("enters each project directory and runs mk.ps1 without forcing Root parameters", () => {
    expect(ktcMkArguments("E:/codeMaster/XyCore", "CMake").at(-1)).toContain("Push-Location -LiteralPath 'E:\\codeMaster\\XyCore'");
    expect(ktcMkArguments("E:/codeMaster/XyCore", "CMake").at(-1)).not.toContain("ProjectType");
    expect(ktcMkArguments("E:/codeMaster/XyCore", "CMake").at(-1)).not.toContain("SkipExport");
    expect(ktcMkArguments("E:/codeMaster/CAAWsp", "CAA").at(-1)).toContain("if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }");
    expect(ktcMkArguments("C:\\", "CMake").at(-1)).toContain("Push-Location -LiteralPath 'C:\\'");
    expect(ktcMkArguments("\\\\server\\share\\", "CMake").at(-1)).toContain("Push-Location -LiteralPath '\\\\server\\share\\'");
    expect(ktcMkArguments("/", "CMake").at(-1)).toContain("Push-Location -LiteralPath '/'");
    expect(ktcExportArguments("C:\\").at(-1)).toContain("& 'C:\\export.ps1'");
    expect(ktcExportArguments("\\\\server\\share\\").at(-1)).toContain("& '\\\\server\\share\\export.ps1'");
    expect(ktcExportArguments("/").at(-1)).toContain("& '/export.ps1'");
    expect(ktcExportArguments("E:/work/project").at(-1)).toContain("if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }");
    const linkConfiguration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/3rdParty", workingDirectory: "E:/work/project", rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [], clean: false };
    expect(ktcLinkCaaArguments(linkConfiguration).at(-1)).toContain("if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }");
  });

  it("allows foreign Windows configurations to reach blind-development preflight on non-Windows hosts", () => {
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/3rdParty", workingDirectory: "E:/out", rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [project("cpp", { cmake: true })], clean: false };
    expect(ktcValidateAutoBuildConfiguration(configuration, "darwin")).toEqual([]);
  });

  it("rejects relative roots and working directories instead of resolving against the Extension Host cwd", () => {
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: ".", thirdPartyDirectory: "third", workingDirectory: "work", rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [project("cpp", { cmake: true })], clean: false };
    expect(ktcValidateAutoBuildConfiguration(configuration, "darwin")).toEqual(expect.arrayContaining(["ROOT_DIR 必须使用绝对路径。", "ROOT_DIR_3rdParty 必须使用绝对路径。", "工作目录必须使用绝对路径。"]));
    configuration.rootDirectory = "/tmp/root"; configuration.thirdPartyDirectory = "/tmp/third"; configuration.workingDirectory = "/tmp/work"; configuration.projects[0]!.path = "";
    expect(ktcValidateAutoBuildConfiguration(configuration, "darwin")).toContain("启用的项目路径不能为空。");
  });

  it("rejects POSIX configuration paths on the Windows execution host", () => {
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: "/opt/root", thirdPartyDirectory: "/opt/third", workingDirectory: "/opt/work", rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [project("cpp", { cmake: true })], clean: false };
    expect(ktcValidateAutoBuildConfiguration(configuration, "win32")).toEqual(expect.arrayContaining(["ROOT_DIR 必须使用 Windows 盘符或 UNC 共享根路径。", "ROOT_DIR_3rdParty 必须使用 Windows 盘符或 UNC 共享根路径。", "工作目录必须使用 Windows 盘符或 UNC 共享根路径。"]));
    configuration.projects = [project("link-only", { linkCaa: true })];
    expect(ktcValidateAutoBuildConfiguration(configuration, "win32")).toContain("linkCAA 项目目录必须使用 Windows 盘符或 UNC 共享根路径：/opt/work/link-only");
  });

  it("rejects files where local configuration requires directories", () => {
    const root = directory("directory-kind-root"), third = directory("directory-kind-third"), working = directory("directory-kind-working");
    mkdirSync(join(root, "sample"), { recursive: true });
    writeFileSync(join(root, "sample", "linkCAA.ps1"), "# test\n");
    const filePath = join(working, "not-a-directory.txt");
    writeFileSync(filePath, "test\n");
    const configuration: KtcAutoBuildConfiguration = { schemaVersion: 2, rootDirectory: root, thirdPartyDirectory: third, workingDirectory: working, rootBranch: "develop", branch: "master", cmakeBranch: "master", projects: [project(filePath, { linkCaa: true })], clean: false };
    expect(ktcValidateAutoBuildConfiguration(configuration)).toContain(`linkCAA 项目目录不存在或不是目录：${filePath}`);
  });
});
