import { ktcSelectAutoBuildProjects, type KtcAutoBuildConfiguration } from "./autoBuildContracts.js";

const ps = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const psArray = (values: readonly string[]): string => `@(${values.map(ps).join(", ")})`;

export function ktcCreateAutoBuildLauncher(configuration: KtcAutoBuildConfiguration, detectedRootDirectory = configuration.rootDirectory): string {
  const selected = ktcSelectAutoBuildProjects(configuration);
  return `#Requires -Version 5.1
# license     MIT
# brief       Editable Auto Code build configuration exported from the Compile Tool view.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$rootDirectory = ${ps(configuration.rootDirectory)}
$toolRootDirectory = ${ps(detectedRootDirectory || configuration.rootDirectory)}
$thirdPartyDirectory = ${ps(configuration.thirdPartyDirectory)}
$autoBuildScript = Join-Path $toolRootDirectory 'tools\\Invoke-AutoBuild.ps1'
$cmakeProjects = ${psArray(selected.cmakeProjectPaths)}
$caaProjects = ${psArray(selected.caaProjectPaths)}
$linkCaaProjects = ${psArray(selected.linkCaaPaths)}
$repositorySpecsJson = ${ps(JSON.stringify(selected.updateRepositories))}
$parallelBuild = $${configuration.buildExecutionMode === "parallel"}

if (-not (Test-Path -LiteralPath $autoBuildScript -PathType Leaf)) { throw "未找到 $autoBuildScript。请先在 Auto Code 编译工具中同步 Root 脚本。" }
$repositoryArgs = @{ RootDirectory=$rootDirectory; ThirdPartyDirectory=$thirdPartyDirectory; RootBranch=${ps(configuration.rootBranch)}; Branch=${ps(configuration.branch)}; CmakeBranch=${ps(configuration.cmakeBranch)}; UpdateRoot=$${!!configuration.updateRoot}; UpdateThirdParty=$${!!configuration.updateThirdParty}; UpdateCmakeRepositories=$false; RepositorySpecsJson=$repositorySpecsJson; SkipBuild=$true }
${configuration.clean ? "$repositoryArgs.Clean = $true\n$repositoryArgs.ForceClean = $true" : ""}
& $autoBuildScript @repositoryArgs
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "仓库预检与更新失败：$LASTEXITCODE" }

foreach ($project in $linkCaaProjects) {
    $source = Join-Path $toolRootDirectory 'sample\\linkCAA.ps1'; $target = Join-Path $project 'linkCAA.ps1'
    Copy-Item -LiteralPath $source -Destination $target -Force
    Push-Location -LiteralPath $project
    try { & $target; if ($LASTEXITCODE -ne 0) { throw "linkCAA 失败：$project" } } finally { Pop-Location }
}
function Start-ProjectTask([string]$Kind,[string]$Project,[string]$ScriptName) {
    Start-Job -Name "$Kind-$([IO.Path]::GetFileName($Project))" -ArgumentList $Kind,$Project,$ScriptName -ScriptBlock {
        param($Kind,$Project,$ScriptName); Push-Location -LiteralPath $Project
        try { & (Join-Path $Project $ScriptName); [pscustomobject]@{Kind=$Kind;Project=$Project;ExitCode=[int]$LASTEXITCODE} }
        catch { Write-Error $_; [pscustomobject]@{Kind=$Kind;Project=$Project;ExitCode=1} }
        finally { Pop-Location }
    }
}
$exportJobs = @($cmakeProjects | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'export.ps1') } | ForEach-Object { Start-ProjectTask 'Export' $_ 'export.ps1' })
$exportResults = @($exportJobs | Wait-Job | Receive-Job); $exportJobs | Remove-Job -Force
$cmakeResults = @(); $buildJobs = @()
if ($parallelBuild) { $buildJobs += @($cmakeProjects | ForEach-Object { Start-ProjectTask 'CMake' $_ 'mk.ps1' }); $buildJobs += @($caaProjects | ForEach-Object { Start-ProjectTask 'CAA' $_ 'mk.ps1' }) }
else { $buildJobs = @($cmakeProjects | ForEach-Object { Start-ProjectTask 'CMake' $_ 'mk.ps1' }); $cmakeResults = @($buildJobs | Wait-Job | Receive-Job); $buildJobs | Remove-Job -Force; $buildJobs = @($caaProjects | ForEach-Object { Start-ProjectTask 'CAA' $_ 'mk.ps1' }) }
$buildResults = @($buildJobs | Wait-Job | Receive-Job); $buildJobs | Remove-Job -Force
$results = @($exportResults) + @($cmakeResults) + @($buildResults)
$taskResults = @($results | Where-Object { $_ -and $_.PSObject.Properties.Name -contains 'ExitCode' })
$results | Where-Object { -not $_ -or $_.PSObject.Properties.Name -notcontains 'ExitCode' } | ForEach-Object { Write-Host $_ }
$taskResults | Format-Table Kind,Project,ExitCode -AutoSize
$failed = @($taskResults | Where-Object { $_.ExitCode -ne 0 }); if ($failed.Count) { throw "$($failed.Count) 个任务失败。" }
`;
}
