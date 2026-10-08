@echo off
set TEMP=D:\PersonalAgent\.desktop-data\tmp
set TMP=D:\PersonalAgent\.desktop-data\tmp
if not exist "%TEMP%" mkdir "%TEMP%"
node "%~dp0desktop\node_modules\electron\cli.js" "%~dp0desktop"
