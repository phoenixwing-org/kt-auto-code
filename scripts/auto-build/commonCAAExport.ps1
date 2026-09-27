#Requires -Version 5.1
# license     MIT
# brief       Neutral CAA framework and runtime publishing helpers.

function Resolve-CAAExportRoot {
    param([string]$OutputRoot = '')

    if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
        $OutputRoot = $env:CAA_EXPORT_ROOT
    }
    if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
        throw 'OutputRoot or CAA_EXPORT_ROOT is required.'
    }
    [System.IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
}

function Copy-CAAFlatDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [string]$Filter = '*'
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        return [PSCustomObject]@{ Count = 0; Missing = $true }
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $files = @(Get-ChildItem -LiteralPath $Source -File -Filter $Filter -ErrorAction Stop)
    foreach ($file in $files) {
        Copy-Item -LiteralPath $file.FullName -Destination $Destination -Force -ErrorAction Stop
    }
    [PSCustomObject]@{ Count = $files.Count; Missing = $false }
}

function Copy-CAADirectoryTree {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
        return [PSCustomObject]@{ Count = 0; Missing = $true }
    }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $files = @(Get-ChildItem -LiteralPath $Source -File -Recurse -Force -ErrorAction Stop)
    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($Source.TrimEnd('\').Length).TrimStart('\')
        $targetFile = Join-Path $Destination $relativePath
        New-Item -ItemType Directory -Path (Split-Path $targetFile -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $targetFile -Force -ErrorAction Stop
    }
    [PSCustomObject]@{ Count = $files.Count; Missing = $false }
}

function Export-CAAFramework {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [Parameter(Mandatory = $true)][string]$FrameworkDirectory,
        [string[]]$Modules = @()
    )

    $sourceRootPath = (Resolve-Path -LiteralPath $SourceRoot).Path.TrimEnd('\')
    $outputRootPath = Resolve-CAAExportRoot -OutputRoot $OutputRoot
    $frameworkSource = Join-Path $sourceRootPath $FrameworkDirectory
    if (-not (Test-Path -LiteralPath $frameworkSource -PathType Container)) {
        throw "Framework directory not found: $frameworkSource"
    }
    $frameworkDestination = Join-Path $outputRootPath $FrameworkDirectory
    $copied = 0

    foreach ($part in @(
        @('CNext\code\dictionary', 'CNext\code\dictionary'),
        @('IdentityCard', 'IdentityCard'),
        @('PublicInterfaces', 'PublicInterfaces')
    )) {
        $result = Copy-CAAFlatDirectory `
            -Source (Join-Path $frameworkSource $part[0]) `
            -Destination (Join-Path $frameworkDestination $part[1])
        $copied += $result.Count
    }
    foreach ($module in @($Modules)) {
        $result = Copy-CAAFlatDirectory `
            -Source (Join-Path $frameworkSource $module) `
            -Destination (Join-Path $frameworkDestination $module)
        $copied += $result.Count
    }
    $treeResult = Copy-CAADirectoryTree `
        -Source (Join-Path $frameworkSource 'various\win_b64') `
        -Destination (Join-Path $frameworkDestination 'various\win_b64')
    $copied += $treeResult.Count

    [PSCustomObject]@{
        Framework = $FrameworkDirectory
        Destination = $frameworkDestination
        Count = $copied
    }
}

function Publish-CAARuntime {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$OutputRoot,
        [string[]]$RelativePaths = @(
            'win_b64\code\bin',
            'win_b64\code\dictionary',
            'win_b64\resources\graphic',
            'win_b64\resources\graphic\icons\normal',
            'win_b64\resources\msgcatalog'
        )
    )

    $sourceRootPath = (Resolve-Path -LiteralPath $SourceRoot).Path.TrimEnd('\')
    $outputRootPath = Resolve-CAAExportRoot -OutputRoot $OutputRoot
    $results = [System.Collections.Generic.List[object]]::new()
    foreach ($relativePath in @($RelativePaths)) {
        $copyResult = Copy-CAAFlatDirectory `
            -Source (Join-Path $sourceRootPath $relativePath) `
            -Destination (Join-Path $outputRootPath $relativePath)
        $results.Add([PSCustomObject]@{
            Path = $relativePath
            Count = $copyResult.Count
            Missing = $copyResult.Missing
        })
    }
    @($results)
}
