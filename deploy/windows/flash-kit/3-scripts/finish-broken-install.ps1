# Warehouse OS - finish an install that died halfway (e.g. first-run crashed).
# ASCII ONLY. Launcher: RUN-FINISH-BROKEN-INSTALL.bat  (run as administrator)
#
# Delegates to the installed resume-install.ps1, which completes migrations,
# services, firewall, shortcuts and INSTALL-INFO without touching the secrets
# or the database.

param(
    [string]$Root = 'C:\WarehouseOS'
)

$ErrorActionPreference = 'Continue'
Write-Host ''
Write-Host "=== Finishing the interrupted install at $Root ===" -ForegroundColor Cyan

$resume = Join-Path $Root 'scripts\resume-install.ps1'
if (-not (Test-Path $resume)) {
    Write-Host "resume-install.ps1 not found at $resume." -ForegroundColor Red
    Write-Host 'Either the install folder is gone (run Setup again) or this is not the server machine.' -ForegroundColor Red
    exit 1
}

& $resume -Root $Root
Write-Host ''
Write-Host 'Done. Run RUN-CHECK-SYSTEM.bat to confirm everything answers.' -ForegroundColor Cyan
