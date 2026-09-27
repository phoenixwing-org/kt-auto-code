# license     MIT
# Shared build-output error collector.
# Dot-source this file from a build script, then call Add-BuildOutputLine for
# every output line and Show-BuildErrorSummary when the build ends.

$MajorErrors = [System.Collections.Generic.List[string]]::new()
$MinorErrors = [System.Collections.Generic.List[string]]::new()
$BuildWarnings = [System.Collections.Generic.List[string]]::new()
$MajorErrorSet = [System.Collections.Generic.HashSet[string]]::new()
$MinorErrorSet = [System.Collections.Generic.HashSet[string]]::new()
$BuildWarningSet = [System.Collections.Generic.HashSet[string]]::new()
$LinkFailures = [System.Collections.Generic.List[string]]::new()
$LinkFailureSet = [System.Collections.Generic.HashSet[string]]::new()
$CorrelatedMissingLibraries = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$MakeErrorTargets = [System.Collections.Generic.List[string]]::new()
$MakeErrorTargetSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$CorrelatedMakeTargets = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$CMakeFailures = [System.Collections.Generic.List[string]]::new()
$CMakeFailureSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$CurrentMakeTarget = ''

function Get-BuildErrorKind {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Line
    )

    $knownNonFatalErrors = @(
        'ERROR: Java Development Kit v1.6 (SOFTWARE\JavaSoft\Java Development Kit\1.6) not detected in registry.'
        'ERROR: unable to set JavaROOT_PATH.'
        'ERROR: unable to set JNIROOT_PATH.'
    )
    if ($knownNonFatalErrors -ccontains $Line.Trim()) {
        return 'None'
    }

    if ($Line -cmatch '^\s*#\s*mkmk-ERROR:\s+Duplicated file\b') {
        return 'Warning'
    }

    # CAA emits uppercase make/mkmk markers. Keep them separate because they
    # are often non-fatal and should be counted without flooding the summary.
    if ($Line -cmatch '\bERROR\b|\[ERROR\]') {
        return 'Major'
    }

    # A word boundary catches compiler/linker diagnostics such as
    # "error C2065" and "fatal error LNK1181", but not CATErrorDef.h.
    if ($Line -match '\berror\b') {
        return 'Minor'
    }

    return 'None'
}

function Get-BuildWarningText {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Line
    )

    return ($Line.Trim() -replace '^#\s*mkmk-ERROR:\s*', '')
}

function Get-LinkerMissingLibrary {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Line
    )

    if ($Line -match '(?i)\bLNK1181\b.*?(?:\u201C|")(?<Library>[^\u201D"]+\.lib)(?:\u201D|")') {
        return Split-Path $Matches.Library -Leaf
    }
    return ''
}

function Get-MakeTarget {
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$Line
    )

    if ($Line -cmatch '# make(?:-ERROR)?:\s+.*[\\/](?<Target>[^\\/\s]+\.(?:dll|exe))\s*$') {
        return $Matches.Target
    }
    return ''
}

function Add-LinkFailureRecord {
    param(
        [Parameter(Mandatory)][string]$Target,
        [Parameter(Mandatory)][string]$Library
    )

    $linkFailure = "[error] LINK LNK1181: $Target cannot link $Library"
    if ($LinkFailureSet.Add($linkFailure)) {
        $LinkFailures.Add($linkFailure)
    }
    [void]$CorrelatedMissingLibraries.Add($Library)
    [void]$CorrelatedMakeTargets.Add($Target)
}

function Add-BuildOutputLine {
    param(
        [object]$Value,
        [switch]$NoEcho
    )

    $line = [string]$Value
    if (-not $NoEcho) {
        Write-Host $line
    }

    if ([string]::IsNullOrEmpty($line)) {
        return
    }

    # CMake Tools prefixes captured build output with "[build]". Remove only
    # that transport prefix so source paths remain clickable in the summary.
    $summaryLine = $line -replace '^\[build\]\s+', ''

    if ($summaryLine -match '^FAILED:\s+(?<Target>.+?)\s*$') {
        $failedTarget = $Matches.Target
        if ($CMakeFailureSet.Add($failedTarget)) {
            $CMakeFailures.Add($failedTarget)
        }
    }

    $makeTarget = Get-MakeTarget -Line $summaryLine
    if (-not [string]::IsNullOrWhiteSpace($makeTarget)) {
        if ($summaryLine -cmatch '# make-ERROR:' -and $MakeErrorTargetSet.Add($makeTarget)) {
            $MakeErrorTargets.Add($makeTarget)
        }

        if ($summaryLine -cmatch '# make:') {
            $script:CurrentMakeTarget = $makeTarget
        }
        elseif ($makeTarget -eq $script:CurrentMakeTarget) {
            # The normal CAA sequence ends with make-ERROR for the same target.
            # Clear it here so a later linker error cannot attach to this module.
            $script:CurrentMakeTarget = ''
        }
    }

    $missingLibrary = Get-LinkerMissingLibrary -Line $summaryLine
    if (-not [string]::IsNullOrWhiteSpace($missingLibrary)) {
        if (-not [string]::IsNullOrWhiteSpace($script:CurrentMakeTarget)) {
            Add-LinkFailureRecord -Target $script:CurrentMakeTarget -Library $missingLibrary
        }
    }

    # Keep compiler-style "file(line,col): error ..." text intact so VS Code
    # and Windows Terminal can recognize the source location.
    $errorKind = Get-BuildErrorKind -Line $summaryLine
    if ($errorKind -eq 'Warning') {
        $warningText = Get-BuildWarningText -Line $summaryLine
        if ($BuildWarningSet.Add($warningText)) {
            $BuildWarnings.Add($warningText)
        }
    }
    elseif ($errorKind -eq 'Major') {
        if ($MajorErrorSet.Add($summaryLine)) {
            $MajorErrors.Add($summaryLine)
        }
    }
    elseif ($errorKind -eq 'Minor') {
        if ($MinorErrorSet.Add($summaryLine)) {
            $MinorErrors.Add($summaryLine)
        }
    }
}

function Reset-BuildErrorSummary {
    $MajorErrors.Clear()
    $MinorErrors.Clear()
    $BuildWarnings.Clear()
    $MajorErrorSet.Clear()
    $MinorErrorSet.Clear()
    $BuildWarningSet.Clear()
    $LinkFailures.Clear()
    $LinkFailureSet.Clear()
    $CorrelatedMissingLibraries.Clear()
    $MakeErrorTargets.Clear()
    $MakeErrorTargetSet.Clear()
    $CorrelatedMakeTargets.Clear()
    $CMakeFailures.Clear()
    $CMakeFailureSet.Clear()
    $script:CurrentMakeTarget = ''
}

function Test-BuildHasActionableErrors {
    return $MinorErrors.Count -gt 0 -or
        $LinkFailures.Count -gt 0 -or
        $MakeErrorTargets.Count -gt 0 -or
        $CMakeFailures.Count -gt 0
}

function Test-BuildFailureIsNonFatalCaaOnly {
    param([int]$ExitCode)

    if ($ExitCode -eq 0 -or (Test-BuildHasActionableErrors)) {
        return $false
    }

    $unexpectedMajorErrors = @(
        $MajorErrors | Where-Object { $_ -cnotmatch '^\s*#\s*mkmk-ERROR:' }
    )
    $nonFatalCount = $BuildWarnings.Count + $MajorErrors.Count
    return $nonFatalCount -gt 0 -and $unexpectedMajorErrors.Count -eq 0
}

function Show-CMakeBuildErrorSummary {
    param(
        [int]$ExitCode,
        [TimeSpan]$BuildDuration = [TimeSpan]::Zero,
        [TimeSpan]$SummaryDuration = [TimeSpan]::Zero,
        [double]$SummaryOverhead = 0.0,
        [switch]$ShowTiming
    )

    Write-Host ""
    Write-Host "=== BUILD ERROR SUMMARY ===" -ForegroundColor Cyan
    if ($ShowTiming) {
        Write-Host "Build runtime: $($BuildDuration.ToString('hh\:mm\:ss\.fff'))" -ForegroundColor Cyan
        Write-Host "Summary runtime: $($SummaryDuration.ToString('hh\:mm\:ss\.fff'))" -ForegroundColor Cyan
        Write-Host ("Summary overhead: {0:N2}%" -f $SummaryOverhead) -ForegroundColor Cyan
    }

    if ($BuildWarnings.Count -gt 0) {
        Write-Host "Warnings ($($BuildWarnings.Count)):" -ForegroundColor Yellow
        foreach ($warning in $BuildWarnings) {
            Write-Host "  [WARN] $warning" -ForegroundColor Yellow
        }
    }

    $displayMinorErrors = @(
        $MinorErrors | Where-Object {
            $library = Get-LinkerMissingLibrary -Line $_
            [string]::IsNullOrWhiteSpace($library) -or -not $CorrelatedMissingLibraries.Contains($library)
        }
    )
    $compilerErrors = @($displayMinorErrors | Where-Object { $_ -notmatch '(?i)\bLNK\d+\b' })
    $rawLinkErrors = @($displayMinorErrors | Where-Object { $_ -match '(?i)\bLNK\d+\b' })
    $linkErrorCount = $rawLinkErrors.Count + $LinkFailures.Count

    if ($compilerErrors.Count -gt 0) {
        Write-Host "Compiler errors ($($compilerErrors.Count)):" -ForegroundColor Red
        foreach ($line in $compilerErrors) {
            Write-Host "  [error] $line" -ForegroundColor Red
        }
    }

    if ($linkErrorCount -gt 0) {
        Write-Host "Link errors (${linkErrorCount}):" -ForegroundColor Red
        foreach ($line in $rawLinkErrors) {
            Write-Host "  [error] $line" -ForegroundColor Red
        }
        foreach ($line in $LinkFailures) {
            Write-Host "  $line" -ForegroundColor Red
        }
    }

    if ($MajorErrors.Count -gt 0) {
        Write-Host "Build errors ($($MajorErrors.Count)):" -ForegroundColor Red
        foreach ($line in $MajorErrors) {
            Write-Host "  [ERROR] $line" -ForegroundColor Red
        }
    }

    if ($CMakeFailures.Count -gt 0) {
        Write-Host "Build failures ($($CMakeFailures.Count)):" -ForegroundColor Red
        foreach ($target in $CMakeFailures) {
            Write-Host "  [ERROR] ${target}: build failed" -ForegroundColor Red
        }
    }

    if ($compilerErrors.Count -eq 0 -and $linkErrorCount -eq 0 -and
        $MajorErrors.Count -eq 0 -and $CMakeFailures.Count -eq 0) {
        Write-Host "[ OK ] Build errors: none" -ForegroundColor Green
    }

    if ($ExitCode -ne 0) {
        Write-Host "Build exit code: $ExitCode" -ForegroundColor Red
    }
    Write-Host "=== END ERROR SUMMARY ===" -ForegroundColor Cyan
}

function Show-BuildErrorSummary {
    param(
        [int]$ExitCode,
        [switch]$ShowMajorErrors
    )

    Write-Host ""
    Write-Host "=== BUILD ERROR SUMMARY ===" -ForegroundColor Cyan

    # CAA markers are usually informational. Put their count first so the
    # actionable compiler, linker, and target failures remain grouped below.
    if ($ShowMajorErrors) {
        if ($MajorErrors.Count -eq 0) {
            Write-Host "CAA ERRORs: none" -ForegroundColor Green
        }
        else {
            Write-Host "CAA ERRORs ($($MajorErrors.Count)):" -ForegroundColor Yellow
            foreach ($line in $MajorErrors) {
                Write-Host "  $line" -ForegroundColor Yellow
            }
        }
    }
    else {
        Write-Host "CAA ERRORs: $($MajorErrors.Count) (hidden; use -ShowMajorErrors to display)" -ForegroundColor DarkYellow
    }

    if ($BuildWarnings.Count -gt 0) {
        Write-Host "Warnings ($($BuildWarnings.Count)):" -ForegroundColor Yellow
        foreach ($warning in $BuildWarnings) {
            Write-Host "  [WARN] $warning" -ForegroundColor Yellow
        }
    }

    $displayMinorErrors = @(
        $MinorErrors | Where-Object {
            $library = Get-LinkerMissingLibrary -Line $_
            [string]::IsNullOrWhiteSpace($library) -or -not $CorrelatedMissingLibraries.Contains($library)
        }
    )

    $compilerErrorCount = $displayMinorErrors.Count
    if ($compilerErrorCount -eq 0) {
        Write-Host "[ OK ] Compiler errors: none" -ForegroundColor Green
    }
    else {
        Write-Host "Compiler errors (${compilerErrorCount}):" -ForegroundColor Red
        foreach ($line in $displayMinorErrors) {
            Write-Host "  [error] $line" -ForegroundColor Red
        }
    }

    if ($LinkFailures.Count -gt 0) {
        Write-Host "Link errors ($($LinkFailures.Count)):" -ForegroundColor Red
        foreach ($linkFailure in $LinkFailures) {
            Write-Host "  $linkFailure" -ForegroundColor Red
        }
    }

    if ($MakeErrorTargets.Count -gt 0) {
        Write-Host "Build failures ($($MakeErrorTargets.Count)):" -ForegroundColor Red
        foreach ($makeFailure in $MakeErrorTargets) {
            Write-Host "  [ERROR] ${makeFailure}: build failed" -ForegroundColor Red
        }
    }

    if ($ExitCode -ne 0) {
        Write-Host "Build exit code: $ExitCode" -ForegroundColor Red
    }
    Write-Host "=== END ERROR SUMMARY ===" -ForegroundColor Cyan
}
