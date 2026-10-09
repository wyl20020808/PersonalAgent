$ErrorActionPreference = 'Stop'
$env:PERSONALAGENT_INSTANCE = 'dev'
$env:PERSONAL_AGENT_DESKTOP_DATA = 'D:\PersonalAgent-data\instances\dev'
$env:PERSONAL_AGENT_OPENCODE_EXECUTABLE = 'D:\PersonalAgent-data\opencode-compatibility-v1\toolchain\node_modules\opencode-windows-x64\bin\opencode.exe'
$env:PERSONAL_AGENT_OPENCODE_RUNTIME_DIR = 'D:\PersonalAgent-data\instances\dev\opencode-v1'
& 'D:\PersonalAgent-worktrees\dev\Start-Desktop.ps1'
exit $LASTEXITCODE
