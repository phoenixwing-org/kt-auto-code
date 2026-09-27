# license     MIT
# brief      Export headers / SDK packages to ROOT_DIR_CORE.

function Get-RootDirCore {
    param(
        [switch]$AllowRootDirFallback
    )

    $root = $env:ROOT_DIR_CORE
    if ([string]::IsNullOrWhiteSpace($root) -and $AllowRootDirFallback) {
        if (-not [string]::IsNullOrWhiteSpace($env:ROOT_DIR)) {
            $prefix = $env:SDK_PREFIX
            if ([string]::IsNullOrWhiteSpace($prefix)) {
                $prefix = 'kt'
            }
            $root = Join-Path $env:ROOT_DIR (Join-Path $prefix 'core')
        }
    }
    if ([string]::IsNullOrWhiteSpace($root)) {
        if ($AllowRootDirFallback) {
            Write-Error 'ROOT_DIR_CORE / ROOT_DIR is not set'
        }
        else {
            Write-Error 'ROOT_DIR_CORE is not set'
        }
        exit 1
    }
    return $root.TrimEnd('\')
}

function Export-PublicHeaders {
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,
        [Parameter(Mandatory)]
        [string]$LibName,
        [string]$PublicDir = '',
        [string]$RootDirCore = ''
    )

    if ([string]::IsNullOrWhiteSpace($RootDirCore)) {
        $RootDirCore = Get-RootDirCore
    }
    if ([string]::IsNullOrWhiteSpace($PublicDir)) {
        $PublicDir = Join-Path $LibName "public\$LibName"
    }

    $RepoRoot = (Resolve-Path $RepoRoot).Path.TrimEnd('\')
    $incSrc = Join-Path $RepoRoot $PublicDir
    $incDst = Join-Path $RootDirCore "include\$LibName"

    Write-Host "---- Export $LibName ----"

    if (-not (Test-Path $incSrc)) {
        Write-Error "missing headers: $incSrc"
        exit 1
    }

    if (-not (Test-Path $incDst)) {
        New-Item -ItemType Directory -Path $incDst -Force -ErrorAction Stop | Out-Null
    }

    Write-Host "==== Export to $incDst ===="
    Get-ChildItem -Path $incSrc -File |
    Where-Object { $_.Extension -in '.h', '.hpp' } |
    Sort-Object Name |
    ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $incDst -Force -ErrorAction Stop
        Write-Host "  $(Join-Path $incDst $_.Name)"
    }
}

function Export-SdkPackage {
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,
        [Parameter(Mandatory)]
        [string]$Name,
        [string]$RootDirCore = ''
    )

    if ([string]::IsNullOrWhiteSpace($RootDirCore)) {
        $RootDirCore = Get-RootDirCore
    }

    $RepoRoot = (Resolve-Path $RepoRoot).Path.TrimEnd('\')
    $src = Join-Path $RepoRoot $Name
    $binSrc = Join-Path $src 'bin'
    $incSrc = Join-Path $src "include\$Name"
    $incDst = Join-Path $RootDirCore "include\$Name"
    $incRoot = Join-Path $RootDirCore 'include'
    $binDst = Join-Path $RootDirCore 'bin'
    $dbgDst = Join-Path $RootDirCore 'debug'

    Write-Host "---- Export $Name ----"

    if (-not (Test-Path $incSrc)) {
        Write-Error "missing headers: $incSrc"
        exit 1
    }

    foreach ($dir in @($incDst, $binDst, $dbgDst)) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force -ErrorAction Stop | Out-Null
        }
    }

    Write-Host '==== headers ===='
    Get-ChildItem -Path $incSrc -File |
    Where-Object { $_.Extension -in '.h', '.hpp' } |
    Sort-Object Name |
    ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $incDst -Force -ErrorAction Stop
        Write-Host "  $(Join-Path $incDst $_.Name)"
    }

    Write-Host '==== remove flat duplicates ===='
    Get-ChildItem -Path $incSrc -File |
    Where-Object { $_.Extension -in '.h', '.hpp' } |
    ForEach-Object {
        $flat = Join-Path $incRoot $_.Name
        if (Test-Path $flat) {
            Remove-Item -Path $flat -Force -ErrorAction Stop
            Write-Host "  del $flat"
        }
    }

    Write-Host '==== dll and lib ===='
    $binFiles = @(
        Get-ChildItem -Path $binSrc -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in '.lib', '.dll' } |
        Sort-Object Name
    )
    if ($binFiles.Count -gt 0) {
        foreach ($file in $binFiles) {
            Copy-Item -Path $file.FullName -Destination $binDst -Force -ErrorAction Stop
            Write-Host "  $(Join-Path $binDst $file.Name)"
            Copy-Item -Path $file.FullName -Destination $dbgDst -Force -ErrorAction Stop
            Write-Host "  $(Join-Path $dbgDst $file.Name)"
        }
    }
    else {
        Write-Warning "no .lib/.dll under $binSrc"
    }
}

function Invoke-Export {
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,
        [string]$Title = '',
        [string[]]$LibNames = @(),
        [string[]]$SdkPackages = @(),
        [switch]$AllowRootDirFallback
    )

    $RepoRoot = (Resolve-Path $RepoRoot).Path.TrimEnd('\')
    if ([string]::IsNullOrWhiteSpace($Title)) {
        $items = @($LibNames) + @($SdkPackages)
        if ($items.Count -gt 0) {
            $Title = "@ Export - $($items -join ' / ')"
        }
        else {
            $Title = "@ Export - $(Split-Path $RepoRoot -Leaf)"
        }
    }

    $rootDirCore = Get-RootDirCore -AllowRootDirFallback:$AllowRootDirFallback

    Write-Host '== Begin =='
    Write-Host $Title
    Write-Host "ROOT_DIR_CORE = $rootDirCore"

    foreach ($libName in $LibNames) {
        Export-PublicHeaders -RepoRoot $RepoRoot -LibName $libName -RootDirCore $rootDirCore
    }
    foreach ($packageName in $SdkPackages) {
        Export-SdkPackage -RepoRoot $RepoRoot -Name $packageName -RootDirCore $rootDirCore
    }

    Write-Host '== Done =='
}
