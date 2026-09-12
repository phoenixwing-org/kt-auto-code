# Run with an N response on stdin to test actual PowerShell ShouldProcess cancellation.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\auto-build\Functions-Cleanup.ps1"
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ('cleanup-confirm-' + [guid]::NewGuid().ToString('N'))
$nested = Join-Path $fixture 'Objects\nested'
New-Item -ItemType Directory -Path $nested -Force | Out-Null
$file = Join-Path $nested 'keep.txt'
Set-Content -LiteralPath $file -Value 'must survive'
$result = Remove-CleanupDirectories -Directory $fixture -Names @('Objects') -Confirm
if ($result.Removed.Count -ne 0 -or $result.Skipped.Count -ne 1 -or -not (Test-Path -LiteralPath $file)) {
    throw 'N did not preserve the full tree or was reported as deleted.'
}
Write-Host "PASS: N preserves child files and reports skipped. Fixture: $fixture"
