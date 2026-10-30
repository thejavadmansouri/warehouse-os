@echo off
rem Kardo -- stop the API, the panel and the database.
setlocal
cd /d "%~dp0"
title Kardo - stop
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1" %*
echo.
pause
