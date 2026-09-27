# license     MIT

param(
    [string]$Workspace = '',
    [switch]$Check,
    [switch]$Fix,
    [switch]$Help
)

if ($Help -or [string]::IsNullOrEmpty($Workspace)) {
    Write-Host 'clangfile.ps1 - Code formatting tool' -ForegroundColor Green
    Write-Host '=====================================' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Usage: clangfile.ps1 -Workspace <path> [options]' -ForegroundColor Yellow
    Write-Host ''
    Write-Host 'Parameters:' -ForegroundColor Yellow
    Write-Host '  -Workspace or -w   Workspace path (required)' -ForegroundColor White
    Write-Host '  -Check             Review only; no file changes (clang-format --dry-run --Werror)' -ForegroundColor White
    Write-Host '  -Fix               Format files in place (default when -Check is omitted)' -ForegroundColor White
    Write-Host '  -Help or -h        Show this help message' -ForegroundColor White
    Write-Host ''
    Write-Host 'Examples:' -ForegroundColor Yellow
    Write-Host "  .\clangfile.ps1 -w 'C:\MyWorkspace' -Check" -ForegroundColor Cyan
    Write-Host "  .\clangfile.ps1 -w 'C:\MyWorkspace' -Fix" -ForegroundColor Cyan
    Write-Host ''
    if ([string]::IsNullOrEmpty($Workspace)) {
        Write-Host 'Error: Workspace path is required!' -ForegroundColor Red
    }
    exit 0
}

if (-not (Test-Path $Workspace)) {
    Write-Host "Error: Workspace path does not exist: $Workspace" -ForegroundColor Red
    exit 1
}

$clangFormat = Get-Command clang-format.exe -ErrorAction SilentlyContinue
if ($null -eq $clangFormat) {
    Write-Host 'Error: clang-format.exe was not found in PATH.' -ForegroundColor Red
    exit 2
}

$reviewOnly = $Check.IsPresent -and -not $Fix.IsPresent

$ignoreDirectories = @(
    '.git',
    'ToolsData',
    '.vs',
    '.vscode',
    '.obsidian',
    'Debug',
    'Release',
    'win_b64',
    'intel_a',
    'build',
    'ImportedInterfaces',
    'ProtectedGenerated',
    'LocalGenerated',
    'Objects',
    'various',
    'CATEnv',
    'CNext'
)

$ignoreFiles = @(
    'stdsoap2.cpp',
    'stdsoap2.h',
    'soapStub.cpp',
    'soapStub.h',
    'soapC.cpp',
    'soapC.h',
    'soapClient.cpp',
    'soapClient.h',
    'soapServer.cpp',
    'soapServer.h',
    'soapH.h',
    'soapServerLib.cpp',
    'soapServerLib.h',
    'soapClientLib.cpp',
    'soapClientLib.h',
    'soapClientLib2.cpp',
    'soapClientLib2.h'
)

$fileExtensions = @('*.h', '*.c', '*.hpp', '*.cpp')

$script:processedFiles = 0
$script:issueFiles = 0
$script:issueFileList = @()
$script:processedDirs = 0
$script:skippedDirs = 0

function ShouldIgnoreDirectory {
    param([string]$dirPath)

    foreach ($ignoreDir in $ignoreDirectories) {
        if ($dirPath -match "\\$ignoreDir(\\|$)") {
            return $true
        }
    }
    return $false
}

function ShouldIgnoreFile {
    param([string]$filePath)

    $fileName = Split-Path $filePath -Leaf
    foreach ($ignoreFile in $ignoreFiles) {
        if ($fileName -eq $ignoreFile) {
            return $true
        }
    }
    return $false
}

function Register-IssueFile {
    param([string]$filePath)

    $script:issueFiles++
    $script:issueFileList += $filePath
}

function Write-ScanProgress {
    Write-Host -NoNewline '.'
}

function Write-FormatIssueList {
    if ($script:issueFiles -eq 0) { return }
    Write-Host ''
    Write-Host "Formatting issues ($($script:issueFiles)):" -ForegroundColor Yellow
    foreach ($file in $script:issueFileList) {
        Write-Host "  $file" -ForegroundColor Yellow
    }
}

function Write-FormatResult {
    param([int]$IssueCount)

    Write-Host ''
    Write-Host 'Result:' -ForegroundColor Cyan
    Write-Host "- Format issues: $IssueCount"

    if ($IssueCount -eq 0) {
        if ($reviewOnly) {
            Write-Host 'Review: PASS (all files formatted)' -ForegroundColor Green
        }
        else {
            Write-Host 'Format: OK' -ForegroundColor Green
        }
        return
    }

    $failMsg = "Review: FAIL ($IssueCount file(s) not compliant with clang-format)"
    if ($reviewOnly) {
        Write-Host $failMsg -ForegroundColor Red
        return
    }

    Write-Host $failMsg -ForegroundColor Yellow
    Write-Host "Format: OK ($IssueCount updated)" -ForegroundColor Green
}

function ProcessFile {
    param([string]$filePath)

    if (ShouldIgnoreFile $filePath) {
        return
    }

    $script:processedFiles++
    Write-ScanProgress

    if ($reviewOnly) {
        $formatOutput = @(& $clangFormat.Source -style=file --dry-run --Werror $filePath 2>&1)
        $formatExitCode = $LASTEXITCODE
        if ($formatExitCode -ne 0 -and
            @($formatOutput | Where-Object { $_.ToString() -match '\[-Wclang-format-violations\]' }).Count -gt 0) {
            Register-IssueFile $filePath
        }
        elseif ($formatExitCode -ne 0) {
            Write-Host ''
            Write-Host "clang-format failed: $filePath" -ForegroundColor Red
            $formatOutput | ForEach-Object { Write-Host $_ -ForegroundColor Red }
            exit $formatExitCode
        }
        return
    }

    $beforeHash = (Get-FileHash -Path $filePath -Algorithm MD5).Hash
    & $clangFormat.Source -style=file -i $filePath
    if ($LASTEXITCODE -ne 0) {
        Write-Host ''
        Write-Host "clang-format failed: $filePath" -ForegroundColor Red
        exit $LASTEXITCODE
    }

    $afterHash = (Get-FileHash -Path $filePath -Algorithm MD5).Hash
    if ($beforeHash -ne $afterHash) {
        Register-IssueFile $filePath
    }
}

function ProcessDirectory {
    param([string]$currentDir)

    if (ShouldIgnoreDirectory $currentDir) {
        $script:skippedDirs++
        return
    }

    $script:processedDirs++

    foreach ($ext in $fileExtensions) {
        Get-ChildItem -Path $currentDir -Filter $ext -File | ForEach-Object {
            ProcessFile $_.FullName
        }
    }

    Get-ChildItem -Path $currentDir -Directory | ForEach-Object {
        ProcessDirectory $_.FullName
    }
}

if ($reviewOnly) {
    Write-Host '-----Review format-----' -ForegroundColor Cyan
}
else {
    Write-Host '-----Format files------' -ForegroundColor Cyan
}
Write-Host "Workspace: $Workspace"
Write-Host "Mode: $(if ($reviewOnly) { 'Check (no changes)' } else { 'Fix (in place)' })"
Write-Host ''
Write-Host "clang-format: $Workspace" -ForegroundColor Green
Write-Host -NoNewline 'Scanning: '

ProcessDirectory $Workspace
Write-Host ''

Write-Host 'Scan:' -ForegroundColor Cyan
Write-Host "- Processed directories: $script:processedDirs"
Write-Host "- Skipped directories: $script:skippedDirs"
Write-Host "- Scanned files: $script:processedFiles"

if ($script:issueFiles -gt 0) {
    Write-FormatIssueList
}

Write-FormatResult -IssueCount $script:issueFiles
Write-Host '=== END ===' -ForegroundColor Green

if ($reviewOnly -and $script:issueFiles -gt 0) {
    exit 1
}
exit 0
