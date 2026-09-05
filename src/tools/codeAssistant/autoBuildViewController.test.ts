import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { ktcAutoBuildArguments, ktcAutoBuildRepositoryArguments, ktcMkArguments, ktcPlanAutoBuildTasks, ktcValidateAutoBuildConfiguration, type KtcAutoBuildConfiguration } from "./autoBuildContracts.js";

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
    for (const marker of ["showOpenDialog", "showSaveDialog", "RECENT_KEY", "schemaVersion", "正在预检…", "正在启动…", "action received", "auto-build-view.js", '"scripts", "auto-build", "Invoke-AutoBuild.ps1"']) expect(source).toContain(marker);
    const view = readFileSync(new URL("./autoBuildViewEntry.ts", import.meta.url), "utf8");
    for (const marker of ["document.createElement(\"details\")", "auto-build-block", "project-table-row", "pickProjectDirectories", "discoverProjectDirectories", "parallelBuild", "updateParallelBuildDisplay(configuration.buildExecutionMode === \"parallel\")", "cleanRootArtifacts", "syncRootScript", "probeProject", "runProject", "removeProject"]) expect(view).toContain(marker);
    expect(view).not.toContain("pnwDefineCollapsibleBlock");
    for (const marker of ["defaultUri", "cmake: hasCmake", "linkOut", "linkOut.ps1", "linkCaa: isCaa || hasLink || hasLinkOut", "`${phaseName}-${projectName}`"]) expect(source).toContain(marker);
  });

  it("does not treat normal Git stderr from repository jobs as an early-stop error", () => {
    const script = readFileSync(new URL("../../../scripts/auto-build/Invoke-AutoBuild.ps1", import.meta.url), "utf8");
    expect(script).toContain("Receive-Job -Wait -ErrorAction Continue");
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
  });

  it("enters each project directory and runs mk.ps1 without forcing Root parameters", () => {
    expect(ktcMkArguments("E:/codeMaster/XyCore", "CMake").at(-1)).toContain("Push-Location -LiteralPath 'E:/codeMaster/XyCore'");
    expect(ktcMkArguments("E:/codeMaster/XyCore", "CMake").at(-1)).not.toContain("ProjectType");
    expect(ktcMkArguments("E:/codeMaster/XyCore", "CMake").at(-1)).not.toContain("SkipExport");
    expect(ktcMkArguments("E:/codeMaster/CAAWsp", "CAA").at(-1)).toContain("if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }");
  });
});
