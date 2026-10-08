@echo off
set "TEMP=%~dp0.desktop-data\tmp"
set "TMP=%~dp0.desktop-data\tmp"
if not exist "%TEMP%" mkdir "%TEMP%"
node "%~dp0desktop\node_modules\electron\cli.js" "%~dp0desktop"
