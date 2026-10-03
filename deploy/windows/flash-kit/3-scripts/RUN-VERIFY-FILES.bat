@echo off
rem Warehouse OS - verify flash files against MANIFEST.txt.
rem Most of these need administrator: right-click -> Run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-files.ps1" %*
pause
