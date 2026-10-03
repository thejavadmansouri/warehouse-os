@echo off
rem Warehouse OS - import the product catalog.
rem Most of these need administrator: right-click -> Run as administrator.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0reload-catalog.ps1" %*
pause
