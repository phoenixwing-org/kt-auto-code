[CmdletBinding()]
param(
    [switch]$RemoveOrigin
)

$ErrorActionPreference = "Stop"

$GiteeUrl = "https://gitee.com/phoenixwing/kt-auto-code.git"
$GitHubUrl = "https://github.com/phoenixwing-org/kt-auto-code.git"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Invoke-RepoGit {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & git -C $RepoRoot @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
    }
}

& git -C $RepoRoot rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Not a Git repository: $RepoRoot"
}

$RemoteNames = @(& git -C $RepoRoot remote)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to list Git remotes in $RepoRoot"
}

function Set-RepositoryRemote {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,

        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    if ($RemoteNames -contains $Name) {
        $CurrentUrl = (& git -C $RepoRoot remote get-url $Name).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to read remote '$Name'"
        }

        if ($CurrentUrl -eq $Url) {
            Write-Host "[remote] $Name unchanged: $Url"
        }
        else {
            Invoke-RepoGit -Arguments @("remote", "set-url", $Name, $Url)
            Write-Host "[remote] $Name updated: $Url"
        }
    }
    else {
        Invoke-RepoGit -Arguments @("remote", "add", $Name, $Url)
        Write-Host "[remote] $Name added: $Url"
    }
}

Set-RepositoryRemote -Name "gitee" -Url $GiteeUrl
Set-RepositoryRemote -Name "github" -Url $GitHubUrl

if ($RemoveOrigin -and ($RemoteNames -contains "origin")) {
    Invoke-RepoGit -Arguments @("remote", "remove", "origin")
    Write-Host "[remote] origin removed"
}

Write-Host ""
Write-Host "[remote] Current remotes:"
Invoke-RepoGit -Arguments @("remote", "-v")
