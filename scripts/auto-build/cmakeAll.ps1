#Requires -Version 5.1
# license     MIT
# brief       Discover and start CMake project builds in parallel windows.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [ValidateSet('Debug', 'Release')]
    [string[]]$BuildType = @('Debug', 'Release'),
    [ValidateRange(0, 10)]
    [int]$MaxDepth = 3,
    [string[]]$IgnoreDirectory = @(),
    [switch]$AllowEmpty,
    [switch]$ListOnly
)

. "$PSScriptRoot/commonCmake.ps1"

if ([string]::IsNullOrWhiteSpace($Folder)) {
    $Folder = (Get-Location).Path
}
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[FAIL] Directory does not exist: $Folder" -ForegroundColor Red
    exit 1
}

$root = (Resolve-Path -LiteralPath $Folder).Path.TrimEnd('\')
$configurations = @($BuildType | Select-Object -Unique)
if ($configurations.Count -eq 0) {
    Write-Host '[FAIL] At least one CMake build type is required.' -ForegroundColor Red
    exit 1
}
$projects = @(
    Get-CMakeProjectDirectories `
        -RootDir $root `
        -MaxDepth $MaxDepth `
        -IgnoreDirectory $IgnoreDirectory
)

Write-Host "=== Build All | CMake | depth 0-$MaxDepth ===" -ForegroundColor DarkCyan
if ($projects.Count -eq 0) {
    if ($AllowEmpty) {
        Write-Host "[SKIP] No CMake project found under: $root" -ForegroundColor Yellow
        exit 0
    }
    Write-Host "[FAIL] No CMake project found under: $root" -ForegroundColor Red
    exit 1
}

$index = 0
foreach ($project in $projects) {
    $index++
    Write-Host ("[FOUND] {0}/{1} {2}" -f $index, $projects.Count, $project) -ForegroundColor Cyan
}
if ($ListOnly) {
    Write-Host "[ OK ] CMake projects found: $($projects.Count)" -ForegroundColor Green
    exit 0
}

$mkScript = Join-Path $PSScriptRoot 'mk.ps1'
$configurationExpression = '@(' + (@(
    foreach ($configuration in $configurations) {
        "'$($configuration.Replace("'", "''"))'"
    }
) -join ', ') + ')'
$started = 0
$failed = 0
$index = 0
foreach ($project in $projects) {
    $index++
    $projectName = Split-Path $project -Leaf
    Write-Host ("[START] {0}/{1} {2}" -f $index, $projects.Count, $projectName) -ForegroundColor Cyan
    try {
        $escapedTitle = "CMake - $projectName".Replace("'", "''")
        $escapedProject = $project.Replace("'", "''")
        $escapedScript = $mkScript.Replace("'", "''")
        $command = "`$Host.UI.RawUI.WindowTitle = '$escapedTitle'; " +
            "Set-Location -LiteralPath '$escapedProject'; " +
            "& '$escapedScript' -Project '$escapedProject' -ProjectType CMake -BuildType $configurationExpression"
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
        Write-Host "[ OK ] build window started: $projectName" -ForegroundColor Green
    }
    catch {
        $failed++
        Write-Host "[FAIL] build window: $projectName" -ForegroundColor Red
        Write-Host "       $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 200
}

Write-Host "[ OK ] CMake build windows started: $started" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "[FAIL] failed: $failed" -ForegroundColor Red
    exit 1
}
Write-Host 'CMake builds are running in parallel.' -ForegroundColor Yellow
exit 0
