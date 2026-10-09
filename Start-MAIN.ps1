$ErrorActionPreference = 'Stop'
$env:PERSONALAGENT_INSTANCE = 'main'
$env:PERSONAL_AGENT_DESKTOP_DATA = 'D:\PersonalAgent\.desktop-data'
& 'D:\PersonalAgent\Start-Desktop.ps1'
exit $LASTEXITCODE
