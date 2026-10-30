@echo off
rem Kardo -- portable install (no administrator rights).
rem Keep this file ASCII: cmd reads it with the OEM codepage.
setlocal
cd /d "%~dp0"
title Kardo - install
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
echo ---------------------------------------------
echo  If something failed above, the full log is:
echo    "%~dp0data\install.log"
echo ---------------------------------------------
pause
