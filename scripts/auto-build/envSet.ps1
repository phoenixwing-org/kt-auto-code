# license     MIT
param(
    [string]$SdkRoot = "",
    [string]$SdkPrefix = "kt",
    [string]$ThirdPartyRoot = "",
    [string]$CaaMkVersion = "19",
    [string]$CoreRoot = "",
    [string]$IncludeRoot = "",
    [switch]$PersistUser
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SdkRoot)) {
    $SdkRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." )).Path
}

if ([string]::IsNullOrWhiteSpace($ThirdPartyRoot)) {
    $ThirdPartyRoot = Join-Path $SdkRoot "3rdParty"
}

if ([string]::IsNullOrWhiteSpace($CoreRoot)) {
    $CoreRoot = Join-Path $SdkRoot (Join-Path $SdkPrefix "core")
}

if ([string]::IsNullOrWhiteSpace($IncludeRoot)) {
    $IncludeRoot = Join-Path $CoreRoot "include"
}

$variables = @{
    CAA_MK_VERSION    = $CaaMkVersion
    SDK_PREFIX        = $SdkPrefix
    ROOT_DIR          = $SdkRoot
    ROOT_DIR_3rdParty = $ThirdPartyRoot
    ROOT_DIR_CORE     = $CoreRoot
    ROOT_DIR_INCLUDE  = $IncludeRoot
}

foreach ($entry in $variables.GetEnumerator()) {
    Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
    if ($PersistUser) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "User")
    }
    Write-Host ("{0}={1}" -f $entry.Key, $entry.Value)
}

if ($PersistUser) {
    Write-Host "User environment variables updated. Open a new terminal to use them." -ForegroundColor Green
}
else {
    Write-Host "Variables set for the current PowerShell process." -ForegroundColor Green
    Write-Host "Use: . .\tools\envSet.ps1 to keep them in the current shell." -ForegroundColor Yellow
}
