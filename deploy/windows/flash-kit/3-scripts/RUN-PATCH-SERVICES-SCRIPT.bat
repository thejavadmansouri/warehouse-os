@echo off
rem Warehouse OS - install the FIXED services.ps1 over the 0.3.3 copy.
rem Run as administrator, AFTER Setup has finished.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0patch-services-script.ps1" %*
pause
