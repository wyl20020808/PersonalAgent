$ErrorActionPreference = 'Stop'
$env:PERSONALAGENT_INSTANCE = 'dev'
$env:PERSONAL_AGENT_DESKTOP_DATA = 'D:\PersonalAgent-data\instances\dev'
& 'D:\PersonalAgent-worktrees\dev\Start-Desktop.ps1'
exit $LASTEXITCODE
