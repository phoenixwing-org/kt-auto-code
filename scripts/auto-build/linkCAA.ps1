#Requires -Version 5.1
# license     MIT
# brief       Prepare aggregate CAA framework and win_b64 links.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [string]$Version = '',
    [string]$TargetDirectory = '',
    [string]$LinkName = 'win_b64',
    [ValidateRange(1, 10)]
    [int]$MaxDepth = 3,
    [string[]]$IgnoreDirectory = @(),
    [switch]$ReplaceDirectory,
    [switch]$ListOnly
)

if ([string]::IsNullOrWhiteSpace($Folder)) {
    $Folder = (Get-Location).Path
}
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $env:CAA_MK_VERSION
    if ([string]::IsNullOrWhiteSpace($Version)) {
        $Version = '19'
    }
}
if ($Version -notmatch '^\d+$') {
    Write-Host "[FAIL] Version must contain digits only: $Version" -ForegroundColor Red
    exit 1
}

$scriptArguments = @{
    Folder = $Folder
    Version = $Version
    MaxDepth = $MaxDepth
}
if (-not [string]::IsNullOrWhiteSpace($TargetDirectory)) {
    $scriptArguments.TargetDirectory = $TargetDirectory
}
if ($IgnoreDirectory.Count -gt 0) {
    $scriptArguments.IgnoreDirectory = $IgnoreDirectory
}
if ($ReplaceDirectory) {
    $scriptArguments.ReplaceDirectory = $true
}
if ($ListOnly) {
    $scriptArguments.ListOnly = $true
}

Write-Host "=== Link CAA | B$Version ===" -ForegroundColor DarkCyan
Write-Host '[STEP] Aggregate frameworks' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'linkFramework.ps1') @scriptArguments
if ($LASTEXITCODE -ne 0) {
    Write-Host '[FAIL] Framework linking failed.' -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host '[STEP] Share win_b64' -ForegroundColor Cyan
$winArguments = @{} + $scriptArguments
$winArguments.LinkName = $LinkName
& (Join-Path $PSScriptRoot 'linkWinb64.ps1') @winArguments
if ($LASTEXITCODE -ne 0) {
    Write-Host '[FAIL] win_b64 linking failed.' -ForegroundColor Red
    exit $LASTEXITCODE
}

if ($ListOnly) {
    Write-Host '[ OK ] CAA link plan verified.' -ForegroundColor Green
}
else {
    Write-Host '[ OK ] CAA links prepared.' -ForegroundColor Green
}
exit 0
