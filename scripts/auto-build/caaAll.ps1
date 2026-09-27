#Requires -Version 5.1
# license     MIT
# brief       Discover, link, and build all CAA workspaces across repositories.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [Parameter(Position = 1)]
    [string]$Version = '',
    [string]$TargetDirectory = '',
    [ValidateRange(1, 10)]
    [int]$MaxDepth = 3,
    [string[]]$IgnoreDirectory = @(),
    [switch]$SkipLink,
    [switch]$ReplaceDirectory,
    [switch]$AllowEmpty,
    [switch]$ListOnly
)

. "$PSScriptRoot/common.ps1"

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
    $aggregateWorkspace = Join-Path $root "CAAB${Version}MkWsp"
}
elseif ([System.IO.Path]::IsPathRooted($TargetDirectory)) {
    $aggregateWorkspace = $TargetDirectory
}
else {
    $aggregateWorkspace = Join-Path $root $TargetDirectory
}
$aggregateWorkspace = [System.IO.Path]::GetFullPath($aggregateWorkspace).TrimEnd('\')
$workspaces = @(Get-CAAWorkspaceDirectories `
    -RootDir $root `
    -MaxDepth $MaxDepth `
    -IgnoreDirectory $IgnoreDirectory)
$buildEntries = @(
    foreach ($workspace in $workspaces) {
        $scriptPath = Join-Path $workspace 'mk.ps1'
        if (Test-Path -LiteralPath $scriptPath -PathType Leaf) {
            [PSCustomObject]@{
                Name = Split-Path $workspace -Leaf
                Directory = $workspace
                Script = $scriptPath
            }
        }
        else {
            Write-Host "[SKIP] mk.ps1 not found: $workspace" -ForegroundColor Yellow
        }
    }
)

Write-Host "=== Build All | CAA B$Version | depth 1-$MaxDepth ===" -ForegroundColor DarkCyan
Write-Host "Prerequisite workspace: $aggregateWorkspace" -ForegroundColor Cyan
if ($buildEntries.Count -eq 0) {
    if ($AllowEmpty) {
        Write-Host "[SKIP] No runnable CAA workspace found under: $root" -ForegroundColor Yellow
        exit 0
    }
    Write-Host "[FAIL] No runnable CAA workspace found under: $root" -ForegroundColor Red
    exit 1
}

if ($ListOnly) {
    $index = 0
    foreach ($entry in $buildEntries) {
        $index++
        Write-Host ("[FOUND] {0}/{1} {2}" -f $index, $buildEntries.Count, $entry.Script) -ForegroundColor Cyan
    }
    Write-Host "[ OK ] found: $($buildEntries.Count)" -ForegroundColor Green
    exit 0
}

if (-not $SkipLink) {
    $linkArguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', (Join-Path $PSScriptRoot 'linkCAA.ps1'),
        '-Folder', $root,
        '-Version', $Version,
        '-MaxDepth', "$MaxDepth"
    )
    if (-not [string]::IsNullOrWhiteSpace($TargetDirectory)) {
        $linkArguments += @('-TargetDirectory', $TargetDirectory)
    }
    if ($IgnoreDirectory.Count -gt 0) {
        $linkArguments += '-IgnoreDirectory'
        $linkArguments += $IgnoreDirectory
    }
    if ($ReplaceDirectory) {
        $linkArguments += '-ReplaceDirectory'
    }
    & powershell.exe $linkArguments
    if ($LASTEXITCODE -ne 0) {
        Write-Host '[FAIL] CAA output linking failed; build was not started.' -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

$started = 0
$failed = 0
$index = 0
foreach ($entry in $buildEntries) {
    $index++
    Write-Host ("[START] {0}/{1} {2}" -f $index, $buildEntries.Count, $entry.Name) -ForegroundColor Cyan
    try {
        $escapedTitle = "CAA B$Version - $($entry.Name)".Replace("'", "''")
        $escapedDirectory = $entry.Directory.Replace("'", "''")
        $escapedScript = $entry.Script.Replace("'", "''")
        $escapedVersion = $Version.Replace("'", "''")
        $escapedAggregate = $aggregateWorkspace.Replace("'", "''")
        $command = "`$Host.UI.RawUI.WindowTitle = '$escapedTitle'; " +
            "Set-Location -LiteralPath '$escapedDirectory'; " +
            "`$env:CAA_MK_VERSION = '$escapedVersion'; " +
            "`$env:CAA_MK_WORKSPACE = '$escapedAggregate'; " +
            "& '$escapedScript'"
        $encodedCommand = [Convert]::ToBase64String(
            [Text.Encoding]::Unicode.GetBytes($command)
        )
        Start-Process `
            -FilePath 'powershell.exe' `
            -ArgumentList @(
                '-NoProfile',
                '-NoExit',
                '-ExecutionPolicy', 'Bypass',
                '-EncodedCommand', $encodedCommand
            ) `
            -PassThru | Out-Null
        $started++
        Write-Host "[ OK ] build window started: $($entry.Name)" -ForegroundColor Green
    }
    catch {
        $failed++
        Write-Host "[FAIL] build window: $($entry.Name)" -ForegroundColor Red
        Write-Host "       $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 200
}

Write-Host "[ OK ] build windows started: $started" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "[FAIL] failed: $failed" -ForegroundColor Red
    exit 1
}
Write-Host 'Builds are running in parallel.' -ForegroundColor Yellow
exit 0
