# license     MIT
# brief       Fetch a root repository and its first-level repositories.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Folder = '',
    [Parameter(Position = 1)]
    [string]$RootMode = '1'
)

function Invoke-RepositoryFetch {
    param([Parameter(Mandatory)][string]$Repository)

    Write-Host "[FETCH] $Repository" -ForegroundColor Cyan
    Push-Location -LiteralPath $Repository
    try {
        $gitOutput = @(& cmd.exe /d /c 'git fetch 2>&1')
        $gitExitCode = $LASTEXITCODE
        if ($gitExitCode -ne 0) {
            Write-Host "[FAIL] $Repository" -ForegroundColor Red
            $gitOutput |
                Where-Object { -not [string]::IsNullOrWhiteSpace("$_") } |
                ForEach-Object { Write-Host "       $_" -ForegroundColor Red }
            return $false
        }
        return $true
    }
    finally {
        Pop-Location
    }
}

if ([string]::IsNullOrWhiteSpace($Folder)) {
    Write-Host '[FAIL] Usage: fetchAll.ps1 [folder] [0]' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[FAIL] Directory does not exist: $Folder" -ForegroundColor Red
    exit 1
}

$root = (Resolve-Path -LiteralPath $Folder).Path
$failed = 0
$fetched = 0

Write-Host '=== Fetch All | root + first-level repositories ===' -ForegroundColor DarkCyan

if ($RootMode -ne '0') {
    if (Test-Path -LiteralPath (Join-Path $root '.git')) {
        if (Invoke-RepositoryFetch -Repository $root) { $fetched++ } else { $failed++ }
    }
    else {
        Write-Host "[SKIP] $root (not a Git repository)" -ForegroundColor Yellow
    }
}

Get-ChildItem -LiteralPath $root -Directory | ForEach-Object {
    if (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) {
        if (Invoke-RepositoryFetch -Repository $_.FullName) { $script:fetched++ } else { $script:failed++ }
    }
}

Write-Host "[ OK ] fetched: $fetched" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "[FAIL] failed: $failed" -ForegroundColor Red
    exit 1
}
exit 0
