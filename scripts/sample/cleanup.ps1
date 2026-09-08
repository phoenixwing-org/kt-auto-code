[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Directory,
    [string]$ConfigPath,
    [switch]$CreateTestCases
)

$functionsPath = Join-Path $PSScriptRoot 'Functions-Cleanup.ps1'
if (-not (Test-Path -LiteralPath $functionsPath -PathType Leaf)) {
    $repositoryFunctionsPath = Join-Path $PSScriptRoot '..\auto-build\Functions-Cleanup.ps1'
    if (Test-Path -LiteralPath $repositoryFunctionsPath -PathType Leaf) {
        $functionsPath = $repositoryFunctionsPath
    }
    elseif ($env:ROOT_DIR) {
        $functionsPath = Join-Path $env:ROOT_DIR 'tools\Functions-Cleanup.ps1'
    }
    else {
        Write-Host '未找到 Functions-Cleanup.ps1，且未设置 ROOT_DIR。' -ForegroundColor Red
        exit 1
    }
}
if (-not $Directory) {
    $Directory = if ($CreateTestCases) { (Get-Location).Path } else { $PSScriptRoot }
}
try { . $functionsPath }
catch {
    Write-Host "加载清理函数失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
exit (Invoke-Cleanup -Directory $Directory -ConfigPath $ConfigPath -CreateTestCases:$CreateTestCases -WhatIf:$WhatIfPreference)
