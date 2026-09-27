#Requires -Version 5.1
# license     MIT
# brief       Link this CAA workspace into the shared version workspace.

[CmdletBinding()]
param(
    [string]$Version = $(if ($env:CAA_MK_VERSION) { $env:CAA_MK_VERSION } else { '20' }),
    [string]$TargetDirectory = '',
    [string]$LinkName = 'win_b64',
    [ValidateRange(1, 10)]
    [int]$MaxDepth = 3,
    [string[]]$IgnoreDirectory = @(),
    [switch]$ReplaceDirectory,
    [switch]$ListOnly
)

if ([string]::IsNullOrWhiteSpace($env:ROOT_DIR)) {
    Write-Host '[FAIL] ROOT_DIR is not configured.' -ForegroundColor Red
    exit 1
}

$entry = Join-Path $env:ROOT_DIR 'tools\linkCAA.ps1'
if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
    Write-Host "[FAIL] Auto Code CAA link entry was not synchronized: $entry" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($TargetDirectory)) {
    $TargetDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) "CAAB${Version}MkWsp"
}

$linkArguments = @{
    Folder = $PSScriptRoot
    Version = $Version
    TargetDirectory = $TargetDirectory
    LinkName = $LinkName
    MaxDepth = $MaxDepth
}
if ($IgnoreDirectory.Count -gt 0) {
    $linkArguments.IgnoreDirectory = $IgnoreDirectory
}
if ($ReplaceDirectory) {
    $linkArguments.ReplaceDirectory = $true
}
if ($ListOnly) {
    $linkArguments.ListOnly = $true
}

& $entry @linkArguments
exit $LASTEXITCODE
