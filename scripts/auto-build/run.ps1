# license     MIT
# brief       PowerShell version of run.bat
param(
    [string]$Version = "",
    [string]$Workspace = "",
    [switch]$Help
)

. "$PSScriptRoot\common.ps1"

# Show help if requested
if ($Help) {
    Write-Host "Usage: run.ps1 [options]" -ForegroundColor Green
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  -Help or -h        Show this help message" -ForegroundColor White
    Write-Host "  -Version or -v     Set version number (default: 19) or use env CAA_MK_VERSION" -ForegroundColor White
    Write-Host "  -Workspace or -w   Set workspace path" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1" -ForegroundColor Cyan
    Write-Host "  .\run.ps1 -Version 20" -ForegroundColor Cyan
    Write-Host "  .\run.ps1 -Version 20 -Workspace 'C:\MyWorkspace'" -ForegroundColor Cyan
    Write-Host "  .\run.ps1 -Help" -ForegroundColor Cyan
    exit 0
}

# initialize batch paths
$batchPaths = Get-CAA-RunBatchPaths -Version $Version -Workspace $Workspace

# Build batch commands array
$batchCommands = @(
    "call `"$($batchPaths.TckInit)`"",
    "call `"$($batchPaths.TckProfile)`" $($batchPaths.ProfileVer)",
    "call `"$($batchPaths.MkCreateRuntimeView)`"",
    "call `"$($batchPaths.Mkrun)`" -c `"cnext`""
)

$exitCode = Invoke-BatchCommands -BatchCommands $batchCommands -Workspace $Workspace
exit $exitCode
