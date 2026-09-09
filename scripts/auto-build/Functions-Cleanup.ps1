# license     MIT
# brief       Read cleanup rules, remove directory links, clean directories and files, and create test cases.
# 当前配置格式的轻量读取器：支持三个列表、空行和注释，不支持复杂 YAML。
function Read-CleanupConfiguration {
    param([string]$Path)

    $config = [pscustomobject]@{
        UnlinkDirectories = @()
        Directories = @()
        Files = @()
    }
    $section = ''
    $list = ''
    foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop) {
        if ($line -match '^\s*(#.*)?$') { continue }
        if ($line -match '^unlinkDirectories:\s*(\[\])?\s*(?:#.*)?$') {
            $section = 'unlink'
            $list = 'UnlinkDirectories'
            continue
        }
        if ($line -match '^delete:\s*(?:#.*)?$') {
            $section = 'delete'
            $list = ''
            continue
        }
        if ($section -eq 'delete' -and $line -match '^  (directories|files):\s*(\[\])?\s*(?:#.*)?$') {
            $list = if ($Matches[1] -eq 'directories') { 'Directories' } else { 'Files' }
            continue
        }
        $indent = if ($section -eq 'unlink') { '  ' } else { '    ' }
        if ($list -and $line -match ('^' + $indent + '-\s+(?:''([^'']+)''|"([^"]+)"|([^#]+?))\s*(?:#.*)?$')) {
            $value = @($Matches[1], $Matches[2], $Matches[3] | Where-Object { $_ })[0].Trim()
            if ([string]::IsNullOrWhiteSpace($value)) { throw "列表项不能为空：$line" }
            $config.$list += $value
            continue
        }
        throw "不支持的配置格式：$line"
    }
    return $config
}

# 仅匹配直接子项；支持 * 和 ?；重复匹配的链接只处理一次。
function Remove-ExcludedDirectoryLinks {
    [CmdletBinding(SupportsShouldProcess)]
    param([string]$Directory, [string[]]$Names)

    $result = [pscustomobject]@{
        Total = $Names.Count
        Removed = @()
        Missing = @()
        Skipped = @()
        Failed = @()
    }
    $items = @(Get-ChildItem -LiteralPath $Directory -Force -ErrorAction Stop)
    $handled = @{}
    foreach ($pattern in $Names) {
        try {
            if ([string]::IsNullOrWhiteSpace($pattern) -or $pattern -in '.', '..' -or $pattern.IndexOfAny([char[]]'\/:[]') -ge 0) {
                throw "请输入直接子目录名或通配符规则：$pattern"
            }
            $matched = @($items | Where-Object { $_.Name -like $pattern })
            if (-not $matched.Count) { $result.Missing += $pattern; continue }
            foreach ($item in $matched) {
                if ($handled.ContainsKey($item.FullName)) { continue }
                $handled[$item.FullName] = $true
                try {
                    if (-not $item.PSIsContainer -or $item.LinkType -notin 'Junction', 'SymbolicLink') {
                        $result.Skipped += $item.Name
                        continue
                    }
                    if ($PSCmdlet.ShouldProcess($item.FullName, '取消目录链接')) {
                        # 不递归，只删除链接本身，保留源目录。
                        [System.IO.Directory]::Delete($item.FullName, $false)
                        $result.Removed += $item.Name
                    }
                    else { $result.Skipped += $item.Name }
                }
                catch {
                    $result.Failed += $item.Name
                    Write-Host "取消链接失败：$($item.Name)；$($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
        catch {
            $result.Failed += $pattern
            Write-Host "处理规则失败：$pattern；$($_.Exception.Message)" -ForegroundColor Red
        }
    }
    return $result
}

function Write-UnlinkCategory {
    param([string]$Title, [string[]]$Names, [System.ConsoleColor]$Color)

    Write-Host "$Title（$($Names.Count)）：" -ForegroundColor $Color
    if ($Names.Count) {
        foreach ($name in $Names) { Write-Host "  $name" -ForegroundColor $Color }
    }
    else {
        Write-Host '  无' -ForegroundColor DarkGray
    }
}

function Write-UnlinkSummary {
    param($Result)

    Write-Host "`n处理完成：共 $($Result.Total) 条规则" -ForegroundColor Cyan
    Write-UnlinkCategory -Title '已取消链接' -Names $Result.Removed -Color Green
    Write-UnlinkCategory -Title '未找到' -Names $Result.Missing -Color Yellow
    Write-UnlinkCategory -Title '跳过（非目录链接或预览）' -Names $Result.Skipped -Color DarkYellow
    Write-UnlinkCategory -Title '处理失败' -Names $Result.Failed -Color Red
}

# 删除目录树时不进入目录链接，链接只删除自身。
function Remove-CleanupDirectoryTree {
    param([string]$Path)

    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        [System.IO.Directory]::Delete($item.FullName, $false)
        return
    }
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop) {
        if ($child.PSIsContainer) {
            Remove-CleanupDirectoryTree -Path $child.FullName
        }
        else {
            Remove-Item -LiteralPath $child.FullName -Force -ErrorAction Stop
        }
    }
    Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
}

function Write-CleanupSummary {
    param($Result)

    Write-Host "`n$($Result.Title)完成" -ForegroundColor Cyan
    foreach ($category in @(
        @{ Key = 'Removed'; Title = '已删除'; Color = 'Green' }
        @{ Key = 'Missing'; Title = '未找到'; Color = 'Yellow' }
        @{ Key = 'Skipped'; Title = '跳过'; Color = 'DarkYellow' }
        @{ Key = 'Failed'; Title = '失败'; Color = 'Red' }
    )) {
        $names = @($Result.($category.Key))
        Write-Host "$($category.Title)（$($names.Count)）：" -ForegroundColor $category.Color
        if ($names.Count) {
            foreach ($name in $names) { Write-Host "  $name" -ForegroundColor $category.Color }
        }
        else { Write-Host '  无' -ForegroundColor DarkGray }
    }
}

# Names 是指定目录下的直接子目录名，不支持路径或通配符。
function Remove-CleanupDirectories {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string]$Directory,
        [string[]]$Names = @()
    )

    $result = [pscustomobject]@{ Title = '删除目录'; Removed = @(); Missing = @(); Skipped = @(); Failed = @() }
    if (-not $Names.Count) {
        Write-Host '删除目录列表为空。' -ForegroundColor Yellow
        return $result
    }
    $root = Get-Item -LiteralPath $Directory -Force -ErrorAction Stop
    if (-not $root.PSIsContainer) { throw 'Directory 必须是目录。' }
    foreach ($name in ($Names | Select-Object -Unique)) {
        try {
            if ([string]::IsNullOrWhiteSpace($name) -or $name -in '.', '..' -or $name.IndexOfAny([char[]]'\/:*?[]') -ge 0) {
                throw "只允许直接子目录名：$name"
            }
            $path = [System.IO.Path]::GetFullPath((Join-Path $root.FullName $name))
            if ([System.IO.Path]::GetDirectoryName($path) -ne $root.FullName.TrimEnd('\', '/')) {
                throw "目录超出清理范围：$name"
            }
            try { $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop }
            catch [System.Management.Automation.ItemNotFoundException] {
                $result.Missing += $name
                continue
            }
            if (-not $item.PSIsContainer) { $result.Skipped += $name; continue }
            if ($PSCmdlet.ShouldProcess($path, '删除目录及其内容（目录链接只删除链接）')) {
                Remove-CleanupDirectoryTree -Path $path
                $result.Removed += $name
            }
            else { $result.Skipped += $name }
        }
        catch {
            $result.Failed += $name
            Write-Host "删除目录失败：$name；$($_.Exception.Message)" -ForegroundColor Red
        }
    }
    Write-CleanupSummary -Result $result
    return $result
}

# Patterns 只匹配指定目录内的文件，不递归搜索子目录。
function Remove-CleanupFiles {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string]$Directory,
        [string[]]$Patterns = @()
    )

    $result = [pscustomobject]@{ Title = '删除文件'; Removed = @(); Missing = @(); Skipped = @(); Failed = @() }
    if (-not $Patterns.Count) {
        Write-Host '删除文件列表为空。' -ForegroundColor Yellow
        return $result
    }
    $files = @(Get-ChildItem -LiteralPath $Directory -File -Force -ErrorAction Stop)
    $handled = @{}
    foreach ($pattern in ($Patterns | Select-Object -Unique)) {
        try {
            if ([string]::IsNullOrWhiteSpace($pattern) -or $pattern.IndexOfAny([char[]]'\/:') -ge 0) {
                throw "只允许文件名匹配规则：$pattern"
            }
            $matches = @($files | Where-Object { $_.Name -like $pattern })
            if (-not $matches.Count) { $result.Missing += $pattern; continue }
            foreach ($file in $matches) {
                if ($handled.ContainsKey($file.FullName)) { continue }
                $handled[$file.FullName] = $true
                try {
                    if ($PSCmdlet.ShouldProcess($file.FullName, '删除文件')) {
                        Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
                        $result.Removed += $file.Name
                    }
                    else { $result.Skipped += $file.Name }
                }
                catch {
                    $result.Failed += $file.Name
                    Write-Host "删除文件失败：$($file.Name)；$($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
        catch {
            $result.Failed += $pattern
            Write-Host "处理文件规则失败：$pattern；$($_.Exception.Message)" -ForegroundColor Red
        }
    }
    Write-CleanupSummary -Result $result
    return $result
}

# 直接在运行目录创建目录和文件用例，不覆盖已有数据，不执行清理。
function New-CleanupTestCases {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$Directory)

    $root = Get-Item -LiteralPath $Directory -Force -ErrorAction Stop
    if (-not $root.PSIsContainer) { throw 'Directory 必须是目录。' }
    $paths = @('objects', 'build', 'sample.obj', 'sample.exp', 'sample.pdb', 'test_demo.exe', 'cleanup-test.yaml')
    foreach ($name in $paths) {
        if (Get-Item -LiteralPath (Join-Path $root.FullName $name) -Force -ErrorAction SilentlyContinue) {
            throw "同名测试项已存在，未创建或覆盖任何内容：$name"
        }
    }
    if (-not $PSCmdlet.ShouldProcess($root.FullName, '创建清理测试目录、文件和配置')) { return }
    foreach ($name in @('objects', 'build')) {
        New-Item -ItemType Directory -Path (Join-Path $root.FullName $name) -ErrorAction Stop | Out-Null
    }
    foreach ($name in @('sample.obj', 'sample.exp', 'sample.pdb', 'test_demo.exe')) {
        New-Item -ItemType File -Path (Join-Path $root.FullName $name) -ErrorAction Stop | Out-Null
    }
    $yaml = @'
unlinkDirectories: []
delete:
  directories:
    - objects
    - build
  files:
    - '*.obj'
    - '*.exp'
    - '*.pdb'
    - 'test_*.exe'
'@
    Set-Content -LiteralPath (Join-Path $root.FullName 'cleanup-test.yaml') -Value $yaml -Encoding utf8 -ErrorAction Stop
    Write-Host "测试用例已创建：$($root.FullName)" -ForegroundColor Green
    Write-Host '已创建 objects、build 和四个文件；配置为 cleanup-test.yaml。未执行清理。' -ForegroundColor Cyan
}

# 统一执行清理，返回退出码；入口脚本只负责引用和调用。
function Invoke-Cleanup {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string]$Directory,
        [string]$ConfigPath,
        [switch]$CreateTestCases
    )

    if ($CreateTestCases) {
        try {
            if ($ConfigPath) { throw '-CreateTestCases 自动生成 cleanup-test.yaml，不能同时指定 -ConfigPath。' }
            if (-not $Directory) { $Directory = (Get-Location).Path }
            New-CleanupTestCases -Directory $Directory -WhatIf:$WhatIfPreference
            return 0
        }
        catch {
            Write-Host "创建测试用例失败：$($_.Exception.Message)" -ForegroundColor Red
            return 1
        }
    }
    if (-not $Directory) { $Directory = $PSScriptRoot }

    $ErrorActionPreference = 'Continue'
    try {
        $root = Get-Item -LiteralPath $Directory -Force -ErrorAction Stop
        if (-not $root.PSIsContainer) { throw 'Directory 必须是目录。' }
        if (-not $ConfigPath) { $ConfigPath = Join-Path $root.FullName 'cleanup.yaml' }
        $config = Read-CleanupConfiguration -Path $ConfigPath
    }
    catch {
        Write-Host "加载清理配置失败：$($_.Exception.Message)" -ForegroundColor Red
        return 1
    }

    $hasFailure = $false
    if ($config.UnlinkDirectories.Count) {
        try {
            $result = Remove-ExcludedDirectoryLinks -Directory $root.FullName -Names $config.UnlinkDirectories -WhatIf:$WhatIfPreference
            Write-UnlinkSummary -Result $result
            if ($result.Failed.Count) { $hasFailure = $true }
        }
        catch {
            Write-Host "取消链接失败：$($_.Exception.Message)" -ForegroundColor Red
            $hasFailure = $true
        }
    }
    else { Write-Host '取消链接列表为空。' -ForegroundColor Yellow }

    try {
        $result = Remove-CleanupDirectories -Directory $root.FullName -Names $config.Directories -WhatIf:$WhatIfPreference
        if ($result.Failed.Count) { $hasFailure = $true }
    }
    catch {
        Write-Host "删除目录失败：$($_.Exception.Message)" -ForegroundColor Red
        $hasFailure = $true
    }
    try {
        $result = Remove-CleanupFiles -Directory $root.FullName -Patterns $config.Files -WhatIf:$WhatIfPreference
        if ($result.Failed.Count) { $hasFailure = $true }
    }
    catch {
        Write-Host "删除文件失败：$($_.Exception.Message)" -ForegroundColor Red
        $hasFailure = $true
    }
    if ($hasFailure) { return 1 }
    return 0
}
