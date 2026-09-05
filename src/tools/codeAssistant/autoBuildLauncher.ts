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
function Assert-FullyQualifiedWindowsPath([string]$Path,[string]$Description) {
    if ([string]::IsNullOrWhiteSpace($Path)) { throw "$Description 不能为空。" }
    $isExtended = $Path -match '^\\\\\?\\(?:[A-Za-z]:[\\/]|UNC\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))'
    $isDrive = $Path -match '^[A-Za-z]:[\\/]'
    $isUnc = $Path -match '^[\\/]{2}[^?.\\/][^\\/]*[\\/][^\\/]+(?:[\\/]|$)'
    if (-not ($isExtended -or $isDrive -or $isUnc)) { throw "$Description 必须使用带盘符或 UNC 共享根的绝对路径：$Path" }
}
$rootDirectory = ${ps(configuration.rootDirectory)}
$toolRootDirectory = ${ps(detectedRootDirectory || configuration.rootDirectory)}
$thirdPartyDirectory = ${ps(configuration.thirdPartyDirectory)}
$cmakeProjects = ${psArray(selected.cmakeProjectPaths)}
$caaProjects = ${psArray(selected.caaProjectPaths)}
$linkCaaProjects = ${psArray(selected.linkCaaPaths)}
$repositorySpecsJson = ${ps(JSON.stringify(selected.updateRepositories))}
$parallelBuild = $${configuration.buildExecutionMode === "parallel"}

Assert-FullyQualifiedWindowsPath $rootDirectory 'ROOT_DIR'
Assert-FullyQualifiedWindowsPath $toolRootDirectory '脚本 Root'
Assert-FullyQualifiedWindowsPath $thirdPartyDirectory 'ROOT_DIR_3rdParty'
foreach ($project in @($cmakeProjects + $caaProjects + $linkCaaProjects)) {
    Assert-FullyQualifiedWindowsPath $project '项目目录'
}
$autoBuildScript = Join-Path $toolRootDirectory 'tools\\Invoke-AutoBuild.ps1'
if (-not (Test-Path -LiteralPath $autoBuildScript -PathType Leaf)) { throw "未找到 $autoBuildScript。请先在 Auto Code 编译工具中同步 Root 脚本。" }
foreach ($project in @($cmakeProjects + $caaProjects)) {
    if (-not (Test-Path -LiteralPath $project -PathType Container)) { throw "项目目录不存在：$project" }
    $mkScript = Join-Path $project 'mk.ps1'
    if (-not (Test-Path -LiteralPath $mkScript -PathType Leaf)) { throw "项目目录下不存在 mk.ps1：$project" }
}
foreach ($project in $linkCaaProjects) {
    if (-not (Test-Path -LiteralPath $project -PathType Container)) { throw "linkCAA 项目目录不存在：$project" }
}
$linkCaaSource = Join-Path $toolRootDirectory 'sample\\linkCAA.ps1'
if ($linkCaaProjects.Count -gt 0 -and -not (Test-Path -LiteralPath $linkCaaSource -PathType Leaf)) { throw "未找到 linkCAA 源脚本：$linkCaaSource" }
$repositoryArgs = @{ RootDirectory=$rootDirectory; ThirdPartyDirectory=$thirdPartyDirectory; RootBranch=${ps(configuration.rootBranch)}; Branch=${ps(configuration.branch)}; CmakeBranch=${ps(configuration.cmakeBranch)}; UpdateRoot=$${!!configuration.updateRoot}; UpdateThirdParty=$${!!configuration.updateThirdParty}; UpdateCmakeRepositories=$false; RepositorySpecsJson=$repositorySpecsJson; CmakeProjectPaths=$cmakeProjects; CaaProjectPaths=$caaProjects; SkipBuild=$true }
${configuration.clean ? "$repositoryArgs.Clean = $true\n$repositoryArgs.ForceClean = $true" : ""}
& $autoBuildScript @repositoryArgs
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "仓库预检与更新失败：$LASTEXITCODE" }

foreach ($project in $linkCaaProjects) {
    $target = Join-Path $project 'linkCAA.ps1'
    Copy-Item -LiteralPath $linkCaaSource -Destination $target -Force
    $pushedLinkLocation = $false
    try {
        Push-Location -LiteralPath $project
        $pushedLinkLocation = $true
        & $target
        if ($LASTEXITCODE -ne 0) { throw "linkCAA 失败：$project" }
    }
    finally { if ($pushedLinkLocation) { Pop-Location } }
}
function Start-ProjectTask([string]$Kind,[string]$Project,[string]$ScriptName) {
    Start-Job -Name "$Kind-$([IO.Path]::GetFileName($Project))" -ArgumentList $Kind,$Project,$ScriptName -ScriptBlock {
        param($Kind,$Project,$ScriptName)
        $ErrorActionPreference = 'Stop'
        $pushedLocation = $false
        try {
            Push-Location -LiteralPath $Project
            $pushedLocation = $true
            & (Join-Path $Project $ScriptName)
            [pscustomobject]@{KtcAutoBuildProjectResult=$true;Kind=$Kind;Project=$Project;ExitCode=[int]$LASTEXITCODE}
        }
        catch {
            Write-Error $_ -ErrorAction Continue
            [pscustomobject]@{KtcAutoBuildProjectResult=$true;Kind=$Kind;Project=$Project;ExitCode=1;Error=$_.Exception.Message}
        }
        finally { if ($pushedLocation) { Pop-Location } }
    }
}
function Receive-ProjectTasks([System.Management.Automation.Job[]]$Jobs) {
    if (@($Jobs).Count -eq 0) { return @() }
    $output = New-Object System.Collections.Generic.List[object]
    try {
        $Jobs | Wait-Job | Out-Null
        foreach ($job in @($Jobs)) {
            $jobOutput = @($job | Receive-Job -Wait -ErrorAction Continue)
            $markedResults = @($jobOutput | Where-Object { $_ -and $_.PSObject.Properties.Name -contains 'KtcAutoBuildProjectResult' -and $_.KtcAutoBuildProjectResult -eq $true })
            $plainOutput = @($jobOutput | Where-Object { -not $_ -or $_.PSObject.Properties.Name -notcontains 'KtcAutoBuildProjectResult' -or $_.KtcAutoBuildProjectResult -ne $true })
            foreach ($item in $plainOutput) { [void]$output.Add($item) }
            if ($job.State -eq 'Completed' -and $markedResults.Count -eq 1) {
                [void]$output.Add($markedResults[0])
            }
            else {
                $reason = "任务 Job 状态=$($job.State)，结果数=$($markedResults.Count)（期望 1）。"
                [void]$output.Add([pscustomobject]@{KtcAutoBuildProjectResult=$true;Kind='Infrastructure';Project=$job.Name;ExitCode=1;Error=$reason})
            }
        }
        return @($output)
    }
    finally { $Jobs | Remove-Job -Force -ErrorAction SilentlyContinue }
}
$exportJobs = @($cmakeProjects | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'export.ps1') } | ForEach-Object { Start-ProjectTask 'Export' $_ 'export.ps1' })
$exportResults = @(Receive-ProjectTasks $exportJobs)
$cmakeResults = @(); $buildJobs = @()
if ($parallelBuild) { $buildJobs += @($cmakeProjects | ForEach-Object { Start-ProjectTask 'CMake' $_ 'mk.ps1' }); $buildJobs += @($caaProjects | ForEach-Object { Start-ProjectTask 'CAA' $_ 'mk.ps1' }) }
else { $buildJobs = @($cmakeProjects | ForEach-Object { Start-ProjectTask 'CMake' $_ 'mk.ps1' }); $cmakeResults = @(Receive-ProjectTasks $buildJobs); $buildJobs = @($caaProjects | ForEach-Object { Start-ProjectTask 'CAA' $_ 'mk.ps1' }) }
$buildResults = @(Receive-ProjectTasks $buildJobs)
$results = @($exportResults) + @($cmakeResults) + @($buildResults)
$taskResults = @($results | Where-Object { $_ -and $_.PSObject.Properties.Name -contains 'KtcAutoBuildProjectResult' -and $_.KtcAutoBuildProjectResult -eq $true })
$results | Where-Object { -not $_ -or $_.PSObject.Properties.Name -notcontains 'KtcAutoBuildProjectResult' -or $_.KtcAutoBuildProjectResult -ne $true } | ForEach-Object { Write-Host $_ }
$taskResults | Format-Table Kind,Project,ExitCode -AutoSize
$failed = @($taskResults | Where-Object { $_.ExitCode -ne 0 }); if ($failed.Count) { throw "$($failed.Count) 个任务失败。" }
`;
}
