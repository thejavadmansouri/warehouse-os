@echo off
rem Warehouse OS - installs the server status tray icon (taskbar, next to the
rem clock). Needs administrator once: this launcher elevates itself, so just
rem double-click it and accept the Windows prompt.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights...
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server-status-install.ps1"
pause
