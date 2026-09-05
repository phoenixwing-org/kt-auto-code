import { describe, expect, it } from "vitest";
import { ktcCreateAutoBuildLauncher } from "./autoBuildLauncher.js";

describe("Auto Build launcher export", () => {
  it("writes an editable standalone UI configuration with all selected operations", () => {
    const source = ktcCreateAutoBuildLauncher({
      schemaVersion: 2, rootDirectory: "E:/Root", thirdPartyDirectory: "E:/Third", workingDirectory: "E:/work",
      updateRoot: true, updateThirdParty: false, rootBranch: "develop", branch: "master", cmakeBranch: "develop", clean: false, buildExecutionMode: "parallel",
      projects: [
        { id: "cpp", enabled: true, name: "Cpp", path: "Cpp", branch: "develop", operations: { update: true, cmake: true, caa: false, linkCaa: false } },
        { id: "caa", enabled: true, name: "Caa", path: "Caa", branch: "master", operations: { update: false, cmake: false, caa: true, linkCaa: true } },
      ],
    }, "E:/SourceRoot");
    expect(source).toContain("#Requires -Version 5.1");
    expect(source).toContain("# license     MIT");
    expect(source).toContain("$rootDirectory = 'E:/Root'");
    expect(source).toContain("$toolRootDirectory = 'E:/SourceRoot'");
    expect(source).toContain("$autoBuildScript = Join-Path $toolRootDirectory 'tools\\Invoke-AutoBuild.ps1'");
    expect(source).toContain("$linkCaaSource = Join-Path $toolRootDirectory 'sample\\linkCAA.ps1'");
    expect(source).toContain("$cmakeProjects = @('E:\\work\\Cpp')");
    expect(source).toContain("$caaProjects = @('E:\\work\\Caa')");
    expect(source).toContain("$parallelBuild = $true");
    expect(source).toContain("function Assert-FullyQualifiedWindowsPath");
    expect(source).toContain("Assert-FullyQualifiedWindowsPath $toolRootDirectory '脚本 Root'");
    expect(source).toContain("Assert-FullyQualifiedWindowsPath $project '项目目录'");
    expect(source.indexOf("Assert-FullyQualifiedWindowsPath $rootDirectory")).toBeLessThan(source.indexOf("$autoBuildScript = Join-Path"));
    expect(source).toContain("CmakeProjectPaths=$cmakeProjects; CaaProjectPaths=$caaProjects");
    expect(source).toContain("项目目录下不存在 mk.ps1");
    expect(source).toContain("未找到 linkCAA 源脚本");
    expect(source.indexOf("项目目录下不存在 mk.ps1")).toBeLessThan(source.indexOf("& $autoBuildScript @repositoryArgs"));
    expect(source).toContain("if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0)");
    expect(source).toContain("$pushedLinkLocation = $false");
    expect(source).toContain("finally { if ($pushedLinkLocation) { Pop-Location } }");
    expect(source).toContain("Start-ProjectTask 'Export'");
    expect(source).toContain("Start-ProjectTask 'CMake'");
    expect(source).toContain("Start-ProjectTask 'CAA'");
    expect(source).toContain("$ErrorActionPreference = 'Stop'");
    expect(source).toContain("$pushedLocation = $false");
    expect(source.indexOf("try {\n            Push-Location -LiteralPath $Project")).toBeGreaterThan(source.indexOf("function Start-ProjectTask"));
    expect(source).toContain("$pushedLocation = $true");
    expect(source).toContain("finally { if ($pushedLocation) { Pop-Location } }");
    expect(source).toContain("KtcAutoBuildProjectResult=$true");
    expect(source).toContain("$job.State -eq 'Completed' -and $markedResults.Count -eq 1");
    expect(source).toContain("[void]$output.Add($markedResults[0])");
    expect(source).toContain("Kind='Infrastructure';Project=$job.Name;ExitCode=1");
    expect(source).toContain("PSObject.Properties.Name -contains 'KtcAutoBuildProjectResult'");
    expect(source).toContain("Receive-Job -Wait -ErrorAction Continue");
    expect(source).toContain("finally { $Jobs | Remove-Job -Force -ErrorAction SilentlyContinue }");
    expect(source).not.toContain("Wait-Job | Receive-Job");
    expect(source).toContain("$failed = @($taskResults | Where-Object { $_.ExitCode -ne 0 })");
  });
});
