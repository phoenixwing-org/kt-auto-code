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
$pathSeparators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)

function Test-IsFullyQualifiedWindowsPath {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    if ($Path -match '^\\\\\?\\') {
        return $Path -match '^\\\\\?\\(?:[A-Za-z]:[\\/]|UNC\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))'
    }
    if ($Path -match '^\\\\\.\\') { return $false }
    return $Path -match '^[A-Za-z]:[\\/]' -or
        $Path -match '^[\\/]{2}[^?.\\/][^\\/]*[\\/][^\\/]+(?:[\\/]|$)'
}

function Resolve-ExistingDirectory {
    param([string]$Path, [string]$Description)
    if (-not (Test-IsFullyQualifiedWindowsPath $Path)) {
        throw "$Description 必须使用带盘符或 UNC 共享根的绝对路径：$Path"
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Description 不存在：$Path"
    }
    return (Resolve-Path -LiteralPath $Path).ProviderPath
}

function Test-IsPathInsideDirectory {
    param([string]$Path, [string]$Directory)
    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd($pathSeparators)
    $resolvedDirectory = [System.IO.Path]::GetFullPath($Directory).TrimEnd($pathSeparators)
    return $resolvedPath.Equals($resolvedDirectory, [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolvedPath.StartsWith("$resolvedDirectory\", [System.StringComparison]::OrdinalIgnoreCase) -or
        $resolvedPath.StartsWith("$resolvedDirectory/", [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-IsReparsePoint {
    param([System.IO.FileSystemInfo]$Item)
    return (($null -ne $Item) -and
        (($Item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0))
}

function Get-FirstReparsePointInPathChain {
    param([string]$Path)

    $currentPath = [System.IO.Path]::GetFullPath($Path)
    $filesystemRoot = [System.IO.Path]::GetPathRoot($currentPath)
    $separatorCharacters = [char[]]@('\', '/')
    while (-not (Test-Path -LiteralPath $currentPath -ErrorAction Stop)) {
        $parentPath = Split-Path -LiteralPath $currentPath -Parent
        if ([string]::IsNullOrWhiteSpace($parentPath) -or
            $parentPath.Equals($currentPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $null
        }
        $currentPath = $parentPath
    }

    while (-not [string]::IsNullOrWhiteSpace($currentPath)) {
        $item = Get-Item -LiteralPath $currentPath -Force -ErrorAction Stop
        if (Test-IsReparsePoint $item) { return [string]$item.FullName }
        if ($currentPath.TrimEnd($separatorCharacters).Equals(
                $filesystemRoot.TrimEnd($separatorCharacters),
                [System.StringComparison]::OrdinalIgnoreCase)) {
            break
        }
        $parentPath = Split-Path -LiteralPath $currentPath -Parent
        if ([string]::IsNullOrWhiteSpace($parentPath) -or
            $parentPath.Equals($currentPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            break
        }
        $currentPath = $parentPath
    }
    return $null
}

function Get-FirstReparsePointInTree {
    param([string]$Path, [switch]$SkipGitDirectory)

    if (-not (Test-Path -LiteralPath $Path -ErrorAction Stop)) { return $null }
    $rootItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (Test-IsReparsePoint $rootItem) { return [string]$rootItem.FullName }
    if (-not $rootItem.PSIsContainer) { return $null }

    # PowerShell 5.1 的 Remove-Item 与 Git for Windows 都可能穿过 reparse point。
    # 因此只做显式栈遍历，并且发现 reparse point 后绝不把它压栈。
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    [void]$pending.Push([string]$rootItem.FullName)
    while ($pending.Count -gt 0) {
        $currentDirectory = $pending.Pop()
        $isRootDirectory = $currentDirectory.Equals(
            [string]$rootItem.FullName,
            [System.StringComparison]::OrdinalIgnoreCase)
        foreach ($child in @(Get-ChildItem -LiteralPath $currentDirectory -Force -ErrorAction Stop)) {
            if (Test-IsReparsePoint $child) { return [string]$child.FullName }
            # 只跳过当前待清理仓库自己的普通 .git；嵌套仓库可能被 git clean -ffdx 删除，仍须完整扫描。
            if ($SkipGitDirectory -and $isRootDirectory -and $child.PSIsContainer -and $child.Name -ieq '.git') { continue }
            if ($child.PSIsContainer) { [void]$pending.Push([string]$child.FullName) }
        }
    }
    return $null
}

function Assert-CleanupPathHasNoReparsePoint {
    param(
        [string]$Path,
        [string]$Description,
        [switch]$CheckTree,
        [switch]$SkipGitDirectory
    )

    $pathReparsePoint = Get-FirstReparsePointInPathChain $Path
    if (-not [string]::IsNullOrWhiteSpace($pathReparsePoint)) {
        throw "$Description 的路径链包含 junction、符号链接或其他 reparse point，拒绝清理：$pathReparsePoint"
    }
    if ($CheckTree) {
        $treeReparsePoint = Get-FirstReparsePointInTree $Path -SkipGitDirectory:$SkipGitDirectory
        if (-not [string]::IsNullOrWhiteSpace($treeReparsePoint)) {
            throw "$Description 内包含 junction、符号链接或其他 reparse point，拒绝清理：$treeReparsePoint"
        }
    }
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
        # 初始总预检之后再做一次紧邻删除的防御性检查，缩小竞态窗口。
        Assert-CleanupPathHasNoReparsePoint $target.Path "CMake 构建目录" -CheckTree
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
        # git clean -ffdx 也可能遍历未跟踪/忽略的 NTFS junction。
        Assert-CleanupPathHasNoReparsePoint $RepositoryPath "Git 清理仓库" -CheckTree -SkipGitDirectory
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
        $ErrorActionPreference = "Stop"
        $locationPushed = $false
        try {
            Push-Location -LiteralPath $WorkingDirectory -ErrorAction Stop
            $locationPushed = $true
            if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf -ErrorAction Stop)) {
                throw "$BuildKind 编译脚本不存在：$ScriptPath"
            }
            & $ScriptPath @BuildArguments *>&1 | Tee-Object -FilePath $OutputLog -ErrorAction Stop
            $code = $LASTEXITCODE
            if ($null -eq $code) { $code = 0 }
            [pscustomobject]@{ KtcAutoBuildResult = $true; Kind = $BuildKind; Project = $WorkingDirectory; ExitCode = $code; Log = $OutputLog }
        }
        catch {
            $errorText = $_ | Out-String
            $errorText | Add-Content -LiteralPath $OutputLog -ErrorAction SilentlyContinue
            [pscustomobject]@{ KtcAutoBuildResult = $true; Kind = $BuildKind; Project = $WorkingDirectory; ExitCode = 1; Log = $OutputLog; Error = $errorText.Trim() }
        }
        finally {
            if ($locationPushed) { Pop-Location -ErrorAction SilentlyContinue }
        }
    } -ArgumentList $mkScript, $resolvedPath, $Arguments, $logPath, $Kind
}

function Receive-BuildJobs {
    param([System.Management.Automation.Job[]]$Jobs)

    $results = [System.Collections.Generic.List[object]]::new()
    $resultCounts = @{}
    foreach ($job in $Jobs) { $resultCounts[[string]$job.Id] = 0 }
    do {
        foreach ($job in $Jobs) {
            $items = @(Receive-Job -Job $job -ErrorAction Continue)
            foreach ($item in $items) {
                if ($item -and
                    $item.PSObject.Properties.Name -contains "KtcAutoBuildResult" -and
                    $item.KtcAutoBuildResult -eq $true) {
                    $resultCounts[[string]$job.Id] = [int]$resultCounts[[string]$job.Id] + 1
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
            if ($item -and
                $item.PSObject.Properties.Name -contains "KtcAutoBuildResult" -and
                $item.KtcAutoBuildResult -eq $true) {
                $resultCounts[[string]$job.Id] = [int]$resultCounts[[string]$job.Id] + 1
                $results.Add($item)
            }
            elseif ($null -ne $item) {
                Write-Host ("[{0}] {1}" -f $job.Name, ("$item").TrimEnd())
            }
        }
    }

    foreach ($job in $Jobs) {
        $state = [string]$job.State
        $resultCount = [int]$resultCounts[[string]$job.Id]
        if ($state -ne "Completed" -or $resultCount -ne 1) {
            $reason = if ($state -ne "Completed") {
                "后台任务终态为 $state"
            }
            else {
                "预期恰好 1 个结果，实际收到 $resultCount 个"
            }
            Write-Warning "编译后台任务基础设施失败：$($job.Name)；$reason。"
            $results.Add([pscustomobject]@{
                KtcAutoBuildResult = $true
                Kind = "Infrastructure"
                Project = $job.Name
                ExitCode = 1
                Log = ""
                Error = $reason
            })
        }
    }
    return @($results)
}

function Invoke-BuildPhase {
    param([string]$Kind, [string[]]$BuildPaths, [string[]]$Arguments, [string]$BatchLogDirectory)
    if ($BuildPaths.Count -eq 0) { return @() }
    $jobs = @()
    try {
        foreach ($buildPath in @($BuildPaths | Select-Object -Unique)) {
            $jobs += Start-MkJob $Kind $buildPath $Arguments $BatchLogDirectory
        }
        return @(Receive-BuildJobs $jobs)
    }
    finally {
        if ($jobs.Count -gt 0) {
            $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
        }
    }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "未找到 git，请先安装 Git 并加入 PATH。" }
$rootRepository = Resolve-ExistingDirectory $RootDirectory "ROOT_DIR 仓库目录"
$thirdPartyRepository = Resolve-ExistingDirectory $ThirdPartyDirectory "ROOT_DIR_3rdParty 仓库目录"
if ([string]::IsNullOrWhiteSpace($LogDirectory)) {
    $LogDirectory = Join-Path $rootRepository "logs"
}
elseif (-not (Test-IsFullyQualifiedWindowsPath $LogDirectory)) {
    throw "日志目录必须使用带盘符或 UNC 共享根的绝对路径：$LogDirectory"
}
else {
    $LogDirectory = [System.IO.Path]::GetFullPath($LogDirectory)
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
$resolvedCaaProjectPaths = @($CaaProjectPaths | ForEach-Object {
    Resolve-ExistingDirectory $_ "CAA 编译目录"
} | Select-Object -Unique)
$cmakeRepositories = @($resolvedCmakeProjectPaths | ForEach-Object {
    Resolve-GitTopLevel $_ "CMake 项目"
} | Select-Object -Unique)
$cleanRepositories = @(@($rootRepository, $thirdPartyRepository) + $(if ($Clean) { $cmakeRepositories } else { @() }) | Select-Object -Unique)
$repositories = @(@($cleanRepositories + $additionalRepositories) | Select-Object -Unique)
$cmakeCleanTargets = @($(if ($Clean) { Get-CMakeCleanTargets $resolvedCmakeProjectPaths } else { @() }))

if ($Clean) {
    $scriptPathReparsePoint = Get-FirstReparsePointInPathChain $PSCommandPath
    if (-not [string]::IsNullOrWhiteSpace($scriptPathReparsePoint)) {
        throw "自动构建脚本的路径链包含 junction、符号链接或其他 reparse point，拒绝清理：$scriptPathReparsePoint"
    }
    foreach ($cleanRepository in $cleanRepositories) {
        $filesystemRoot = [System.IO.Path]::GetPathRoot($cleanRepository)
        $normalizedCleanRepository = $cleanRepository.TrimEnd($pathSeparators)
        $isExtendedUncRoot = $normalizedCleanRepository -match '^\\\\\?\\UNC\\[^\\]+\\[^\\]+$'
        if ($isExtendedUncRoot -or $normalizedCleanRepository.Equals($filesystemRoot.TrimEnd($pathSeparators), [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "拒绝清理文件系统根目录：$cleanRepository"
        }
        if (Test-IsPathInsideDirectory $PSCommandPath $cleanRepository) {
            throw "拒绝清理脚本自身所在仓库：$cleanRepository。请从独立工具目录运行 Invoke-AutoBuild.ps1，并把可清理检出放在单独目录。"
        }
        Assert-CleanupPathHasNoReparsePoint $cleanRepository "Git 清理仓库" -CheckTree -SkipGitDirectory
    }
    foreach ($cleanTarget in $cmakeCleanTargets) {
        Assert-CleanupPathHasNoReparsePoint $cleanTarget.Path "CMake 构建目录" -CheckTree
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

$initialization = [scriptblock]::Create(
    "function Invoke-GitCommand { $(${function:Invoke-GitCommand}.ToString()) }`n" +
    "function Test-IsReparsePoint { $(${function:Test-IsReparsePoint}.ToString()) }`n" +
    "function Get-FirstReparsePointInPathChain { $(${function:Get-FirstReparsePointInPathChain}.ToString()) }`n" +
    "function Get-FirstReparsePointInTree { $(${function:Get-FirstReparsePointInTree}.ToString()) }`n" +
    "function Assert-CleanupPathHasNoReparsePoint { $(${function:Assert-CleanupPathHasNoReparsePoint}.ToString()) }`n" +
    "function Update-Repository { $(${function:Update-Repository}.ToString()) }"
)
$repositoryJobs = @()
$repositoryResults = [System.Collections.Generic.List[object]]::new()
try {
    foreach ($plan in $repositoryPlans) {
        $target = "$($plan.RemoteName)/$($plan.TargetBranch)"
        if ($PSCmdlet.ShouldProcess($plan.RepositoryPath, "并行更新到 $target（Clean=$($plan.ShouldClean)）")) {
            $repositoryJobs += Start-Job -InitializationScript $initialization -ScriptBlock {
                param($RepositoryPath, $RemoteName, $TargetBranch, $ShouldClean, $HasChanges)
                try {
                    Update-Repository $RepositoryPath $RemoteName $TargetBranch $ShouldClean $HasChanges
                    [pscustomobject]@{ KtcAutoBuildRepositoryResult = $true; Path = $RepositoryPath; ExitCode = 0 }
                }
                catch {
                    Write-Error $_ -ErrorAction Continue
                    [pscustomobject]@{ KtcAutoBuildRepositoryResult = $true; Path = $RepositoryPath; ExitCode = 1; Error = $_.Exception.Message }
                }
            } -ArgumentList $plan.RepositoryPath, $plan.RemoteName, $plan.TargetBranch, $plan.ShouldClean, $plan.HasChanges
        }
    }
    if ($repositoryJobs.Count -gt 0) {
        $repositoryJobs | Wait-Job | Out-Null
        foreach ($job in $repositoryJobs) {
            # Git writes normal status messages such as "Already on ..." to stderr.
            # Do not let the parent script's ErrorActionPreference=Stop abort result collection.
            $items = @($job | Receive-Job -Wait -ErrorAction Continue)
            $markedResults = @($items | Where-Object {
                $_ -and
                $_.PSObject.Properties.Name -contains 'KtcAutoBuildRepositoryResult' -and
                $_.KtcAutoBuildRepositoryResult -eq $true
            })
            foreach ($result in $markedResults) { $repositoryResults.Add($result) }

            $state = [string]$job.State
            if ($state -ne 'Completed' -or $markedResults.Count -ne 1) {
                $reason = if ($state -ne 'Completed') {
                    "后台任务终态为 $state"
                }
                else {
                    "预期恰好 1 个结果，实际收到 $($markedResults.Count) 个"
                }
                Write-Warning "仓库后台任务基础设施失败：$($job.Name)；$reason。"
                $repositoryResults.Add([pscustomobject]@{
                    KtcAutoBuildRepositoryResult = $true
                    Path = $job.Name
                    ExitCode = 1
                    Error = $reason
                })
            }
        }
    }
}
finally {
    if ($repositoryJobs.Count -gt 0) {
        $repositoryJobs | Remove-Job -Force -ErrorAction SilentlyContinue
    }
}
$failedRepositories = @($repositoryResults | Where-Object { $_.ExitCode -ne 0 })
if ($failedRepositories.Count -gt 0) { throw "$($failedRepositories.Count) 个仓库更新失败。" }

if ($SkipBuild -or $WhatIfPreference) {
    Write-Host "仓库更新阶段完成；已跳过编译。" -ForegroundColor Green
    return
}
if ($resolvedCmakeProjectPaths.Count -eq 0 -and $resolvedCaaProjectPaths.Count -eq 0) {
    throw "未指定编译目录。请传 -CmakeProjectPaths、-CaaProjectPaths，或使用 -SkipBuild。"
}

$batchLogDirectory = Join-Path $LogDirectory (Get-Date -Format "yyyyMMdd-HHmmss")
New-Item -ItemType Directory -Path $batchLogDirectory -Force | Out-Null

# 固定默认编排：CMake 阶段完成后才进入 CAA；各阶段内部并行。
$results = @(Invoke-BuildPhase "CMake" $resolvedCmakeProjectPaths $MkArguments $batchLogDirectory)
$cmakeFailed = @($results | Where-Object { $_.ExitCode -ne 0 })
if ($cmakeFailed.Count -eq 0) {
    $results += @(Invoke-BuildPhase "CAA" $resolvedCaaProjectPaths $MkArguments $batchLogDirectory)
}
else {
    Write-Warning "CMake 阶段失败，未启动 CAA 阶段。"
}

$results | Format-Table Kind, Project, ExitCode, Log -AutoSize
$failed = @($results | Where-Object { $_.ExitCode -ne 0 })
if ($failed.Count -gt 0) { throw "$($failed.Count) 个编译任务失败。日志目录：$batchLogDirectory" }
Write-Host "全部完成。日志目录：$batchLogDirectory" -ForegroundColor Green
