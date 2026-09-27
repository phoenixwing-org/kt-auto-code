#Requires -Version 5.1
# license     MIT
# brief       Aggregate CAA framework directories into a versioned workspace.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [string]$Version = '',
    [string]$TargetDirectory = '',
    [ValidateRange(1, 10)]
    [int]$MaxDepth = 3,
    [string[]]$IgnoreDirectory = @(),
    [switch]$ReplaceDirectory,
    [switch]$ListOnly
)

. "$PSScriptRoot/common.ps1"
. "$PSScriptRoot/LinkWinb64Common.ps1"

if ([string]::IsNullOrWhiteSpace($Folder)) {
    $Folder = (Get-Location).Path
}
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[FAIL] Directory does not exist: $Folder" -ForegroundColor Red
    exit 1
}
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Get-CAA-Version
}
if ($Version -notmatch '^\d+$') {
    Write-Host "[FAIL] Version must contain digits only: $Version" -ForegroundColor Red
    exit 1
}

$root = (Resolve-Path -LiteralPath $Folder).Path.TrimEnd('\')
if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    $TargetDirectory = Join-Path $root "CAAB${Version}MkWsp"
}
elseif (-not [System.IO.Path]::IsPathRooted($TargetDirectory)) {
    $TargetDirectory = Join-Path $root $TargetDirectory
}
$TargetDirectory = [System.IO.Path]::GetFullPath($TargetDirectory).TrimEnd('\')

$workspaces = @(Get-CAAWorkspaceDirectories `
    -RootDir $root `
    -MaxDepth $MaxDepth `
    -IgnoreDirectory $IgnoreDirectory)
$frameworks = @(
    foreach ($workspace in $workspaces) {
        Get-ChildItem -LiteralPath $workspace -Directory -ErrorAction SilentlyContinue |
            Where-Object {
                Test-CAAFrameworkDirectory -Directory $_.FullName
            } |
            ForEach-Object {
                [PSCustomObject]@{
                    Name = $_.Name
                    Source = $_.FullName
                    Link = Join-Path $TargetDirectory $_.Name
                }
            }
    }
)

Write-Host "=== Link Framework | CAA B$Version ===" -ForegroundColor DarkCyan
Write-Host "Target: $TargetDirectory" -ForegroundColor Cyan
if ($frameworks.Count -eq 0) {
    Write-Host "[FAIL] No CAA framework found under: $root" -ForegroundColor Red
    exit 1
}

$duplicateGroups = @(
    $frameworks |
        Group-Object { $_.Name.ToLowerInvariant() } |
        Where-Object { $_.Count -gt 1 }
)
if ($duplicateGroups.Count -gt 0) {
    foreach ($group in $duplicateGroups) {
        Write-Host "[FAIL] Duplicate framework name: $($group.Group[0].Name)" -ForegroundColor Red
        foreach ($item in $group.Group) {
            Write-Host "       $($item.Source)" -ForegroundColor Red
        }
    }
    exit 1
}

if ($ListOnly) {
    $index = 0
    foreach ($framework in ($frameworks | Sort-Object Name)) {
        $index++
        Write-Host ("[FOUND] {0}/{1} {2} <- {3}" -f $index, $frameworks.Count, $framework.Link, $framework.Source) -ForegroundColor Cyan
    }
    foreach ($entryFile in @('mk.ps1', 'run.ps1')) {
        $entryTarget = Join-Path $TargetDirectory $entryFile
        if (-not (Test-Path -LiteralPath $entryTarget -PathType Leaf)) {
            Write-Host "[PLAN] copy sample entry: $entryTarget" -ForegroundColor Yellow
        }
    }
    Write-Host "[ OK ] found: $($frameworks.Count)" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path -LiteralPath $TargetDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $TargetDirectory -Force | Out-Null
    Write-Host "[ OK ] target created: $TargetDirectory" -ForegroundColor Green
}

$sampleRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'sample'
foreach ($entryFile in @('mk.ps1', 'run.ps1')) {
    $entrySource = Join-Path $sampleRoot $entryFile
    $entryTarget = Join-Path $TargetDirectory $entryFile
    if (Test-Path -LiteralPath $entryTarget -PathType Leaf) {
        Write-Host "[ OK ] entry unchanged: $entryTarget" -ForegroundColor Green
        continue
    }
    if (-not (Test-Path -LiteralPath $entrySource -PathType Leaf)) {
        Write-Host "[FAIL] Sample entry not found: $entrySource" -ForegroundColor Red
        exit 1
    }
    Copy-Item -LiteralPath $entrySource -Destination $entryTarget
    Write-Host "[ OK ] entry copied: $entryTarget" -ForegroundColor Green
}

$linked = 0
$unchanged = 0
$blocked = 0
$failed = 0
$index = 0
foreach ($framework in ($frameworks | Sort-Object Name)) {
    $index++
    Write-Host ("[LINK] {0}/{1} {2}" -f $index, $frameworks.Count, $framework.Name) -ForegroundColor Cyan
    try {
        $result = Set-DirectoryJunction `
            -Path $framework.Link `
            -Target $framework.Source `
            -ReplaceDirectory:$ReplaceDirectory
        if ($result.Status -eq 'Linked') {
            $linked++
            Write-Host '[ OK ] linked' -ForegroundColor Green
        }
        elseif ($result.Status -eq 'Unchanged') {
            $unchanged++
            Write-Host '[ OK ] unchanged' -ForegroundColor Green
        }
        else {
            $blocked++
            Write-Host "[SKIP] $($result.Message) Use -ReplaceDirectory to replace it." -ForegroundColor Yellow
        }
    }
    catch {
        $failed++
        Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "[ OK ] linked: $linked, unchanged: $unchanged" -ForegroundColor Green
if ($blocked -gt 0) {
    Write-Host "[FAIL] blocked regular directories: $blocked" -ForegroundColor Red
}
if ($failed -gt 0) {
    Write-Host "[FAIL] failed: $failed" -ForegroundColor Red
}
if ($blocked -gt 0 -or $failed -gt 0) {
    exit 1
}
exit 0
