#Requires -Version 5.1
# license     MIT
# brief       Mixed batch-build entry point for CMake projects and CAA workspaces.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [Parameter(Position = 1)]
    [string]$Version = '',
    [ValidateSet('All', 'CMake', 'CAA')]
    [string]$Type = 'All',
    [ValidateSet('Debug', 'Release')]
    [string[]]$BuildType = @('Debug', 'Release'),
    [string]$TargetDirectory = '',
    [ValidateRange(1, 10)]
    [int]$MaxDepth = 3,
    [string[]]$IgnoreDirectory = @(),
    [switch]$SkipLink,
    [switch]$ReplaceDirectory,
    [switch]$ListOnly
)

. "$PSScriptRoot/common.ps1"
. "$PSScriptRoot/commonCmake.ps1"

if ([string]::IsNullOrWhiteSpace($Folder)) {
    $Folder = (Get-Location).Path
}
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[FAIL] Directory does not exist: $Folder" -ForegroundColor Red
    exit 1
}
$root = (Resolve-Path -LiteralPath $Folder).Path.TrimEnd('\')

Write-Host "=== Build All | $Type | depth 1-$MaxDepth ===" -ForegroundColor DarkCyan
Write-Host "Root: $root" -ForegroundColor Cyan
if ($ListOnly) {
    Write-Host 'Mode: list only' -ForegroundColor Yellow
}

$groupFailures = 0
$groupsRun = 0
$allowEmptyGroup = $Type -eq 'All'
$cmakeGroupAvailable = $true
$caaGroupAvailable = $true
if ($Type -eq 'All') {
    $cmakeGroupAvailable = @(
        Get-CMakeProjectDirectories `
            -RootDir $root `
            -MaxDepth $MaxDepth `
            -IgnoreDirectory $IgnoreDirectory
    ).Count -gt 0
    $caaGroupAvailable = @(
        Get-CAAWorkspaceDirectories `
            -RootDir $root `
            -MaxDepth $MaxDepth `
            -IgnoreDirectory $IgnoreDirectory |
            Where-Object {
                Test-Path -LiteralPath (Join-Path $_ 'mk.ps1') -PathType Leaf
            }
    ).Count -gt 0
}
if ($Type -eq 'All' -or $Type -eq 'CMake') {
    Write-Host '[GROUP] CMake projects' -ForegroundColor Cyan
    if (-not $cmakeGroupAvailable) {
        Write-Host '[SKIP] CMake group: no project found' -ForegroundColor Yellow
    }
    else {
        $groupsRun++
        $cmakeArguments = @{
            Folder = $root
            BuildType = $BuildType
            MaxDepth = $MaxDepth
            IgnoreDirectory = $IgnoreDirectory
            AllowEmpty = $allowEmptyGroup
            ListOnly = $ListOnly
        }
        & (Join-Path $PSScriptRoot 'cmakeAll.ps1') @cmakeArguments
        if ($LASTEXITCODE -ne 0) {
            $groupFailures++
            Write-Host '[FAIL] CMake group' -ForegroundColor Red
        }
        else {
            Write-Host '[ OK ] CMake group' -ForegroundColor Green
        }
    }
}

if ($Type -eq 'All' -or $Type -eq 'CAA') {
    Write-Host '[GROUP] CAA workspaces' -ForegroundColor Cyan
    if (-not $caaGroupAvailable) {
        Write-Host '[SKIP] CAA group: no runnable workspace' -ForegroundColor Yellow
    }
    else {
        $groupsRun++
        $caaArguments = @{
            Folder = $root
            Version = $Version
            MaxDepth = $MaxDepth
            IgnoreDirectory = $IgnoreDirectory
            AllowEmpty = $allowEmptyGroup
            SkipLink = $SkipLink
            ReplaceDirectory = $ReplaceDirectory
            ListOnly = $ListOnly
        }
        if (-not [string]::IsNullOrWhiteSpace($TargetDirectory)) {
            $caaArguments.TargetDirectory = $TargetDirectory
        }
        & (Join-Path $PSScriptRoot 'caaAll.ps1') @caaArguments
        if ($LASTEXITCODE -ne 0) {
            $groupFailures++
            Write-Host '[FAIL] CAA group' -ForegroundColor Red
        }
        else {
            Write-Host '[ OK ] CAA group' -ForegroundColor Green
        }
    }
}

if ($groupFailures -gt 0) {
    Write-Host "[FAIL] build groups failed: $groupFailures/$groupsRun" -ForegroundColor Red
    exit 1
}
if ($ListOnly) {
    Write-Host "[ OK ] build plan verified: $groupsRun group(s)" -ForegroundColor Green
}
else {
    Write-Host "[ OK ] build groups started: $groupsRun" -ForegroundColor Green
    Write-Host 'Build windows continue independently.' -ForegroundColor Yellow
}
exit 0
