#Requires -Version 5.1
# license     MIT
# brief       Run first-level rebuild.ps1 entries sequentially.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [switch]$ListOnly
)

& "$PSScriptRoot/invokeAll.ps1" `
    -Folder $Folder `
    -CommandFile 'rebuild.ps1' `
    -Title 'Rebuild All' `
    -SuccessLabel 'rebuild requested' `
    -SummaryLabel 'requested' `
    -MaxDepth 1 `
    -ListOnly:$ListOnly
exit $LASTEXITCODE
