@echo off
chcp 65001 >nul
title Warehouse OS — Dev Stack
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev-stack.ps1"
