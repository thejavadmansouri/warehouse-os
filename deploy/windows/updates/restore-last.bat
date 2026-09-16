@echo off
setlocal
title Kardo Update - RESTORE (put the previous version back)
rem Puts the files from the LATEST backup back and restarts the services.
rem
rem By default the database is NOT touched, so every sale taken after the update
rem is kept. To roll the database back as well (which throws away everything
rem since the backup), add -Database:
rem     restore-last.bat -Database
rem To only look at what backups exist:
rem     restore-last.bat -List
rem
rem It asks for confirmation ("type RESTORE") before changing anything, and if
rem the window is not elevated it offers to relaunch itself as administrator -
rem the Windows services need that.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction SilentlyContinue" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-update.ps1" %*
echo.
pause
