# 默认覆盖脚本；已有 cleanup.toml 保留，仅有旧 YAML 时继续兼容并提示迁移。
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$RootDirectory = $env:ROOT_DIR
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RootDirectory)) {
    throw '请设置 ROOT_DIR，或传入 -RootDirectory。'
}
if (-not [System.IO.Path]::IsPathRooted($RootDirectory)) {
    throw 'RootDirectory 必须是绝对路径。'
}
$root = Get-Item -LiteralPath $RootDirectory -Force
if (-not $root.PSIsContainer) { throw 'RootDirectory 必须是已存在的目录。' }
if ($root.FullName -match '(?i)(^|[\\/])\.git([\\/]|$)') {
    throw '不能向 .git 中同步脚本。'
}

$files = @(
    @{ Source = (Join-Path $PSScriptRoot 'Invoke-AutoBuild.ps1'); Target = 'tools\Invoke-AutoBuild.ps1'; Preserve = $false }
    @{ Source = (Join-Path $PSScriptRoot 'Functions-Cleanup.ps1'); Target = 'tools\Functions-Cleanup.ps1'; Preserve = $false }
    @{ Source = (Join-Path $PSScriptRoot '..\sample\cleanup.ps1'); Target = 'sample\cleanup.ps1'; Preserve = $false }
    @{ Source = (Join-Path $PSScriptRoot '..\sample\cleanup.toml'); Target = 'sample\cleanup.toml'; Preserve = $true; LegacyTarget = 'sample\cleanup.yaml' }
)

# 先核对所有源文件，避免因缺失源文件只同步一部分。
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file.Source -PathType Leaf)) {
        throw "源文件不存在：$($file.Source)"
    }
}
foreach ($file in $files) {
    $destination = Join-Path $root.FullName $file.Target
    if ($file.Preserve -and (Test-Path -LiteralPath $destination)) {
        Write-Host "保留配置 $destination"
        continue
    }
    if ($file.Preserve -and $file.LegacyTarget) {
        $legacyDestination = Join-Path $root.FullName $file.LegacyTarget
        if (Test-Path -LiteralPath $legacyDestination -PathType Leaf) {
            Write-Warning "保留旧版配置 $legacyDestination；请按需迁移为 $destination。"
            continue
        }
    }
    if ($PSCmdlet.ShouldProcess($destination, '复制并覆盖脚本（不执行脚本）')) {
        $parent = Split-Path -Parent $destination
        if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
            New-Item -ItemType Directory -Path $parent -Force | Out-Null
        }
        Copy-Item -LiteralPath $file.Source -Destination $destination -Force
        if ((Get-FileHash -LiteralPath $file.Source -Algorithm SHA256).Hash -ne
            (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) {
            throw "同步后校验失败：$destination"
        }
        Write-Host "已同步 $destination（SHA256 一致）"
    }
}
