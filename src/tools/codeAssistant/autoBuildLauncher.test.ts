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
    expect(source).toContain("# license     MIT");
    expect(source).toContain("$rootDirectory = 'E:/Root'");
    expect(source).toContain("$toolRootDirectory = 'E:/SourceRoot'");
    expect(source).toContain("$autoBuildScript = Join-Path $toolRootDirectory 'tools\\Invoke-AutoBuild.ps1'");
    expect(source).toContain("$source = Join-Path $toolRootDirectory 'sample\\linkCAA.ps1'");
    expect(source).toContain("$cmakeProjects = @('E:\\work\\Cpp')");
    expect(source).toContain("$caaProjects = @('E:\\work\\Caa')");
    expect(source).toContain("$parallelBuild = $true");
    expect(source).toContain("if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0)");
    expect(source).toContain("Start-ProjectTask 'Export'");
    expect(source).toContain("Start-ProjectTask 'CMake'");
    expect(source).toContain("Start-ProjectTask 'CAA'");
    expect(source).toContain("PSObject.Properties.Name -contains 'ExitCode'");
    expect(source).toContain("$failed = @($taskResults | Where-Object { $_.ExitCode -ne 0 })");
  });
});
