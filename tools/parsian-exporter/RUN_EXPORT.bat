@echo off
chcp 65001 > nul
title Kardo Parsian Exporter
cls
echo ================================================================
echo    📦 استخراج‌کننده هوشمند اطلاعات پارسیان به کاردو (Warehouse OS)
echo ================================================================
echo.
echo در حال اجرای اسکریپت با دسترسی PowerShell...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-ParsianData.ps1"

echo.
pause
