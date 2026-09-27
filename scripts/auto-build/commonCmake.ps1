# license     MIT
# brief       CMake build helpers for out-repo workspaces.

. "$PSScriptRoot/buildOutputEncoding.ps1"
. "$PSScriptRoot/buildErrorSummary.ps1"

function Test-CMakeProjectDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Directory
    )

    (Test-Path -LiteralPath (Join-Path $Directory 'CMakeLists.txt') -PathType Leaf)
}

# Discover the shallowest independent CMake project roots. Once a root is
# selected, nested CMakeLists.txt files are treated as part of that project.
function Get-CMakeProjectDirectories {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RootDir,
        [ValidateRange(0, 10)]
        [int]$MaxDepth = 3,
        [string[]]$IgnoreDirectory = @()
    )

    $root = (Resolve-Path -LiteralPath $RootDir).Path.TrimEnd('\')
    if (Test-CMakeProjectDirectory -Directory $root) {
        return @($root)
    }
    if ($MaxDepth -eq 0) {
        return @()
    }

    $defaultIgnore = @(
        '.git', '.hg', '.svn', '.vs', '.vscode',
        '.clone', '.worktrees', '_clear', 'CAAB*MkWsp',
        'build', 'cmake-build-*', 'CMakeFiles',
        'win_b64', 'tools', 'sample', 'samples',
        'node_modules', 'ImportedInterfaces'
    )
    $ignorePatterns = @($defaultIgnore) + @($IgnoreDirectory)
    $queue = [System.Collections.Queue]::new()
    Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue |
        Sort-Object Name |
        ForEach-Object {
            $queue.Enqueue([PSCustomObject]@{ Directory = $_; Depth = 1 })
        }

    $result = [System.Collections.Generic.List[string]]::new()
    while ($queue.Count -gt 0) {
        $node = $queue.Dequeue()
        $directory = $node.Directory
        $relativePath = $directory.FullName.Substring($root.Length).TrimStart('\')
        $ignored = $false
        foreach ($pattern in $ignorePatterns) {
            if ($directory.Name -like $pattern -or $relativePath -like $pattern) {
                $ignored = $true
                break
            }
        }
        if ($ignored -or ($directory.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            continue
        }

        if (Test-CMakeProjectDirectory -Directory $directory.FullName) {
            $result.Add($directory.FullName)
            continue
        }

        if ($node.Depth -lt $MaxDepth) {
            Get-ChildItem -LiteralPath $directory.FullName -Directory -Force -ErrorAction SilentlyContinue |
                Sort-Object Name |
                ForEach-Object {
                    $queue.Enqueue([PSCustomObject]@{
                        Directory = $_
                        Depth = $node.Depth + 1
                    })
                }
        }
    }

    @($result | Sort-Object)
}

function Invoke-CMakeCommand {
    param(
        [Parameter(Mandatory)]
        [string[]]$CommandArguments,
        [Parameter(Mandatory)]
        [string]$WorkingDirectory,
        [AllowNull()]
        [System.IO.TextWriter]$LogWriter = $null
    )

    $outputEncoding = [System.Text.Encoding]::GetEncoding(
        [System.Globalization.CultureInfo]::CurrentCulture.TextInfo.ANSICodePage
    )
    $commandFile = Join-Path ([System.IO.Path]::GetTempPath()) (
        ([System.IO.Path]::GetRandomFileName()) + '.bat'
    )
    $process = $null

    try {
        $quotedArguments = @(
            foreach ($argument in $CommandArguments) {
                if ($argument.Contains('"')) {
                    throw "CMake argument contains an unsupported quote: $argument"
                }
                '"{0}"' -f $argument
            }
        )
        $commandLine = 'cmake.exe {0} 2>&1' -f ($quotedArguments -join ' ')
        [System.IO.File]::WriteAllText(
            $commandFile,
            "@echo off`r`n$commandLine`r`n",
            $outputEncoding
        )

        $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = 'cmd.exe'
        $startInfo.Arguments = "/d /c `"`"$commandFile`"`""
        $startInfo.WorkingDirectory = $WorkingDirectory
        $startInfo.UseShellExecute = $false
        $startInfo.RedirectStandardOutput = $true
        $startInfo.StandardOutputEncoding = $outputEncoding

        $process = [System.Diagnostics.Process]::new()
        $process.StartInfo = $startInfo
        if (-not $process.Start()) {
            throw 'Unable to start cmd.exe for CMake.'
        }

        Copy-BuildOutputText `
            -InputStream $process.StandardOutput.BaseStream `
            -LogWriter $LogWriter `
            -FallbackCodePage $outputEncoding.CodePage
        $process.WaitForExit()
        return $process.ExitCode
    }
    finally {
        if ($null -ne $process) {
            $process.Dispose()
        }
        Remove-Item -LiteralPath $commandFile -Force -ErrorAction SilentlyContinue
    }
}

function Set-ConsoleTitle {
    param(
        [Parameter(Mandatory)]
        [string]$Title
    )

    try { $Host.UI.RawUI.WindowTitle = $Title } catch {}
    try { [Console]::Title = $Title } catch {}
    cmd.exe /c "title $Title" | Out-Null
}

# Configure + build; output: <parent>/build/<workspaceName><Debug|Release>.
function Invoke-CMakeBuild {
    param(
        [ValidateSet('Debug', 'Release')]
        [string]$BuildType = 'Debug',
        [string]$WorkDir = '',
        [string]$WindowTitle = ''
    )

    if ([string]::IsNullOrWhiteSpace($WorkDir)) {
        $WorkDir = (Get-Location).Path
    }

    $WorkDir = (Resolve-Path $WorkDir).Path.TrimEnd('\')
    $workspaceName = Split-Path $WorkDir -Leaf
    if ([string]::IsNullOrWhiteSpace($WindowTitle)) {
        $WindowTitle = "$workspaceName $BuildType"
    }
    Set-ConsoleTitle $WindowTitle

    $parentDir = Split-Path $WorkDir -Parent
    $buildDir = Join-Path $parentDir "build\${workspaceName}${BuildType}"

    Write-Host "CMake Building $workspaceName in `"$buildDir`""

    Reset-BuildErrorSummary
    $buildOutputFile = [System.IO.Path]::GetTempFileName()
    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    $buildLogWriter = $null
    $buildExitCode = 1
    $buildStartTime = Get-Date

    try {
        $buildLogWriter = [System.IO.StreamWriter]::new($buildOutputFile, $false, $utf8WithoutBom)
        Push-Location $WorkDir
        try {
            $buildExitCode = Invoke-CMakeCommand `
                -CommandArguments @(
                    "-DCMAKE_BUILD_TYPE:STRING=$BuildType"
                    '-DCMAKE_EXPORT_COMPILE_COMMANDS:BOOL=TRUE'
                    '--no-warn-unused-cli'
                    '-S'
                    $WorkDir
                    '-B'
                    $buildDir
                ) `
                -WorkingDirectory $WorkDir `
                -LogWriter $buildLogWriter

            if ($buildExitCode -eq 0) {
                $buildExitCode = Invoke-CMakeCommand `
                    -CommandArguments @('--build', $buildDir, '--config', $BuildType) `
                    -WorkingDirectory $WorkDir `
                    -LogWriter $buildLogWriter
            }
        }
        finally {
            Pop-Location
        }
    }
    finally {
        $buildEndTime = Get-Date
        if ($null -ne $buildLogWriter) {
            $buildLogWriter.Dispose()
        }

        $summaryStartTime = Get-Date
        try {
            Get-Content -LiteralPath $buildOutputFile -Encoding UTF8 | ForEach-Object {
                Add-BuildOutputLine -Value $_ -NoEcho
            }

            $summaryEndTime = Get-Date
            $buildDuration = $buildEndTime - $buildStartTime
            $summaryDuration = $summaryEndTime - $summaryStartTime
            $overhead = if ($buildDuration.TotalMilliseconds -gt 0) {
                100.0 * $summaryDuration.TotalMilliseconds / $buildDuration.TotalMilliseconds
            }
            else {
                0.0
            }
            Show-CMakeBuildErrorSummary `
                -ExitCode $buildExitCode `
                -BuildDuration $buildDuration `
                -SummaryDuration $summaryDuration `
                -SummaryOverhead $overhead `
                -ShowTiming
        }
        catch {
            Write-Host "Build summary unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        finally {
            Remove-Item -LiteralPath $buildOutputFile -Force -ErrorAction SilentlyContinue
        }
    }

    return $buildExitCode
}

function Clear-CMakeBuildDirs {
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,
        [ValidateSet('Debug', 'Release')]
        [string[]]$BuildTypes = @('Debug', 'Release')
    )

    $RepoRoot = (Resolve-Path $RepoRoot).Path.TrimEnd('\')
    $workspaceName = Split-Path $RepoRoot -Leaf
    $parentDir = Split-Path $RepoRoot -Parent

    foreach ($buildType in $BuildTypes) {
        $buildDir = Join-Path $parentDir "build\${workspaceName}${buildType}"
        if (-not (Test-Path $buildDir)) {
            Write-Host "Skip clean (not found): $buildDir"
            continue
        }
        Write-Host "Cleaning $buildDir ..."
        Remove-Item -Path $buildDir -Recurse -Force
    }
}

function Start-BuildAll {
    param(
        [Parameter(Mandatory)]
        [string]$RepoRoot,
        [ValidateSet('Debug', 'Release')]
        [string[]]$BuildTypes = @('Debug', 'Release')
    )

    $RepoRoot = (Resolve-Path $RepoRoot).Path.TrimEnd('\')
    $exportScript = Join-Path $RepoRoot 'export.ps1'
    $buildScript = Join-Path $env:ROOT_DIR 'tools/buildFunction.ps1'

    Clear-CMakeBuildDirs -RepoRoot $RepoRoot -BuildTypes $BuildTypes

    & $exportScript
    if (-not $?) {
        throw "Export failed: $exportScript"
    }

    $workspaceName = Split-Path $RepoRoot -Leaf

    foreach ($buildType in $BuildTypes) {
        $windowTitle = "$workspaceName $buildType"
        Write-Host "Starting $windowTitle window..."
        $psCmd = "powershell -NoExit -ExecutionPolicy Bypass -File `"$buildScript`" -BuildType $buildType -WorkDir `"$RepoRoot`""
        cmd.exe /c "start `"$windowTitle`" $psCmd"
        Start-Sleep -Milliseconds 300
    }

    Write-Host 'Build windows started.'
}
