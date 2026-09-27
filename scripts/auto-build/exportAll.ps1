#Requires -Version 5.1
# license     MIT
# brief       Run first-level export.ps1 entries sequentially.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [ValidateRange(1, 10)]
    [int]$MaxDepth = 3,
    [string[]]$IgnoreDirectory = @(),
    [switch]$ListOnly
)

& "$PSScriptRoot/invokeAll.ps1" `
    -Folder $Folder `
    -CommandFile 'export.ps1' `
    -AlternativeCommandFile 'export.bat' `
    -Title 'Export All' `
    -SuccessLabel 'export completed' `
    -SummaryLabel 'completed' `
    -MaxDepth $MaxDepth `
    -IgnoreDirectory $IgnoreDirectory `
    -ListOnly:$ListOnly
exit $LASTEXITCODE
