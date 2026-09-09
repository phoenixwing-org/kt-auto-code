import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ktcAutoBuildArguments,
  ktcAutoBuildCleanupArguments,
  type KtcAutoBuildConfiguration,
} from "./autoBuildContracts.js";

const project = (
  id: string,
  operations: Partial<{ update: boolean; cmake: boolean; caa: boolean; linkCaa: boolean }>,
) => ({
  id,
  enabled: true,
  name: id,
  path: id,
  branch: "develop",
  operations: { update: false, cmake: false, caa: false, linkCaa: false, ...operations },
});

function configuration(): KtcAutoBuildConfiguration {
  return {
    schemaVersion: 2,
    rootDirectory: "E:/Phoenix",
    thirdPartyDirectory: "E:/Phoenix-3rdParty",
    workingDirectory: "E:/Phoenix/projects",
    rootBranch: "develop",
    branch: "develop",
    cmakeBranch: "master",
    projects: [
      project("KtCore", { update: true, cmake: true }),
      project("CaaOnly", { caa: true }),
      project("RepositoryOnly", { update: true }),
    ],
    clean: false,
  };
}

describe("Auto Build clean-only contract", () => {
  it("builds a forced clean-only command from the selected CMake paths", () => {
    const config = configuration();
    const confirmedPlan = {
      repositories: ["E:/Phoenix", "E:/Phoenix-3rdParty", "E:/Phoenix/projects/KtCore"],
      repositoryIdentities: ["E:/Phoenix", "E:/Phoenix-3rdParty", "E:/Phoenix/projects/KtCore"].map((path, index) => ({
        path,
        head: String(index).repeat(40),
        gitDir: `${path}/.git`,
        origin: `https://example/${index}.git`,
        worktree: { path, creationTimeUtcMs: `${1000 + index}` },
        gitDirectory: { path: `${path}/.git`, creationTimeUtcMs: `${2000 + index}` },
      })),
      cmakeBuildTargets: [
        {
          path: "E:/Phoenix/projects/KtCore/build",
          action: "delete" as const,
          identity: {
            target: { path: "E:/Phoenix/projects/KtCore/build", exists: true, creationTimeUtcMs: "3000", lastWriteTimeUtcMs: "4000" },
            parent: { path: "E:/Phoenix/projects/KtCore", exists: true, creationTimeUtcMs: "5000", lastWriteTimeUtcMs: "6000" },
          },
        },
        {
          path: "E:/Phoenix/projects/build",
          action: "empty-and-preserve" as const,
          identity: {
            target: { path: "E:/Phoenix/projects/build", exists: false, creationTimeUtcMs: "", lastWriteTimeUtcMs: "" },
            parent: { path: "E:/Phoenix/projects", exists: true, creationTimeUtcMs: "7000", lastWriteTimeUtcMs: "8000" },
          },
        },
      ],
    };
    const args = ktcAutoBuildCleanupArguments(config, "E:/Tools/Invoke-AutoBuild.ps1", confirmedPlan);

    expect(args.slice(0, 4)).toEqual(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]);
    const command = args.at(-1)!;
    expect(command).toContain("& 'E:/Tools/Invoke-AutoBuild.ps1'");
    expect(command).toContain("-RootDirectory 'E:/Phoenix'");
    expect(command).toContain("-ThirdPartyDirectory 'E:/Phoenix-3rdParty'");
    expect(command).toContain("-RootBranch 'develop'");
    expect(command).toContain("-Clean -ForceClean -CleanOnly");
    expect(command).toContain("-CleanupPlanJson '");
    expect(command).toContain('"repositories":["E:/Phoenix","E:/Phoenix-3rdParty","E:/Phoenix/projects/KtCore"]');
    expect(command).toContain('"repositoryIdentities"');
    expect(command).toContain('"creationTimeUtcMs":"1000"');
    expect(command).toContain('"lastWriteTimeUtcMs":"4000"');
    expect(command).toContain("-CmakeProjectPaths @('E:\\Phoenix\\projects\\KtCore')");
    expect(command).not.toContain("CaaOnly");
    expect(command).not.toContain("RepositoryOnly");
    expect(command).not.toContain("RepositorySpecsJson");
    expect(command).not.toContain("-SkipBuild");

    expect(config.clean).toBe(false);
    expect(ktcAutoBuildArguments(config).at(-1)).not.toContain("-CleanOnly");
  });

  it("cleans and returns before creating a repository plan", () => {
    const script = readFileSync(new URL("../../../scripts/auto-build/Invoke-AutoBuild.ps1", import.meta.url), "utf8");
    expect(script).toContain("[switch]$CleanOnly");
    expect(script).toContain('[string]$CleanupPlanJson = ""');
    expect(script).toContain("if ($CleanOnly -and -not $Clean)");
    expect(script).toContain("-CleanOnly 必须与 -Clean 一起使用。");
    expect(script).toContain("$CleanOnly -and $ForceClean -and [string]::IsNullOrWhiteSpace($CleanupPlanJson)");
    expect(script).toContain("必须提供非空 CleanupPlanJson");

    const cleanOnlyStart = script.indexOf("if ($CleanOnly) {");
    const repositorySpecsStart = script.indexOf("$repositorySpecs = @(");
    const repositoryPlansStart = script.indexOf("$repositoryPlans = @(");
    const repositoryPlanCall = script.indexOf("Get-RepositoryPlan $spec.Path");
    expect(cleanOnlyStart).toBeGreaterThan(0);
    expect(cleanOnlyStart).toBeLessThan(repositorySpecsStart);
    expect(repositorySpecsStart).toBeLessThan(repositoryPlansStart);
    expect(repositoryPlansStart).toBeLessThan(repositoryPlanCall);

    const cleanOnlyBlock = script.slice(cleanOnlyStart, repositorySpecsStart);
    expect(cleanOnlyBlock).toContain("Clear-CMakeBuildTargets $cmakeCleanTargets $confirmedCleanupPlan");
    expect(cleanOnlyBlock).toContain("Clear-Repository $cleanRepository $confirmedCleanupPlan");
    expect(cleanOnlyBlock).toContain("return");
    for (const forbidden of ["Get-RepositoryPlan", '"fetch"', '"checkout"', '"pull"', "Start-Job", "Invoke-BuildPhase"]) {
      expect(cleanOnlyBlock).not.toContain(forbidden);
    }

    const clearRepository = script.slice(
      script.indexOf("function Clear-Repository"),
      script.indexOf("function Update-Repository"),
    );
    expect(clearRepository).toContain("Assert-CleanupPathHasNoReparsePoint");
    expect(clearRepository).toContain('@("reset", "--hard", "HEAD")');
    expect(clearRepository).toContain('@("clean", "-ffdx")');
    expect(clearRepository.match(/Assert-CleanupRepositoryIdentityMatches/g)).toHaveLength(3);
    expect(clearRepository).not.toContain('"fetch"');
    expect(clearRepository).not.toContain('"checkout"');
    expect(clearRepository).not.toContain('"pull"');
  });

  it("keeps all destructive cleanup gates and confirmation before clean-only execution", () => {
    const script = readFileSync(new URL("../../../scripts/auto-build/Invoke-AutoBuild.ps1", import.meta.url), "utf8");
    const cleanOnlyStart = script.indexOf("if ($CleanOnly) {");
    for (const marker of [
      "拒绝清理文件系统根目录",
      "拒绝清理脚本自身所在仓库",
      "拒绝清理自动构建脚本自身所在的 CMake 构建目录",
      'Assert-CleanupPathHasNoReparsePoint $cleanRepository "Git 清理仓库" -CheckTree -SkipGitDirectory',
      'Assert-CleanupPathHasNoReparsePoint $cleanTarget.Path "CMake 构建目录" -CheckTree',
      'if ($Clean -and -not $ForceClean -and -not $WhatIfPreference)',
      'if ((Read-Host "输入 CLEAN 继续") -cne "CLEAN")',
    ]) {
      expect(script.indexOf(marker)).toBeGreaterThan(0);
      expect(script.indexOf(marker)).toBeLessThan(cleanOnlyStart);
    }
    const cmakeSelfGuard = script.indexOf("Test-IsPathInsideDirectory $PSCommandPath $cleanTarget.Path");
    expect(cmakeSelfGuard).toBeGreaterThan(0);
    expect(cmakeSelfGuard).toBeLessThan(script.indexOf("Clear-CMakeBuildTargets $cmakeCleanTargets", cleanOnlyStart));
    const exactPlanGate = script.indexOf("Assert-ConfirmedCleanupPlanMatches $CleanupPlanJson $cleanRepositories $cmakeCleanTargets");
    expect(exactPlanGate).toBeGreaterThan(0);
    expect(exactPlanGate).toBeLessThan(cleanOnlyStart);
    expect(script).toContain("当前 Git 清理目标与用户确认的精确计划不一致，拒绝清理。");
    expect(script).toContain("当前 CMake 清理目标与用户确认的精确计划不一致，拒绝清理。");
    for (const marker of [
      "function Get-CleanupRepositoryIdentity",
      'rev-parse --absolute-git-dir',
      "worktree.creationTimeUtcMs",
      "gitDirectory.creationTimeUtcMs",
      "function Get-CleanupDirectoryStateIdentity",
      "lastWriteTimeUtcMs",
      "function Assert-CleanupCmakeTargetIdentityMatches",
      "CMake 清理目标缺少唯一的已确认身份",
      "Git 清理目标缺少唯一的已确认身份",
    ]) expect(script).toContain(marker);
    const clearCmake = script.slice(
      script.indexOf("function Clear-CMakeBuildTargets"),
      script.indexOf("function Invoke-GitCommand"),
    );
    expect(clearCmake.match(/Assert-CleanupCmakeTargetIdentityMatches/g)?.length).toBeGreaterThanOrEqual(3);
    expect(clearCmake.indexOf("Assert-CleanupCmakeTargetIdentityMatches"))
      .toBeLessThan(clearCmake.indexOf("Remove-Item -LiteralPath $target.Path"));
  });
});
