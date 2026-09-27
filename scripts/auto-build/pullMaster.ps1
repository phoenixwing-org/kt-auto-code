# license     MIT
# brief       Check out and pull master for a root repository and its first-level repositories.

[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Folder = '',
    [Parameter(Position = 1)][string]$RootMode = '1'
)

function Invoke-RepositoryPull {
    param(
        [Parameter(Mandatory)][string]$Repository,
        [Parameter(Mandatory)][string]$Branch
    )

    $remoteBranch = "origin/$Branch"
    Write-Host "[PULL] $Repository -> $remoteBranch" -ForegroundColor Cyan
    Push-Location -LiteralPath $Repository
    try {
        $fetchOutput = @(& cmd.exe /d /c "git fetch origin $Branch 2>&1")
        $fetchExitCode = $LASTEXITCODE
        if ($fetchExitCode -ne 0) {
            Write-Host "[FAIL] fetch ${remoteBranch}: $Repository" -ForegroundColor Red
            $fetchOutput |
                Where-Object { -not [string]::IsNullOrWhiteSpace("$_") } |
                ForEach-Object { Write-Host "       $_" -ForegroundColor Red }
            return $false
        }

        & git show-ref --verify --quiet "refs/heads/$Branch"
        $localBranchExists = $LASTEXITCODE -eq 0

        if ($localBranchExists) {
            [string]$upstream = & git for-each-ref '--format=%(upstream:short)' "refs/heads/$Branch"
            $upstream = $upstream.Trim()
            if ($upstream -ne $remoteBranch) {
                $displayUpstream = if ([string]::IsNullOrWhiteSpace($upstream)) { '(none)' } else { $upstream }
                Write-Host "[FAIL] local $Branch tracks $displayUpstream; expected $remoteBranch" -ForegroundColor Red
                return $false
            }
            $checkoutCommand = "git checkout $Branch 2>&1"
        }
        else {
            $checkoutCommand = "git checkout --track -b $Branch $remoteBranch 2>&1"
        }

        $checkoutOutput = @(& cmd.exe /d /c $checkoutCommand)
        $checkoutExitCode = $LASTEXITCODE
        if ($checkoutExitCode -ne 0) {
            Write-Host "[FAIL] checkout ${remoteBranch}: $Repository" -ForegroundColor Red
            $checkoutOutput |
                Where-Object { -not [string]::IsNullOrWhiteSpace("$_") } |
                ForEach-Object { Write-Host "       $_" -ForegroundColor Red }
            return $false
        }

        $pullOutput = @(& cmd.exe /d /c "git pull --ff-only origin $Branch 2>&1")
        $pullExitCode = $LASTEXITCODE
        if ($pullExitCode -ne 0) {
            Write-Host "[FAIL] pull ${remoteBranch}: $Repository" -ForegroundColor Red
            $pullOutput |
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
    Write-Host '[FAIL] Usage: pullMaster.ps1 [folder] [0]' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path -LiteralPath $Folder -PathType Container)) {
    Write-Host "[FAIL] Directory does not exist: $Folder" -ForegroundColor Red
    exit 1
}

$root = (Resolve-Path -LiteralPath $Folder).Path
$failed = 0
$pulled = 0

Write-Host '=== Pull Master | root + first-level repositories ===' -ForegroundColor DarkCyan

if ($RootMode -ne '0') {
    if (Test-Path -LiteralPath (Join-Path $root '.git')) {
        if (Invoke-RepositoryPull -Repository $root -Branch 'master') { $pulled++ } else { $failed++ }
    }
    else {
        Write-Host "[SKIP] $root (not a Git repository)" -ForegroundColor Yellow
    }
}

Get-ChildItem -LiteralPath $root -Directory | ForEach-Object {
    if (Test-Path -LiteralPath (Join-Path $_.FullName '.git')) {
        if (Invoke-RepositoryPull -Repository $_.FullName -Branch 'master') { $script:pulled++ } else { $script:failed++ }
    }
}

if ($pulled -gt 0 -or $failed -eq 0) {
    Write-Host "[ OK ] pulled: $pulled" -ForegroundColor Green
}
if ($failed -gt 0) {
    Write-Host "[FAIL] failed: $failed" -ForegroundColor Red
    exit 1
}
exit 0
