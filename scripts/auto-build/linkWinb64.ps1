#Requires -Version 5.1
# license     MIT
# brief       Link CAA win_b64 directories to one versioned aggregate target.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [Parameter(Position = 1)]
    [string]$Version = '',
    [string]$TargetDirectory = '',
    [string]$LinkName = 'win_b64',
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
if ([System.IO.Path]::GetFileName($LinkName) -ne $LinkName) {
    Write-Host "[FAIL] LinkName must be a directory name: $LinkName" -ForegroundColor Red
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
$runtimeTarget = Join-Path $TargetDirectory $LinkName

$workspaces = @(Get-CAAWorkspaceDirectories `
    -RootDir $root `
    -MaxDepth $MaxDepth `
    -IgnoreDirectory $IgnoreDirectory)

Write-Host "=== Link Winb64 | CAA B$Version | $LinkName ===" -ForegroundColor DarkCyan
Write-Host "Target: $runtimeTarget" -ForegroundColor Cyan
if ($workspaces.Count -eq 0) {
    Write-Host "[FAIL] No CAA workspace found under: $root" -ForegroundColor Red
    exit 1
}

if ($ListOnly) {
    $index = 0
    foreach ($workspace in $workspaces) {
        $index++
        Write-Host ("[FOUND] {0}/{1} {2}" -f $index, $workspaces.Count, (Join-Path $workspace $LinkName)) -ForegroundColor Cyan
    }
    Write-Host "[ OK ] found: $($workspaces.Count)" -ForegroundColor Green
    exit 0
}

if (-not (Test-Path -LiteralPath $runtimeTarget -PathType Container)) {
    New-Item -ItemType Directory -Path $runtimeTarget -Force | Out-Null
    Write-Host "[ OK ] target created: $runtimeTarget" -ForegroundColor Green
}

$linked = 0
$unchanged = 0
$blocked = 0
$failed = 0
$index = 0
foreach ($workspace in $workspaces) {
    $index++
    $linkPath = Join-Path $workspace $LinkName
    Write-Host ("[LINK] {0}/{1} {2}" -f $index, $workspaces.Count, $linkPath) -ForegroundColor Cyan
    try {
        $result = Set-DirectoryJunction `
            -Path $linkPath `
            -Target $runtimeTarget `
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
if ($failed -gt 0 -or $blocked -gt 0) {
    exit 1
}
exit 0
