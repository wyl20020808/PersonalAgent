param([Parameter(ValueFromRemainingArguments = $true)][string[]]$ControllerArgs)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
if (-not (Test-Path -LiteralPath "$taskRoot\dist\src\cli.js")) {
    throw 'Run npm install and npm run build in D:\PersonalAgent first.'
}
& node "$taskRoot\dist\src\cli.js" @ControllerArgs
exit $LASTEXITCODE
