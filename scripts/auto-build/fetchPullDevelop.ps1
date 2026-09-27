# license     MIT
# brief       Fetch, then check out and pull develop for a repository collection.

[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)][string]$Folder,
    [Parameter(Position = 1)][string]$RootMode = '1'
)

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'fetchAll.ps1') $Folder $RootMode
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'pullDevelop.ps1') $Folder $RootMode
exit $LASTEXITCODE
