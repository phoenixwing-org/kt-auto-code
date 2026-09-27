#Requires -Version 5.1
# license     MIT
# brief       Synchronize existing clang-format files below a collection root.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [string[]]$IgnoreDirectory = @(),
    [switch]$Check
)

if ([string]::IsNullOrWhiteSpace($Folder)) {
    $Folder = (Get-Location).Path
}
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[FAIL] Directory does not exist: $Folder" -ForegroundColor Red
    exit 1
}

$templatePath = Join-Path $PSScriptRoot 'clang-format\.clang-format'
if (-not (Test-Path -LiteralPath $templatePath -PathType Leaf)) {
    Write-Host "[FAIL] clang-format template not found: $templatePath" -ForegroundColor Red
    exit 1
}

$root = (Resolve-Path -LiteralPath $Folder).Path.TrimEnd('\')
$resolvedTemplatePath = (Resolve-Path -LiteralPath $templatePath).Path
$templateHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedTemplatePath).Hash
$ignorePatterns = @(
    '.git', '.hg', '.svn', '.vs', '.vscode',
    '.clone', '.worktrees', '_clear', 'CAAB*MkWsp',
    'build', 'cmake-build-*', 'CMakeFiles',
    'win_b64', 'node_modules', 'ImportedInterfaces'
) + @($IgnoreDirectory)

$queue = [System.Collections.Queue]::new()
$queue.Enqueue((Get-Item -LiteralPath $root))
$formatFiles = [System.Collections.Generic.List[string]]::new()
while ($queue.Count -gt 0) {
    $directory = $queue.Dequeue()
    foreach ($file in @(
        Get-ChildItem -LiteralPath $directory.FullName -File -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -eq '.clang-format' }
    )) {
        if ($file.FullName -ne $resolvedTemplatePath) {
            $formatFiles.Add($file.FullName)
        }
    }

    foreach ($child in @(
        Get-ChildItem -LiteralPath $directory.FullName -Directory -Force -ErrorAction SilentlyContinue |
            Sort-Object Name
    )) {
        if ($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            continue
        }
        $relativePath = $child.FullName.Substring($root.Length).TrimStart('\')
        $ignored = $false
        foreach ($pattern in $ignorePatterns) {
            if ($child.Name -like $pattern -or $relativePath -like $pattern) {
                $ignored = $true
                break
            }
        }
        if (-not $ignored) {
            $queue.Enqueue($child)
        }
    }
}

$targets = @($formatFiles | Sort-Object -Unique)
Write-Host '=== Synchronize clang-format ===' -ForegroundColor DarkCyan
Write-Host "Root: $root" -ForegroundColor Cyan
if ($targets.Count -eq 0) {
    Write-Host '[SKIP] No project .clang-format files found.' -ForegroundColor Yellow
    exit 0
}

$current = 0
$outdated = 0
$updated = 0
$failed = 0
foreach ($targetPath in $targets) {
    $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetPath).Hash
    if ($targetHash -eq $templateHash) {
        $current++
        continue
    }

    $outdated++
    $relativeTarget = $targetPath.Substring($root.Length).TrimStart('\')
    if ($Check) {
        Write-Host "[DIFF] $relativeTarget" -ForegroundColor Yellow
        continue
    }

    try {
        Copy-Item -LiteralPath $resolvedTemplatePath -Destination $targetPath -Force
        $copiedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetPath).Hash
        if ($copiedHash -ne $templateHash) {
            throw 'Hash verification failed after copying.'
        }
        $updated++
        Write-Host "[ OK ] updated: $relativeTarget" -ForegroundColor Green
    }
    catch {
        $failed++
        Write-Host "[FAIL] update: $relativeTarget" -ForegroundColor Red
        Write-Host "       $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "[ OK ] scanned: $($targets.Count), current: $current" -ForegroundColor Green
if ($Check) {
    if ($outdated -gt 0) {
        Write-Host "[FAIL] different: $outdated" -ForegroundColor Red
        exit 1
    }
    Write-Host '[ OK ] all clang-format files are current.' -ForegroundColor Green
    exit 0
}

Write-Host "[ OK ] updated: $updated" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "[FAIL] failed: $failed" -ForegroundColor Red
    exit 1
}
exit 0
