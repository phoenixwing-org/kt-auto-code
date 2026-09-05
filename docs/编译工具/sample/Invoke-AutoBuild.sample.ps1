#Requires -Version 5.1
# license     MIT
# brief       Editable sample configuration for Invoke-AutoBuild.ps1.

$rootDirectory = $env:ROOT_DIR
$thirdPartyDirectory = $env:ROOT_DIR_3rdParty

$cmakeProjectPaths = @(
    'E:\out\CppProjectA'
    'E:\out\CppProjectB'
)

$caaProjectPaths = @(
    'E:\out\CaaWorkspaceA'
)

$branch = 'master'
$rootBranch = 'develop'
$cmakeBranch = 'master'

if ([string]::IsNullOrWhiteSpace($env:ROOT_DIR)) {
    throw 'ROOT_DIR is not set. Run envSet.ps1 or set ROOT_DIR before using this sample.'
}
if ([string]::IsNullOrWhiteSpace($env:ROOT_DIR_3rdParty)) {
    throw 'ROOT_DIR_3rdParty is not set. Run envSet.ps1 or set ROOT_DIR_3rdParty before using this sample.'
}

& "$env:ROOT_DIR/tools/Invoke-AutoBuild.ps1" `
    -RootDirectory $rootDirectory `
    -ThirdPartyDirectory $thirdPartyDirectory `
    -Branch $branch `
    -RootBranch $rootBranch `
    -CmakeBranch $cmakeBranch `
    -CmakeProjectPaths $cmakeProjectPaths `
    -CaaProjectPaths $caaProjectPaths `
    @args

exit $LASTEXITCODE
