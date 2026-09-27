# license     MIT
# brief       PowerShell version of mk.bat
param(
    [string]$Version = "",
    [string]$Workspace = "",
    [string]$Project = "",
    [ValidateSet('Auto', 'CAA', 'CMake')]
    [string]$ProjectType = 'Auto',
    [ValidateSet('Debug', 'Release')]
    [string[]]$BuildType = @('Debug', 'Release'),
    [switch]$Help,
    [switch]$UseBat,
    [switch]$ShowMajorErrors = $false
)

. "$PSScriptRoot\buildErrorSummary.ps1"
. "$PSScriptRoot\buildOutputEncoding.ps1"

$projectRoot = if ([string]::IsNullOrWhiteSpace($Project)) {
    (Get-Location).ProviderPath
}
else {
    if (-not (Test-Path -LiteralPath $Project -PathType Container)) {
        Write-Host "[FAIL] Project directory does not exist: $Project" -ForegroundColor Red
        exit 1
    }
    (Resolve-Path -LiteralPath $Project).Path
}
$projectRoot = $projectRoot.TrimEnd('\')
$selectedProjectType = $ProjectType
if ($selectedProjectType -eq 'Auto') {
    if (Test-Path -LiteralPath (Join-Path $projectRoot 'CMakeLists.txt') -PathType Leaf) {
        $selectedProjectType = 'CMake'
    }
    else {
        $selectedProjectType = 'CAA'
    }
}

# Show help if requested
if ($Help) {
    Write-Host "Usage: mk.ps1 [options]" -ForegroundColor Green
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  -Help or -h        Show this help message" -ForegroundColor White
    Write-Host "  -Version or -v     Set version number (default: 19)" -ForegroundColor White
    Write-Host "  -Workspace or -w   Set workspace path" -ForegroundColor White
    Write-Host "  -Project           Set the source project directory" -ForegroundColor White
    Write-Host "  -ProjectType       Auto, CAA, or CMake" -ForegroundColor White
    Write-Host "  -BuildType         CMake configuration(s): Debug, Release" -ForegroundColor White
    Write-Host "  -UseBat            Use original mk.bat instead of PowerShell" -ForegroundColor White
    Write-Host "  -ShowMajorErrors   Show non-fatal uppercase ERROR lines in the summary" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Yellow
    Write-Host "  .\mk.ps1" -ForegroundColor Cyan
    Write-Host "  .\mk.ps1 -Version 20" -ForegroundColor Cyan
    Write-Host "  .\mk.ps1 -Version 20 -Workspace 'C:\MyWorkspace'" -ForegroundColor Cyan
    Write-Host "  .\mk.ps1 -UseBat" -ForegroundColor Cyan
    Write-Host "  .\mk.ps1 -Help" -ForegroundColor Cyan
    exit 0
}

if ($selectedProjectType -eq 'CMake') {
    . "$PSScriptRoot\commonCmake.ps1"
    if (-not (Test-CMakeProjectDirectory -Directory $projectRoot)) {
        Write-Host "[FAIL] CMakeLists.txt not found: $projectRoot" -ForegroundColor Red
        exit 1
    }

    $configurations = @($BuildType | Select-Object -Unique)
    if ($configurations.Count -eq 0) {
        Write-Host '[FAIL] At least one CMake build type is required.' -ForegroundColor Red
        exit 1
    }

    $exportScript = Join-Path $projectRoot 'export.ps1'
    $exportExitCode = 0
    if (Test-Path -LiteralPath $exportScript -PathType Leaf) {
        Write-Host "[EXPORT] $exportScript" -ForegroundColor Cyan
        Push-Location $projectRoot
        try {
            & powershell.exe `
                -NoProfile `
                -ExecutionPolicy Bypass `
                -File $exportScript
            $exportExitCode = $LASTEXITCODE
        }
        catch {
            $exportExitCode = 1
        }
        finally {
            Pop-Location
        }
    }

    $failedBuilds = 0
    foreach ($configuration in $configurations) {
        Write-Host "=== Build | CMake | $configuration ===" -ForegroundColor DarkCyan
        $cmakeExitCode = Invoke-CMakeBuild `
            -BuildType $configuration `
            -WorkDir $projectRoot
        if ($cmakeExitCode -ne 0) {
            $failedBuilds++
            Write-Host "[FAIL] CMake $configuration" -ForegroundColor Red
        }
        else {
            Write-Host "[ OK ] CMake $configuration" -ForegroundColor Green
        }
    }

    $hasFailure = $false
    if ($failedBuilds -gt 0) {
        $hasFailure = $true
        Write-Host "[FAIL] CMake configurations failed: $failedBuilds" -ForegroundColor Red
    }
    else {
        Write-Host "[ OK ] CMake configurations built: $($configurations.Count)" -ForegroundColor Green
    }
    if ($exportExitCode -ne 0) {
        $hasFailure = $true
        Write-Host "[ERROR] export.ps1 failed with exit code: $exportExitCode" -ForegroundColor Red
    }
    if ($hasFailure) {
        exit 1
    }
    exit 0
}

# CAA-only version selection. CMake builds do not use a RADE version.
if ([string]::IsNullOrEmpty($Version)) {
    $Version = $env:CAA_MK_VERSION
    Write-Host "Version from env: $Version" -ForegroundColor Yellow
    if ([string]::IsNullOrEmpty($Version)) {
        $Version = "19"
        Write-Host "Version set to default: $Version" -ForegroundColor Yellow
    }
}
else {
    Write-Host "Version from parameter: $Version" -ForegroundColor Yellow
}

# If UseBat is specified, call the original mk.bat
if ($UseBat) {
    Write-Host "Using original mk.bat..." -ForegroundColor Yellow
    $batFile = Join-Path $PSScriptRoot "mk.bat"
    if (Test-Path $batFile) {
        & $batFile
        exit $LASTEXITCODE
    }
    else {
        Write-Host "Error: mk.bat not found at $batFile" -ForegroundColor Red
        exit 1
    }
}

# Clear screen Clear-Host No action

if ([string]::IsNullOrWhiteSpace($Workspace) -and
    -not [string]::IsNullOrWhiteSpace($env:CAA_MK_WORKSPACE)) {
    $Workspace = $env:CAA_MK_WORKSPACE
}

Write-Host ""
Write-Host "=== START ===" -ForegroundColor Cyan
# Set base directory
$BaseDir = "C:\DS\RADE$Version\intel_a"
$BuildOutputFile = ""
$BuildCommandFile = ""
$BuildOutputClassified = $false
$buildExitCode = $null
$scriptExitCode = 0

# Record start time
$StartTime = Get-Date
Write-Host "Start time: $($StartTime.ToString('HH:mm:ss'))" -ForegroundColor Green

# Display configuration
Write-Host "Version: $Version" -ForegroundColor Yellow
if ($Workspace) {
    Write-Host "Workspace: $Workspace" -ForegroundColor Yellow
}
Write-Host ""

# Check if base directory exists
if (-not (Test-Path $BaseDir)) {
    Write-Host "Error: Base directory does not exist: $BaseDir" -ForegroundColor Red
    Write-Host "Please check if the DS installation path is correct" -ForegroundColor Red
    exit 1
}

# Execute commands with error handling
try {
    # Check each batch file exists before executing
    $tckInit = "$BaseDir\code\command\tck_init.bat"
    $tckProfile = "$BaseDir\TCK\command\tck_profile.bat"
    $mkGetPreq = "$BaseDir\code\command\mkGetPreq.bat"
    $mkmk = "$BaseDir\code\command\mkmk.bat"
    $mkrtv = "$BaseDir\code\command\mkrtv.bat"

    Write-Host "Checking batch files..." -ForegroundColor Yellow
    Write-Host "  tck_init.bat: $(Test-Path $tckInit)" -ForegroundColor Gray
    Write-Host "  tck_profile.bat: $(Test-Path $tckProfile)" -ForegroundColor Gray
    Write-Host "  mkGetPreq.bat: $(Test-Path $mkGetPreq)" -ForegroundColor Gray
    Write-Host "  mkmk.bat: $(Test-Path $mkmk)" -ForegroundColor Gray
    Write-Host "  mkrtv.bat: $(Test-Path $mkrtv)" -ForegroundColor Gray
    Write-Host ""

    # Execute all batch files in a single cmd session to preserve environment variables
    Write-Host "Executing all batch files in sequence..." -ForegroundColor Cyan

    # add workspace preq parameter
    $workspacePreq = "C:\DS\B$Version"
    if ($Workspace) {
        $workspacePreq += ";$Workspace"
    }
    Write-Host "Workspace preq: $workspacePreq" -ForegroundColor Yellow
    Write-Host ""

    $batchCommands = @(
        'set "_buildExit=0"'
        "call `"$tckInit`""
        'if not "!errorlevel!"=="0" if "!_buildExit!"=="0" set "_buildExit=!errorlevel!"'
        "call `"$tckProfile`" `"V5R${Version}_B$Version`""
        'if not "!errorlevel!"=="0" if "!_buildExit!"=="0" set "_buildExit=!errorlevel!"'
        "call `"$mkGetPreq`" -p `"$workspacePreq`""
        'if not "!errorlevel!"=="0" if "!_buildExit!"=="0" set "_buildExit=!errorlevel!"'
        "call `"$mkmk`" -au"
        'if not "!errorlevel!"=="0" if "!_buildExit!"=="0" set "_buildExit=!errorlevel!"'
        "call `"$mkrtv`""
        'if not "!errorlevel!"=="0" if "!_buildExit!"=="0" set "_buildExit=!errorlevel!"'
        'exit /b !_buildExit!'
    )

    $allCommands = $batchCommands -join "`r`n"
    # Keep the build pipeline independent from summary parsing. Merge stderr
    # inside cmd.exe, stream the original output, and classify the saved log
    # only after every build command has completed.
    $BuildOutputFile = [System.IO.Path]::GetTempFileName()
    $capturedCommands = "($allCommands) 2>&1"

    # A single CAA build may mix UTF-8 compiler output with legacy Windows
    # code-page output. Decode each raw line as strict UTF-8 first, then fall
    # back to the local ANSI code page (936 on Simplified Chinese Windows).
    $buildOutputEncoding = [System.Text.Encoding]::GetEncoding(
        [System.Globalization.CultureInfo]::CurrentCulture.TextInfo.ANSICodePage
    )
    $BuildCommandFile = Join-Path ([System.IO.Path]::GetTempPath()) (
        ([System.IO.Path]::GetRandomFileName()) + '.bat'
    )
    [System.IO.File]::WriteAllText(
        $BuildCommandFile,
        "@echo off`r`nsetlocal EnableExtensions EnableDelayedExpansion`r`n$capturedCommands`r`n",
        $buildOutputEncoding
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'cmd.exe'
    $startInfo.Arguments = "/d /c `"`"$BuildCommandFile`"`""
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardOutput = $true
    $startInfo.StandardOutputEncoding = $buildOutputEncoding

    $buildProcess = [System.Diagnostics.Process]::new()
    $buildProcess.StartInfo = $startInfo
    $buildLogWriter = $null
    try {
        $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
        $buildLogWriter = [System.IO.StreamWriter]::new($BuildOutputFile, $false, $utf8WithoutBom)
        if (-not $buildProcess.Start()) {
            throw 'Unable to start cmd.exe for the build.'
        }

        Copy-BuildOutputText `
            -InputStream $buildProcess.StandardOutput.BaseStream `
            -LogWriter $buildLogWriter `
            -FallbackCodePage $buildOutputEncoding.CodePage
        $buildProcess.WaitForExit()
        $buildExitCode = $buildProcess.ExitCode
    }
    finally {
        if ($null -ne $buildLogWriter) {
            $buildLogWriter.Dispose()
        }
        $buildProcess.Dispose()
    }

    # Classify output before deciding whether a non-zero tool exit is fatal.
    if (Test-Path -LiteralPath $BuildOutputFile) {
        Get-Content -LiteralPath $BuildOutputFile -Encoding UTF8 | ForEach-Object {
            Add-BuildOutputLine -Value $_ -NoEcho
        }
        $BuildOutputClassified = $true
    }
    if (Test-BuildFailureIsNonFatalCaaOnly -ExitCode $buildExitCode) {
        $buildExitCode = 0
    }

    # Check if any actionable command failed
    if ($buildExitCode -ne 0) {
        throw "Command failed with exit code: $buildExitCode"
    }

    # Record end time and calculate runtime
    $EndTime = Get-Date
    $Duration = $EndTime - $StartTime

    Write-Host ""
    Write-Host "End time: $($EndTime.ToString('HH:mm:ss'))" -ForegroundColor Green
    Write-Host "Runtime: $($Duration.ToString('hh\:mm\:ss'))" -ForegroundColor Green
    if ($BuildWarnings.Count -gt 0 -or $MajorErrors.Count -gt 0) {
        Write-Host "Build completed with warnings." -ForegroundColor Yellow
    }
    else {
        Write-Host "Build completed successfully!" -ForegroundColor Green
    }
    Write-Host "=== END ===" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "Error occurred during build:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "End time: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Red
    Write-Host "=== END ===" -ForegroundColor Green

    $scriptExitCode = if ($null -ne $buildExitCode -and $buildExitCode -ne 0) { $buildExitCode } else { 1 }
}
finally {
    if (-not [string]::IsNullOrEmpty($BuildCommandFile) -and (Test-Path -LiteralPath $BuildCommandFile)) {
        Remove-Item -LiteralPath $BuildCommandFile -Force -ErrorAction SilentlyContinue
    }

    if (-not [string]::IsNullOrEmpty($BuildOutputFile) -and (Test-Path -LiteralPath $BuildOutputFile)) {
        try {
            if (-not $BuildOutputClassified) {
                Get-Content -LiteralPath $BuildOutputFile -Encoding UTF8 | ForEach-Object {
                    Add-BuildOutputLine -Value $_ -NoEcho
                }
            }
        }
        catch {
            Write-Host "Build summary classification failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        finally {
            Remove-Item -LiteralPath $BuildOutputFile -Force -ErrorAction SilentlyContinue
        }
    }

    try {
        $summaryExitCode = if ($null -ne $buildExitCode) { $buildExitCode } else { $scriptExitCode }
        Show-BuildErrorSummary -ExitCode $summaryExitCode -ShowMajorErrors:$ShowMajorErrors
    }
    catch {
        Write-Host "Build summary unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

exit $scriptExitCode
