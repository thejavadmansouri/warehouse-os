@echo off
rem Warehouse OS - pre-install environment check.
rem Most of these need administrator: right-click -> Run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-before-install.ps1" %*
pause
