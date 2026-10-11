$ErrorActionPreference = 'Stop'
$env:PERSONALAGENT_INSTANCE = 'test'
$env:PERSONAL_AGENT_DESKTOP_DATA = 'D:\PersonalAgent-data\instances\test'
$env:PERSONAL_AGENT_OPENCODE_RUNTIME_DIR = 'D:\PersonalAgent-data\instances\test\opencode-v1'
$testOpenCode = 'D:\PersonalAgent-data\opencode-compatibility-v1\toolchain\node_modules\opencode-windows-x64\bin\opencode.exe'
if (Test-Path -LiteralPath $testOpenCode) { $env:PERSONAL_AGENT_OPENCODE_EXECUTABLE = $testOpenCode }
& 'D:\PersonalAgent-worktrees\test\Start-Desktop.ps1'
exit $LASTEXITCODE
