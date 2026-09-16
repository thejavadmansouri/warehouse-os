@echo off
setlocal
title Kardo Update - CHECK (no changes)
rem Allows PowerShell scripts on this machine, then runs the CHECK only.
rem The CHECK phase never stops services and never changes any file.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction SilentlyContinue" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-update.ps1" -CheckOnly
echo.
pause