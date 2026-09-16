@echo off
rem Warehouse OS - system status at a glance.
rem Most of these need administrator: right-click -> Run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-system.ps1" %*
pause
