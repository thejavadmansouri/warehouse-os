@echo off
rem ASCII ONLY. Fixes the API crash loop (JWT_SECRET / service env) and
rem restarts the server. Run as administrator.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Please RIGHT-CLICK this file and choose "Run as administrator".
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-api-crash.ps1"
pause
