$ErrorActionPreference = 'Stop'
$desktopRoot = Join-Path $PSScriptRoot 'desktop'
if (-not $env:PERSONALAGENT_INSTANCE) { $env:PERSONALAGENT_INSTANCE = 'main' }
if ($env:PERSONALAGENT_INSTANCE -notin @('main', 'dev', 'test')) { throw 'PERSONALAGENT_INSTANCE must be main, dev or test' }
if (-not $env:PERSONAL_AGENT_DESKTOP_DATA) {
    $env:PERSONAL_AGENT_DESKTOP_DATA = if ($env:PERSONALAGENT_INSTANCE -eq 'main') { Join-Path $PSScriptRoot '.desktop-data' } else { Join-Path 'D:\PersonalAgent-data\instances' $env:PERSONALAGENT_INSTANCE }
}
$desktopTemp = Join-Path $env:PERSONAL_AGENT_DESKTOP_DATA 'tmp'
New-Item -ItemType Directory -Path $desktopTemp -Force | Out-Null
$env:TEMP = $desktopTemp
$env:TMP = $desktopTemp
if (-not (Test-Path -LiteralPath (Join-Path $desktopRoot 'out/main.js'))) { throw '请先运行 npm --prefix desktop run build' }
$electronBinary = Join-Path $desktopRoot 'node_modules/electron/dist/electron.exe'
if (-not (Test-Path -LiteralPath $electronBinary)) { throw 'Electron binary is missing; install desktop dependencies before launching' }
& $electronBinary $desktopRoot
exit $LASTEXITCODE
