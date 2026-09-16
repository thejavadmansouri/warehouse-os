@echo off
rem Warehouse OS - repair LAN access after network changes.
rem Most of these need administrator: right-click -> Run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0network-fix.ps1" %*
pause
