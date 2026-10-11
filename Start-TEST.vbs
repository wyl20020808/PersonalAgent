Option Explicit
Dim shell, command
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "D:\PersonalAgent-worktrees\test"
command = Chr(34) & "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" & Chr(34) & " -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & "D:\PersonalAgent-worktrees\test\Start-TEST.ps1" & Chr(34)
shell.Run command, 0, False
