@echo off
rem Warehouse OS - finish an install that died halfway.
rem Most of these need administrator: right-click -> Run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0finish-broken-install.ps1" %*
pause
