@echo off
rem Kardo -- start everything in this folder and open the panel.
setlocal
cd /d "%~dp0"
title Kardo - start
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
echo.
pause
