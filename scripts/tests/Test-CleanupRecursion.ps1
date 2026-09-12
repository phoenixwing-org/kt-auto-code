$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\auto-build\Functions-Cleanup.ps1"

function Assert-CleanupTest {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('cleanup-recursion-' + [guid]::NewGuid().ToString('N'))
$target = Join-Path $fixture 'target'
$outside = Join-Path $fixture 'outside'
foreach ($relative in @('target\nested\Objects', 'target\Objects\build', 'target\nested\deep', 'outside\Objects')) {
    New-Item -ItemType Directory -Path (Join-Path $fixture $relative) -Force | Out-Null
}
foreach ($relative in @('target\top.obj', 'target\nested\deep\child.obj', 'target\nested\deep\test_demo.exe', 'target\nested\deep\_XydBaseItf.exe', 'target\nested\Objects\keep.txt', 'outside\external.obj', 'outside\Objects\keep.txt')) {
    Set-Content -LiteralPath (Join-Path $fixture $relative) -Value 'fixture'
}
New-Item -ItemType Junction -Path (Join-Path $target 'linked') -Target $outside | Out-Null
New-Item -ItemType Junction -Path (Join-Path $target 'unlinkTop') -Target $outside | Out-Null
New-Item -ItemType Junction -Path (Join-Path $target 'nested\unlinkNested') -Target $outside | Out-Null
New-Item -ItemType Junction -Path (Join-Path $target 'linkedAgain') -Target $outside | Out-Null
New-Item -ItemType Junction -Path (Join-Path $outside 'backToRoot') -Target $target | Out-Null
Set-Content -LiteralPath (Join-Path $outside 'preserve.txt') -Value 'preserve'
$config = Join-Path $target 'cleanup.yaml'
@'
unlinkDirectories:
  - 'unlink*'
delete:
  directories:
    - Objects
    - build
  files:
    - '*.obj'
    - 'test_*.exe'
'@ | Set-Content -LiteralPath $config

$code = Invoke-Cleanup -Directory $target -ConfigPath $config -WhatIf
Assert-CleanupTest ($code -eq 0) 'Preview failed.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'top.obj')) 'Preview deleted a file.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'nested\Objects')) 'Preview deleted a directory.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'unlinkTop')) 'Preview removed a junction.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $outside 'external.obj')) 'Preview deleted linked file.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $outside 'Objects\keep.txt')) 'Preview deleted linked directory.'

$code = Invoke-Cleanup -Directory $target -ConfigPath $config -Recurse:$false
Assert-CleanupTest ($code -eq 0) 'Nonrecursive cleanup failed.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $target 'top.obj'))) 'Top-level file was not deleted.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $target 'Objects'))) 'Top-level directory was not deleted.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $target 'unlinkTop'))) 'Top-level junction was not unlinked.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'nested\Objects')) 'Nonrecursive cleanup deleted nested directory.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'nested\deep\child.obj')) 'Nonrecursive cleanup deleted nested file.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $outside 'external.obj')) 'Nonrecursive cleanup followed junction.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $outside 'Objects')) 'Nonrecursive cleanup deleted linked directory.'

$fileCandidates = @(Get-CleanupFilesRecursive -Directory $target)
Assert-CleanupTest (@($fileCandidates | Where-Object { $_.FullName -eq (Join-Path $outside 'external.obj') }).Count -eq 1) 'Linked file enumerated more than once.'
$directoryCandidates = @(Get-CleanupDirectoryMatches -Directory $target -Names @('Objects'))
Assert-CleanupTest (@($directoryCandidates | Where-Object { $_.FullName -eq (Join-Path $outside 'Objects') }).Count -eq 1) 'Linked directory enumerated more than once.'

$code = Invoke-Cleanup -Directory $target -ConfigPath $config
Assert-CleanupTest ($code -eq 0) 'Recursive cleanup failed.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $target 'nested\Objects'))) 'Nested directory was not deleted.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $target 'nested\deep\child.obj'))) 'Nested file was not deleted.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $target 'nested\deep\test_demo.exe'))) 'Matching EXE was not deleted.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'nested\deep\_XydBaseItf.exe')) 'Unmatched EXE was deleted.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'nested\unlinkNested')) 'Unlink recursed into child directory.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $outside 'external.obj'))) 'Linked file was not deleted.'
Assert-CleanupTest (-not (Test-Path -LiteralPath (Join-Path $outside 'Objects'))) 'Linked Objects directory was not deleted.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $outside 'preserve.txt')) 'Unmatched linked file was deleted.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $target 'linked')) 'Traversal removed junction.'
Assert-CleanupTest (Test-Path -LiteralPath (Join-Path $outside 'backToRoot')) 'Traversal removed cycle junction.'
Write-Host "PASS: recursion, preview, junction targets, duplicate targets and cycles. Fixture: $fixture"
