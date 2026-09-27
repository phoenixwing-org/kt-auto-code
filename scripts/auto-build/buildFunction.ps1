# license     MIT
param(
    [ValidateSet('Debug', 'Release')]
    [string]$BuildType = 'Debug',
    [string]$WorkDir = '',
    [string]$WindowTitle = ''
)

if ([string]::IsNullOrWhiteSpace($WindowTitle) -and -not [string]::IsNullOrWhiteSpace($WorkDir)) {
    $WindowTitle = "$(Split-Path $WorkDir -Leaf) $BuildType"
}
if (-not [string]::IsNullOrWhiteSpace($WindowTitle)) {
    $Host.UI.RawUI.WindowTitle = $WindowTitle
    [Console]::Title = $WindowTitle
}

. "$env:ROOT_DIR/tools/commonCmake.ps1"
$exitCode = Invoke-CMakeBuild -BuildType $BuildType -WorkDir $WorkDir -WindowTitle $WindowTitle
exit $exitCode
