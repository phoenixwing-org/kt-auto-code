$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\auto-build\Functions-Cleanup.ps1"

function Assert-Protected {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('cleanup-git-' + [guid]::NewGuid().ToString('N'))
foreach ($relative in @('.git\objects\ab', '.git\lfs\objects\cd', 'nested\.git\objects', 'bare\objects', 'ordinary\Objects')) {
    New-Item -ItemType Directory -Path (Join-Path $fixture $relative) -Force | Out-Null
}
$protectedFiles = @('.git\objects\ab\data', '.git\lfs\objects\cd\data', '.git\test_keep.exe', 'nested\.git\objects\data', 'bare\objects\data', 'bare\HEAD', 'bare\config')
foreach ($relative in $protectedFiles) { Set-Content -LiteralPath (Join-Path $fixture $relative) -Value 'must survive' }
$gitFolder = Get-Item -LiteralPath (Join-Path $fixture '.git') -Force
$gitFolder.Attributes = $gitFolder.Attributes -bor [System.IO.FileAttributes]::Hidden
$directDeleteBlocked = $false
try { Remove-CleanupDirectoryTree -Path (Join-Path $fixture '.git') }
catch { $directDeleteBlocked = $true }
Assert-Protected $directDeleteBlocked 'Low-level deletion did not protect .git.'
New-Item -ItemType Junction -Path (Join-Path $fixture 'metadataAlias') -Target (Join-Path $fixture '.git') | Out-Null
Set-Content -LiteralPath (Join-Path $fixture 'ordinary\Objects\data') -Value 'fixture'
$result = Remove-CleanupDirectories -Directory $fixture -Names @('Objects', '.git')
Assert-Protected ($result.Failed.Count -eq 0) 'Directory cleanup failed.'
Assert-Protected ($result.Removed.Count -eq 1) 'Protected directory entered delete result.'
$result = Remove-CleanupFiles -Directory $fixture -Patterns @('*')
Assert-Protected ($result.Removed.Count -eq 0) 'Protected files entered delete result.'
foreach ($relative in $protectedFiles) {
    Assert-Protected ((Get-Content -LiteralPath (Join-Path $fixture $relative) -Raw).Trim() -eq 'must survive') "Metadata changed: $relative"
}

# A matching directory containing a repository must be rejected before any deletion.
New-Item -ItemType Directory -Path (Join-Path $fixture 'build\repo') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fixture 'build\repo\.git') -Value 'gitdir: elsewhere'
Set-Content -LiteralPath (Join-Path $fixture 'build\first.txt') -Value 'must survive'
$result = Remove-CleanupDirectories -Directory $fixture -Names @('build')
Assert-Protected ($result.Failed.Count -eq 1 -and $result.Removed.Count -eq 0) 'Nested repository deletion was not rejected.'
Assert-Protected (Test-Path -LiteralPath (Join-Path $fixture 'build\first.txt')) 'Partial deletion before repository check.'
Assert-Protected (Test-Path -LiteralPath (Join-Path $fixture 'build\repo\.git')) 'Git file was deleted.'
Write-Host "PASS: hidden Git objects, LFS, nested Git, bare metadata, aliases and whole-tree rejection. Fixture: $fixture"
