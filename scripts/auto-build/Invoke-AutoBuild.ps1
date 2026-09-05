#Requires -Version 5.1
# license     MIT
# brief       Update selected repositories, then build C++ and CAA projects in ordered parallel phases.
# Auto Code 内置的自动构建编排脚本；可显式同步到 ROOT_DIR/tools 供命令行使用。
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$RootDirectory,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ThirdPartyDirectory,

    [string[]]$AdditionalRepositoryPaths = @(),
    [string]$RepositorySpecsJson = "",

    [ValidateNotNullOrEmpty()]
    [string]$Branch = "develop",

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$RootBranch,

    [bool]$UpdateRoot = $true,
    [bool]$UpdateThirdParty = $true,

    [ValidateNotNullOrEmpty()]
    [string]$CmakeBranch = "master",
    [bool]$UpdateCmakeRepositories = $true,

    [switch]$Clean,
    [switch]$ForceClean,
    [switch]$SkipBuild,

    [string[]]$CmakeProjectPaths = @(),
    [string[]]$CaaProjectPaths = @(),
    [string[]]$MkArguments = @(),

    [string]$LogDirectory = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-ExistingDirectory {
    param([string]$Path, [string]$Description)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Description 不存在：$Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Test-IsPathInsideDirectory {
    param([string]$Path, [string]$Directory)
    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\', '/')
    $resolvedDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd('\', '/')
    return $resolvedPath.Equals($resolvedDirectory, [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolvedPath.StartsWith("$resolvedDirectory\", [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolvedPath.StartsWith("$resolvedDirectory/", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-CMakeCleanTargets {
    param([string[]]$ProjectPaths)
    $targets = foreach ($projectPath in $ProjectPaths) {
        $resolvedProject = Resolve-ExistingDirectory $projectPath "CMake 项目目录"
        $parentDirectory = Split-Path $resolvedProject -Parent
        [pscustomobject]@{ Path = (Join-Path $resolvedProject "build"); PreserveRoot = $false }
        [pscustomobject]@{ Path = (Join-Path $parentDirectory "build"); PreserveRoot = $true }
    }
    return @($targets | Sort-Object Path, PreserveRoot -Unique)
}

function Clear-CMakeBuildTargets {
    param([object[]]$CleanTargets)
    foreach ($target in $CleanTargets) {
        if ($target.PreserveRoot) {
            if ($PSCmdlet.ShouldProcess($target.Path, "清空并保留 CMake 统一 build 目录")) {
                Write-Host "- 清空并保留 CMake build：$($target.Path)" -ForegroundColor Cyan
                New-Item -ItemType Directory -Path $target.Path -Force | Out-Null
                Get-ChildItem -LiteralPath $target.Path -Force | Remove-Item -Recurse -Force
            }
        }
        elseif (-not (Test-Path -LiteralPath $target.Path -PathType Container)) {
            Write-Host "- 跳过不存在的工程内 build：$($target.Path)"
        }
        elseif ($PSCmdlet.ShouldProcess($target.Path, "删除工程内 CMake build 目录")) {
            Write-Host "- 删除工程内 CMake build：$($target.Path)" -ForegroundColor Cyan
            Remove-Item -LiteralPath $target.Path -Recurse -Force
        }
    }
}

function Invoke-GitCommand {
    param([string]$RepositoryPath, [string[]]$Arguments, [switch]$AllowFailure)
    & git -C $RepositoryPath @Arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "Git 命令失败（退出码 $exitCode）：git -C `"$RepositoryPath`" $($Arguments -join ' ')"
    }
    return $exitCode
}

function Resolve-GitTopLevel {
    param([string]$Path, [string]$Description)
    $topLevel = (& git -C $Path rev-parse --show-toplevel)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($topLevel)) {
        throw "$Description 不是 Git 工作树：$Path"
    }
    return [System.IO.Path]::GetFullPath($topLevel.Trim())
}

function Get-RepositoryPlan {
    param([string]$RepositoryPath, [string]$TargetBranch, [bool]$ShouldClean)

    Write-Host "- 预检：$RepositoryPath" -ForegroundColor Cyan
    Invoke-GitCommand $RepositoryPath @("rev-parse", "--is-inside-work-tree") | Out-Null
    $status = (& git -C $RepositoryPath status --porcelain=v1)
    if ($LASTEXITCODE -ne 0) { throw "无法读取仓库状态：$RepositoryPath" }
    if ($status -and -not $ShouldClean) {
        Write-Warning "仓库有本地修改，将保留修改并继续：$RepositoryPath"
    }

    Invoke-GitCommand $RepositoryPath @("fetch", "--prune", "origin") | Out-Null
    $remoteRef = "refs/remotes/origin/$TargetBranch"
    $hasRemoteBranch = (Invoke-GitCommand $RepositoryPath @("show-ref", "--verify", "--quiet", $remoteRef) -AllowFailure) -eq 0
    if (-not $hasRemoteBranch) {
        throw "origin 不存在分支 $TargetBranch：$RepositoryPath"
    }
    $originUrl = (& git -C $RepositoryPath remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($originUrl)) {
        throw "无法读取 origin Git 地址：$RepositoryPath"
    }
    return [pscustomobject]@{
        RepositoryPath = $RepositoryPath
        RemoteName = "origin"
        RemoteUrl = $originUrl
        TargetBranch = $TargetBranch
        ShouldClean = $ShouldClean
        HasChanges = [bool]$status
    }
}

function Update-Repository {
    param([string]$RepositoryPath, [string]$RemoteName, [string]$TargetBranch, [bool]$ShouldClean, [bool]$HasChanges)

    Write-Host "`n==> 更新 $RepositoryPath" -ForegroundColor Cyan
    if ($ShouldClean) {
        Invoke-GitCommand $RepositoryPath @("reset", "--hard", "HEAD") | Out-Null
        Invoke-GitCommand $RepositoryPath @("clean", "-ffdx") | Out-Null
    }
    elseif ($HasChanges) {
        $currentBranch = (& git -C $RepositoryPath branch --show-current).Trim()
        $commit = (& git -C $RepositoryPath rev-parse HEAD).Trim()
        Write-Warning "保留本地修改，跳过检出、拉取、子模块与 LFS 更新：$RepositoryPath"
        Write-Host "保留：$currentBranch $commit（有修改）" -ForegroundColor Yellow
        return
    }

    if ($ShouldClean) {
        Invoke-GitCommand $RepositoryPath @("checkout", "-B", $TargetBranch, "$RemoteName/$TargetBranch") | Out-Null
        Invoke-GitCommand $RepositoryPath @("reset", "--hard", "$RemoteName/$TargetBranch") | Out-Null
    }
    else {
        $hasLocal = (Invoke-GitCommand $RepositoryPath @("show-ref", "--verify", "--quiet", "refs/heads/$TargetBranch") -AllowFailure) -eq 0
        if ($hasLocal) {
            Invoke-GitCommand $RepositoryPath @("checkout", $TargetBranch) | Out-Null
        }
        else {
            Invoke-GitCommand $RepositoryPath @("checkout", "--track", "-b", $TargetBranch, "$RemoteName/$TargetBranch") | Out-Null
        }
        Invoke-GitCommand $RepositoryPath @("pull", "--ff-only", $RemoteName, $TargetBranch) | Out-Null
    }

    Invoke-GitCommand $RepositoryPath @("submodule", "sync", "--recursive") | Out-Null
    Invoke-GitCommand $RepositoryPath @("submodule", "update", "--init", "--recursive") | Out-Null
    & git lfs version *> $null
    if ($LASTEXITCODE -eq 0) {
        Invoke-GitCommand $RepositoryPath @("lfs", "install", "--local") | Out-Null
        Invoke-GitCommand $RepositoryPath @("lfs", "pull") | Out-Null
    }
    else {
        Write-Warning "未检测到 Git LFS，已跳过 LFS pull：$RepositoryPath"
    }

    $commit = (& git -C $RepositoryPath rev-parse HEAD).Trim()
    Write-Host "完成：$RemoteName/$TargetBranch $commit" -ForegroundColor Green
}

function Start-MkJob {
    param([string]$Kind, [string]$BuildPath, [string[]]$Arguments, [string]$BatchLogDirectory)

    $resolvedPath = Resolve-ExistingDirectory $BuildPath "$Kind 编译目录"
    $mkScript = Join-Path $resolvedPath "mk.ps1"
    if (-not (Test-Path -LiteralPath $mkScript -PathType Leaf)) {
        throw "$Kind 编译目录下不存在 mk.ps1：$resolvedPath"
    }
    $safeName = (Split-Path -Leaf $resolvedPath) -replace '[^A-Za-z0-9_.-]', '_'
    $logPath = Join-Path $BatchLogDirectory "$Kind-$safeName.log"
    Write-Host "启动 $Kind 编译：$resolvedPath" -ForegroundColor Cyan
    return Start-Job -Name "$Kind-$safeName" -ScriptBlock {
        param($ScriptPath, $WorkingDirectory, $BuildArguments, $OutputLog, $BuildKind)
        try {
            Push-Location $WorkingDirectory
            & $ScriptPath @BuildArguments *>&1 | Tee-Object -FilePath $OutputLog
            $code = $LASTEXITCODE
            if ($null -eq $code) { $code = 0 }
            [pscustomobject]@{ Kind = $BuildKind; Project = $WorkingDirectory; ExitCode = $code; Log = $OutputLog }
        }
        catch {
            $_ | Out-String | Add-Content -LiteralPath $OutputLog
            [pscustomobject]@{ Kind = $BuildKind; Project = $WorkingDirectory; ExitCode = 1; Log = $OutputLog }
        }
        finally { Pop-Location }
    } -ArgumentList $mkScript, $resolvedPath, $Arguments, $logPath, $Kind
}

function Receive-BuildJobs {
    param([System.Management.Automation.Job[]]$Jobs)

    $results = [System.Collections.Generic.List[object]]::new()
    do {
        foreach ($job in $Jobs) {
            $items = @(Receive-Job -Job $job -ErrorAction Continue)
            foreach ($item in $items) {
                if ($item -and $item.PSObject.Properties.Name -contains "ExitCode") {
                    $results.Add($item)
                }
                elseif ($null -ne $item) {
                    Write-Host ("[{0}] {1}" -f $job.Name, ("$item").TrimEnd())
                }
            }
        }
        $running = @($Jobs | Where-Object { $_.State -in @("NotStarted", "Running") }).Count -gt 0
        if ($running) { Start-Sleep -Milliseconds 200 }
    } while ($running)

    # Drain output written between the last poll and the terminal job state.
    foreach ($job in $Jobs) {
        foreach ($item in @(Receive-Job -Job $job -ErrorAction Continue)) {
            if ($item -and $item.PSObject.Properties.Name -contains "ExitCode") {
                $results.Add($item)
            }
            elseif ($null -ne $item) {
                Write-Host ("[{0}] {1}" -f $job.Name, ("$item").TrimEnd())
            }
        }
    }
    return @($results)
}

function Invoke-BuildPhase {
    param([string]$Kind, [string[]]$BuildPaths, [string[]]$Arguments, [string]$BatchLogDirectory)
    if ($BuildPaths.Count -eq 0) { return @() }
    $jobs = @($BuildPaths | Select-Object -Unique | ForEach-Object {
        Start-MkJob $Kind $_ $Arguments $BatchLogDirectory
    })
    $results = @(Receive-BuildJobs $jobs)
    $jobs | Remove-Job -Force
    return $results
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "未找到 git，请先安装 Git 并加入 PATH。" }
$rootRepository = Resolve-ExistingDirectory $RootDirectory "ROOT_DIR 仓库目录"
$thirdPartyRepository = Resolve-ExistingDirectory $ThirdPartyDirectory "ROOT_DIR_3rdParty 仓库目录"
if ([string]::IsNullOrWhiteSpace($LogDirectory)) {
    $LogDirectory = Join-Path $rootRepository "logs"
}
$additionalRepositories = @($AdditionalRepositoryPaths | ForEach-Object {
    Resolve-ExistingDirectory $_ "附加 Git 仓库目录"
} | Select-Object -Unique)
$additionalRepositorySpecs = @{}
if (-not [string]::IsNullOrWhiteSpace($RepositorySpecsJson)) {
    $parsedRepositorySpecs = $RepositorySpecsJson | ConvertFrom-Json
    foreach ($item in $parsedRepositorySpecs) {
        $resolvedSpecPath = Resolve-ExistingDirectory ([string]$item.path) "项目表 Git 仓库目录"
        $additionalRepositorySpecs[$resolvedSpecPath.ToLowerInvariant()] = [string]$item.branch
        $additionalRepositories += $resolvedSpecPath
    }
    $additionalRepositories = @($additionalRepositories | Select-Object -Unique)
}
$resolvedCmakeProjectPaths = @($CmakeProjectPaths | ForEach-Object {
    Resolve-ExistingDirectory $_ "CMake 项目目录"
} | Select-Object -Unique)
$cmakeRepositories = @($resolvedCmakeProjectPaths | ForEach-Object {
    Resolve-GitTopLevel $_ "CMake 项目"
} | Select-Object -Unique)
$cleanRepositories = @(@($rootRepository, $thirdPartyRepository) + $(if ($Clean) { $cmakeRepositories } else { @() }) | Select-Object -Unique)
$repositories = @(@($cleanRepositories + $additionalRepositories) | Select-Object -Unique)

if ($Clean) {
    foreach ($cleanRepository in $cleanRepositories) {
        if (Test-IsPathInsideDirectory $PSCommandPath $cleanRepository) {
            throw "拒绝清理脚本自身所在仓库：$cleanRepository。请从独立工具目录运行 Invoke-AutoBuild.ps1，并把可清理检出放在单独目录。"
        }
    }
}

$repositorySpecs = @(
    if ($UpdateRoot -or $Clean) { [pscustomobject]@{ Path = $rootRepository; TargetBranch = $RootBranch; ShouldClean = [bool]$Clean } }
    if ($UpdateThirdParty -or $Clean) { [pscustomobject]@{ Path = $thirdPartyRepository; TargetBranch = $Branch; ShouldClean = [bool]$Clean } }
    if ($UpdateCmakeRepositories -or $Clean) { foreach ($cmakeRepository in $cmakeRepositories) { [pscustomobject]@{ Path = $cmakeRepository; TargetBranch = $CmakeBranch; ShouldClean = [bool]$Clean } } }
    foreach ($additionalRepository in $additionalRepositories) {
        $specBranch = $additionalRepositorySpecs[$additionalRepository.ToLowerInvariant()]
        [pscustomobject]@{ Path = $additionalRepository; TargetBranch = $(if ([string]::IsNullOrWhiteSpace($specBranch)) { $Branch } else { $specBranch }); ShouldClean = $false }
    }
)
$plannedRepositories = @{}
$repositoryPlans = @(
    foreach ($spec in $repositorySpecs) {
        $key = $spec.Path.ToLowerInvariant()
        if (-not $plannedRepositories.ContainsKey($key)) {
            $plannedRepositories[$key] = $true
            Get-RepositoryPlan $spec.Path $spec.TargetBranch $spec.ShouldClean
        }
    }
)
$cmakeCleanTargets = @(Get-CMakeCleanTargets $resolvedCmakeProjectPaths)

Write-Host ""
Write-Host "| 目录 | Git 地址 | 分支 | 清理 |"
Write-Host "| --- | --- | --- | --- |"
foreach ($plan in $repositoryPlans) {
    $markdownPath = $plan.RepositoryPath.Replace("|", "\|")
    $markdownUrl = $plan.RemoteUrl.Replace("|", "\|")
    $cleanLabel = if ($plan.ShouldClean) { "是" } else { "否" }
    Write-Host "| $markdownPath | $markdownUrl | $($plan.RemoteName)/$($plan.TargetBranch) | $cleanLabel |"
}

if ($Clean -and -not $ForceClean -and -not $WhatIfPreference) {
    Write-Warning "-Clean 会清理 ROOT_DIR、ROOT_DIR_3rdParty 与 CMake 项目所属 Git 仓库；以下仓库的未提交修改、未跟踪文件和忽略文件会被删除："
    $cleanRepositories | ForEach-Object { Write-Warning "  $_" }
    if ($cmakeCleanTargets.Count -gt 0) {
        Write-Warning "以下 CMake 构建目录会被处理："
        $cmakeCleanTargets | ForEach-Object {
            $action = if ($_.PreserveRoot) { "清空内容并保留目录" } else { "删除整个目录" }
            Write-Warning "  [$action] $($_.Path)"
        }
    }
    if ((Read-Host "输入 CLEAN 继续") -cne "CLEAN") { throw "用户取消清理。" }
}

if ($Clean) {
    Clear-CMakeBuildTargets $cmakeCleanTargets
}

$repositoryJobs = @()
$initialization = [scriptblock]::Create(
    "function Invoke-GitCommand { $(${function:Invoke-GitCommand}.ToString()) }`n" +
    "function Update-Repository { $(${function:Update-Repository}.ToString()) }"
)
foreach ($plan in $repositoryPlans) {
    $target = "$($plan.RemoteName)/$($plan.TargetBranch)"
    if ($PSCmdlet.ShouldProcess($plan.RepositoryPath, "并行更新到 $target（Clean=$($plan.ShouldClean)）")) {
        $repositoryJobs += Start-Job -InitializationScript $initialization -ScriptBlock {
            param($RepositoryPath, $RemoteName, $TargetBranch, $ShouldClean, $HasChanges)
            try { Update-Repository $RepositoryPath $RemoteName $TargetBranch $ShouldClean $HasChanges; [pscustomobject]@{ Path = $RepositoryPath; ExitCode = 0 } }
            catch { Write-Error $_; [pscustomobject]@{ Path = $RepositoryPath; ExitCode = 1 } }
        } -ArgumentList $plan.RepositoryPath, $plan.RemoteName, $plan.TargetBranch, $plan.ShouldClean, $plan.HasChanges
    }
}
if ($repositoryJobs.Count -gt 0) {
    $repositoryJobs | Wait-Job | Out-Null
    # Git writes normal status messages such as "Already on ..." to stderr.
    # Do not let the parent script's ErrorActionPreference=Stop abort result collection.
    $repositoryResults = @($repositoryJobs | Receive-Job -Wait -ErrorAction Continue)
    $repositoryJobs | Remove-Job -Force
    $failedRepositories = @($repositoryResults | Where-Object { $_.PSObject.Properties.Name -contains 'ExitCode' -and $_.ExitCode -ne 0 })
    if ($failedRepositories.Count -gt 0) { throw "$($failedRepositories.Count) 个仓库更新失败。" }
}

if ($SkipBuild -or $WhatIfPreference) {
    Write-Host "仓库更新阶段完成；已跳过编译。" -ForegroundColor Green
    return
}
if ($CmakeProjectPaths.Count -eq 0 -and $CaaProjectPaths.Count -eq 0) {
    throw "未指定编译目录。请传 -CmakeProjectPaths、-CaaProjectPaths，或使用 -SkipBuild。"
}

$batchLogDirectory = Join-Path $LogDirectory (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $batchLogDirectory -Force | Out-Null

# 固定默认编排：CMake 阶段完成后才进入 CAA；各阶段内部并行。
$results = @(Invoke-BuildPhase "CMake" $CmakeProjectPaths $MkArguments $batchLogDirectory)
$cmakeFailed = @($results | Where-Object { $_.ExitCode -ne 0 })
if ($cmakeFailed.Count -eq 0) {
    $results += @(Invoke-BuildPhase "CAA" $CaaProjectPaths $MkArguments $batchLogDirectory)
}
else {
    Write-Warning "CMake 阶段失败，未启动 CAA 阶段。"
}

$results | Format-Table Kind, Project, ExitCode, Log -AutoSize
$failed = @($results | Where-Object { $_.ExitCode -ne 0 })
if ($failed.Count -gt 0) { throw "$($failed.Count) 个编译任务失败。日志目录：$batchLogDirectory" }
Write-Host "全部完成。日志目录：$batchLogDirectory" -ForegroundColor Green
