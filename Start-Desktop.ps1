$ErrorActionPreference = 'Stop'
$desktopRoot = Join-Path $PSScriptRoot 'desktop'
if (-not $env:PERSONALAGENT_INSTANCE) { $env:PERSONALAGENT_INSTANCE = 'main' }
if ($env:PERSONALAGENT_INSTANCE -notin @('main', 'dev')) { throw 'PERSONALAGENT_INSTANCE must be main or dev' }
if (-not $env:PERSONAL_AGENT_DESKTOP_DATA) {
    $env:PERSONAL_AGENT_DESKTOP_DATA = if ($env:PERSONALAGENT_INSTANCE -eq 'main') { Join-Path $PSScriptRoot '.desktop-data' } else { 'D:\PersonalAgent-data\instances\dev' }
}
$desktopTemp = Join-Path $env:PERSONAL_AGENT_DESKTOP_DATA 'tmp'
New-Item -ItemType Directory -Path $desktopTemp -Force | Out-Null
$env:TEMP = $desktopTemp
$env:TMP = $desktopTemp
if (-not (Test-Path -LiteralPath (Join-Path $desktopRoot 'out/main.js'))) { throw '请先运行 npm --prefix desktop run build' }
& node (Join-Path $desktopRoot 'node_modules/electron/cli.js') $desktopRoot
exit $LASTEXITCODE
