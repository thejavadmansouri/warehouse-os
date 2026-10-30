@echo off
rem Kardo - load demo data into the installed kit.
rem ASCII only: cmd reads this with the OEM codepage.
setlocal
cd /d "%~dp0"
title Kardo - demo data
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0demo-import.ps1" %*
