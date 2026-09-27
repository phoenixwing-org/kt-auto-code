#Requires -Version 5.1
# license     MIT
# brief       Export one CAA framework to a caller-selected output root.

[CmdletBinding()]
param(
    [string]$SourceRoot = '',
    [string]$OutputRoot = '',
    [Parameter(Mandatory = $true)][string]$FrameworkDirectory,
    [string[]]$Modules = @()
)

. "$PSScriptRoot/commonCAAExport.ps1"

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = (Get-Location).Path
}
try {
    $resolvedOutputRoot = Resolve-CAAExportRoot -OutputRoot $OutputRoot
    Write-Host '=== Export CAA Framework ===' -ForegroundColor DarkCyan
    Write-Host "Framework: $FrameworkDirectory" -ForegroundColor Cyan
    Write-Host "Output: $resolvedOutputRoot" -ForegroundColor Cyan
    $result = Export-CAAFramework `
        -SourceRoot $SourceRoot `
        -OutputRoot $resolvedOutputRoot `
        -FrameworkDirectory $FrameworkDirectory `
        -Modules $Modules
    Write-Host "[ OK ] exported files: $($result.Count)" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
