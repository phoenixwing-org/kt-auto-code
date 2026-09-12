$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\auto-build\Functions-Cleanup.ps1"
function Assert-RelativeCleanup {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('cleanup-relative-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $fixture 'root'
foreach ($relative in @('root\xy\core\include', 'root\xy\core\image', 'root\xy\core\lib\nested', 'root\other\include', 'root\other\image', 'root\other\lib', 'root\.git\objects', 'root\Objects', 'outside\include', 'outside\lib')) {
    New-Item -ItemType Directory -Path (Join-Path $fixture $relative) -Force | Out-Null
}
foreach ($relative in @('root\xy\core\include\header.h', 'root\xy\core\image\icon.png', 'root\xy\core\lib\direct.lib', 'root\xy\core\lib\nested\keep.lib', 'root\other\lib\keep.lib', 'root\.git\objects\keep.lib', 'root\Objects\fixture.txt', 'outside\include\header.h', 'outside\lib\direct.lib')) {
    Set-Content -LiteralPath (Join-Path $fixture $relative) -Value 'fixture'
}
New-Item -ItemType Junction -Path (Join-Path $root 'linked') -Target (Join-Path $fixture 'outside') | Out-Null
New-Item -ItemType Junction -Path (Join-Path $root 'metadataAlias') -Target (Join-Path $root '.git') | Out-Null
$config = Join-Path $root 'cleanup.yaml'
@'
unlinkDirectories: []
delete:
  directories:
    - Objects
    - 'xy/core/include'
    - 'xy/core/image'
    - 'xy/core/include'
  files:
    - 'xy/core/lib/*.lib'
'@ | Set-Content -LiteralPath $config
$code = Invoke-Cleanup -Directory $root -ConfigPath $config -WhatIf
Assert-RelativeCleanup ($code -eq 0) 'Relative-path preview failed.'
Assert-RelativeCleanup (Test-Path -LiteralPath (Join-Path $root 'xy\core\include\header.h')) 'Preview deleted include.'
Assert-RelativeCleanup (Test-Path -LiteralPath (Join-Path $root 'xy\core\lib\direct.lib')) 'Preview deleted library.'
$code = Invoke-Cleanup -Directory $root -ConfigPath $config
Assert-RelativeCleanup ($code -eq 0) 'Relative-path cleanup failed.'
foreach ($relative in @('xy\core\include', 'xy\core\image', 'xy\core\lib\direct.lib', 'Objects')) {
    Assert-RelativeCleanup (-not (Test-Path -LiteralPath (Join-Path $root $relative))) "Expected deletion missing: $relative"
}
foreach ($relative in @('xy\core\lib\nested\keep.lib', 'other\lib\keep.lib', 'other\include', 'other\image', '.git\objects\keep.lib')) {
    Assert-RelativeCleanup (Test-Path -LiteralPath (Join-Path $root $relative)) "Unexpected deletion: $relative"
}
# Explicit paths through links still resolve their actual target, with Git protection.
$dirs = Remove-CleanupDirectories -Directory $root -Names @('linked/include') -Recurse:$false
Assert-RelativeCleanup ($dirs.Removed.Count -eq 1) 'Linked relative directory not deleted.'
$files = Remove-CleanupFiles -Directory $root -Patterns @('linked\lib\*.lib') -Recurse:$false
Assert-RelativeCleanup ($files.Removed.Count -eq 1) 'Backslash relative pattern not supported.'
$dirs = Remove-CleanupDirectories -Directory $root -Names @('.git/objects', 'metadataAlias/objects')
$files = Remove-CleanupFiles -Directory $root -Patterns @('.git/objects/*.lib', 'metadataAlias/objects/*.lib')
Assert-RelativeCleanup (Test-Path -LiteralPath (Join-Path $root '.git\objects\keep.lib')) 'Relative rule bypassed Git protection.'

# Invalid rules are rejected before valid sibling rules can delete anything.
Set-Content -LiteralPath (Join-Path $root 'sentinel.obj') -Value 'preserve'
foreach ($invalid in @('../outside/*.lib', 'xy/../*.lib', 'E:/outside/*.lib', '/outside/*.lib', '\\server\share\*.lib', 'xy/*/*.lib', 'xy//*.lib', './*.lib')) {
    $invalidConfig = "unlinkDirectories: []`ndelete:`n  directories: []`n  files:`n    - '*.obj'`n    - '$invalid'"
    Set-Content -LiteralPath $config -Value $invalidConfig
    $code = Invoke-Cleanup -Directory $root -ConfigPath $config
    Assert-RelativeCleanup ($code -eq 1) "Invalid rule accepted: $invalid"
    Assert-RelativeCleanup (Test-Path -LiteralPath (Join-Path $root 'sentinel.obj')) 'Invalid config caused partial deletion.'
}
# A missing explicit parent is reported as missing, not searched elsewhere.
$files = Remove-CleanupFiles -Directory $root -Patterns @('missing/lib/*.lib')
Assert-RelativeCleanup ($files.Missing.Count -eq 1 -and $files.Failed.Count -eq 0) 'Missing path handling failed.'
Write-Host "PASS: relative paths, scope, links, Git protection, invalid-rule preflight and preview. Fixture: $fixture"
