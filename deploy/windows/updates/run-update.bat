@echo off
setlocal
title Kardo Update - APPLY
rem Allows PowerShell scripts on this machine, then runs the full update:
rem checks -> backup (files + database) -> replace web/api/prisma ->
rem migrations -> label settings -> seller exe -> start services -> health check.
rem It asks for confirmation ("Type YES") before changing anything.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction SilentlyContinue" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-update.ps1" %*
echo.
pause