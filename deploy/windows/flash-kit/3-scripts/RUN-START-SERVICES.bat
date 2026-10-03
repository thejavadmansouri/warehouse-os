@echo off
rem Warehouse OS - restart the three services.
rem Most of these need administrator: right-click -> Run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-or-restart-services.ps1" %*
pause
