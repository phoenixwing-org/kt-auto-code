$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\auto-build\Functions-Cleanup.ps1')

function Assert-CleanupToml {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("cleanup-toml-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
    $tomlPath = Join-Path $root 'cleanup.toml'
    @'
ignore = ["cache", '*.log']
unlinkDirectories = ["Demo*"]

[delete]
directories = ["objects", "build"]
files = ["*.obj", 'test_*.exe']
'@ | Set-Content -LiteralPath $tomlPath -Encoding utf8

    $config = Read-CleanupConfiguration -Path $tomlPath
    Assert-CleanupToml ($config.Ignore.Count -eq 2 -and $config.Ignore[1] -eq '*.log') 'TOML ignore parsing failed.'
    Assert-CleanupToml ($config.UnlinkDirectories.Count -eq 1 -and $config.UnlinkDirectories[0] -eq 'Demo*') 'TOML unlink parsing failed.'
    Assert-CleanupToml ($config.Directories -join ',' -eq 'objects,build') 'TOML directory parsing failed.'
    Assert-CleanupToml ($config.Files -join ',' -eq '*.obj,test_*.exe') 'TOML file parsing failed.'

    # TOML 必须优先于同目录旧 YAML；无效 YAML 不应影响默认读取。
    Set-Content -LiteralPath (Join-Path $root 'cleanup.yaml') -Value 'invalid: true' -Encoding utf8
    Assert-CleanupToml ((Invoke-Cleanup -Directory $root -WhatIf) -eq 0) 'Default TOML precedence failed.'

    # 删除 TOML 后，旧 YAML 仍可作为过渡兼容配置读取。
    Remove-Item -LiteralPath $tomlPath
    @'
ignore: []
unlinkDirectories: []
delete:
  directories: []
  files:
    - '*.obj'
'@ | Set-Content -LiteralPath (Join-Path $root 'cleanup.yaml') -Encoding utf8
    $legacy = Read-CleanupConfiguration -Path (Join-Path $root 'cleanup.yaml') -WarningAction SilentlyContinue
    Assert-CleanupToml ($legacy.Files.Count -eq 1 -and $legacy.Files[0] -eq '*.obj') 'Legacy YAML compatibility failed.'

    Write-Host "PASS: TOML parsing, default precedence and legacy YAML compatibility. Fixture: $root" -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
