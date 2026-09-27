#Requires -Version 5.1
# license     MIT
# brief       Discover and invoke repository scripts sequentially.

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$Folder,
    [Parameter(Mandatory)]
    [string]$CommandFile,
    [string]$AlternativeCommandFile = '',
    [Parameter(Mandatory)]
    [string]$Title,
    [Parameter(Mandatory)]
    [string]$SuccessLabel,
    [Parameter(Mandatory)]
    [string]$SummaryLabel,
    [ValidateRange(1, 10)]
    [int]$MaxDepth = 1,
    [string[]]$IgnoreDirectory = @(),
    [switch]$ListOnly
)

if ([string]::IsNullOrWhiteSpace($Folder)) {
    $Folder = (Get-Location).Path
}
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[FAIL] Directory does not exist: $Folder" -ForegroundColor Red
    exit 1
}
if ([System.IO.Path]::GetFileName($CommandFile) -ne $CommandFile) {
    Write-Host "[FAIL] CommandFile must be a file name: $CommandFile" -ForegroundColor Red
    exit 1
}
if (-not [string]::IsNullOrWhiteSpace($AlternativeCommandFile) -and
    [System.IO.Path]::GetFileName($AlternativeCommandFile) -ne $AlternativeCommandFile) {
    Write-Host "[FAIL] AlternativeCommandFile must be a file name: $AlternativeCommandFile" -ForegroundColor Red
    exit 1
}

$root = (Resolve-Path -LiteralPath $Folder).Path.TrimEnd('\')
$ignorePatterns = @(
    '.git', '.hg', '.svn', '.vs', '.vscode',
    '.clone', '.worktrees', '_clear', 'CAAB*MkWsp',
    'build', 'cmake-build-*', 'CMakeFiles',
    'win_b64', 'tools', 'sample', 'samples', 'node_modules'
) + @($IgnoreDirectory)
$queue = [System.Collections.Queue]::new()
Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue |
    Sort-Object Name |
    ForEach-Object { $queue.Enqueue([PSCustomObject]@{ Directory = $_; Depth = 1 }) }
$entryList = [System.Collections.Generic.List[object]]::new()
while ($queue.Count -gt 0) {
    $node = $queue.Dequeue()
    $directory = $node.Directory
    $relativePath = $directory.FullName.Substring($root.Length).TrimStart('\')
    $ignored = $false
    foreach ($pattern in $ignorePatterns) {
        if ($directory.Name -like $pattern -or $relativePath -like $pattern) {
            $ignored = $true
            break
        }
    }
    if ($ignored -or ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        continue
    }

    $scriptPath = Join-Path $directory.FullName $CommandFile
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf) -and
        -not [string]::IsNullOrWhiteSpace($AlternativeCommandFile)) {
        $scriptPath = Join-Path $directory.FullName $AlternativeCommandFile
    }
    if (Test-Path -LiteralPath $scriptPath -PathType Leaf) {
        $entryList.Add([PSCustomObject]@{
            Name = $relativePath
            Directory = $directory.FullName
            Script = $scriptPath
        })
        continue
    }

    if ($node.Depth -lt $MaxDepth) {
        Get-ChildItem -LiteralPath $directory.FullName -Directory -Force -ErrorAction SilentlyContinue |
            Sort-Object Name |
            ForEach-Object {
                $queue.Enqueue([PSCustomObject]@{
                    Directory = $_
                    Depth = $node.Depth + 1
                })
            }
    }
}
$entries = @($entryList | Sort-Object Directory)

Write-Host "=== $Title | depth 1-$MaxDepth ===" -ForegroundColor DarkCyan
if ($entries.Count -eq 0) {
    Write-Host "[FAIL] No $CommandFile found under: $root" -ForegroundColor Red
    exit 1
}

if ($ListOnly) {
    $index = 0
    foreach ($entry in $entries) {
        $index++
        Write-Host ("[FOUND] {0}/{1} {2}" -f $index, $entries.Count, $entry.Script) -ForegroundColor Cyan
    }
    Write-Host "[ OK ] found: $($entries.Count)" -ForegroundColor Green
    exit 0
}

$completed = 0
$failed = 0
$index = 0
foreach ($entry in $entries) {
    $index++
    Write-Host ("[RUN ] {0}/{1} {2}" -f $index, $entries.Count, $entry.Name) -ForegroundColor Cyan

    Push-Location -LiteralPath $entry.Directory
    try {
        if ([System.IO.Path]::GetExtension($entry.Script) -eq '.bat') {
            & cmd.exe /d /c "call `"$($entry.Script)`""
        }
        else {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $entry.Script
        }
        $childExitCode = $LASTEXITCODE
        if ($childExitCode -ne 0) {
            throw "$($entry.Script) exited with code $childExitCode."
        }
        $completed++
        Write-Host "[ OK ] ${SuccessLabel}: $($entry.Name)" -ForegroundColor Green
    }
    catch {
        $failed++
        Write-Host "[FAIL] ${CommandFile}: $($entry.Name)" -ForegroundColor Red
        Write-Host "       $($_.Exception.Message)" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }
}

Write-Host "[ OK ] ${SummaryLabel}: $completed" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "[FAIL] failed: $failed" -ForegroundColor Red
    exit 1
}
exit 0
