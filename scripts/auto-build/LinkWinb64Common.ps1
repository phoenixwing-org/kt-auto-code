# license     MIT
# brief       Common functions for symbolic link management scripts

# Delete only a directory junction or symbolic-link entry. Directory.Delete
# does not recurse into the link target and does not show confirmation prompts.
function Remove-DirectoryLink {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace("$($item.LinkType)")) {
        throw "The path is not a directory link: $Path"
    }
    [System.IO.Directory]::Delete($item.FullName, $false)
    if (Test-Path -LiteralPath $Path) {
        throw "The directory link still exists: $Path"
    }
}

# Remove a directory (symbolic link or regular folder)
function Remove-SymbolicLinkOrFolder {
    param(
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        Write-Host "    Directory does not exist, skipping" -ForegroundColor DarkGray
        return $true
    }

    Write-Host "    Deleting... " -NoNewline -ForegroundColor Gray

    try {
        $item = Get-Item $Path -Force -ErrorAction SilentlyContinue

        # Check if it's a symbolic link (Junction or SymbolicLink)
        $isLink = $false
        if ($null -ne $item) {
            if ($item.LinkType) {
                $isLink = $true
                Write-Host "(Symbolic Link) " -NoNewline -ForegroundColor DarkYellow
            }
            else {
                Write-Host "(Regular Folder) " -NoNewline -ForegroundColor DarkYellow
            }
        }
        else {
            Write-Host "(Regular Folder) " -NoNewline -ForegroundColor DarkYellow
        }

        # Remove only the link entry; recurse only for an explicitly detected
        # regular directory retained for compatibility with legacy callers.
        if ($isLink) {
            Remove-DirectoryLink -Path $Path
        }
        else {
            Remove-Item -LiteralPath $Path -Force -Recurse -ErrorAction Stop
        }

        # Verify deletion success
        Start-Sleep -Milliseconds 100
        if (Test-Path $Path) {
            Write-Host "Failed: Directory still exists!" -ForegroundColor Red
            Write-Host "    Please delete manually: $Path" -ForegroundColor Red
            return $false
        }
        else {
            if ($isLink) {
                Write-Host "Success: Symbolic link deleted" -ForegroundColor Green
            }
            else {
                Write-Host "Success: Regular folder force deleted" -ForegroundColor Green
            }
            return $true
        }
    }
    catch {
        Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "    Please check permissions or delete manually: $Path" -ForegroundColor Red
        return $false
    }
}

# Create a symbolic link (Junction)
function New-SymbolicLink {
    param(
        [string]$Path,
        [string]$Target
    )

    try {
        # Create parent directory (if not exists)
        $ParentDir = Split-Path -Parent $Path
        if (-not (Test-Path $ParentDir)) {
            Write-Host "    Creating parent directory: $ParentDir" -ForegroundColor DarkGray
            New-Item -ItemType Directory -Path $ParentDir -Force | Out-Null
        }

        # Create symbolic link (Junction)
        New-Item -ItemType Junction -Path $Path -Target $Target -Force | Out-Null

        # Verify creation success
        Start-Sleep -Milliseconds 100
        if (Test-Path $Path) {
            $linkItem = Get-Item $Path -Force
            if ($linkItem.LinkType -eq "Junction") {
                Write-Host "    Success: Symbolic link created" -ForegroundColor Green
                return $true
            }
            else {
                Write-Host "    Warning: Created item is not a symbolic link" -ForegroundColor Yellow
                return $false
            }
        }
        else {
            Write-Host "    Error: Failed to create symbolic link!" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host "    Error: Failed to create symbolic link!" -ForegroundColor Red
        Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Ensure Path is a junction to Target. Existing regular directories are kept
# unless ReplaceDirectory is explicitly supplied.
function Set-DirectoryJunction {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Target,
        [switch]$ReplaceDirectory
    )

    $targetPath = (Resolve-Path -LiteralPath $Target).Path.TrimEnd('\')
    $linkPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($linkPath -eq $targetPath) {
        throw 'The junction path and target path must be different.'
    }
    if (Test-Path -LiteralPath $Path) {
        $item = Get-Item -LiteralPath $Path -Force
        if ([string]::IsNullOrWhiteSpace("$($item.LinkType)")) {
            if (-not $ReplaceDirectory) {
                return [PSCustomObject]@{
                    Success = $false
                    Status = 'Blocked'
                    Message = 'A regular directory already exists.'
                }
            }
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        }
        else {
            $existingTarget = "$( @($item.Target)[0] )"
            if (-not [System.IO.Path]::IsPathRooted($existingTarget)) {
                $existingTarget = Join-Path (Split-Path -Parent $Path) $existingTarget
            }
            $existingTarget = [System.IO.Path]::GetFullPath($existingTarget).TrimEnd('\')
            if ($existingTarget -eq $targetPath) {
                return [PSCustomObject]@{
                    Success = $true
                    Status = 'Unchanged'
                    Message = 'The junction already points to the target.'
                }
            }
            Remove-DirectoryLink -Path $Path
        }
    }

    $parent = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    New-Item -ItemType Junction -Path $Path -Target $targetPath -Force -ErrorAction Stop | Out-Null
    return [PSCustomObject]@{
        Success = $true
        Status = 'Linked'
        Message = 'Junction created.'
    }
}

# Process directory list: remove existing links/folders
function Remove-SymbolicLinkList {
    param(
        [string[]]$DirList,
        [string]$StepTitle = "[Step 1] Removing existing links/folders"
    )

    Write-Host $StepTitle -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Yellow
    Write-Host ""

    $index = 1
    foreach ($CurrentDir in $DirList) {
        Write-Host "  $index. Processing: " -NoNewline -ForegroundColor White
        Write-Host $CurrentDir -ForegroundColor Cyan

        Remove-SymbolicLinkOrFolder -Path $CurrentDir

        Write-Host ""
        $index++
    }
}

# Process directory list: create symbolic links
function New-SymbolicLinkList {
    param(
        [string[]]$DirList,
        [string]$SourceDir,
        [string]$StepTitle = "[Step 2] Creating symbolic links"
    )

    Write-Host $StepTitle -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Yellow
    Write-Host ""

    # Check if source directory exists
    if (-not (Test-Path $SourceDir)) {
        Write-Host "Error: Source directory does not exist!" -ForegroundColor Red
        Write-Host "Please check: $SourceDir" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }

    $index = 1
    foreach ($CurrentDir in $DirList) {
        Write-Host "$index. Creating: " -NoNewline -ForegroundColor White
        Write-Host $CurrentDir -ForegroundColor Cyan
        Write-Host "    Target: " -NoNewline -ForegroundColor Gray
        Write-Host $SourceDir -ForegroundColor DarkCyan

        New-SymbolicLink -Path $CurrentDir -Target $SourceDir

        Write-Host ""
        $index++
    }
}

# Display header
function Show-ScriptHeader {
    param(
        [string]$Title
    )

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host "  $Title" -ForegroundColor Magenta
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host ""
}

# Display footer
function Show-ScriptFooter {
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host "  Operation completed!" -ForegroundColor Magenta
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host ""
}
