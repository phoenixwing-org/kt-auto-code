#Requires -Version 5.1
# license     MIT
# brief       Publish standard CAA runtime output to a caller-selected root.

[CmdletBinding()]
param(
    [string]$SourceRoot = '',
    [string]$OutputRoot = '',
    [string[]]$RelativePaths = @()
)

. "$PSScriptRoot/commonCAAExport.ps1"

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = (Get-Location).Path
}
try {
    $resolvedOutputRoot = Resolve-CAAExportRoot -OutputRoot $OutputRoot
    $arguments = @{
        SourceRoot = $SourceRoot
        OutputRoot = $resolvedOutputRoot
    }
    if ($RelativePaths.Count -gt 0) {
        $arguments.RelativePaths = $RelativePaths
    }
    Write-Host '=== Publish CAA Runtime ===' -ForegroundColor DarkCyan
    Write-Host "Output: $resolvedOutputRoot" -ForegroundColor Cyan
    $results = @(Publish-CAARuntime @arguments)
    $published = 0
    $missing = 0
    foreach ($result in $results) {
        if ($result.Missing) {
            $missing++
            Write-Host "[WARN] $($result.Path): source not found" -ForegroundColor Yellow
        }
        else {
            $published += $result.Count
            Write-Host "[ OK ] $($result.Path): $($result.Count) files" -ForegroundColor Green
        }
    }
    if ($missing -gt 0) {
        Write-Host "[FAIL] published: $published, missing sources: $missing" -ForegroundColor Red
        exit 1
    }
    Write-Host "[ OK ] published: $published files" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
