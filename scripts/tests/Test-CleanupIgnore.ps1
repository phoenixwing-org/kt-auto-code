$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\auto-build\Functions-Cleanup.ps1"
function Assert-IgnoreCleanup {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('cleanup-ignore-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $fixture 'root'
foreach ($relative in @('root\cache\Objects', 'root\cacheExtra\Objects', 'root\parent\cache\Objects', 'root\build', 'root\Objects', 'root\nested\files', 'root\.git\objects', 'outside\Objects', 'unlinkOutside')) {
    New-Item -ItemType Directory -Path (Join-Path $fixture $relative) -Force | Out-Null
}
foreach ($relative in @('root\cache\Objects\keep.obj', 'root\parent\cache\Objects\keep.obj', 'root\build\README.md', 'root\build\other.txt', 'root\Objects\keep.pdb', 'root\Objects\other.txt', 'root\nested\files\README.md', 'root\nested\files\keep.pdb', 'root\nested\files\temp1.obj', 'root\nested\files\temp12.obj', 'root\nested\files\remove.obj', 'root\.git\objects\keep.obj', 'outside\Objects\keep.obj')) {
    Set-Content -LiteralPath (Join-Path $fixture $relative) -Value 'fixture'
}
# Ignored alias is deliberately ordered after an ordinary alias to the same target.
New-Item -ItemType Junction -Path (Join-Path $root 'aAlias') -Target (Join-Path $fixture 'outside') | Out-Null
New-Item -ItemType Junction -Path (Join-Path $root 'zKeepLink') -Target (Join-Path $fixture 'outside') | Out-Null
New-Item -ItemType Junction -Path (Join-Path $root 'removeLink') -Target (Join-Path $fixture 'unlinkOutside') | Out-Null
$config = Join-Path $root 'cleanup.yaml'
@'
ignore:
  - cache
  - 'README.md'
  - '*.pdb'
  - 'temp?.obj'
  - zKeepLink
unlinkDirectories:
  - '*Link'
delete:
  directories:
    - Objects
    - build
    - parent
    - 'cache/Objects'
    - 'aAlias/Objects'
  files:
    - '*.obj'
    - '*.pdb'
    - '*.md'
    - 'cache/Objects/*.obj'
    - 'aAlias/Objects/*.obj'
'@ | Set-Content -LiteralPath $config
$parsed = Read-CleanupConfiguration -Path $config
Assert-IgnoreCleanup ($parsed.Ignore.Count -eq 5) 'Ignore list not parsed.'
$code = Invoke-Cleanup -Directory $root -ConfigPath $config -WhatIf
Assert-IgnoreCleanup ($code -eq 0) 'Preview failed.'
Assert-IgnoreCleanup (Test-Path -LiteralPath (Join-Path $root 'removeLink')) 'Preview unlinked a directory.'
Assert-IgnoreCleanup (Test-Path -LiteralPath (Join-Path $root 'nested\files\remove.obj')) 'Preview deleted a file.'
$code = Invoke-Cleanup -Directory $root -ConfigPath $config
Assert-IgnoreCleanup ($code -eq 0) 'Cleanup with ignore failed.'
foreach ($relative in @('cache\Objects\keep.obj', 'parent\cache\Objects\keep.obj', 'build\README.md', 'build\other.txt', 'Objects\keep.pdb', 'Objects\other.txt', 'nested\files\README.md', 'nested\files\keep.pdb', 'nested\files\temp1.obj', '.git\objects\keep.obj', 'zKeepLink', 'aAlias\Objects\keep.obj')) {
    Assert-IgnoreCleanup (Test-Path -LiteralPath (Join-Path $root $relative)) "Ignore protection failed: $relative"
}
foreach ($relative in @('cacheExtra\Objects', 'nested\files\temp12.obj', 'nested\files\remove.obj', 'removeLink')) {
    Assert-IgnoreCleanup (-not (Test-Path -LiteralPath (Join-Path $root $relative))) "Nonignored item was not cleaned: $relative"
}
Assert-IgnoreCleanup (Test-Path -LiteralPath (Join-Path $fixture 'outside\Objects\keep.obj')) 'Alternate alias bypassed ignore.'

# Exact matching is case insensitive; omitted/empty ignore preserves compatibility.
$context = New-CleanupIgnoreContext -Directory $root -Ignore @('readme.md')
Assert-IgnoreCleanup (Test-CleanupIgnoreName -Name 'README.md' -Context $context) 'Case-insensitive exact match failed.'
Assert-IgnoreCleanup (-not (Test-CleanupIgnoreName -Name 'oldREADME.md' -Context $context)) 'Exact name matched a substring.'
foreach ($emptyHeader in @('', "ignore: []`n", "ignore:`n")) {
    Set-Content -LiteralPath $config -Value ($emptyHeader + "unlinkDirectories: []`ndelete:`n  directories: []`n  files: []")
    Assert-IgnoreCleanup ((Read-CleanupConfiguration -Path $config).Ignore.Count -eq 0) 'Empty ignore failed.'
}
# Invalid ignore must stop even an otherwise valid deletion rule before mutation.
Set-Content -LiteralPath (Join-Path $root 'sentinel.obj') -Value 'preserve'
Set-Content -LiteralPath $config -Value "ignore:`n  - 'bad/path'`nunlinkDirectories: []`ndelete:`n  directories: []`n  files:`n    - '*.obj'"
$code = Invoke-Cleanup -Directory $root -ConfigPath $config
Assert-IgnoreCleanup ($code -eq 1 -and (Test-Path -LiteralPath (Join-Path $root 'sentinel.obj'))) 'Invalid ignore caused partial cleanup.'
Write-Host "PASS: ignore names, globs, directories, parent trees, relative rules, aliases, unlink and compatibility. Fixture: $fixture"
