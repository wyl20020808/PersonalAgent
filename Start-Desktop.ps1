$ErrorActionPreference = 'Stop'
$desktopRoot = Join-Path $PSScriptRoot 'desktop'
$desktopTemp = Join-Path $PSScriptRoot '.desktop-data\tmp'
New-Item -ItemType Directory -Path $desktopTemp -Force | Out-Null
$env:TEMP = $desktopTemp
$env:TMP = $desktopTemp
if (-not (Test-Path -LiteralPath (Join-Path $desktopRoot 'out/main.js'))) { throw '请先运行 npm --prefix desktop run build' }
& node (Join-Path $desktopRoot 'node_modules/electron/cli.js') $desktopRoot
exit $LASTEXITCODE
