# license     MIT
# brief       Read cleanup rules, remove directory links, clean directories and files, and create test cases.
# 当前配置格式的轻量读取器：支持 ignore、unlinkDirectories、delete、空行和注释。
function Read-CleanupConfiguration {
    param([string]$Path)

    $config = [pscustomobject]@{
        Ignore = @()
        UnlinkDirectories = @()
        Directories = @()
        Files = @()
    }
    $section = ''
    $list = ''
    foreach ($line in Get-Content -LiteralPath $Path -Encoding utf8 -ErrorAction Stop) {
        if ($line -match '^\s*(#.*)?$') { continue }
        if ($line -match '^ignore:\s*(\[\])?\s*(?:#.*)?$') {
            $section = 'ignore'
            $list = 'Ignore'
            continue
        }
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
        $indent = if ($section -in 'unlink', 'ignore') { '  ' } else { '    ' }
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

# ignore 按完整名称匹配，只有 * 和 ? 是通配符，大小写不敏感。
function Test-CleanupIgnoreName {
    param([string]$Name, $Context)
    if ($null -eq $Context) { return $false }
    foreach ($expression in $Context.Expressions) {
        if ([regex]::IsMatch($Name, $expression, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) { return $true }
    }
    return $false
}

# 清理前建立物理目标保护集合，防止忽略的链接被另一别名绕过。
function Add-CleanupIgnoreTargets {
    param([string]$Directory, $Context, [hashtable]$Visited)
    if (Test-CleanupProtectedPath -Path $Directory) { return }
    $resolved = Resolve-CleanupDirectory -Path $Directory
    if (Test-CleanupProtectedPath -Path $resolved) { return }
    if ((Test-CleanupIgnoreName -Name ([System.IO.Path]::GetFileName($Directory.TrimEnd('\', '/'))) -Context $Context) -or
        (Test-CleanupIgnoreName -Name ([System.IO.Path]::GetFileName($resolved.TrimEnd('\', '/'))) -Context $Context)) {
        $Context.Directories[$resolved] = $true
        return
    }
    if ($Visited.ContainsKey($resolved)) { return }
    $Visited[$resolved] = $true
    foreach ($item in Get-ChildItem -LiteralPath $resolved -Force -ErrorAction Stop) {
        if (Test-CleanupProtectedPath -Path $item.FullName) { continue }
        if ($item.PSIsContainer) {
            Add-CleanupIgnoreTargets -Directory $item.FullName -Context $Context -Visited $Visited
        }
        elseif (Test-CleanupIgnoreName -Name $item.Name -Context $Context) {
            $Context.Files[$item.FullName] = $true
        }
    }
}

function New-CleanupIgnoreContext {
    param([string]$Directory, [string[]]$Ignore = @())
    $context = [pscustomobject]@{ Expressions = @(); Directories = @{}; Files = @{} }
    foreach ($pattern in ($Ignore | Select-Object -Unique)) {
        if ([string]::IsNullOrWhiteSpace($pattern) -or $pattern -in '.', '..' -or $pattern -match '[\\/:<>"|\x00-\x1f]' -or $pattern -match '[ .]$') {
            throw "ignore 只支持完整名称及 *、? 通配符，不支持路径：$pattern"
        }
        $context.Expressions += '^' + [regex]::Escape($pattern).Replace('\*', '.*').Replace('\?', '.') + '$'
    }
    if ($context.Expressions.Count) { Add-CleanupIgnoreTargets -Directory $Directory -Context $context -Visited @{} }
    return $context
}

function Test-CleanupIgnoredPath {
    param([string]$Path, $Context)
    if ($null -eq $Context -or -not $Context.Expressions.Count) { return $false }
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if (Test-CleanupIgnoreName -Name ([System.IO.Path]::GetFileName($fullPath.TrimEnd('\', '/'))) -Context $Context) { return $true }
    if (Test-Path -LiteralPath $fullPath -PathType Container) { $fullPath = Resolve-CleanupDirectory -Path $fullPath }
    else {
        $parent = [System.IO.Path]::GetDirectoryName($fullPath)
        if (Test-Path -LiteralPath $parent -PathType Container) {
            $fullPath = Join-Path (Resolve-CleanupDirectory -Path $parent) ([System.IO.Path]::GetFileName($fullPath))
        }
    }
    if ($Context.Files.ContainsKey($fullPath)) { return $true }
    foreach ($ignoredDirectory in $Context.Directories.Keys) {
        if ($fullPath -eq $ignoredDirectory -or $fullPath.StartsWith($ignoredDirectory.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

# 删除父目录前检查整棵树，避免忽略项随父目录一起删除。
function Test-CleanupTreeContainsIgnored {
    param([string]$Path, $Context)
    if ($null -eq $Context -or -not $Context.Expressions.Count) { return $false }
    if (Test-CleanupIgnoredPath -Path $Path -Context $Context) { return $true }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (-not $item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { return $false }
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop) {
        if (Test-CleanupTreeContainsIgnored -Path $child.FullName -Context $Context) { return $true }
    }
    return $false
}

# 仅匹配直接子项；支持 * 和 ?；重复匹配的链接只处理一次。
function Remove-ExcludedDirectoryLinks {
    [CmdletBinding(SupportsShouldProcess)]
    param([string]$Directory, [string[]]$Names, [string[]]$Ignore = @(), $IgnoreContext)

    if ($null -eq $IgnoreContext) { $IgnoreContext = New-CleanupIgnoreContext -Directory $Directory -Ignore $Ignore }

    $result = [pscustomobject]@{
        Total = $Names.Count
        Removed = @()
        Missing = @()
        Skipped = @()
        Failed = @()
    }
    if (Test-CleanupProtectedPath -Path (Resolve-CleanupDirectory -Path $Directory)) { throw "禁止在版本控制元数据中清理：$Directory" }
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
                    if (Test-CleanupIgnoredPath -Path $item.FullName -Context $IgnoreContext) { $result.Skipped += $item.FullName; continue }
                    if (Test-CleanupProtectedPath -Path $item.FullName) { $result.Skipped += $item.Name; continue }
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
    Write-UnlinkCategory -Title '跳过（忽略、保护、非目录链接或预览）' -Names $Result.Skipped -Color DarkYellow
    Write-UnlinkCategory -Title '处理失败' -Names $Result.Failed -Color Red
}

# 永不清理版本控制元数据，包括独立 Git 管理目录和 bare 仓库。
function Test-CleanupProtectedPath {
    param([string]$Path)
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    if ($fullPath -match '(?i)(^|[\\/])\.(git|hg|svn)([\\/]|$)') { return $true }
    $cursor = $fullPath
    while ($cursor) {
        if ((Test-Path -LiteralPath (Join-Path $cursor 'HEAD') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $cursor 'config') -PathType Leaf) -and
            ((Test-Path -LiteralPath (Join-Path $cursor 'objects') -PathType Container) -or
             (Test-Path -LiteralPath (Join-Path $cursor 'refs') -PathType Container))) { return $true }
        $cursor = [System.IO.Path]::GetDirectoryName($cursor.TrimEnd('\', '/'))
    }
    return $false
}

# 删除前检查整个候选树；含嵌套仓库时拒绝整个候选目录。
function Assert-CleanupDirectoryTreeSafe {
    param([string]$Path, $IgnoreContext)
    if (Test-CleanupTreeContainsIgnored -Path $Path -Context $IgnoreContext) { throw "目录包含 ignore 项，拒绝删除：$Path" }
    if (Test-CleanupProtectedPath -Path $Path) { throw "禁止删除版本控制元数据：$Path" }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { return }
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop) {
        if (Test-CleanupProtectedPath -Path $child.FullName) { throw "目录包含版本控制元数据，拒绝清理：$Path" }
        if ($child.PSIsContainer) { Assert-CleanupDirectoryTreeSafe -Path $child.FullName -IgnoreContext $IgnoreContext }
    }
}

# 仅供已确认且整树检查通过的调用方使用；链接只删除自身。
function Remove-CleanupDirectoryTree {
    param([string]$Path, $IgnoreContext)

    # 底层入口也必须保护，不能依赖调用方或 YAML 排除。
    Assert-CleanupDirectoryTreeSafe -Path $Path -IgnoreContext $IgnoreContext
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        [System.IO.Directory]::Delete($item.FullName, $false)
        return
    }
    foreach ($child in Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop) {
        if ($child.PSIsContainer) {
            Remove-CleanupDirectoryTree -Path $child.FullName -IgnoreContext $IgnoreContext
        }
        else {
            Remove-Item -LiteralPath $child.FullName -Force -Confirm:$false -ErrorAction Stop
        }
    }
    # 非递归删除：非空即失败，绝不在删除子内容后才询问是否递归。
    [System.IO.Directory]::Delete($Path, $false)
    if (Test-Path -LiteralPath $Path) { throw "目录未删除：$Path" }
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

# 将目录及其父路径中的链接解析为实际目录；限制解析深度以拒绝循环链接链。
function Resolve-CleanupDirectory {
    param([string]$Path, [int]$Depth = 0)

    if ($Depth -gt 64) { throw "目录链接解析过深或存在循环：$Path" }
    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $parent = [System.IO.Path]::GetDirectoryName($fullPath.TrimEnd('\', '/'))
    if ($parent) {
        $resolvedParent = Resolve-CleanupDirectory -Path $parent -Depth ($Depth + 1)
        $fullPath = Join-Path $resolvedParent ([System.IO.Path]::GetFileName($fullPath.TrimEnd('\', '/')))
    }
    $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction Stop
    if (-not $item.PSIsContainer) { throw "不是目录：$fullPath" }
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        if ($item.LinkType -notin 'Junction', 'SymbolicLink') { throw "不支持的目录重解析点：$fullPath" }
        $linkTarget = @($item.Target)[0]
        if (-not $linkTarget) { throw "无法解析目录链接：$fullPath" }
        if (-not [System.IO.Path]::IsPathRooted($linkTarget)) {
            $linkTarget = Join-Path $item.Parent.FullName $linkTarget
        }
        return Resolve-CleanupDirectory -Path $linkTarget -Depth ($Depth + 1)
    }
    return $item.FullName
}

# 匹配目录名后不再进入其子树；按实际目录去重，避免联接环和重复扫描。
function Get-CleanupDirectoryMatches {
    param([string]$Directory, [string[]]$Names, [bool]$Recurse = $true, [hashtable]$Visited = @{}, $IgnoreContext)

    if (Test-CleanupIgnoredPath -Path $Directory -Context $IgnoreContext) { return }
    $resolved = Resolve-CleanupDirectory -Path $Directory
    if (Test-CleanupProtectedPath -Path $resolved) { return }
    if ($Visited.ContainsKey($resolved)) { return }
    $Visited[$resolved] = $true
    foreach ($item in Get-ChildItem -LiteralPath $resolved -Directory -Force -ErrorAction Stop) {
        if (Test-CleanupProtectedPath -Path $item.FullName) { continue }
        if ($item.Name -in $Names) {
            [pscustomobject]@{ Name = $item.Name; FullName = $item.FullName; ScopeDirectory = $resolved }
        }
        elseif ($Recurse) {
            Get-CleanupDirectoryMatches -Directory $item.FullName -Names $Names -Recurse:$Recurse -Visited $Visited -IgnoreContext $IgnoreContext
        }
    }
}

# 带路径规则仅允许 Root 内的相对路径；通配符只允许出现在文件名部分。
function ConvertTo-CleanupRule {
    param([string]$Rule, [switch]$FileRule)

    if ([string]::IsNullOrWhiteSpace($Rule) -or $Rule -match '^[\\/]' -or $Rule.Contains(':')) {
        throw "只允许名称或 Root 相对路径：$Rule"
    }
    $parts = @($Rule -split '[\\/]')
    for ($index = 0; $index -lt $parts.Count; $index++) {
        $part = $parts[$index]
        if ([string]::IsNullOrWhiteSpace($part) -or $part -in '.', '..' -or $part -match '[<>"|\x00-\x1f]' -or $part -match '[ .]$') {
            throw "无效的清理路径：$Rule"
        }
        if ((-not $FileRule -or $index -lt $parts.Count - 1) -and $part.IndexOfAny([char[]]'*?[]') -ge 0) {
            throw "目录部分不支持通配符：$Rule"
        }
    }
    if ($FileRule) { [void]([System.Management.Automation.WildcardPattern]::new($parts[-1]).IsMatch('')) }
    $parent = if ($parts.Count -gt 1) { $parts[0..($parts.Count - 2)] -join [System.IO.Path]::DirectorySeparatorChar } else { '' }
    return [pscustomobject]@{ Original = $Rule; Leaf = $parts[-1]; Parent = $parent; HasPath = ($parts.Count -gt 1) }
}

# 纯目录名按 Recurse 搜索；带路径的规则只定位 Root 下的指定目录。
function Remove-CleanupDirectories {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string]$Directory,
        [string[]]$Names = @(),
        [bool]$Recurse = $true,
        [string[]]$Ignore = @(),
        $IgnoreContext
    )

    $result = [pscustomobject]@{ Title = '删除目录'; Removed = @(); Missing = @(); Skipped = @(); Failed = @() }
    if (-not $Names.Count) {
        Write-Host '删除目录列表为空。' -ForegroundColor Yellow
        return $result
    }
    $root = Get-Item -LiteralPath $Directory -Force -ErrorAction Stop
    if (-not $root.PSIsContainer) { throw 'Directory 必须是目录。' }
    if ($null -eq $IgnoreContext) { $IgnoreContext = New-CleanupIgnoreContext -Directory $Directory -Ignore $Ignore }
    $rules = @($Names | Select-Object -Unique | ForEach-Object { ConvertTo-CleanupRule -Rule $_ })
    $plainNames = @($rules | Where-Object { -not $_.HasPath } | ForEach-Object { $_.Leaf })
    $plainMatches = if ($plainNames.Count) { @(Get-CleanupDirectoryMatches -Directory $root.FullName -Names $plainNames -Recurse:$Recurse -IgnoreContext $IgnoreContext) } else { @() }
    $allMatches = @()
    foreach ($rule in $rules) {
        if ($rule.HasPath) {
            $relativeParent = Join-Path $root.FullName $rule.Parent
            if (Test-CleanupIgnoredPath -Path (Join-Path $relativeParent $rule.Leaf) -Context $IgnoreContext) {
                $result.Skipped += $rule.Original
                continue
            }
            if (Test-CleanupProtectedPath -Path (Join-Path $relativeParent $rule.Leaf)) {
                $result.Skipped += $rule.Original
                continue
            }
            $ruleMatches = if (Test-Path -LiteralPath $relativeParent -PathType Container) {
                @(Get-CleanupDirectoryMatches -Directory $relativeParent -Names @($rule.Leaf) -Recurse:$false -IgnoreContext $IgnoreContext)
            } else { @() }
        }
        else { $ruleMatches = @($plainMatches | Where-Object { $_.Name -eq $rule.Leaf }) }
        if (-not $ruleMatches.Count) { $result.Missing += $rule.Original }
        $allMatches += $ruleMatches
    }
    # 父目录规则已覆盖子目录时只删一次，避免重叠规则造成重复删除或错误统计。
    $matches = @()
    foreach ($candidate in ($allMatches | Sort-Object { $_.FullName.Length }, FullName)) {
        $covered = $false
        foreach ($selected in $matches) {
            if ($candidate.FullName -eq $selected.FullName -or $candidate.FullName.StartsWith($selected.FullName.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
                $covered = $true
                break
            }
        }
        if (-not $covered) { $matches += $candidate }
    }
    foreach ($item in $matches) {
        try {
            $path = [System.IO.Path]::GetFullPath($item.FullName)
            # 目标必须仍为已遍历实际目录的直接子项；不允许父路径被换成其他链接。
            $parentPath = [System.IO.Path]::GetDirectoryName($path)
            if ($parentPath -ne $item.ScopeDirectory -or (Resolve-CleanupDirectory -Path $parentPath) -ne $item.ScopeDirectory) {
                throw "目录超出清理范围：$path"
            }
            if (Test-CleanupTreeContainsIgnored -Path $path -Context $IgnoreContext) {
                $result.Skipped += $path
                Write-Host "忽略目录（自身或内容命中 ignore）：$path" -ForegroundColor DarkYellow
                continue
            }
            Assert-CleanupDirectoryTreeSafe -Path $path -IgnoreContext $IgnoreContext
            if ($PSCmdlet.ShouldProcess($path, '删除目录及其内容（目录链接只删除链接）')) {
                Remove-CleanupDirectoryTree -Path $path -IgnoreContext $IgnoreContext
                $result.Removed += $path
            }
            else { $result.Skipped += $path }
        }
        catch {
            $result.Failed += $item.FullName
            Write-Host "删除目录失败：$($item.FullName)；$($_.Exception.Message)" -ForegroundColor Red
        }
    }
    Write-CleanupSummary -Result $result
    return $result
}
# 递归进入目录链接，按实际目录去重；文件链接不跟随、不删除。
function Get-CleanupFilesRecursive {
    param([string]$Directory, [bool]$Recurse = $true, [hashtable]$Visited = @{}, $IgnoreContext)

    if (Test-CleanupIgnoredPath -Path $Directory -Context $IgnoreContext) { return }
    $resolved = Resolve-CleanupDirectory -Path $Directory
    if (Test-CleanupProtectedPath -Path $resolved) { return }
    if ($Visited.ContainsKey($resolved)) { return }
    $Visited[$resolved] = $true
    foreach ($item in Get-ChildItem -LiteralPath $resolved -Force -ErrorAction Stop) {
        if (Test-CleanupProtectedPath -Path $item.FullName) { continue }
        if ($item.PSIsContainer) {
            if ($Recurse) { Get-CleanupFilesRecursive -Directory $item.FullName -Recurse:$Recurse -Visited $Visited -IgnoreContext $IgnoreContext }
        }
        elseif (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) { $item }
    }
}

# 纯文件名模式默认递归；带路径时只匹配指定父目录当前层。
function Remove-CleanupFiles {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string]$Directory,
        [string[]]$Patterns = @(),
        [bool]$Recurse = $true,
        [string[]]$Ignore = @(),
        $IgnoreContext
    )

    $result = [pscustomobject]@{ Title = '删除文件'; Removed = @(); Missing = @(); Skipped = @(); Failed = @() }
    if (-not $Patterns.Count) {
        Write-Host '删除文件列表为空。' -ForegroundColor Yellow
        return $result
    }
    if ($null -eq $IgnoreContext) { $IgnoreContext = New-CleanupIgnoreContext -Directory $Directory -Ignore $Ignore }
    $rules = @($Patterns | Select-Object -Unique | ForEach-Object { ConvertTo-CleanupRule -Rule $_ -FileRule })
    $files = if (@($rules | Where-Object { -not $_.HasPath }).Count) { @(Get-CleanupFilesRecursive -Directory $Directory -Recurse:$Recurse -IgnoreContext $IgnoreContext) } else { @() }
    $handled = @{}
    foreach ($rule in $rules) {
        $pattern = $rule.Original
        try {
            if ($rule.HasPath) {
                $relativeParent = Join-Path $Directory $rule.Parent
                if (Test-CleanupIgnoredPath -Path $relativeParent -Context $IgnoreContext) {
                    $result.Skipped += $pattern
                    continue
                }
                if (Test-CleanupProtectedPath -Path $relativeParent) {
                    $result.Skipped += $pattern
                    continue
                }
                $scopedFiles = if (Test-Path -LiteralPath $relativeParent -PathType Container) {
                    @(Get-CleanupFilesRecursive -Directory $relativeParent -Recurse:$false -IgnoreContext $IgnoreContext)
                } else { @() }
            }
            else { $scopedFiles = $files }
            $matches = @($scopedFiles | Where-Object { $_.Name -like $rule.Leaf })
            if (-not $matches.Count) { $result.Missing += $pattern; continue }
            foreach ($file in $matches) {
                if ($handled.ContainsKey($file.FullName)) { continue }
                $handled[$file.FullName] = $true
                try {
                    if (Test-CleanupIgnoredPath -Path $file.FullName -Context $IgnoreContext) { $result.Skipped += $file.FullName; continue }
                    if (Test-CleanupProtectedPath -Path $file.FullName) { throw "禁止删除版本控制元数据：$($file.FullName)" }
                    if ((Resolve-CleanupDirectory -Path $file.DirectoryName) -ne $file.DirectoryName) {
                        throw "文件父目录在扫描后发生变化：$($file.FullName)"
                    }
                    if ($PSCmdlet.ShouldProcess($file.FullName, '删除文件')) {
                        Remove-Item -LiteralPath $file.FullName -Force -Confirm:$false -ErrorAction Stop
                        if (Test-Path -LiteralPath $file.FullName) { throw "文件未删除：$($file.FullName)" }
                        $result.Removed += $file.FullName
                    }
                    else { $result.Skipped += $file.FullName }
                }
                catch {
                    $result.Failed += $file.FullName
                    Write-Host "删除文件失败：$($file.FullName)；$($_.Exception.Message)" -ForegroundColor Red
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
ignore: []
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
        [switch]$CreateTestCases,
        [bool]$Recurse = $true
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
        # 先校验全部 delete 规则，再执行取消链接或删除，避免无效规则引发部分清理。
        foreach ($directoryRule in $config.Directories) { [void](ConvertTo-CleanupRule -Rule $directoryRule) }
        foreach ($fileRule in $config.Files) { [void](ConvertTo-CleanupRule -Rule $fileRule -FileRule) }
        $ignoreContext = New-CleanupIgnoreContext -Directory $root.FullName -Ignore $config.Ignore
    }
    catch {
        Write-Host "加载清理配置失败：$($_.Exception.Message)" -ForegroundColor Red
        return 1
    }

    $hasFailure = $false
    if ($config.UnlinkDirectories.Count) {
        try {
            $result = Remove-ExcludedDirectoryLinks -Directory $root.FullName -Names $config.UnlinkDirectories -IgnoreContext $ignoreContext -WhatIf:$WhatIfPreference
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
        $result = Remove-CleanupDirectories -Directory $root.FullName -Names $config.Directories -Recurse:$Recurse -IgnoreContext $ignoreContext -WhatIf:$WhatIfPreference
        if ($result.Failed.Count) { $hasFailure = $true }
    }
    catch {
        Write-Host "删除目录失败：$($_.Exception.Message)" -ForegroundColor Red
        $hasFailure = $true
    }
    try {
        $result = Remove-CleanupFiles -Directory $root.FullName -Patterns $config.Files -Recurse:$Recurse -IgnoreContext $ignoreContext -WhatIf:$WhatIfPreference
        if ($result.Failed.Count) { $hasFailure = $true }
    }
    catch {
        Write-Host "删除文件失败：$($_.Exception.Message)" -ForegroundColor Red
        $hasFailure = $true
    }
    if ($hasFailure) { return 1 }
    return 0
}
